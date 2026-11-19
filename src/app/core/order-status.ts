import { OrderStatus, OrderType, Role, StaffOrder } from './models';

/** Única definición de estados y transiciones en el cliente (espejo del backend, §7). */
export type OrderAction = 'accept' | 'reject' | 'start' | 'ready' | 'dispatch' | 'complete';

export const ACTIONS: Record<OrderAction, { rpc: string; from: OrderStatus[]; roles: Role[]; label: string; icon: string }> = {
  accept: { rpc: 'accept_order', from: ['PENDING'], roles: ['ADMIN', 'MANAGER'], label: 'Aceptar', icon: 'fa-check' },
  reject: { rpc: 'reject_order', from: ['PENDING'], roles: ['ADMIN', 'MANAGER'], label: 'Rechazar', icon: 'fa-xmark' },
  start: { rpc: 'start_preparation', from: ['ACCEPTED'], roles: ['ADMIN', 'MANAGER', 'CHEF'], label: 'Iniciar', icon: 'fa-fire-burner' },
  ready: { rpc: 'mark_order_ready', from: ['PREPARING'], roles: ['ADMIN', 'MANAGER', 'CHEF'], label: 'Marcar listo', icon: 'fa-bell-concierge' },
  dispatch: { rpc: 'mark_out_for_delivery', from: ['READY'], roles: ['ADMIN', 'MANAGER'], label: 'Salió a entrega', icon: 'fa-motorcycle' },
  complete: { rpc: 'complete_order', from: ['READY', 'OUT_FOR_DELIVERY'], roles: ['ADMIN', 'MANAGER'], label: 'Entregado', icon: 'fa-flag-checkered' },
};

export function canDo(action: OrderAction, order: Pick<StaffOrder, 'status' | 'orderType'>, role: Role | undefined): boolean {
  const a = ACTIONS[action];
  if (!role || !a.roles.includes(role) || !a.from.includes(order.status)) return false;
  if (action === 'dispatch') return order.orderType === 'DELIVERY';
  // Recoger: se entrega desde "Listo". Domicilio: primero "En camino", luego entregado.
  if (action === 'complete') return order.status === (order.orderType === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'READY');
  return true;
}

export const STATUS_META: Record<OrderStatus, { label: string; icon: string; color: string }> = {
  PENDING: { label: 'Nuevo', icon: 'fa-bell', color: 'pending' },
  ACCEPTED: { label: 'En espera', icon: 'fa-hourglass-half', color: 'accepted' },
  PREPARING: { label: 'Preparando', icon: 'fa-fire-burner', color: 'preparing' },
  READY: { label: 'Listo', icon: 'fa-bell-concierge', color: 'ready' },
  OUT_FOR_DELIVERY: { label: 'En camino', icon: 'fa-motorcycle', color: 'delivery' },
  COMPLETED: { label: 'Entregado', icon: 'fa-flag-checkered', color: 'completed' },
  REJECTED: { label: 'Rechazado', icon: 'fa-circle-xmark', color: 'rejected' },
  CANCELLED: { label: 'Cancelado', icon: 'fa-ban', color: 'rejected' },
};

/** Modalidad: etiqueta corta, larga e ícono. */
export const ORDER_TYPE: Record<OrderType, { short: string; long: string; icon: string }> = {
  PICKUP: { short: 'Recoger', long: 'Recoger en local', icon: 'fa-store' },
  DELIVERY: { short: 'Domicilio', long: 'Entrega a domicilio', icon: 'fa-motorcycle' },
  DINE_IN: { short: 'Comer aquí', long: 'Comer en el local', icon: 'fa-utensils' },
};

const READY_LABEL: Record<OrderType, string> = {
  PICKUP: 'Listo para recoger',
  DELIVERY: 'Listo para enviar',
  DINE_IN: 'Listo para servir',
};

/** "Listo para recoger" / "Listo para enviar" / "Listo para servir". */
export function statusLabel(order: Pick<StaffOrder, 'status' | 'orderType'>): string {
  if (order.status === 'READY') return READY_LABEL[order.orderType];
  return STATUS_META[order.status].label;
}

/** Acciones de cocina: solo iniciar y marcar listo (entregar es de caja/administración). */
export const KITCHEN_ACTIONS: OrderAction[] = ['start', 'ready'];

export const KITCHEN_STATUSES: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
export const CLOSED_STATUSES: OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

/** Estados visibles para cada rol (el backend aplica la misma regla). */
export function visibleFor(role: Role, status: OrderStatus): boolean {
  return role !== 'CHEF' || KITCHEN_STATUSES.includes(status);
}

/**
 * Orden FIFO de cocina (§6.1): accepted_at ASC, luego created_at ASC, luego id ASC.
 * Un pedido programado entra a la fila en su hora de inicio sugerida (reminderAt),
 * no cuando se aceptó, para no adelantarse a los pedidos inmediatos.
 * No depende del orden en que llegaron los eventos.
 */
export function kitchenOrder(a: StaffOrder, b: StaffOrder): number {
  return (
    kitchenTime(a) - kitchenTime(b) ||
    cmp(a.createdAt, b.createdAt) ||
    cmp(a.id, b.id)
  );
}

/** Pedidos nuevos: el más antiguo primero. */
export function inboxOrder(a: StaffOrder, b: StaffOrder): number {
  return cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
}

/** Momento en que el pedido entra a la fila de cocina. */
export function kitchenTime(o: Pick<StaffOrder, 'acceptedAt' | 'createdAt' | 'scheduledFor' | 'reminderAt'>): number {
  return Date.parse(o.scheduledFor ? (o.reminderAt ?? o.scheduledFor) : (o.acceptedAt ?? o.createdAt));
}

/** Pedido programado que todavía no está listo. */
export function isUpcomingSchedule(o: Pick<StaffOrder, 'scheduledFor' | 'status'>): boolean {
  return !!o.scheduledFor && ['PENDING', 'ACCEPTED', 'PREPARING'].includes(o.status);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const REJECTION_REASONS = [
  'Producto agotado',
  'Fuera de la zona de entrega',
  'Cocina saturada en este momento',
  'Datos de contacto o dirección incompletos',
  'Estamos por cerrar',
];

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrador', MANAGER: 'Encargado', CHEF: 'Cocina' };
