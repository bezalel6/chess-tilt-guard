import { Chess } from "chess.js";

/**
 * Extract the final position FEN from a PGN string.
 * Returns null if the PGN is malformed or cannot be parsed.
 */
export function extractFenFromPgn(pgn: string): string | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.fen();
  } catch {
    return null;
  }
}
