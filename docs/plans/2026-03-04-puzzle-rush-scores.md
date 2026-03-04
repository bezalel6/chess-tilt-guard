# Puzzle Rush Score Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track chess.com puzzle rush final session scores as a new event type and add a "minimum rush score to unblock" as an alternative unblock path alongside consecutive puzzle wins.

**Architecture:** New `puzzle_rush` event type with DOM-based detection on `/puzzles/rush`. MutationObserver watches for the game-over modal (`[data-cy="modalRushOver"]`) and extracts the score from `[data-cy="puzzles-modals-score"]`. Blocking logic gains an either/or alternative: user unblocks via consecutive puzzle wins OR a single qualifying rush score. Chess.com only; Lichess storm/streak deferred.

**Tech Stack:** TypeScript, Chrome Extension MV3, MutationObserver, chrome.storage.local, React (popup)

---

## Task 1: Types & Constants

**Files:**
- Modify: `src/types.ts`
- Modify: `src/constants.ts`

**Step 1: Add `puzzle_rush` to EventType**

In `src/types.ts`, change line 1:

```ts
// Before:
export type EventType = "game" | "puzzle";

// After:
export type EventType = "game" | "puzzle" | "puzzle_rush";
```

**Step 2: Add `puzzleRushMinScore` to UserSettings**

In `src/types.ts`, update the `UserSettings` interface:

```ts
export interface UserSettings {
  lossStreakThreshold: number;
  puzzleWinsToUnblock: number;
  puzzleRushMinScore: number;
}
```

**Step 3: Add default constant**

In `src/constants.ts`, add after the existing defaults:

```ts
export const DEFAULT_PUZZLE_RUSH_MIN_SCORE = 5;
```

**Step 4: Build to verify**

Run: `npm run build`
Expected: Compile errors in files that construct `UserSettings` without the new field (game blockers, popup). That's fine — we'll fix them in subsequent tasks.

---

## Task 2: Blocking Logic

**Files:**
- Modify: `src/content/shared/blocking-logic.ts`

**Step 1: Add rush fields to BlockingState**

```ts
export interface BlockingState {
  blocked: boolean;
  consecutiveLosses: number;
  puzzleWinsAfterStreak: number;
  puzzleWinsNeeded: number;
  puzzleWinsRequired: number;
  rushScoreAfterStreak: number;   // best rush score since the loss streak (0 if none)
  rushScoreRequired: number;      // threshold from settings
}
```

**Step 2: Add `puzzleRushMinScore` parameter to `computeBlockingState`**

Update the function signature:

```ts
export function computeBlockingState(
  events: ChessEvent[],
  lossStreakThreshold = DEFAULT_LOSS_STREAK_THRESHOLD,
  puzzleWinsToUnblock = DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
  puzzleRushMinScore = DEFAULT_PUZZLE_RUSH_MIN_SCORE
): BlockingState {
```

Import `DEFAULT_PUZZLE_RUSH_MIN_SCORE` from constants.

**Step 3: Add rush score check in the blocking algorithm**

After the existing puzzle wins check (step 5 in the algorithm comments), add a rush score check. Between step 4 and step 5, also find the best rush score:

```ts
// After computing puzzleWinsAfterStreak...

// Step 4b: Check puzzle_rush events newer than the most recent game
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
```

**Step 4: Update all return paths to include rush fields**

Every `BlockingState` return value must include `rushScoreAfterStreak: 0` and `rushScoreRequired: puzzleRushMinScore`. Update `NOT_BLOCKED` and the final "still blocked" return.

---

## Task 3: Fix Callers of BlockingState and UserSettings

Because `BlockingState` now has two new required fields and `UserSettings` has a new required field, every caller must be updated.

**Files:**
- Modify: `src/content/chess-com/game-blocker.ts`
- Modify: `src/content/lichess/game-blocker.ts`
- Modify: `src/popup.tsx`
- Modify: `src/background.ts`

**Step 1: Update game blocker initial state (both files)**

In the `cachedState` literal in both game blockers, add:

```ts
rushScoreAfterStreak: 0,
rushScoreRequired: DEFAULT_PUZZLE_RUSH_MIN_SCORE,
```

Import `DEFAULT_PUZZLE_RUSH_MIN_SCORE` from constants.

**Step 2: Update game blocker settings handling (both files)**

In the settings read logic, also read `puzzleRushMinScore`:

```ts
let cachedRushMinScore = DEFAULT_PUZZLE_RUSH_MIN_SCORE;

// In settings read:
cachedRushMinScore = settings.puzzleRushMinScore ?? DEFAULT_PUZZLE_RUSH_MIN_SCORE;

// In recompute:
function recompute(events: ChessEvent[]): void {
  cachedState = computeBlockingState(events, cachedLossThreshold, cachedPuzzleWins, cachedRushMinScore);
}
```

