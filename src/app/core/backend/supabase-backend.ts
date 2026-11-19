import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { licenseRejected } from '../license-signal';
import { ApiError, OrderEvent, StaffUser } from '../models';
import { PresenceState } from '../visitors';
import { ConnectionState, StaffBackend, WatchHandlers } from './backend';
import { supabaseBaseUrl } from './supabase-url';

/**
 * Adaptador Supabase. Requiere aplicar las migraciones de pacos-web/supabase.
 * - Auth: email + contraseña (Supabase Auth). El rol se valida con la RPC staff_me.
 * - Datos: supabase.rpc(nombre, { params }).
 * - Tiempo real: INSERT en public.order_events (filtrado por RLS para empleados activos).
 */
export class SupabaseStaffBackend implements StaffBackend {
  private clientPromise?: Promise<SupabaseClient>;

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {
    if (!url || !anonKey) console.error("[Paco's] Falta supabase.url / supabase.anonKey en environment.");
  }

  private client(): Promise<SupabaseClient> {
    // TODO(producción): usar un storage seguro de Capacitor para la sesión (§3).
    this.clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(supabaseBaseUrl(this.url), this.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pacos.staff.auth' } }),
    );
    return this.clientPromise;
  }

  async signIn(email: string, password: string): Promise<StaffUser> {
    const client = await this.client();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      if (/fetch|network/i.test(error.message)) throw new ApiError(0, 'NETWORK', 'Sin conexión con el servidor.');
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    try {
      return await this.rpc<StaffUser>('staff_me');
    } catch (e) {
      await client.auth.signOut();
      throw e;
    }
  }

  async restore(): Promise<StaffUser | null> {
    const client = await this.client();
    const { data } = await client.auth.getSession();
    if (!data.session) return null;
    try {
      return await this.rpc<StaffUser>('staff_me');
    } catch (e) {
      if (e instanceof ApiError && e.isAuth) await client.auth.signOut();
      throw e;
    }
  }

  async signOut(): Promise<void> {
    const client = await this.client();
    await client.auth.signOut();
  }

  async rpc<T>(name: string, params: object = {}): Promise<T> {
    const client = await this.client();
    const { data, error } = await client.rpc(name, { params });
    if (error) {
      const e = toApiError(error);
      if (e.code === 'LICENSE_INACTIVE') licenseRejected.set(e.message); // el servidor bloqueó la app
      throw e;
    }
    return data as T;
  }

  watchLicense(onChange: () => void): () => void {
    let channel: RealtimeChannel | undefined;
    void this.client().then((client) => {
      channel = client.channel('license').on('postgres_changes', { event: '*', schema: 'public', table: 'app_license' }, onChange).subscribe();
    });
    const id = setInterval(onChange, 60000); // respaldo si se pierde un evento
    const onVisible = () => document.visibilityState === 'visible' && onChange();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      void channel?.unsubscribe();
    };
  }

  watchVisitors(onState: (state: PresenceState) => void, onConnection: (state: ConnectionState) => void): () => void {
    let channel: RealtimeChannel | undefined;
    let stopped = false;
    onConnection('connecting');
    void this.client().then((client) => {
      if (stopped) return;
      // El personal solo escucha (no hace track): no se cuenta como visitante.
      const ch = client.channel('web-visitors');
      ch.on('presence', { event: 'sync' }, () => onState(ch.presenceState() as PresenceState)).subscribe((status) => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          onConnection('online');
          onState(ch.presenceState() as PresenceState);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onConnection('offline');
      });
      channel = ch;
    });
    return () => {
      stopped = true;
      void channel?.unsubscribe();
    };
  }

  async invoke<T>(fn: string, body: object): Promise<T> {
    const client = await this.client();
    const { data, error } = await client.functions.invoke(fn, { body });
    if (!error) return data as T;
    // FunctionsHttpError trae la respuesta: { code, message } con el status HTTP.
    const res = (error as { context?: Response }).context;
    if (res instanceof Response) {
      const payload = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
      if (payload.code === 'LICENSE_INACTIVE') licenseRejected.set(payload.message ?? '');
      throw new ApiError(res.status, payload.code ?? 'SERVER', payload.message ?? 'No se pudo completar la acción.');
    }
    throw new ApiError(0, 'NETWORK', 'Sin conexión con el servidor.');
  }

  async uploadMenuImage(file: Blob, path: string): Promise<string> {
    const client = await this.client();
    const { error } = await client.storage.from(MENU_BUCKET).upload(path, file, { contentType: file.type, upsert: true, cacheControl: '3600' });
    if (error) {
      if (/fetch|network/i.test(error.message)) throw new ApiError(0, 'NETWORK', 'Sin conexión. No se subió la foto.');
      throw new ApiError(403, 'FORBIDDEN', 'No se pudo subir la foto. Solo el administrador puede hacerlo.');
    }
    return path;
  }

  menuImageUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^https?:\/\//.test(path)) return path;
    return `${supabaseBaseUrl(this.url)}/storage/v1/object/public/${MENU_BUCKET}/${path}`;
  }

  watch(h: WatchHandlers): () => void {
    let channel: RealtimeChannel | undefined;
    h.onConnection('connecting');
    void this.client().then((client) => {
      channel = client
        .channel('staff-orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, (payload) => {
          const row = payload.new as { order_id: string; order_number: string; status: OrderEvent['status']; event_type: string };
          h.onEvent({ type: row.event_type, orderId: row.order_id, orderNumber: row.order_number, status: row.status });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_settings' }, () => h.onSettings())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') h.onConnection('online');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') h.onConnection('offline');
        });
    });
    return () => void channel?.unsubscribe();
  }
}

const MENU_BUCKET = 'menu-images';

/** Las RPCs lanzan SQLSTATE PTxxx (=> HTTP xxx) con el código de negocio en `hint`. */
function toApiError(error: { message: string; code?: string; hint?: string | null; details?: string | null }): ApiError {
  if (!error.code && /fetch|network/i.test(error.message)) {
    return new ApiError(0, 'NETWORK', 'Sin conexión con el servidor. No se guardó ningún cambio.');
  }
  if (error.code === 'PGRST301' || error.code === '42501') return new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró.');
  const status = error.code?.startsWith('PT') ? Number(error.code.slice(2)) : 500;
  let details: unknown;
  try {
    details = error.details ? JSON.parse(error.details) : undefined;
  } catch {
    details = error.details;
  }
  return new ApiError(status, error.hint || 'ERROR', status === 500 ? 'Ocurrió un error inesperado.' : error.message, details);
}
