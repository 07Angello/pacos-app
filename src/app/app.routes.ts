import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthService } from './core/auth.service';
import { authGuard, guestGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage) },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/shell/shell.page').then((m) => m.ShellPage),
    children: [
      { path: 'inicio', canActivate: [roleGuard('ADMIN', 'MANAGER')], loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'pedidos', canActivate: [roleGuard('ADMIN', 'MANAGER')], loadComponent: () => import('./pages/orders/orders.page').then((m) => m.OrdersPage) },
      { path: 'cocina', loadComponent: () => import('./pages/kitchen/kitchen.page').then((m) => m.KitchenPage) },
      { path: 'menu', canActivate: [roleGuard('ADMIN')], loadComponent: () => import('./pages/menu-admin/menu-admin.page').then((m) => m.MenuAdminPage) },
      { path: 'nuevo-pedido', canActivate: [roleGuard('ADMIN', 'MANAGER')], loadComponent: () => import('./pages/counter/counter.page').then((m) => m.CounterPage) },
      { path: 'reportes', canActivate: [roleGuard('ADMIN')], loadComponent: () => import('./pages/reports/reports.page').then((m) => m.ReportsPage) },
      { path: 'clientes-web', canActivate: [roleGuard('ADMIN')], loadComponent: () => import('./pages/visitors/visitors.page').then((m) => m.VisitorsPage) },
      { path: 'ajustes', loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage) },
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).homeFor(inject(AuthService).role()) },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'tabs' },
  { path: '**', redirectTo: 'tabs' },
];
