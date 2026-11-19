import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonFab, IonHeader, IonModal, IonRefresher, IonRefresherContent, IonToolbar } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { BreakpointsService } from '../../core/breakpoints.service';
import { StaffOrder } from '../../core/models';
import { OrderActionsService } from '../../core/order-actions.service';
import { OrderAction } from '../../core/order-status';
import { OrdersStore } from '../../core/orders.store';
import { ConnectionPillComponent } from '../../shared/connection-pill';
import { OrderCardComponent } from '../../shared/order-card';
import { OrderDetailComponent } from '../../shared/order-detail';

type Filter = 'new' | 'active' | 'ready' | 'closed';

/**
 * Bandeja del encargado (§5.3). Los nuevos pendientes siempre quedan visibles arriba
 * con su contador, aunque se cambie de filtro.
 * Tablet horizontal: lista + detalle lado a lado. Teléfono: detalle en modal.
 */
@Component({
  selector: 'app-orders',
  imports: [IonHeader, IonToolbar, IonContent, IonFab, IonModal, IonRefresher, IonRefresherContent, ConnectionPillComponent, OrderCardComponent, OrderDetailComponent],
  template: `
    <ion-header class="app-header">
      <ion-toolbar>
        <div class="app-header__row">
          <div class="app-header__title">
            <span class="brand-mark"><i class="fa-solid fa-receipt"></i></span>
            <div>
              <h1>Pedidos</h1>
              <p>{{ store.pending().length }} por aprobar · {{ activeCount() }} en curso</p>
            </div>
          </div>
          <app-connection-pill />
        </div>
        <div class="filters" role="tablist" aria-label="Filtrar pedidos">
          @for (f of filters; track f.id) {
            <button type="button" role="tab" class="filters__btn" [class.filters__btn--on]="filter() === f.id" [attr.aria-selected]="filter() === f.id" (click)="filter.set(f.id)">
              <i class="fa-solid" [class]="f.icon"></i> {{ f.label }}
              <span class="filters__count" [class.filters__count--hot]="f.id === 'new' && count(f.id) > 0">{{ count(f.id) }}</span>
            </button>
          }
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="orders-content">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>

      <div class="split" [class.split--two]="bp.wide()">
        <div class="split__list">
          @if (filter() !== 'new' && store.pending().length) {
            <button type="button" class="pending-strip" (click)="filter.set('new')">
              <i class="fa-solid fa-bell fa-shake"></i>
              <strong>{{ store.pending().length }} {{ store.pending().length === 1 ? 'pedido nuevo espera' : 'pedidos nuevos esperan' }}</strong> aprobación
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          }

          <div class="cards">
            @for (o of visible(); track o.id) {
              <app-order-card [order]="o" [role]="auth.role()" [now]="store.now()" [busy]="store.busy().has(o.id)"
                [selected]="bp.wide() && selectedId() === o.id" (open)="open(o)" (act)="act(o, $event)" />
            } @empty {
              <div class="empty">
                <i class="fa-solid" [class]="emptyIcon()"></i>
                <p>{{ emptyText() }}</p>
              </div>
            }
          </div>
        </div>

        @if (bp.wide()) {
          <aside class="split__detail">
            @if (selectedId(); as id) {
              <app-order-detail [orderId]="id" [closable]="false" />
            } @else {
              <div class="empty empty--panel"><i class="fa-solid fa-hand-pointer"></i><p>Selecciona un pedido para ver el detalle</p></div>
            }
          </aside>
        }
      </div>

      <ion-modal [isOpen]="!bp.wide() && !!selectedId()" (didDismiss)="selectedId.set(null)" class="detail-modal">
        <ng-template>
          <ion-content>
            @if (selectedId(); as id) {
              <app-order-detail [orderId]="id" (dismissed)="selectedId.set(null)" />
            }
          </ion-content>
        </ng-template>
      </ion-modal>

      <!-- Botón flotante: pedido de un cliente en el local. La lista deja espacio abajo (.split__list)
           para que la última tarjeta nunca quede debajo del botón. -->
      <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="orders-fab" [class.orders-fab--split]="bp.wide()">
        <button type="button" class="fab-btn" (click)="newOrder()" aria-label="Nuevo pedido en el local">
          <i class="fa-solid fa-plus"></i>
        </button>
      </ion-fab>
    </ion-content>
  `,
})
export class OrdersPage {
  protected readonly store = inject(OrdersStore);
  protected readonly auth = inject(AuthService);
  protected readonly bp = inject(BreakpointsService);
  private readonly actions = inject(OrderActionsService);

  protected readonly filter = signal<Filter>('new');
  protected readonly selectedId = signal<string | null>(null);

  private readonly router = inject(Router);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  constructor() {
    // Abrir un pedido desde una notificación: /tabs/pedidos?pedido=<id>
    effect(() => {
      const id = this.query()?.get('pedido');
      const o = id ? this.store.get(id) : undefined;
      if (!id || !o) return;
      const status = o.status;
      this.filter.set(status === 'PENDING' ? 'new' : ['ACCEPTED', 'PREPARING'].includes(status) ? 'active'
        : ['READY', 'OUT_FOR_DELIVERY'].includes(status) ? 'ready' : 'closed');
      this.selectedId.set(id);
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    });
  }

  protected readonly filters: { id: Filter; label: string; icon: string }[] = [
    { id: 'new', label: 'Nuevos', icon: 'fa-bell' },
    { id: 'active', label: 'En cocina', icon: 'fa-fire-burner' },
    { id: 'ready', label: 'Listos', icon: 'fa-bell-concierge' },
    { id: 'closed', label: 'Cerrados', icon: 'fa-box-archive' },
  ];

  protected readonly activeCount = computed(() => this.store.waiting().length + this.store.preparing().length + this.store.ready().length + this.store.onTheWay().length);

  protected readonly visible = computed<StaffOrder[]>(() => {
    switch (this.filter()) {
      case 'new':
        return this.store.pending();
      case 'active':
        return [...this.store.waiting(), ...this.store.preparing()];
      case 'ready':
        return [...this.store.ready(), ...this.store.onTheWay()];
      case 'closed':
        return this.store.closed();
    }
  });

  protected count(f: Filter): number {
    return {
      new: this.store.pending().length,
      active: this.store.waiting().length + this.store.preparing().length,
      ready: this.store.ready().length + this.store.onTheWay().length,
      closed: this.store.closed().length,
    }[f];
  }

  protected emptyIcon(): string {
    return { new: 'fa-mug-hot', active: 'fa-fire-burner', ready: 'fa-bell-concierge', closed: 'fa-box-archive' }[this.filter()];
  }

  protected emptyText(): string {
    return {
      new: 'No hay pedidos nuevos. Te avisaremos con sonido cuando llegue uno.',
      active: 'No hay pedidos en cocina.',
      ready: 'No hay pedidos listos para entregar.',
      closed: 'Aún no hay pedidos cerrados hoy.',
    }[this.filter()];
  }

  protected open(o: StaffOrder): void {
    this.selectedId.set(o.id);
  }

  protected act(o: StaffOrder, action: OrderAction): void {
    void this.actions.run(o, action);
  }

  protected async refresh(ev: CustomEvent): Promise<void> {
    await this.store.reload();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  /** Pedido de un cliente que está en el local (para llevar o comer aquí). */
  protected newOrder(): void {
    void this.router.navigateByUrl('/tabs/nuevo-pedido');
  }
}
