import { ChessEvent } from '../../types';
import { STORAGE_KEY } from '../../constants';

const HOST_ID = 'chess-tilt-guard-overlay';

const STYLES = `
  :host {
    all: initial;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    color: #e0e0e0;
  }

  .ctg-panel {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 340px;
    max-height: 420px;
    background: #1a1a2e;
    border: 1px solid #2d2d44;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: max-height 0.25s ease, opacity 0.2s ease;
  }

  .ctg-panel.collapsed {
    max-height: 40px;
  }

  .ctg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #16162a;
    border-bottom: 1px solid #2d2d44;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
  }

  .ctg-title {
    font-weight: 700;
    font-size: 13px;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ctg-badge {
    background: #4caf50;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 16px;
    text-align: center;
  }

  .ctg-controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .ctg-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.2);
    color: #aaa;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: color 0.15s, border-color 0.15s;
  }

  .ctg-btn:hover {
    color: #fff;
    border-color: rgba(255,255,255,0.4);
  }

  .ctg-chevron {
    font-size: 14px;
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
    width: 5px;
  }
  .ctg-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .ctg-list::-webkit-scrollbar-thumb {
    background: #2d2d44;
    border-radius: 3px;
  }

  .ctg-empty {
    padding: 28px 16px;
    text-align: center;
    color: #666;
    font-size: 12px;
  }

  .ctg-event {
    padding: 8px 12px;
    border-bottom: 1px solid #2d2d44;
  }

  .ctg-event-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }

  .ctg-event-row:hover {
    opacity: 0.85;
  }

  .ctg-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ctg-dot.win  { background: #4caf50; }
  .ctg-dot.loss { background: #f44336; }
  .ctg-dot.draw { background: #9e9e9e; }

  .ctg-event-summary {
    flex: 1;
    min-width: 0;
  }

  .ctg-event-headline {
    font-weight: 600;
    font-size: 12px;
    color: #e0e0e0;
  }

  .ctg-event-meta {
    font-size: 10px;
    color: #888;
    margin-top: 1px;
  }

  .ctg-event-time {
    font-size: 10px;
    color: #666;
    flex-shrink: 0;
  }

  .ctg-expand-hint {
    font-size: 10px;
    color: #555;
    flex-shrink: 0;
    margin-left: 2px;
    transition: transform 0.2s ease;
  }

  .ctg-expand-hint.open {
    transform: rotate(90deg);
  }

  .ctg-details {
    margin-top: 6px;
    padding: 6px 8px;
    background: rgba(0,0,0,0.25);
    border-radius: 4px;
    font-size: 10px;
    color: #999;
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    line-height: 1.5;
    word-break: break-all;
    display: none;
  }

  .ctg-details.open {
    display: block;
  }

  .ctg-detail-row {
    display: flex;
    gap: 4px;
  }

  .ctg-detail-label {
    color: #6b7280;
    flex-shrink: 0;
  }

  .ctg-detail-value {
    color: #a5b4c4;
  }
`;

function getRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildHeadline(event: ChessEvent): string {
  const resultLabel = event.result.charAt(0).toUpperCase() + event.result.slice(1);
  const typeLabel = event.type === 'game' ? 'Game' : 'Puzzle';

  if (event.type === 'game' && event.details.playerColor) {
    const color = event.details.playerColor.charAt(0).toUpperCase() + event.details.playerColor.slice(1);
    const reason = event.details.endReason ? ` - ${event.details.endReason}` : '';
    return `${resultLabel} as ${color}${reason}`;
  }

  if (event.type === 'puzzle') {
    return `${typeLabel} ${event.result === 'win' ? 'Solved' : 'Failed'}`;
  }

  return `${resultLabel} - ${typeLabel}`;
}

function buildMetaLine(event: ChessEvent): string {
  return `${event.platform} · ${event.type}`;
}

