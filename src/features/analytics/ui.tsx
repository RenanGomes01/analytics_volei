import type { ReactNode } from "react";
import { HardLink } from "@/components/hard-link";

/** Peças visuais das telas de análise. */
export function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-2xl bg-zinc-900 p-4">
      <header>
        <h3 className="font-bold">{title}</h3>
        {note && <p className="text-xs text-zinc-500">{note}</p>}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return (
    <div className="rounded-2xl bg-zinc-900 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {detail && <p className="text-xs tabular-nums text-zinc-500">{detail}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-zinc-900 p-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold ${value === v ? "bg-amber-400 text-zinc-950" : "text-zinc-300"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export const athleteHref = (id: string) => `/athlete?id=${encodeURIComponent(id)}`;
export const teamHref = (key: string) => `/team?key=${encodeURIComponent(key)}`;

export function EntityLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <HardLink href={href} className="underline decoration-zinc-600 underline-offset-4 hover:decoration-amber-400">
      {children}
    </HardLink>
  );
}

export function BackHome() {
  return (
    <HardLink href="/" className="inline-block min-h-12 rounded-xl bg-zinc-800 px-4 py-3 font-semibold">
      ← Início
    </HardLink>
  );
}
