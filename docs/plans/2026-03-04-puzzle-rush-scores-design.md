# Puzzle Rush Score Tracking & Min Score to Unblock

## Summary

Track puzzle rush session scores as a new event type on chess.com. Add a configurable "minimum rush score to unblock" setting as an alternative unblock path alongside consecutive puzzle wins.

## Detection

**New file: `src/content/chess-com/puzzle-rush-detector.ts`**

- DOM MutationObserver on `/puzzles/rush` pages
- Watch for the game-over screen element that displays the final score
- Extract the numeric score from the DOM
- Emit a single `puzzle_rush` event per session
- Suppress the existing per-move puzzle detector on `/puzzles/rush` to avoid noise

## Data Model

### Event Type

Add `"puzzle_rush"` to `EventType`:

```ts
export type EventType = "game" | "puzzle" | "puzzle_rush";
```

### Event Shape

```ts
{
  id: "chess.com-puzzle_rush-{timestamp}-{random}",
  type: "puzzle_rush",
  result: "win",  // always "win" — a completed rush is a positive event
  platform: "chess.com",
  timestamp: Date.now(),
  url: "https://www.chess.com/puzzles/rush",
  details: {
    detectionMethod: "dom-rush-gameover",
    extra: { score: 23 }
  }
}
```

### Settings

Add `puzzleRushMinScore` to `UserSettings`:

```ts
export interface UserSettings {
  lossStreakThreshold: number;
  puzzleWinsToUnblock: number;
  puzzleRushMinScore: number;  // default: 5
}
```

New constant: `DEFAULT_PUZZLE_RUSH_MIN_SCORE = 5`

### BlockingState

Add rush-specific fields:

```ts
export interface BlockingState {
  // ...existing fields...
  rushScoreAfterStreak: number;   // best rush score since the loss streak (0 if none)
  rushScoreRequired: number;      // threshold from settings
}
```

## Unblock Logic

Either/or alternative — user can unblock by EITHER path:

```
If blocked (consecutive losses >= threshold):
  1. Check puzzle events newer than most recent game
     - If consecutive wins >= puzzleWinsToUnblock → unblock
  2. Check puzzle_rush events newer than most recent game
     - If any has score >= puzzleRushMinScore → unblock
  3. Otherwise → still blocked
```

A single qualifying rush score is an instant unblock.

## UI Changes

### Event List (overlay + popup)

- New card style for `puzzle_rush` events
- Headline: "Puzzle Rush: 23" (score in headline)
- Meta line: "chess.com"
- Distinct border color (gold/amber accent)

### Popup Settings

- New +/- row: "Rush score to unblock" (1-50), default 5

### Blocking Banner

- Show both paths: "Solve 2 puzzles in a row or score 5+ in Puzzle Rush"
- If rush attempted but score too low: "Best rush score: 3/5"

### Blocking Modal

- Updated description text mentioning both unblock paths

## Files to Modify

1. `src/types.ts` — Add `"puzzle_rush"` to EventType, update UserSettings
2. `src/constants.ts` — Add DEFAULT_PUZZLE_RUSH_MIN_SCORE
3. `src/content/chess-com/puzzle-rush-detector.ts` — **New file**, DOM observer for rush game-over
4. `src/content/chess-com/puzzle-detector.ts` — Skip `/puzzles/rush` pages
5. `src/content/chess-com/content.ts` — Initialize puzzle rush detector
6. `src/content/shared/blocking-logic.ts` — Add rush score check to unblock logic, update BlockingState
7. `src/content/shared/blocking-modal.ts` — Update text for both unblock paths
8. `src/content/shared/overlay.ts` — Render puzzle rush events with distinct styling
9. `src/popup.tsx` — Add rush event card, settings row, update banner text
10. `src/content/chess-com/game-blocker.ts` — Pass new setting through
11. `src/content/lichess/game-blocker.ts` — Pass new setting through
12. `src/background.ts` — Handle new setting

## Scope

- Chess.com only (`/puzzles/rush`). Lichess storm/streak deferred to future iteration.
- No changes to lichess puzzle detector.
