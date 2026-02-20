import {
  ChessEvent,
  EventResult,
  LichessApiGame,
  PlayerColor,
} from "../types";

const LOG = "[CTG LichessAPI]";

/** Map Lichess status strings to human-readable end reasons. */
const STATUS_MAP: Record<string, string> = {
  mate: "Checkmate",
  resign: "Resignation",
  stalemate: "Stalemate",
  timeout: "Timeout",
  draw: "Draw",
  outoftime: "Out of time",
  aborted: "Aborted",
  cheat: "Cheat detected",
  noStart: "No start",
  variantEnd: "Variant end",
};

/**
 * Fetch the last N finished games for a Lichess user.
 * Returns parsed game objects, or an empty array on failure.
 */
export async function fetchLichessGames(
  username: string,
  max = 10
): Promise<LichessApiGame[]> {
  const url = `https://lichess.org/api/games/user/${username}?max=${max}&sort=dateDesc&finished=true&moves=false`;
  console.log(LOG, "Fetching:", url);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/x-ndjson",
        "User-Agent": "ChessTiltGuard/0.1.0",
      },
    });

    if (!res.ok) {
      console.warn(LOG, "API returned", res.status);
      return [];
    }

    const text = await res.text();
    return text
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as LichessApiGame);
  } catch (err) {
    console.error(LOG, "Fetch failed:", err);
    return [];
  }
}

/**
 * Convert a Lichess API game object to a ChessEvent.
 * Returns null if the user isn't a player in the game.
 */
export function lichessGameToEvent(
  game: LichessApiGame,
  username: string
): ChessEvent | null {
  const lowerUser = username.toLowerCase();
  const isWhite = game.players.white.user?.id?.toLowerCase() === lowerUser;
  const isBlack = game.players.black.user?.id?.toLowerCase() === lowerUser;

  if (!isWhite && !isBlack) return null;

  const playerColor: PlayerColor = isWhite ? "white" : "black";

  let result: EventResult;
  if (!game.winner) {
    result = "draw";
  } else if (game.winner === playerColor) {
    result = "win";
  } else {
    result = "loss";
  }

  return {
    id: `lichess-game-${game.id}`,
    type: "game",
    result,
    platform: "lichess",
    timestamp: game.lastMoveAt,
    url: `https://lichess.org/${game.id}`,
    details: {
      detectionMethod: "lichess-api",
      playerColor,
      endReason: STATUS_MAP[game.status] ?? game.status,
      rawResult: game.status,
      extra: {
        speed: game.speed,
        perf: game.perf,
        rated: game.rated,
        playerRating: isWhite
          ? game.players.white.rating
          : game.players.black.rating,
        opponentRating: isWhite
          ? game.players.black.rating
          : game.players.white.rating,
        opponentUsername: isWhite
          ? game.players.black.user?.name
          : game.players.white.user?.name,
      },
    },
  };
}
