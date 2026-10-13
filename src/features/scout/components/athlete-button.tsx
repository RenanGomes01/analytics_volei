import type { Athlete } from "@/domain/types";

export type Emphasis = "primary" | "secondary" | "disabled";

interface Props {
  athlete: Athlete | undefined;
  athleteId: string;
  emphasis: Emphasis;
  selected: boolean;
  onPick: () => void;
}

export function AthleteButton({ athlete, athleteId, emphasis, selected, onPick }: Props) {
  const base =
    "flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 px-4 text-left transition-[opacity,background-color] duration-100 active:scale-[0.98]";
  const tone = selected
    ? "border-amber-300 bg-amber-400 text-zinc-950 ring-4 ring-amber-400/40"
    : emphasis === "primary"
      ? "border-amber-400/70 bg-zinc-800 text-zinc-50"
      : "border-zinc-700 bg-zinc-900 text-zinc-300";

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={emphasis === "disabled"}
      aria-pressed={selected}
      className={`${base} ${tone} ${emphasis === "primary" || selected ? "" : "opacity-50"} disabled:opacity-25`}
    >
      <span className="text-3xl font-bold tabular-nums">{athlete?.jersey_number ?? "–"}</span>
      <span className="truncate text-lg font-medium">{athlete?.name ?? athleteId.slice(0, 6)}</span>
    </button>
  );
}
