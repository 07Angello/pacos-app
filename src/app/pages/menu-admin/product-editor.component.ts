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
import { groupSummary, MenuAdminStore, ProductDraft } from '../../core/menu-admin.store';
import { OptionGroup, Product } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { GroupEditorComponent } from './group-editor.component';

/**
 * Crea o edita un plato: datos, foto, categoría y grupos de opciones (en orden).
 * componentProps: { product?: Product; categoryId?: string }.
 */
@Component({
  selector: 'app-product-editor',
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonToggle, IonReorderGroup, IonReorder, FormsModule, MoneyPipe],
  template: `
    <ion-header class="editor-header">
      <ion-toolbar>
        <div class="editor-header__row">
          <button type="button" class="icon-btn" (click)="cancel()" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          <div class="editor-header__title">
            <small>Plato</small>
            <strong>{{ product?.id ? draft().name || 'Editar plato' : 'Nuevo plato' }}</strong>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="editor">
      <div class="editor__inner editor__inner--wide">
        <div class="editor__cols">
          <div>
            <!-- Foto -->
            <section class="editor__section">
              <div class="photo">
                @if (imageUrl(); as url) {
                  <img [src]="url" alt="Foto del plato" class="photo__img" />
                } @else {
                  <div class="photo__empty"><i class="fa-solid" [class]="categoryIcon()"></i><span>Sin foto: la web mostrará el ícono de la categoría</span></div>
                }
                @if (uploading()) { <div class="photo__loading"><i class="fa-solid fa-spinner fa-spin"></i> Subiendo…</div> }
              </div>
              <div class="photo__actions">
                <label class="btn btn--ghost" [class.btn--disabled]="uploading()">
                  <i class="fa-solid fa-camera"></i> {{ draft().imagePath ? 'Cambiar foto' : 'Subir foto' }}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="pickImage($event)" [disabled]="uploading()" />
                </label>
                @if (draft().imagePath) {
                  <button type="button" class="btn btn--danger-ghost" (click)="patch({ imagePath: null })"><i class="fa-solid fa-image"></i> Quitar</button>
                }
              </div>
            </section>

            <!-- Datos -->
            <section class="editor__section">
              <label class="field">
                <span class="field__label">Nombre</span>
                <span class="field__control"><i class="fa-solid fa-utensils"></i>
                  <input [ngModel]="draft().name" (ngModelChange)="patch({ name: $event })" maxlength="80" placeholder="Ej.: Combo Paco" />
                </span>
              </label>
              <label class="field">
                <span class="field__label">Descripción</span>
                <textarea class="field__area" rows="3" [ngModel]="draft().description" (ngModelChange)="patch({ description: $event })" maxlength="240"
                  placeholder="Ingredientes o qué incluye. Ej.: Hamburguesa + papas + bebida"></textarea>
              </label>
              <div class="editor__grid">
                <label class="field">
                  <span class="field__label">Precio base</span>
                  <span class="field__control"><span class="field__prefix">L</span>
                    <input type="number" inputmode="decimal" min="0" step="0.5" [ngModel]="draft().price" (ngModelChange)="patch({ price: toNumber($event) })" />
                  </span>
                </label>
                <label class="field">
                  <span class="field__label">Categoría</span>
                  <span class="field__control"><i class="fa-solid" [class]="categoryIcon()"></i>
                    <select [ngModel]="draft().categoryId" (ngModelChange)="patch({ categoryId: $event })">
                      @for (c of store.sortedCategories(); track c.id) {
                        <option [value]="c.id">{{ c.name }}</option>
                      }
                    </select>
                  </span>
                </label>
              </div>
              <div class="setting">
                <div><strong>Disponible</strong><span>Si lo apagas, aparece como agotado</span></div>
                <ion-toggle [checked]="draft().isAvailable" (ionChange)="patch({ isAvailable: $event.detail.checked })" aria-label="Disponible" />
              </div>
              <div class="setting">
                <div><strong>Destacado</strong><span>Aparece en "Los favoritos" de la web</span></div>
                <ion-toggle [checked]="draft().isFeatured" (ionChange)="patch({ isFeatured: $event.detail.checked })" aria-label="Destacado" />
              </div>
            </section>
          </div>

          <div>
            <!-- Opciones -->
            <section class="editor__section">
              <h3 class="editor__title"><i class="fa-solid fa-sliders"></i> Opciones del plato</h3>
              <p class="editor__hint">Extras, término, ingredientes a quitar o las elecciones de un combo. Arrastra para cambiar el orden en que las ve el cliente.</p>
              @if (linked().length) {
                <ion-reorder-group [disabled]="false" (ionReorderEnd)="reorderGroups($event)">
                  @for (g of linked(); track g.id) {
                    <div class="glink">
                      <ion-reorder slot="start"><i class="fa-solid fa-grip-vertical vrow__grip"></i></ion-reorder>
                      <button type="button" class="glink__body" (click)="editGroup(g)">
                        <strong>{{ g.name }}</strong>
                        <span>{{ summary(g) }}</span>
                        <span class="glink__values">{{ valuesText(g) }}</span>
                        @if ((g.productIds?.length ?? 0) > 1) {
                          <span class="glink__shared"><i class="fa-solid fa-link"></i> Compartido con {{ (g.productIds?.length ?? 1) - (isLinkedHere(g) ? 1 : 0) }} plato(s) más</span>
                        }
                      </button>
                      <button type="button" class="vrow__btn vrow__btn--danger" (click)="unlink(g)" [attr.aria-label]="'Quitar ' + g.name + ' de este plato'"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                  }
                </ion-reorder-group>
              } @else {
                <p class="empty-inline"><i class="fa-solid fa-circle-info"></i> Este plato no tiene opciones: se agrega directo al carrito.</p>
              }
              <div class="editor__actions">
                <button type="button" class="btn btn--ghost" (click)="addExisting()" [disabled]="!available().length"><i class="fa-solid fa-link"></i> Usar grupo existente</button>
                <button type="button" class="btn btn--ghost" (click)="createGroup()"><i class="fa-solid fa-plus"></i> Crear grupo nuevo</button>
              </div>
            </section>

            <!-- Vista previa -->
            <section class="editor__section">
              <h3 class="editor__title"><i class="fa-solid fa-mobile-screen"></i> Así lo verá el cliente</h3>
              <div class="preview">
                <div class="preview__head preview__head--product">
                  <strong>{{ draft().name || 'Nombre del plato' }}</strong>
                  <span class="preview__price">{{ draft().price | money }}</span>
                </div>
                @if (draft().description) { <p class="preview__desc">{{ draft().description }}</p> }
                @for (g of linked(); track g.id) {
                  <div class="preview__group">
                    <div class="preview__head"><strong>{{ g.name }}</strong><span class="preview__chip">{{ summary(g) }}</span></div>
                    @for (v of g.values; track v.id) {
                      <div class="preview__row" [class.preview__row--off]="!v.isAvailable">
                        <i [class]="g.optionType === 'SINGLE' ? (v.isDefault ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle') : (v.isDefault ? 'fa-solid fa-square-check' : 'fa-regular fa-square')"></i>
                        <span>{{ v.label }}</span>
                        @if (!v.isAvailable) { <em>Agotado</em> } @else if (v.priceDelta > 0) { <em>+ {{ v.priceDelta | money }}</em> }
                      </div>
                    }
                  </div>
                }
                @if (!draft().isAvailable) { <p class="preview__off"><i class="fa-solid fa-ban"></i> Se muestra como agotado</p> }
              </div>
            </section>
          </div>
        </div>
      </div>
    </ion-content>

    <ion-footer class="editor-footer">
      <div class="editor-footer__row">
        @if (product?.id) {
          <button type="button" class="btn btn--danger-ghost" (click)="archive()" [disabled]="saving()"><i class="fa-solid fa-trash-can"></i> Eliminar</button>
        }
        <button type="button" class="btn btn--primary btn--lg editor-footer__main" (click)="save()" [disabled]="saving() || uploading()">
          @if (saving()) { <i class="fa-solid fa-spinner fa-spin"></i> Guardando… } @else { <i class="fa-solid fa-check"></i> Guardar plato }
        </button>
      </div>
    </ion-footer>
  `,
})
export class ProductEditorComponent implements OnInit {
  /** componentProps */
  product?: Product;
  categoryId?: string;

