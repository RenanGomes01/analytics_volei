-- =====================================================================================
-- Scout Vôlei — Fase 10: partidas editáveis e excluíveis (lixeira) na nuvem.
--
-- Como usar: Supabase → SQL Editor → colar este arquivo inteiro → Run. Idempotente.
-- Rode DEPOIS do 0001 (e de novo se um dia rodar o 0001 outra vez: ele recria as policies).
--
-- O que muda:
--  * `matches` passa a aceitar upsert (trocar a dupla antes do scout, restaurar da lixeira) e
--    delete (lápide: deleted_at preenchido, a linha fica). O pull leva isso aos outros aparelhos.
--  * `rally_events` continua só com insert e com o trigger append-only: os lances de uma partida
--    excluída ficam guardados (só deixam de aparecer, porque a partida está na lixeira).
-- =====================================================================================

create or replace function public.sync_table(entity text, op text) returns text
language plpgsql immutable as $$
declare t text;
begin
  t := case entity
    when 'athlete' then 'athletes'
    when 'team' then 'teams'
    when 'tournament' then 'tournaments'
    when 'tournament_entry' then 'tournament_entries'
    when 'athlete_alias' then 'athlete_aliases'
    when 'match' then 'matches'
    when 'rally_event' then 'rally_events'
  end;
  if t is null then raise exception 'Entidade desconhecida: %', entity; end if;
  if op not in ('insert', 'upsert', 'delete') then raise exception 'Operação desconhecida: %', op; end if;
  if t = 'rally_events' and op <> 'insert' then
    raise exception '% só aceita insert (recebeu %).', entity, op;
  end if;
  return t;
end $$;

revoke all on function public.sync_table(text, text) from anon, public;
grant execute on function public.sync_table(text, text) to authenticated;

-- UPDATE em partidas só pelo dono (upsert/lápide feitos pelo push_mutations, que roda como invoker).
grant update on public.matches to authenticated;
drop policy if exists "dono altera" on public.matches;
create policy "dono altera" on public.matches for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
