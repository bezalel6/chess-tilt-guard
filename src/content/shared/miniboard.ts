/**
 * Pure HTML/CSS miniboard renderer from FEN strings.
 * Uses Unicode chess pieces on an 8x8 CSS grid.
 * Works in both shadow DOM (overlay) and React (popup).
 */

const PIECE_MAP: Record<string, string> = {
  K: "\u2654", // ♔
  Q: "\u2655", // ♕
  R: "\u2656", // ♖
  B: "\u2657", // ♗
  N: "\u2658", // ♘
  P: "\u2659", // ♙
  k: "\u265A", // ♚
  q: "\u265B", // ♛
  r: "\u265C", // ♜
  b: "\u265D", // ♝
  n: "\u265E", // ♞
  p: "\u265F", // ♟
};

const LIGHT_SQUARE = "#e8dab2";
const DARK_SQUARE = "#b58863";
const WHITE_PIECE_COLOR = "#fff";
const BLACK_PIECE_COLOR = "#222";
const BOARD_SIZE = 200;
const SQUARE_SIZE = BOARD_SIZE / 8;

/** White pieces are uppercase in FEN notation. */
function isWhitePiece(fenChar: string): boolean {
  return fenChar >= "A" && fenChar <= "Z";
}

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
      } else if (PIECE_MAP[char]) {
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
export function renderMiniboard(fen: string): string {
  const board = parseFenPlacement(fen);
  if (!board) return "";

  let squares = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      const bg = isLight ? LIGHT_SQUARE : DARK_SQUARE;
      const piece = board[row][col];
      const pieceChar = piece ? PIECE_MAP[piece] ?? "" : "";
      const pieceColor = piece
        ? isWhitePiece(piece)
          ? WHITE_PIECE_COLOR
          : BLACK_PIECE_COLOR
        : "";

      squares += `<div style="
        width:${SQUARE_SIZE}px;
        height:${SQUARE_SIZE}px;
        background:${bg};
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:${SQUARE_SIZE * 0.8}px;
        line-height:1;
        ${pieceColor ? `color:${pieceColor};text-shadow:0 0 2px rgba(0,0,0,0.6);` : ""}
      ">${pieceChar}</div>`;
    }
  }

  return `<div style="
    display:grid;
    grid-template-columns:repeat(8,${SQUARE_SIZE}px);
    grid-template-rows:repeat(8,${SQUARE_SIZE}px);
    width:${BOARD_SIZE}px;
    height:${BOARD_SIZE}px;
    border:1px solid #555;
    border-radius:2px;
    overflow:hidden;
  ">${squares}</div>`;
}

/**
 * Render a FEN string as a React-compatible miniboard using inline styles.
 * Returns JSX-friendly props for React components.
 */
export function renderMiniboardReact(fen: string): {
  html: string;
  width: number;
  height: number;
} | null {
  const html = renderMiniboard(fen);
  if (!html) return null;
  return { html, width: BOARD_SIZE, height: BOARD_SIZE };
}
