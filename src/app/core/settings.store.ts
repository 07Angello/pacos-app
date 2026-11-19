import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { STAFF_BACKEND } from './backend/backend';
import { BusinessHour, StaffSettings } from './models';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly backend = inject(STAFF_BACKEND);
  private readonly auth = inject(AuthService);

  readonly settings = signal<StaffSettings | null>(null);

  async load(): Promise<void> {
    try {
      this.settings.set(await this.backend.rpc<StaffSettings>('get_settings'));
    } catch (e) {
      this.auth.handleAuthError(e);
    }
  }

  async update(patch: Partial<StaffSettings>): Promise<void> {
    this.settings.set(await this.backend.rpc<StaffSettings>('update_settings', patch));
  }

  async updateHours(hours: Omit<BusinessHour, 'label'>[]): Promise<void> {
    this.settings.set(await this.backend.rpc<StaffSettings>('update_business_hours', { hours }));
  }

  delayMinutes(): number {
    return this.settings()?.kitchenDelayMinutes ?? 15;
  }
}
