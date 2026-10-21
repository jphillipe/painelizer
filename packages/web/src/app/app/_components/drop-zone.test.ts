import { describe, expect, it } from 'vitest';
import { isAccepted, MAX_UPLOAD_BYTES, mergeFiles } from './drop-zone';

const file = (name: string, size: number, type = ''): File => ({ name, size, type }) as unknown as File;

describe('zona de soltar: o que entra (M5)', () => {
  it('aceita por tipo ou extensão; recusa o resto dizendo por quê', () => {
    expect(isAccepted(file('a.pdf', 1, 'application/pdf'))).toBe(true);
    expect(isAccepted(file('A-100.PDF', 1))).toBe(true);
    expect(isAccepted(file('plan.png', 1, 'image/png'))).toBe(true);
    expect(isAccepted(file('notes.docx', 1, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe(false);
    const r = mergeFiles([], [file('a.pdf', 10, 'application/pdf'), file('x.docx', 10), file('b.jpg', 5, 'image/jpeg')]);
    expect(r.files.map((f) => f.name)).toEqual(['a.pdf', 'b.jpg']);
    expect(r.rejected).toEqual([{ name: 'x.docx', reason: 'not a PDF or image' }]);
  });

  it('repetido e acima do limite ficam de fora; o total conta o que já estava', () => {
    const current = [file('a.pdf', MAX_UPLOAD_BYTES - 100, 'application/pdf')];
    const r = mergeFiles(current, [file('a.pdf', MAX_UPLOAD_BYTES - 100, 'application/pdf'), file('b.pdf', 200, 'application/pdf'), file('c.pdf', 50, 'application/pdf')]);
    expect(r.files.map((f) => f.name)).toEqual(['a.pdf', 'c.pdf']);
    expect(r.rejected.map((x) => x.reason)).toEqual(['already added', 'would pass the 300.0 MB limit']);
  });
});
