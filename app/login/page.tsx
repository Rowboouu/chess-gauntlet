"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Title } from "@/components/Title";

type Mode = "signin" | "signup";

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in statically-rendered pages.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "signup" && password !== passwordConfirm) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signup") {
        // Send email-confirmation links back to whatever URL the app is being
        // served on (production domain, ngrok, etc.) — not localhost.
        const emailRedirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.trim() },
            emailRedirectTo,
          },
        });
        if (error) throw error;
        // If email confirmation is disabled, a session exists immediately.
        if (data.session) {
          router.push(nextPath);
          router.refresh();
        } else {
          setNotice(
            "Account created — check your email to confirm, then sign in.",
          );
          setMode("signin");
          setPasswordConfirm("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(nextPath);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <Title />
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-panel-border bg-panel p-6 shadow-xl"
      >
        <div className="mb-5 flex rounded-lg border border-panel-border p-1 text-sm">
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={`flex-1 rounded-md py-2 font-medium transition-colors ${
                mode === m
                  ? "bg-accent/20 text-accent-strong"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {m === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {mode === "signup" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-muted">Username</span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              className="w-full rounded-lg border border-panel-border bg-background px-3 py-2 outline-none focus:border-accent"
              placeholder="grandmaster99"
            />
          </label>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-panel-border bg-background px-3 py-2 outline-none focus:border-accent"
            placeholder="you@example.com"
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">Password</span>
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-panel-border bg-background px-3 py-2 outline-none focus:border-accent"
            placeholder="••••••••"
          />
          {mode === "signup" && (
            <span className="mt-1 block text-xs text-muted">
              At least 6 characters. Passwords are case-sensitive.
            </span>
          )}
        </label>

        {mode === "signup" && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs text-muted">
              Confirm password
            </span>
            <input
              required
              type="password"
              minLength={6}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="w-full rounded-lg border border-panel-border bg-background px-3 py-2 outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </label>
        )}

        {error && (
          <p className="mb-3 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg border border-accent/50 bg-accent/15 py-2.5 font-display font-semibold tracking-wide text-accent-strong transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {loading
            ? "Please wait…"
            : mode === "signin"
              ? "Enter the Gauntlet"
              : "Create Account"}
        </button>
      </form>
    </main>
  );
}
