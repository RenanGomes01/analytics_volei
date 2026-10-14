-- =====================================================================================
-- Scout Vôlei — Fase 8: espelho na nuvem do IndexedDB (Dexie) para sincronização.
--
-- Como usar: Supabase → SQL Editor → colar este arquivo inteiro → Run. Pode rodar de novo
-- (é idempotente: "if not exists" / "create or replace").
--
-- Princípios:
--  * O aparelho é a fonte da verdade da tela; aqui fica um espelho, alimentado pelo outbox.
--  * Toda linha pertence a um usuário (owner_id = auth.uid()); o RLS isola as contas.
--  * `data` guarda a linha inteira como no Dexie (sem tenant_id). Colunas tipadas são geradas
--    a partir dela, só para consulta. Campo opcional novo no app não exige migração aqui.
--  * server_seq: sequência global, atribuída a cada mudança. O pull lê "server_seq > cursor".
--  * Sem foreign keys de propósito: uma FK violada travaria a fila FIFO do aparelho para sempre.
--  * rally_events é append-only também aqui (trigger recusa UPDATE/DELETE).
-- =====================================================================================

create sequence if not exists public.sync_seq;

-- ---------- tabelas espelho ----------

create table if not exists public.athletes (
  owner_id   uuid        not null default auth.uid(),
  id         text        not null,
  server_seq bigint      not null,
  data       jsonb       not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  name       text generated always as (data->>'name') stored,
  gender     text generated always as (data->>'gender') stored,
  primary key (owner_id, id)
);

create table if not exists public.teams (
  owner_id   uuid        not null default auth.uid(),
  id         text        not null,
  server_seq bigint      not null,
  data       jsonb       not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  name       text generated always as (data->>'name') stored,
  pair_key   text generated always as (data->>'pair_key') stored,
  primary key (owner_id, id)
);

create table if not exists public.tournaments (
  owner_id   uuid        not null default auth.uid(),
  id         text        not null,
  server_seq bigint      not null,
  data       jsonb       not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  name       text generated always as (data->>'name') stored,
  start_date text generated always as (data->>'start_date') stored,
  category   text generated always as (data->>'category') stored,
  primary key (owner_id, id)
);

create table if not exists public.tournament_entries (
  owner_id      uuid        not null default auth.uid(),
  id            text        not null,
  server_seq    bigint      not null,
  data          jsonb       not null,
  deleted_at    timestamptz,
  updated_at    timestamptz not null default now(),
  tournament_id text generated always as (data->>'tournament_id') stored,
  match_id      text generated always as (data->>'match_id') stored,
  phase         text generated always as (data->>'phase') stored,
  primary key (owner_id, id)
);

create table if not exists public.athlete_aliases (
  owner_id     uuid        not null default auth.uid(),
  id           text        not null, -- alias_id
  server_seq   bigint      not null,
  data         jsonb       not null,
  deleted_at   timestamptz,
  updated_at   timestamptz not null default now(),
  canonical_id text generated always as (data->>'canonical_id') stored,
  primary key (owner_id, id)
);

create table if not exists public.matches (
  owner_id   uuid        not null default auth.uid(),
  id         text        not null,
  server_seq bigint      not null,
  data       jsonb       not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  modality   text generated always as (data->>'modality') stored,
  team_a     text generated always as (data->'team_a'->>'name') stored,
  team_b     text generated always as (data->'team_b'->>'name') stored,
  primary key (owner_id, id)
);

create table if not exists public.rally_events (
  owner_id   uuid        not null default auth.uid(),
  id         text        not null,
  server_seq bigint      not null,
  data       jsonb       not null,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  match_id   text generated always as (data->>'match_id') stored,
  kind       text generated always as (data->>'kind') stored,
  set_number int  generated always as ((data->>'set_number')::int) stored,
  local_seq  int  generated always as ((data->>'local_seq')::int) stored,
  primary key (owner_id, id)
);

-- Registro de idempotência: a mesma mutação reenviada devolve o mesmo server_seq.
create table if not exists public.sync_mutations (
  owner_id    uuid        not null default auth.uid(),
  mutation_id text        not null,
  entity      text        not null,
  entity_id   text        not null,
  op          text        not null,
  server_seq  bigint      not null,
  created_at  timestamptz not null default now(),
  primary key (owner_id, mutation_id)
);

