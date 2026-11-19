import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { STAFF_BACKEND } from './backend/backend';
import { ApiError, Role, StaffUser } from './models';
import { PushService } from './push.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly backend = inject(STAFF_BACKEND);
  private readonly router = inject(Router);
  private readonly push = inject(PushService);
  private restored?: Promise<StaffUser | null>;

  readonly user = signal<StaffUser | null>(null);
  readonly role = computed<Role | undefined>(() => this.user()?.role);

  /** Restaura la sesión una sola vez al iniciar la app. */
  ensureRestored(): Promise<StaffUser | null> {
    this.restored ??= this.backend
      .restore()
      .then((u) => {
        this.user.set(u);
        return u;
      })
      .catch((e) => {
        // Sin red no se puede validar la sesión: se pide iniciar de nuevo cuando vuelva.
        if (!(e instanceof ApiError) || e.isAuth) this.user.set(null);
        this.restored = undefined;
        return null;
      });
    return this.restored;
  }

  async signIn(email: string, password: string): Promise<StaffUser> {
    const user = await this.backend.signIn(email.trim().toLowerCase(), password);
    this.user.set(user);
    this.restored = Promise.resolve(user);
    return user;
  }

  async signOut(): Promise<void> {
    await this.push.stop(); // antes de cerrar la sesión: el servidor deja de avisar a este teléfono
    await this.backend.signOut();
    this.user.set(null);
    this.restored = Promise.resolve(null);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /** Si el backend dice que la sesión ya no es válida (p. ej. empleado desactivado), salir. */
  handleAuthError(e: unknown): boolean {
    if (e instanceof ApiError && e.isAuth) {
      void this.signOut();
      return true;
    }
    return false;
  }

  hasRole(...roles: Role[]): boolean {
    const r = this.role();
    return !!r && roles.includes(r);
  }

  homeFor(role: Role | undefined): string {
    return role === 'CHEF' ? '/tabs/cocina' : '/tabs/inicio';
  }
}
