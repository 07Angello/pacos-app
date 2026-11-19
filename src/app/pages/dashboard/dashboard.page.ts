import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonRefresher, IonRefresherContent, IonToggle, IonToolbar } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { ApiError } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { OrdersStore } from '../../core/orders.store';
import { SettingsStore } from '../../core/settings.store';
import { StaffOrder } from '../../core/models';
import { clockLabel, dayClockLabel, minutesSince, shortNumber } from '../../core/time';
import { ConnectionPillComponent } from '../../shared/connection-pill';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatusChipComponent } from '../../shared/status-chip';

@Component({
  selector: 'app-dashboard',
  imports: [IonHeader, IonToolbar, IonContent, IonToggle, IonRefresher, IonRefresherContent, DatePipe, MoneyPipe, ConnectionPillComponent, StatusChipComponent],
  template: `
    <ion-header class="app-header">
      <ion-toolbar>
        <div class="app-header__row">
          <div class="app-header__title">
            <span class="brand-mark"><i class="fa-solid fa-burger"></i></span>
            <div>
              <h1>Hola, {{ firstName() }}</h1>
              <p>{{ store.now() | date: "EEEE d 'de' MMMM" }}</p>
            </div>
          </div>
          <app-connection-pill />
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="page">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="page__inner">
        @if (settings.settings(); as s) {
          <section class="open-card" [class.open-card--closed]="!s.isOpen">
            <span class="open-card__icon"><i class="fa-solid" [class]="s.isOpen ? 'fa-store' : 'fa-store-slash'"></i></span>
            <div class="open-card__text">
              <strong>{{ s.isOpen ? 'Recibiendo pedidos' : 'Pedidos en línea pausados' }}</strong>
              <span>{{ s.isOpen ? 'La web acepta pedidos nuevos.' : 'Los clientes ven el menú pero no pueden confirmar.' }}</span>
            </div>
            <ion-toggle [checked]="s.isOpen" (ionChange)="toggleOpen($event.detail.checked)" aria-label="Recibir pedidos en línea" />
          </section>
        }

        @if (store.pending().length) {
          <button type="button" class="alert-card" (click)="go('/tabs/pedidos')">
            <span class="alert-card__icon"><i class="fa-solid fa-bell fa-shake"></i></span>
            <span class="alert-card__text">
              <strong>{{ store.pending().length }} {{ store.pending().length === 1 ? 'pedido nuevo' : 'pedidos nuevos' }} por aprobar</strong>
              <span>El más antiguo espera hace {{ oldestPending() }} min</span>
            </span>
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        }


        <button type="button" class="report-link report-link--new" (click)="go('/tabs/nuevo-pedido')">
          <span class="report-link__icon"><i class="fa-solid fa-plus"></i></span>
          <span class="report-link__text"><strong>Nuevo pedido en el local</strong><span>Para llevar o para comer aquí · entra directo a cocina</span></span>
          <i class="fa-solid fa-chevron-right"></i>
        </button>

        <section class="kpis" aria-label="Resumen">
          <button type="button" class="kpi kpi--pending" (click)="go('/tabs/pedidos')">
            <i class="fa-solid fa-bell"></i><strong>{{ store.pending().length }}</strong><span>Nuevos</span>
          </button>
          <button type="button" class="kpi kpi--kitchen" (click)="go('/tabs/cocina')">
            <i class="fa-solid fa-fire-burner"></i><strong>{{ store.waiting().length + store.preparing().length }}</strong><span>En cocina</span>
          </button>
          <button type="button" class="kpi kpi--ready" (click)="go('/tabs/cocina')">
            <i class="fa-solid fa-bell-concierge"></i><strong>{{ store.ready().length + store.onTheWay().length }}</strong><span>Por entregar</span>
          </button>
          <div class="kpi kpi--done">
            <i class="fa-solid fa-flag-checkered"></i><strong>{{ completedToday().length }}</strong><span>Entregados hoy</span>
          </div>
          <div class="kpi kpi--money">
            <i class="fa-solid fa-sack-dollar"></i><strong>{{ salesToday() | money }}</strong><span>Ventas entregadas hoy</span>
          </div>
          <div class="kpi kpi--time">
            <i class="fa-solid fa-stopwatch"></i><strong>{{ avgPrep() !== null ? avgPrep() + ' min' : '—' }}</strong><span>Prep. promedio</span>
          </div>
        </section>

        @if (isAdmin()) {
          <button type="button" class="report-link" (click)="go('/tabs/reportes')">
            <span class="report-link__icon"><i class="fa-solid fa-chart-line"></i></span>
            <span class="report-link__text"><strong>Reportes de ventas</strong><span>Cierre de caja, productos, horas pico · Excel y PDF</span></span>
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        }

        @if (store.scheduled().length) {
          <section class="card-block">
            <header class="card-block__head">
              <h2><i class="fa-solid fa-calendar-check"></i> Programados para recoger</h2>
            </header>
            <ul class="activity">
              @for (o of store.scheduled(); track o.id) {
                <li>
                  <span class="activity__num">#{{ num(o.orderNumber) }}</span>
                  <span class="activity__name">
                    {{ o.customerName }}
                    <small class="activity__hint" [class.activity__hint--due]="due(o)">
                      @if (o.status === 'PREPARING') { En preparación }
                      @else if (due(o)) { <i class="fa-solid fa-bell"></i> ¡Hora de preparar{{ o.status === 'PENDING' ? ' · sin aceptar' : '' }}! }
                      @else if (o.reminderAt) { Aviso {{ clock(o.reminderAt) }}{{ o.status === 'PENDING' ? ' · sin aceptar' : '' }} }
                    </small>
                  </span>
                  <span class="sched-badge" [class.sched-badge--due]="due(o)">{{ dayClock(o.scheduledFor!) }}</span>
                </li>
              }
            </ul>
          </section>
        }

        <section class="card-block">
          <header class="card-block__head">
            <h2><i class="fa-solid fa-clock-rotate-left"></i> Actividad reciente</h2>
            <button type="button" class="link" (click)="go('/tabs/pedidos')">Ver todo</button>
          </header>
          <ul class="activity">
            @for (o of recent(); track o.id) {
              <li>
                <span class="activity__num">#{{ num(o.orderNumber) }}</span>
                <span class="activity__name">{{ o.customerName }}</span>
                <app-status-chip [status]="o.status" [type]="o.orderType" />
                <span class="activity__total">{{ o.total | money }}</span>
              </li>
            } @empty {
              <li class="activity__empty">Sin actividad todavía.</li>
            }
          </ul>
        </section>
      </div>
    </ion-content>
  `,
})
export class DashboardPage {
  protected readonly store = inject(OrdersStore);
  protected readonly settings = inject(SettingsStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');
  protected readonly isAdmin = computed(() => this.auth.role() === 'ADMIN');

  private readonly today = computed(() => new Date(this.store.now()).toDateString());
  protected readonly completedToday = computed(() =>
    this.store.closed().filter((o) => o.status === 'COMPLETED' && o.completedAt && new Date(o.completedAt).toDateString() === this.today()),
  );
  protected readonly salesToday = computed(() => this.completedToday().reduce((s, o) => s + (o.total ?? 0), 0));
  /** Igual que el servidor: en programados cuenta desde que se empezó a preparar. */
  protected readonly avgPrep = computed(() => {
    const done = this.store.all().filter((o) => o.acceptedAt && o.readyAt);
    if (!done.length) return null;
    const from = (o: StaffOrder) => Date.parse((o.scheduledFor ? (o.startedAt ?? o.acceptedAt) : o.acceptedAt)!);
    const total = done.reduce((s, o) => s + (Date.parse(o.readyAt!) - from(o)), 0);
    return Math.round(total / done.length / 60000);
  });
  protected readonly oldestPending = computed(() => minutesSince(this.store.pending()[0]?.createdAt, this.store.now()));
  protected readonly recent = computed(() =>
    [...this.store.all()].sort((a, b) => (lastChange(b) > lastChange(a) ? 1 : -1)).slice(0, 8),
  );

  protected readonly clock = clockLabel;
  protected dayClock(iso: string): string {
    return dayClockLabel(iso, this.store.now());
  }
  protected due(o: StaffOrder): boolean {
    return !!o.reminderAt && o.status !== 'PREPARING' && this.store.now() >= Date.parse(o.reminderAt);
  }

  protected num(n: string): string {
    return shortNumber(n);
  }

  protected go(url: string): void {
    void this.router.navigateByUrl(url);
  }

  protected async toggleOpen(isOpen: boolean): Promise<void> {
    try {
      await this.settings.update({ isOpen });
      void this.notify.toast(isOpen ? 'La web vuelve a recibir pedidos' : 'Pedidos en línea pausados', 'success', 2000);
    } catch (e) {
      void this.notify.toast(e instanceof ApiError ? e.message : 'No se pudo cambiar.', 'error');
      await this.settings.load();
    }
  }

  protected async refresh(ev: CustomEvent): Promise<void> {
    await Promise.all([this.store.reload(), this.settings.load()]);
    (ev.target as HTMLIonRefresherElement).complete();
  }
}

function lastChange(o: { createdAt: string; history?: { createdAt: string }[] }): string {
  return o.history?.at(-1)?.createdAt ?? o.createdAt;
}
