/**
 * Nameplates and profile frames that ship with the app (art lives under public/assets). A profile
 * stores only the id; everything else is looked up here, so an id read from someone else's
 * profile can never become an arbitrary URL.
 */

import { publicUrl } from '@/util/publicUrl';
import nameplatesJson from './nameplates.json';
import framesJson from './frames.json';

export interface BuiltinNameplate {
  id: string;
  name: string;
  /** A key of NAMEPLATE_PALETTES. */
  palette: string;
  /** Path under public/, e.g. assets/nameplates/<id>.svg */
  file: string;
}

export interface BuiltinFramePiece {
  pos: 'top' | 'bottom' | 'center';
  layer: 'back' | 'front';
  file: string;
}

export interface BuiltinFrame {
  id: string;
  name: string;
  pieces: BuiltinFramePiece[];
}

export const BUILTIN_NAMEPLATES: readonly BuiltinNameplate[] = nameplatesJson as BuiltinNameplate[];
export const BUILTIN_FRAMES: readonly BuiltinFrame[] = framesJson as BuiltinFrame[];

const NAMEPLATE_BY_ID = new Map(BUILTIN_NAMEPLATES.map((n) => [n.id, n]));
const FRAME_BY_ID = new Map(BUILTIN_FRAMES.map((f) => [f.id, f]));

export function getBuiltinNameplate(id: unknown): BuiltinNameplate | undefined {
  return typeof id === 'string' ? NAMEPLATE_BY_ID.get(id) : undefined;
}

export function getBuiltinFrame(id: unknown): BuiltinFrame | undefined {
  return typeof id === 'string' ? FRAME_BY_ID.get(id) : undefined;
}

export function builtinNameplateSrc(n: BuiltinNameplate): string {
  return publicUrl(n.file);
}

export interface BuiltinFramePieceSrc {
  pos: string;
  layer: 'back' | 'front';
  src: string;
}

export function builtinFramePieces(f: BuiltinFrame): BuiltinFramePieceSrc[] {
  return f.pieces.map((p) => ({ pos: p.pos, layer: p.layer, src: publicUrl(p.file) }));
}

/** One image to represent a frame in a picker tile: the centre piece if any, else the first. */
export function builtinFramePreviewSrc(f: BuiltinFrame): string | undefined {
  const piece = f.pieces.find((p) => p.pos === 'center') ?? f.pieces[0];
  return piece ? publicUrl(piece.file) : undefined;
}
