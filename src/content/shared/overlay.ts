import { ChessEvent } from "../../types";
import { STORAGE_KEY, BOARD_SIZE_KEY, DEFAULT_BOARD_SIZE } from "../../constants";
import { getPlatformLogo } from "./logos";
import { renderMiniboard } from "./miniboard";
import { computeStreakInfo, StreakInfo } from "./blocking-logic";

const HOST_ID = "chess-tilt-guard-overlay";

const RESULT_COLORS: Record<string, { border: string; bg: string }> = {
  win: { border: "#4caf50", bg: "rgba(76, 175, 80, 0.08)" },
  loss: { border: "#f44336", bg: "rgba(244, 67, 54, 0.08)" },
  draw: { border: "#9e9e9e", bg: "rgba(158, 158, 158, 0.08)" },
};

/** 2x2 chessboard SVG icon for the board button. */
const BOARD_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="7" height="7" fill="#ccc"/><rect x="7" y="0" width="7" height="7" fill="#666"/><rect x="0" y="7" width="7" height="7" fill="#666"/><rect x="7" y="7" width="7" height="7" fill="#ccc"/></svg>`;

const STYLES = `
  :host {
    all: initial;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    color: #e0e0e0;
  }

  .ctg-bubble {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13px;
    color: #fff;
    cursor: pointer;
    z-index: 2147483647;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    transition: transform 0.15s ease;
    user-select: none;
  }

  .ctg-bubble:hover {
    transform: scale(1.12);
  }

  .ctg-panel {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 200px;
    max-height: 420px;
    background: #1a1a2e;
    border: 1px solid #2d2d44;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: max-height 0.25s ease, opacity 0.2s ease;
  }

  .ctg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background: #16162a;
    border-bottom: 1px solid #2d2d44;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
  }

  .ctg-title {
    font-weight: 700;
    font-size: 11px;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .ctg-badge {
    background: #4caf50;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 8px;
    min-width: 14px;
    text-align: center;
  }

  .ctg-controls {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .ctg-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.2);
    color: #aaa;
    padding: 1px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    transition: color 0.15s, border-color 0.15s;
  }

  .ctg-btn:hover {
    color: #fff;
    border-color: rgba(255,255,255,0.4);
  }

  .ctg-chevron {
    font-size: 12px;
    color: #aaa;
    transition: transform 0.25s ease;
  }

  .ctg-list {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .ctg-list::-webkit-scrollbar {
    width: 4px;
  }
  .ctg-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .ctg-list::-webkit-scrollbar-thumb {
    background: #2d2d44;
    border-radius: 2px;
  }

  .ctg-empty {
    padding: 20px 10px;
    text-align: center;
    color: #666;
    font-size: 10px;
  }

  .ctg-event {
    padding: 5px 8px;
    border-bottom: 1px solid #2d2d44;
    border-left: 3px solid transparent;
    cursor: pointer;
    transition: filter 0.15s ease;
  }

  .ctg-event:hover {
    filter: brightness(1.25);
  }

  .ctg-event-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ctg-event-logo {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .ctg-event-logo svg {
    display: block;
  }

  .ctg-event-summary {
    flex: 1;
    min-width: 0;
  }

  .ctg-event-headline {
    font-weight: 600;
    font-size: 11px;
    color: #e0e0e0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctg-event-meta {
    font-size: 9px;
    color: #888;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctg-board-btn {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 3px;
    cursor: pointer;
    background: none;
    padding: 0;
    transition: border-color 0.15s, background 0.15s;
  }

  .ctg-board-btn:hover {
    border-color: rgba(255,255,255,0.4);
    background: rgba(255,255,255,0.06);
  }

  .ctg-event-time {
    font-size: 9px;
    color: #666;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ctg-tooltip {
    position: fixed;
    display: none;
    background: #1e1e36;
    border: 1px solid #3d3d5c;
    border-radius: 6px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
    padding: 8px;
    z-index: 2147483647;
    max-width: 280px;
  }

  .ctg-tooltip.visible {
    display: block;
  }

  .ctg-tooltip-meta {
    font-size: 10px;
    color: #bbb;
    margin-top: 6px;
    line-height: 1.5;
  }

  .ctg-tooltip-meta div {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

function getRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHeadline(event: ChessEvent): string {
  if (event.type === "puzzle_rush") {
    const score = (event.details.extra?.score as number) ?? 0;
    return `Puzzle Rush: ${score}`;
  }

  if (event.type === "puzzle") {
    return event.result === "win" ? "Puzzle Solved" : "Puzzle Failed";
  }

  const resultLabel =
    event.result.charAt(0).toUpperCase() + event.result.slice(1);

  if (event.details.playerColor) {
    const color =
      event.details.playerColor.charAt(0).toUpperCase() +
      event.details.playerColor.slice(1);
    return `${resultLabel} as ${color}`;
  }

  return resultLabel;
}

/**
 * Format time control from seconds-based string to human-readable.
 * e.g. "180" → "3+0", "180+2" → "3+2", "86400" → null (daily).
 */
function formatTimeControl(timeControl: string): string | null {
  const parts = timeControl.split("+");
  const baseSeconds = parseInt(parts[0], 10);
  if (isNaN(baseSeconds)) return null;

  // Skip daily games (base >= 1 day)
  if (baseSeconds >= 86400) return null;

  const baseMinutes = Math.floor(baseSeconds / 60);
  const increment = parts[1] ?? "0";
  return `${baseMinutes}+${increment}`;
}

function buildMetaLine(event: ChessEvent): string {
  const parts: string[] = [];

  const extra = event.details.extra;
  if (extra) {
    const timeClass = extra.timeClass as string | undefined;
    const timeControl = extra.timeControl as string | undefined;

    if (timeClass) {
      const classLabel = timeClass.charAt(0).toUpperCase() + timeClass.slice(1);
      if (timeControl) {
        const formatted = formatTimeControl(timeControl);
        parts.push(formatted ? `${classLabel} ${formatted}` : classLabel);
      } else {
        parts.push(classLabel);
      }
    } else if (timeControl) {
      const formatted = formatTimeControl(timeControl);
      if (formatted) parts.push(formatted);
    }
  }

  if (extra?.playerRating) {
    parts.push(String(extra.playerRating));
  }

  if (event.details.endReason) {
    parts.push(event.details.endReason);
  }

  if (parts.length === 0) {
    parts.push(event.platform);
  }

  return parts.join(" \u00B7 ");
}

/** Returns bubble text and color based on the current win/loss streak. */
function getBubbleDisplay(events: ChessEvent[]): { text: string; color: string } {
  const streak = computeStreakInfo(events);
  if (streak.consecutiveLosses > 0) {
    return { text: `L${streak.consecutiveLosses}`, color: "#f44336" };
  }
  if (streak.consecutiveWins > 0) {
    return { text: `W${streak.consecutiveWins}`, color: "#4caf50" };
  }
  return { text: "0", color: "#555" };
}

function renderEvent(event: ChessEvent, index: number): string {
  let colors = RESULT_COLORS[event.result] ?? RESULT_COLORS.draw;
  if (event.type === "puzzle_rush") {
    colors = { border: "#ffa726", bg: "rgba(255, 167, 38, 0.08)" };
  }
  const logo = getPlatformLogo(event.platform);
  const hasFen = !!event.details.fen;

  const boardBtn = hasFen
    ? `<button class="ctg-board-btn" data-board-idx="${index}" title="Show board">${BOARD_ICON_SVG}</button>`
    : "";

  return `
    <div class="ctg-event" data-url="${escapeHtml(
      event.url
    )}" data-event-idx="${index}" style="border-left-color: ${
    colors.border
  }; background: ${colors.bg};">
      <div class="ctg-event-row">
        <div class="ctg-event-logo">${logo}</div>
        <div class="ctg-event-summary">
          <div class="ctg-event-headline">${escapeHtml(
            buildHeadline(event)
          )}</div>
          <div class="ctg-event-meta">${escapeHtml(buildMetaLine(event))}</div>
        </div>
        ${boardBtn}
        <div class="ctg-event-time" data-time-idx="${index}">${getRelativeTime(
    event.timestamp
  )}</div>
      </div>
    </div>
  `;
}

function renderList(events: ChessEvent[]): string {
  if (events.length === 0) {
    return '<div class="ctg-empty">No events yet.<br>Play a game or solve a puzzle.</div>';
  }
  return events.map((e, i) => renderEvent(e, i)).join("");
}

export function initOverlay(): void {
  // Prevent double-init (SPA navigations)
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = STYLES;
  shadow.appendChild(styleEl);

  // Bubble element (collapsed state)
  const bubble = document.createElement("div");
  bubble.className = "ctg-bubble";
  shadow.appendChild(bubble);

  const panel = document.createElement("div");
  panel.className = "ctg-panel";
  shadow.appendChild(panel);

  const header = document.createElement("div");
  header.className = "ctg-header";
  panel.appendChild(header);

  const list = document.createElement("div");
  list.className = "ctg-list";
  panel.appendChild(list);

  // Tooltip element for board previews
  const tooltip = document.createElement("div");
  tooltip.className = "ctg-tooltip";
  shadow.appendChild(tooltip);

  let collapsed = true;
  let currentEvents: ChessEvent[] = [];
  let activeTooltipIdx: number | null = null;
  let boardSize = DEFAULT_BOARD_SIZE;

  // Start collapsed: bubble visible, panel hidden
  panel.style.display = "none";
  bubble.style.display = "flex";

  function buildTooltipContent(event: ChessEvent): string {
    const parts: string[] = [];
    const extra = event.details.extra;

    // Miniboard if FEN available
    if (event.details.fen) {
      parts.push(renderMiniboard(event.details.fen, boardSize));
    }

    // Metadata
    const metaLines: string[] = [];

    if (event.type === "game") {
      if (extra?.opponentUsername) {
        const oppRating = extra.opponentRating
          ? ` (${extra.opponentRating})`
          : "";
        metaLines.push(
          `vs ${escapeHtml(String(extra.opponentUsername))}${oppRating}`
        );
      }
      if (extra?.playerRating) {
        metaLines.push(`Rating: ${extra.playerRating}`);
      }
      if (extra?.timeClass) {
        const tc = extra.timeControl
          ? formatTimeControl(String(extra.timeControl))
          : null;
        const label =
          String(extra.timeClass).charAt(0).toUpperCase() +
          String(extra.timeClass).slice(1);
        metaLines.push(tc ? `${label} ${tc}` : label);
      }
      if (event.details.endReason) {
        metaLines.push(event.details.endReason);
      }
    } else if (event.type === "puzzle_rush") {
      const score = (extra?.score as number) ?? 0;
      metaLines.push(`Score: ${score}`);
      metaLines.push(event.platform);
    } else {
      // Puzzle
      if (event.details.puzzleId) {
        metaLines.push(`Puzzle #${event.details.puzzleId}`);
      }
      metaLines.push(event.platform);
    }

    if (metaLines.length > 0) {
      parts.push(
        `<div class="ctg-tooltip-meta">${metaLines
          .map((l) => `<div>${escapeHtml(l)}</div>`)
          .join("")}</div>`
      );
    }

    return parts.join("");
  }

  function dismissTooltip(): void {
    tooltip.classList.remove("visible");
    activeTooltipIdx = null;
  }

  function showTooltip(idx: number, _anchorEl: HTMLElement): void {
    const event = currentEvents[idx];
    if (!event) return;

    const content = buildTooltipContent(event);
    if (!content) return;

    tooltip.innerHTML = content;
    tooltip.classList.add("visible");
    activeTooltipIdx = idx;

    // Anchor consistently to the top-left of the panel
    const panelRect = panel.getBoundingClientRect();
    tooltip.style.right = `${window.innerWidth - panelRect.left + 8}px`;
    tooltip.style.top = `${panelRect.top}px`;
  }

  // Unified click handler for the list
  list.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    // Check if the click is on the board button
    const boardBtn = target.closest(".ctg-board-btn") as HTMLElement | null;
    if (boardBtn) {
      e.stopPropagation();
      const idx = parseInt(boardBtn.getAttribute("data-board-idx") ?? "", 10);
      if (isNaN(idx)) return;

      // Toggle: if same tooltip is open, close it
      if (activeTooltipIdx === idx) {
        dismissTooltip();
      } else {
        const eventEl = boardBtn.closest(".ctg-event") as HTMLElement | null;
        if (eventEl) showTooltip(idx, eventEl);
      }
      return;
    }

    // Otherwise, dismiss tooltip and navigate
    dismissTooltip();
    const eventEl = target.closest(".ctg-event") as HTMLElement | null;
    const url = eventEl?.getAttribute("data-url");
    if (url) window.open(url, "_blank");
  });

  // Collapse panel and dismiss tooltip when clicking outside the overlay host
  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(`#${HOST_ID}`)) return;

    if (activeTooltipIdx !== null) {
      dismissTooltip();
    }

    if (!collapsed) {
      collapsed = true;
      panel.style.display = "none";
      bubble.style.display = "flex";
      updateBubble();
    }
  });

  function updateBubble(): void {
    const { text, color } = getBubbleDisplay(currentEvents);
    bubble.textContent = text;
    bubble.style.background = color;
  }

  function renderHeader(): void {
    const { text, color } = getBubbleDisplay(currentEvents);
    header.innerHTML = `
      <div class="ctg-title">
        CTG
        <span class="ctg-badge" style="background:${color}">${text}</span>
      </div>
      <div class="ctg-controls">
        <button class="ctg-btn ctg-clear-btn">Clear</button>
        <span class="ctg-chevron">\u25BC</span>
      </div>
    `;

    header.querySelector(".ctg-clear-btn")!.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.storage.local.remove(STORAGE_KEY);
    });
  }

  function render(events: ChessEvent[]): void {
    currentEvents = events;
    dismissTooltip();

    if (collapsed) {
      updateBubble();
    } else {
      renderHeader();
    }
    list.innerHTML = renderList(events);
  }

  // Header click → collapse to bubble
  header.addEventListener("click", () => {
    collapsed = true;
    panel.style.display = "none";
    bubble.style.display = "flex";
    updateBubble();
  });

  // Bubble click → expand to panel
  bubble.addEventListener("click", () => {
    collapsed = false;
    bubble.style.display = "none";
    panel.style.display = "flex";
    renderHeader();
  });

  // Load initial events and board size
  chrome.storage.local.get([STORAGE_KEY, BOARD_SIZE_KEY], (data) => {
    boardSize = data[BOARD_SIZE_KEY] ?? DEFAULT_BOARD_SIZE;
    render(data[STORAGE_KEY] ?? []);
  });

  // Live updates for events and board size
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[BOARD_SIZE_KEY]) {
      boardSize = changes[BOARD_SIZE_KEY].newValue ?? DEFAULT_BOARD_SIZE;
      dismissTooltip();
    }
    if (changes[STORAGE_KEY]) {
      const newEvents: ChessEvent[] = changes[STORAGE_KEY].newValue ?? [];
      render(newEvents);
    }
  });

  // Periodically refresh relative timestamps
  setInterval(() => {
    if (!collapsed && currentEvents.length > 0) {
      const timeEls = list.querySelectorAll(".ctg-event-time");
      timeEls.forEach((el, i) => {
        if (currentEvents[i]) {
          el.textContent = getRelativeTime(currentEvents[i].timestamp);
        }
      });
    }
  }, 30_000);
}
