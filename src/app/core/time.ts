/** Minutos transcurridos entre una fecha ISO y `now` (ms). */
export function minutesSince(iso: string | null | undefined, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
}

export function elapsedLabel(min: number): string {
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

export function shortNumber(orderNumber: string): string {
  return orderNumber.replace(/^R-0*/, '');
}

const RESTAURANT_TZ = 'America/Tegucigalpa';

function ymd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RESTAURANT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "4:00 p. m." en la hora del restaurante. */
export function clockLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-HN', { timeZone: RESTAURANT_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

/** "hoy 4:00 p. m.", "mañana 4:00 p. m." o "sáb 15, 4:00 p. m.". */
export function dayClockLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const day = ymd(d);
  if (day === ymd(new Date(now))) return `hoy ${clockLabel(iso)}`;
  if (day === ymd(new Date(now + 86_400_000))) return `mañana ${clockLabel(iso)}`;
  const wd = new Intl.DateTimeFormat('es-HN', { timeZone: RESTAURANT_TZ, weekday: 'short', day: 'numeric' }).format(d);
  return `${wd}, ${clockLabel(iso)}`;
}

/** '23:00' → '11:00 p. m.' (hora de pared, sin zona). */
export function hhmmLabel(hhmm: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return '—';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Día de la semana en el restaurante: 0 = domingo … 6 = sábado. */
export function restaurantWeekday(now = new Date()): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: RESTAURANT_TZ, weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}
