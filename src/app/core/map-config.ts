/**
 * Mapa (Leaflet + OpenStreetMap). Mismo origen que la web (pacos-web/src/app/shared/map-config.ts):
 * si se cambia a un servidor propio, actualizar ambos.
 */
export const MAP_CONFIG = {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap',
  maxZoom: 19,
};
