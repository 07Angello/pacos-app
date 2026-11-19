import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonRefresher, IonRefresherContent, IonToolbar } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { STAFF_BACKEND } from '../../core/backend/backend';
import { FileShareService } from '../../core/file-share.service';
import { ApiError } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import {
  addDays, customRange, dayLabel, delta, hourLabel, pct, presetRange, RangePreset, rangeLabel, rangeSlug, SalesReport, todayYmd, WEEKDAYS, WEEKDAYS_SHORT,
} from '../../core/report';
import { MoneyPipe } from '../../shared/money.pipe';

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes pasado' },
  { id: 'custom', label: 'Personalizado' },
];

/**
 * Reportes del negocio (solo ADMIN): ventas, cierre de caja, productos, horas pico…
 * Descarga en Excel/PDF y, en el teléfono, compartir por WhatsApp u otras apps.
 */
@Component({
  selector: 'app-reports',
  imports: [IonHeader, IonToolbar, IonContent, IonRefresher, IonRefresherContent, FormsModule, MoneyPipe, DecimalPipe, PercentPipe],
  template: `
    <ion-header class="app-header">
      <ion-toolbar>
        <div class="app-header__row">
          <div class="app-header__title">
            <button type="button" class="icon-btn" (click)="back()" aria-label="Volver"><i class="fa-solid fa-arrow-left"></i></button>
            <div><h1>Reportes</h1><p>Ventas y desempeño del negocio</p></div>
          </div>
        </div>
        <div class="filters" role="tablist" aria-label="Periodo">
          @for (p of presets; track p.id) {
            <button type="button" role="tab" class="filters__btn" [class.filters__btn--on]="preset() === p.id" [attr.aria-selected]="preset() === p.id" (click)="choose(p.id)">
              {{ p.label }}
            </button>
          }
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="page">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="page__inner rep">
        @if (preset() === 'custom') {
          <section class="card-block rep-custom">
            <div class="rep-custom__grid">
              <label class="field"><span class="field__label">Desde</span>
                <span class="field__control"><input type="date" [ngModel]="fromDate()" (ngModelChange)="fromDate.set($event)" [max]="today" /></span></label>
              <label class="field"><span class="field__label">Hora</span>
                <span class="field__control"><input type="time" [ngModel]="fromTime()" (ngModelChange)="fromTime.set($event)" /></span></label>
              <label class="field"><span class="field__label">Hasta</span>
                <span class="field__control"><input type="date" [ngModel]="toDate()" (ngModelChange)="toDate.set($event)" [max]="today" /></span></label>
              <label class="field"><span class="field__label">Hora</span>
                <span class="field__control"><input type="time" [ngModel]="toTime()" (ngModelChange)="toTime.set($event)" /></span></label>
            </div>
            <button type="button" class="btn btn--primary btn--block" (click)="applyCustom()" [disabled]="loading()"><i class="fa-solid fa-magnifying-glass-chart"></i> Ver reporte</button>
          </section>
        }

        @if (report(); as r) {
          <p class="rep-range"><i class="fa-regular fa-calendar"></i> {{ label() }}</p>

          <section class="rep-export">
            <button type="button" class="btn btn--dark" (click)="export('xlsx')" [disabled]="exporting()">
              @if (exporting() === 'xlsx') { <i class="fa-solid fa-spinner fa-spin"></i> } @else { <i class="fa-solid fa-file-excel"></i> }
              {{ share.isNative ? 'Compartir Excel' : 'Descargar Excel' }}
            </button>
            <button type="button" class="btn btn--dark" (click)="export('pdf')" [disabled]="exporting()">
              @if (exporting() === 'pdf') { <i class="fa-solid fa-spinner fa-spin"></i> } @else { <i class="fa-solid fa-file-pdf"></i> }
              {{ share.isNative ? 'Compartir PDF' : 'Descargar PDF' }}
            </button>
            @if (!share.isNative && webShare) {
              <button type="button" class="btn btn--ghost" (click)="export('pdf', true)" [disabled]="exporting()"><i class="fa-brands fa-whatsapp"></i> Compartir</button>
            }
          </section>
          @if (share.isNative) {
            <p class="footnote rep-hint"><i class="fa-brands fa-whatsapp"></i> Se abre el menú para enviarlo por WhatsApp, correo o guardarlo en Drive.</p>
          }

          @if (r.summary.orders === 0) {
            <div class="empty"><i class="fa-solid fa-chart-column"></i><p>No hay ventas entregadas en este periodo.</p></div>
          }

          <!-- KPIs -->
          <section class="rep-kpis" aria-label="Resumen">
            @for (k of kpis(); track k.label) {
              <div class="rep-kpi" [class.rep-kpi--main]="k.main">
                <span class="rep-kpi__label">{{ k.label }}</span>
                <strong class="rep-kpi__value">{{ k.value }}</strong>
                @if (k.delta !== null) {
                  <span class="rep-kpi__delta" [class.rep-kpi__delta--up]="k.delta >= 0" [class.rep-kpi__delta--down]="k.delta < 0">
                    <i class="fa-solid" [class]="k.delta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'"></i> {{ k.delta | percent: '1.0-1' }} vs. periodo anterior
                  </span>
                } @else if (k.hint) {
                  <span class="rep-kpi__delta">{{ k.hint }}</span>
                }
              </div>
            }
          </section>

          @if (r.summary.openOrders) {
            <p class="banner banner--info banner--flat"><i class="fa-solid fa-circle-info"></i>
              <span>{{ r.summary.openOrders }} {{ r.summary.openOrders === 1 ? 'pedido sigue' : 'pedidos siguen' }} en curso ({{ r.summary.openValue | money }}): se cuentan como venta al entregarse.</span></p>
          }

          <div class="rep-cols">
            <!-- Cierre de caja -->
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-cash-register"></i> Cierre de caja</h2>
              <table class="rep-table">
                <thead><tr><th>Método</th><th>Pedidos</th><th>Total</th></tr></thead>
                <tbody>
                  @for (p of r.byPayment; track p.code) {
                    <tr><td>{{ p.label }} <small>{{ share2(p.sales, r.summary.sales) | percent: '1.0-0' }}</small></td><td>{{ p.orders }}</td><td>{{ p.sales | money }}</td></tr>
                  } @empty {
                    <tr><td colspan="3" class="muted">Sin ventas</td></tr>
                  }
                </tbody>
                <tfoot><tr><td>Total</td><td>{{ r.summary.orders }}</td><td>{{ r.summary.sales | money }}</td></tr></tfoot>
              </table>
              <p class="footnote">Pedidos entregados, incluye envíos ({{ r.summary.deliveryFees | money }}).</p>
            </section>

            <!-- Modalidad -->
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-store"></i> Por modalidad</h2>
              <div class="rep-split" role="img" [attr.aria-label]="'Recoger ' + (share2(r.summary.pickupSales, r.summary.sales) | percent) + ', domicilio ' + (share2(r.summary.deliverySales, r.summary.sales) | percent) + ', comer aquí ' + (share2(r.summary.dineInSales ?? 0, r.summary.sales) | percent)">
                <span class="rep-split__a" [style.flex-grow]="r.summary.pickupSales || (r.summary.sales ? 0 : 1)"></span>
                <span class="rep-split__b" [style.flex-grow]="r.summary.deliverySales"></span>
                <span class="rep-split__c" [style.flex-grow]="r.summary.dineInSales ?? 0"></span>
              </div>
              <div class="rep-legend rep-legend--3">
                <div><i class="rep-dot rep-dot--a"></i><span>Recoger</span><strong>{{ r.summary.pickupSales | money }}</strong><small>{{ r.summary.pickupOrders }} pedidos · {{ share2(r.summary.pickupSales, r.summary.sales) | percent: '1.0-0' }}</small></div>
                <div><i class="rep-dot rep-dot--b"></i><span>Domicilio</span><strong>{{ r.summary.deliverySales | money }}</strong><small>{{ r.summary.deliveryOrders }} pedidos · {{ share2(r.summary.deliverySales, r.summary.sales) | percent: '1.0-0' }}</small></div>
                <div><i class="rep-dot rep-dot--c"></i><span>Comer aquí</span><strong>{{ r.summary.dineInSales ?? 0 | money }}</strong><small>{{ r.summary.dineInOrders ?? 0 }} pedidos · {{ share2(r.summary.dineInSales ?? 0, r.summary.sales) | percent: '1.0-0' }}</small></div>
              </div>
              <p class="footnote"><i class="fa-solid fa-globe"></i> En línea: {{ r.summary.webOrders ?? 0 }} pedidos · {{ r.summary.webSales ?? 0 | money }} &nbsp;·&nbsp; <i class="fa-solid fa-shop"></i> En el local: {{ r.summary.counterOrders ?? 0 }} pedidos · {{ r.summary.counterSales ?? 0 | money }}</p>
              @if (r.summary.scheduledOrders) { <p class="footnote"><i class="fa-solid fa-calendar-check"></i> {{ r.summary.scheduledOrders }} programados para recoger a una hora.</p> }
            </section>
          </div>

          <!-- Ventas por día -->
          @if (r.byDay.length > 1) {
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-chart-column"></i> Ventas por día
                <small class="rep-best">Mejor día: {{ bestDay()?.label }} · {{ bestDay()?.sales | money }}</small></h2>
              <div class="rep-bars" [class.rep-bars--dense]="r.byDay.length > 16">
                @for (d of r.byDay; track d.date; let i = $index) {
                  <div class="rep-bars__col" [title]="dayName(d.date) + ': ' + (d.sales | money) + ' · ' + d.orders + ' pedidos'">
                    <span class="rep-bars__bar" [style.height.%]="bar(d.sales, maxDay())"></span>
                    <span class="rep-bars__x">{{ showTick(i, r.byDay.length) ? dayTick(d.date) : '' }}</span>
                  </div>
                }
              </div>
            </section>
          }

          <!-- Ventas por hora -->
          @if (hours().length) {
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-clock"></i> Ventas por hora
                <small class="rep-best">Hora más fuerte: {{ hourName(bestHour()!.hour) }}</small></h2>
              <div class="rep-bars">
                @for (h of hours(); track h.hour) {
                  <div class="rep-bars__col" [title]="hourName(h.hour) + ': ' + (h.sales | money) + ' · ' + h.orders + ' pedidos'">
                    <span class="rep-bars__bar" [class.rep-bars__bar--hot]="h.hour === bestHour()!.hour" [style.height.%]="bar(h.sales, maxHour())"></span>
                    <span class="rep-bars__x">{{ hourTick(h.hour) }}</span>
                  </div>
                }
              </div>
            </section>

            <!-- Horas pico -->
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-fire"></i> Horas pico <small class="rep-best">pedidos por día y hora</small></h2>
              <div class="rep-heat" [style.--cols]="hours().length">
                <span></span>
                @for (h of hours(); track h.hour) { <span class="rep-heat__h">{{ hourTick(h.hour) }}</span> }
                @for (wd of weekOrder; track wd) {
                  <span class="rep-heat__d">{{ weekdaysShort[wd] }}</span>
                  @for (h of hours(); track h.hour) {
                    @let n = heat(wd, h.hour);
                    <span class="rep-heat__cell" [style.--a]="n / maxHeat()" [title]="weekdays[wd] + ' ' + hourName(h.hour) + ': ' + n + ' pedidos'">{{ n || '' }}</span>
                  }
                }
              </div>
              @if (peak(); as pk) {
                <p class="footnote"><i class="fa-solid fa-lightbulb"></i> El momento con más pedidos es el <strong>{{ weekdays[pk.weekday].toLowerCase() }} a las {{ hourName(pk.hour) }}</strong>: buen momento para tener más personal.</p>
              }
            </section>
          }

          <div class="rep-cols">
            <!-- Productos -->
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-trophy"></i> Productos más vendidos</h2>
              <ol class="rep-rank">
                @for (p of shownProducts(); track p.name; let i = $index) {
                  <li>
                    <span class="rep-rank__n">{{ i + 1 }}</span>
                    <div class="rep-rank__body">
                      <div class="rep-rank__top"><strong>{{ p.name }}</strong><span>{{ p.sales | money }}</span></div>
                      <div class="rep-meter"><span [style.width.%]="bar(p.sales, r.products[0].sales)"></span></div>
                      <small>{{ p.quantity | number }} vendidos · {{ p.category }} · {{ share2(p.sales, r.summary.subtotal) | percent: '1.0-1' }}</small>
                    </div>
                  </li>
                } @empty { <li class="muted">Sin ventas</li> }
              </ol>
              @if (r.products.length > 10) {
                <button type="button" class="link" (click)="allProducts.set(!allProducts())">{{ allProducts() ? 'Ver menos' : 'Ver los ' + r.products.length + ' productos' }}</button>
              }
            </section>

            <!-- Categorías + extras -->
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-layer-group"></i> Por categoría</h2>
              <ul class="rep-list">
                @for (c of r.categories; track c.name) {
                  <li>
                    <div class="rep-rank__top"><strong>{{ c.name }}</strong><span>{{ c.sales | money }}</span></div>
                    <div class="rep-meter rep-meter--soft"><span [style.width.%]="share2(c.sales, r.summary.subtotal) * 100"></span></div>
                    <small>{{ c.quantity | number }} vendidos · {{ share2(c.sales, r.summary.subtotal) | percent: '1.0-1' }}</small>
                  </li>
                } @empty { <li class="muted">Sin ventas</li> }
              </ul>

              @if (paidExtras().length) {
                <h2 class="card-block__title rep-sub"><i class="fa-solid fa-plus"></i> Extras que más dejan</h2>
                <ul class="rep-list">
                  @for (x of paidExtras(); track x.group + x.name) {
                    <li class="rep-list__row"><span>{{ x.name }} <small>· {{ x.group }}</small></span><span><small>{{ x.times }}×</small> {{ x.sales | money }}</span></li>
                  }
                </ul>
              }
            </section>
          </div>

          <div class="rep-cols">
            <!-- Clientes y colonias -->
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-users"></i> Clientes</h2>
              <div class="rep-mini">
                <div><strong>{{ r.summary.customers }}</strong><span>clientes distintos</span></div>
                <div><strong>{{ r.summary.returningCustomers }}</strong><span>ya habían comprado antes</span></div>
                <div><strong>{{ share2(r.summary.returningCustomers, r.summary.customers) | percent: '1.0-0' }}</strong><span>regresan</span></div>
              </div>
              @if (r.neighborhoods.length) {
                <h2 class="card-block__title rep-sub"><i class="fa-solid fa-location-dot"></i> Colonias con más pedidos a domicilio</h2>
                <ul class="rep-list">
                  @for (n of r.neighborhoods.slice(0, 8); track n.name) {
                    <li class="rep-list__row"><span>{{ n.name }}</span><span><small>{{ n.orders }} pedidos</small> {{ n.sales | money }}</span></li>
                  }
                </ul>
              }
            </section>

            <!-- Pérdidas -->
            <section class="card-block rep-card">
              <h2 class="card-block__title"><i class="fa-solid fa-circle-xmark"></i> Ventas no concretadas</h2>
              <div class="rep-mini">
                <div><strong>{{ r.summary.cancelledValue + r.summary.rejectedValue | money }}</strong><span>dejado de vender</span></div>
                <div><strong>{{ r.summary.cancelledOrders }}</strong><span>cancelados por el cliente</span></div>
                <div><strong>{{ r.summary.rejectedOrders }}</strong><span>rechazados</span></div>
              </div>
              @if (r.losses.length) {
                <ul class="rep-list">
                  @for (l of r.losses.slice(0, 8); track l.type + l.reason) {
                    <li class="rep-list__row"><span>{{ l.reason }} <small>· {{ l.type === 'CANCELLED' ? 'cancelado' : 'rechazado' }}</small></span><span><small>{{ l.orders }}×</small> {{ l.value | money }}</span></li>
                  }
                </ul>
              }
            </section>
          </div>
        } @else if (loading()) {
          <div class="rep-skeleton" aria-busy="true"><span></span><span></span><span></span><span></span></div>
        } @else if (error(); as e) {
          <div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>{{ e }}</p><button type="button" class="btn btn--ghost" (click)="load()">Reintentar</button></div>
        }
      </div>
    </ion-content>
  `,
})
export class ReportsPage implements OnInit {
  private readonly backend = inject(STAFF_BACKEND);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  protected readonly share = inject(FileShareService);

