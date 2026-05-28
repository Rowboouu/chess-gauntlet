import Link from "next/link";
import type { ReactNode } from "react";

interface MenuButtonProps {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  sublabel?: string;
  variant?: "default" | "primary" | "danger";
}

const variantClasses: Record<NonNullable<MenuButtonProps["variant"]>, string> = {
  default:
    "border-panel-border bg-panel hover:border-accent/60 hover:bg-panel/70",
  primary:
    "border-accent/50 bg-accent/10 hover:border-accent hover:bg-accent/20",
  danger:
    "border-red-900/50 bg-red-950/30 hover:border-red-700 hover:bg-red-900/30",
};

export function MenuButton({
  href,
  onClick,
  disabled,
  icon,
  label,
  sublabel,
  variant = "default",
}: MenuButtonProps) {
  const className = [
    "group flex w-full items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all",
    "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-panel-border disabled:hover:bg-panel",
    variantClasses[variant],
  ].join(" ");

  const inner = (
    <>
      {icon && (
        <span className="text-2xl text-accent transition-transform group-hover:scale-110">
          {icon}
        </span>
      )}
      <span className="flex flex-col">
        <span className="font-display text-lg font-semibold tracking-wide">
          {label}
        </span>
        {sublabel && (
          <span className="text-sm text-muted">{sublabel}</span>
        )}
      </span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button onClick={onClick} disabled={disabled} className={className}>
      {inner}
    </button>
  );
}
