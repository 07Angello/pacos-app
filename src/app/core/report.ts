// Reporte de ventas (RPC report_sales, solo ADMIN). Rangos en la hora del restaurante.

export interface ReportSummary {
  orders: number;
  sales: number;
  subtotal: number;
  deliveryFees: number;
  avgTicket: number;
  itemsSold: number;
  pickupOrders: number;
  pickupSales: number;
  deliveryOrders: number;
  deliverySales: number;
  /** Comer en el local (pedidos tomados en mostrador). Pueden faltar en reportes de antes de la migración 18. */
  dineInOrders?: number;
  dineInSales?: number;
  /** Origen: en línea (web) vs. tomado en el local. */
  webOrders?: number;
  webSales?: number;
  counterOrders?: number;
  counterSales?: number;
  scheduledOrders: number;
  customers: number;
  returningCustomers: number;
  cancelledOrders: number;
  cancelledValue: number;
  rejectedOrders: number;
  rejectedValue: number;
  openOrders: number;
  openValue: number;
}

export interface SalesReport {
  range: { from: string; to: string; timezone: string; generatedAt: string; restaurant: string; currencySymbol: string };
  summary: ReportSummary;
  previous: ReportSummary;
  byPayment: { code: string; label: string; orders: number; sales: number }[];
  byDay: { date: string; orders: number; sales: number }[];
  byHour: { hour: number; orders: number; sales: number }[];
  heatmap: { weekday: number; hour: number; orders: number; sales: number }[];
  products: { name: string; category: string; quantity: number; sales: number; orders: number }[];
  categories: { name: string; quantity: number; sales: number }[];
  extras: { group: string; name: string; times: number; sales: number }[];
  losses: { type: 'CANCELLED' | 'REJECTED'; reason: string; orders: number; value: number }[];
  neighborhoods: { name: string; orders: number; sales: number }[];
}

export type RangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom';

export const TZ = 'America/Tegucigalpa';
export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** "YYYY-MM-DD" de hoy en la hora del restaurante. */
export function todayYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Desfase de la zona del restaurante para esa fecha, p. ej. "-06:00". */
function offset(ymd: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${ymd}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;
  const off = name?.replace('GMT', '') ?? '';
  return off || '+00:00';
}

/** Instante ISO de una fecha y hora locales del restaurante. */
export function zoned(ymd: string, hm = '00:00'): string {
  return new Date(`${ymd}T${hm}:00${offset(ymd)}`).toISOString();
}

/** Rango [from, to) para cada atajo. */
export function presetRange(p: Exclude<RangePreset, 'custom'>, now = new Date()): { from: string; to: string } {
  const today = todayYmd(now);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  switch (p) {
    case 'today':
      return { from: zoned(today), to: zoned(addDays(today, 1)) };
    case 'yesterday':
      return { from: zoned(addDays(today, -1)), to: zoned(today) };
    case 'week':
      return { from: zoned(addDays(today, -6)), to: zoned(addDays(today, 1)) };
    case 'month':
      return { from: zoned(firstOfMonth), to: zoned(addDays(today, 1)) };
    case 'lastMonth': {
      const [y, m] = firstOfMonth.split('-').map(Number);
      const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
      return { from: zoned(prev), to: zoned(firstOfMonth) };
    }
  }
}

/** Rango personalizado: fechas inclusivas con hora de inicio y de fin (la hora final se incluye completa). */
export function customRange(fromDate: string, fromTime: string, toDate: string, toTime: string): { from: string; to: string } {
  return { from: zoned(fromDate, fromTime || '00:00'), to: new Date(Date.parse(zoned(toDate, toTime || '23:59')) + 60_000).toISOString() };
}

const fmtDateTime = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-HN', { timeZone: TZ, ...opts }).format(new Date(iso));

/** "sáb 1 nov, 12:00 a. m. – vie 14 nov, 11:59 p. m." */
export function rangeLabel(from: string, to: string): string {
  const end = new Date(Date.parse(to) - 60_000).toISOString();
  const o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
  return `${fmtDateTime(from, o)} – ${fmtDateTime(end, o)}`;
}

/** Nombre corto para archivos: "2026-11-01_a_2026-11-14". */
export function rangeSlug(from: string, to: string): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(from));
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.parse(to) - 60_000));
  return f === t ? f : `${f}_a_${t}`;
}

export function hourLabel(h: number): string {
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

export function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-HN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Variación contra el periodo anterior (null si no hay base). */
export function delta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return (cur - prev) / prev;
}

export function pct(part: number, total: number): number {
  return total ? part / total : 0;
}
