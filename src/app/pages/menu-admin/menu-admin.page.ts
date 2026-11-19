import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonRefresher,
  IonRefresherContent,
  IonReorder,
  IonReorderGroup,
  IonToggle,
  IonToolbar,
  ReorderEndEventDetail,
  ModalController,
} from '@ionic/angular';
import { groupSummary, MenuAdminStore } from '../../core/menu-admin.store';
import { Category, OptionGroup, Product } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { CategoryEditorComponent } from './category-editor.component';
import { GroupEditorComponent } from './group-editor.component';
import { ProductEditorComponent } from './product-editor.component';

type Tab = 'products' | 'groups' | 'categories';

/**
 * Editor de menú (solo ADMIN). El dueño configura platos, grupos de opciones
 * reutilizables y categorías sin programar; la web se actualiza al instante.
 */
@Component({
  selector: 'app-menu-admin',
  imports: [IonHeader, IonToolbar, IonContent, IonToggle, IonRefresher, IonRefresherContent, IonFab, IonFabButton, IonReorderGroup, IonReorder, FormsModule, MoneyPipe],
  template: `
    <ion-header class="app-header">
      <ion-toolbar>
        <div class="app-header__row">
          <div class="app-header__title">
            <span class="brand-mark"><i class="fa-solid fa-utensils"></i></span>
            <div>
              <h1>Menú</h1>
              <p>{{ availableCount() }} de {{ store.products().length }} platos disponibles · {{ store.groups().length }} grupos de opciones</p>
            </div>
          </div>
        </div>
        <div class="filters" role="tablist">
          @for (t of tabs; track t.id) {
            <button type="button" role="tab" class="filters__btn" [class.filters__btn--on]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="setTab(t.id)">
              <i class="fa-solid" [class]="t.icon"></i> {{ t.label }} <span class="filters__count">{{ count(t.id) }}</span>
            </button>
          }
        </div>
        @if (tab() !== 'categories') {
          <label class="search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="search" [placeholder]="tab() === 'products' ? 'Buscar plato…' : 'Buscar grupo u opción…'" [ngModel]="query()" (ngModelChange)="query.set($event)" aria-label="Buscar" />
          </label>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content class="page">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="page__inner">
        @if (store.loading() && !store.products().length) {
          <div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Cargando menú…</p></div>
        }

        <!-- ============================== PLATOS -->
        @if (tab() === 'products') {
          <div class="toolbar-row">
            <p class="footnote">Toca un plato para editar su foto, precio y opciones.</p>
            @if (!query()) {
              <button type="button" class="btn btn--ghost btn--sm" [class.btn--on]="sorting()" (click)="sorting.set(!sorting())">
                <i class="fa-solid" [class]="sorting() ? 'fa-check' : 'fa-arrow-down-up-across-line'"></i> {{ sorting() ? 'Listo' : 'Ordenar' }}
              </button>
            }
          </div>
          @for (g of productGroups(); track g.category.id) {
            <section class="card-block menu-group" [class.menu-group--off]="!g.category.isActive">
              <header class="menu-group__head">
                <span class="menu-group__icon"><i class="fa-solid" [class]="g.category.icon ?? 'fa-utensils'"></i></span>
                <div class="menu-group__title">
                  <h2>{{ g.category.name }}</h2>
                  <span>{{ g.category.isActive ? 'Visible en la web' : 'Oculta en la web' }} · {{ g.products.length }} platos</span>
                </div>
                <button type="button" class="icon-btn" (click)="newProduct(g.category.id)" [attr.aria-label]="'Nuevo plato en ' + g.category.name"><i class="fa-solid fa-plus"></i></button>
              </header>
              <ion-reorder-group [disabled]="!sorting()" (ionReorderEnd)="reorderProducts(g.category.id, $event)">
                @for (p of g.products; track p.id) {
                  <div class="pitem" [class.pitem--off]="!p.isAvailable">
                    <ion-reorder slot="start" [class.hidden]="!sorting()"><i class="fa-solid fa-grip-vertical vrow__grip"></i></ion-reorder>
                    <button type="button" class="pitem__main" (click)="editProduct(p)" [disabled]="sorting()" [attr.aria-label]="'Editar ' + p.name">
                      <span class="pitem__thumb">
                        @if (store.imageUrl(p.imagePath); as url) { <img [src]="url" alt="" loading="lazy" /> } @else { <i class="fa-solid" [class]="g.category.icon ?? 'fa-utensils'"></i> }
                      </span>
                      <span class="pitem__text">
                        <strong>{{ p.name }} @if (p.isFeatured) { <i class="fa-solid fa-fire pitem__fav" aria-label="Destacado"></i> }</strong>
                        <span class="pitem__price">{{ p.price | money }}</span>
                        <span class="pitem__meta">
                          @if (p.options.length) { <i class="fa-solid fa-sliders"></i> {{ optionNames(p) }} } @else { Sin opciones }
                        </span>
                      </span>
                      @if (!p.isAvailable) { <span class="tag tag--off">Agotado</span> }
                    </button>
                    @if (!sorting()) {
                      <ion-toggle [checked]="p.isAvailable" [disabled]="store.isBusy(p.id)" (ionChange)="store.setAvailability(p, $event.detail.checked)" [attr.aria-label]="'Disponible: ' + p.name" />
                    }
                  </div>
                }
              </ion-reorder-group>
            </section>
          } @empty {
            @if (!store.loading()) { <div class="empty"><i class="fa-solid fa-utensils"></i><p>No hay platos{{ query() ? ' que coincidan' : '' }}.</p></div> }
          }
        }

        <!-- ============================== GRUPOS DE OPCIONES -->
        @if (tab() === 'groups') {
          <p class="footnote">Crea un grupo una vez (ej.: "Extras de hamburguesa") y úsalo en varios platos. Si cambias un precio aquí, cambia en todos.</p>
          <div class="group-grid">
            @for (g of filteredGroups(); track g.id) {
              <button type="button" class="gcard" (click)="editGroup(g)">
                <span class="gcard__head">
                  <i class="fa-regular" [class]="g.optionType === 'SINGLE' ? 'fa-circle-dot' : 'fa-square-check'"></i>
                  <strong>{{ g.name }}</strong>
                </span>
                <span class="gcard__rule">{{ summary(g) }}</span>
                <span class="gcard__values">
                  @for (v of g.values; track v.id) {
                    <span class="gchip" [class.gchip--off]="!v.isAvailable" [class.gchip--default]="v.isDefault">
                      @if (v.isDefault) { <i class="fa-solid fa-star"></i> }{{ v.label }}@if (v.priceDelta > 0) { <em>+{{ v.priceDelta }}</em> }
                    </span>
                  }
                </span>
                <span class="gcard__usage" [class.gcard__usage--none]="!usageCount(g)">
                  <i class="fa-solid fa-link"></i>
                  {{ usageText(g) }}
                </span>
              </button>
            } @empty {
              @if (!store.loading()) { <div class="empty"><i class="fa-solid fa-layer-group"></i><p>Aún no hay grupos de opciones.</p></div> }
            }
          </div>
        }

        <!-- ============================== CATEGORÍAS -->
        @if (tab() === 'categories') {
          <p class="footnote">Arrastra para cambiar el orden en que aparecen en la web.</p>
          <section class="card-block">
            <ion-reorder-group [disabled]="false" (ionReorderEnd)="reorderCategories($event)">
              @for (c of store.sortedCategories(); track c.id) {
                <div class="citem" [class.citem--off]="!c.isActive">
                  <ion-reorder slot="start"><i class="fa-solid fa-grip-vertical vrow__grip"></i></ion-reorder>
                  <button type="button" class="citem__main" (click)="editCategory(c)" [attr.aria-label]="'Editar ' + c.name">
                    <span class="menu-group__icon"><i class="fa-solid" [class]="c.icon ?? 'fa-utensils'"></i></span>
                    <span class="citem__text"><strong>{{ c.name }}</strong><span>{{ productCount(c.id) }} platos{{ c.description ? ' · ' + c.description : '' }}</span></span>
                  </button>
                  <ion-toggle [checked]="c.isActive" (ionChange)="toggleCategory(c, $event.detail.checked)" [attr.aria-label]="'Visible: ' + c.name" />
                </div>
              }
            </ion-reorder-group>
          </section>
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="create()" [attr.aria-label]="createLabel()" class="fab-main">
          <i class="fa-solid fa-plus"></i>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class MenuAdminPage implements OnInit {
  protected readonly store = inject(MenuAdminStore);
  private readonly modal = inject(ModalController);
  private readonly notify = inject(NotifyService);

  protected readonly tab = signal<Tab>('products');
  protected readonly query = signal('');
  protected readonly sorting = signal(false);

  protected readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'products', label: 'Platos', icon: 'fa-burger' },
    { id: 'groups', label: 'Opciones', icon: 'fa-sliders' },
    { id: 'categories', label: 'Categorías', icon: 'fa-folder-tree' },
  ];

  protected readonly availableCount = computed(() => this.store.products().filter((p) => p.isAvailable).length);

  protected readonly productGroups = computed(() => {
    const q = normalize(this.query());
    return this.store
      .sortedCategories()
      .map((category) => ({
        category,
        products: this.store
          .products()
          .filter((p) => p.categoryId === category.id && (!q || normalize(p.name).includes(q)))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.products.length || !q);
  });

  protected readonly filteredGroups = computed(() => {
    const q = normalize(this.query());
    return this.store
      .groups()
      .filter((g) => !q || normalize(g.name).includes(q) || g.values.some((v) => normalize(v.label).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  ngOnInit(): void {
    void this.store.load();
  }

  protected setTab(t: Tab): void {
    this.tab.set(t);
    this.query.set('');
    this.sorting.set(false);
  }

  protected count(t: Tab): number {
    return t === 'products' ? this.store.products().length : t === 'groups' ? this.store.groups().length : this.store.categories().length;
  }

  protected summary(g: OptionGroup): string {
    return groupSummary(g);
  }

  protected optionNames(p: Product): string {
    return p.options.map((o) => o.name).join(' · ');
  }

  protected usageCount(g: OptionGroup): number {
    return g.productIds?.length ?? 0;
  }

  protected usageText(g: OptionGroup): string {
    const n = this.usageCount(g);
    if (!n) return 'No lo usa ningún plato';
    const names = (g.productIds ?? []).map((id) => this.store.productsById().get(id)?.name).filter(Boolean).join(', ');
    return `Usado en ${n} plato${n === 1 ? '' : 's'}: ${names}`;
  }

  protected productCount(categoryId: string): number {
    return this.store.products().filter((p) => p.categoryId === categoryId).length;
  }

  protected createLabel(): string {
    return { products: 'Nuevo plato', groups: 'Nuevo grupo de opciones', categories: 'Nueva categoría' }[this.tab()];
  }

  protected create(): void {
    if (this.tab() === 'products') void this.newProduct();
    else if (this.tab() === 'groups') void this.editGroup();
    else void this.editCategory();
  }

  protected newProduct(categoryId?: string): Promise<void> {
    if (!this.store.categories().length) {
      void this.notify.toast('Primero crea una categoría.', 'info');
      return Promise.resolve();
    }
    return this.open(ProductEditorComponent, { categoryId });
  }

  protected editProduct(p: Product): Promise<void> {
    return this.open(ProductEditorComponent, { product: p });
  }

  protected editGroup(g?: OptionGroup): Promise<void> {
    return this.open(GroupEditorComponent, { group: g });
  }

  protected editCategory(c?: Category): Promise<void> {
    return this.open(CategoryEditorComponent, { category: c });
  }

  protected async toggleCategory(c: Category, isActive: boolean): Promise<void> {
    if (c.isActive !== isActive) await this.store.saveCategory({ ...c, isActive });
  }

  protected reorderCategories(ev: CustomEvent<ReorderEndEventDetail>): void {
    if (ev.detail.from === ev.detail.to) return void ev.detail.complete(false);
    const ids = ev.detail.complete(this.store.sortedCategories().map((c) => c.id)) as string[];
    void this.store.reorder('categories', ids);
  }

  protected reorderProducts(categoryId: string, ev: CustomEvent<ReorderEndEventDetail>): void {
    if (ev.detail.from === ev.detail.to) return void ev.detail.complete(false);
    const current = this.productGroups().find((g) => g.category.id === categoryId)?.products.map((p) => p.id) ?? [];
    void this.store.reorder('products', ev.detail.complete(current) as string[]);
  }

  protected async refresh(ev: CustomEvent): Promise<void> {
    await this.store.load();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  private async open(component: unknown, componentProps: Record<string, unknown>): Promise<void> {
    const m = await this.modal.create({ component: component as never, componentProps, cssClass: 'editor-modal' });
    await m.present();
  }
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
