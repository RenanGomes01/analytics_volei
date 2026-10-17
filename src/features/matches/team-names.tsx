import { Fragment } from "react";
import { resolveAthlete, type AliasMap } from "@/domain/roster/identity";
import type { AthleteNameOf } from "@/domain/roster/match-search";
import type { Match } from "@/domain/types";
import { HardLink } from "@/components/hard-link";
import { athleteHref } from "@/features/analytics/ui";

interface Props {
  side: Match["team_a"];
  nameOf: AthleteNameOf;
  aliases: AliasMap;
  className?: string;
}

/**
 * Nomes de um lado da partida, cada atleta um link para o perfil (canônico). `relative z-10` deixa o
 * nome por cima do link "cartão inteiro" (stretched link) dos cartões de partida.
 * Atleta fora do cadastro: cai no nome do retrato da partida, sem link.
 */
export function TeamNames({ side, nameOf, aliases, className = "" }: Props) {
  const names = side.athlete_ids.map((id) => ({ id: resolveAthlete(aliases, id), name: nameOf(id) }));
  if (names.length === 0 || names.some((n) => !n.name)) return <span className={`min-w-0 truncate ${className}`}>{side.name}</span>;
  return (
    <span className={`min-w-0 truncate ${className}`} title={side.name}>
      {names.map(({ id, name }, i) => (
        <Fragment key={id}>
          {i > 0 && " / "}
          <HardLink
            href={athleteHref(id)}
            className="relative z-10 py-1 underline decoration-zinc-600 underline-offset-4 hover:decoration-amber-400 active:text-amber-300"
          >
            {name}
          </HardLink>
        </Fragment>
      ))}
    </span>
  );
}
