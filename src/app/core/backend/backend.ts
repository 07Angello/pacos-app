import { InjectionToken } from '@angular/core';
import { OrderEvent, StaffUser } from '../models';
import { PresenceState } from '../visitors';

export type ConnectionState = 'connecting' | 'online' | 'offline';

export interface WatchHandlers {
  onEvent(event: OrderEvent): void;
  onConnection(state: ConnectionState): void;
  onSettings(): void;
}

/**
 * Puerto de acceso a datos del personal.
 * Implementación: SupabaseStaffBackend (Supabase Auth + supabase.rpc() + Realtime).
 */
export interface StaffBackend {
  signIn(email: string, password: string): Promise<StaffUser>;
  /** Restaura la sesión guardada y valida que el empleado siga activo. */
  restore(): Promise<StaffUser | null>;
  signOut(): Promise<void>;
  rpc<T>(name: string, params?: object): Promise<T>;
  /** Llama a una Edge Function con la sesión actual (p. ej. `admin-employees`). */
  invoke<T>(fn: string, body: object): Promise<T>;
  watch(handlers: WatchHandlers): () => void;
  /** Notifica cambios en la licencia del sistema (tabla app_license); funciona sin sesión. */
  watchLicense(onChange: () => void): () => void;
  /**
   * Clientes en la web en vivo (canal de Presence 'web-visitors'). onState recibe la foto
   * COMPLETA en cada cambio; onConnection avisa si se perdió la conexión (el número ya no es fiable).
   */
  watchVisitors(onState: (state: PresenceState) => void, onConnection: (state: ConnectionState) => void): () => void;
  /** Sube una foto del menú (solo ADMIN, por RLS de Storage) y devuelve su ruta. */
  uploadMenuImage(file: Blob, path: string): Promise<string>;
  /** URL pública de una foto del menú. */
  menuImageUrl(path: string | null | undefined): string | null;
}

export const STAFF_BACKEND = new InjectionToken<StaffBackend>('StaffBackend');