**Step 3: Update game blocker UserSettings construction**

When writing settings, include the new field. The game blockers only read settings, so just ensure the read handles the new field. The settings change listener already handles generic `UserSettings`.

**Step 4: Update popup initial BlockingState**

In `src/popup.tsx`, the `useState<BlockingState>` initial value needs the new fields:

```ts
rushScoreAfterStreak: 0,
rushScoreRequired: DEFAULT_PUZZLE_RUSH_MIN_SCORE,
```

Import `DEFAULT_PUZZLE_RUSH_MIN_SCORE`.

**Step 5: Update popup settings state**

Add `rushMinScore` state alongside `lossThreshold` and `puzzleWins`:

```ts
const [rushMinScore, setRushMinScore] = useState(DEFAULT_PUZZLE_RUSH_MIN_SCORE);
```

Read from storage and listen for changes (same pattern as existing settings).

**Step 6: Update popup `updateSettings` function**

```ts
const updateSettings = (lt: number, pw: number, rms: number) => {
  const settings: UserSettings = {
    lossStreakThreshold: Math.max(1, Math.min(10, lt)),
    puzzleWinsToUnblock: Math.max(1, Math.min(10, pw)),
    puzzleRushMinScore: Math.max(1, Math.min(50, rms)),
  };
  setLossThreshold(settings.lossStreakThreshold);
  setPuzzleWins(settings.puzzleWinsToUnblock);
  setRushMinScore(settings.puzzleRushMinScore);
  setBlockingState(computeBlockingState(
    events,
    settings.lossStreakThreshold,
    settings.puzzleWinsToUnblock,
    settings.puzzleRushMinScore
  ));
  chrome.storage.local.set({ [SETTINGS_KEY]: settings });
};
```

Update all existing `updateSettings` call sites to pass `rushMinScore` as the third arg.

**Step 7: Update popup `clearHistory`**

```ts
const clearHistory = () => {
  chrome.storage.local.remove(STORAGE_KEY);
  setEvents([]);
  setBlockingState(computeBlockingState([], lossThreshold, puzzleWins, rushMinScore));
};
```

**Step 8: Update all `computeBlockingState` calls in popup**

Pass `rushMinScore` as the fourth argument wherever `computeBlockingState` is called (mount, storage listener, settings change).

**Step 9: Build to verify**

Run: `npm run build`
Expected: SUCCESS — all type errors resolved.

**Step 10: Commit**

```bash
git add src/types.ts src/constants.ts src/content/shared/blocking-logic.ts src/content/chess-com/game-blocker.ts src/content/lichess/game-blocker.ts src/popup.tsx src/background.ts
git commit -m "feat: Add puzzle_rush event type, rush score to blocking logic"
```

---

## Task 4: Puzzle Rush Detector

**Files:**
- Create: `src/content/chess-com/puzzle-rush-detector.ts`

**Step 1: Create the detector**

DOM selectors (from user-provided HTML):
- Game-over modal: `[data-cy="modalRushOver"]` or `.puzzle-modal-rush-over-component`
- Score: `span[data-cy="puzzles-modals-score"]` (contains numeric score like "13")

```ts
import { sendChessEvent, generateEventId } from "../shared/messaging";

const LOG = "[CTG PuzzleRushDetector]";

let observing = false;
let lastEmittedTimestamp = 0;

/** Minimum interval between rush events to prevent duplicates (ms). */
const DEBOUNCE_MS = 5000;

export function initChessComPuzzleRushDetector(): void {
  if (!location.pathname.startsWith("/puzzles/rush")) return;
  if (observing) return;
  observing = true;

  console.log(LOG, "Observing puzzle rush game-over on", location.pathname);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const modal =
          node.matches?.('[data-cy="modalRushOver"]')
            ? node
            : node.querySelector?.('[data-cy="modalRushOver"]');

        if (modal) {
          handleRushGameOver(modal as HTMLElement);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function handleRushGameOver(modal: HTMLElement): void {
  const now = Date.now();
  if (now - lastEmittedTimestamp < DEBOUNCE_MS) {
    console.log(LOG, "Debounced — too soon after last emission");
    return;
  }

  const scoreEl = modal.querySelector('[data-cy="puzzles-modals-score"]');
  if (!scoreEl) {
    console.warn(LOG, "Game-over modal found but no score element");
    return;
  }

  const scoreText = (scoreEl.textContent ?? "").trim();
  const score = parseInt(scoreText, 10);

  if (isNaN(score) || score < 0) {
    console.warn(LOG, "Could not parse rush score:", scoreText);
    return;
  }

  lastEmittedTimestamp = now;

  console.log(LOG, "Puzzle Rush completed, score:", score);

  sendChessEvent({
    id: generateEventId("chess.com", "puzzle_rush"),
    type: "puzzle_rush",
    result: "win", // a completed rush is always a positive event
    platform: "chess.com",
    timestamp: now,
    url: location.href,
    details: {
      detectionMethod: "dom-rush-gameover",
      matchedSelector: '[data-cy="modalRushOver"]',
      extra: { score },
    },
  });
}
```

