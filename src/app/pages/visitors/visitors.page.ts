import { PercentPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonRefresher, IonRefresherContent, IonToolbar } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { ConnectionState, STAFF_BACKEND } from '../../core/backend/backend';
import { ApiError } from '../../core/models';
import { dayLabel, delta, hourLabel, pct, presetRange, RangePreset } from '../../core/report';
import { EMPTY_LIVE, LiveVisitors, summarizePresence, VisitorStage, VisitsReport } from '../../core/visitors';
import { MoneyPipe } from '../../shared/money.pipe';

type Preset = Exclude<RangePreset, 'custom'>;

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes pasado' },
];

const STAGES: { id: VisitorStage; label: string; icon: string }[] = [
  { id: 'MENU', label: 'Viendo el menú', icon: 'fa-book-open' },
  { id: 'CART', label: 'Con carrito', icon: 'fa-basket-shopping' },
  { id: 'CHECKOUT', label: 'Llenando sus datos', icon: 'fa-pen-to-square' },
  { id: 'TRACKING', label: 'Siguiendo su pedido', icon: 'fa-location-crosshairs' },
];

/**
 * Clientes en la web (solo ADMIN): cuántos hay ahora mismo y en qué paso van,
 * y el historial de visitas con su conversión a compra.
 */
@Component({
  selector: 'app-visitors',
  imports: [IonHeader, IonToolbar, IonContent, IonRefresher, IonRefresherContent, MoneyPipe, PercentPipe],
  template: `
    <ion-header class="app-header">
      <ion-toolbar>
        <div class="app-header__row">
          <div class="app-header__title">
            <button type="button" class="icon-btn" (click)="back()" aria-label="Volver"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1>Clientes en la web</h1><p>En vivo y visitas</p></div>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="page">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="page__inner rep">

        <!-- En vivo -->
        <section class="vis-live" [class.vis-live--off]="conn() !== 'online'" aria-live="polite">
          <div class="vis-live__head">
            <span class="vis-live__badge">
              @if (conn() === 'online') { <i class="vis-live__dot"></i> En vivo }
              @else if (conn() === 'connecting') { <i class="fa-solid fa-spinner fa-spin"></i> Conectando… }
              @else { <i class="fa-solid fa-wifi"></i> Reconectando… }
            </span>
            @if (conn() === 'online' && live().total) {
              <span class="vis-live__devices">
                <i class="fa-solid fa-mobile-screen"></i> {{ live().mobile }} &nbsp; <i class="fa-solid fa-desktop"></i> {{ live().desktop }}
              </span>
            }
          </div>
          <div class="vis-live__count">
            <strong>{{ conn() === 'online' ? live().total : '—' }}</strong>
            <span>{{ conn() !== 'online' ? 'Sin conexión: el número se actualiza al reconectar' : live().total === 1 ? 'persona en la web ahora' : 'personas en la web ahora' }}</span>
          </div>
          <div class="vis-live__stages">
            @for (s of stages; track s.id) {
              <div class="vis-stage" [class.vis-stage--on]="conn() === 'online' && live().byStage[s.id]">
                <i class="fa-solid" [class]="s.icon"></i>
                <strong>{{ conn() === 'online' ? live().byStage[s.id] : '—' }}</strong>
                <span>{{ s.label }}</span>
              </div>
            }
          </div>
        </section>
        <p class="footnote"><i class="fa-solid fa-user-secret"></i> Anónimo: no se guarda nombre, teléfono ni ubicación. Un celular con varias pestañas cuenta como una persona; si cierra la página o la deja en segundo plano, deja de contarse.</p>

        <!-- Historial -->
        <h2 class="vis-title"><i class="fa-solid fa-chart-simple"></i> Visitas y compras</h2>
        <div class="filters filters--inline" role="tablist" aria-label="Periodo">
          @for (p of presets; track p.id) {
            <button type="button" role="tab" class="filters__btn" [class.filters__btn--on]="preset() === p.id" [attr.aria-selected]="preset() === p.id" (click)="choose(p.id)">{{ p.label }}</button>
          }
        </div>

        @if (report(); as r) {
          @let s = r.summary;
          <section class="rep-kpis vis-kpis" aria-label="Resumen de visitas">
            @for (k of kpis(); track k.label) {
              <div class="rep-kpi" [class.rep-kpi--main]="k.main">
                <span class="rep-kpi__label">{{ k.label }}</span>
                <strong class="rep-kpi__value">{{ k.value }}</strong>
                @if (k.delta !== null) {
                  <span class="rep-kpi__delta" [class.rep-kpi__delta--up]="k.delta >= 0" [class.rep-kpi__delta--down]="k.delta < 0">
                    <i class="fa-solid" [class]="k.delta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'"></i> {{ k.delta | percent: '1.0-1' }} vs. periodo anterior
                  </span>
                } @else {
                  <span class="rep-kpi__delta">{{ k.hint }}</span>
                }
              </div>
            }
          </section>

          @if (!s.visitors) {
            <div class="empty"><i class="fa-solid fa-person-walking"></i><p>Todavía no hay visitas registradas en este periodo.</p></div>
          } @else {
            <div class="rep-cols">
              <!-- Embudo -->
              <section class="card-block rep-card">
                <h2 class="card-block__title"><i class="fa-solid fa-filter"></i> ¿Hasta dónde llegan?</h2>
                <ol class="vis-funnel">
                  @for (f of funnel(); track f.label; let i = $index) {
                    <li>
                      <div class="rep-rank__top"><strong>{{ f.label }}</strong><span>{{ f.value }} <small>· {{ f.share | percent: '1.0-0' }}</small></span></div>
                      <div class="rep-meter"><span [style.width.%]="f.share * 100"></span></div>
                      @if (i > 0 && f.lost > 0) { <small class="vis-funnel__lost">{{ f.lost }} {{ f.lost === 1 ? 'se quedó' : 'se quedaron' }} en el paso anterior</small> }
                    </li>
                  }
                </ol>
                @if (biggestDrop(); as d) {
                  <p class="footnote"><i class="fa-solid fa-lightbulb"></i> Donde más clientes se pierden es <strong>{{ d }}</strong>.</p>
                }
              </section>

              <!-- Quiénes -->
              <section class="card-block rep-card">
                <h2 class="card-block__title"><i class="fa-solid fa-users"></i> ¿Quiénes entran?</h2>
                <div class="rep-mini vis-mini">
                  <div><strong>{{ s.visitors - s.returning }}</strong><span>nuevos</span></div>
                  <div><strong>{{ s.returning }}</strong><span>ya habían entrado</span></div>
                  <div><strong>{{ share(s.returning, s.visitors) | percent: '1.0-0' }}</strong><span>regresan</span></div>
                </div>
                <div class="rep-mini vis-mini">
                  <div><strong><i class="fa-solid fa-mobile-screen"></i> {{ s.mobile }}</strong><span>desde celular · {{ share(s.mobile, s.visitors) | percent: '1.0-0' }}</span></div>
                  <div><strong><i class="fa-solid fa-desktop"></i> {{ s.desktop }}</strong><span>desde computadora</span></div>
                  <div><strong>{{ s.buyers ? (s.sales / s.buyers | money) : '—' }}</strong><span>gasto por comprador</span></div>
                </div>
                @if (s.webOrders > s.orders) {
                  <p class="footnote"><i class="fa-solid fa-circle-info"></i> {{ s.orders }} de {{ s.webOrders }} pedidos en línea del periodo se asociaron a una visita (los hechos antes de activar esta sección, o con el navegador bloqueando datos, no se pueden asociar).</p>
                }
              </section>
            </div>

            @if (r.byDay.length > 1) {
              <section class="card-block rep-card">
                <h2 class="card-block__title"><i class="fa-solid fa-chart-column"></i> Visitantes por día
                  @if (bestDay(); as b) { <small class="rep-best">Mejor día: {{ b }}</small> }</h2>
                <div class="rep-bars" [class.rep-bars--dense]="r.byDay.length > 16">
                  @for (d of r.byDay; track d.date; let i = $index) {
                    <div class="rep-bars__col" [title]="dayName(d.date) + ': ' + d.visitors + ' visitantes · ' + d.buyers + ' compraron'">
                      <span class="rep-bars__bar vis-bar" [style.height.%]="bar(d.visitors, maxDay())">
                        <span class="vis-bar__buy" [style.height.%]="d.visitors ? (d.buyers / d.visitors) * 100 : 0"></span>
                      </span>
                      <span class="rep-bars__x">{{ showTick(i, r.byDay.length) ? dayTick(d.date) : '' }}</span>
                    </div>
                  }
                </div>
                <p class="vis-legend"><i class="rep-dot vis-dot--visit"></i> Visitantes <i class="rep-dot vis-dot--buy"></i> Compraron</p>
              </section>
            }

            @if (hours().length) {
              <section class="card-block rep-card">
                <h2 class="card-block__title"><i class="fa-solid fa-clock"></i> ¿A qué hora entran?
                  <small class="rep-best">Hora más fuerte: {{ hourName(bestHour()!.hour) }}</small></h2>
                <div class="rep-bars">
                  @for (h of hours(); track h.hour) {
                    <div class="rep-bars__col" [title]="hourName(h.hour) + ': ' + h.visitors + ' visitantes'">
                      <span class="rep-bars__bar" [class.rep-bars__bar--hot]="h.hour === bestHour()!.hour" [style.height.%]="bar(h.visitors, maxHour())"></span>
                      <span class="rep-bars__x">{{ hourTick(h.hour) }}</span>
                    </div>
                  }
                </div>
                <p class="footnote">Hora en que cada cliente entró por primera vez en el día.</p>
              </section>
            }
          }
        } @else if (loading()) {
          <div class="rep-skeleton" aria-busy="true"><span></span><span></span><span></span></div>
        } @else if (error(); as e) {
          <div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>{{ e }}</p><button type="button" class="btn btn--ghost" (click)="load()">Reintentar</button></div>
        }
      </div>
    </ion-content>
  `,
})
export class VisitorsPage implements OnInit, OnDestroy {
  private readonly backend = inject(STAFF_BACKEND);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly presets = PRESETS;
  protected readonly stages = STAGES;

