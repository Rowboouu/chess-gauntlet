"use client";

import { useEffect, useState } from "react";
import { isMuted, setMuted } from "@/lib/sounds";

/** Small speaker button that toggles (and persists) sound on/off. */
export function SoundToggle() {
  const [muted, setLocal] = useState(false);

  // localStorage is read client-side; sync after mount to avoid hydration drift.
  useEffect(() => {
    setLocal(isMuted());
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setLocal(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      className="rounded-lg border border-panel-border px-3 py-1.5 text-lg transition-colors hover:border-accent/60"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
