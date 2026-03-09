/**
 * Pure HTML/CSS miniboard renderer from FEN strings.
 * Uses SVG chess piece icons on an 8x8 CSS grid.
 * Works in both shadow DOM (overlay) and React (popup).
 */

import { getChessPieceSvg } from "./chess-pieces";
import { DEFAULT_BOARD_SIZE } from "../../constants";

/** Valid FEN piece characters for parsing. */
const VALID_PIECES = new Set("KQRBNPkqrbnp".split(""));

const LIGHT_SQUARE = "#e8dab2";
const DARK_SQUARE = "#b58863";

/**
 * Parse the piece placement section of a FEN string into an 8x8 array.
 * Returns null if the FEN is invalid.
 */
function parseFenPlacement(fen: string): (string | null)[][] | null {
  const placement = fen.split(" ")[0];
  if (!placement) return null;

  const ranks = placement.split("/");
  if (ranks.length !== 8) return null;

  const board: (string | null)[][] = [];
  for (const rank of ranks) {
    const row: (string | null)[] = [];
    for (const char of rank) {
      if (char >= "1" && char <= "8") {
        for (let i = 0; i < parseInt(char); i++) row.push(null);
      } else if (VALID_PIECES.has(char)) {
        row.push(char);
      } else {
        return null;
      }
    }
    if (row.length !== 8) return null;
    board.push(row);
  }
  return board;
}

/**
 * Render a FEN string as an HTML miniboard (inline styles, no external CSS).
 * Returns an HTML string suitable for injection into shadow DOM.
 */
export function renderMiniboard(
  fen: string,
  boardSize: number = DEFAULT_BOARD_SIZE,
): string {
  const board = parseFenPlacement(fen);
  if (!board) return "";

  const squareSize = boardSize / 8;

  let squares = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      const bg = isLight ? LIGHT_SQUARE : DARK_SQUARE;
      const piece = board[row][col];
      const pieceSvg = piece ? getChessPieceSvg(piece) : "";

      squares += `<div style="
        width:${squareSize}px;
        height:${squareSize}px;
        background:${bg};
        display:flex;
        align-items:center;
        justify-content:center;
        padding:1px;
        box-sizing:border-box;
      ">${pieceSvg}</div>`;
    }
  }

  return `<div style="
    display:grid;
    grid-template-columns:repeat(8,${squareSize}px);
    grid-template-rows:repeat(8,${squareSize}px);
    width:${boardSize}px;
    height:${boardSize}px;
    border:1px solid #555;
    border-radius:2px;
    overflow:hidden;
  ">${squares}</div>`;
}

/**
 * Render a FEN string as a React-compatible miniboard using inline styles.
 * Returns JSX-friendly props for React components.
 */
export function renderMiniboardReact(
  fen: string,
  boardSize: number = DEFAULT_BOARD_SIZE,
): {
  html: string;
  width: number;
  height: number;
} | null {
  const html = renderMiniboard(fen, boardSize);
  if (!html) return null;
  return { html, width: boardSize, height: boardSize };
}
