import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonContent,
  IonFooter,
  IonHeader,
  IonReorder,
  IonReorderGroup,
  IonToggle,
  IonToolbar,
  ReorderEndEventDetail,
  ModalController,
} from '@ionic/angular';
import { groupSummary, MenuAdminStore } from '../../core/menu-admin.store';
import { OptionGroup, OptionType, OptionValue } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { MoneyPipe } from '../../shared/money.pipe';

const emptyValue = (): OptionValue => ({ label: '', priceDelta: 0, isAvailable: true, isDefault: false });

/**
 * Crea o edita un grupo de opciones reutilizable: "Término", "Extras", "Elige tu bebida"…
 * Abrir con ModalController, componentProps: { group?: OptionGroup }.
 * Al guardar cierra con (grupoGuardado, 'saved'); al eliminar con (null, 'deleted').
 */
@Component({
  selector: 'app-group-editor',
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonToggle, IonReorderGroup, IonReorder, FormsModule, MoneyPipe],
  template: `
    <ion-header class="editor-header">
      <ion-toolbar>
        <div class="editor-header__row">
          <button type="button" class="icon-btn" (click)="cancel()" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          <div class="editor-header__title">
            <small>Grupo de opciones</small>
            <strong>{{ group?.id ? 'Editar grupo' : 'Nuevo grupo' }}</strong>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="editor">
      <div class="editor__inner">
        @if (usedIn().length > 1) {
          <p class="banner banner--info banner--flat">
            <i class="fa-solid fa-link"></i>
            <span>Este grupo se usa en <strong>{{ usedIn().length }} platos</strong> ({{ usedIn().join(', ') }}). Los cambios se aplican a todos.</span>
          </p>
        }

        <section class="editor__section">
          <label class="field">
            <span class="field__label">Nombre del grupo</span>
            <span class="field__control">
              <i class="fa-solid fa-layer-group"></i>
              <input [ngModel]="draft().name" (ngModelChange)="patch({ name: $event })" maxlength="80" placeholder="Ej.: Extras, Término de la carne, Elige tu bebida" />
            </span>
          </label>
        </section>

        <section class="editor__section">
          <h3 class="editor__title">¿Cuántas puede elegir el cliente?</h3>
          <div class="type-cards" role="radiogroup">
            <button type="button" role="radio" class="type-card" [class.type-card--on]="draft().optionType === 'SINGLE'" [attr.aria-checked]="draft().optionType === 'SINGLE'" (click)="setType('SINGLE')">
              <i class="fa-regular fa-circle-dot"></i>
              <strong>Solo una</strong>
              <span>Ej.: término, salsa, tamaño</span>
            </button>
            <button type="button" role="radio" class="type-card" [class.type-card--on]="draft().optionType === 'MULTIPLE'" [attr.aria-checked]="draft().optionType === 'MULTIPLE'" (click)="setType('MULTIPLE')">
              <i class="fa-regular fa-square-check"></i>
              <strong>Varias</strong>
              <span>Ej.: extras, quitar ingredientes</span>
            </button>
          </div>

          <div class="setting">
            <div><strong>Obligatorio</strong><span>El cliente no puede agregar el plato sin elegir</span></div>
            <ion-toggle [checked]="draft().isRequired" (ionChange)="setRequired($event.detail.checked)" aria-label="Obligatorio" />
          </div>

          @if (draft().optionType === 'MULTIPLE') {
            <div class="setting">
              <div><strong>Mínimo</strong><span>Cuántas debe elegir como mínimo</span></div>
              <div class="stepper">
                <button type="button" class="stepper__btn" (click)="setMin(draft().minSelect - 1)" [disabled]="draft().minSelect <= (draft().isRequired ? 1 : 0)" aria-label="Menos"><i class="fa-solid fa-minus"></i></button>
                <span class="stepper__value">{{ draft().minSelect }}</span>
                <button type="button" class="stepper__btn" (click)="setMin(draft().minSelect + 1)" [disabled]="draft().minSelect >= draft().maxSelect" aria-label="Más"><i class="fa-solid fa-plus"></i></button>
              </div>
            </div>
            <div class="setting">
              <div><strong>Máximo</strong><span>Cuántas puede elegir como máximo</span></div>
              <div class="stepper">
                <button type="button" class="stepper__btn" (click)="setMax(draft().maxSelect - 1)" [disabled]="draft().maxSelect <= Math.max(1, draft().minSelect)" aria-label="Menos"><i class="fa-solid fa-minus"></i></button>
                <span class="stepper__value">{{ draft().maxSelect }}</span>
                <button type="button" class="stepper__btn" (click)="setMax(draft().maxSelect + 1)" [disabled]="draft().maxSelect >= draft().values.length" aria-label="Más"><i class="fa-solid fa-plus"></i></button>
              </div>
            </div>
          }
        </section>

        <section class="editor__section">
          <h3 class="editor__title">Opciones <span class="muted">({{ draft().values.length }})</span></h3>
          <p class="editor__hint">
            <i class="fa-solid fa-grip-vertical"></i> arrastra para ordenar ·
            <i class="fa-solid fa-star"></i> viene marcada por defecto ·
            <i class="fa-solid fa-eye"></i> disponible / agotada
          </p>
          <ion-reorder-group [disabled]="false" (ionReorderEnd)="reorder($event)">
            @for (v of draft().values; track $index; let i = $index) {
              <div class="vrow" [class.vrow--off]="!v.isAvailable">
                <ion-reorder slot="start"><i class="fa-solid fa-grip-vertical vrow__grip"></i></ion-reorder>
                <input class="vrow__label" [ngModel]="v.label" (ngModelChange)="patchValue(i, { label: $event })" maxlength="60" placeholder="Nombre (ej.: Tocino)" [attr.aria-label]="'Nombre de la opción ' + (i + 1)" />
                <span class="vrow__price">
                  <span>+L</span>
                  <input type="number" inputmode="decimal" min="0" step="1" [ngModel]="v.priceDelta" (ngModelChange)="patchValue(i, { priceDelta: toNumber($event) })" [attr.aria-label]="'Precio adicional de ' + (v.label || 'la opción')" />
                </span>
                <button type="button" class="vrow__btn" [class.vrow__btn--star]="v.isDefault" (click)="toggleDefault(i)" [attr.aria-pressed]="v.isDefault" [attr.aria-label]="'Marcada por defecto: ' + (v.label || 'opción')">
                  <i [class]="v.isDefault ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
                </button>
                <button type="button" class="vrow__btn" (click)="patchValue(i, { isAvailable: !v.isAvailable, isDefault: v.isAvailable ? false : v.isDefault })" [attr.aria-pressed]="v.isAvailable" [attr.aria-label]="(v.isAvailable ? 'Disponible: ' : 'Agotada: ') + (v.label || 'opción')">
                  <i class="fa-solid" [class]="v.isAvailable ? 'fa-eye' : 'fa-eye-slash'"></i>
                </button>
                <button type="button" class="vrow__btn vrow__btn--danger" (click)="removeValue(i)" [disabled]="draft().values.length === 1" [attr.aria-label]="'Quitar ' + (v.label || 'opción')">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            }
          </ion-reorder-group>
          <button type="button" class="btn btn--ghost btn--block" (click)="addValue()" [disabled]="draft().values.length >= 40"><i class="fa-solid fa-plus"></i> Agregar opción</button>
        </section>

        <section class="editor__section">
          <h3 class="editor__title"><i class="fa-solid fa-mobile-screen"></i> Así lo verá el cliente</h3>
          <div class="preview">
            <div class="preview__head">
              <strong>{{ draft().name || 'Nombre del grupo' }}</strong>
              <span class="preview__chip">{{ summary() }}</span>
            </div>
            @for (v of draft().values; track $index) {
              @if (v.label) {
                <div class="preview__row" [class.preview__row--off]="!v.isAvailable">
                  <i [class]="draft().optionType === 'SINGLE' ? (v.isDefault ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle') : (v.isDefault ? 'fa-solid fa-square-check' : 'fa-regular fa-square')"></i>
                  <span>{{ v.label }}</span>
                  @if (!v.isAvailable) { <em>Agotado</em> } @else if (v.priceDelta > 0) { <em>+ {{ v.priceDelta | money }}</em> }
                </div>
              }
            }
          </div>
        </section>
      </div>
    </ion-content>

    <ion-footer class="editor-footer">
      <div class="editor-footer__row">
        @if (group?.id) {
          <button type="button" class="btn btn--danger-ghost" (click)="remove()" [disabled]="saving()"><i class="fa-solid fa-trash-can"></i> Eliminar</button>
        }
        <button type="button" class="btn btn--primary btn--lg editor-footer__main" (click)="save()" [disabled]="saving()">
          @if (saving()) { <i class="fa-solid fa-spinner fa-spin"></i> Guardando… } @else { <i class="fa-solid fa-check"></i> Guardar grupo }
        </button>
      </div>
    </ion-footer>
  `,
})
export class GroupEditorComponent implements OnInit {
  /** componentProps */
  group?: OptionGroup;

  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);
  private readonly notify = inject(NotifyService);
  private readonly store = inject(MenuAdminStore);

  protected readonly Math = Math;
  protected readonly draft = signal<OptionGroup>({ name: '', optionType: 'MULTIPLE', isRequired: false, minSelect: 0, maxSelect: 2, values: [emptyValue(), emptyValue()] });
  protected readonly saving = signal(false);
  private initial = '';

  protected readonly summary = computed(() => groupSummary(this.draft()));
  protected readonly usedIn = computed(() =>
    (this.group?.productIds ?? []).map((id) => this.store.productsById().get(id)?.name).filter((n): n is string => !!n),
  );

  ngOnInit(): void {
    if (this.group) this.draft.set(structuredClone({ ...this.group, values: this.group.values.map((v) => ({ ...v, priceDelta: Number(v.priceDelta) })) }));
    this.initial = JSON.stringify(this.draft());
  }

  protected toNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  protected patch(p: Partial<OptionGroup>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected patchValue(i: number, p: Partial<OptionValue>): void {
    this.draft.update((d) => ({ ...d, values: d.values.map((v, idx) => (idx === i ? { ...v, ...p } : v)) }));
  }

  protected setType(t: OptionType): void {
    this.draft.update((d) => {
      if (t === 'SINGLE') {
        // Una sola opción: como máximo una preseleccionada.
        let seen = false;
        const values = d.values.map((v) => {
          const keep = v.isDefault && !seen;
          if (keep) seen = true;
          return { ...v, isDefault: keep };
        });
        return { ...d, optionType: t, minSelect: d.isRequired ? 1 : 0, maxSelect: 1, values };
      }
      return { ...d, optionType: t, maxSelect: Math.max(d.maxSelect, Math.min(3, d.values.length)) };
    });
  }

  protected setRequired(on: boolean): void {
    this.draft.update((d) => ({ ...d, isRequired: on, minSelect: on ? Math.max(1, d.minSelect) : d.optionType === 'SINGLE' ? 0 : d.minSelect }));
  }

  protected setMin(n: number): void {
    this.patch({ minSelect: Math.max(this.draft().isRequired ? 1 : 0, Math.min(n, this.draft().maxSelect)) });
  }

  protected setMax(n: number): void {
    this.patch({ maxSelect: Math.max(1, this.draft().minSelect, Math.min(n, this.draft().values.length)) });
  }

  protected toggleDefault(i: number): void {
    const d = this.draft();
    const turningOn = !d.values[i].isDefault;
    if (turningOn && !d.values[i].isAvailable) return;
    this.draft.update((g) => ({
      ...g,
      values: g.values.map((v, idx) =>
        idx === i ? { ...v, isDefault: turningOn } : g.optionType === 'SINGLE' && turningOn ? { ...v, isDefault: false } : v,
      ),
    }));
  }

  protected addValue(): void {
    // Si el máximo cubría todas las opciones, sigue cubriéndolas al agregar una.
    this.draft.update((d) => ({
      ...d,
      values: [...d.values, emptyValue()],
      maxSelect: d.optionType === 'MULTIPLE' && d.maxSelect === d.values.length ? d.values.length + 1 : d.maxSelect,
    }));
    queueMicrotask(() => document.querySelectorAll<HTMLInputElement>('.vrow__label').item(this.draft().values.length - 1)?.focus());
  }

  protected removeValue(i: number): void {
    this.draft.update((d) => {
      const values = d.values.filter((_, idx) => idx !== i);
      return { ...d, values, maxSelect: Math.min(d.maxSelect, values.length), minSelect: Math.min(d.minSelect, values.length) };
    });
  }

  protected reorder(ev: CustomEvent<ReorderEndEventDetail>): void {
    if (ev.detail.from === ev.detail.to) return void ev.detail.complete(false);
    const values = ev.detail.complete([...this.draft().values]) as OptionValue[];
    this.patch({ values });
  }

  protected async cancel(): Promise<void> {
    if (JSON.stringify(this.draft()) !== this.initial && !(await this.confirm('¿Descartar cambios?', 'Los cambios del grupo no se guardarán.', 'Descartar'))) return;
    await this.modals.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    const values = d.values.map((v) => ({ ...v, label: v.label.trim() }));
    if (d.name.trim().length < 2) return void this.notify.toast('Ponle un nombre al grupo.', 'error');
    if (values.some((v) => !v.label)) return void this.notify.toast('Hay opciones sin nombre: complétalas o quítalas.', 'error');
    const maxSelect = d.optionType === 'SINGLE' ? 1 : Math.max(1, Math.min(d.maxSelect, values.length));
    const minSelect = Math.min(d.minSelect, maxSelect);
    this.saving.set(true);
    const saved = await this.store.saveGroup({ ...d, name: d.name.trim(), values, minSelect, maxSelect });
    this.saving.set(false);
    if (saved) {
      void this.notify.toast(`Grupo "${saved.name}" guardado`, 'success', 1500);
      await this.modals.dismiss(saved, 'saved');
    }
  }

  protected async remove(): Promise<void> {
    const n = this.usedIn().length;
    const msg = n ? `Se quitará de ${n} plato${n === 1 ? '' : 's'}: ${this.usedIn().join(', ')}.` : 'No lo usa ningún plato.';
    if (!(await this.confirm(`¿Eliminar "${this.group!.name}"?`, msg, 'Eliminar'))) return;
    this.saving.set(true);
    const ok = await this.store.deleteGroup(this.group!);
    this.saving.set(false);
    if (ok) await this.modals.dismiss(null, 'deleted');
  }

  private async confirm(header: string, message: string, okText: string): Promise<boolean> {
    const a = await this.alerts.create({ header, message, buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: okText, role: 'confirm' }] });
    await a.present();
    return (await a.onDidDismiss()).role === 'confirm';
  }
}
