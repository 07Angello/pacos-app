import { AfterViewInit, Component, ElementRef, input, OnDestroy, viewChild, ViewEncapsulation } from '@angular/core';
import type { Map as LeafletMap } from 'leaflet';
import { MAP_CONFIG } from '../core/map-config';

/** Mapita de solo lectura con el punto de entrega (Leaflet se descarga al mostrarse). */
@Component({
  selector: 'app-order-map',
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../../node_modules/leaflet/dist/leaflet.css',
  template: `<div #mapEl class="order-map" role="img" [attr.aria-label]="'Punto de entrega en el mapa'"></div>`,
})
export class OrderMapComponent implements AfterViewInit, OnDestroy {
  readonly lat = input.required<number>();
  readonly lng = input.required<number>();
  readonly accuracy = input<number | null>(null);

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: LeafletMap;
  private resize?: ResizeObserver;
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    // Leaflet es CommonJS: en producción llega como `default`, en desarrollo como el módulo.
    const mod = await import('leaflet');
    const L = (mod.default ?? mod) as typeof mod.default;
    if (this.destroyed) return;
    const at: [number, number] = [this.lat(), this.lng()];
    const acc = this.accuracy();
    const map = L.map(this.mapEl().nativeElement, {
      center: at,
      zoom: acc && acc > 150 ? 15 : 17,
      zoomControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    map.attributionControl.setPrefix(false);
    L.tileLayer(MAP_CONFIG.tileUrl, { maxZoom: MAP_CONFIG.maxZoom, attribution: MAP_CONFIG.attribution }).addTo(map);
    if (acc) L.circle(at, { radius: acc, color: '#e8531f', weight: 1, fillOpacity: 0.12 }).addTo(map);
    L.marker(at, {
      icon: L.divIcon({ className: 'order-map__pin', html: '<i class="fa-solid fa-location-dot"></i>', iconSize: [32, 40], iconAnchor: [16, 38] }),
      keyboard: false,
      interactive: false,
    }).addTo(map);
    this.map = map;
    // Dentro de un modal el tamaño final llega después de la animación.
    this.resize = new ResizeObserver(() => map.invalidateSize());
    this.resize.observe(this.mapEl().nativeElement);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resize?.disconnect();
    this.map?.remove();
  }
}
