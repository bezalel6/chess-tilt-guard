/**
 * SVG chess piece icons for the miniboard.
 * Imports pre-made SVGs from public/ and maps FEN characters to them.
 */

import wK from "../../../public/wK.svg";
import wQ from "../../../public/wQ.svg";
import wR from "../../../public/wR.svg";
import wB from "../../../public/wB.svg";
import wN from "../../../public/wN.svg";
import wP from "../../../public/wP.svg";
import bK from "../../../public/bK.svg";
import bQ from "../../../public/bQ.svg";
import bR from "../../../public/bR.svg";
import bB from "../../../public/bB.svg";
import bN from "../../../public/bN.svg";
import bP from "../../../public/bP.svg";

/** Map from FEN character to raw SVG string. */
const PIECE_SVG: Record<string, string> = {
  K: wK,
  Q: wQ,
  R: wR,
  B: wB,
  N: wN,
  P: wP,
  k: bK,
  q: bQ,
  r: bR,
  b: bB,
  n: bN,
  p: bP,
};

/**
 * Get an inline SVG string for a chess piece given its FEN character.
 * Uppercase = white piece, lowercase = black piece.
 */
export function getChessPieceSvg(fenChar: string): string {
  return PIECE_SVG[fenChar] ?? "";
}
