/**
 * Conversão entre polegadas decimais (unidade interna do motor) e a notação
 * pés-polegadas-fração usada na fábrica. Este é o único lugar do core que
 * conhece essa notação.
 */

/** Menor fração representada na formatação (1/16"). */
const DENOMINATOR = 16;

/**
 * Grupos: 1 = pés, 2 = polegadas inteiras (ou decimais), 3/4 = numerador/denominador.
 * Separadores aceitos entre as partes: espaço ou hífen (o hífen só se vier número depois).
 */
const PATTERN =
  /^\s*(?:(\d+)\s*'(?:\s*-\s*(?=\d)|\s*))?(?:(\d+(?:\.\d+)?)(?![\d/])(?:\s*-\s*(?=\d)|\s*))?(?:(\d+)\s*\/\s*(\d+))?\s*"?\s*$/;

/**
 * Lê `12'`, `12'-0"`, `8'-1 1/8"`, `92 5/8"`, `36"`, `1/2"`, `92.625` e
 * devolve polegadas decimais. Lança `RangeError` se a string não for válida.
 */
export function parseFeetInches(s: string): number {
  const m = PATTERN.exec(s);
  if (!m) throw new RangeError(`Medida inválida: "${s}"`);
  const [, feet, whole, num, den] = m;
  if (feet === undefined && whole === undefined && num === undefined) {
    throw new RangeError(`Medida inválida: "${s}"`);
  }
  let inches = 0;
  if (feet !== undefined) inches += Number(feet) * 12;
  if (whole !== undefined) inches += Number(whole);
  if (num !== undefined && den !== undefined) {
    const d = Number(den);
    if (d === 0) throw new RangeError(`Medida inválida: "${s}"`);
    inches += Number(num) / d;
  }
  return inches;
}

/**
 * Formata polegadas decimais como pés-polegadas-fração, arredondando para o
 * 1/16" mais próximo. Abaixo de 12" omite os pés: `0"`, `1 1/2"`, `11 15/16"`.
 * A partir de 12": `3'-0"`, `7'-8 5/8"`, `8'-1 1/8"`.
 */
export function formatFeetInches(n: number): string {
  const { feet, whole, num, den } = decompose(n);
  // Com pés presentes a polegada inteira sempre aparece (`1'-0 1/16"`), para não
  // confundir `1'-1/16"` com `1'-1 1/16"` numa leitura rápida.
  const inchPart = fractionString(whole, num, den, feet > 0);
  return feet > 0 ? `${feet}'-${inchPart}"` : `${inchPart}"`;
}

/**
 * Formata só em polegadas, sem pés: `144"`, `92 5/8"`, `1 1/2"`.
 * Usado em listas de corte, onde a fábrica lê comprimentos em polegadas.
 */
export function formatInches(n: number): string {
  const { feet, whole, num, den } = decompose(n);
  return `${fractionString(feet * 12 + whole, num, den)}"`;
}

function decompose(n: number): { feet: number; whole: number; num: number; den: number } {
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`Medida inválida: ${n}`);
  const sixteenths = Math.round(n * DENOMINATOR);
  const totalInches = Math.floor(sixteenths / DENOMINATOR);
  let num = sixteenths % DENOMINATOR;
  let den = DENOMINATOR;
  const g = gcd(num, den);
  if (g > 1) {
    num /= g;
    den /= g;
  }
  return { feet: Math.floor(totalInches / 12), whole: totalInches % 12, num, den };
}

function fractionString(whole: number, num: number, den: number, forceWhole = false): string {
  if (num === 0) return String(whole);
  return whole === 0 && !forceWhole ? `${num}/${den}` : `${whole} ${num}/${den}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