---

## Task 5: Suppress Puzzle Detector on Rush Pages & Wire Up Rush Detector

**Files:**
- Modify: `src/content/chess-com/puzzle-detector.ts`
- Modify: `src/content/chess-com/content.ts`

**Step 1: Skip `/puzzles/rush` in puzzle detector**

In `puzzle-detector.ts`, update `initChessComPuzzleDetector()`:

```ts
// Before:
if (!location.pathname.startsWith("/puzzles")) return;

// After:
if (!location.pathname.startsWith("/puzzles")) return;
if (location.pathname.startsWith("/puzzles/rush")) return; // handled by puzzle-rush-detector
```

**Step 2: Wire up rush detector in content.ts**

In `src/content/chess-com/content.ts`:

```ts
import { initChessComPuzzleRushDetector } from "./puzzle-rush-detector";

// In init():
initChessComPuzzleRushDetector();

// In watchNavigation callback:
initChessComPuzzleRushDetector();
```

**Step 3: Build to verify**

Run: `npm run build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add src/content/chess-com/puzzle-rush-detector.ts src/content/chess-com/puzzle-detector.ts src/content/chess-com/content.ts
git commit -m "feat: Add puzzle rush detector, suppress puzzle detector on rush pages"
```

---

## Task 6: UI — Rush Event Rendering

**Files:**
- Modify: `src/content/shared/overlay.ts` (shadow DOM overlay)
- Modify: `src/popup.tsx` (React popup)

**Step 1: Add rush color constant**

In both `overlay.ts` and `popup.tsx`, add to `RESULT_COLORS`:

```ts
// No new key needed — rush events use result "win", so they'll get the green border.
// But we want a distinct gold/amber accent for rush events specifically.
```

Actually, since rush events always have `result: "win"`, they'll get green borders by default. To distinguish them:

**Step 2: Update overlay `buildHeadline`**

In `overlay.ts`:

```ts
function buildHeadline(event: ChessEvent): string {
  if (event.type === "puzzle_rush") {
    const score = (event.details.extra?.score as number) ?? 0;
    return `Puzzle Rush: ${score}`;
  }
  if (event.type === "puzzle") {
    return event.result === "win" ? "Puzzle Solved" : "Puzzle Failed";
  }
  // ... rest unchanged
}
```

**Step 3: Update overlay `buildMetaLine`**

Rush events should show "chess.com" as meta:

```ts
function buildMetaLine(event: ChessEvent): string {
  if (event.type === "puzzle_rush") {
    return event.platform;
  }
  // ... rest unchanged
}
```

Actually, the existing fallback at the bottom of `buildMetaLine` already returns `event.platform` when no parts are built, so rush events will naturally show "chess.com". No change needed.

**Step 4: Update overlay `renderEvent` for rush styling**

Add a distinct border color for rush events. In `renderEvent`:

```ts
function renderEvent(event: ChessEvent, index: number): string {
  let colors = RESULT_COLORS[event.result] ?? RESULT_COLORS.draw;
  // Distinct gold/amber accent for puzzle rush
  if (event.type === "puzzle_rush") {
    colors = { border: "#ffa726", bg: "rgba(255, 167, 38, 0.08)" };
  }
  // ... rest unchanged
}
```

**Step 5: Update overlay tooltip for rush events**

In `buildTooltipContent`, add a case for puzzle_rush:

```ts
} else if (event.type === "puzzle_rush") {
  const score = (extra?.score as number) ?? 0;
  metaLines.push(`Score: ${score}`);
  metaLines.push(event.platform);
} else {
  // existing puzzle case
}
```

**Step 6: Update popup `buildHeadline`**

Same change as overlay — show "Puzzle Rush: {score}":

```ts
if (event.type === "puzzle_rush") {
  const score = (event.details.extra?.score as number) ?? 0;
  return `Puzzle Rush: ${score}`;
}
```

**Step 7: Update popup `EventCard` for rush styling**

Override colors for rush events:

```ts
let colors = RESULT_COLORS[event.result] ?? RESULT_COLORS.draw;
if (event.type === "puzzle_rush") {
  colors = { border: "#ffa726", bg: "rgba(255, 167, 38, 0.08)" };
}
```

