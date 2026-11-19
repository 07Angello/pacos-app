import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { IonContent, IonHeader, IonRefresher, IonRefresherContent, IonToolbar } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { BreakpointsService } from '../../core/breakpoints.service';
import { StaffOrder } from '../../core/models';
import { OrderActionsService } from '../../core/order-actions.service';
import { OrderAction } from '../../core/order-status';
import { OrdersStore } from '../../core/orders.store';
import { PreferencesService } from '../../core/preferences.service';
import { SettingsStore } from '../../core/settings.store';
import { ConnectionPillComponent } from '../../shared/connection-pill';
import { KitchenCardComponent } from '../../shared/kitchen-card';

type Column = 'ACCEPTED' | 'PREPARING' | 'READY';

const COLUMNS: Record<Column, { title: string; icon: string; empty: string }> = {
  ACCEPTED: { title: 'En espera', icon: 'fa-hourglass-half', empty: 'Sin pedidos en espera' },
  PREPARING: { title: 'Preparando', icon: 'fa-fire-burner', empty: 'Nada en preparación' },
  READY: { title: 'Listos', icon: 'fa-bell-concierge', empty: 'Ningún pedido listo' },
};

/**
 * Tablero de cocina (§6). FIFO por accepted_at.
 * - Teléfono: una columna con pestañas por estado.
 * - Tablet vertical: "En espera" + "Preparando" lado a lado; "Listos" en otra vista.
 * - Tablet horizontal / pantalla grande: kanban de tres columnas con scroll independiente.
 */
@Component({
  selector: 'app-kitchen',
  imports: [IonHeader, IonToolbar, IonContent, IonRefresher, IonRefresherContent, ConnectionPillComponent, KitchenCardComponent],
  template: `
    <ion-header class="app-header">
      <ion-toolbar>
        <div class="app-header__row">
          <div class="app-header__title">
            <span class="brand-mark"><i class="fa-solid fa-kitchen-set"></i></span>
            <div>
              <h1>Cocina</h1>
              <p>{{ store.waiting().length + store.preparing().length }} en cocina · {{ store.ready().length }} listos</p>
            </div>
          </div>
          <div class="app-header__actions">
            @if (wakeLockSupported) {
              <button type="button" class="icon-btn" [class.icon-btn--on]="prefs.prefs().keepAwake" (click)="toggleAwake()"
                [attr.aria-pressed]="prefs.prefs().keepAwake" aria-label="Mantener pantalla encendida">
                <i class="fa-solid" [class]="prefs.prefs().keepAwake ? 'fa-sun' : 'fa-moon'"></i>
              </button>
            }
            <app-connection-pill />
          </div>
        </div>

        @if (!bp.wide()) {
          <div class="kseg" role="tablist" aria-label="Estados de cocina">
            @if (bp.tablet()) {
              <button type="button" role="tab" class="kseg__btn" [class.kseg__btn--on]="tabletView() === 'kitchen'" [attr.aria-selected]="tabletView() === 'kitchen'" (click)="tabletView.set('kitchen')">
                <i class="fa-solid fa-fire-burner"></i> En cocina <span class="kseg__count">{{ store.waiting().length + store.preparing().length }}</span>
              </button>
              <button type="button" role="tab" class="kseg__btn" [class.kseg__btn--on]="tabletView() === 'ready'" [attr.aria-selected]="tabletView() === 'ready'" (click)="tabletView.set('ready')">
                <i class="fa-solid fa-bell-concierge"></i> Listos <span class="kseg__count">{{ store.ready().length }}</span>
              </button>
            } @else {
              @for (c of allColumns; track c) {
                <button type="button" role="tab" class="kseg__btn" [class]="'kseg__btn kseg__btn--' + c" [class.kseg__btn--on]="phoneTab() === c" [attr.aria-selected]="phoneTab() === c" (click)="phoneTab.set(c)">
                  {{ meta[c].title }} <span class="kseg__count">{{ list(c).length }}</span>
                </button>
              }
            }
          </div>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content class="kitchen-content" [scrollY]="!bp.tablet()">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      @if (store.connection() === 'offline') {
        <p class="banner banner--danger banner--sticky"><i class="fa-solid fa-wifi"></i> Sin conexión. Los cambios no se guardarán hasta reconectar.</p>
      }

      <div class="kboard" [class]="'kboard kboard--' + visibleColumns().length">
        @for (c of visibleColumns(); track c) {
          <section class="kcol" [class]="'kcol kcol--' + c" [attr.aria-label]="meta[c].title">
            <header class="kcol__head">
              <i class="fa-solid" [class]="meta[c].icon"></i>
              <h2>{{ meta[c].title }}</h2>
              <span class="kcol__count">{{ list(c).length }}</span>
            </header>
            <div class="kcol__list">
              @for (o of list(c); track o.id) {
                <app-kitchen-card [order]="o" [role]="auth.role()" [now]="store.now()" [delayMinutes]="settings.delayMinutes()"
                  [busy]="store.busy().has(o.id)" (act)="act(o, $event)" />
              } @empty {
                <div class="kcol__empty"><i class="fa-solid" [class]="meta[c].icon"></i><p>{{ meta[c].empty }}</p></div>
              }
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class KitchenPage implements OnDestroy {
  protected readonly store = inject(OrdersStore);
  protected readonly auth = inject(AuthService);
  protected readonly bp = inject(BreakpointsService);
  protected readonly settings = inject(SettingsStore);
  protected readonly prefs = inject(PreferencesService);
  private readonly actions = inject(OrderActionsService);

  protected readonly meta = COLUMNS;
  protected readonly allColumns: Column[] = ['ACCEPTED', 'PREPARING', 'READY'];
  protected readonly phoneTab = signal<Column>('ACCEPTED');
  protected readonly tabletView = signal<'kitchen' | 'ready'>('kitchen');

  protected readonly wakeLockSupported = 'wakeLock' in navigator;
  private wakeLock: WakeLockSentinel | null = null;

  protected readonly visibleColumns = computed<Column[]>(() => {
    if (this.bp.wide()) return this.allColumns;
    if (this.bp.tablet()) return this.tabletView() === 'kitchen' ? ['ACCEPTED', 'PREPARING'] : ['READY'];
    return [this.phoneTab()];
  });

  constructor() {
    effect(() => void this.applyWakeLock(this.prefs.prefs().keepAwake));
  }

  ngOnDestroy(): void {
    void this.wakeLock?.release();
  }

  protected list(c: Column): StaffOrder[] {
    if (c === 'ACCEPTED') return this.store.waiting();
    if (c === 'PREPARING') return this.store.preparing();
    return this.store.ready();
  }

  protected act(order: StaffOrder, action: OrderAction): void {
    void this.actions.run(order, action);
  }

  protected async refresh(ev: CustomEvent): Promise<void> {
    await this.store.reload();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  protected toggleAwake(): void {
    this.prefs.set('keepAwake', !this.prefs.prefs().keepAwake);
  }

  /** Mantener pantalla activa en el dispositivo de cocina (§6.5), si el sistema lo permite. */
  private async applyWakeLock(on: boolean): Promise<void> {
    if (!this.wakeLockSupported) return;
    try {
      if (on && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => (this.wakeLock = null));
      } else if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch {
      /* no permitido (p. ej. batería baja) */
    }
  }
}
