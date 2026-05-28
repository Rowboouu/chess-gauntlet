interface TitleProps {
  size?: "lg" | "sm";
}

/**
 * "Rowboouu's" small on top, "Chess Gauntlet" large beneath — the signature
 * lockup used on the home screen and (small) in the app header.
 */
export function Title({ size = "lg" }: TitleProps) {
  const ownerClass =
    size === "lg" ? "text-lg sm:text-xl" : "text-xs";
  const mainClass =
    size === "lg"
      ? "text-5xl sm:text-7xl"
      : "text-xl";

  return (
    <div className="flex flex-col items-center leading-none">
      <span
        className={`font-display font-semibold uppercase tracking-[0.35em] text-accent ${ownerClass}`}
      >
        Rowboouu&rsquo;s
      </span>
      <span
        className={`font-display font-black tracking-tight text-foreground ${mainClass}`}
        style={{ textShadow: "0 2px 24px rgba(217,164,65,0.25)" }}
      >
        Chess Gauntlet
      </span>
    </div>
  );
}
