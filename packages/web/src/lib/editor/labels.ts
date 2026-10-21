/**
 * Glossário de rótulos do app (M5): o mesmo nome para o mesmo dado no upload, no card "Before you review", nas
 * configurações do projeto, no inspetor e nos consertos rápidos. Antes, "Wind (mph)" e "Wind speed (mph)",
 * "Snow load" e "Ground snow load", "Not known" e "Worst case" conviviam.
 */

export const LABELS = {
  wallHeight: 'Wall height',
  wallHeightHint: 'Subfloor to top of the double top plate',
  headerHeight: 'Header height',
  headerHeightHint: 'Top of the rough opening, from the subfloor',
  sillHeight: 'Window sill height',
  sillHeightHint: 'Bottom of the rough opening, from the subfloor',
  floors: 'Floors above this level',
  floorSpan: 'Floor span',
  floorSpanUnknown: 'Not known (worst case)',
  floorSpanCenter: 'Center bearing',
  floorSpanClear: 'Clear span',
  snow: 'Ground snow load (psf)',
  width: 'Building width',
  wind: 'Wind speed (mph)',
  exposure: 'Wind exposure',
  exposureUnknown: 'Not known (B)',
  notKnown: 'Not known',
  /** Placeholders iguais em toda tela. */
  widthPlaceholder: `28'`,
  windPlaceholder: '130',
  snowPlaceholder: '30',
  wallHeightPlaceholder: `9'-1 1/8"`,
  headerHeightPlaceholder: `6'-10 1/2"`,
  sillHeightPlaceholder: `2'-0"`,
} as const;
