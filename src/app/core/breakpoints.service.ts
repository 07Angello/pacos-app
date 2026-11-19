import { Injectable, signal } from '@angular/core';

/** Breakpoints de la app (§6.2): teléfono < 768 ≤ tablet vertical < 1100 ≤ tablet horizontal. */
@Injectable({ providedIn: 'root' })
export class BreakpointsService {
  readonly tablet = this.media('(min-width: 768px)');
  readonly wide = this.media('(min-width: 1100px)');

  private media(query: string) {
    const mql = window.matchMedia(query);
    const s = signal(mql.matches);
    mql.addEventListener?.('change', (e) => s.set(e.matches));
    return s.asReadonly();
  }
}
