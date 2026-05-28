import { formatClock } from "@/lib/timeControls";

interface ClockProps {
  label: string;
  ms: number;
  active: boolean;
  /** Show ∞ instead of the time when untimed (initialMs === 0). */
  untimed?: boolean;
}

/** A single player's clock — highlighted when their clock is running. */
export function Clock({ label, ms, active, untimed }: ClockProps) {
  const low = !untimed && ms < 30_000;
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
        active
          ? "border-accent bg-accent/15"
          : "border-panel-border bg-panel/40"
      }`}
    >
      <span className="text-sm text-muted">{label}</span>
      <span
        className={`font-mono text-xl font-semibold tabular-nums ${
          untimed ? "text-muted" : low ? "text-red-400" : "text-foreground"
        }`}
      >
        {untimed ? "∞" : formatClock(ms)}
      </span>
    </div>
  );
}
