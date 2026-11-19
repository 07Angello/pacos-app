// Clientes en la web: contador en vivo (Realtime Presence) e historial (RPC report_web_visits).

export type VisitorStage = 'MENU' | 'CART' | 'CHECKOUT' | 'TRACKING';
export type VisitorDevice = 'MOBILE' | 'DESKTOP';

export interface LiveVisitors {
  total: number;
  byStage: Record<VisitorStage, number>;
  mobile: number;
  desktop: number;
}

/** Estado crudo de Presence: clave (id del dispositivo) → una entrada por pestaña/conexión. */
export type PresenceState = Record<string, readonly { stage?: unknown; device?: unknown }[]>;

const STAGES: readonly VisitorStage[] = ['MENU', 'TRACKING', 'CART', 'CHECKOUT'];
/** Si un mismo cliente tiene varias pestañas, cuenta el paso más avanzado. */
const RANK: Record<VisitorStage, number> = { MENU: 0, TRACKING: 1, CART: 2, CHECKOUT: 3 };

export const EMPTY_LIVE: LiveVisitors = { total: 0, byStage: { MENU: 0, CART: 0, CHECKOUT: 0, TRACKING: 0 }, mobile: 0, desktop: 0 };

/**
 * Cuenta SIEMPRE desde la foto completa del estado (nunca sumando/restando eventos de
 * entrada y salida), así un evento perdido o repetido no descuadra el número.
 * Un dispositivo = una persona, aunque tenga varias pestañas abiertas.
 */
export function summarizePresence(state: PresenceState): LiveVisitors {
  const out: LiveVisitors = { total: 0, byStage: { MENU: 0, CART: 0, CHECKOUT: 0, TRACKING: 0 }, mobile: 0, desktop: 0 };
  for (const metas of Object.values(state)) {
    const valid = (metas ?? []).filter((m) => STAGES.includes(m?.stage as VisitorStage));
    if (!valid.length) continue;
    const stage = valid.map((m) => m.stage as VisitorStage).reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    out.total++;
    out.byStage[stage]++;
    if (valid.some((m) => m.device === 'DESKTOP')) out.desktop++;
    else out.mobile++;
  }
  return out;
}

export interface VisitsSummary {
  visits: number;
  visitors: number;
  cart: number;
  checkout: number;
  buyers: number;
  orders: number;
  sales: number;
  mobile: number;
  desktop: number;
  returning: number;
  webOrders: number;
}

export interface VisitsReport {
  range: { from: string; to: string; timezone: string; generatedAt: string };
  summary: VisitsSummary;
  previous: VisitsSummary;
  byDay: { date: string; visitors: number; buyers: number }[];
  byHour: { hour: number; visitors: number }[];
}