  protected readonly live = signal<LiveVisitors>(EMPTY_LIVE);
  protected readonly conn = signal<ConnectionState>('connecting');
  private stopLive?: () => void;

  protected readonly preset = signal<Preset>('today');
  protected readonly report = signal<VisitsReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Evita que una respuesta lenta de un periodo anterior pise la del periodo elegido. */
  private loadSeq = 0;

  protected readonly kpis = computed(() => {
    const r = this.report();
    if (!r) return [];
    const s = r.summary;
    const p = r.previous;
    const conv = pct(s.buyers, s.visitors);
    const prevConv = pct(p.buyers, p.visitors);
    const n = (v: number) => v.toLocaleString('es-HN');
    return [
      { label: 'Visitantes', value: n(s.visitors), delta: delta(s.visitors, p.visitors), main: true, hint: 'sin periodo anterior para comparar' },
      { label: 'Compraron', value: n(s.buyers), delta: delta(s.buyers, p.buyers), main: false, hint: '' },
      { label: 'Conversión', value: `${(conv * 100).toLocaleString('es-HN', { maximumFractionDigits: 1 })} %`, delta: delta(conv, prevConv), main: false, hint: 'visitantes que compraron' },
      { label: 'Ventas en línea', value: `L ${Number(s.sales).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, delta: delta(s.sales, p.sales), main: false, hint: 'de visitantes medidos' },
      { label: 'Con carrito', value: n(s.cart), delta: delta(s.cart, p.cart), main: false, hint: '' },
    ];
  });

  protected readonly funnel = computed(() => {
    const s = this.report()?.summary;
    if (!s) return [];
    const steps = [
      { label: 'Entraron a la web', value: s.visitors },
      { label: 'Agregaron al carrito', value: s.cart },
      { label: 'Llenaron sus datos', value: s.checkout },
      { label: 'Compraron', value: s.buyers },
    ];
    return steps.map((x, i) => ({ ...x, share: pct(x.value, s.visitors), lost: i ? Math.max(0, steps[i - 1].value - x.value) : 0 }));
  });

  protected readonly biggestDrop = computed(() => {
    const f = this.funnel();
    const names = ['', 'viendo el menú (no agregan nada al carrito)', 'en el carrito (no pasan a llenar sus datos)', 'llenando sus datos (no confirman el pedido)'];
    let best = 0;
    let at = 0;
    for (let i = 1; i < f.length; i++) if (f[i].lost > best) [best, at] = [f[i].lost, i];
    return at ? names[at] : null;
  });

  protected readonly maxDay = computed(() => Math.max(1, ...(this.report()?.byDay.map((d) => d.visitors) ?? [0])));
  protected readonly bestDay = computed(() => {
    const d = [...(this.report()?.byDay ?? [])].sort((a, b) => b.visitors - a.visitors)[0];
    return d?.visitors ? `${dayLabel(d.date)} · ${d.visitors}` : null;
  });
  protected readonly hours = computed(() => {
    const all = this.report()?.byHour ?? [];
    const withData = all.filter((h) => h.visitors);
    if (!withData.length) return [];
    return all.filter((h) => h.hour >= withData[0].hour && h.hour <= withData[withData.length - 1].hour);
  });
  protected readonly maxHour = computed(() => Math.max(1, ...this.hours().map((h) => h.visitors)));
  protected readonly bestHour = computed(() => [...this.hours()].sort((a, b) => b.visitors - a.visitors)[0]);

  ngOnInit(): void {
    this.stopLive = this.backend.watchVisitors(
      (state) => this.live.set(summarizePresence(state)),
      (c) => {
        this.conn.set(c);
        // Al perder la conexión no se muestra un número viejo como si fuera actual.
        if (c !== 'online') this.live.set(EMPTY_LIVE);
      },
    );
    void this.load();
  }

  ngOnDestroy(): void {
    this.stopLive?.();
  }

  protected choose(p: Preset): void {
    this.preset.set(p);
    void this.load();
  }

  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.backend.rpc<VisitsReport>('report_web_visits', presetRange(this.preset()));
      if (seq === this.loadSeq) this.report.set(data);
    } catch (e) {
      if (seq !== this.loadSeq || this.auth.handleAuthError(e)) return;
      this.report.set(null);
      this.error.set(e instanceof ApiError ? e.message : 'No se pudo cargar el historial.');
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  protected async refresh(ev: CustomEvent): Promise<void> {
    await this.load();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  protected back(): void {
    void this.router.navigateByUrl('/tabs/ajustes');
  }

  protected share(part: number, total: number): number {
    return pct(Number(part), Number(total));
  }
  protected bar(v: number, max: number): number {
    return max ? Math.max(v ? 3 : 0, (v / max) * 100) : 0;
  }
  protected dayName(ymd: string): string {
    return dayLabel(ymd);
  }
  protected dayTick(ymd: string): string {
    return String(Number(ymd.slice(8, 10)));
  }
  protected showTick(i: number, n: number): boolean {
    return n <= 16 || i % Math.ceil(n / 10) === 0 || i === n - 1;
  }
  protected hourName(h: number): string {
    return hourLabel(h);
  }
  protected hourTick(h: number): string {
    return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
  }
}
