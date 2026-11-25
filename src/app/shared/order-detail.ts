import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { StaffOrder } from '../core/models';
import { OrderActionsService } from '../core/order-actions.service';
import { ACTIONS, canDo, ORDER_TYPE, OrderAction, STATUS_META } from '../core/order-status';
import { OrdersStore } from '../core/orders.store';
import { NotifyService } from '../core/notify.service';
import { clockLabel, dayClockLabel, shortNumber } from '../core/time';
import { MoneyPipe } from './money.pipe';
import { OrderMapComponent } from './order-map';
import { openDirections } from '../core/directions';
import { DeliveryLocation } from '../core/models';
import { StatusChipComponent } from './status-chip';

const PAYMENT_META: Record<string, { label: string; icon: string }> = {
  CASH: { label: 'Efectivo', icon: 'fa-money-bill-wave' },
  TRANSFER: { label: 'Transferencia', icon: 'fa-building-columns' },
};

/** Detalle completo del pedido para encargado/admin (§5.3). Se usa en modal (teléfono) o panel (tablet). */
@Component({
  selector: 'app-order-detail',
  imports: [DatePipe, MoneyPipe, StatusChipComponent, OrderMapComponent],
  template: `
    @if (order(); as o) {
      <div class="detail">
        <header class="detail__head">
          <div>
            <p class="detail__kicker">Pedido</p>
            <h2 class="detail__number">#{{ num() }} <app-status-chip [status]="o.status" [type]="o.orderType" /></h2>
            <p class="detail__sub">Recibido {{ o.createdAt | date: "EEEE d 'de' MMM, h:mm a" }}</p>
          </div>
          @if (closable()) {
            <button type="button" class="icon-btn" (click)="dismissed.emit()" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          }
        </header>

        @if (o.status === 'REJECTED') {
          <p class="banner banner--danger"><i class="fa-solid fa-circle-xmark"></i> Rechazado por {{ o.rejectedBy }}: {{ o.rejectionReason }}</p>
        }
        @if (o.status === 'CANCELLED') {
          <p class="banner banner--danger"><i class="fa-solid fa-ban"></i> Cancelado por el cliente{{ o.cancellationReason ? ': ' + o.cancellationReason : '' }}</p>
        }
        @if (o.scheduledFor && !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(o.status)) {
          <div class="banner banner--info banner--flat">
            <i class="fa-solid fa-calendar-check"></i>
            <span>
              Recoger <strong>{{ dayClock(o.scheduledFor) }}</strong>
              @if (o.reminderAt) { · empezar a preparar ~{{ clock(o.reminderAt) }} }
              @if (o.reminderSentAt) { · <em>recordatorio enviado</em> }
            </span>
          </div>
        }

        <section class="detail__section">
          <h3><i class="fa-solid fa-user"></i> Cliente</h3>
          <div class="detail__grid">
            <div><span class="muted">Nombre</span><strong>{{ o.customerName }}</strong></div>
            <div>
              <span class="muted">Teléfono <small>(no verificado)</small></span>
              @if (o.customerPhone) { <a class="link" [href]="'tel:' + o.customerPhone"><i class="fa-solid fa-phone"></i> {{ o.customerPhone }}</a> } @else { <strong>—</strong> }
            </div>
            <div><span class="muted">Modalidad</span><strong><i class="fa-solid" [class]="types[o.orderType].icon"></i> {{ types[o.orderType].long }}</strong></div>
            @if (o.channel === 'COUNTER') {
              <div><span class="muted">Origen</span><strong><i class="fa-solid fa-shop"></i> En el local{{ o.createdBy ? ' · ' + o.createdBy : '' }}</strong></div>
            }
            <div><span class="muted">Pago</span><strong><i class="fa-solid" [class]="payment(o.paymentMethod).icon"></i> {{ payment(o.paymentMethod).label }}</strong></div>
          </div>
          @if (o.address; as a) {
            <div class="detail__address">
              <i class="fa-solid fa-location-dot"></i>
              <div>
                <strong>{{ a.neighborhood }}</strong>
                <p>{{ a.street }}@if (a.house) {, {{ a.house }}}</p>
                <p class="muted">Ref.: {{ a.reference }}</p>
              </div>
            </div>
          }
          @if (o.orderType === 'DELIVERY' && o.deliveryLocation; as loc) {
            <div class="detail__map">
              @defer (on viewport) {
                <app-order-map [lat]="loc.lat" [lng]="loc.lng" [accuracy]="loc.accuracy" />
              } @placeholder {
                <div class="order-map order-map--ph"><i class="fa-solid fa-map-location-dot"></i></div>
              }
              <p class="detail__map-src">
                <i class="fa-solid" [class]="loc.source === 'GPS' ? 'fa-mobile-screen' : 'fa-hand-pointer'"></i>
                {{ loc.source === 'GPS' ? 'Ubicación del celular del cliente' + (loc.accuracy ? ' (±' + loc.accuracy + ' m)' : '') : 'Marcado por el cliente en el mapa' }} · solo referencia
              </p>
              <button type="button" class="btn btn--primary btn--block detail__directions" (click)="directions(loc)">
                <i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar
              </button>
            </div>
          }
        </section>

        <section class="detail__section">
          <h3><i class="fa-solid fa-bowl-food"></i> Productos</h3>
          <ul class="detail__items">
            @for (item of o.items; track item.id) {
              <li>
                <span class="detail__qty">{{ item.quantity }}×</span>
                <div class="detail__item-body">
                  <strong>{{ item.productName }}</strong>
                  @for (opt of item.options; track $index) {
                    <span class="detail__opt">{{ opt.optionName }}: {{ opt.valueName }} @if (opt.priceDelta) { <em>(+{{ opt.priceDelta | money }})</em> }</span>
                  }
                  @if (item.notes) {
                    <span class="detail__note"><i class="fa-solid fa-comment-dots"></i> {{ item.notes }}</span>
                  }
                </div>
                <span class="detail__price">{{ item.lineTotal | money }}</span>
              </li>
            }
          </ul>
          @if (o.notes) {
            <p class="detail__general"><i class="fa-solid fa-clipboard"></i> <strong>Notas:</strong> {{ o.notes }}</p>
          }
          <dl class="detail__totals">
            <div><dt>Subtotal</dt><dd>{{ o.subtotal | money }}</dd></div>
            @if (o.deliveryFee) { <div><dt>Envío</dt><dd>{{ o.deliveryFee | money }}</dd></div> }
            <div class="detail__total"><dt>Total a cobrar</dt><dd>{{ o.total | money }}</dd></div>
          </dl>
        </section>

        @if (o.history?.length) {
          <section class="detail__section">
            <h3><i class="fa-solid fa-clock-rotate-left"></i> Historial</h3>
            <ol class="timeline">
              @for (h of o.history; track h.id) {
                <li>
                  <span class="timeline__dot" [class]="'timeline__dot timeline__dot--' + meta(h.toStatus).color"></span>
                  <div>
                    <strong>{{ meta(h.toStatus).label }}</strong> · {{ h.createdAt | date: 'h:mm a' }}
                    <p class="muted">{{ h.actorLabel }}@if (h.reason) { — {{ h.reason }} }</p>
                  </div>
                </li>
              }
            </ol>
          </section>
        }

        @if (actions().length) {
          <footer class="detail__actions">
            @for (a of actions(); track a.action) {
              <button type="button" class="btn btn--lg" [class]="'btn btn--lg btn--' + a.tone" [disabled]="busy()" (click)="run(a.action)">
                @if (busy()) { <i class="fa-solid fa-spinner fa-spin"></i> } @else { <i class="fa-solid" [class]="a.icon"></i> }
                {{ a.label }}
              </button>
            }
          </footer>
        }
      </div>
    } @else {
      <div class="empty">
        <i class="fa-solid fa-circle-question"></i>
        <p>Este pedido ya no está en la lista.</p>
        @if (closable()) { <button type="button" class="btn btn--ghost" (click)="dismissed.emit()">Cerrar</button> }
      </div>
    }
  `,
})
export class OrderDetailComponent {
  readonly orderId = input.required<string>();
  readonly closable = input(true);
  readonly dismissed = output<void>();

