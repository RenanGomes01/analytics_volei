import { availableSkills, type NextAction } from "@/domain/rally/next-action";
import { impliedPoint } from "@/domain/rally/implied-point";
import type { Athlete, Modality, PointDetail, Quality, Skill } from "@/domain/types";
import { QUALITIES, QUALITY_STYLE, SKILL_LABEL, SKILL_PROMPT, SPECIAL_SKILLS } from "../labels";
import { qualityOptions, type QualityOption } from "../quality-hints";
import type { Selection } from "../scout-ui-reducer";

interface Props {
  modality: Modality;
  next: NextAction;
  selection: Selection | null;
  athletes: Map<string, Athlete>;
  saving: boolean;
  onSkill: (skill: Skill) => void;
  onQuality: (quality: Quality, detail?: PointDetail) => void;
}

/** Grade das qualidades conforme a quantidade de botões: 7 → 4×2, 6 → 3×2, 4 → 2×2, 1 → um botão grande. */
function gridFor(count: number): string {
  if (count === 1) return "grid-cols-1 grid-rows-1";
  if (count <= 4) return "grid-cols-2 grid-rows-2";
  if (count <= 6) return "grid-cols-3 grid-rows-2";
  return "grid-cols-4 grid-rows-2";
}

interface SkillChipProps {
  skill: Skill;
  active: boolean;
  suggested: boolean;
  disabled: boolean;
  onClick: () => void;
}

function SkillChip({ skill, active, suggested, disabled, onClick }: SkillChipProps) {
  const fault = skill === "fault";
  const tone = active
    ? fault
      ? "border-red-400 bg-red-600 text-white"
      : "border-amber-300 bg-amber-400 text-zinc-950"
    : fault
      ? "border-red-700 bg-zinc-900 text-red-300"
      : suggested
        ? "border-zinc-500 bg-zinc-800"
        : "border-zinc-800 bg-zinc-900 text-zinc-400";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 rounded-xl border-2 px-3 text-base font-semibold disabled:opacity-40 ${tone}`}
    >
      {SKILL_LABEL[skill]}
    </button>
  );
}

export function ActionPad({ modality, next, selection, athletes, saving, onSkill, onQuality }: Props) {
  const team = selection?.team ?? next.primary_team;
  const skills = team ? availableSkills(next, team) : [];
  const gameSkills = skills.filter((s) => !SPECIAL_SKILLS.includes(s));
  const specialSkills = skills.filter((s) => SPECIAL_SKILLS.includes(s));

  const athlete = selection && athletes.get(selection.athlete_id);
  const expected = next.suggested_skills[0];
  const prompt = selection
    ? `${selection.team}${athlete?.jersey_number ?? ""} · ${athlete?.name ?? ""}`
    : expected
      ? SKILL_PROMPT[expected]
      : "Toque na atleta do lance";

  // Sem atleta selecionada: a escala completa, desabilitada, com os nomes genéricos.
  const options: QualityOption[] = selection
    ? qualityOptions(modality, selection.skill)
    : QUALITIES.map((quality) => ({ quality, hint: QUALITY_STYLE[quality].hint }));

  const chip = (skill: Skill) => (
    <SkillChip
      key={skill}
      skill={skill}
      active={selection?.skill === skill}
      suggested={team === next.primary_team && next.suggested_skills.includes(skill)}
      disabled={!selection || saving}
      onClick={() => onSkill(skill)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="truncate text-center text-lg font-semibold">{prompt}</p>

      <div className="flex flex-wrap items-center justify-center gap-2" role="radiogroup" aria-label="Fundamento">
        {gameSkills.map(chip)}
        {specialSkills.length > 0 && (
          <>
            <span aria-hidden className="mx-1 h-8 w-px bg-zinc-700" />
            {specialSkills.map(chip)}
          </>
        )}
      </div>

      <div className={`grid min-h-0 flex-1 gap-2 ${gridFor(options.length)}`} aria-label="Qualidade">
        {options.map(({ quality, hint, detail }) => {
          const ends = selection && impliedPoint({ ...selection, quality });
          return (
            <button
              key={`${quality}:${detail ?? ""}`}
              type="button"
              disabled={!selection || saving}
              onClick={() => onQuality(quality, detail)}
              className={`relative flex min-h-16 flex-col items-center justify-center rounded-2xl active:scale-[0.97] disabled:opacity-30 ${QUALITY_STYLE[quality].className}`}
            >
              <span className="text-4xl font-black leading-none">{quality}</span>
              <span className="px-1 text-center text-xs font-medium leading-tight opacity-90">{hint}</span>
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
