/** Tecla modificadora da plataforma para os rótulos de atalho (M5): ⌘ no Mac, Ctrl no resto. Sem `navigator`, Ctrl. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const p = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad/i.test(p);
}

export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}
