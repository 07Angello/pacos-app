import { computed, inject, Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { AuthService } from './auth.service';
import { ConnectionState, STAFF_BACKEND } from './backend/backend';
import { ApiError, OrderEvent, StaffOrder } from './models';
import { NotifyService } from './notify.service';
import { ACTIONS, CLOSED_STATUSES, inboxOrder, isUpcomingSchedule, kitchenOrder, OrderAction, visibleFor } from './order-status';
import { SettingsStore } from './settings.store';
import { clockLabel, dayClockLabel, shortNumber } from './time';

/**
 * Estado de pedidos del personal.
 * - La base de datos es la fuente de verdad: Realtime solo avisa y luego se consulta el detalle.
 * - Al (re)conectar, volver al primer plano o recuperar red: se recarga todo (§12).
 * - Nunca se simula un cambio: la UI muestra el estado devuelto por el backend.
 */
@Injectable({ providedIn: 'root' })
export class OrdersStore {
  private readonly backend = inject(STAFF_BACKEND);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly settings = inject(SettingsStore);

  private readonly byId = signal<ReadonlyMap<string, StaffOrder>>(new Map());
  readonly connection = signal<ConnectionState>('connecting');
  readonly lastSync = signal<Date | null>(null);
  readonly loading = signal(false);
  readonly busy = signal<ReadonlySet<string>>(new Set());
  /** Reloj compartido para "hace X min" (se actualiza cada 15 s). */
  readonly now = signal(Date.now());

  private stopWatch?: () => void;
  private cleanups: (() => void)[] = [];
  private wasOffline = false;

  readonly all = computed(() => [...this.byId().values()]);
  readonly pending = computed(() => this.all().filter((o) => o.status === 'PENDING').sort(inboxOrder));
  readonly waiting = computed(() => this.all().filter((o) => o.status === 'ACCEPTED').sort(kitchenOrder));
  readonly preparing = computed(() => this.all().filter((o) => o.status === 'PREPARING').sort(kitchenOrder));
  readonly ready = computed(() => this.all().filter((o) => o.status === 'READY').sort(kitchenOrder));
  readonly onTheWay = computed(() => this.all().filter((o) => o.status === 'OUT_FOR_DELIVERY').sort(kitchenOrder));
  /** Pedidos programados aún no listos, por hora de recogida. */
  readonly scheduled = computed(() =>
    this.all()
      .filter(isUpcomingSchedule)
      .sort((a, b) => Date.parse(a.scheduledFor!) - Date.parse(b.scheduledFor!)),
  );
  readonly closed = computed(() =>
    this.all()
      .filter((o) => CLOSED_STATUSES.includes(o.status))
      .sort((a, b) => (closedAt(b) > closedAt(a) ? 1 : -1)),
  );

  get(id: string): StaffOrder | undefined {
    return this.byId().get(id);
  }

  start(): void {
    if (this.stopWatch) return;
    void this.reload();
    void this.settings.load();
    this.stopWatch = this.backend.watch({
      onEvent: (e) => void this.onEvent(e),
      onSettings: () => void this.settings.load(),
      onConnection: (state) => {
        this.connection.set(state);
        if (state === 'offline') this.wasOffline = true;
        if (state === 'online' && this.wasOffline) {
          this.wasOffline = false;
          void this.reload(); // no depender de que cada evento haya llegado
        }
      },
    });

    const tick = setInterval(() => this.now.set(Date.now()), 15000);
    const onOnline = () => void this.reload();
    const onVisible = () => document.visibilityState === 'visible' && void this.reload();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const resume = App.addListener('resume', () => void this.reload()).catch(() => null);
    this.cleanups = [
      () => clearInterval(tick),
      () => window.removeEventListener('online', onOnline),
      () => document.removeEventListener('visibilitychange', onVisible),
      () => void resume.then((h) => h?.remove()),
    ];
  }

  stop(): void {
    this.stopWatch?.();
    this.stopWatch = undefined;
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.byId.set(new Map());
    this.connection.set('connecting');
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.backend.rpc<StaffOrder[]>('list_orders');
      this.byId.set(new Map(list.map((o) => [o.id, o])));
      this.lastSync.set(new Date());
    } catch (e) {
      if (!this.auth.handleAuthError(e) && e instanceof ApiError && e.isNetwork) this.connection.set('offline');
    } finally {
      this.loading.set(false);
    }
  }

  /** Ejecuta una transición validada por el backend. Devuelve true si se guardó. */
  async act(order: StaffOrder, action: OrderAction, params: Record<string, unknown> = {}): Promise<boolean> {
    if (this.busy().has(order.id)) return false;
    this.setBusy(order.id, true);
    try {
      const updated = await this.backend.rpc<StaffOrder>(ACTIONS[action].rpc, { order_id: order.id, ...params });
      this.upsert(updated);
      this.lastSync.set(new Date());
      return true;
    } catch (e) {
      if (this.auth.handleAuthError(e)) return false;
      if (e instanceof ApiError && e.status === 409) {
        void this.notify.toast(`Pedido #${shortNumber(order.orderNumber)}: otro usuario ya lo actualizó.`, 'info');
        await this.refreshOne(order.id);
      } else {
        void this.notify.toast(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.', 'error', 4000);
      }
      return false;
    } finally {
      this.setBusy(order.id, false);
    }
  }

  private async onEvent(e: OrderEvent): Promise<void> {
    const role = this.auth.role();
    if (!role) return;
    if (!visibleFor(role, e.status)) {
      this.remove(e.orderId);
      return;
    }
    const num = shortNumber(e.orderNumber);

    // Recordatorio de pedido programado (pg_cron): llega con el mismo estado, no es un cambio.
    if (e.type === 'order.reminder') {
      await this.refreshOne(e.orderId);
      const o = this.get(e.orderId);
      if (role !== 'CHEF' && o?.scheduledFor) {
        const pending = o.status === 'PENDING' ? ' Aún no está aceptado.' : '';
        void this.notify.alert(`Pedido programado #${num} para las ${clockLabel(o.scheduledFor)}: es hora de prepararlo.${pending}`, 8000);
      }
      return;
    }

    const known = this.get(e.orderId);
    if (known?.status === e.status) return; // ya reflejado (p. ej. acción propia)
    await this.refreshOne(e.orderId);
    const o = this.get(e.orderId);

    if (e.type === 'order.created' && role !== 'CHEF') {
      void this.notify.alert(
        o?.scheduledFor
          ? `Nuevo pedido #${num} programado para recoger ${dayClockLabel(o.scheduledFor)}`
          : `Nuevo pedido #${num} esperando aprobación`,
      );
    } else if (e.type === 'order.accepted' && role === 'CHEF') {
      if (o?.scheduledFor) void this.notify.toast(`Pedido programado #${num}: recoger ${dayClockLabel(o.scheduledFor)}`, 'info', 4000);
      else void this.notify.alert(`Nuevo en cocina: pedido #${num}`);
    } else if (e.type === 'order.cancelled' && role !== 'CHEF') {
      void this.notify.toast(`El cliente canceló el pedido #${num}`, 'info', 5000);
    } else if (e.type === 'order.ready' && role !== 'CHEF') {
      void this.notify.toast(`Pedido #${num} listo para entregar`, 'success');
    }
  }

  private async refreshOne(id: string): Promise<void> {
    try {
      this.upsert(await this.backend.rpc<StaffOrder>('get_order', { order_id: id }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) this.remove(id);
      else this.auth.handleAuthError(e);
    }
  }

  private upsert(order: StaffOrder): void {
    const role = this.auth.role();
    if (role && !visibleFor(role, order.status)) return this.remove(order.id);
    this.byId.update((m) => new Map(m).set(order.id, order));
  }

  private remove(id: string): void {
    if (!this.byId().has(id)) return;
    this.byId.update((m) => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
  }

  private setBusy(id: string, on: boolean): void {
    this.busy.update((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}

function closedAt(o: StaffOrder): string {
  return o.completedAt ?? o.rejectedAt ?? o.cancelledAt ?? o.createdAt;
}
