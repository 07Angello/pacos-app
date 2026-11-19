import { elapsedLabel, hhmmLabel, minutesSince, restaurantWeekday, shortNumber } from './time';

describe('time helpers', () => {
  it('calcula minutos transcurridos', () => {
    expect(minutesSince('2026-11-13T10:00:00Z', Date.parse('2026-11-13T10:07:30Z'))).toBe(7);
    expect(elapsedLabel(0)).toBe('ahora');
    expect(elapsedLabel(75)).toBe('1 h 15 min');
  });

  it('acorta el número de pedido', () => {
    expect(shortNumber('R-001248')).toBe('1248');
    // 8 dígitos (desde la migración 15) y números viejos de 6 conviven sin problema
    expect(shortNumber('R-00001424')).toBe('1424');
    expect(shortNumber('R-12345678')).toBe('12345678');
    expect(shortNumber('R-100000000')).toBe('100000000');
  });

  it('horario: etiqueta 12 h y día local del restaurante', () => {
    expect(hhmmLabel('23:00')).toBe('11:00 p. m.');
    expect(hhmmLabel('00:30')).toBe('12:30 a. m.');
    expect(hhmmLabel('12:00')).toBe('12:00 p. m.');
    expect(hhmmLabel(null)).toBe('—');
    // dom 15 nov 03:00 UTC = sáb 14 nov 9:00 p. m. en Honduras (UTC sería domingo = 0)
    expect(restaurantWeekday(new Date('2026-11-15T03:00:00Z'))).toBe(6);
  });
});
