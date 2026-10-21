/** Downloads no navegador (só cliente). Sem teste: dependem de `document` e de `URL.createObjectURL`. */

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(name: string, text: string, mime = 'application/json'): void {
  downloadBlob(name, new Blob([text], { type: mime }));
}

/** Cópia para um ArrayBuffer próprio: o tipo de `BlobPart` não aceita view sobre `SharedArrayBuffer`. */
export function downloadBytes(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): void {
  downloadBlob(name, new Blob([new Uint8Array(bytes)], { type: mime }));
}

/** Base64 (o que uma server action devolve) → bytes. */
export function bytesFromBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
