import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  busy,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; busy?: boolean }) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-strong disabled:bg-accent/50",
    secondary:
      "border border-line bg-surface text-fg hover:bg-muted disabled:opacity-50",
    ghost: "text-fg-soft hover:bg-muted hover:text-fg disabled:opacity-50",
  }[variant];
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-soft">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-soft/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        done ? "bg-ok text-white" : "bg-muted text-fg-soft"
      }`}
      aria-label={done ? `Step ${n} done` : `Step ${n}`}
    >
      {done ? "✓" : n}
    </span>
  );
}
