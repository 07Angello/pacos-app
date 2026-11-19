import { addDays, customRange, delta, presetRange, rangeSlug, todayYmd, zoned } from './report';

// Honduras: UTC-6 todo el año.
describe('rangos de reportes (hora de Honduras)', () => {
  // 14 nov 2026, 11:30 p. m. en Honduras = 15 nov 05:30 UTC
  const now = new Date('2026-11-15T05:30:00Z');

  it('"hoy" usa el día local del restaurante, no el UTC', () => {
    expect(todayYmd(now)).toBe('2026-11-14');
    expect(presetRange('today', now)).toEqual({ from: '2026-11-14T06:00:00.000Z', to: '2026-11-15T06:00:00.000Z' });
  });

  it('ayer, 7 días, este mes y mes pasado', () => {
    expect(presetRange('yesterday', now).from).toBe('2026-11-13T06:00:00.000Z');
    expect(presetRange('week', now).from).toBe(zoned('2026-11-08'));
    expect(presetRange('month', now)).toEqual({ from: zoned('2026-11-01'), to: zoned('2026-11-15') });
    expect(presetRange('lastMonth', now)).toEqual({ from: zoned('2026-10-01'), to: zoned('2026-11-01') });
  });

  it('enero → mes pasado es diciembre del año anterior', () => {
    expect(presetRange('lastMonth', new Date('2027-01-10T18:00:00Z')).from).toBe(zoned('2026-12-01'));
  });

  it('personalizado incluye el minuto final', () => {
    expect(customRange('2026-11-07', '18:00', '2026-11-07', '23:59')).toEqual({ from: '2026-11-08T00:00:00.000Z', to: '2026-11-08T06:00:00.000Z' });
  });

  it('nombres de archivo y utilidades', () => {
    expect(rangeSlug(zoned('2026-11-01'), zoned('2026-11-15'))).toBe('2026-11-01_a_2026-11-14');
    expect(rangeSlug(zoned('2026-11-14'), zoned('2026-11-15'))).toBe('2026-11-14');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(delta(110, 100)).toBeCloseTo(0.1);
    expect(delta(5, 0)).toBeNull();
  });
});
