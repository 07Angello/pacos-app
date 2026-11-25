import { googleMapsUrl, wazeUrl } from './directions';

describe('Cómo llegar', () => {
  it('arma la ruta de Google Maps al punto', () => {
    expect(googleMapsUrl(14.094894, -87.188627)).toBe('https://www.google.com/maps/dir/?api=1&destination=14.094894,-87.188627&travelmode=driving');
  });
  it('arma el enlace de navegación de Waze', () => {
    expect(wazeUrl(14.1, -87.2)).toBe('waze://?ll=14.1,-87.2&navigate=yes');
  });
});
