import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy: boolean;
  /** Texto durante a gravação (ex.: "Criando…"). */
  busyLabel?: string;
}

/** Botão de gravar: desabilitado e com spinner enquanto a transação não termina. */
export function SubmitButton({ busy, busyLabel = "Salvando…", children, disabled, className = "", ...rest }: Props) {
  return (
    <button {...rest} disabled={busy || disabled} aria-busy={busy} className={`relative inline-flex items-center justify-center gap-2 ${className}`}>
      {busy && <span aria-hidden className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {busy ? busyLabel : children}
    </button>
  );
}
