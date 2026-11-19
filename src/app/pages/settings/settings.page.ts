import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AlertController, IonContent, IonHeader, IonToggle, IonToolbar, ModalController } from '@ionic/angular';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { version as projectVersion } from '../../../../package.json';
import { AuthService } from '../../core/auth.service';
import { STAFF_BACKEND } from '../../core/backend/backend';
import { ApiError, Employee, StaffSettings } from '../../core/models';
import { LicenseService } from '../../core/license.service';
import { NotifyService } from '../../core/notify.service';
import { ROLE_LABEL } from '../../core/order-status';
import { PreferencesService } from '../../core/preferences.service';
import { PushService } from '../../core/push.service';
import { SettingsStore } from '../../core/settings.store';
import { MoneyPipe } from '../../shared/money.pipe';
import { hhmmLabel, restaurantWeekday } from '../../core/time';
import { EmployeeEditorComponent } from './employee-editor.component';
import { HoursEditorComponent } from './hours-editor.component';

type NumberKey = 'deliveryFee' | 'estimatedPrepMinutes' | 'kitchenDelayMinutes';

/** Perfil, preferencias del dispositivo, configuración del restaurante (admin) y empleados (admin). */
@Component({
  selector: 'app-settings',
  imports: [IonHeader, IonToolbar, IonContent, IonToggle, MoneyPipe, DatePipe],
  template: `
    <ion-header class="app-header">
      <ion-toolbar>
        <div class="app-header__row">
          <div class="app-header__title">
            <span class="brand-mark"><i class="fa-solid fa-gear"></i></span>
            <div><h1>Ajustes</h1><p>Perfil, alertas y restaurante</p></div>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="page">
      <div class="page__inner page__inner--narrow">
        @if (auth.user(); as u) {
          <section class="profile">
            <span class="profile__avatar">{{ initials() }}</span>
            <div class="profile__info">
              <strong>{{ u.fullName }}</strong>
              <span>{{ u.email }}</span>
              <span class="tag" [class]="'tag tag--' + u.role.toLowerCase()">{{ roleLabel[u.role] }}</span>
            </div>
          </section>
        }

        <section class="card-block">
          <h2 class="card-block__title"><i class="fa-solid fa-bell"></i> Alertas en este dispositivo</h2>
          <div class="setting">
            <div><strong>Sonido</strong><span>Tono al llegar pedidos nuevos</span></div>
            <ion-toggle [checked]="prefs.prefs().sound" (ionChange)="prefs.set('sound', $event.detail.checked)" aria-label="Sonido" />
          </div>
          <div class="setting">
            <div><strong>Vibración</strong><span>Vibrar con cada aviso</span></div>
            <ion-toggle [checked]="prefs.prefs().vibration" (ionChange)="prefs.set('vibration', $event.detail.checked)" aria-label="Vibración" />
          </div>
          <div class="setting">
            <div><strong>Pantalla siempre encendida</strong><span>Útil en el dispositivo de cocina</span></div>
            <ion-toggle [checked]="prefs.prefs().keepAwake" (ionChange)="prefs.set('keepAwake', $event.detail.checked)" aria-label="Pantalla siempre encendida" />
          </div>
        </section>

        @if (canManage() && store.settings(); as s) {
          <section class="card-block">
            <h2 class="card-block__title"><i class="fa-solid fa-store"></i> Restaurante</h2>
            <div class="setting">
              <div><strong>Recibir pedidos en línea</strong><span>{{ s.isOpen ? 'Abierto' : 'Pausado' }}{{ autoClose() }}</span></div>
              <ion-toggle [checked]="s.isOpen" (ionChange)="patch({ isOpen: $event.detail.checked })" aria-label="Recibir pedidos" />
            </div>
            @if (isAdmin()) {
              <div class="setting">
                <div><strong>Recoger en local</strong><span>Modalidad disponible en la web</span></div>
                <ion-toggle [checked]="s.pickupEnabled" (ionChange)="patch({ pickupEnabled: $event.detail.checked })" aria-label="Recoger en local" />
              </div>
              <div class="setting">
                <div><strong>Entrega a domicilio</strong><span>Modalidad disponible en la web</span></div>
                <ion-toggle [checked]="s.deliveryEnabled" (ionChange)="patch({ deliveryEnabled: $event.detail.checked })" aria-label="Entrega a domicilio" />
              </div>
              <button type="button" class="setting setting--button" (click)="openHours()">
                <div><strong>Horario de atención</strong><span>{{ todayHours() }} · toca para cambiarlo por día</span></div>
                <span class="setting__value"><i class="fa-regular fa-clock"></i> <i class="fa-solid fa-chevron-right"></i></span>
              </button>
              <button type="button" class="setting setting--button" (click)="editNumber('deliveryFee', 'Tarifa de envío (L)', s)">
                <div><strong>Tarifa de envío</strong><span>Se suma al total en la web</span></div>
                <span class="setting__value">{{ s.deliveryFee | money }} <i class="fa-solid fa-pen"></i></span>
              </button>
              <button type="button" class="setting setting--button" (click)="editNumber('estimatedPrepMinutes', 'Tiempo estimado (min)', s)">
                <div><strong>Tiempo estimado</strong><span>Se muestra al cliente</span></div>
                <span class="setting__value">{{ s.estimatedPrepMinutes ?? '—' }} min <i class="fa-solid fa-pen"></i></span>
              </button>
              <button type="button" class="setting setting--button" (click)="editNumber('kitchenDelayMinutes', 'Umbral de demora (min)', s)">
                <div><strong>Alerta de demora en cocina</strong><span>Resalta pedidos que superan este tiempo</span></div>
                <span class="setting__value">{{ s.kitchenDelayMinutes }} min <i class="fa-solid fa-pen"></i></span>
              </button>
            } @else {
              <p class="footnote">Solo el administrador puede cambiar modalidades, tarifas y tiempos.</p>
            }
          </section>
        }

        @if (isAdmin()) {
          <section class="card-block">
            <h2 class="card-block__title"><i class="fa-solid fa-chart-line"></i> Negocio</h2>
            <button type="button" class="setting setting--button" (click)="openReports()">
              <div><strong>Reportes de ventas</strong><span>Cierre de caja, productos más vendidos, horas pico · Excel y PDF</span></div>
              <span class="setting__value"><i class="fa-solid fa-chevron-right"></i></span>
            </button>
            <button type="button" class="setting setting--button" (click)="openVisitors()">
              <div><strong>Clientes en la web</strong><span>Cuántos hay ahora en vivo, visitas diarias y cuántos terminan comprando</span></div>
              <span class="setting__value"><i class="fa-solid fa-chevron-right"></i></span>
            </button>
          </section>

          <section class="card-block">
            <div class="emp-head">
              <h2 class="card-block__title"><i class="fa-solid fa-users"></i> Empleados <span class="emp-head__count">{{ activeCount() }} activos</span></h2>
              <button type="button" class="btn btn--primary emp-head__add" (click)="openEmployee()"><i class="fa-solid fa-user-plus"></i> Agregar</button>
            </div>
            @for (e of employees(); track e.id) {
              <div class="setting emp-row" [class.emp-row--off]="!e.isActive">
                <button type="button" class="emp-row__main" (click)="openEmployee(e)" [attr.aria-label]="'Editar ' + e.fullName">
                  <span class="emp-row__avatar" [class]="'emp-row__avatar emp-row__avatar--' + e.role.toLowerCase()">{{ initialsOf(e.fullName) }}</span>
                  <span class="emp-row__text">
                    <strong>{{ e.fullName }} @if (e.id === auth.user()?.id) { <em class="emp-row__you">tú</em> }</strong>
                    <span>{{ roleLabel[e.role] }} · {{ e.email }}</span>
                    <span class="emp-row__meta">
                      @if (!e.isActive) { Desactivado · }
                      {{ e.lastSignInAt ? 'Último acceso ' + (e.lastSignInAt | date: "d MMM, h:mm a") : 'Aún no ha entrado' }}
                    </span>
                  </span>
                  <i class="fa-solid fa-chevron-right emp-row__chev"></i>
                </button>
                <ion-toggle [checked]="e.isActive" [disabled]="e.id === auth.user()?.id" (ionChange)="setActive(e, $event.detail.checked)" [attr.aria-label]="'Activo: ' + e.fullName" />
              </div>
            } @empty {
              <p class="footnote">Cargando…</p>
            }
            <p class="footnote"><i class="fa-solid fa-circle-info"></i> Toca un empleado para editar su rol o restablecer su contraseña. Un empleado desactivado pierde acceso de inmediato.</p>
          </section>
        }

        <section class="card-block">
          <h2 class="card-block__title"><i class="fa-solid fa-circle-info"></i> Sistema</h2>
          @if (isAdmin() && license.state(); as l) {
            <div class="setting">
              <div>
                <strong>Licencia</strong>
                <span>{{ l.trial ? 'Periodo de prueba hasta el ' + (l.expiresAt | date: "d 'de' MMMM y, h:mm a") + ' (' + license.trialDaysLeft() + ' días)' : 'Activa, sin vencimiento' }}</span>
              </div>
              <i class="fa-solid" [class]="l.trial ? 'fa-hourglass-half' : 'fa-circle-check push-ok'" aria-hidden="true"></i>
            </div>
          }
          <div class="setting"><div><strong>Versión de la app</strong><span>{{ appVersion() }}</span></div><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i></div>
          <div class="setting">
            <div>
              <strong>Notificaciones con la app cerrada</strong>
              <span>{{ pushText() }}</span>
            </div>
            @if (push.status() === 'denied' || push.status() === 'error') {
              <button type="button" class="btn btn--ghost" (click)="push.retry()"><i class="fa-solid fa-rotate"></i> Reintentar</button>
            } @else if (push.status() === 'granted') {
              <i class="fa-solid fa-circle-check push-ok" aria-hidden="true"></i>
            }
          </div>
          @if (push.status() !== 'unsupported') {
            <p class="footnote"><i class="fa-solid fa-battery-half"></i> Si los avisos llegan tarde: Ajustes del teléfono → Apps → Paco's Staff → Batería → <strong>Sin restricciones</strong>. En Xiaomi activa también "Inicio automático".</p>
          }
        </section>

        <button type="button" class="btn btn--danger-ghost btn--block btn--lg" (click)="logout()"><i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión</button>
      </div>
    </ion-content>
  `,
})
export class SettingsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly prefs = inject(PreferencesService);
  protected readonly store = inject(SettingsStore);
  private readonly backend = inject(STAFF_BACKEND);
  private readonly notify = inject(NotifyService);
  private readonly alerts = inject(AlertController);
  private readonly modals = inject(ModalController);
  private readonly router = inject(Router);
  protected readonly push = inject(PushService);
  protected readonly license = inject(LicenseService);
  protected readonly pushText = computed(() => ({
    unsupported: 'Solo en la app instalada en el teléfono. En el navegador, mantén esta pestaña abierta.',
    prompt: 'Activando…',
    granted: 'Activadas: te avisaremos aunque el teléfono esté bloqueado.',
    denied: 'Permiso denegado. Actívalo en Ajustes del teléfono → Apps → Paco\'s Staff → Notificaciones.',
    error: 'No se pudo registrar este teléfono. Revisa tu conexión.',
  })[this.push.status()]);

  protected readonly roleLabel = ROLE_LABEL;
  protected readonly employees = signal<Employee[]>([]);
  protected readonly isAdmin = computed(() => this.auth.role() === 'ADMIN');
  protected readonly activeCount = computed(() => this.employees().filter((e) => e.isActive).length);
  protected readonly canManage = computed(() => this.auth.hasRole('ADMIN', 'MANAGER'));
  protected readonly initials = computed(() =>
    (this.auth.user()?.fullName ?? '').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
  );
  protected readonly todayHours = computed(() => {
    const h = this.store.settings()?.businessHours.find((b) => b.weekday === restaurantWeekday());
    if (!h) return 'Sin horario para hoy';
    return h.isClosed ? 'Hoy: cerrado' : `Hoy ${hhmmLabel(h.opensAt)} – ${hhmmLabel(h.closesAt)}`;
  });
  /** " · se apaga solo a las 10:00 p. m." según el horario de hoy. */
  protected readonly autoClose = computed(() => {
    const s = this.store.settings();
    const h = s?.businessHours.find((b) => b.weekday === restaurantWeekday());
    if (!s?.isOpen || !h || h.isClosed || !h.closesAt) return '';
    return ` · se apaga solo a las ${hhmmLabel(h.closesAt)}`;
  });
  /** Versión instalada (en el teléfono se lee del APK; si no, la del proyecto). */
  protected readonly appVersion = signal(projectVersion);

  ngOnInit(): void {
    if (Capacitor.isNativePlatform()) {
      void App.getInfo().then((i) => this.appVersion.set(i.version)).catch(() => undefined);
    }
    if (!this.store.settings()) void this.store.load();
    if (this.isAdmin()) void this.loadEmployees();
  }

  protected async patch(p: Partial<StaffSettings>): Promise<void> {
    const s = this.store.settings();
    if (s && Object.entries(p).every(([k, v]) => s[k as keyof StaffSettings] === v)) return;
    try {
      await this.store.update(p);
      void this.notify.toast('Ajuste guardado', 'success', 1500);
    } catch (e) {
      void this.notify.toast(e instanceof ApiError ? e.message : 'No se pudo guardar.', 'error');
      await this.store.load();
    }
  }

  protected async editNumber(key: NumberKey, label: string, s: StaffSettings): Promise<void> {
    const alert = await this.alerts.create({
      header: label,
      inputs: [{ name: 'value', type: 'number', value: s[key] ?? '', min: 0, attributes: { inputmode: 'decimal' } }],
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Guardar', role: 'confirm' }],
    });
    await alert.present();
    const res = await alert.onDidDismiss<{ values: { value: string } }>();
    if (res.role !== 'confirm') return;
    const value = Number(res.data?.values.value);
    if (!Number.isFinite(value) || value < 0) {
      void this.notify.toast('Valor inválido', 'error');
      return;
    }
    await this.patch({ [key]: value });
  }

  private async loadEmployees(): Promise<void> {
    try {
      this.employees.set(await this.backend.rpc<Employee[]>('list_employees'));
    } catch (e) {
      this.auth.handleAuthError(e);
    }
  }

  protected async openHours(): Promise<void> {
    const m = await this.modals.create({ component: HoursEditorComponent, cssClass: 'editor-modal' });
    await m.present();
  }

  protected openReports(): void {
    void this.router.navigateByUrl('/tabs/reportes');
  }

  protected openVisitors(): void {
    void this.router.navigateByUrl('/tabs/clientes-web');
  }

  protected initialsOf(name: string): string {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  /** Alta (sin empleado) o edición. Al guardar se recarga la lista. */
  protected async openEmployee(employee?: Employee): Promise<void> {
    const m = await this.modals.create({
      component: EmployeeEditorComponent,
      componentProps: { employee, selfId: this.auth.user()?.id },
      cssClass: 'editor-modal',
    });
    await m.present();
    const { role } = await m.onDidDismiss();
    if (role === 'saved') await this.loadEmployees();
  }

  protected async setActive(e: Employee, isActive: boolean): Promise<void> {
    if (e.isActive === isActive) return;
    try {
      const updated = await this.backend.rpc<Employee>('set_employee_active', { user_id: e.id, is_active: isActive });
      this.employees.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      void this.notify.toast(`${e.fullName} ${isActive ? 'activado' : 'desactivado'}`, 'success', 1500);
    } catch (err) {
      void this.notify.toast(err instanceof ApiError ? err.message : 'No se pudo guardar.', 'error');
      await this.loadEmployees();
    }
  }

  protected async logout(): Promise<void> {
    const alert = await this.alerts.create({
      header: '¿Cerrar sesión?',
      message: 'Dejarás de recibir avisos de pedidos en este dispositivo.',
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Cerrar sesión', role: 'confirm' }],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'confirm') await this.auth.signOut();
  }
}
