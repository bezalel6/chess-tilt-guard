import { ChessEvent } from "../../types";
import { STORAGE_KEY } from "../../constants";
import { getPlatformLogo } from "./logos";
import { renderMiniboard } from "./miniboard";

const HOST_ID = "chess-tilt-guard-overlay";

const RESULT_COLORS: Record<string, { border: string; bg: string }> = {
  win: { border: "#4caf50", bg: "rgba(76, 175, 80, 0.08)" },
  loss: { border: "#f44336", bg: "rgba(244, 67, 54, 0.08)" },
  draw: { border: "#9e9e9e", bg: "rgba(158, 158, 158, 0.08)" },
};

const STYLES = `
  :host {
    all: initial;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    color: #e0e0e0;
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

  .ctg-panel.collapsed {
    max-height: 32px;
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

  .collapsed .ctg-chevron {
    transform: rotate(180deg);
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
    pointer-events: none;
    max-width: 200px;
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

  if (event.details.endReason) {
    parts.push(event.details.endReason);
  }

  if (parts.length === 0) {
    parts.push(event.platform);
  }

  return parts.join(" \u00B7 ");
}

function renderEvent(event: ChessEvent, index: number): string {
  let colors = RESULT_COLORS[event.result] ?? RESULT_COLORS.draw;
  if (event.type === "puzzle_rush") {
    colors = { border: "#ffa726", bg: "rgba(255, 167, 38, 0.08)" };
  }
  const logo = getPlatformLogo(event.platform);

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

  const panel = document.createElement("div");
  panel.className = "ctg-panel";
  shadow.appendChild(panel);

  const header = document.createElement("div");
  header.className = "ctg-header";
  panel.appendChild(header);

  const list = document.createElement("div");
  list.className = "ctg-list";
  panel.appendChild(list);

  // Open event URLs in new tab on click
  list.addEventListener("click", (e) => {
    const eventEl = (e.target as HTMLElement).closest(".ctg-event");
    const url = eventEl?.getAttribute("data-url");
    if (url) window.open(url, "_blank");
  });

  // Tooltip element for hover previews
  const tooltip = document.createElement("div");
  tooltip.className = "ctg-tooltip";
  shadow.appendChild(tooltip);

  function buildTooltipContent(event: ChessEvent): string {
    const parts: string[] = [];
    const extra = event.details.extra;

    // Miniboard if FEN available
    if (event.details.fen) {
      parts.push(renderMiniboard(event.details.fen));
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

  list.addEventListener(
    "mouseenter",
    (e) => {
      const target = e.target as HTMLElement;
      const eventEl = target.closest?.(".ctg-event") as HTMLElement | null;
      if (!eventEl) return;

      const idx = parseInt(eventEl.getAttribute("data-event-idx") ?? "", 10);
      if (isNaN(idx) || !currentEvents[idx]) return;

      const content = buildTooltipContent(currentEvents[idx]);
      if (!content) return;

      tooltip.innerHTML = content;
      tooltip.classList.add("visible");

      // Position to the left of the panel
      const panelRect = panel.getBoundingClientRect();
      const eventRect = eventEl.getBoundingClientRect();
      tooltip.style.right = `${window.innerWidth - panelRect.left + 8}px`;
      tooltip.style.top = `${eventRect.top}px`;
    },
    true
  );

  list.addEventListener(
    "mouseleave",
    (e) => {
      const target = e.target as HTMLElement;
      if (target.closest?.(".ctg-event")) {
        tooltip.classList.remove("visible");
      }
    },
    true
  );

  // Also hide on mouseover between items
  list.addEventListener("mouseover", (e) => {
    const target = e.target as HTMLElement;
    const eventEl = target.closest?.(".ctg-event") as HTMLElement | null;
    if (!eventEl) {
      tooltip.classList.remove("visible");
      return;
    }

    const idx = parseInt(eventEl.getAttribute("data-event-idx") ?? "", 10);
    if (isNaN(idx) || !currentEvents[idx]) {
      tooltip.classList.remove("visible");
      return;
    }

    const content = buildTooltipContent(currentEvents[idx]);
    if (!content) {
      tooltip.classList.remove("visible");
      return;
    }

    tooltip.innerHTML = content;
    tooltip.classList.add("visible");

    const panelRect = panel.getBoundingClientRect();
    const eventRect = eventEl.getBoundingClientRect();
    tooltip.style.right = `${window.innerWidth - panelRect.left + 8}px`;
    tooltip.style.top = `${eventRect.top}px`;
  });

  let collapsed = false;
  let currentEvents: ChessEvent[] = [];

  function renderHeader(): void {
    const count = currentEvents.length;
    header.innerHTML = `
      <div class="ctg-title">
        CTG
        ${count > 0 ? `<span class="ctg-badge">${count}</span>` : ""}
      </div>
      <div class="ctg-controls">
        <button class="ctg-btn ctg-clear-btn">Clear</button>
        <span class="ctg-chevron">${collapsed ? "\u25B2" : "\u25BC"}</span>
      </div>
    `;

    header.querySelector(".ctg-clear-btn")!.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.storage.local.remove(STORAGE_KEY);
    });
  }

  function render(events: ChessEvent[]): void {
    currentEvents = events;
    renderHeader();
    list.innerHTML = renderList(events);
  }

  // Toggle panel collapse
  header.addEventListener("click", () => {
    collapsed = !collapsed;
    panel.classList.toggle("collapsed", collapsed);
    renderHeader();
  });

  // Load initial events
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    render(data[STORAGE_KEY] ?? []);
  });

  // Live updates for events
  chrome.storage.onChanged.addListener((changes) => {
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
