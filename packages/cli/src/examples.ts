/**
 * Os projetos de exemplo do CLI como texto, para o app web (S20) oferecer sem ler o disco.
 * `text` é o JSON formatado (2 espaços), exatamente o que o usuário veria ao abrir o arquivo.
 */

import casaExemplo from '../examples/casa-exemplo.json' with { type: 'json' };
import house28x40 from '../examples/house-28x40.json' with { type: 'json' };
import ringgold from '../examples/ringgold-checkpoint.json' with { type: 'json' };

export interface Example {
  id: string;
  label: string;
  text: string;
}

export const EXAMPLES: readonly Example[] = [
  { id: 'casa-exemplo', label: 'Sample house (L corner, tee, loose walls)', text: JSON.stringify(casaExemplo, null, 2) },
  { id: 'house-28x40', label: 'House 28×40 (full plan, 5 walls)', text: JSON.stringify(house28x40, null, 2) },
  { id: 'ringgold-checkpoint', label: '26 Ringgold St (4 wall segments)', text: JSON.stringify(ringgold, null, 2) },
];
