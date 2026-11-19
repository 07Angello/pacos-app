import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { ApiError } from '../../core/models';

@Component({
  selector: 'app-login',
  imports: [IonContent, FormsModule],
  template: `
    <ion-content class="login" [fullscreen]="true">
      <div class="login__wrap">
        <div class="login__brand">
          <span class="brand-mark brand-mark--lg"><i class="fa-solid fa-burger"></i></span>
          <h1>Paco's <span>Staff</span></h1>
          <p>Pedidos, cocina y administración del restaurante</p>
        </div>

        <form class="login__card" (ngSubmit)="submit()" novalidate>
          <h2>Iniciar sesión</h2>
          <label class="field">
            <span class="field__label">Correo</span>
            <span class="field__control">
              <i class="fa-solid fa-envelope"></i>
              <input type="email" name="email" autocomplete="username" inputmode="email" [(ngModel)]="email" placeholder="tu@pacos.hn" required />
            </span>
          </label>
          <label class="field">
            <span class="field__label">Contraseña</span>
            <span class="field__control">
              <i class="fa-solid fa-lock"></i>
              <input [type]="showPassword() ? 'text' : 'password'" name="password" autocomplete="current-password" [(ngModel)]="password" placeholder="••••••••" required />
              <button type="button" class="field__toggle" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                <i class="fa-solid" [class]="showPassword() ? 'fa-eye-slash' : 'fa-eye'"></i>
              </button>
            </span>
          </label>

          @if (error()) {
            <p class="form-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ error() }}</p>
          }

          <button type="submit" class="btn btn--primary btn--block btn--lg" [disabled]="loading()">
            @if (loading()) { <i class="fa-solid fa-spinner fa-spin"></i> Entrando… } @else { Entrar <i class="fa-solid fa-arrow-right"></i> }
          </button>
          <p class="login__hint">¿Olvidaste tu contraseña? Pide al administrador que la restablezca.</p>
        </form>

      </div>
    </ion-content>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.email() || !this.password()) {
      this.error.set('Ingresa tu correo y contraseña.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.signIn(this.email(), this.password());
      this.password.set('');
      await this.router.navigateByUrl(this.auth.homeFor(user.role), { replaceUrl: true });
    } catch (e) {
      this.error.set(
        e instanceof ApiError
          ? e.isNetwork
            ? 'Sin conexión. No se puede validar tu sesión; revisa el internet e intenta de nuevo.'
            : e.message
          : 'No se pudo iniciar sesión.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
