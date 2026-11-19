import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonFooter, IonHeader, IonToolbar, ModalController } from '@ionic/angular';
import { STAFF_BACKEND } from '../../core/backend/backend';
import { ApiError, Employee, Role } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ROLE_LABEL } from '../../core/order-status';

const ROLES: { role: Role; icon: string; hint: string }[] = [
  { role: 'ADMIN', icon: 'fa-user-shield', hint: 'Todo: menú, ajustes y empleados' },
  { role: 'MANAGER', icon: 'fa-user-tie', hint: 'Aprueba pedidos y abre/cierra' },
  { role: 'CHEF', icon: 'fa-kitchen-set', hint: 'Solo la pantalla de cocina' },
];

/** Sin caracteres que se confunden al dictarlos (0/O, 1/l/I). */
function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').replace(/^504(?=\d{8})/, '').slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

/**
 * Alta y edición de empleados (solo ADMIN). componentProps: { employee?: Employee, selfId: string }.
 * Crear cuenta y restablecer contraseña → Edge Function `admin-employees`.
 * Nombre / teléfono / rol → RPC `admin_update_employee`.
 */
@Component({
  selector: 'app-employee-editor',
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, FormsModule],
  template: `
    <ion-header class="editor-header">
      <ion-toolbar>
        <div class="editor-header__row">
          <button type="button" class="icon-btn" (click)="close()" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          <div class="editor-header__title"><small>Empleados</small><strong>{{ title() }}</strong></div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="editor">
      <div class="editor__inner">
        @if (done(); as d) {
          <section class="editor__section emp-done">
            <span class="emp-done__icon"><i class="fa-solid fa-circle-check"></i></span>
            <h3>{{ d.fullName }} ya puede entrar</h3>
            @if (d.linked) {
              <p class="editor__hint">Ese correo ya tenía cuenta: se agregó como <strong>{{ roleLabel[d.role] }}</strong> y conserva su contraseña actual.</p>
            } @else {
              <p class="editor__hint">Comparte estos datos con {{ firstName(d.fullName) }}. Por seguridad no se volverán a mostrar.</p>
              <dl class="emp-cred">
                <div><dt>Correo</dt><dd>{{ d.email }}</dd></div>
                <div><dt>Contraseña</dt><dd class="emp-cred__pass">{{ d.password }}</dd></div>
                <div><dt>Rol</dt><dd>{{ roleLabel[d.role] }}</dd></div>
              </dl>
              <button type="button" class="btn btn--ghost btn--block" (click)="copyCredentials(d)">
                <i class="fa-solid" [class]="copied() ? 'fa-check' : 'fa-copy'"></i> {{ copied() ? 'Copiado' : 'Copiar datos de acceso' }}
              </button>
            }
          </section>
        } @else {
          <section class="editor__section">
            <h3 class="editor__title"><i class="fa-solid fa-id-card"></i> Datos</h3>
            <label class="field">
              <span class="field__label">Nombre completo</span>
              <span class="field__control"><i class="fa-solid fa-user"></i>
                <input [ngModel]="fullName()" (ngModelChange)="fullName.set($event)" maxlength="60" autocomplete="off" placeholder="Ej.: María López" />
              </span>
            </label>
            <label class="field">
              <span class="field__label">Correo (usuario para entrar)</span>
              <span class="field__control"><i class="fa-solid fa-envelope"></i>
                <input type="email" inputmode="email" autocapitalize="off" [ngModel]="email()" (ngModelChange)="email.set($event)" [disabled]="isEdit()"
                  maxlength="120" autocomplete="off" placeholder="maria@pacos.hn" />
              </span>
            </label>
            @if (isEdit()) { <p class="editor__hint"><i class="fa-solid fa-lock"></i> El correo no se puede cambiar desde la app.</p> }
            <label class="field">
              <span class="field__label">Teléfono <span class="muted">(opcional)</span></span>
              <span class="field__control"><span class="field__prefix">+504</span>
                <input type="tel" inputmode="numeric" [ngModel]="phone()" (ngModelChange)="phone.set(mask($event))" maxlength="9" placeholder="9999-9999" />
              </span>
            </label>
          </section>

          <section class="editor__section">
            <h3 class="editor__title"><i class="fa-solid fa-user-gear"></i> Rol</h3>
            <div class="type-cards type-cards--3" role="radiogroup" aria-label="Rol">
              @for (r of roles; track r.role) {
                <button type="button" role="radio" class="type-card" [class.type-card--on]="role() === r.role" [attr.aria-checked]="role() === r.role"
                  [disabled]="isSelf()" (click)="role.set(r.role)">
                  <i class="fa-solid" [class]="r.icon"></i>
                  <strong>{{ roleLabel[r.role] }}</strong>
                  <span>{{ r.hint }}</span>
                </button>
              }
            </div>
            @if (isSelf()) { <p class="editor__hint"><i class="fa-solid fa-circle-info"></i> No puedes cambiar tu propio rol.</p> }
          </section>

          <section class="editor__section">
            <h3 class="editor__title"><i class="fa-solid fa-key"></i> Contraseña</h3>
            @if (isEdit() && !resetting()) {
              <p class="editor__hint">¿Olvidó su contraseña? Asígnale una nueva y compártela.</p>
              <button type="button" class="btn btn--ghost btn--block" (click)="startReset()"><i class="fa-solid fa-rotate"></i> Restablecer contraseña</button>
            } @else {
              <div class="emp-pass">
                <label class="field">
                  <span class="field__label">{{ isEdit() ? 'Nueva contraseña' : 'Contraseña inicial' }}</span>
                  <span class="field__control"><i class="fa-solid fa-lock"></i>
                    <input [type]="showPassword() ? 'text' : 'password'" [ngModel]="password()" (ngModelChange)="password.set($event)" maxlength="72" autocomplete="new-password" placeholder="Mínimo 8 caracteres" />
                    <button type="button" class="field__toggle" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                      <i class="fa-solid" [class]="showPassword() ? 'fa-eye-slash' : 'fa-eye'"></i>
                    </button>
                  </span>
                </label>
                <button type="button" class="btn btn--ghost emp-pass__gen" (click)="generate()"><i class="fa-solid fa-wand-magic-sparkles"></i> Generar</button>
              </div>
              @if (isEdit()) {
                <div class="editor__actions">
                  <button type="button" class="btn btn--ghost" [disabled]="saving()" (click)="resetting.set(false)">Cancelar</button>
                  <button type="button" class="btn btn--dark" [disabled]="saving()" (click)="savePassword()">
                    @if (saving()) { <i class="fa-solid fa-spinner fa-spin"></i> } @else { <i class="fa-solid fa-key"></i> } Guardar contraseña
                  </button>
                </div>
              } @else {
                <p class="editor__hint">Podrá entrar de inmediato con su correo y esta contraseña.</p>
              }
            }
            @if (newPassword(); as np) {
              <div class="banner banner--info banner--flat emp-newpass">
                <i class="fa-solid fa-circle-check"></i>
                <span>Nueva contraseña: <strong class="emp-cred__pass">{{ np }}</strong></span>
                <button type="button" class="icon-btn" (click)="copy(np)" aria-label="Copiar contraseña"><i class="fa-solid" [class]="copied() ? 'fa-check' : 'fa-copy'"></i></button>
              </div>
            }
          </section>
        }
      </div>
    </ion-content>

    <ion-footer class="editor-footer">
      <div class="editor-footer__row">
        @if (done()) {
          <button type="button" class="btn btn--primary btn--lg editor-footer__main" (click)="close()"><i class="fa-solid fa-check"></i> Listo</button>
        } @else {
          <button type="button" class="btn btn--primary btn--lg editor-footer__main" (click)="save()" [disabled]="saving()">
            @if (saving()) { <i class="fa-solid fa-spinner fa-spin"></i> Guardando… }
            @else if (isEdit()) { <i class="fa-solid fa-check"></i> Guardar cambios }
            @else { <i class="fa-solid fa-user-plus"></i> Crear empleado }
          </button>
        }
      </div>
    </ion-footer>
  `,
})
export class EmployeeEditorComponent implements OnInit {
  /** componentProps */
  employee?: Employee;
  selfId?: string;

