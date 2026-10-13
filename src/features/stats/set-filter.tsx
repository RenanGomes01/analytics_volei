import type { StatsFilter } from "@/domain/stats/types";

interface Props {
  sets: number[];
  value: StatsFilter;
  onChange: (filter: StatsFilter) => void;
}

export function SetFilter({ sets, value, onChange }: Props) {
  const options: { label: string; filter: StatsFilter }[] = [
    { label: "Jogo", filter: { set: "all" } },
    ...sets.map((set) => ({ label: `Set ${set}`, filter: { set } })),
  ];

  return (
    <div role="radiogroup" aria-label="Filtrar por set" className="flex gap-1 rounded-2xl bg-zinc-900 p-1">
      {options.map(({ label, filter }) => {
        const active = filter.set === value.set;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(filter)}
            className={`min-h-12 min-w-16 rounded-xl px-4 font-semibold ${
              active ? "bg-amber-400 text-zinc-950" : "text-zinc-300"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