  protected readonly presets = PRESETS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdaysShort = WEEKDAYS_SHORT;
  protected readonly weekOrder = [1, 2, 3, 4, 5, 6, 0];
  protected readonly today = todayYmd();
  protected readonly webShare = this.share.canWebShare();

  protected readonly preset = signal<RangePreset>('today');
  protected readonly fromDate = signal(addDays(this.today, -6));
  protected readonly fromTime = signal('00:00');
  protected readonly toDate = signal(this.today);
  protected readonly toTime = signal('23:59');
  private readonly range = signal(presetRange('today'));

  protected readonly report = signal<SalesReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exporting = signal<'xlsx' | 'pdf' | null>(null);
  protected readonly allProducts = signal(false);

  protected readonly label = computed(() => rangeLabel(this.range().from, this.range().to));

  protected readonly kpis = computed(() => {
    const r = this.report();
    if (!r) return [];
    const s = r.summary;
    const p = r.previous;
    const fmt = (v: number) => `L ${v.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return [
      { label: 'Ventas', value: fmt(s.sales), delta: delta(s.sales, p.sales), main: true, hint: 'sin periodo anterior para comparar' },
      { label: 'Pedidos entregados', value: s.orders.toLocaleString('es-HN'), delta: delta(s.orders, p.orders), main: false, hint: '' },
      { label: 'Ticket promedio', value: fmt(s.avgTicket), delta: delta(s.avgTicket, p.avgTicket), main: false, hint: '' },
      { label: 'Platos vendidos', value: s.itemsSold.toLocaleString('es-HN'), delta: delta(s.itemsSold, p.itemsSold), main: false, hint: '' },
      { label: 'Clientes', value: s.customers.toLocaleString('es-HN'), delta: delta(s.customers, p.customers), main: false, hint: '' },
    ];
  });

  protected readonly maxDay = computed(() => Math.max(1, ...(this.report()?.byDay.map((d) => d.sales) ?? [0])));
  protected readonly bestDay = computed(() => {
    const d = [...(this.report()?.byDay ?? [])].sort((a, b) => b.sales - a.sales)[0];
    return d && d.sales ? { label: dayLabel(d.date), sales: d.sales } : null;
  });
  /** Horas con ventas, de la primera a la última (incluye huecos intermedios). */
  protected readonly hours = computed(() => {
    const all = this.report()?.byHour ?? [];
    const withSales = all.filter((h) => h.orders);
    if (!withSales.length) return [];
    const first = withSales[0].hour;
    const last = withSales[withSales.length - 1].hour;
    return all.filter((h) => h.hour >= first && h.hour <= last);
  });
  protected readonly maxHour = computed(() => Math.max(1, ...this.hours().map((h) => h.sales)));
  protected readonly bestHour = computed(() => [...this.hours()].sort((a, b) => b.sales - a.sales)[0]);
  private readonly heatMap = computed(() => new Map((this.report()?.heatmap ?? []).map((x) => [`${x.weekday}-${x.hour}`, x.orders])));
  protected readonly maxHeat = computed(() => Math.max(1, ...(this.report()?.heatmap.map((x) => x.orders) ?? [0])));
  protected readonly peak = computed(() => [...(this.report()?.heatmap ?? [])].sort((a, b) => b.orders - a.orders)[0]);
  protected readonly shownProducts = computed(() => (this.allProducts() ? this.report()?.products : this.report()?.products.slice(0, 10)) ?? []);
  protected readonly paidExtras = computed(() => (this.report()?.extras ?? []).filter((x) => Number(x.sales) > 0).slice(0, 6));

  ngOnInit(): void {
    void this.load();
  }

  protected choose(p: RangePreset): void {
    this.preset.set(p);
    if (p === 'custom') return;
    this.range.set(presetRange(p));
    void this.load();
  }

  protected applyCustom(): void {
    const r = customRange(this.fromDate(), this.fromTime(), this.toDate(), this.toTime());
    if (!this.fromDate() || !this.toDate() || Date.parse(r.to) <= Date.parse(r.from)) {
      void this.notify.toast('La fecha final debe ser posterior a la inicial.', 'error');
      return;
    }
    this.range.set(r);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.report.set(await this.backend.rpc<SalesReport>('report_sales', this.range()));
      this.allProducts.set(false);
    } catch (e) {
      if (this.auth.handleAuthError(e)) return;
      this.report.set(null);
      this.error.set(e instanceof ApiError ? e.message : 'No se pudo cargar el reporte.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async refresh(ev: CustomEvent): Promise<void> {
    await this.load();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  protected async export(kind: 'xlsx' | 'pdf', forceShare = false): Promise<void> {
    const r = this.report();
    if (!r || this.exporting()) return;
    this.exporting.set(kind);
    try {
      const { buildPdf, buildXlsx } = await import('../../core/report-export');
      const blob = kind === 'xlsx' ? await buildXlsx(r) : await buildPdf(r);
      const name = `Pacos-ventas-${rangeSlug(r.range.from, r.range.to)}.${kind}`;
      const title = `Reporte de ventas ${r.range.restaurant} · ${this.label()}`;
      if (this.share.isNative || forceShare) await this.share.share(blob, name, title);
      else this.share.download(blob, name);
    } catch (e) {
      console.error('[reportes] exportar', e);
      void this.notify.toast('No se pudo generar el archivo.', 'error');
    } finally {
      this.exporting.set(null);
    }
  }

  protected back(): void {
    void this.router.navigateByUrl('/tabs/inicio');
  }

  protected bar(v: number, max: number): number {
    return max ? Math.max(v ? 3 : 0, (v / max) * 100) : 0;
  }
  protected share2(part: number, total: number): number {
    return pct(Number(part), Number(total));
  }
  protected heat(wd: number, h: number): number {
    return this.heatMap().get(`${wd}-${h}`) ?? 0;
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
