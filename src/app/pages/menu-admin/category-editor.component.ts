import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonContent, IonFooter, IonHeader, IonToggle, IonToolbar, ModalController } from '@ionic/angular';
import { CATEGORY_ICONS, MenuAdminStore } from '../../core/menu-admin.store';
import { Category } from '../../core/models';
import { NotifyService } from '../../core/notify.service';

/** Crea o edita una categoría del menú. componentProps: { category?: Category }. */
@Component({
  selector: 'app-category-editor',
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonToggle, FormsModule],
  template: `
    <ion-header class="editor-header">
      <ion-toolbar>
        <div class="editor-header__row">
          <button type="button" class="icon-btn" (click)="modals.dismiss(null, 'cancel')" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          <div class="editor-header__title"><small>Categoría</small><strong>{{ category?.id ? 'Editar categoría' : 'Nueva categoría' }}</strong></div>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content class="editor">
      <div class="editor__inner">
        <section class="editor__section">
          <label class="field">
            <span class="field__label">Nombre</span>
            <span class="field__control"><i class="fa-solid" [class]="icon()"></i>
              <input [ngModel]="name()" (ngModelChange)="name.set($event)" maxlength="60" placeholder="Ej.: Combos" />
            </span>
          </label>
          <label class="field">
            <span class="field__label">Descripción <span class="muted">(opcional)</span></span>
            <span class="field__control"><i class="fa-solid fa-align-left"></i>
              <input [ngModel]="description()" (ngModelChange)="description.set($event)" maxlength="160" placeholder="Ej.: Plato + acompañante + bebida" />
            </span>
          </label>
          <div class="setting">
            <div><strong>Visible en la web</strong><span>Si la ocultas, sus platos no aparecen</span></div>
            <ion-toggle [checked]="isActive()" (ionChange)="isActive.set($event.detail.checked)" aria-label="Visible en la web" />
          </div>
        </section>
        <section class="editor__section">
          <h3 class="editor__title">Ícono</h3>
          <div class="icon-grid" role="radiogroup" aria-label="Ícono de la categoría">
            @for (i of icons; track i) {
              <button type="button" role="radio" class="icon-grid__btn" [class.icon-grid__btn--on]="icon() === i" [attr.aria-checked]="icon() === i" (click)="icon.set(i)" [attr.aria-label]="i">
                <i class="fa-solid" [class]="i"></i>
              </button>
            }
          </div>
        </section>
      </div>
    </ion-content>
    <ion-footer class="editor-footer">
      <div class="editor-footer__row">
        @if (category?.id) {
          <button type="button" class="btn btn--danger-ghost" (click)="remove()" [disabled]="saving()"><i class="fa-solid fa-trash-can"></i> Eliminar</button>
        }
        <button type="button" class="btn btn--primary btn--lg editor-footer__main" (click)="save()" [disabled]="saving()">
          @if (saving()) { <i class="fa-solid fa-spinner fa-spin"></i> Guardando… } @else { <i class="fa-solid fa-check"></i> Guardar categoría }
        </button>
      </div>
    </ion-footer>
  `,
})
export class CategoryEditorComponent implements OnInit {
  /** componentProps */
  category?: Category;

  protected readonly modals = inject(ModalController);
  private readonly store = inject(MenuAdminStore);
  private readonly notify = inject(NotifyService);
  private readonly alerts = inject(AlertController);

  protected readonly icons = CATEGORY_ICONS;
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly icon = signal('fa-utensils');
  protected readonly isActive = signal(true);
  protected readonly saving = signal(false);

  ngOnInit(): void {
    if (!this.category) return;
    this.name.set(this.category.name);
    this.description.set(this.category.description ?? '');
    this.icon.set(this.category.icon ?? 'fa-utensils');
    this.isActive.set(this.category.isActive);
  }

  protected async remove(): Promise<void> {
    const c = this.category!;
    const count = this.store.products().filter((p) => p.categoryId === c.id).length;
    if (count > 0) {
      const a = await this.alerts.create({
        header: 'No se puede eliminar',
        message: `"${c.name}" tiene ${count} ${count === 1 ? 'plato' : 'platos'}. Muévelos a otra categoría o elimínalos primero. Si solo quieres esconderla, apaga "Visible en la web".`,
        buttons: [{ text: 'Entendido', role: 'cancel' }],
      });
      await a.present();
      return;
    }
    const a = await this.alerts.create({
      header: `¿Eliminar "${c.name}"?`,
      message: 'La categoría desaparece del menú. Los pedidos anteriores se conservan.',
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', role: 'confirm' }],
    });
    await a.present();
    if ((await a.onDidDismiss()).role !== 'confirm') return;
    this.saving.set(true);
    const ok = await this.store.deleteCategory(c);
    this.saving.set(false);
    if (ok) {
      void this.notify.toast(`Categoría "${c.name}" eliminada`, 'success', 1500);
      await this.modals.dismiss(null, 'deleted');
    }
  }

  protected async save(): Promise<void> {
    if (this.name().trim().length < 2) return void this.notify.toast('Ponle nombre a la categoría.', 'error');
    this.saving.set(true);
    const saved = await this.store.saveCategory({
      id: this.category?.id, name: this.name().trim(), description: this.description().trim(), icon: this.icon(), isActive: this.isActive(),
    });
    this.saving.set(false);
    if (saved) {
      void this.notify.toast(`Categoría "${saved.name}" guardada`, 'success', 1500);
      await this.modals.dismiss(saved, 'saved');
    }
  }
}
