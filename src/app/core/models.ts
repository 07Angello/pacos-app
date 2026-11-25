// Contratos de las RPCs del personal. Definidos por las funciones SQL del backend.

export type Role = 'ADMIN' | 'MANAGER' | 'CHEF';

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type OrderType = 'PICKUP' | 'DELIVERY' | 'DINE_IN';
/** WEB: pedido en línea · COUNTER: tomado en el local desde la app. */
export type OrderChannel = 'WEB' | 'COUNTER';

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

export interface OrderItemOption {
  optionName: string;
  valueName: string;
  priceDelta: number;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  notes: string;
  options: OrderItemOption[];
  /** Ausente para el rol CHEF. */
  unitPrice?: number;
  lineTotal?: number;
}

export interface OrderHistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId: string | null;
  actorLabel: string;
  reason: string | null;
  createdAt: string;
}

/** Pedido visto por el personal. Los campos opcionales no llegan al rol CHEF. */
export interface DeliveryLocation {
  lat: number;
  lng: number;
  /** Metros (solo si vino del GPS del cliente). */
  accuracy: number | null;
  /** GPS: ubicación del celular del cliente. MAP: el cliente movió el mapa hasta el punto. */
  source: 'GPS' | 'MAP';
}

export interface StaffOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderType: OrderType;
  channel?: OrderChannel;
  /** Quién lo tomó (solo pedidos del local). */
  createdBy?: string | null;
  customerName: string;
  customerPhone?: string | null;
  address?: { neighborhood: string; street: string; house: string; reference: string } | null;
  /** Punto que marcó el cliente en el mapa (solo referencia; puede faltar). */
  deliveryLocation?: DeliveryLocation | null;
  notes: string;
  paymentMethod?: string;
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  items: OrderItem[];
  createdAt: string;
  acceptedAt: string | null;
  acceptedBy?: string | null;
  startedAt: string | null;
  startedBy?: string | null;
  readyAt: string | null;
  readyBy?: string | null;
  outForDeliveryAt: string | null;
  outForDeliveryBy?: string | null;
  completedAt: string | null;
  completedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  /** Recogida programada por el cliente (null = lo antes posible). */
  scheduledFor?: string | null;
  /** Cuándo conviene empezar: hora programada − tiempo promedio de preparación actual. */
  reminderAt?: string | null;
  /** Cuándo el servidor envió el recordatorio a encargados/administradores. */
  reminderSentAt?: string | null;
  history?: OrderHistoryEntry[];
}

export interface OrderEvent {
  type: string;
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
}

export interface PaymentMethod {
  code: string;
  label: string;
}

export interface StaffSettings {
  name: string;
  tagline: string | null;
  phone: string | null;
  address: string | null;
  timezone: string;
  currencySymbol: string;
  isOpen: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryFee: number;
  estimatedPrepMinutes: number | null;
  kitchenDelayMinutes: number;
  showUnavailableProducts: boolean;
  /** Mapa de entrega en el checkout de la web. */
  deliveryMapEnabled?: boolean;
  paymentMethods: PaymentMethod[];
  businessHours: BusinessHour[];
}

/** Horario de un día. weekday: 0 = domingo … 6 = sábado. Horas 'HH:MM' (24 h); en pantalla se muestran en a. m./p. m. */
export interface BusinessHour {
  weekday: number;
  label: string;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface OptionValue {
  id?: string;
  label: string;
  priceDelta: number;
  isAvailable: boolean;
  /** Viene marcada al abrir el plato en la web. */
  isDefault: boolean;
}

export type OptionType = 'SINGLE' | 'MULTIPLE';

/** Grupo de opciones reutilizable (biblioteca). */
export interface OptionGroup {
  id?: string;
  name: string;
  optionType: OptionType;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  values: OptionValue[];
  /** Platos que usan el grupo (solo en la biblioteca). */
  productIds?: string[];
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imagePath: string | null;
  isAvailable: boolean;
  isFeatured?: boolean;
  sortOrder: number;
  options: (OptionGroup & { id: string; sortOrder: number })[];
}

export interface Employee {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  isActive: boolean;
  createdAt?: string;
  lastSignInAt?: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isAuth(): boolean {
    return this.status === 401 || this.code === 'INACTIVE';
  }
}
