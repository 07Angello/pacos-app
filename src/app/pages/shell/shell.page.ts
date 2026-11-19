import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { Role } from '../../core/models';
import { OrdersStore } from '../../core/orders.store';
import { PushService } from '../../core/push.service';

interface Tab {
  tab: string;
  label: string;
  icon: string;
  roles: Role[];
  badge?: () => number;
}

/** Navegación por rol (§5.1). Una sola app; cada rol ve solo sus módulos. */
@Component({
  selector: 'app-shell',
  imports: [IonTabs, IonTabBar, IonTabButton],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom" class="tabbar">
        @for (t of tabs(); track t.tab) {
          <ion-tab-button [tab]="t.tab">
            <span class="tabbar__item">
              <span class="tabbar__icon">
                <i class="fa-solid" [class]="t.icon"></i>
                @if (t.badge && t.badge() > 0) {
                  <span class="tabbar__badge">{{ t.badge() }}</span>
                }
              </span>
              <span class="tabbar__label">{{ t.label }}</span>
              <!-- Tablet/web: el contador va junto al texto (en la barra baja no cabe sobre el ícono). -->
              @if (t.badge && t.badge() > 0) {
                <span class="tabbar__badge tabbar__badge--inline" aria-hidden="true">{{ t.badge() }}</span>
              }
            </span>
          </ion-tab-button>
        }
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class ShellPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly store = inject(OrdersStore);
  private readonly push = inject(PushService);

  private readonly all: Tab[] = [
    { tab: 'inicio', label: 'Inicio', icon: 'fa-house', roles: ['ADMIN', 'MANAGER'] },
    { tab: 'pedidos', label: 'Pedidos', icon: 'fa-receipt', roles: ['ADMIN', 'MANAGER'], badge: () => this.store.pending().length },
    { tab: 'cocina', label: 'Cocina', icon: 'fa-kitchen-set', roles: ['ADMIN', 'MANAGER', 'CHEF'], badge: () => this.store.waiting().length },
    { tab: 'menu', label: 'Menú', icon: 'fa-utensils', roles: ['ADMIN'] },
    { tab: 'ajustes', label: 'Ajustes', icon: 'fa-gear', roles: ['ADMIN', 'MANAGER', 'CHEF'] },
  ];

  protected readonly tabs = computed(() => {
    const role = this.auth.role();
    return this.all.filter((t) => role && t.roles.includes(role));
  });

  ngOnInit(): void {
    this.store.start();
    void this.push.start(); // notificaciones con la app cerrada (solo en el teléfono)
  }

  ngOnDestroy(): void {
    this.store.stop();
  }
}
