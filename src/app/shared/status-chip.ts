import { Component, computed, input } from '@angular/core';
import { OrderStatus, OrderType } from '../core/models';
import { STATUS_META, statusLabel } from '../core/order-status';

@Component({
  selector: 'app-status-chip',
  template: `<span class="status-chip" [class]="'status-chip status-chip--' + meta().color"><i class="fa-solid" [class]="meta().icon"></i> {{ label() }}</span>`,
})
export class StatusChipComponent {
  readonly status = input.required<OrderStatus>();
  /** Opcional: con el tipo, "Listo" se muestra como "Listo para recoger" / "Listo para enviar". */
  readonly type = input<OrderType | undefined>(undefined);
  protected readonly meta = computed(() => STATUS_META[this.status()]);
  protected readonly label = computed(() => {
    const t = this.type();
    return t ? statusLabel({ status: this.status(), orderType: t }) : this.meta().label;
  });
}
