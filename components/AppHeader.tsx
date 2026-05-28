import Link from "next/link";
import { Title } from "./Title";

/** Compact header with the small lockup, linking home. */
export function AppHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-panel-border px-4 py-3">
      <Link href="/" className="transition-opacity hover:opacity-80">
        <Title size="sm" />
      </Link>
      {right}
    </header>
  );
}
