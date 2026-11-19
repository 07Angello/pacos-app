import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { IonContent, IonDatetime, IonFooter, IonHeader, IonModal, IonToggle, IonToolbar, ModalController } from '@ionic/angular';
import { ApiError, BusinessHour } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { SettingsStore } from '../../core/settings.store';
import { hhmmLabel, restaurantWeekday } from '../../core/time';

interface DayDraft {
  weekday: number;
  label: string;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
}

const NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza el lunes

/** Horario de atención por día (solo ADMIN). Es lo que la web muestra como "Hoy 11:00 – 23:00". */
@Component({
  selector: 'app-hours-editor',
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonToggle, IonModal, IonDatetime],
  template: `
    <ion-header class="editor-header">
      <ion-toolbar>
        <div class="editor-header__row">
          <button type="button" class="icon-btn" (click)="modals.dismiss(null, 'cancel')" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          <div class="editor-header__title"><small>Restaurante</small><strong>Horario de atención</strong></div>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content class="editor">
      <div class="editor__inner">
        <p class="footnote hours-intro"><i class="fa-solid fa-circle-info"></i> Es el horario que ven los clientes en la web. A la hora de cierre se apaga solo "Recibir pedidos en línea"; abrir sigue siendo manual.</p>
        @for (d of days(); track d.weekday; let i = $index) {
          <section class="editor__section hours-day" [class.hours-day--closed]="d.isClosed" [class.hours-day--today]="d.weekday === today">
            <div class="hours-day__head">
              <div>
                <strong>{{ d.label }} @if (d.weekday === today) { <em class="hours-day__today">hoy</em> }</strong>
                <span>{{ d.isClosed ? 'Cerrado todo el día' : summary(d) }}</span>
              </div>
              <ion-toggle [checked]="!d.isClosed" (ionChange)="set(i, { isClosed: !$event.detail.checked })" [attr.aria-label]="'Abierto el ' + d.label" />
            </div>
            @if (!d.isClosed) {
              <div class="hours-day__times">
                <div class="field">
                  <span class="field__label">Abre</span>
                  <button type="button" class="field__control hours-pick" (click)="pick(i, 'opensAt')" [attr.aria-label]="'Abre el ' + d.label + ': ' + label(d.opensAt)">
                    <i class="fa-solid fa-door-open"></i><span>{{ label(d.opensAt) }}</span><i class="fa-regular fa-clock hours-pick__icon"></i>
                  </button>
                </div>
                <div class="field">
                  <span class="field__label">Cierra</span>
                  <button type="button" class="field__control hours-pick" (click)="pick(i, 'closesAt')" [attr.aria-label]="'Cierra el ' + d.label + ': ' + label(d.closesAt)">
                    <i class="fa-solid fa-door-closed"></i><span>{{ label(d.closesAt) }}</span><i class="fa-regular fa-clock hours-pick__icon"></i>
                  </button>
                </div>
              </div>
              @if (d.opensAt && d.closesAt && d.closesAt < d.opensAt) {
                <p class="hours-day__note"><i class="fa-solid fa-moon"></i> Cierra después de medianoche.</p>
              }
              <button type="button" class="btn btn--ghost hours-day__copy" (click)="copyToAll(d)"><i class="fa-regular fa-copy"></i> Usar este horario en todos los días abiertos</button>
            }
          </section>
        }
      </div>
    </ion-content>

    <!-- Selector de hora: rueditas de hora, minutos y a. m./p. m. (no depende del formato 24 h del teléfono) -->
    <ion-modal [isOpen]="!!picking()" (didDismiss)="picking.set(null)" [initialBreakpoint]="1" [breakpoints]="[0, 1]" class="time-sheet">
      <ng-template>
        @if (picking(); as p) {
          <div class="time-sheet__body">
            <h3 class="time-sheet__title">{{ p.key === 'opensAt' ? 'Abre' : 'Cierra' }} el {{ days()[p.index].label.toLowerCase() }}</h3>
            <ion-datetime presentation="time" hourCycle="h12" locale="es-HN" [preferWheel]="true"
              [value]="pickerValue()" (ionChange)="draftTime.set(timeOf($event.detail.value))" />
            <div class="time-sheet__actions">
              <button type="button" class="btn btn--ghost" (click)="picking.set(null)">Cancelar</button>
              <button type="button" class="btn btn--primary" (click)="confirmPick()"><i class="fa-solid fa-check"></i> Listo</button>
            </div>
          </div>
        }
      </ng-template>
    </ion-modal>

    <ion-footer class="editor-footer">
      <div class="editor-footer__row">
        <button type="button" class="btn btn--primary btn--lg editor-footer__main" (click)="save()" [disabled]="saving() || !dirty()">
          @if (saving()) { <i class="fa-solid fa-spinner fa-spin"></i> Guardando… } @else { <i class="fa-solid fa-check"></i> Guardar horario }
        </button>
      </div>
    </ion-footer>
  `,
})
export class HoursEditorComponent implements OnInit {
  protected readonly modals = inject(ModalController);
  private readonly store = inject(SettingsStore);
  private readonly notify = inject(NotifyService);

