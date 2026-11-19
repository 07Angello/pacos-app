import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { Role, StaffOrder } from '../core/models';
import { canDo, ORDER_TYPE, OrderAction } from '../core/order-status';
import { dayClockLabel, elapsedLabel, minutesSince, shortNumber } from '../core/time';
import { MoneyPipe } from './money.pipe';
import { StatusChipComponent } from './status-chip';

/** Tarjeta de la bandeja del encargado (§5.3). */
@Component({
  selector: 'app-order-card',
  imports: [DatePipe, MoneyPipe, StatusChipComponent],
  template: `
    @let o = order();
    <article class="ocard" [class.ocard--selected]="selected()" [class.ocard--pending]="o.status === 'PENDING'">
      <button type="button" class="ocard__body" (click)="open.emit()" [attr.aria-label]="'Ver pedido ' + o.orderNumber">
        <div class="ocard__top">
          <span class="ocard__number">#{{ num() }}</span>
          <app-status-chip [status]="o.status" [type]="o.orderType" />
          <span class="ocard__spacer"></span>
          <span class="ocard__age" [class.ocard__age--warn]="o.status === 'PENDING' && age() >= 5">
            <i class="fa-regular fa-clock"></i> {{ o.createdAt | date: 'h:mm a' }} · {{ ageLabel() }}
          </span>
        </div>
        <div class="ocard__who">
          <span class="ocard__name">{{ o.customerName }}</span>
          <span class="ocard__type">@if (o.channel === 'COUNTER') {<i class="fa-solid fa-shop ocard__local" title="Tomado en el local"></i>}<i class="fa-solid" [class]="types[o.orderType].icon"></i> {{ types[o.orderType].short }}</span>
        </div>
        @if (o.scheduledFor) {
          <span class="sched-badge" [class.sched-badge--due]="due()"><i class="fa-solid fa-calendar-check"></i> Recoger {{ scheduled() }}</span>
        }
        <p class="ocard__items">{{ summary() }}</p>
        <div class="ocard__bottom">
          <span class="ocard__count">{{ itemCount() }} {{ itemCount() === 1 ? 'producto' : 'productos' }}</span>
          <span class="ocard__total">{{ o.total | money }}</span>
        </div>
      </button>
      @if (canAccept()) {
        <div class="ocard__actions">
          <button type="button" class="btn btn--danger-ghost" [disabled]="busy()" (click)="act.emit('reject')"><i class="fa-solid fa-xmark"></i> Rechazar</button>
          <button type="button" class="btn btn--success" [disabled]="busy()" (click)="act.emit('accept')">
            @if (busy()) { <i class="fa-solid fa-spinner fa-spin"></i> } @else { <i class="fa-solid fa-check"></i> } Aceptar
          </button>
        </div>
      } @else if (quick(); as q) {
        <div class="ocard__actions">
          <button type="button" class="btn" [class]="'btn btn--' + q.tone" [disabled]="busy()" (click)="act.emit(q.action)">
            @if (busy()) { <i class="fa-solid fa-spinner fa-spin"></i> } @else { <i class="fa-solid" [class]="q.icon"></i> } {{ q.label }}
          </button>
        </div>
      }
    </article>
  `,
})
export class OrderCardComponent {
  readonly order = input.required<StaffOrder>();
  readonly role = input.required<Role | undefined>();
  readonly now = input.required<number>();
  readonly busy = input(false);
  readonly selected = input(false);
  readonly open = output<void>();
  readonly act = output<OrderAction>();

  protected readonly num = computed(() => shortNumber(this.order().orderNumber));
  protected readonly age = computed(() => minutesSince(this.order().createdAt, this.now()));
  protected readonly ageLabel = computed(() => (this.age() < 1 ? 'ahora' : `hace ${elapsedLabel(this.age())}`));
  protected readonly scheduled = computed(() => (this.order().scheduledFor ? dayClockLabel(this.order().scheduledFor!, this.now()) : ''));
  protected readonly due = computed(() => {
    const o = this.order();
    return !!o.reminderAt && ['PENDING', 'ACCEPTED'].includes(o.status) && this.now() >= Date.parse(o.reminderAt);
  });
  protected readonly itemCount = computed(() => this.order().items.reduce((n, i) => n + i.quantity, 0));
  protected readonly summary = computed(() => this.order().items.map((i) => `${i.quantity}× ${i.productName}`).join(', '));
  protected readonly types = ORDER_TYPE;
  protected readonly canAccept = computed(() => canDo('accept', this.order(), this.role()));
  /** Siguiente paso de entrega: recoger → Entregado; domicilio → Salió a entrega → Entregado. */
  protected readonly quick = computed(() => {
    const o = this.order();
    const r = this.role();
    if (canDo('dispatch', o, r)) return { action: 'dispatch' as const, label: 'Salió a entrega', icon: 'fa-motorcycle', tone: 'primary' };
    if (canDo('complete', o, r)) return { action: 'complete' as const, label: o.orderType === 'DELIVERY' ? 'Entregado al cliente' : o.orderType === 'DINE_IN' ? 'Servido' : 'Entregado', icon: 'fa-flag-checkered', tone: 'dark' };
    return null;
  });
}
