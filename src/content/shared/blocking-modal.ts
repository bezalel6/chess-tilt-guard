import { BlockingState } from "./blocking-logic";
import { Platform } from "../../types";

const MODAL_HOST_ID = "chess-tilt-guard-block-modal";

const PUZZLE_URLS: Record<Platform, string> = {
  "chess.com": "https://www.chess.com/puzzles",
  lichess: "https://lichess.org/training",
};

const STYLES = `
  :host {
    all: initial;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .ctg-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: ctg-fade-in 0.2s ease;
  }

  @keyframes ctg-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes ctg-slide-up {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .ctg-modal-card {
    background: #1a1a2e;
    border: 1px solid #2d2d44;
    border-radius: 14px;
    padding: 32px;
    max-width: 380px;
    width: 90%;
    text-align: center;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    position: relative;
    animation: ctg-slide-up 0.25s ease;
  }

  .ctg-modal-close {
    position: absolute;
    top: 12px;
    right: 14px;
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
    transition: color 0.15s;
  }

  .ctg-modal-close:hover {
    color: #aaa;
  }

  .ctg-modal-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .ctg-modal-title {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    margin: 0 0 8px;
  }

  .ctg-modal-streak {
    font-size: 14px;
    color: #f44336;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .ctg-modal-desc {
    font-size: 13px;
    color: #aaa;
    line-height: 1.5;
    margin-bottom: 24px;
  }

  .ctg-modal-desc strong {
    color: #e0e0e0;
  }

  .ctg-modal-puzzle-btn {
    display: inline-block;
    background: #4caf50;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    padding: 10px 28px;
    border-radius: 8px;
    text-decoration: none;
    transition: background 0.15s;
    cursor: pointer;
    border: none;
  }

  .ctg-modal-puzzle-btn:hover {
    background: #43a047;
  }
`;

/**
 * Show a blocking modal that prevents the user from starting a new game.
 * Dismissible via backdrop click, X button, or Escape key.
 */
export function showBlockingModal(
  state: BlockingState,
  platform: Platform
): void {
  // Don't stack modals
  if (document.getElementById(MODAL_HOST_ID)) return;

  const host = document.createElement("div");
  host.id = MODAL_HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = STYLES;
  shadow.appendChild(styleEl);

  const backdrop = document.createElement("div");
  backdrop.className = "ctg-modal-backdrop";
  shadow.appendChild(backdrop);

  const puzzleUrl = PUZZLE_URLS[platform];
  const winsNeeded = state.puzzleWinsNeeded;
  const puzzleProgress =
    state.puzzleWinsAfterStreak > 0
      ? `You've solved ${state.puzzleWinsAfterStreak} so far — <strong>${winsNeeded} more</strong> to go.`
      : `Solve <strong>${winsNeeded} puzzles</strong> in a row to unlock.`;

  const rushInfo = `Or score <strong>${state.rushScoreRequired}+</strong> in Puzzle Rush.`;

  backdrop.innerHTML = `
    <div class="ctg-modal-card">
      <button class="ctg-modal-close" aria-label="Close">&times;</button>
      <div class="ctg-modal-icon">⚠️</div>
      <h2 class="ctg-modal-title">Take a Break</h2>
      <div class="ctg-modal-streak">${state.consecutiveLosses} losses in a row</div>
      <p class="ctg-modal-desc">
        Playing on tilt leads to more losses. Cool down with some puzzles first.
        ${puzzleProgress} ${rushInfo}
      </p>
      <a class="ctg-modal-puzzle-btn" href="${puzzleUrl}">
        Go to Puzzles
      </a>
    </div>
  `;

  function dismiss(): void {
    host.remove();
    document.removeEventListener("keydown", onKeydown);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") dismiss();
  }

  // Backdrop click dismisses
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) dismiss();
  });

  // X button dismisses
  const closeBtn = shadow.querySelector(".ctg-modal-close");
  if (closeBtn) closeBtn.addEventListener("click", dismiss);

  // Escape key dismisses
  document.addEventListener("keydown", onKeydown);
}