**Step 8: Update popup `buildTooltipMeta` for rush events**

```ts
} else if (event.type === "puzzle_rush") {
  const score = (extra?.score as number) ?? 0;
  lines.push(`Score: ${score}`);
  lines.push(event.platform);
} else {
  // existing puzzle case
}
```

**Step 9: Build to verify**

Run: `npm run build`
Expected: SUCCESS

**Step 10: Commit**

```bash
git add src/content/shared/overlay.ts src/popup.tsx
git commit -m "feat: Render puzzle rush events with distinct gold accent and score headline"
```

---

## Task 7: UI — Settings Row & Banner/Modal Text

**Files:**
- Modify: `src/popup.tsx`
- Modify: `src/content/shared/blocking-modal.ts`

**Step 1: Add "Rush score to unblock" settings row in popup**

Add after the "Puzzles to unblock" row, same pattern:

```tsx
<div style={{ /* same row styles */ }}>
  <span>Rush score to unblock</span>
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <button
      onClick={() => updateSettings(lossThreshold, puzzleWins, rushMinScore - 1)}
      style={{ ...btnStyle, padding: "1px 6px", fontSize: 10 }}
    >
      &minus;
    </button>
    <span style={{ color: "#e0e0e0", minWidth: 20, textAlign: "center" }}>
      {rushMinScore}
    </span>
    <button
      onClick={() => updateSettings(lossThreshold, puzzleWins, rushMinScore + 1)}
      style={{ ...btnStyle, padding: "1px 6px", fontSize: 10 }}
    >
      +
    </button>
  </div>
</div>
```

**Step 2: Update BlockingBanner text**

Show both unblock paths:

```tsx
const BlockingBanner: React.FC<{ state: BlockingState }> = ({ state }) => {
  if (!state.blocked) return null;

  const puzzleProgress =
    state.puzzleWinsAfterStreak > 0
      ? `${state.puzzleWinsAfterStreak}/${state.puzzleWinsRequired} puzzles solved`
      : `Solve ${state.puzzleWinsRequired} puzzles in a row`;

  const rushProgress =
    state.rushScoreAfterStreak > 0
      ? `Best rush score: ${state.rushScoreAfterStreak}/${state.rushScoreRequired}`
      : `or score ${state.rushScoreRequired}+ in Puzzle Rush`;

  return (
    <div style={{ /* existing styles */ }}>
      <span style={{ fontSize: 16 }}>&#9888;&#65039;</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#f44336" }}>
          Game Blocking Active
        </div>
        <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>
          {state.consecutiveLosses} losses in a row &middot; {puzzleProgress} {rushProgress}
        </div>
      </div>
    </div>
  );
};
```

**Step 3: Update blocking modal text**

In `src/content/shared/blocking-modal.ts`, update the `progress` string and description to mention both paths:

```ts
const puzzleProgress =
  state.puzzleWinsAfterStreak > 0
    ? `You've solved ${state.puzzleWinsAfterStreak} so far — <strong>${winsNeeded} more</strong> to go.`
    : `Solve <strong>${winsNeeded} puzzles</strong> in a row to unlock.`;

const rushInfo = `Or score <strong>${state.rushScoreRequired}+</strong> in Puzzle Rush.`;

// In the modal HTML:
<p class="ctg-modal-desc">
  Playing on tilt leads to more losses. Cool down with some puzzles first.
  ${puzzleProgress} ${rushInfo}
</p>
```

Update `showBlockingModal` to accept `BlockingState` (it already does — just needs the new fields).

**Step 4: Build to verify**

Run: `npm run build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add src/popup.tsx src/content/shared/blocking-modal.ts
git commit -m "feat: Add rush score settings row, update banner/modal text for both unblock paths"
```

---

## Verification Checklist

1. `npm run build` — must compile without errors
2. Load `dist/` in Chrome, navigate to `chess.com/puzzles/rush`:
   - Existing puzzle detector should NOT fire on rush page
   - Complete a rush session → game-over modal appears → rush event emitted
   - Event appears in overlay with gold accent and "Puzzle Rush: {score}" headline
3. Check popup:
   - Rush events show with distinct styling
   - "Rush score to unblock" row present with +/- controls (1-50 range)
   - Blocking banner shows both unblock paths
4. Blocking logic:
   - With 2+ losses, user is blocked
   - Completing puzzles still unblocks (existing path)
   - Completing a rush with score >= threshold also unblocks (new path)
   - If rush score is below threshold, still blocked (banner shows "Best rush score: X/Y")
5. Blocking modal shows both unblock paths in description text
