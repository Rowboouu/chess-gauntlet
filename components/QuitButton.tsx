"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MenuButton } from "./MenuButton";

/**
 * "Quit" on the web maps to signing out and returning to the login screen.
 * Confirms first so a stray click doesn't end the session.
 */
export function QuitButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleQuit() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <MenuButton
      onClick={handleQuit}
      disabled={signingOut}
      variant="danger"
      icon="⏻"
      label={confirming ? "Click again to confirm" : "Quit"}
      sublabel={
        signingOut
          ? "Signing out…"
          : confirming
            ? "You'll be signed out"
            : "Sign out and leave"
      }
    />
  );
}
