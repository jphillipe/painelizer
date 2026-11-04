import { describe, expect, it } from 'vitest';
import { copyName, describeUpdated, encodeCursor, NAME_MAX, nameFromData, ownerLabel, parseCursor, projectName, projectsHref, revisionCopyName, wallCountOf, withCurrentHeavyKeys, withProjectName } from './projects';

describe('lista de projetos (S22.2)', () => {
  it('conta paredes só quando `walls` é uma lista', () => {
    expect(wallCountOf([{ id: 'W01' }, { id: 'W02' }])).toBe(2);
    expect(wallCountOf([])).toBe(0);
    expect(wallCountOf(null)).toBe(0);
    expect(wallCountOf(undefined)).toBe(0);
    expect(wallCountOf('walls')).toBe(0);
    expect(wallCountOf({ W01: 1 })).toBe(0);
  });

  it('troca o nome dentro do arquivo sem mexer no resto; dado que não é objeto volta igual', () => {
    const data = { name: 'Casa', config: { studSpacing: 16 }, walls: [], $panelizer: { version: 1 } };
    expect(withProjectName(data, 'Casa 2')).toEqual({ ...data, name: 'Casa 2' });
    expect(withProjectName({ walls: [] }, 'Nova')).toEqual({ walls: [], name: 'Nova' });
    expect(withProjectName([1, 2], 'x')).toEqual([1, 2]);
    expect(withProjectName(null, 'x')).toBeNull();
  });

  it('nome do arquivo: o `name` da raiz quando é texto não vazio', () => {
    expect(nameFromData({ name: ' Casa 28x40 ', walls: [] })).toBe('Casa 28x40');
    expect(nameFromData({ name: '', walls: [] })).toBeUndefined();
    expect(nameFromData({ walls: [] })).toBeUndefined();
    expect(nameFromData({ name: 3 })).toBeUndefined();
    expect(nameFromData([])).toBeUndefined();
    expect(nameFromData(null)).toBeUndefined();
  });

  it('nome da cópia: "Copy of" + nome, com o limite da tabela', () => {
    expect(copyName('Ringgold')).toBe('Copy of Ringgold');
    expect(copyName('  ')).toBe('Copy of Untitled project');
    expect(copyName('a'.repeat(300))).toHaveLength(NAME_MAX);
    expect(projectName(' Casa ')).toBe('Casa');
    expect(projectName('')).toBe('Untitled project');
  });

  it('autor: "you" para quem está logado (sem diferenciar caixa), e-mail dos outros, traço sem autor', () => {
    expect(ownerLabel('a@b.c', 'A@B.C')).toBe('you');
    expect(ownerLabel('a@b.c', 'x@y.z')).toBe('a@b.c');
    expect(ownerLabel('a@b.c', undefined)).toBe('a@b.c');
    expect(ownerLabel(null, 'a@b.c')).toBe('—');
    expect(ownerLabel('', 'a@b.c')).toBe('—');
  });

  it('"updated" envelhece como o chip de auto-save; data inválida vira traço', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');
    expect(describeUpdated('2026-11-03T11:59:50Z', now)).toBe('just now');
    expect(describeUpdated('2026-11-03T11:30:00Z', now)).toBe('30 min ago');
    expect(describeUpdated('2026-11-01T12:00:00Z', now)).toBe('2 days ago');
    expect(describeUpdated('nope', now)).toBe('—');
  });
});

describe('lista de projetos — páginas, filtros e histórico (S32)', () => {
  const id = '0f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';

  it('cursor vai e volta pela URL; texto que não é cursor dá null', () => {
    const at = '2026-11-04T10:00:00.123456+00:00';
    const text = encodeCursor({ at, id });
    expect(parseCursor(text)).toEqual({ at, id });
    expect(parseCursor(decodeURIComponent(encodeURIComponent(text)))).toEqual({ at, id });
    expect(parseCursor('lixo')).toBeNull();
    expect(parseCursor(`não-é-data~${id}`)).toBeNull();
    expect(parseCursor(`${at}~123`)).toBeNull();
  });

  it('URL da lista só leva o que difere do padrão', () => {
    const none = { search: '', mine: false, trash: false };
    expect(projectsHref(none)).toBe('/app/projects');
    expect(projectsHref({ search: 'casa 2', mine: true, trash: false })).toBe('/app/projects?q=casa+2&mine=1');
    expect(projectsHref({ ...none, trash: true }, 'c~d')).toBe('/app/projects?trash=1&before=c%7Ed');
  });

  it('nome do retrato restaurado e a leitura/planta da linha atual por cima do retrato', () => {
    expect(revisionCopyName('Casa', 40)).toBe('Casa (revision 40)');
    expect(revisionCopyName('x'.repeat(NAME_MAX), 1)).toHaveLength(NAME_MAX);
    expect(revisionCopyName('  ', 2)).toBe('Untitled project (revision 2)');
    const snap = { name: 'Casa', walls: [1], $drawings: [] };
    expect(withCurrentHeavyKeys(snap, { walls: [2], $panelizer: { r: 1 }, $underlay: { i: 'x' } })).toEqual({ name: 'Casa', walls: [1], $drawings: [], $panelizer: { r: 1 }, $underlay: { i: 'x' } });
    expect(withCurrentHeavyKeys({ walls: [], $underlay: 'velha' }, { walls: [] })).toEqual({ walls: [] });
    expect(withCurrentHeavyKeys([1], { a: 1 })).toEqual([1]);
  });
});