  protected readonly today = restaurantWeekday();
  protected readonly days = signal<DayDraft[]>([]);
  protected readonly saving = signal(false);
  private initial = '';
  protected readonly dirty = computed(() => JSON.stringify(this.days()) !== this.initial);

  ngOnInit(): void {
    const current = this.store.settings()?.businessHours ?? [];
    this.days.set(ORDER.map((weekday) => {
      const h = current.find((x) => x.weekday === weekday);
      return {
        weekday,
        label: NAMES[weekday],
        isClosed: h?.isClosed ?? false,
        opensAt: h?.opensAt ?? '11:00',
        closesAt: h?.closesAt ?? '22:00',
      };
    }));
    this.initial = JSON.stringify(this.days());
  }

  /** Día y campo que se está editando en el selector de hora. */
  protected readonly picking = signal<{ index: number; key: 'opensAt' | 'closesAt' } | null>(null);
  protected readonly draftTime = signal('');
  /** ion-datetime trabaja con fecha completa; solo usamos la hora. */
  protected readonly pickerValue = computed(() => `2000-01-01T${this.draftTime() || '12:00'}:00`);

  protected pick(index: number, key: 'opensAt' | 'closesAt'): void {
    this.draftTime.set(this.days()[index][key]);
    this.picking.set({ index, key });
  }

  /** '2000-01-01T21:30:00' → '21:30'. */
  protected timeOf(v: string | string[] | null | undefined): string {
    const m = /(\d{2}):(\d{2})/.exec(String(Array.isArray(v) ? v[0] : (v ?? '')));
    return m ? `${m[1]}:${m[2]}` : this.draftTime();
  }

  protected confirmPick(): void {
    const p = this.picking();
    if (p && this.draftTime()) this.set(p.index, { [p.key]: this.draftTime() });
    this.picking.set(null);
  }

  protected label(v: string): string {
    return hhmmLabel(v);
  }

  protected summary(d: DayDraft): string {
    return `${hhmmLabel(d.opensAt)} – ${hhmmLabel(d.closesAt)}`;
  }

  protected set(i: number, patch: Partial<DayDraft>): void {
    this.days.update((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  protected copyToAll(src: DayDraft): void {
    this.days.update((list) => list.map((d) => (d.isClosed ? d : { ...d, opensAt: src.opensAt, closesAt: src.closesAt })));
    void this.notify.toast(`Horario de ${src.label.toLowerCase()} copiado a los días abiertos`, 'success', 1500);
  }

  protected async save(): Promise<void> {
    const bad = this.days().find((d) => !d.isClosed && (!d.opensAt || !d.closesAt || d.opensAt === d.closesAt));
    if (bad) return void this.notify.toast(`${bad.label}: revisa la hora de apertura y de cierre.`, 'error');
    this.saving.set(true);
    try {
      const hours: Omit<BusinessHour, 'label'>[] = this.days().map((d) => ({
        weekday: d.weekday,
        isClosed: d.isClosed,
        opensAt: d.opensAt,
        closesAt: d.closesAt,
      }));
      await this.store.updateHours(hours);
      void this.notify.toast('Horario guardado. La web ya lo muestra.', 'success', 2000);
      await this.modals.dismiss(null, 'saved');
    } catch (e) {
      void this.notify.toast(e instanceof ApiError ? e.message : 'No se pudo guardar el horario.', 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
