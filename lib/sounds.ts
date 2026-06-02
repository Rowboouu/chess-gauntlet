/**
 * Tiny Web Audio synth for chess sounds — no asset files, fully offline.
 *
 * Browser-only. The AudioContext is created lazily on first play; browsers
 * start it suspended until a user gesture, so the very first (engine) move on
 * load may be silent until the player interacts. That's fine.
 */

export type SoundType =
  | "move"
  | "capture"
  | "check"
  | "castle"
  | "promote"
  | "end";

const MUTE_KEY = "chess-gauntlet:muted";

let ctx: AudioContext | null = null;
let muted = false;
// Chrome (and friends) block AudioContext until the user has interacted with
// the page. Creating one beforehand still emits a noisy "AudioContext was not
// allowed to start" warning — even when nothing happens. We gate creation
// behind the first pointer/key/touch event so the warning never appears.
let userInteracted = false;

if (typeof window !== "undefined") {
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
  const onInteract = () => {
    userInteracted = true;
    window.removeEventListener("pointerdown", onInteract);
    window.removeEventListener("keydown", onInteract);
    window.removeEventListener("touchstart", onInteract);
  };
  window.addEventListener("pointerdown", onInteract, { capture: true });
  window.addEventListener("keydown", onInteract, { capture: true });
  window.addEventListener("touchstart", onInteract, { capture: true });
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // Don't even try until the user has interacted — otherwise the browser
  // logs a loud autoplay-policy warning every time a sound is queued.
  if (!userInteracted) return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** One short enveloped tone. */
function blip(
  c: AudioContext,
  freq: number,
  startMs: number,
  durMs: number,
  type: OscillatorType,
  peak = 0.18,
) {
  const t0 = c.currentTime + startMs / 1000;
  const dur = durMs / 1000;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playSound(sound: SoundType) {
  if (muted) return;
  const c = audio();
  if (!c) return;

  switch (sound) {
    case "move":
      blip(c, 320, 0, 70, "triangle");
      break;
    case "capture":
      // Lower, with a quick low knock for a "thud".
      blip(c, 150, 0, 110, "square", 0.16);
      blip(c, 90, 0, 90, "sine", 0.2);
      break;
    case "castle":
      blip(c, 300, 0, 60, "triangle");
      blip(c, 300, 80, 60, "triangle");
      break;
    case "check":
      blip(c, 880, 0, 90, "sine", 0.2);
      blip(c, 1175, 110, 110, "sine", 0.2);
      break;
    case "promote":
      blip(c, 523, 0, 80, "triangle");
      blip(c, 659, 90, 80, "triangle");
      blip(c, 784, 180, 120, "triangle");
      break;
    case "end":
      blip(c, 392, 0, 200, "sine", 0.16);
      blip(c, 523, 0, 220, "sine", 0.16);
      blip(c, 659, 0, 260, "sine", 0.16);
      break;
  }
}
