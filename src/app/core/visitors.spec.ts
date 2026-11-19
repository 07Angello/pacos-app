import { summarizePresence } from './visitors';

describe('summarizePresence (contador en vivo)', () => {
  it('cuenta personas por dispositivo, no por pestaña', () => {
    const r = summarizePresence({
      a: [{ stage: 'MENU', device: 'MOBILE' }, { stage: 'CHECKOUT', device: 'MOBILE' }],
      b: [{ stage: 'CART', device: 'DESKTOP' }],
    });
    expect(r.total).toBe(2);
    // Dos pestañas del mismo cliente: cuenta el paso más avanzado, una sola vez.
    expect(r.byStage).toEqual({ MENU: 0, CART: 1, CHECKOUT: 1, TRACKING: 0 });
    expect(r.mobile).toBe(1);
    expect(r.desktop).toBe(1);
  });

  it('la suma por paso siempre coincide con el total', () => {
    const state: Record<string, { stage: string; device: string }[]> = {};
    const stages = ['MENU', 'CART', 'CHECKOUT', 'TRACKING'];
    for (let i = 0; i < 250; i++) {
      state['v' + i] = Array.from({ length: 1 + (i % 3) }, (_, j) => ({ stage: stages[(i + j) % 4], device: i % 5 ? 'MOBILE' : 'DESKTOP' }));
    }
    const r = summarizePresence(state);
    expect(r.total).toBe(250);
    expect(Object.values(r.byStage).reduce((a, b) => a + b, 0)).toBe(250);
    expect(r.mobile + r.desktop).toBe(250);
  });

  it('ignora claves sin entradas o con datos inválidos (salidas a medias, clientes viejos)', () => {
    const r = summarizePresence({ a: [], b: [{ stage: 'HACK' }], c: [{}], d: [{ stage: 'TRACKING' }] });
    expect(r.total).toBe(1);
    expect(r.byStage.TRACKING).toBe(1);
  });

  it('es una foto: recalcular con el mismo estado da el mismo número', () => {
    const state = { a: [{ stage: 'MENU' }], b: [{ stage: 'CART' }] };
    expect(summarizePresence(state)).toEqual(summarizePresence(state));
    expect(summarizePresence({}).total).toBe(0);
  });
});
