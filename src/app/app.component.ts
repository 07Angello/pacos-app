import { Component, inject, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { LicenseService } from './core/license.service';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      @if (license.blocked()) {
        <main class="license-lock" role="alertdialog" aria-labelledby="lic-title" aria-describedby="lic-msg">
          <div class="license-lock__box">
            <span class="license-lock__icon"><i class="fa-solid fa-lock"></i></span>
            <h1 id="lic-title">Sistema deshabilitado</h1>
            <p id="lic-msg">{{ license.message() }}</p>
            <button type="button" class="btn btn--ghost" (click)="license.refresh()"><i class="fa-solid fa-rotate"></i> Reintentar</button>
          </div>
        </main>
      } @else {
        <ion-router-outlet />
      }
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  protected readonly license = inject(LicenseService);

  ngOnInit(): void {
    this.license.start();
  }
}
