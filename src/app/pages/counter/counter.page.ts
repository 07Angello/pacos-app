import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonContent, IonHeader, IonModal, IonToolbar, ModalController } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { STAFF_BACKEND } from '../../core/backend/backend';
import { BreakpointsService } from '../../core/breakpoints.service';
import { ApiError, OrderType, StaffOrder } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { shortNumber } from '../../core/time';
import { MoneyPipe } from '../../shared/money.pipe';
import { CounterItemComponent } from './counter-item.component';
import { CounterLine, MenuProduct, optionSummary, PublicMenu, round, unitPrice } from './counter.model';

const PAYMENT_ICON: Record<string, string> = { CASH: 'fa-money-bill-wave', TRANSFER: 'fa-building-columns', CARD: 'fa-credit-card' };

/**
 * Pedido en el local (ADMIN / MANAGER): el cliente llega al restaurante y pide
 * para llevar o para comer aquí. Entra directo a cocina (ya aceptado).
 */
@Component({
  selector: 'app-counter',
  imports: [IonHeader, IonToolbar, IonContent, IonModal, FormsModule, MoneyPipe, NgTemplateOutlet],
  template: `
    <ion-header class="app-header">
      <ion-toolbar>
        <div class="app-header__row">
          <div class="app-header__title">
            <button type="button" class="icon-btn" (click)="back()" aria-label="Volver"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1>Nuevo pedido</h1><p>Cliente en el local · entra directo a cocina</p></div>
          </div>
        </div>
        <div class="ctr-search">
          <span class="field__control"><i class="fa-solid fa-magnifying-glass"></i>
            <input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Buscar plato…" aria-label="Buscar plato" />
            @if (query()) { <button type="button" class="icon-btn" (click)="query.set('')" aria-label="Limpiar"><i class="fa-solid fa-xmark"></i></button> }
          </span>
        </div>
        <div class="filters" role="tablist" aria-label="Categorías">
          <button type="button" role="tab" class="filters__btn" [class.filters__btn--on]="!category()" (click)="category.set(null)">Todo</button>
          @for (c of menu()?.categories ?? []; track c.id) {
            <button type="button" role="tab" class="filters__btn" [class.filters__btn--on]="category() === c.id" (click)="category.set(c.id)">
              <i class="fa-solid" [class]="c.icon ?? 'fa-utensils'"></i> {{ c.name }}
            </button>
          }
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="page">
      <div class="ctr" [class.ctr--two]="bp.tablet()">
        <div class="ctr__menu">
          @if (loading()) {
            <div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Cargando menú…</p></div>
          } @else {
            <div class="ctr-grid">
              @for (p of products(); track p.id) {
                <!-- Toda la tarjeta es el botón: área de toque grande para teléfono y tablet. -->
                <button type="button" class="ctr-prod" [class.ctr-prod--off]="!p.isAvailable" [class.ctr-prod--added]="flash() === p.id"
                  [disabled]="!p.isAvailable" (click)="pick(p)" [attr.aria-label]="'Agregar ' + p.name">
                  @if (inCart(p.id); as n) { <span class="ctr-prod__count">{{ n }}</span> }
                  <strong>{{ p.name }}</strong>
                  <span class="ctr-prod__meta">
                    <span>{{ p.price | money }}</span>
                    @if (!p.isAvailable) { <span>Agotado</span> } @else if (p.options.length) { <i class="fa-solid fa-sliders" aria-label="con opciones"></i> }
                  </span>
                </button>
              } @empty {
                <div class="empty"><i class="fa-solid fa-utensils"></i><p>No hay platos{{ query() ? ' que coincidan' : '' }}.</p></div>
              }
            </div>
          }
        </div>

        @if (bp.tablet()) {
          <aside class="ctr__ticket"><ng-container [ngTemplateOutlet]="ticket" /></aside>
        }
      </div>

      @if (!bp.tablet() && lines().length) {
        <div class="ctr-bar">
          <button type="button" class="btn btn--primary btn--lg btn--block" (click)="sheetOpen.set(true)">
            <span class="ctr-bar__count">{{ count() }}</span> Ver pedido <span class="ctr-bar__total">{{ total() | money }}</span>
          </button>
        </div>
      }

      <ion-modal [isOpen]="!bp.tablet() && sheetOpen()" (didDismiss)="sheetOpen.set(false)" class="editor-modal">
        <ng-template>
          <ion-content class="editor">
            <div class="editor__inner"><ng-container [ngTemplateOutlet]="ticket" /></div>
          </ion-content>
        </ng-template>
      </ion-modal>

      <!-- Confirmación: número grande para decírselo al cliente -->
      @if (done(); as d) {
        <div class="ctr-done" role="dialog" aria-modal="true" aria-labelledby="ctr-done-title">
          <div class="ctr-done__card">
            <span class="ctr-done__icon"><i class="fa-solid fa-fire-burner"></i></span>
            <p class="muted">Pedido enviado a cocina</p>
            <h2 id="ctr-done-title" class="ctr-done__num">#{{ num(d.orderNumber) }}</h2>
            <p><strong>{{ d.customerName }}</strong> · {{ d.orderType === 'DINE_IN' ? 'Comer aquí' : 'Para llevar' }} · {{ d.total | money }}</p>
            <div class="ctr-done__actions">
              <button type="button" class="btn btn--ghost btn--lg" (click)="back()"><i class="fa-solid fa-receipt"></i> Ver pedidos</button>
              <button type="button" class="btn btn--primary btn--lg" (click)="done.set(null)"><i class="fa-solid fa-plus"></i> Otro pedido</button>
            </div>
          </div>
        </div>
      }
    </ion-content>

    <!-- Ticket del pedido (columna derecha en tablet; hoja inferior en teléfono) -->
    <ng-template #ticket>
      <div class="ctr-ticket">
        <div class="ctr-ticket__head">
          <h2><i class="fa-solid fa-receipt"></i> Pedido</h2>
          @if (!bp.tablet()) { <button type="button" class="icon-btn" (click)="sheetOpen.set(false)" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button> }
        </div>

        <div class="ctr-type" role="radiogroup" aria-label="Modalidad">
          @for (t of types; track t.id) {
            <button type="button" role="radio" class="ctr-type__btn" [class.ctr-type__btn--on]="type() === t.id" [attr.aria-checked]="type() === t.id" (click)="type.set(t.id)">
              <i class="fa-solid" [class]="t.icon"></i> {{ t.label }}
            </button>
          }
        </div>

        @for (l of lines(); track l.key) {
          <div class="ctr-line">
            <button type="button" class="ctr-line__main" (click)="edit(l)" [attr.aria-label]="'Editar ' + l.product.name">
              <strong>{{ l.quantity }}× {{ l.product.name }}</strong>
              @if (summary(l); as s) { <span>{{ s }}</span> }
              @if (l.notes) { <span class="ctr-line__note"><i class="fa-solid fa-pen"></i> {{ l.notes }}</span> }
            </button>
            <div class="ctr-line__side">
              <strong>{{ lineTotal(l) | money }}</strong>
              <div class="ctr-line__qty">
                <button type="button" class="icon-btn" (click)="bump(l, -1)" [attr.aria-label]="l.quantity === 1 ? 'Quitar' : 'Menos'"><i class="fa-solid" [class]="l.quantity === 1 ? 'fa-trash-can' : 'fa-minus'"></i></button>
                <button type="button" class="icon-btn" (click)="bump(l, 1)" [disabled]="l.quantity >= 20" aria-label="Más"><i class="fa-solid fa-plus"></i></button>
              </div>
            </div>
          </div>
        } @empty {
          <p class="ctr-ticket__empty"><i class="fa-solid fa-hand-pointer"></i> Toca los platos del menú para agregarlos.</p>
        }

        <label class="field">
          <span class="field__label">Nombre del cliente <span class="muted">(opcional)</span></span>
          <span class="field__control"><i class="fa-solid fa-user"></i>
            <input [ngModel]="name()" (ngModelChange)="name.set($event)" maxlength="60" placeholder="Ej.: Juan o Mesa 4" autocomplete="off" />
          </span>
        </label>
        <label class="field">
          <span class="field__label">Teléfono <span class="muted">(opcional)</span></span>
          <span class="field__control" [class.field__control--error]="phoneError()"><i class="fa-solid fa-phone"></i>
            <input [ngModel]="phone()" (ngModelChange)="phone.set($event); phoneError.set(null)" inputmode="tel" maxlength="15" placeholder="9999-9999" autocomplete="off" />
          </span>
          @if (phoneError(); as e) { <span class="field__error">{{ e }}</span> }
        </label>

        <div class="field">
          <span class="field__label">Pago</span>
          <div class="ctr-pay">
            @for (m of menu()?.settings?.paymentMethods ?? []; track m.code) {
              <button type="button" class="ctr-type__btn" [class.ctr-type__btn--on]="payment() === m.code" (click)="payment.set(m.code)">
                <i class="fa-solid" [class]="payIcon(m.code)"></i> {{ m.label }}
              </button>
            }
          </div>
        </div>

        <label class="field">
          <span class="field__label">Nota del pedido <span class="muted">(opcional)</span></span>
          <span class="field__control"><i class="fa-solid fa-clipboard"></i>
            <input [ngModel]="notes()" (ngModelChange)="notes.set($event)" maxlength="200" placeholder="Ej.: todo en una bolsa" />
          </span>
        </label>

        <div class="ctr-ticket__total"><span>Total</span><strong>{{ total() | money }}</strong></div>
        <button type="button" class="btn btn--primary btn--lg btn--block" (click)="submit()" [disabled]="saving() || !lines().length || !payment()">
          @if (saving()) { <i class="fa-solid fa-spinner fa-spin"></i> Enviando… } @else { <i class="fa-solid fa-fire-burner"></i> Enviar a cocina · {{ total() | money }} }
        </button>
        @if (lines().length) {
          <button type="button" class="btn btn--danger-ghost btn--block" (click)="clear()"><i class="fa-solid fa-trash-can"></i> Vaciar pedido</button>
        }
      </div>
    </ng-template>
  `,
})
export class CounterPage implements OnInit {
  protected readonly bp = inject(BreakpointsService);
  private readonly backend = inject(STAFF_BACKEND);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);
  private readonly router = inject(Router);

  protected readonly types: { id: OrderType; label: string; icon: string }[] = [
    { id: 'PICKUP', label: 'Para llevar', icon: 'fa-bag-shopping' },
    { id: 'DINE_IN', label: 'Comer aquí', icon: 'fa-utensils' },
  ];

  protected readonly menu = signal<PublicMenu | null>(null);
  protected readonly loading = signal(true);
  protected readonly query = signal('');
  protected readonly category = signal<string | null>(null);
  protected readonly lines = signal<CounterLine[]>([]);
  protected readonly type = signal<OrderType>('PICKUP');
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly phoneError = signal<string | null>(null);
  protected readonly payment = signal('CASH');
  protected readonly notes = signal('');
  protected readonly saving = signal(false);
  protected readonly sheetOpen = signal(false);
  protected readonly done = signal<StaffOrder | null>(null);
  /** Misma clave mientras se reintenta un envío: un doble toque no duplica el pedido. */
  private idempotencyKey: string | null = null;
  private nextKey = 1;

  protected readonly products = computed(() => {
    const m = this.menu();
    if (!m) return [];
    const q = normalize(this.query());
    const cat = this.category();
    const order = new Map(m.categories.map((c, i) => [c.id, i]));
    return m.products
      .filter((p) => (!cat || p.categoryId === cat) && (!q || normalize(p.name).includes(q)))
      .sort((a, b) => (order.get(a.categoryId) ?? 99) - (order.get(b.categoryId) ?? 99) || a.sortOrder - b.sortOrder);
  });
  protected readonly count = computed(() => this.lines().reduce((s, l) => s + l.quantity, 0));
  protected readonly total = computed(() => round(this.lines().reduce((s, l) => s + this.lineTotal(l), 0)));

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const m = await this.backend.rpc<PublicMenu>('get_public_menu');
      this.menu.set(m);
      if (!m.settings.paymentMethods.some((p) => p.code === this.payment())) this.payment.set(m.settings.paymentMethods[0]?.code ?? '');
    } catch (e) {
      if (!this.auth.handleAuthError(e)) void this.notify.toast('No se pudo cargar el menú.', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  protected inCart(productId: string): number {
    return this.lines().filter((l) => l.product.id === productId).reduce((s, l) => s + l.quantity, 0);
  }

  protected summary(l: CounterLine): string {
    return optionSummary(l.product, l.selected);
  }

  protected lineTotal(l: CounterLine): number {
    return unitPrice(l.product, l.selected) * l.quantity;
  }

  protected num = shortNumber;

  protected payIcon(code: string): string {
    return PAYMENT_ICON[code] ?? 'fa-wallet';
  }

  /** Feedback visual breve en la tarjeta tocada. */
  protected readonly flash = signal<string | null>(null);
  private flashTimer?: ReturnType<typeof setTimeout>;

  /**
   * Toque en un plato:
   * - Sin opciones (bebidas, papas…) → se agrega al instante.
   * - Con opciones → hoja inferior con las opciones por defecto ya marcadas y un botón
   *   grande "Agregar" (un toque más si no se cambia nada; deslizar hacia abajo cancela).
   */
  protected async pick(p: MenuProduct): Promise<void> {
    if (this.itemOpen) return;
    if (!p.options.length) {
      this.addLine(p, { quantity: 1, selected: [], notes: '' });
      return;
    }
    const res = await this.openItem(p);
    if (res) this.addLine(p, res);
  }

  /** Suma a una línea idéntica (mismo plato, mismas opciones, sin nota) o crea una nueva. */
  private addLine(p: MenuProduct, res: Pick<CounterLine, 'quantity' | 'selected' | 'notes'>): void {
    this.idempotencyKey = null;
    const sig = [...res.selected].sort().join(',');
    const same = !res.notes && this.lines().find((l) => l.product.id === p.id && !l.notes && [...l.selected].sort().join(',') === sig);
    if (same) this.lines.update((ls) => ls.map((l) => (l.key === same.key ? { ...l, quantity: Math.min(20, l.quantity + res.quantity) } : l)));
    else this.lines.update((ls) => [...ls, { key: this.nextKey++, product: p, ...res }]);
    this.flash.set(p.id);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flash.set(null), 350);
  }

  protected async edit(l: CounterLine): Promise<void> {
    const res = await this.openItem(l.product, l);
    if (!res) return;
    this.idempotencyKey = null;
    this.lines.update((ls) => ls.map((x) => (x.key === l.key ? { ...x, ...res } : x)));
  }

  /** Un solo plato abierto a la vez: un doble toque no abre dos ventanas. */
  private itemOpen = false;

  private async openItem(product: MenuProduct, line?: CounterLine): Promise<Pick<CounterLine, 'quantity' | 'selected' | 'notes'> | null> {
    if (this.itemOpen) return null;
    this.itemOpen = true;
    try {
      const id = `ctr-item-${this.nextKey}-${Date.now()}`;
      // Teléfono: hoja que sube desde abajo (se cierra deslizando). Tablet: ventana centrada.
      const sheet = !this.bp.tablet();
      const m = await this.modals.create({
        id,
        component: CounterItemComponent,
        componentProps: { product, line, modalId: id },
        cssClass: sheet ? 'ctr-sheet' : 'editor-modal',
        ...(sheet ? { breakpoints: [0, 1], initialBreakpoint: 1, handle: true } : {}),
      });
      await m.present();
      const { data, role } = await m.onDidDismiss();
      return role === 'saved' ? data : null;
    } finally {
      this.itemOpen = false;
    }
  }

  protected bump(l: CounterLine, d: number): void {
    this.idempotencyKey = null;
    this.lines.update((ls) => ls.flatMap((x) => (x.key !== l.key ? [x] : x.quantity + d <= 0 ? [] : [{ ...x, quantity: Math.min(20, x.quantity + d) }])));
  }

  protected async clear(): Promise<void> {
    const a = await this.alerts.create({
      header: '¿Vaciar el pedido?',
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Vaciar', role: 'confirm' }],
    });
    await a.present();
    if ((await a.onDidDismiss()).role === 'confirm') this.reset();
  }

  private reset(): void {
    this.lines.set([]);
    this.name.set('');
    this.phone.set('');
    this.notes.set('');
    this.phoneError.set(null);
    this.idempotencyKey = null;
  }

  protected async submit(): Promise<void> {
    if (!this.lines().length || this.saving()) return;
    this.idempotencyKey ??= crypto.randomUUID();
    this.saving.set(true);
    try {
      const order = await this.backend.rpc<StaffOrder>('create_counter_order', {
        idempotencyKey: this.idempotencyKey,
        orderType: this.type(),
        customer: { name: this.name().trim(), phone: this.phone().trim() },
        paymentMethod: this.payment(),
        notes: this.notes().trim(),
        items: this.lines().map((l) => ({ productId: l.product.id, quantity: l.quantity, notes: l.notes, optionValueIds: l.selected })),
      });
      this.reset();
      this.sheetOpen.set(false);
      this.done.set(order);
      void this.load(); // disponibilidad al día para el siguiente pedido
    } catch (e) {
      if (this.auth.handleAuthError(e)) return;
      if (e instanceof ApiError) {
        const d = e.details as { fields?: Record<string, string>; lines?: { message: string }[] } | undefined;
        if (d?.fields?.['phone']) this.phoneError.set(d.fields['phone']);
        const msg = d?.lines?.[0]?.message ?? Object.values(d?.fields ?? {})[0] ?? e.message;
        void this.notify.toast(msg, 'error', 4000);
        if (d?.lines?.length) void this.load(); // algo se agotó: refrescar menú
      } else {
        void this.notify.toast('No se pudo enviar. Revisa la conexión e intenta de nuevo.', 'error', 4000);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected back(): void {
    void this.router.navigateByUrl('/tabs/pedidos');
  }
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