  private readonly store = inject(OrdersStore);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly actionsService = inject(OrderActionsService);

  protected readonly order = computed<StaffOrder | undefined>(() => this.store.get(this.orderId()));
  protected readonly num = computed(() => shortNumber(this.order()?.orderNumber ?? ''));
  protected readonly busy = computed(() => this.store.busy().has(this.orderId()));

  protected readonly types = ORDER_TYPE;

  protected readonly actions = computed(() => {
    const o = this.order();
    const role = this.auth.role();
    if (!o) return [];
    const tones: Record<OrderAction, string> = { reject: 'danger-ghost', accept: 'success', start: 'warning', ready: 'success', dispatch: 'primary', complete: 'dark' };
    const order: OrderAction[] = ['reject', 'accept', 'start', 'ready', 'dispatch', 'complete'];
    return order
      .filter((a) => canDo(a, o, role))
      .map((a) => ({ action: a, label: ACTIONS[a].label, icon: ACTIONS[a].icon, tone: tones[a] }));
  });

  protected payment(code: string | undefined): { label: string; icon: string } {
    return PAYMENT_META[code ?? ''] ?? { label: code ?? '—', icon: 'fa-wallet' };
  }

  protected readonly clock = clockLabel;
  protected dayClock(iso: string): string {
    return dayClockLabel(iso, this.store.now());
  }

  protected meta(s: StaffOrder['status']) {
    return STATUS_META[s];
  }

  protected async run(action: OrderAction): Promise<void> {
    const o = this.order();
    if (!o) return;
    const ok = await this.actionsService.run(o, action);
    if (ok && (action === 'accept' || action === 'reject' || action === 'complete') && this.closable()) this.dismissed.emit();
  }

  protected async directions(loc: DeliveryLocation): Promise<void> {
    try {
      const app = await openDirections(loc.lat, loc.lng);
      if (app === 'browser') void this.notify.toast('No se encontró Google Maps ni Waze: se abrió en el navegador.', 'info', 2500);
    } catch {
      void this.notify.toast('No se pudo abrir el mapa.', 'error');
    }
  }
}
