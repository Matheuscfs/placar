import Link from "next/link";
import type { ReactNode } from "react";

interface Action {
  label: string;
  onClick?: () => void;
  href?: string;
}

/**
 * Vazio e erro dizem o que aconteceu e o que fazer em seguida, sem pedir desculpas nem enrolar.
 * Erro usa `role="alert"` (anunciado na hora); vazio usa `status`.
 */
export function StateMessage({ title, children, action, tone = "empty" }: { title: string; children?: ReactNode; action?: Action; tone?: "empty" | "error" }) {
  const button = "mt-4 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[0.95rem] font-semibold text-bg transition-opacity hover:opacity-85";
  return (
    <div role={tone === "error" ? "alert" : "status"} className="py-14">
      <h2 className="text-xl font-bold">{title}</h2>
      {children ? <p className="mt-2 max-w-[38ch] text-muted">{children}</p> : null}
      {action?.href ? (
        <Link href={action.href} className={button}>
          {action.label}
        </Link>
      ) : action ? (
        <button type="button" onClick={action.onClick} className={button}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
