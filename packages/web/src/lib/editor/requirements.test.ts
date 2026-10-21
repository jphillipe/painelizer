import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromJson, draftFromText } from './draft';
import { projectDataNeeds } from './requirements';

const load = (raw: unknown) => {
  const r = draftFromJson(raw);
  if (!r.ok) throw new Error('should load');
  return r.draft;
};

describe('projectDataNeeds', () => {
  it('exemplo completo: nada obrigatório', () => {
    const r = draftFromText(EXAMPLES[1]!.text);
    if (!r.ok) throw new Error('should load');
    expect(projectDataNeeds(r.draft).required).toEqual([]);
  });

  it('leitura sem altura, sem building e sem pavimentos, com janelas em parede portante: pede os quatro', () => {
    const d = load({
      config: { studSpacing: 16, openingTypes: { A: { kind: 'window', width: 30, height: 48 } } },
      walls: [
        { id: 'N1', start: { x: 0, y: 0 }, end: { x: 480, y: 0 }, section: '2x6', exterior: true, bearing: true, openings: [{ id: 'N1-A-1', tag: 'A', center: 100 }] },
        { id: 'I1', start: { x: 0, y: 0 }, end: { x: 0, y: 200 }, section: '2x4', exterior: false, bearing: false, openings: [{ id: 'I1-A-1', tag: 'A', center: 100 }] },
      ],
    });
    const needs = projectDataNeeds(d);
    expect(needs).toMatchObject({ wallsWithoutHeight: ['N1', 'I1'], tableHeaderWalls: ['N1'], wallsWithoutFloors: ['N1'], buildingMissing: true });
    expect(needs.required).toEqual(['wallHeight', 'snow', 'width', 'floors', 'floorSpan']);
  });

  it('header próprio ou por marca, parede não portante ou sem abertura: a tabela não entra', () => {
    const d = load({
      config: { studSpacing: 16, studLength: [92.625], headerSchedule: { H1: { section: '2x10', plies: 2 } } },
      walls: [
        { id: 'A', length: 120, height: 97, section: '2x6', exterior: true, bearing: true, openings: [{ id: 'A-1', type: 'window', roughWidth: 36, roughHeight: 48, offset: 20, headerMark: 'H1' }] },
        { id: 'B', length: 120, height: 97, section: '2x6', exterior: true, bearing: true, openings: [{ id: 'B-1', type: 'door', roughWidth: 38, roughHeight: 82.5, offset: 20, header: { section: '2x10', plies: 2 } }] },
        { id: 'C', length: 120, height: 97, section: '2x6', exterior: true, bearing: true, openings: [] },
        { id: 'D', length: 120, height: 97, section: '2x4', exterior: false, bearing: false, openings: [{ id: 'D-1', type: 'door', roughWidth: 38, roughHeight: 82.5, offset: 20 }] },
      ],
    });
    expect(projectDataNeeds(d).required).toEqual([]);
  });

  it('building completo e pavimentos dados: só a altura falta', () => {
    const d = load({
      config: { studSpacing: 16, building: { groundSnowLoad: 30, buildingWidth: 348 } },
      walls: [{ id: 'N1', length: 480, section: '2x6', exterior: true, bearing: true, floorsSupported: 2, floorSpan: 'center', openings: [{ id: 'N1-1', type: 'window', roughWidth: 36, roughHeight: 48, offset: 20 }] }],
    });
    expect(projectDataNeeds(d).required).toEqual(['wallHeight']);
  });
});