  protected readonly modals = inject(ModalController);
  private readonly backend = inject(STAFF_BACKEND);
  private readonly notify = inject(NotifyService);

  protected readonly roles = ROLES;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly role = signal<Role>('CHEF');
  protected readonly password = signal('');
  protected readonly showPassword = signal(true);
  protected readonly resetting = signal(false);
  protected readonly saving = signal(false);
  protected readonly copied = signal(false);
  protected readonly newPassword = signal<string | null>(null);
  protected readonly done = signal<{ fullName: string; email: string; password: string; role: Role; linked: boolean } | null>(null);
  /** El último empleado guardado, para refrescar la lista al cerrar. */
  private saved: Employee | null = null;

  protected readonly isEdit = signal(false);
  protected readonly isSelf = computed(() => this.isEdit() && this.employee?.id === this.selfId);
  protected readonly title = computed(() => (this.done() ? 'Empleado creado' : this.isEdit() ? 'Editar empleado' : 'Nuevo empleado'));
  protected readonly mask = maskPhone;

  ngOnInit(): void {
    const e = this.employee;
    if (!e) {
      this.password.set(generatePassword());
      return;
    }
    this.isEdit.set(true);
    this.fullName.set(e.fullName);
    this.email.set(e.email);
    this.phone.set(maskPhone(e.phone ?? ''));
    this.role.set(e.role);
  }

