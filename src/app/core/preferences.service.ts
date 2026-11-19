import { effect, Injectable, signal } from '@angular/core';

const KEY = 'pacos.staff.prefs.v1';

interface Prefs {
  sound: boolean;
  vibration: boolean;
  keepAwake: boolean;
}

/** Preferencias del dispositivo (no se sincronizan). */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  readonly prefs = signal<Prefs>({ sound: true, vibration: true, keepAwake: false, ...this.read() });

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.prefs()));
      } catch {
        /* ignore */
      }
    });
  }

  set<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.prefs.update((p) => ({ ...p, [key]: value }));
  }

  private read(): Partial<Prefs> {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    } catch {
      return {};
    }
  }
}
