import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonFooter, IonHeader, IonToolbar, ModalController } from '@ionic/angular';
import { MoneyPipe } from '../../shared/money.pipe';
import { CounterLine, defaultSelection, MenuOption, MenuProduct, selectionErrors, unitPrice } from './counter.model';

/**
 * Elegir opciones, cantidad y nota de un plato (mismas reglas que la web).
 * componentProps: { product, line? }. Al confirmar: dismiss({ quantity, selected, notes }, 'saved').
 */
@Component({
  selector: 'app-counter-item',
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, FormsModule, MoneyPipe],
  template: `
    <ion-header class="editor-header">
      <ion-toolbar>
        <div class="editor-header__row">
          <button type="button" class="icon-btn" (click)="modals.dismiss(null, 'cancel', modalId)" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          <div class="editor-header__title"><small>{{ product.price | money }}</small><strong>{{ product.name }}</strong></div>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content class="editor">
      <div class="editor__inner">
        @if (product.description) { <p class="footnote">{{ product.description }}</p> }
        @for (g of product.options; track g.id) {
          <section class="editor__section ctr-opt" [class.ctr-opt--error]="touched() && errors()[g.id]">
            <h3 class="editor__title">{{ g.name }} <small class="ctr-opt__hint">{{ touched() && errors()[g.id] ? errors()[g.id] : hint(g) }}</small></h3>
            <div class="ctr-opt__values">
              @for (v of g.values; track v.id) {
                <button type="button" class="ctr-opt__value" [class.ctr-opt__value--on]="isSelected(v.id)" [disabled]="!v.isAvailable"
                  [attr.aria-pressed]="isSelected(v.id)" (click)="toggle(g, v.id)">
                  <i [class]="checkIcon(g, v.id)" aria-hidden="true"></i>
                  <span>{{ v.label }}</span>
                  @if (!v.isAvailable) { <small>Agotado</small> } @else if (v.priceDelta) { <small>+{{ v.priceDelta | money }}</small> }
                </button>
              }
            </div>
          </section>
        }
        <section class="editor__section">
          <label class="field">
            <span class="field__label">Nota para cocina <span class="muted">(opcional)</span></span>
            <span class="field__control"><i class="fa-solid fa-pen"></i>
              <input [ngModel]="notes()" (ngModelChange)="notes.set($event)" maxlength="140" placeholder="Ej.: sin cebolla" />
            </span>
          </label>
        </section>
      </div>
    </ion-content>
    <ion-footer class="editor-footer">
      <div class="editor-footer__row">
        <div class="ctr-qty" role="group" aria-label="Cantidad">
          <button type="button" class="icon-btn" (click)="quantity.set(quantity() - 1)" [disabled]="quantity() <= 1" aria-label="Menos"><i class="fa-solid fa-minus"></i></button>
          <strong>{{ quantity() }}</strong>
          <button type="button" class="icon-btn" (click)="quantity.set(quantity() + 1)" [disabled]="quantity() >= 20" aria-label="Más"><i class="fa-solid fa-plus"></i></button>
        </div>
        <button type="button" class="btn btn--primary btn--lg editor-footer__main" (click)="save()">
          <i class="fa-solid fa-check"></i> {{ line ? 'Actualizar' : 'Agregar' }} · {{ total() | money }}
        </button>
      </div>
    </ion-footer>
  `,
})
export class CounterItemComponent implements OnInit {
  /** componentProps */
  product!: MenuProduct;
  line?: CounterLine;
  /** Id del modal: cerrar SIEMPRE este, nunca el que esté encima. */
  modalId!: string;

  protected readonly modals = inject(ModalController);
  protected readonly selected = signal<string[]>([]);
  protected readonly quantity = signal(1);
  protected readonly notes = signal('');
  protected readonly touched = signal(false);
  protected readonly errors = computed(() => selectionErrors(this.product, this.selected()));
  protected readonly total = computed(() => unitPrice(this.product, this.selected()) * this.quantity());

  ngOnInit(): void {
    if (this.line) {
      const available = new Set(this.product.options.flatMap((g) => g.values.filter((v) => v.isAvailable).map((v) => v.id)));
      this.selected.set(this.line.selected.filter((id) => available.has(id)));
      this.quantity.set(this.line.quantity);
      this.notes.set(this.line.notes);
      return;
    }
    this.selected.set(defaultSelection(this.product));
  }

  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  /** Marcada: ícono relleno. Sin marcar: solo el contorno (para que no parezca elegida). */
  protected checkIcon(g: MenuOption, id: string): string {
    const on = this.isSelected(id);
    if (g.optionType === 'SINGLE') return on ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle';
    return on ? 'fa-solid fa-square-check' : 'fa-regular fa-square';
  }

  protected hint(g: MenuOption): string {
    if (g.optionType === 'SINGLE') return g.isRequired ? 'Obligatorio' : 'Opcional';
    return g.maxSelect > 1 ? `Hasta ${g.maxSelect}` : 'Opcional';
  }

  protected toggle(g: MenuOption, valueId: string): void {
    const ids = new Set(g.values.map((v) => v.id));
    this.selected.update((sel) => {
      if (g.optionType === 'SINGLE') return [...sel.filter((id) => !ids.has(id)), valueId];
      return sel.includes(valueId) ? sel.filter((id) => id !== valueId) : [...sel, valueId];
    });
  }

  protected save(): void {
    this.touched.set(true);
    if (Object.keys(this.errors()).length) return;
    void this.modals.dismiss({ quantity: this.quantity(), selected: this.selected(), notes: this.notes().trim() }, 'saved', this.modalId);
  }
}
