import { Capacitor } from '@capacitor/core';

export type DirectionsApp = 'maps' | 'waze' | 'browser';

const MAPS_PACKAGE = 'com.google.android.apps.maps';
const WAZE_PACKAGE = 'com.waze';

/** Ruta en Google Maps (abre la app si está instalada; si no, el navegador). */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function wazeUrl(lat: number, lng: number): string {
  return `waze://?ll=${lat},${lng}&navigate=yes`;
}

/**
 * "Cómo llegar": Google Maps → si no está instalado, Waze → si tampoco, Google Maps en el navegador.
 * En Android 11+ la consulta de apps instaladas requiere <queries> en AndroidManifest.xml.
 */
export async function openDirections(lat: number, lng: number): Promise<DirectionsApp> {
  if (!Capacitor.isNativePlatform()) {
    window.open(googleMapsUrl(lat, lng), '_blank', 'noopener');
    return 'browser';
  }
  const { AppLauncher } = await import('@capacitor/app-launcher');
  const installed = async (pkg: string) => {
    try {
      return (await AppLauncher.canOpenUrl({ url: pkg })).value;
    } catch {
      return false;
    }
  };
  if (await installed(MAPS_PACKAGE)) {
    await AppLauncher.openUrl({ url: googleMapsUrl(lat, lng) });
    return 'maps';
  }
  if (await installed(WAZE_PACKAGE)) {
    await AppLauncher.openUrl({ url: wazeUrl(lat, lng) });
    return 'waze';
  }
  await AppLauncher.openUrl({ url: googleMapsUrl(lat, lng) });
  return 'browser';
}
