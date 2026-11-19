import { inject, Injectable } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ToastController } from '@ionic/angular';
import { PreferencesService } from './preferences.service';

/**
 * Alertas en primer plano: sonido + vibración + aviso visual (§14: sonido siempre con señal visual).
 * Push en segundo plano (FCM) se agrega en la fase 5; ver README.
 */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly toasts = inject(ToastController);
  private readonly prefs = inject(PreferencesService);
  private audio?: AudioContext;

  async alert(message: string, duration = 5000): Promise<void> {
    const p = this.prefs.prefs();
    if (p.sound) this.chime();
    if (p.vibration) void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => navigator.vibrate?.([120, 60, 120]));
    await this.toast(message, 'alert', duration);
  }

  async toast(message: string, kind: 'info' | 'success' | 'error' | 'alert' = 'info', duration = 3000): Promise<void> {
    const t = await this.toasts.create({
      message,
      duration,
      position: 'top',
      cssClass: `pacos-toast pacos-toast--${kind}`,
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await t.present();
  }

  /** Tono de dos notas generado con WebAudio (no requiere archivos). */
  private chime(): void {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      void ctx.resume();
      [880, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = ctx.currentTime + i * 0.18;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.42);
      });
    } catch {
      /* audio no disponible */
    }
  }
}
