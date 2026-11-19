import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { Role, StaffOrder } from '../core/models';
import { canDo, ORDER_TYPE, OrderAction, statusLabel } from '../core/order-status';
import { clockLabel, dayClockLabel, elapsedLabel, minutesSince, shortNumber } from '../core/time';

/** Tarjeta de cocina (§6.3): número grande, tiempo desde aceptación, ítems legibles y una acción principal. */
@Component({
  selector: 'app-kitchen-card',
  imports: [DatePipe],
  template: `
    @let o = order();
    <article class="kcard" [class.kcard--late]="late()" [class.kcard--new]="isNew()" [attr.aria-label]="'Pedido ' + o.orderNumber">
      <header class="kcard__head">
        <div class="kcard__number">
          <small>#</small>{{ num() }}
          @if (isNew()) { <span class="kcard__new">NUEVO</span> }
        </div>
        <div class="kcard__time" [class.kcard__time--late]="late()">
          <i class="fa-solid" [class]="late() ? 'fa-triangle-exclamation' : startsAt() ? 'fa-calendar-check' : 'fa-clock'"></i>
          {{ startsAt() ? 'Inicia ' + startsAt() : elapsed() }}
          @if (late()) { <span class="sr-only">Demorado</span> }
        </div>
      </header>
      <div class="kcard__meta">
        <span class="kcard__type" [class.kcard__type--delivery]="o.orderType === 'DELIVERY'" [class.kcard__type--dinein]="o.orderType === 'DINE_IN'">
          <i class="fa-solid" [class]="types[o.orderType].icon"></i>
          {{ types[o.orderType].short }}
        </span>
        @if (o.scheduledFor) {
          <span class="sched-badge"><i class="fa-solid fa-calendar-check"></i> Recoger {{ pickup() }}</span>
        }
        <span class="kcard__customer"><i class="fa-solid fa-user"></i> {{ o.customerName }}</span>
        <span class="kcard__accepted">Aceptado {{ o.acceptedAt | date: 'h:mm a' }}</span>
      </div>

      <ul class="kcard__items">
        @for (item of o.items; track item.id) {
          <li>
            <div class="kcard__item">
              <span class="kcard__qty">{{ item.quantity }}×</span>
              <span class="kcard__name">{{ item.productName }}</span>
            </div>
            @if (item.options.length) {
              <ul class="kcard__options">
                @for (opt of item.options; track $index) {
                  <li>{{ opt.valueName }}</li>
                }
              </ul>
            }
            @if (item.notes) {
              <p class="kcard__note"><i class="fa-solid fa-comment-dots"></i> <strong>Nota:</strong> {{ item.notes }}</p>
            }
          </li>
        }
      </ul>

      @if (o.notes) {
        <p class="kcard__general"><i class="fa-solid fa-clipboard"></i> <strong>Nota del pedido:</strong> {{ o.notes }}</p>
      }

      <footer class="kcard__actions">
        @if (primary(); as a) {
          <button type="button" class="btn btn--lg btn--block" [class]="'btn btn--lg btn--block btn--' + a.tone" [disabled]="busy()" (click)="act.emit(a.action)">
            @if (busy()) { <i class="fa-solid fa-spinner fa-spin"></i> Guardando… } @else { <i class="fa-solid" [class]="a.icon"></i> {{ a.label }} }
          </button>
        } @else if (o.status === 'READY') {
          <p class="kcard__waiting"><i class="fa-solid fa-circle-check"></i> {{ readyLabel(o) }} · pendiente de entrega</p>
        }
      </footer>
    </article>
  `,
})
export class KitchenCardComponent {
  readonly order = input.required<StaffOrder>();
  readonly role = input.required<Role | undefined>();
  readonly now = input.required<number>();
  readonly delayMinutes = input(15);
  readonly busy = input(false);
  readonly act = output<OrderAction>();

  protected readonly num = computed(() => shortNumber(this.order().orderNumber));
  /**
   * Tiempo en cocina desde la aceptación. En un pedido programado cuenta desde la
   * hora de inicio sugerida y se considera demorado si pasa la hora de recogida.
   */
  protected readonly minutes = computed(() => {
    const o = this.order();
    return minutesSince(o.scheduledFor ? (o.reminderAt ?? o.scheduledFor) : (o.acceptedAt ?? o.createdAt), this.now());
  });
  protected readonly elapsed = computed(() => elapsedLabel(this.minutes()));
  protected readonly late = computed(() => {
    const o = this.order();
    if (o.status === 'READY') return false;
    return o.scheduledFor ? this.now() > Date.parse(o.scheduledFor) : this.minutes() >= this.delayMinutes();
  });
  protected readonly isNew = computed(() => this.order().status === 'ACCEPTED' && !this.order().scheduledFor && this.minutes() < 2);
  /** Programado que aún no debe empezar: "Inicia 3:35 p. m.". */
  protected readonly startsAt = computed(() => {
    const o = this.order();
    if (!o.reminderAt || o.status !== 'ACCEPTED' || this.now() >= Date.parse(o.reminderAt)) return null;
    return clockLabel(o.reminderAt);
  });
  protected readonly pickup = computed(() => (this.order().scheduledFor ? dayClockLabel(this.order().scheduledFor!, this.now()) : ''));

  /** Cocina solo inicia y marca listo; entregar o "salió a entrega" se hace en Pedidos (caja/administración). */
  protected readonly types = ORDER_TYPE;
  protected readonly readyLabel = statusLabel;

  protected readonly primary = computed(() => {
    const o = this.order();
    const r = this.role();
    if (canDo('start', o, r)) return { action: 'start' as const, label: 'INICIAR', icon: 'fa-fire-burner', tone: 'warning' };
    if (canDo('ready', o, r)) return { action: 'ready' as const, label: 'MARCAR LISTO', icon: 'fa-bell-concierge', tone: 'success' };
    return null;
  });

}
