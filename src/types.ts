export type EventType = "game" | "puzzle";
export type EventResult = "win" | "loss" | "draw";
export type Platform = "chess.com" | "lichess";
export type PlayerColor = "white" | "black";

/** Technical details attached to every event for debugging. */
export interface EventDetails {
  /** How the event was detected (e.g. "chess-com-api", "dom-result-wrap"). */
  detectionMethod: string;
  /** The CSS selector or element that triggered detection. */
  matchedSelector?: string;
  /** Player's piece color (games only). */
  playerColor?: PlayerColor;
  /** How the game ended: "Checkmate", "Resignation", "Timeout", etc. */
  endReason?: string;
  /** Raw result string from the source: "win", "checkmated", "timeout", etc. */
  rawResult?: string;
  /** Puzzle ID if applicable. */
  puzzleId?: string;
  /** Raw numeric color value (1=white, 2=black). */
  rawPlayingAs?: number;
  /** FEN string of the final position (API-resolved games only). */
  fen?: string;
  /** Any additional raw data for debugging. */
  extra?: Record<string, unknown>;
}

export interface ChessEvent {
  id: string;
  type: EventType;
  result: EventResult;
  platform: Platform;
  timestamp: number;
  url: string;
  details: EventDetails;
}

/** Message sent from content scripts to the background service worker. */
export interface ChessEventMessage {
  kind: "CHESS_EVENT";
  payload: ChessEvent;
}

/** Message asking background to check pending chess.com games via API. */
export interface CheckPendingGamesMessage {
  kind: "CHECK_PENDING_GAMES";
  username: string;
}

/** A game page the user visited but hasn't been resolved yet. */
export interface PendingGame {
  /** Full game URL, e.g. "https://www.chess.com/game/live/123456" */
  gameUrl: string;
  /** Timestamp when the user visited the game page. */
  seenAt: number;
}

/** Shape of a player object in the chess.com public API response. */
export interface ChessComApiPlayer {
  rating: number;
  result: string;
  username: string;
  "@id": string;
}

/** Shape of a game object in the chess.com public API response. */
export interface ChessComApiGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: string;
  rules: string;
  white: ChessComApiPlayer;
  black: ChessComApiPlayer;
  accuracies?: { white: number; black: number };
}

/** Message asking background to sync recent games for a platform via API. */
export interface SyncGamesMessage {
  kind: "SYNC_GAMES";
  platform: Platform;
  username: string;
}

/** Shape of a player in the Lichess API game response (NDJSON). */
export interface LichessApiPlayer {
  user?: { name: string; id: string };
  rating?: number;
  ratingDiff?: number;
}

/** Shape of a game object from the Lichess API (NDJSON). */
export interface LichessApiGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  perf: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  winner?: "white" | "black";
  lastFen?: string;
  players: {
    white: LichessApiPlayer;
    black: LichessApiPlayer;
  };
}

/** A single platform username entry with its origin. */
export interface UsernameEntry {
  username: string;
  source: "auto" | "manual";
}

/** Usernames stored per platform, managed via popup or auto-detected from DOM. */
export interface StoredUsernames {
  "chess.com"?: UsernameEntry;
  lichess?: UsernameEntry;
}

/** User-configurable blocking thresholds. */
export interface UserSettings {
  lossStreakThreshold: number;
  puzzleWinsToUnblock: number;
}

export type BackgroundMessage =
  | ChessEventMessage
  | CheckPendingGamesMessage
  | SyncGamesMessage;
