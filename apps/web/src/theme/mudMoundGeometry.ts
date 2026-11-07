// Mud mound mark. Geometry copied from public/assets/images/logo.svg.
// Each facet picks one of six logo tones (0 darkest, 5 lightest), which map to the
// theme logo tokens (p0..p5) in the app and to the palette in the static logo SVGs.

export const MUD_MOUND_VIEWBOX = '0 0 400 400';

export type MudTone = 0 | 1 | 2 | 3 | 4 | 5;

export interface MudFacet {
  points: string;
  tone: MudTone;
}

export const MUD_MOUND_FACETS: readonly MudFacet[] = [
  { points: '60,200 130,120 125,205', tone: 4 },
  { points: '130,120 210,140 125,205', tone: 5 },
  { points: '130,120 210,55 210,140', tone: 5 },
  { points: '210,55 280,100 210,140', tone: 4 },
  { points: '280,100 285,195 210,140', tone: 4 },
  { points: '280,100 340,180 285,195', tone: 2 },
  { points: '340,180 365,270 285,195', tone: 1 },
  { points: '40,290 60,200 125,205', tone: 3 },
  { points: '40,290 125,205 105,285', tone: 3 },
  { points: '125,205 210,140 200,260', tone: 4 },
  { points: '210,140 285,195 200,260', tone: 3 },
  { points: '125,205 200,260 105,285', tone: 3 },
  { points: '285,195 300,285 200,260', tone: 1 },
  { points: '285,195 365,270 300,285', tone: 1 },
  { points: '365,270 330,330 300,285', tone: 0 },
  { points: '330,330 180,340 300,285', tone: 0 },
  { points: '300,285 180,340 200,260', tone: 1 },
  { points: '200,260 180,340 105,285', tone: 2 },
  { points: '105,285 180,340 95,320', tone: 0 },
  { points: '40,290 105,285 95,320', tone: 2 },
  { points: '95,320 180,340 90,385', tone: 0 },
  { points: '185,92 212,68 208,108', tone: 5 },
];
