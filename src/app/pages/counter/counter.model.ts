import { PaymentMethod } from '../../core/models';

/** Menú público (get_public_menu): mismo formato que usa la web. */
export interface MenuOptionValue {
  id: string;
  label: string;
  priceDelta: number;
  isAvailable: boolean;
  isDefault?: boolean;
}

export interface MenuOption {
  id: string;
  name: string;
  optionType: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  values: MenuOptionValue[];
}

export interface MenuProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
  sortOrder: number;
  options: MenuOption[];
}

export interface MenuCategory {
  id: string;
  name: string;
  icon: string | null;
}

export interface PublicMenu {
  settings: { paymentMethods: PaymentMethod[] };
  categories: MenuCategory[];
  products: MenuProduct[];
}

/** Línea del pedido en armado. */
export interface CounterLine {
  key: number;
  product: MenuProduct;
  quantity: number;
  selected: string[];
  notes: string;
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Precio unitario con extras (el servidor lo vuelve a calcular; esto es solo para mostrar). */
export function unitPrice(product: MenuProduct, selected: readonly string[]): number {
  const set = new Set(selected);
  return round(product.price + product.options.flatMap((o) => o.values).filter((v) => set.has(v.id)).reduce((s, v) => s + v.priceDelta, 0));
}

/** Error de selección por grupo (mismas reglas que la web y el servidor). */
export function selectionErrors(product: MenuProduct, selected: readonly string[]): Record<string, string> {
  const set = new Set(selected);
  const errors: Record<string, string> = {};
  for (const g of product.options) {
    const count = g.values.filter((v) => set.has(v.id)).length;
    const min = g.isRequired ? Math.max(1, g.minSelect) : g.minSelect;
    if (count < min) errors[g.id] = g.optionType === 'SINGLE' ? 'Elige una opción' : `Elige al menos ${min}`;
    else if (count > g.maxSelect) errors[g.id] = `Máximo ${g.maxSelect}`;
  }
  return errors;
}

/** "Término medio · Queso extra" */
export function optionSummary(product: MenuProduct, selected: readonly string[]): string {
  const set = new Set(selected);
  return product.options.flatMap((g) => g.values.filter((v) => set.has(v.id)).map((v) => v.label)).join(' · ');
}

/** Opciones con las que arranca un plato: las preseleccionadas por el administrador;
 *  en un grupo obligatorio de una sola opción sin preselección, la primera disponible. */
export function defaultSelection(product: MenuProduct): string[] {
  return product.options.flatMap((g) => {
    const defaults = g.values.filter((v) => v.isDefault && v.isAvailable).slice(0, g.maxSelect).map((v) => v.id);
    if (defaults.length || !(g.isRequired && g.optionType === 'SINGLE')) return defaults;
    const first = g.values.find((v) => v.isAvailable);
    return first ? [first.id] : [];
  });
}
