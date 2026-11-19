import { Provider } from '@angular/core';
import { environment } from '../../../environments/environment';
import { STAFF_BACKEND } from './backend';
import { SupabaseStaffBackend } from './supabase-backend';

export function provideStaffBackend(): Provider {
  return {
    provide: STAFF_BACKEND,
    useFactory: () => new SupabaseStaffBackend(environment.supabase.url, environment.supabase.anonKey),
  };
}