create index if not exists athletes_seq           on public.athletes (owner_id, server_seq);
create index if not exists teams_seq              on public.teams (owner_id, server_seq);
create index if not exists tournaments_seq        on public.tournaments (owner_id, server_seq);
create index if not exists tournament_entries_seq on public.tournament_entries (owner_id, server_seq);
create index if not exists tournament_entries_t   on public.tournament_entries (owner_id, tournament_id);
create index if not exists athlete_aliases_seq    on public.athlete_aliases (owner_id, server_seq);
create index if not exists matches_seq            on public.matches (owner_id, server_seq);
create index if not exists rally_events_seq       on public.rally_events (owner_id, server_seq);
create index if not exists rally_events_match     on public.rally_events (owner_id, match_id, local_seq);

-- ---------- ledger imutável ----------

create or replace function public.rally_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'rally_events é append-only: correções entram como novos eventos (void).';
end $$;

drop trigger if exists rally_events_no_update on public.rally_events;
create trigger rally_events_no_update before update or delete on public.rally_events
  for each row execute function public.rally_events_immutable();

-- ---------- RLS: cada conta só enxerga e grava o que é seu ----------

do $$
declare t text;
begin
  foreach t in array array['athletes','teams','tournaments','tournament_entries','athlete_aliases','matches','rally_events','sync_mutations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('drop policy if exists "dono lê" on public.%I', t);
    execute format('drop policy if exists "dono insere" on public.%I', t);
    execute format('drop policy if exists "dono altera" on public.%I', t);
    execute format('create policy "dono lê" on public.%I for select to authenticated using (owner_id = auth.uid())', t);
    execute format('create policy "dono insere" on public.%I for insert to authenticated with check (owner_id = auth.uid())', t);
  end loop;
  -- Só o cadastro editável aceita UPDATE (upsert e lápide). Partidas, lances e o registro de mutações, não.
  foreach t in array array['athletes','teams','tournaments','tournament_entries','athlete_aliases'] loop
    execute format('grant update on public.%I to authenticated', t);
    execute format('create policy "dono altera" on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

revoke all on sequence public.sync_seq from anon, public;
grant usage on sequence public.sync_seq to authenticated;

-- ---------- RPC: envio do outbox ----------

-- Entidade do outbox → tabela (e quais operações ela aceita).
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
  if t in ('matches', 'rally_events') and op <> 'insert' then
    raise exception '% só aceita insert (recebeu %).', entity, op;
  end if;
  return t;
end $$;

/*
  Recebe um lote do outbox: [{mutation_id, entity, entity_id, op, payload}, …] e devolve um
  resultado por mutação, na mesma ordem: acked (com server_seq) ou conflict (com o motivo).
  Contrato igual ao do MockTransport do app:
   - mutation_id já visto      → acked com o mesmo server_seq (reenvio é inofensivo)
   - insert de entidade igual  → acked com o server_seq existente (ex.: partida importada noutro aparelho)
   - insert de entidade diferente → conflict
   - upsert / delete           → server_seq novo (delete = lápide, para o pull propagar)
   - erro de dado numa mutação → conflict com a mensagem; as outras seguem
*/
create or replace function public.push_mutations(batch jsonb)
returns table (mutation_id text, status text, server_seq bigint, reason text)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  m jsonb;
  tbl text;
  v_mid text;
  v_entity text;
  v_eid text;
  v_op text;
  v_data jsonb;
  e_data jsonb;
  e_seq bigint;
  v_seq bigint;
begin
  if uid is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if jsonb_typeof(batch) <> 'array' then
    raise exception 'O lote precisa ser uma lista.';
  end if;
  -- Serializa os envios de uma conta: os server_seq dela são confirmados em ordem, então o
  -- cursor do pull nunca pula uma linha gravada por uma transação mais lenta.
  perform pg_advisory_xact_lock(hashtext(uid::text));

  for m in select value from jsonb_array_elements(batch) loop
    v_mid := m->>'mutation_id';
    v_entity := m->>'entity';
    v_eid := m->>'entity_id';
    v_op := m->>'op';
    v_data := (m->'payload') - 'tenant_id';
    mutation_id := v_mid;
    reason := null;

    select sm.server_seq into e_seq from public.sync_mutations sm where sm.owner_id = uid and sm.mutation_id = v_mid;
    if e_seq is not null then
      status := 'acked';
      server_seq := e_seq;
      return next;
      continue;
    end if;

    begin
      if v_mid is null or v_eid is null or jsonb_typeof(v_data) <> 'object' then
        raise exception 'Mutação incompleta (mutation_id, entity_id e payload são obrigatórios).';
      end if;
      tbl := public.sync_table(v_entity, v_op);
      e_data := null;
      e_seq := null;

      if v_op = 'insert' then
        execute format('select t.data, t.server_seq from public.%I t where t.owner_id = $1 and t.id = $2', tbl)
          into e_data, e_seq using uid, v_eid;
        if e_seq is not null then
          if e_data = v_data then
            v_seq := e_seq;
          else
            raise exception '% % já existe com outro conteúdo.', v_entity, v_eid using errcode = 'P0409';
          end if;
        else
          v_seq := nextval('public.sync_seq');
          execute format('insert into public.%I (owner_id, id, server_seq, data) values ($1, $2, $3, $4)', tbl)
            using uid, v_eid, v_seq, v_data;
        end if;
      else
        v_seq := nextval('public.sync_seq');
        execute format(
          'insert into public.%I as t (owner_id, id, server_seq, data, deleted_at) values ($1, $2, $3, $4, $5)
           on conflict (owner_id, id) do update
             set data = excluded.data, server_seq = excluded.server_seq, deleted_at = excluded.deleted_at, updated_at = now()',
          tbl)
          using uid, v_eid, v_seq, v_data, case when v_op = 'delete' then now() end;
      end if;

      insert into public.sync_mutations (owner_id, mutation_id, entity, entity_id, op, server_seq)
        values (uid, v_mid, v_entity, v_eid, v_op, v_seq);
      status := 'acked';
      server_seq := v_seq;
    exception when others then
      status := 'conflict';
      server_seq := null;
      reason := sqlerrm;
    end;
    return next;
  end loop;
end $$;

-- ---------- RPC: pull (o que mudou desde o cursor) ----------

create or replace function public.pull_changes(p_since bigint, p_limit int default 1000)
returns table (entity text, entity_id text, server_seq bigint, deleted boolean, data jsonb)
language sql stable security invoker set search_path = public as $$
  select c.entity, c.entity_id, c.server_seq, c.deleted, c.data from (
    select 'athlete' as entity, t.id as entity_id, t.server_seq, t.deleted_at is not null as deleted, t.data
      from public.athletes t where t.owner_id = auth.uid() and t.server_seq > p_since
    union all
    select 'team', t.id, t.server_seq, t.deleted_at is not null, t.data
      from public.teams t where t.owner_id = auth.uid() and t.server_seq > p_since
    union all
    select 'tournament', t.id, t.server_seq, t.deleted_at is not null, t.data
      from public.tournaments t where t.owner_id = auth.uid() and t.server_seq > p_since
    union all
    select 'tournament_entry', t.id, t.server_seq, t.deleted_at is not null, t.data
      from public.tournament_entries t where t.owner_id = auth.uid() and t.server_seq > p_since
    union all
    select 'athlete_alias', t.id, t.server_seq, t.deleted_at is not null, t.data
      from public.athlete_aliases t where t.owner_id = auth.uid() and t.server_seq > p_since
    union all
    select 'match', t.id, t.server_seq, t.deleted_at is not null, t.data
      from public.matches t where t.owner_id = auth.uid() and t.server_seq > p_since
    union all
    select 'rally_event', t.id, t.server_seq, t.deleted_at is not null, t.data
      from public.rally_events t where t.owner_id = auth.uid() and t.server_seq > p_since
  ) c
  order by c.server_seq
  limit least(greatest(p_limit, 1), 5000);
$$;

revoke all on function public.push_mutations(jsonb) from anon, public;
revoke all on function public.pull_changes(bigint, int) from anon, public;
revoke all on function public.sync_table(text, text) from anon, public;
grant execute on function public.push_mutations(jsonb) to authenticated;
grant execute on function public.pull_changes(bigint, int) to authenticated;
grant execute on function public.sync_table(text, text) to authenticated;
