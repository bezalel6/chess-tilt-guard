import { sendChessEvent } from "../shared/messaging";
import { EventResult, PlayerColor } from "../../types";

const seenResults = new Set<string>();

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
      extra: {
        gameId,
        boardOrientation: userColor,
        urlPathLength: gameId.length,
      },
    },
  });
}
