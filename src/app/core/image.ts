/**
 * Reduce una foto a máx. 900 px y la convierte a WebP (≈100–200 KB) antes de subirla,
 * para que el menú cargue rápido en datos móviles (§4.2).
 */
export async function prepareMenuImage(file: File, maxSize = 900): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.82));
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return blob;
}
