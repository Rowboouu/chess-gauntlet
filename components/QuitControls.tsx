"use client";

import { useState } from "react";

interface QuitControlsProps {
  onSaveQuit: () => void | Promise<void>;
  onDiscardQuit: () => void | Promise<void>;
}

/**
 * In-game quit options. Expands to two explicit choices so leaving is never
 * ambiguous: keep the game (resume later via "Continue") or discard it.
 */
export function QuitControls({ onSaveQuit, onDiscardQuit }: QuitControlsProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"save" | "discard" | null>(null);

  async function run(which: "save" | "discard") {
    setBusy(which);
    try {
      await (which === "save" ? onSaveQuit() : onDiscardQuit());
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-panel-border py-2.5 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground"
      >
        Quit game
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-panel-border bg-panel p-3">
      <p className="px-1 text-xs text-muted">
        Leave this game? You can keep it to resume later, or discard it.
      </p>
      <button
        onClick={() => run("save")}
        disabled={busy !== null}
        className="rounded-lg border border-accent/50 bg-accent/15 py-2 text-sm font-semibold text-accent-strong transition-colors hover:bg-accent/25 disabled:opacity-50"
      >
        {busy === "save" ? "Saving…" : "Save & Quit"}
      </button>
      <button
        onClick={() => run("discard")}
        disabled={busy !== null}
        className="rounded-lg border border-red-900/50 bg-red-950/30 py-2 text-sm font-semibold text-red-300 transition-colors hover:border-red-700 hover:bg-red-900/30 disabled:opacity-50"
      >
        {busy === "discard" ? "Discarding…" : "Quit Without Saving"}
      </button>
      <button
        onClick={() => setOpen(false)}
        disabled={busy !== null}
        className="rounded-lg py-1.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
