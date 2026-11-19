import { inject, Injectable } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { StaffOrder } from './models';
import { OrderAction, REJECTION_REASONS } from './order-status';
import { OrdersStore } from './orders.store';
import { NotifyService } from './notify.service';
import { shortNumber } from './time';

/** Acciones de UI sobre pedidos (pide motivo de rechazo, confirma, etc.). */
@Injectable({ providedIn: 'root' })
export class OrderActionsService {
  private readonly store = inject(OrdersStore);
  private readonly sheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);
  private readonly notify = inject(NotifyService);

  async run(order: StaffOrder, action: OrderAction): Promise<boolean> {
    if (action === 'reject') return this.reject(order);
    const ok = await this.store.act(order, action);
    if (ok) {
      const n = shortNumber(order.orderNumber);
      const msg: Partial<Record<OrderAction, string>> = {
        accept: `Pedido #${n} aceptado y enviado a cocina`,
        complete: `Pedido #${n} entregado`,
        dispatch: `Pedido #${n} salió a entrega`,
      };
      if (msg[action]) void this.notify.toast(msg[action]!, 'success', 2000);
    }
    return ok;
  }

  private async reject(order: StaffOrder): Promise<boolean> {
    const reason = await this.askReason(order);
    if (!reason) return false;
    const ok = await this.store.act(order, 'reject', { reason });
    if (ok) void this.notify.toast(`Pedido #${shortNumber(order.orderNumber)} rechazado`, 'info', 2000);
    return ok;
  }

  private async askReason(order: StaffOrder): Promise<string | null> {
    const sheet = await this.sheets.create({
      header: `Rechazar pedido #${shortNumber(order.orderNumber)}`,
      subHeader: 'El cliente verá el motivo en su seguimiento.',
      cssClass: 'pacos-sheet',
      buttons: [
        ...REJECTION_REASONS.map((r) => ({ text: r, data: r })),
        { text: 'Otro motivo…', data: '__other__' },
        { text: 'Cancelar', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data, role } = await sheet.onDidDismiss<string>();
    if (role === 'cancel' || role === 'backdrop' || !data) return null;
    if (data !== '__other__') return data;

    const alert = await this.alerts.create({
      header: 'Motivo del rechazo',
      inputs: [{ name: 'reason', type: 'textarea', placeholder: 'Escribe un motivo breve', attributes: { maxlength: 200 } }],
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Rechazar', role: 'confirm' }],
    });
    await alert.present();
    const res = await alert.onDidDismiss<{ values: { reason: string } }>();
    const text = res.data?.values?.reason?.trim();
    if (res.role !== 'confirm' || !text || text.length < 3) return null;
    return text;
  }
}
