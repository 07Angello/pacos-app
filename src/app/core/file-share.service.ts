import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/**
 * Entregar un archivo generado en la app:
 * - Teléfono (Capacitor): se guarda en la caché y se abre el menú del sistema para
 *   compartir (WhatsApp, Drive, correo, "Guardar en Archivos"…).
 * - Navegador: descarga directa; o menú de compartir si el navegador lo soporta.
 */
@Injectable({ providedIn: 'root' })
export class FileShareService {
  readonly isNative = Capacitor.isNativePlatform();

  /** ¿El navegador puede compartir archivos? (Chrome Android, Safari iOS…). */
  canWebShare(): boolean {
    try {
      return !this.isNative && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });
    } catch {
      return false;
    }
  }

  async share(blob: Blob, filename: string, title: string): Promise<void> {
    if (this.isNative) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const { uri } = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache });
      try {
        await Share.share({ title, files: [uri], dialogTitle: title });
      } catch (e) {
        if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e; // cerrar el menú no es un error
      }
      return;
    }
    const file = new File([blob], filename, { type: blob.type });
    if (this.canWebShare()) {
      try {
        await navigator.share({ files: [file], title });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    this.download(blob, filename);
  }

  download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
