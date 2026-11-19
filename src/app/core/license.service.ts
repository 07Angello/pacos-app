import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { STAFF_BACKEND } from './backend/backend';
import { licenseRejected } from './license-signal';

export interface LicenseStatus {
  status: 'ACTIVE' | 'INACTIVE';
  trial: boolean;
  expiresAt: string | null;
  webBlocked: boolean;
  appBlocked: boolean;
  message: string;
  serverTime: string;
}

/**
 * Licencia del sistema. Si la app del personal está bloqueada se muestra la pantalla de bloqueo y no
 * se carga nada más. El servidor también rechaza toda llamada (LICENSE_INACTIVE), así que
 * esto es solo la cara visible del bloqueo. Se actualiza en tiempo real.
 */
@Injectable({ providedIn: 'root' })
export class LicenseService {
  private readonly backend = inject(STAFF_BACKEND);
  readonly state = signal<LicenseStatus | null>(null);
  readonly ready = signal(false);
  readonly blocked = computed(() => !!this.state()?.appBlocked || licenseRejected() !== null);
  readonly message = computed(() => this.state()?.message ?? licenseRejected() ?? '');
  /** Días que quedan del periodo de prueba (null si es licencia completa). */
  readonly trialDaysLeft = computed(() => {
    const s = this.state();
    if (!s?.trial || !s.expiresAt || s.status !== 'ACTIVE') return null;
    return Math.max(0, Math.ceil((Date.parse(s.expiresAt) - Date.parse(s.serverTime)) / 86_400_000));
  });
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private started = false;

  constructor() {
    // Si una llamada fue rechazada por licencia, confirmar el estado.
    effect(() => {
      if (licenseRejected() !== null) void this.refresh();
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.refresh();
    this.backend.watchLicense(() => void this.refresh());
  }

  async refresh(): Promise<void> {
    try {
      const s = await this.backend.rpc<LicenseStatus>('get_license_status');
      this.state.set(s);
      if (!s.appBlocked) licenseRejected.set(null);
      this.scheduleExpiry(s);
    } catch {
      /* sin red: se mantiene el último estado conocido */
    } finally {
      this.ready.set(true);
    }
  }

  /** Bloquear justo al vencer la prueba, aunque el aviso en tiempo real tarde. */
  private scheduleExpiry(s: LicenseStatus): void {
    clearTimeout(this.expiryTimer);
    if (s.status !== 'ACTIVE' || !s.expiresAt) return;
    const ms = Date.parse(s.expiresAt) - Date.parse(s.serverTime) + 1000;
    if (ms > 0 && ms < 2 ** 31 - 1) this.expiryTimer = setTimeout(() => void this.refresh(), ms);
  }
}
