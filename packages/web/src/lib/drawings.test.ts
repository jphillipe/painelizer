import { describe, expect, it } from 'vitest';
import { DRAWING_MAX_BYTES, drawingPath, drawingsOfProjectData, movedDrawings, newUploadId, safeDrawingName, tooLargeForStorage, uploadIdOf, uploadIdsOf, withProjectDrawings } from './drawings';

describe('desenhos no Storage (S22.3)', () => {
  it('nome seguro: só o nome base, caracteres fora do seguro viram _, extensão preservada, 120 no máximo', () => {
    expect(safeDrawingName('A-101 1st Floor (rev 2).pdf')).toBe('A-101_1st_Floor_rev_2_.pdf');
    expect(safeDrawingName('C:\\Users\\x\\planta.PDF')).toBe('planta.PDF');
    expect(safeDrawingName('../../etc/passwd')).toBe('passwd');
    expect(safeDrawingName('ação ç.png')).toBe('a_o_.png');
    expect(safeDrawingName('.pdf')).toBe('drawing.pdf');
    expect(safeDrawingName('')).toBe('drawing');
    const long = safeDrawingName(`${'a'.repeat(200)}.pdf`);
    expect(long).toHaveLength(120);
    expect(long.endsWith('.pdf')).toBe(true);
  });

  it('caminho = pasta do envio + nome seguro; a pasta sai do caminho', () => {
    expect(drawingPath('up1', 'A 100.pdf')).toBe('up1/A_100.pdf');
    expect(uploadIdOf('up1/A_100.pdf')).toBe('up1');
    expect(uploadIdOf('A_100.pdf')).toBeUndefined();
    expect(uploadIdOf('/x')).toBeUndefined();
    expect(uploadIdsOf([{ name: 'a', path: 'u1/a.pdf', size: 1, type: 'application/pdf' }, { name: 'b', path: 'u1/b.pdf', size: 1, type: '' }, { name: 'c', path: 'u2/c.pdf', size: 1, type: '' }])).toEqual(['u1', 'u2']);
  });

  it('mover para outra pasta mantém nome, tamanho e tipo', () => {
    const moved = movedDrawings([{ name: 'A 100.pdf', path: 'u1/A_100.pdf', size: 5, type: 'application/pdf' }], 'u2');
    expect(moved).toEqual([{ name: 'A 100.pdf', path: 'u2/A_100.pdf', size: 5, type: 'application/pdf' }]);
  });

  it('desenhos dentro do .panelizer.json: lê $panelizer.reading.drawings validando a forma, e troca a lista', () => {
    const ref = { name: 'A.pdf', path: 'u1/A.pdf', size: 3, type: 'application/pdf' };
    const data = { name: 'Casa', walls: [], $panelizer: { version: 1, reading: { projectName: 'Casa', drawings: [ref, { bogus: true }, null] } } };
    expect(drawingsOfProjectData(data)).toEqual([ref]);
    expect(drawingsOfProjectData({ walls: [] })).toEqual([]);
    expect(drawingsOfProjectData(null)).toEqual([]);
    expect(drawingsOfProjectData({ $panelizer: { reading: { drawings: 'x' } } })).toEqual([]);
    const moved = withProjectDrawings(data, movedDrawings([ref], 'u2'));
    expect(drawingsOfProjectData(moved)).toEqual([{ ...ref, path: 'u2/A.pdf' }]);
    expect(moved.name).toBe('Casa');
    expect(withProjectDrawings({ walls: [] }, [ref])).toEqual({ walls: [] });
  });

  it('teto por arquivo: 50 MB; ids de envio não se repetem', () => {
    expect(DRAWING_MAX_BYTES).toBe(52_428_800);
    expect(tooLargeForStorage(DRAWING_MAX_BYTES)).toBe(false);
    expect(tooLargeForStorage(DRAWING_MAX_BYTES + 1)).toBe(true);
    expect(newUploadId()).not.toBe(newUploadId());
    expect(newUploadId()).toMatch(/^[0-9a-f-]{36}$|^up-/);
  });
});
