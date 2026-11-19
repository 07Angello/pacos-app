import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { STAFF_BACKEND } from './backend/backend';
import { prepareMenuImage } from './image';
import { ApiError, Category, OptionGroup, Product } from './models';
import { NotifyService } from './notify.service';

interface AdminMenu {
  categories: Category[];
  products: Product[];
  optionGroups: OptionGroup[];
}

export interface ProductDraft {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imagePath: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  optionGroupIds: string[];
}

/**
 * Estado del editor de menú (solo ADMIN). Toda escritura pasa por RPCs que validan
 * rol y datos en el backend; aquí solo se refleja lo que el backend devuelve.
 */
@Injectable({ providedIn: 'root' })
export class MenuAdminStore {
  private readonly backend = inject(STAFF_BACKEND);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  readonly categories = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly groups = signal<OptionGroup[]>([]);
  readonly loading = signal(false);
  readonly busy = signal<ReadonlySet<string>>(new Set());

  readonly sortedCategories = computed(() => [...this.categories()].sort((a, b) => a.sortOrder - b.sortOrder));
  readonly productsById = computed(() => new Map(this.products().map((p) => [p.id, p])));
  readonly groupsById = computed(() => new Map(this.groups().map((g) => [g.id!, g])));

  imageUrl(path: string | null | undefined): string | null {
    return this.backend.menuImageUrl(path);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const menu = await this.backend.rpc<AdminMenu>('admin_get_menu');
      this.categories.set(menu.categories);
      this.products.set(menu.products);
      this.groups.set(menu.optionGroups);
    } catch (e) {
      this.fail(e, 'No se pudo cargar el menú.');
    } finally {
      this.loading.set(false);
    }
  }

  // ---------------------------------------------------------------- platos
  async saveProduct(draft: ProductDraft): Promise<Product | null> {
    return this.run(draft.id ?? 'new-product', async () => {
      const saved = await this.backend.rpc<Product>('admin_upsert_product', draft);
      this.products.update((list) => (list.some((p) => p.id === saved.id) ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved]));
      await this.refreshGroups();
      return saved;
    });
  }

  async archiveProduct(p: Product): Promise<boolean> {
    const ok = await this.run(p.id, async () => {
      await this.backend.rpc('admin_archive_product', { product_id: p.id });
      this.products.update((list) => list.filter((x) => x.id !== p.id));
      await this.refreshGroups();
      return true;
    });
    return !!ok;
  }

  async setAvailability(p: Product, isAvailable: boolean): Promise<void> {
    await this.run(p.id, async () => {
      const updated = await this.backend.rpc<Product>('update_product_availability', { product_id: p.id, is_available: isAvailable });
      this.products.update((list) => list.map((x) => (x.id === p.id ? updated : x)));
    });
  }

  async uploadImage(file: File, productKey: string): Promise<string | null> {
    return this.run(`img-${productKey}`, async () => {
      const blob = await prepareMenuImage(file);
      const path = `products/${productKey}-${Date.now()}.webp`;
      return this.backend.uploadMenuImage(blob, path);
    });
  }

  // ---------------------------------------------------------------- grupos
  async saveGroup(group: OptionGroup): Promise<OptionGroup | null> {
    return this.run(group.id ?? 'new-group', async () => {
      const saved = await this.backend.rpc<OptionGroup>('admin_upsert_option_group', group);
      this.groups.update((list) => (list.some((g) => g.id === saved.id) ? list.map((g) => (g.id === saved.id ? saved : g)) : [...list, saved]));
      // Los platos que usan el grupo muestran los valores nuevos.
      if (group.id) await this.reloadProducts();
      return saved;
    });
  }

  async deleteGroup(group: OptionGroup): Promise<boolean> {
    const ok = await this.run(group.id!, async () => {
      await this.backend.rpc('admin_delete_option_group', { id: group.id });
      this.groups.update((list) => list.filter((g) => g.id !== group.id));
      await this.reloadProducts();
      return true;
    });
    return !!ok;
  }

  // ------------------------------------------------------------ categorías
  async saveCategory(c: Partial<Category>): Promise<Category | null> {
    return this.run(c.id ?? 'new-category', async () => {
      const saved = await this.backend.rpc<Category>('admin_upsert_category', c);
      this.categories.update((list) => (list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]));
      return saved;
    });
  }

  async deleteCategory(c: Category): Promise<boolean> {
    const ok = await this.run(c.id, async () => {
      await this.backend.rpc('admin_delete_category', { id: c.id });
      this.categories.update((list) => list.filter((x) => x.id !== c.id));
      return true;
    });
    return !!ok;
  }

  async reorder(kind: 'categories' | 'products', ids: string[]): Promise<void> {
    // Reflejo inmediato del arrastre; si falla, se recarga desde el backend.
    if (kind === 'categories') {
      this.categories.update((list) => list.map((c) => ({ ...c, sortOrder: ids.indexOf(c.id) + 1 || c.sortOrder })));
    } else {
      this.products.update((list) => list.map((p) => (ids.includes(p.id) ? { ...p, sortOrder: ids.indexOf(p.id) + 1 } : p)));
    }
    const ok = await this.run(`reorder-${kind}`, async () => {
      await this.backend.rpc('admin_reorder', { kind, ids });
      return true;
    });
    if (!ok) await this.load();
  }

  // ---------------------------------------------------------------- helpers
  isBusy(key: string): boolean {
    return this.busy().has(key);
  }

  private async reloadProducts(): Promise<void> {
    const menu = await this.backend.rpc<AdminMenu>('admin_get_menu');
    this.products.set(menu.products);
    this.groups.set(menu.optionGroups);
  }

  private async refreshGroups(): Promise<void> {
    const menu = await this.backend.rpc<AdminMenu>('admin_get_menu');
    this.groups.set(menu.optionGroups);
  }

  private async run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    this.busy.update((s) => new Set(s).add(key));
    try {
      return await fn();
    } catch (e) {
      this.fail(e, 'No se pudo guardar.');
      return null;
    } finally {
      this.busy.update((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  private fail(e: unknown, fallback: string): void {
    if (this.auth.handleAuthError(e)) return;
    void this.notify.toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback, 'error', 4000);
  }
}

/** Resumen legible de un grupo: "Elige 1 · obligatorio", "Hasta 4 · +L10–30". */
export function groupSummary(g: Pick<OptionGroup, 'optionType' | 'isRequired' | 'minSelect' | 'maxSelect' | 'values'>): string {
  const rule =
    g.optionType === 'SINGLE'
      ? g.isRequired ? 'Elige 1 · obligatorio' : 'Elige 1 · opcional'
      : g.minSelect > 0
        ? `Elige ${g.minSelect}–${g.maxSelect}`
        : `Hasta ${g.maxSelect} · opcional`;
  const prices = g.values.map((v) => Number(v.priceDelta)).filter((n) => n > 0);
  if (!prices.length) return rule;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return `${rule} · +L${min}${max !== min ? `–${max}` : ''}`;
}

/** Íconos disponibles para categorías (Font Awesome Free). */
export const CATEGORY_ICONS = [
  'fa-burger', 'fa-hotdog', 'fa-pizza-slice', 'fa-drumstick-bite', 'fa-bowl-food', 'fa-bowl-rice',
  'fa-bacon', 'fa-egg', 'fa-cheese', 'fa-fish', 'fa-shrimp', 'fa-pepper-hot',
  'fa-carrot', 'fa-seedling', 'fa-bread-slice', 'fa-cookie', 'fa-ice-cream', 'fa-cake-candles',
  'fa-mug-hot', 'fa-mug-saucer', 'fa-glass-water', 'fa-wine-glass', 'fa-martini-glass-citrus', 'fa-beer-mug-empty',
  'fa-box-open', 'fa-star', 'fa-fire', 'fa-children', 'fa-utensils', 'fa-leaf',
];