  protected readonly store = inject(MenuAdminStore);
  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);
  private readonly notify = inject(NotifyService);

  protected readonly draft = signal<ProductDraft>({
    categoryId: '', name: '', description: '', price: 0, imagePath: null, isAvailable: true, isFeatured: false, optionGroupIds: [],
  });
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  private initial = '';
  private readonly uploadKey = crypto.randomUUID();

  protected readonly linked = computed(() =>
    this.draft().optionGroupIds.map((id) => this.store.groupsById().get(id)).filter((g): g is OptionGroup => !!g),
  );
  protected readonly available = computed(() => this.store.groups().filter((g) => !this.draft().optionGroupIds.includes(g.id!)));
  protected readonly imageUrl = computed(() => this.store.imageUrl(this.draft().imagePath));
  protected readonly categoryIcon = computed(() => this.store.categories().find((c) => c.id === this.draft().categoryId)?.icon ?? 'fa-utensils');

  ngOnInit(): void {
    const p = this.product;
    this.draft.set(
      p
        ? {
            id: p.id, categoryId: p.categoryId, name: p.name, description: p.description ?? '', price: Number(p.price),
            imagePath: p.imagePath, isAvailable: p.isAvailable, isFeatured: !!p.isFeatured, optionGroupIds: p.options.map((o) => o.id),
          }
        : { ...this.draft(), categoryId: this.categoryId ?? this.store.sortedCategories()[0]?.id ?? '' },
    );
    this.initial = JSON.stringify(this.draft());
  }

  protected patch(p: Partial<ProductDraft>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected toNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  protected summary(g: OptionGroup): string {
    return groupSummary(g);
  }

  protected valuesText(g: OptionGroup): string {
    return g.values.map((v) => v.label).join(' · ');
  }

  protected isLinkedHere(g: OptionGroup): boolean {
    return !!this.product?.id && !!g.productIds?.includes(this.product.id);
  }

  protected async pickImage(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return void this.notify.toast('La foto es demasiado grande (máx. 15 MB).', 'error');
    this.uploading.set(true);
    const path = await this.store.uploadImage(file, this.product?.id ?? this.uploadKey);
    this.uploading.set(false);
    if (path) this.patch({ imagePath: path });
  }

  protected reorderGroups(ev: CustomEvent<ReorderEndEventDetail>): void {
    if (ev.detail.from === ev.detail.to) return void ev.detail.complete(false);
    this.patch({ optionGroupIds: ev.detail.complete([...this.draft().optionGroupIds]) as string[] });
  }

  protected unlink(g: OptionGroup): void {
    this.patch({ optionGroupIds: this.draft().optionGroupIds.filter((id) => id !== g.id) });
  }

  protected async addExisting(): Promise<void> {
    const a = await this.alerts.create({
      header: 'Usar grupo existente',
      subHeader: 'Los cambios que hagas en un grupo se aplican a todos los platos que lo usan.',
      cssClass: 'pacos-alert-list',
      inputs: this.available().map((g) => ({ type: 'checkbox' as const, label: `${g.name} (${groupSummary(g)})`, value: g.id })),
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Agregar', role: 'confirm' }],
    });
    await a.present();
    const res = await a.onDidDismiss<{ values?: string[] }>();
    const picked = res.data?.values ?? [];
    if (res.role === 'confirm' && picked.length) {
      this.patch({ optionGroupIds: [...this.draft().optionGroupIds, ...picked.filter((id) => !this.draft().optionGroupIds.includes(id))] });
    }
  }

  protected async createGroup(): Promise<void> {
    const { data } = await this.openGroupEditor();
    if (data?.id) this.patch({ optionGroupIds: [...this.draft().optionGroupIds, data.id] });
  }

  protected async editGroup(g: OptionGroup): Promise<void> {
    const { role } = await this.openGroupEditor(g);
    if (role === 'deleted') this.unlink(g);
  }

  private async openGroupEditor(group?: OptionGroup): Promise<{ data?: OptionGroup | null; role?: string }> {
    const m = await this.modals.create({ component: GroupEditorComponent, componentProps: { group }, cssClass: 'editor-modal' });
    await m.present();
    return m.onDidDismiss<OptionGroup | null>();
  }

  protected async cancel(): Promise<void> {
    if (JSON.stringify(this.draft()) !== this.initial && !(await this.confirm('¿Descartar cambios?', 'Los cambios del plato no se guardarán.', 'Descartar'))) return;
    await this.modals.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    if (d.name.trim().length < 2) return void this.notify.toast('Ponle nombre al plato.', 'error');
    if (!d.categoryId) return void this.notify.toast('Elige una categoría.', 'error');
    this.saving.set(true);
    const saved = await this.store.saveProduct({ ...d, name: d.name.trim(), description: d.description.trim() });
    this.saving.set(false);
    if (saved) {
      void this.notify.toast(`"${saved.name}" guardado`, 'success', 1500);
      await this.modals.dismiss(saved, 'saved');
    }
  }

  protected async archive(): Promise<void> {
    if (!(await this.confirm(`¿Eliminar "${this.product!.name}"?`, 'Desaparece del menú. Los pedidos anteriores se conservan.', 'Eliminar'))) return;
    this.saving.set(true);
    const ok = await this.store.archiveProduct(this.product!);
    this.saving.set(false);
    if (ok) {
      void this.notify.toast('Plato eliminado del menú', 'success', 1500);
      await this.modals.dismiss(null, 'deleted');
    }
  }

  private async confirm(header: string, message: string, okText: string): Promise<boolean> {
    const a = await this.alerts.create({ header, message, buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: okText, role: 'confirm' }] });
    await a.present();
    return (await a.onDidDismiss()).role === 'confirm';
  }
}
