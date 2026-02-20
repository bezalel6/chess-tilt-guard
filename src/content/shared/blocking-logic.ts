import { ChessEvent } from "../../types";

export interface BlockingState {
  blocked: boolean;
  consecutiveLosses: number;
  puzzleWinsAfterStreak: number;
  puzzleWinsNeeded: number;
}

/** Badge-friendly streak summary for the extension icon. */
export interface StreakInfo {
  /** Number of consecutive game losses from newest. */
  consecutiveLosses: number;
  /** Number of consecutive game wins from newest (0 if most recent is not a win). */
  consecutiveWins: number;
}

/**
 * Compute the current win/loss streak from events (newest-first).
 * Only considers games, not puzzles.
 */
export function computeStreakInfo(events: ChessEvent[]): StreakInfo {
  const games = events.filter((e) => e.type === "game");

  let consecutiveLosses = 0;
  let consecutiveWins = 0;

  if (games.length === 0) return { consecutiveLosses: 0, consecutiveWins: 0 };

  // Determine streak type from the most recent game
  const firstResult = games[0].result;

  if (firstResult === "loss") {
    for (const game of games) {
      if (game.result === "loss") consecutiveLosses++;
      else break;
    }
  } else if (firstResult === "win") {
    for (const game of games) {
      if (game.result === "win") consecutiveWins++;
      else break;
    }
  }
  // draw breaks both streaks → both stay 0

  return { consecutiveLosses, consecutiveWins };
}

/**
 * Compute whether the user should be blocked from starting new games.
 *
 * Algorithm (events are sorted newest-first):
 * 1. Filter to games only, count consecutive losses from the top
 *    (a win or draw breaks the streak).
 * 2. If < 2 consecutive losses → not blocked.
 * 3. If >= 2 → check for puzzle events NEWER than the most recent game.
 * 4. Walk those puzzles newest-first; count consecutive wins
 *    (a failed puzzle resets the count to 0).
 * 5. If >= 2 consecutive puzzle wins → not blocked (cooldown complete).
 * 6. Otherwise → blocked, with puzzleWinsNeeded = 2 - count.
 */
export function computeBlockingState(events: ChessEvent[]): BlockingState {
  const NOT_BLOCKED: BlockingState = {
    blocked: false,
    consecutiveLosses: 0,
    puzzleWinsAfterStreak: 0,
    puzzleWinsNeeded: 0,
  };

  if (events.length === 0) return NOT_BLOCKED;

  // Step 1: Count consecutive game losses from newest
  const games = events.filter((e) => e.type === "game");
  let consecutiveLosses = 0;
  for (const game of games) {
    if (game.result === "loss") {
      consecutiveLosses++;
    } else {
      break; // win or draw breaks the streak
    }
  }

  // Step 2: Not enough losses to trigger blocking
  if (consecutiveLosses < 2) {
    return { ...NOT_BLOCKED, consecutiveLosses };
  }

  // Step 3: Find the most recent game's timestamp
  const mostRecentGameTimestamp = games[0]?.timestamp ?? 0;

  // Step 4: Check puzzle events newer than the most recent game
  const recentPuzzles = events.filter(
    (e) => e.type === "puzzle" && e.timestamp > mostRecentGameTimestamp
  );

  let puzzleWinsAfterStreak = 0;
  for (const puzzle of recentPuzzles) {
    if (puzzle.result === "win") {
      puzzleWinsAfterStreak++;
    } else {
      puzzleWinsAfterStreak = 0; // failed puzzle resets the count
    }
  }

  // Step 5: Enough puzzle wins to unblock
  if (puzzleWinsAfterStreak >= 2) {
    return {
      blocked: false,
      consecutiveLosses,
      puzzleWinsAfterStreak,
      puzzleWinsNeeded: 0,
    };
  }

  // Step 6: Still blocked
  return {
    blocked: true,
    consecutiveLosses,
    puzzleWinsAfterStreak,
    puzzleWinsNeeded: 2 - puzzleWinsAfterStreak,
  };
}
