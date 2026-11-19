import { StaffOrder } from './models';
import { canDo, kitchenOrder, visibleFor } from './order-status';

const order = (id: string, acceptedAt: string | null, createdAt = '2026-11-13T10:00:00Z', extra: Partial<StaffOrder> = {}): StaffOrder => ({
  id, orderNumber: id, status: 'ACCEPTED', orderType: 'PICKUP', customerName: 'X', notes: '', items: [],
  createdAt, acceptedAt, startedAt: null, readyAt: null, outForDeliveryAt: null, completedAt: null, ...extra,
});

describe('kitchenOrder (FIFO §6.1)', () => {
  it('ordena por accepted_at, no por orden de llegada de eventos', () => {
    const arrived = [order('c', '2026-11-13T10:05:00Z'), order('a', '2026-11-13T10:01:00Z'), order('b', '2026-11-13T10:03:00Z')];
    expect([...arrived].sort(kitchenOrder).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('desempata por created_at y luego por id', () => {
    const t = '2026-11-13T10:01:00Z';
    const list = [order('z', t, '2026-11-13T09:59:00Z'), order('y', t, '2026-11-13T09:58:00Z'), order('x', t, '2026-11-13T09:59:00Z')];
    expect(list.sort(kitchenOrder).map((o) => o.id)).toEqual(['y', 'x', 'z']);
  });
});

describe('kitchenOrder con pedidos programados', () => {
  it('un programado entra a la fila en su hora de inicio sugerida, no al aceptarse', () => {
    const scheduled = order('s', '2026-11-13T09:00:00Z', '2026-11-13T08:59:00Z', {
      scheduledFor: '2026-11-13T16:00:00Z', reminderAt: '2026-11-13T15:35:00Z',
    });
    const asap = order('n', '2026-11-13T10:00:00Z');
    const later = order('l', '2026-11-13T15:40:00Z');
    expect([scheduled, later, asap].sort(kitchenOrder).map((o) => o.id)).toEqual(['n', 's', 'l']);
  });
});

describe('canDo (máquina de estados + roles §3/§7)', () => {
  it('el chef no puede aceptar ni rechazar', () => {
    const o = order('1', null, undefined, { status: 'PENDING' });
    expect(canDo('accept', o, 'CHEF')).toBe(false);
    expect(canDo('reject', o, 'CHEF')).toBe(false);
    expect(canDo('accept', o, 'MANAGER')).toBe(true);
  });

  it('solo se marca listo si se inició la preparación', () => {
    expect(canDo('ready', order('1', 't', undefined, { status: 'ACCEPTED' }), 'CHEF')).toBe(false);
    expect(canDo('ready', order('1', 't', undefined, { status: 'PREPARING' }), 'CHEF')).toBe(true);
  });

  it('"salió a entrega" solo aplica a domicilio', () => {
    expect(canDo('dispatch', order('1', 't', undefined, { status: 'READY', orderType: 'PICKUP' }), 'ADMIN')).toBe(false);
    expect(canDo('dispatch', order('1', 't', undefined, { status: 'READY', orderType: 'DELIVERY' }), 'ADMIN')).toBe(true);
  });

  it('estados terminales no tienen acciones', () => {
    const done = order('1', 't', undefined, { status: 'COMPLETED' });
    expect((['accept', 'reject', 'start', 'ready', 'dispatch', 'complete'] as const).some((a) => canDo(a, done, 'ADMIN'))).toBe(false);
  });

  it('el chef solo ve pedidos de cocina', () => {
    expect(visibleFor('CHEF', 'PENDING')).toBe(false);
    expect(visibleFor('CHEF', 'PREPARING')).toBe(true);
    expect(visibleFor('MANAGER', 'PENDING')).toBe(true);
  });
});
