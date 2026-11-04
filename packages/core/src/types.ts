/**
 * Tipos do motor de painelização, reunidos para quem importa tudo de uma vez (`index.ts`, testes).
 * Cada grupo mora no seu módulo (S28.1): seções e suas dimensões em `sections.ts`, aberturas em `opening.ts`,
 * parede e ligações em `wall.ts`, painel e peças em `panel.ts`, configuração em `config.ts`. Os módulos do
 * motor importam direto do módulo do grupo.
 *
 * Convenções (ver docs/02-framing.md):
 * - Todas as medidas em polegadas decimais.
 * - x=0 no início da parede (esquerda); y=0 na base da bottom plate.
 * - `Member.x` / `Member.y` = canto inferior esquerdo da peça.
 */

export * from './sections';
export * from './opening';
export * from './wall';
export * from './panel';
export * from './config';