function renderDetailRows(event: ChessEvent): string {
  const d = event.details;
  const rows: Array<[string, string]> = [];

  rows.push(['method', d.detectionMethod]);
  if (d.matchedSelector) rows.push(['selector', d.matchedSelector]);
  if (d.rawResult) rows.push(['raw_result', d.rawResult]);
  if (d.rawPlayingAs !== undefined) rows.push(['playing_as', String(d.rawPlayingAs)]);
  if (d.playerColor) rows.push(['color', d.playerColor]);
  if (d.endReason) rows.push(['end_reason', d.endReason]);
  if (d.puzzleId) rows.push(['puzzle_id', d.puzzleId]);
  rows.push(['url', event.url]);
  rows.push(['event_id', event.id]);

  if (d.extra) {
    for (const [k, v] of Object.entries(d.extra)) {
      rows.push([k, String(v)]);
    }
  }

  return rows
    .map(
      ([label, value]) =>
        `<div class="ctg-detail-row">
          <span class="ctg-detail-label">${label}:</span>
          <span class="ctg-detail-value">${escapeHtml(value)}</span>
        </div>`
    )
    .join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEvent(event: ChessEvent, index: number): string {
  return `
    <div class="ctg-event">
      <div class="ctg-event-row" data-toggle="${index}">
        <div class="ctg-dot ${event.result}"></div>
        <div class="ctg-event-summary">
          <div class="ctg-event-headline">${escapeHtml(buildHeadline(event))}</div>
          <div class="ctg-event-meta">${escapeHtml(buildMetaLine(event))}</div>
        </div>
        <div class="ctg-event-time">${getRelativeTime(event.timestamp)}</div>
        <span class="ctg-expand-hint" data-hint="${index}">&#9656;</span>
      </div>
      <div class="ctg-details" data-details="${index}">${renderDetailRows(event)}</div>
    </div>
  `;
}

function renderList(events: ChessEvent[]): string {
  if (events.length === 0) {
    return '<div class="ctg-empty">No events yet. Play a game or solve a puzzle.</div>';
  }
  return events.map((e, i) => renderEvent(e, i)).join('');
}

export function initOverlay(): void {
  // Prevent double-init (SPA navigations)
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  shadow.appendChild(styleEl);

  // Build panel
  const panel = document.createElement('div');
  panel.className = 'ctg-panel';
  shadow.appendChild(panel);

  const header = document.createElement('div');
  header.className = 'ctg-header';
  panel.appendChild(header);

  const list = document.createElement('div');
  list.className = 'ctg-list';
  panel.appendChild(list);

  let collapsed = false;
  let currentEvents: ChessEvent[] = [];

  function renderHeader(): void {
    const count = currentEvents.length;
    header.innerHTML = `
      <div class="ctg-title">
        CTG
        ${count > 0 ? `<span class="ctg-badge">${count}</span>` : ''}
      </div>
      <div class="ctg-controls">
        <button class="ctg-btn ctg-clear-btn">Clear</button>
        <span class="ctg-chevron">${collapsed ? '▲' : '▼'}</span>
      </div>
    `;

    const clearBtn = header.querySelector('.ctg-clear-btn') as HTMLButtonElement;
    clearBtn.addEventListener('click', (e) => {
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
  header.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    renderHeader();
  });

  // Toggle individual event details (delegated)
  list.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-toggle]');
    if (!row) return;
    const idx = row.dataset.toggle!;
    const details = list.querySelector<HTMLElement>(`[data-details="${idx}"]`);
    const hint = list.querySelector<HTMLElement>(`[data-hint="${idx}"]`);
    if (details) details.classList.toggle('open');
    if (hint) hint.classList.toggle('open');
  });

  // Initial load
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    render(data[STORAGE_KEY] ?? []);
  });

  // Live updates
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      render(changes[STORAGE_KEY].newValue ?? []);
    }
  });

  // Periodically refresh relative timestamps
  setInterval(() => {
    if (!collapsed && currentEvents.length > 0) {
      const timeEls = list.querySelectorAll('.ctg-event-time');
      timeEls.forEach((el, i) => {
        if (currentEvents[i]) {
          el.textContent = getRelativeTime(currentEvents[i].timestamp);
        }
      });
    }
  }, 30_000);
}
