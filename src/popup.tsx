import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChessEvent, Platform, UserSettings } from "./types";
import {
  STORAGE_KEY,
  SETTINGS_KEY,
  BOARD_SIZE_KEY,
  DEFAULT_BOARD_SIZE,
  DEFAULT_LOSS_STREAK_THRESHOLD,
  DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
  DEFAULT_PUZZLE_RUSH_MIN_SCORE,
} from "./constants";
import {
  BlockingState,
  computeBlockingState,
} from "./content/shared/blocking-logic";
import { CHESS_COM_LOGO, LICHESS_LOGO } from "./content/shared/logos";
import { renderMiniboard } from "./content/shared/miniboard";

const RESULT_COLORS: Record<string, { border: string; bg: string }> = {
  win: { border: "#4caf50", bg: "rgba(76, 175, 80, 0.08)" },
  loss: { border: "#f44336", bg: "rgba(244, 67, 54, 0.08)" },
  draw: { border: "#9e9e9e", bg: "rgba(158, 158, 158, 0.08)" },
};

/** 2x2 chessboard SVG icon for the board button. */
const BOARD_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="7" height="7" fill="#ccc"/><rect x="7" y="0" width="7" height="7" fill="#666"/><rect x="0" y="7" width="7" height="7" fill="#666"/><rect x="7" y="7" width="7" height="7" fill="#ccc"/></svg>`;

function getRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

function formatTimeControl(timeControl: string): string | null {
  const parts = timeControl.split("+");
  const baseSeconds = parseInt(parts[0], 10);
  if (isNaN(baseSeconds)) return null;
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

function getPlatformSvg(platform: Platform): string {
  return platform === "chess.com" ? CHESS_COM_LOGO : LICHESS_LOGO;
}

const BlockingBanner: React.FC<{ state: BlockingState }> = ({ state }) => {
  if (!state.blocked) return null;

  const puzzleProgress =
    state.puzzleWinsAfterStreak > 0
      ? `${state.puzzleWinsAfterStreak}/${state.puzzleWinsRequired} puzzles solved`
      : `Solve ${state.puzzleWinsRequired} puzzles in a row`;

  const rushProgress =
    state.rushScoreAfterStreak > 0
      ? `Best rush: ${state.rushScoreAfterStreak}/${state.rushScoreRequired}`
      : `or score ${state.rushScoreRequired}+ in Puzzle Rush`;

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(244, 67, 54, 0.15)",
        borderBottom: "1px solid rgba(244, 67, 54, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
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

function buildTooltipMeta(event: ChessEvent): string[] {
  const lines: string[] = [];
  const extra = event.details.extra;

  if (event.type === "game") {
    if (extra?.opponentUsername) {
      const oppRating = extra.opponentRating
        ? ` (${extra.opponentRating})`
        : "";
      lines.push(`vs ${extra.opponentUsername}${oppRating}`);
    }
    if (extra?.playerRating) {
      lines.push(`Rating: ${extra.playerRating}`);
    }
    if (extra?.timeClass) {
      const tc = extra.timeControl
        ? formatTimeControl(String(extra.timeControl))
        : null;
      const label =
        String(extra.timeClass).charAt(0).toUpperCase() +
        String(extra.timeClass).slice(1);
      lines.push(tc ? `${label} ${tc}` : label);
    }
    if (event.details.endReason) {
      lines.push(event.details.endReason);
    }
  } else if (event.type === "puzzle_rush") {
    const score = (extra?.score as number) ?? 0;
    lines.push(`Score: ${score}`);
    lines.push(event.platform);
  } else {
    if (event.details.puzzleId) {
      lines.push(`Puzzle #${event.details.puzzleId}`);
    }
    lines.push(event.platform);
  }

  return lines;
}

