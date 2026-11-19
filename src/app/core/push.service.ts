import { inject, Injectable, NgZone, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { STAFF_BACKEND } from './backend/backend';

export type PushStatus = 'unsupported' | 'prompt' | 'denied' | 'granted' | 'error';

/** Canal de Android para pedidos: alta prioridad (suena y aparece sobre otras apps / pantalla bloqueada). */
const CHANNEL_ID = 'pedidos';
const TOKEN_KEY = 'pacos.push.token';

/**
 * Notificaciones push (FCM) para cuando la app está cerrada, en segundo plano o con la pantalla
 * apagada. Con la app abierta los avisos siguen llegando por tiempo real (OrdersStore).
 *
 * - start(): tras iniciar sesión. Crea el canal, pide permiso y registra el dispositivo
 *   (register_device_token) para que el servidor sepa a quién avisar según su rol.
 * - stop(): antes de cerrar sesión. Desvincula el dispositivo (unregister_device_token).
 * - Tocar una notificación abre el pedido.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly backend = inject(STAFF_BACKEND);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  readonly status = signal<PushStatus>(Capacitor.isNativePlatform() ? 'prompt' : 'unsupported');
  private listening = false;
  private starting?: Promise<void>;

  start(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return Promise.resolve();
    this.starting ??= this.doStart().finally(() => (this.starting = undefined));
    return this.starting;
  }

  /** Reintenta pedir permiso (p. ej. desde Ajustes). */
  async retry(): Promise<void> {
    await this.start();
  }

  async stop(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      if (token) await this.backend.rpc('unregister_device_token', { token });
    } catch {
      /* sin red: el servidor desactiva tokens inválidos al enviar */
    }
    localStorage.removeItem(TOKEN_KEY);
    await PushNotifications.removeAllDeliveredNotifications().catch(() => null);
  }

  private async doStart(): Promise<void> {
    try {
      await this.listen();
      await PushNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Pedidos',
        description: 'Pedidos nuevos, recordatorios de programados y cancelaciones',
        importance: 5, // IMPORTANCE_HIGH: sonido + aviso emergente
        visibility: 1, // visible en pantalla bloqueada
        vibration: true,
        lights: true,
        lightColor: '#E8531F',
      });

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') {
        this.status.set('denied');
        return;
      }
      await PushNotifications.register(); // → evento 'registration' con el token FCM
    } catch (e) {
      console.error('[push] no se pudo iniciar', e);
      this.status.set('error');
    }
  }

  private async listen(): Promise<void> {
    if (this.listening) return;
    this.listening = true;

    await PushNotifications.addListener('registration', ({ value: token }) => {
      void this.backend
        .rpc('register_device_token', { token, platform: Capacitor.getPlatform(), label: navigator.userAgent.slice(0, 120) })
        .then(() => {
          localStorage.setItem(TOKEN_KEY, token);
          this.status.set('granted');
        })
        .catch((e) => {
          console.error('[push] no se pudo registrar el dispositivo', e);
          this.status.set('error');
        });
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] FCM rechazó el registro', err);
      this.status.set('error');
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const data = (notification.data ?? {}) as { orderId?: string; target?: string };
      this.zone.run(() => {
        if (data.target === 'kitchen') void this.router.navigate(['/tabs/cocina']);
        else if (data.orderId) void this.router.navigate(['/tabs/pedidos'], { queryParams: { pedido: data.orderId } });
      });
    });
  }
}
