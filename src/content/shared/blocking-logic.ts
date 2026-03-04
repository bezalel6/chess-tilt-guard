import { ChessEvent } from "../../types";
import {
  DEFAULT_LOSS_STREAK_THRESHOLD,
  DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
  DEFAULT_PUZZLE_RUSH_MIN_SCORE,
} from "../../constants";

export interface BlockingState {
  blocked: boolean;
  consecutiveLosses: number;
  puzzleWinsAfterStreak: number;
  puzzleWinsNeeded: number;
  /** Total puzzle wins required to unblock (for display). */
  puzzleWinsRequired: number;
  /** Best rush score since the loss streak (0 if none). */
  rushScoreAfterStreak: number;
  /** Threshold from settings. */
  rushScoreRequired: number;
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
 * 2. If < lossStreakThreshold consecutive losses → not blocked.
 * 3. If >= threshold → check for puzzle events NEWER than the most recent game.
 * 4. Walk those puzzles newest-first; count consecutive wins
 *    (a failed puzzle resets the count to 0).
 * 5. If >= puzzleWinsToUnblock consecutive puzzle wins → not blocked.
 * 6. Otherwise → blocked, with puzzleWinsNeeded = puzzleWinsToUnblock - count.
 */
export function computeBlockingState(
  events: ChessEvent[],
  lossStreakThreshold = DEFAULT_LOSS_STREAK_THRESHOLD,
  puzzleWinsToUnblock = DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
  puzzleRushMinScore = DEFAULT_PUZZLE_RUSH_MIN_SCORE
): BlockingState {
  const NOT_BLOCKED: BlockingState = {
    blocked: false,
    consecutiveLosses: 0,
    puzzleWinsAfterStreak: 0,
    puzzleWinsNeeded: 0,
    puzzleWinsRequired: puzzleWinsToUnblock,
    rushScoreAfterStreak: 0,
    rushScoreRequired: puzzleRushMinScore,
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
  if (consecutiveLosses < lossStreakThreshold) {
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

  // Step 4b: Check puzzle rush events newer than the most recent game
  const recentRushes = events.filter(
    (e) => e.type === "puzzle_rush" && e.timestamp > mostRecentGameTimestamp
  );
  let rushScoreAfterStreak = 0;
  for (const rush of recentRushes) {
    const score = (rush.details.extra?.score as number) ?? 0;
    if (score > rushScoreAfterStreak) rushScoreAfterStreak = score;
  }

  // Step 5: Enough puzzle wins to unblock
  if (puzzleWinsAfterStreak >= puzzleWinsToUnblock) {
    return {
      blocked: false,
      consecutiveLosses,
      puzzleWinsAfterStreak,
      puzzleWinsNeeded: 0,
      puzzleWinsRequired: puzzleWinsToUnblock,
      rushScoreAfterStreak,
      rushScoreRequired: puzzleRushMinScore,
    };
  }

  // Step 5b: Rush score meets threshold → unblock
  if (rushScoreAfterStreak >= puzzleRushMinScore) {
    return {
      blocked: false,
      consecutiveLosses,
      puzzleWinsAfterStreak,
      puzzleWinsNeeded: puzzleWinsToUnblock - puzzleWinsAfterStreak,
      puzzleWinsRequired: puzzleWinsToUnblock,
      rushScoreAfterStreak,
      rushScoreRequired: puzzleRushMinScore,
    };
  }

  // Step 6: Still blocked
  return {
    blocked: true,
    consecutiveLosses,
    puzzleWinsAfterStreak,
    puzzleWinsNeeded: puzzleWinsToUnblock - puzzleWinsAfterStreak,
    puzzleWinsRequired: puzzleWinsToUnblock,
    rushScoreAfterStreak,
    rushScoreRequired: puzzleRushMinScore,
  };
}
