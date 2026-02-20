import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChessEvent, Platform } from "./types";
import { STORAGE_KEY, OVERLAY_VISIBLE_KEY } from "./constants";
import {
  BlockingState,
  computeBlockingState,
} from "./content/shared/blocking-logic";
import { CHESS_COM_LOGO, LICHESS_LOGO } from "./content/shared/logos";

const RESULT_COLORS: Record<string, { border: string; bg: string }> = {
  win: { border: "#4caf50", bg: "rgba(76, 175, 80, 0.08)" },
  loss: { border: "#f44336", bg: "rgba(244, 67, 54, 0.08)" },
  draw: { border: "#9e9e9e", bg: "rgba(158, 158, 158, 0.08)" },
};

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

  const progress =
    state.puzzleWinsAfterStreak > 0
      ? `${state.puzzleWinsAfterStreak}/2 puzzles solved`
      : "Solve 2 puzzles in a row to unlock";

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
          {state.consecutiveLosses} losses in a row &middot; {progress}
        </div>
      </div>
    </div>
  );
};

const EventCard: React.FC<{ event: ChessEvent }> = ({ event }) => {
  const colors = RESULT_COLORS[event.result] ?? RESULT_COLORS.draw;

  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid #2d2d44",
        borderLeft: `3px solid ${colors.border}`,
        background: colors.bg,
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
  });
  const [overlayVisible, setOverlayVisible] = useState(true);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY, OVERLAY_VISIBLE_KEY], (data) => {
      const stored = data[STORAGE_KEY] ?? [];
      setEvents(stored);
      setBlockingState(computeBlockingState(stored));
      setOverlayVisible(data[OVERLAY_VISIBLE_KEY] !== false);
    });

    const listener = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes[STORAGE_KEY]) {
        const updated = changes[STORAGE_KEY].newValue ?? [];
        setEvents(updated);
        setBlockingState(computeBlockingState(updated));
      }
      if (changes[OVERLAY_VISIBLE_KEY]) {
        setOverlayVisible(changes[OVERLAY_VISIBLE_KEY].newValue !== false);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const clearHistory = () => {
    chrome.storage.local.remove(STORAGE_KEY);
    setEvents([]);
    setBlockingState(computeBlockingState([]));
  };

  const toggleOverlay = () => {
    const next = !overlayVisible;
    chrome.storage.local.set({ [OVERLAY_VISIBLE_KEY]: next });
    setOverlayVisible(next);
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
          <button
            onClick={toggleOverlay}
            title={overlayVisible ? "Hide overlay" : "Show overlay"}
            style={{
              ...btnStyle,
              color: overlayVisible ? "#4caf50" : "#666",
              borderColor: overlayVisible
                ? "rgba(76, 175, 80, 0.4)"
                : "rgba(255,255,255,0.2)",
            }}
          >
            Overlay {overlayVisible ? "On" : "Off"}
          </button>
          <button onClick={clearHistory} style={btnStyle}>
            Clear
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
          events.map((event) => <EventCard key={event.id} event={event} />)
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
