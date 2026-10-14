import type { ReactNode } from "react";
import { HardLink } from "@/components/hard-link";

type Action = { label: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

interface Props {
  icon?: string;
  title: string;
  children?: ReactNode;
  primary?: Action;
  secondary?: Action;
}

const base = "min-h-14 content-center rounded-2xl px-5 text-center text-lg";

function ActionButton({ action, primary }: { action: Action; primary: boolean }) {
  const className = `${base} ${primary ? "bg-amber-400 font-bold text-zinc-950" : "bg-zinc-800 font-semibold"}`;
  return action.href ? (
    <HardLink href={action.href} className={className}>
      {action.label}
    </HardLink>
  ) : (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

/** Lista vazia nunca é rua sem saída: diz o que falta e oferece o próximo passo. */
export function EmptyState({ icon = "🏐", title, children, primary, secondary }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-800 px-4 py-8 text-center">
      <span aria-hidden className="text-4xl">
        {icon}
      </span>
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="max-w-md text-zinc-400">{children}</div>}
      {(primary || secondary) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {primary && <ActionButton action={primary} primary />}
          {secondary && <ActionButton action={secondary} primary={false} />}
        </div>
      )}
    </div>
  );
}
