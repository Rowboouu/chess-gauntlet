/**
 * Time-control presets for multiplayer games.
 *
 * `initialMs = 0` means **untimed** — the clock simply isn't enforced; we still
 * store columns on the row for schema simplicity, but the server skips all
 * flag-fall logic when initialMs is 0.
 */

export interface TimeControl {
  id: string;
  label: string;
  category: "untimed" | "bullet" | "blitz" | "rapid";
  initialMs: number;
  incrementMs: number;
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: "1+0",   label: "1 min",        category: "bullet", initialMs:  60_000, incrementMs:    0 },
  { id: "3+0",   label: "3 min",        category: "blitz",  initialMs: 180_000, incrementMs:    0 },
  { id: "3+2",   label: "3 | 2",        category: "blitz",  initialMs: 180_000, incrementMs: 2000 },
  { id: "5+0",   label: "5 min",        category: "blitz",  initialMs: 300_000, incrementMs:    0 },
  { id: "5+3",   label: "5 | 3",        category: "blitz",  initialMs: 300_000, incrementMs: 3000 },
  { id: "10+0",  label: "10 min",       category: "rapid",  initialMs: 600_000, incrementMs:    0 },
  { id: "15+10", label: "15 | 10",      category: "rapid",  initialMs: 900_000, incrementMs: 10_000 },
  { id: "0+0",   label: "Unlimited",    category: "untimed", initialMs: 0,      incrementMs:    0 },
];

export const DEFAULT_TIME_CONTROL_ID = "5+0";

export function getTimeControl(id: string): TimeControl | undefined {
  return TIME_CONTROLS.find((t) => t.id === id);
}

/** Format ms as M:SS or H:MM:SS for clock display. */
export function formatClock(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
