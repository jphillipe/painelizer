/**
 * Desenhos no Storage (S22.3), a parte pura: o que um desenho guardado é, onde ele mora no bucket e os limites.
 * O browser sobe os arquivos do passo 01 direto ao bucket `drawings`, numa pasta por envio (`<uploadId>/`), e a
 * leitura recebe só os caminhos. Sem DOM, sem Supabase: a tela, as actions e o service usam isto.
 */

export const DRAWINGS_BUCKET = 'drawings';
/** Teto por arquivo no Storage: 50 MB é o máximo de um objeto no plano gratuito do Supabase. */
export const DRAWING_MAX_BYTES = 50 * 1024 * 1024;

/** Um desenho guardado: como o humano o chamou, onde está no bucket, tamanho e tipo. Viaja no `.panelizer.json`. */
export interface DrawingRef {
  name: string;
  /** `<uploadId>/<nome seguro>`, relativo ao bucket. */
  path: string;
  size: number;
  type: string;
}

/** Id único: UUID quando há, senão `<prefixo>-<tempo>-<aleatório>`. */
export function randomId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Id de um envio (a pasta no bucket). */
export function newUploadId(): string {
  return randomId('up');
}

/**
 * Nome de arquivo seguro para o objeto: só o nome base (sem pastas), espaços e caracteres fora de
 * `A-Z a-z 0-9 . _ -` viram `_`, no máximo 120 caracteres mantendo a extensão. Nomes repetidos no mesmo envio
 * ganham um sufixo pelo chamador (`uniqueDrawingNames`).
 */
export function safeDrawingName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  const dot = cleaned.lastIndexOf('.');
  const ext = dot >= 0 ? cleaned.slice(dot) : '';
  const stem = (dot >= 0 ? cleaned.slice(0, dot) : cleaned) || 'drawing';
  const room = Math.max(1, 120 - ext.length);
  return `${stem.slice(0, room)}${ext}`;
}

/** Caminho do objeto no bucket para um arquivo de um envio. */
export function drawingPath(uploadId: string, name: string): string {
  return `${uploadId}/${safeDrawingName(name)}`;
}

/** Pasta (`uploadId`) de um caminho; `undefined` para um caminho sem pasta. */
export function uploadIdOf(path: string): string | undefined {
  const i = path.indexOf('/');
  return i > 0 ? path.slice(0, i) : undefined;
}

/** Pastas distintas de uma lista de desenhos (um projeto costuma ter uma; uma cópia ganha outra). */
export function uploadIdsOf(drawings: readonly DrawingRef[]): string[] {
  return [...new Set(drawings.map((d) => uploadIdOf(d.path)).filter((id): id is string => id !== undefined))];
}

/** Os mesmos desenhos noutra pasta (duplicar projeto copia os objetos para `<toUploadId>/`). */
export function movedDrawings(drawings: readonly DrawingRef[], toUploadId: string): DrawingRef[] {
  return drawings.map((d) => ({ ...d, path: `${toUploadId}/${d.path.slice(d.path.indexOf('/') + 1)}` }));
}

/**
 * Desenhos postos num projeto sem leitura (S32, "Add drawings" num projeto aberto de arquivo ou sample): chave `$drawings`
 * na raiz do `.panelizer.json` (o CLI ignora chaves com `$`), ao lado de `$underlay`. Projeto com leitura também
 * pode ganhar desenhos aqui; os da leitura continuam em `$panelizer.reading.drawings`.
 */
export const PROJECT_DRAWINGS_KEY = '$drawings';

function isDrawingRef(d: unknown): d is DrawingRef {
  if (d === null || typeof d !== 'object') return false;
  const r = d as Record<string, unknown>;
  return typeof r['name'] === 'string' && typeof r['path'] === 'string' && typeof r['size'] === 'number' && typeof r['type'] === 'string';
}

function readingDrawingsOf(data: unknown): DrawingRef[] {
  if (data === null || typeof data !== 'object') return [];
  const meta = (data as Record<string, unknown>)['$panelizer'];
  if (meta === null || typeof meta !== 'object') return [];
  const reading = (meta as Record<string, unknown>)['reading'];
  if (reading === null || typeof reading !== 'object') return [];
  const list = (reading as Record<string, unknown>)['drawings'];
  return Array.isArray(list) ? list.filter(isDrawingRef) : [];
}

/** `$drawings` da raiz (do draft ou do arquivo), validados por forma; sem eles, lista vazia. */
export function extraDrawingsOf(data: unknown): DrawingRef[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return [];
  const list = (data as Record<string, unknown>)[PROJECT_DRAWINGS_KEY];
  return Array.isArray(list) ? list.filter(isDrawingRef) : [];
}

/**
 * Os desenhos registrados num `.panelizer.json` já parseado: os da leitura (`$panelizer.reading.drawings`) e depois
 * os de `$drawings` (S32), validados por forma; sem eles, lista vazia.
 */
export function drawingsOfProjectData(data: unknown): DrawingRef[] {
  return [...readingDrawingsOf(data), ...extraDrawingsOf(data)];
}

/**
 * O mesmo JSON com outra lista de desenhos, na ordem de `drawingsOfProjectData` (duplicar aponta a cópia para a pasta
 * nova): os primeiros voltam para a leitura, o resto para `$drawings`. Sem nenhum dos dois, volta igual.
 */
export function withProjectDrawings<T>(data: T, drawings: readonly DrawingRef[]): T {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  let obj = data as Record<string, unknown>;
  const inReading = readingDrawingsOf(obj).length;
  const meta = obj['$panelizer'];
  const reading = meta !== null && typeof meta === 'object' ? (meta as Record<string, unknown>)['reading'] : undefined;
  if (reading !== null && typeof reading === 'object') {
    obj = { ...obj, $panelizer: { ...(meta as object), reading: { ...(reading as object), drawings: drawings.slice(0, inReading) } } };
  }
  if (Array.isArray(obj[PROJECT_DRAWINGS_KEY])) obj = { ...obj, [PROJECT_DRAWINGS_KEY]: drawings.slice(inReading) };
  return obj as T;
}

/** Arquivos aceitos acima do teto do Storage, com o motivo para a lista de recusados da zona de soltar. */
export function tooLargeForStorage(size: number): boolean {
  return size > DRAWING_MAX_BYTES;
}
