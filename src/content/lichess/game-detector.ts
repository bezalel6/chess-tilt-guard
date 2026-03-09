import { sendChessEvent } from "../shared/messaging";
import { EventResult, PlayerColor } from "../../types";

const seenResults = new Set<string>();

/** Maps chessground piece class names to FEN characters. */
const PIECE_TO_FEN: Record<string, Record<string, string>> = {
  white: { king: "K", queen: "Q", rook: "R", bishop: "B", knight: "N", pawn: "P" },
  black: { king: "k", queen: "q", rook: "r", bishop: "b", knight: "n", pawn: "p" },
};

/**
 * Extract a FEN placement string from the Lichess chessground board DOM.
 * Pieces are `<piece class="white king">` with `style="transform: translate(x, y)"`.
 * Coordinates use percentage-based positions (0%, 12.5%, 25%, ... 87.5%).
 */
function extractFenFromBoard(orientation: PlayerColor): string | null {
  const cgBoard = document.querySelector("cg-board");
  if (!cgBoard) return null;

  const pieces = cgBoard.querySelectorAll("piece");
  if (pieces.length === 0) return null;

  // 8x8 grid, null = empty square
  const board: (string | null)[][] = Array.from({ length: 8 }, () =>
    Array(8).fill(null) as (string | null)[]
  );

  for (const piece of pieces) {
    // Skip ghost/dragging pieces
    if (piece.classList.contains("ghost") || piece.classList.contains("dragging")) continue;

    // Determine color and type from classes
    const classes = piece.className.split(/\s+/);
    let color: string | null = null;
    let type: string | null = null;
    for (const cls of classes) {
      if (cls === "white" || cls === "black") color = cls;
      else if (PIECE_TO_FEN.white[cls]) type = cls;
    }
    if (!color || !type) continue;

    const fenChar = PIECE_TO_FEN[color][type];
    if (!fenChar) continue;

    // Parse transform: translate(Xpx, Ypx) or translate(X%, Y%)
    const style = piece.getAttribute("style") ?? "";
    const match = style.match(/translate\(\s*([\d.]+)(%|px)\s*,\s*([\d.]+)(%|px)\s*\)/);
    if (!match) continue;

    let col: number;
    let row: number;

    if (match[2] === "%") {
      // Percentage-based (12.5% increments)
      col = Math.round(parseFloat(match[1]) / 12.5);
      row = Math.round(parseFloat(match[3]) / 12.5);
    } else {
      // Pixel-based — need board width to compute
      const boardRect = cgBoard.getBoundingClientRect();
      if (boardRect.width === 0) continue;
      const squareSize = boardRect.width / 8;
      col = Math.round(parseFloat(match[1]) / squareSize);
      row = Math.round(parseFloat(match[3]) / squareSize);
    }

    // Chessground coordinates: (0,0) is top-left from the current orientation
    // For black orientation, the board is flipped
    if (orientation === "black") {
      col = 7 - col;
      row = 7 - row;
    }

    if (col >= 0 && col < 8 && row >= 0 && row < 8) {
      board[row][col] = fenChar;
    }
  }

  // Build FEN placement string
  const ranks: string[] = [];
  for (let r = 0; r < 8; r++) {
    let rank = "";
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      if (board[r][c]) {
        if (empty > 0) { rank += empty; empty = 0; }
        rank += board[r][c];
      } else {
        empty++;
      }
    }
    if (empty > 0) rank += empty;
    ranks.push(rank);
  }

  return ranks.join("/");
}

function isPlayerView(): boolean {
  // Player game URLs have 12-char IDs (/abcdefghijkl), spectator URLs have 8-char (/abcdefgh)
  const pathParts = location.pathname.split("/");
  const gameId = pathParts[1];
  return gameId?.length === 12;
}

function getUserColor(): PlayerColor | null {
  const board = document.querySelector(".cg-wrap");
  if (board?.classList.contains("orientation-white")) return "white";
  if (board?.classList.contains("orientation-black")) return "black";
  return null;
}

function parseResult(
  resultText: string,
  userColor: PlayerColor
): EventResult | null {
  const trimmed = resultText.trim();

  if (trimmed === "½-½" || trimmed === "1/2-1/2") return "draw";

  const whiteWins = trimmed === "1-0";
  const isWhite = userColor === "white";

  if (trimmed === "1-0" || trimmed === "0-1") {
    return whiteWins === isWhite ? "win" : "loss";
  }

  return null;
}

export function initLichessGameDetector(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const resultWrap = (
          node.matches?.(".result-wrap")
            ? node
            : node.querySelector?.(".result-wrap")
        ) as HTMLElement | null;

        if (resultWrap) {
          handleGameResult(resultWrap);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function handleGameResult(resultWrap: HTMLElement): void {
  if (!isPlayerView()) return;

  const resultEl = resultWrap.querySelector("p.result");
  const statusEl = resultWrap.querySelector("p.status");
  if (!resultEl) return;

  const resultText = resultEl.textContent ?? "";
  const statusText = statusEl?.textContent?.trim() ?? "";
  const userColor = getUserColor();
  if (!userColor) return;

  const result = parseResult(resultText, userColor);
  if (!result) return;

  // Dedup within this tab
  const dedupKey = `${resultText}-${userColor}-${Math.floor(
    Date.now() / 5000
  )}`;
  if (seenResults.has(dedupKey)) return;
  seenResults.add(dedupKey);

  // Extract game ID from URL path
  const pathParts = location.pathname.split("/");
  const gameId = pathParts[1] ?? "";

  // Extract final position FEN from the visible board
  const fen = extractFenFromBoard(userColor);

  sendChessEvent({
    id: `lichess-game-${gameId}`,
    type: "game",
    result,
    platform: "lichess",
    timestamp: Date.now(),
    url: location.href,
    details: {
      detectionMethod: "dom-result-wrap",
      matchedSelector: "div.result-wrap > p.result",
      playerColor: userColor,
      rawResult: resultText.trim(),
      endReason: statusText || undefined,
      fen: fen ?? undefined,
      extra: {
        gameId,
        boardOrientation: userColor,
        urlPathLength: gameId.length,
      },
    },
  });
}
