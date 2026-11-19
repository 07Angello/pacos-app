import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { OrdersStore } from '../core/orders.store';

/** Indicador ONLINE / SIN CONEXIÓN + última sincronización (§12). */
@Component({
  selector: 'app-connection-pill',
  imports: [DatePipe],
  template: `
    <button type="button" class="conn" [class]="'conn conn--' + store.connection()" (click)="store.reload()"
      [attr.aria-label]="label() + '. Toca para sincronizar'">
      <span class="conn__dot"></span>
      <span class="conn__text">{{ label() }}</span>
      @if (store.lastSync(); as t) {
        <span class="conn__time">· {{ t | date: 'h:mm:ss a' }}</span>
      }
      <i class="fa-solid fa-rotate" [class.fa-spin]="store.loading()"></i>
    </button>
  `,
})
export class ConnectionPillComponent {
  protected readonly store = inject(OrdersStore);

  protected label(): string {
    return { online: 'En línea', offline: 'Sin conexión', connecting: 'Conectando…' }[this.store.connection()];
  }
}
