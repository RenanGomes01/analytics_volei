import { availableSkills, type NextAction } from "@/domain/rally/next-action";
import { impliedPoint } from "@/domain/rally/implied-point";
import type { Athlete, Quality, Skill } from "@/domain/types";
import { QUALITIES, QUALITY_STYLE, SKILL_LABEL } from "../labels";
import type { Selection } from "../scout-ui-reducer";

interface Props {
  next: NextAction;
  selection: Selection | null;
  athletes: Map<string, Athlete>;
  saving: boolean;
  onSkill: (skill: Skill) => void;
  onQuality: (quality: Quality) => void;
}

export function ActionPad({ next, selection, athletes, saving, onSkill, onQuality }: Props) {
  const team = selection?.team ?? next.primary_team;
  const skills = team ? availableSkills(next, team) : [];
  const athlete = selection && athletes.get(selection.athlete_id);
  const prompt = selection
    ? `${selection.team}${athlete?.jersey_number ?? ""} · ${athlete?.name ?? ""}`
    : next.stage === "awaiting_serve"
      ? "Toque em quem vai sacar"
      : "Toque na atleta do lance";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="truncate text-center text-lg font-semibold">{prompt}</p>

      <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Fundamento">
        {skills.map((skill) => {
          const active = selection?.skill === skill;
          const suggested = team === next.primary_team && next.suggested_skills.includes(skill);
          return (
            <button
              key={skill}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!selection || saving}
              onClick={() => onSkill(skill)}
              className={`min-h-12 rounded-xl border-2 px-3 text-base font-semibold disabled:opacity-40 ${
                active
                  ? "border-amber-300 bg-amber-400 text-zinc-950"
                  : suggested
                    ? "border-zinc-500 bg-zinc-800"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400"
              }`}
            >
              {SKILL_LABEL[skill]}
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-2" aria-label="Qualidade">
        {QUALITIES.map((quality) => {
          const ends = selection && impliedPoint({ ...selection, quality });
          return (
            <button
              key={quality}
              type="button"
              disabled={!selection || saving}
              onClick={() => onQuality(quality)}
              className={`relative flex min-h-16 flex-col items-center justify-center rounded-2xl active:scale-[0.97] disabled:opacity-30 ${QUALITY_STYLE[quality].className}`}
            >
              <span className="text-4xl font-black leading-none">{quality}</span>
              <span className="text-xs font-medium uppercase opacity-80">{QUALITY_STYLE[quality].hint}</span>
              {ends && (
                <span className="absolute right-1.5 top-1.5 rounded bg-black/30 px-1 text-[10px] font-bold uppercase">
                  ponto
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
