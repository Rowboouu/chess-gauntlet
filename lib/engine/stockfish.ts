/**
 * Thin wrapper around a Stockfish UCI engine running in a Web Worker.
 *
 * We load the single-threaded WASM build from /public/stockfish so the app
 * needs no cross-origin-isolation headers (SharedArrayBuffer-free) — which
 * keeps Vercel deployment trivial. Difficulty is applied per move via
 * "Skill Level" plus a movetime / depth cap (see lib/bots.ts).
 *
 * This is browser-only — instantiate it from a Client Component / hook.
 */

export interface ThinkOptions {
  skill: number; // 0-20
  movetimeMs: number;
  depth?: number;
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(scriptUrl = "/stockfish/stockfish-18-lite-single.js") {
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    if (typeof window === "undefined") return;

    this.worker = new Worker(scriptUrl);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : e.data?.data ?? "";
      if (line === "uciok") {
        this.send("isready");
      } else if (line === "readyok") {
        this.resolveReady();
      }
    };

    this.send("uci");
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  /** Resolves once the engine has handshaked (uciok → readyok). */
  whenReady() {
    return this.ready;
  }

  /**
   * Ask the engine for its best move from a FEN at the given strength.
   * Resolves with a move in UCI long-algebraic form, e.g. "e2e4" / "e7e8q".
   */
  async bestMove(fen: string, opts: ThinkOptions): Promise<string> {
    await this.ready;
    if (!this.worker) throw new Error("Stockfish worker unavailable");

    const skill = Math.max(0, Math.min(20, Math.round(opts.skill)));
    this.send(`setoption name Skill Level value ${skill}`);
    this.send(`position fen ${fen}`);

    const goCmd = opts.depth
      ? `go depth ${opts.depth} movetime ${opts.movetimeMs}`
      : `go movetime ${opts.movetimeMs}`;

    return new Promise<string>((resolve, reject) => {
      const worker = this.worker!;
      const onMessage = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : e.data?.data ?? "";
        if (typeof line === "string" && line.startsWith("bestmove")) {
          worker.removeEventListener("message", onMessage);
          const move = line.split(" ")[1];
          if (!move || move === "(none)") {
            reject(new Error("Engine returned no move"));
          } else {
            resolve(move);
          }
        }
      };
      worker.addEventListener("message", onMessage);
      this.send(goCmd);
    });
  }

  terminate() {
    this.send("quit");
    this.worker?.terminate();
    this.worker = null;
  }
}