const BoardTooltip: React.FC<{
  event: ChessEvent;
  anchorRect: DOMRect;
  boardSize: number;
}> = ({ event, anchorRect, boardSize }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number } | null>(null);

  const hasFen = !!event.details.fen;
  const metaLines = buildTooltipMeta(event);
  const hasContent = hasFen || metaLines.length > 0;

  // Measure tooltip after render and clamp to viewport
  useEffect(() => {
    if (!tooltipRef.current || !hasContent) {
      setPos(null);
      return;
    }
    const tooltipH = tooltipRef.current.offsetHeight;
    const viewportH = window.innerHeight;
    const cardCenter = anchorRect.top + anchorRect.height / 2;
    let top = cardCenter - tooltipH / 2;
    top = Math.max(4, Math.min(top, viewportH - tooltipH - 4));
    setPos({ top });
  }, [anchorRect, hasContent]);

  if (!hasContent) return null;

  const miniboardHtml = hasFen ? renderMiniboard(event.details.fen!, boardSize) : "";

  return (
    <div
      ref={tooltipRef}
      style={{
        position: "fixed",
        left: 8,
        top: pos ? pos.top : -9999,
        visibility: pos ? "visible" : "hidden",
        background: "#1e1e36",
        border: "1px solid #3d3d5c",
        borderRadius: 6,
        boxShadow: "0 6px 24px rgba(0, 0, 0, 0.6)",
        padding: 8,
        zIndex: 999999,
        maxWidth: 220,
      }}
    >
      {miniboardHtml && (
        <div dangerouslySetInnerHTML={{ __html: miniboardHtml }} />
      )}
      {metaLines.length > 0 && (
        <div
          style={{
            fontSize: 10,
            color: "#bbb",
            marginTop: hasFen ? 6 : 0,
            lineHeight: 1.5,
          }}
        >
          {metaLines.map((line, i) => (
            <div
              key={i}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EventCard: React.FC<{
  event: ChessEvent;
  isExpanded: boolean;
  onToggleBoard: (event: ChessEvent, rect: DOMRect) => void;
}> = ({ event, isExpanded, onToggleBoard }) => {
  let colors = RESULT_COLORS[event.result] ?? RESULT_COLORS.draw;
  if (event.type === "puzzle_rush") {
    colors = { border: "#ffa726", bg: "rgba(255, 167, 38, 0.08)" };
  }
  const cardRef = useRef<HTMLDivElement>(null);
  const hasFen = !!event.details.fen;

  const handleClick = () => {
    if (event.url) {
      chrome.tabs.create({ url: event.url });
    }
  };

  const handleBoardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) onToggleBoard(event, rect);
  };

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid #2d2d44",
        borderLeft: `3px solid ${colors.border}`,
        background: colors.bg,
        cursor: event.url ? "pointer" : "default",
        transition: "filter 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.filter = "brightness(1.25)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.filter = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{ flexShrink: 0, display: "flex", alignItems: "center" }}
          dangerouslySetInnerHTML={{ __html: getPlatformSvg(event.platform) }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "#e0e0e0" }}>
            {buildHeadline(event)}
          </div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>
            {buildMetaLine(event)}
          </div>
        </div>
        {hasFen && (
          <button
            onClick={handleBoardClick}
            title="Show board"
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1px solid ${isExpanded ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 3,
              cursor: "pointer",
              background: isExpanded ? "rgba(255,255,255,0.06)" : "none",
              padding: 0,
              transition: "border-color 0.15s, background 0.15s",
            }}
            dangerouslySetInnerHTML={{ __html: BOARD_ICON_SVG }}
          />
        )}
        <div style={{ fontSize: 10, color: "#666", flexShrink: 0 }}>
          {getRelativeTime(event.timestamp)}
        </div>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "#aaa",
  padding: "3px 8px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
};

const Popup: React.FC = () => {
  const [events, setEvents] = useState<ChessEvent[]>([]);
  const [blockingState, setBlockingState] = useState<BlockingState>({
    blocked: false,
    consecutiveLosses: 0,
    puzzleWinsAfterStreak: 0,
    puzzleWinsNeeded: 0,
    puzzleWinsRequired: DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
    rushScoreAfterStreak: 0,
    rushScoreRequired: DEFAULT_PUZZLE_RUSH_MIN_SCORE,
  });
  const [boardSize, setBoardSize] = useState(DEFAULT_BOARD_SIZE);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedAnchorRect, setExpandedAnchorRect] = useState<DOMRect | null>(null);

  const expandedEvent = expandedEventId
    ? events.find((e) => e.id === expandedEventId) ?? null
    : null;

  const handleToggleBoard = (event: ChessEvent, rect: DOMRect) => {
    if (expandedEventId === event.id) {
      setExpandedEventId(null);
      setExpandedAnchorRect(null);
    } else {
      setExpandedEventId(event.id);
      setExpandedAnchorRect(rect);
    }
  };

  useEffect(() => {
    chrome.storage.local.get(
      [STORAGE_KEY, SETTINGS_KEY, BOARD_SIZE_KEY],
      (data) => {
        const stored = data[STORAGE_KEY] ?? [];
        const settings: UserSettings | undefined = data[SETTINGS_KEY];
        const lt = settings?.lossStreakThreshold ?? DEFAULT_LOSS_STREAK_THRESHOLD;
        const pw = settings?.puzzleWinsToUnblock ?? DEFAULT_PUZZLE_WINS_TO_UNBLOCK;
        const rms = settings?.puzzleRushMinScore ?? DEFAULT_PUZZLE_RUSH_MIN_SCORE;
        setEvents(stored);
        setBlockingState(computeBlockingState(stored, lt, pw, rms));
        setBoardSize(data[BOARD_SIZE_KEY] ?? DEFAULT_BOARD_SIZE);
      }
    );

    const listener = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes[STORAGE_KEY] || changes[SETTINGS_KEY]) {
        chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (data) => {
          const evts = data[STORAGE_KEY] ?? [];
          const s: UserSettings | undefined = data[SETTINGS_KEY];
          const lt = s?.lossStreakThreshold ?? DEFAULT_LOSS_STREAK_THRESHOLD;
          const pw = s?.puzzleWinsToUnblock ?? DEFAULT_PUZZLE_WINS_TO_UNBLOCK;
          const rms = s?.puzzleRushMinScore ?? DEFAULT_PUZZLE_RUSH_MIN_SCORE;
          setEvents(evts);
          setBlockingState(computeBlockingState(evts, lt, pw, rms));
        });
      }
      if (changes[BOARD_SIZE_KEY]) {
        setBoardSize(changes[BOARD_SIZE_KEY].newValue ?? DEFAULT_BOARD_SIZE);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const clearHistory = () => {
    chrome.storage.local.remove(STORAGE_KEY);
    setEvents([]);
    setBlockingState(
      computeBlockingState(
        [],
        DEFAULT_LOSS_STREAK_THRESHOLD,
        DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
        DEFAULT_PUZZLE_RUSH_MIN_SCORE
      )
    );
  };

  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div
      style={{
        width: 360,
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        background: "#1a1a2e",
        color: "#e0e0e0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 12px",
          borderBottom: "1px solid #2d2d44",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>
          Chess Tilt Guard
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={clearHistory} style={btnStyle}>
            Clear
          </button>
          <button
            onClick={openSettings}
            title="Settings"
            style={{
              ...btnStyle,
              padding: "2px 6px",
              fontSize: 13,
            }}
          >
            &#9881;
          </button>
        </div>
      </div>

      <BlockingBanner state={blockingState} />

      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {events.length === 0 ? (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              color: "#666",
              fontSize: 12,
            }}
          >
            No events yet. Play a game or solve a puzzle.
          </div>
        ) : (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isExpanded={expandedEventId === event.id}
              onToggleBoard={handleToggleBoard}
            />
          ))
        )}
      </div>
      {/* Backdrop to dismiss tooltip */}
      {expandedEvent && expandedAnchorRect && (
        <div
          onClick={() => {
            setExpandedEventId(null);
            setExpandedAnchorRect(null);
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999998,
            background: "transparent",
          }}
        />
      )}
      {expandedEvent && expandedAnchorRect && (
        <BoardTooltip event={expandedEvent} anchorRect={expandedAnchorRect} boardSize={boardSize} />
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