  protected firstName(name: string): string {
    return name.split(' ')[0];
  }

  protected generate(): void {
    this.password.set(generatePassword());
    this.showPassword.set(true);
  }

  protected startReset(): void {
    this.resetting.set(true);
    this.newPassword.set(null);
    this.generate();
  }

  private validate(): string | null {
    if (this.fullName().trim().length < 2) return 'Escribe el nombre del empleado.';
    if (!this.isEdit() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email().trim())) return 'Escribe un correo válido.';
    if (this.phone() && this.phone().replace(/\D/g, '').length !== 8) return 'El teléfono debe tener 8 dígitos.';
    if (!this.isEdit() && this.password().length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    return null;
  }

  protected async save(): Promise<void> {
    const problem = this.validate();
    if (problem) return void this.notify.toast(problem, 'error');
    const phone = this.phone().replace(/\D/g, '');
    this.saving.set(true);
    try {
      if (this.isEdit()) {
        this.saved = await this.backend.rpc<Employee>('admin_update_employee', {
          user_id: this.employee!.id, fullName: this.fullName().trim(), role: this.role(), phone,
        });
        void this.notify.toast(`${this.saved.fullName} actualizado`, 'success', 1500);
        await this.close();
      } else {
        const res = await this.backend.invoke<{ employee: Employee; linked: boolean }>('admin-employees', {
          action: 'create', email: this.email().trim(), password: this.password(), fullName: this.fullName().trim(), role: this.role(), phone,
        });
        this.saved = res.employee;
        this.done.set({ fullName: res.employee.fullName, email: res.employee.email, password: this.password(), role: res.employee.role, linked: res.linked });
      }
    } catch (e) {
      void this.notify.toast(e instanceof ApiError ? e.message : 'No se pudo guardar.', 'error', 4000);
    } finally {
      this.saving.set(false);
    }
  }

  protected async savePassword(): Promise<void> {
    if (this.password().length < 8) return void this.notify.toast('La contraseña debe tener al menos 8 caracteres.', 'error');
    this.saving.set(true);
    try {
      await this.backend.invoke('admin-employees', { action: 'reset_password', userId: this.employee!.id, password: this.password() });
      this.newPassword.set(this.password());
      this.resetting.set(false);
      void this.notify.toast('Contraseña actualizada', 'success', 1500);
    } catch (e) {
      void this.notify.toast(e instanceof ApiError ? e.message : 'No se pudo cambiar la contraseña.', 'error', 4000);
    } finally {
      this.saving.set(false);
    }
  }

  protected copyCredentials(d: { email: string; password: string }): void {
    void this.copy(`Paco's · App del personal\nCorreo: ${d.email}\nContraseña: ${d.password}`);
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      void this.notify.toast('No se pudo copiar. Anótalo manualmente.', 'error');
    }
  }

  protected async close(): Promise<void> {
    await this.modals.dismiss(this.saved, this.saved ? 'saved' : 'cancel');
  }
}
