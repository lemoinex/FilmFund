-- MATCH : veille des opportunités (lot L6a, base et worker).
--
-- Décision de l'utilisateur, le 7 octobre 2026 : les opportunités du
-- catalogue ne se saisissent plus de mémoire, un agent les propose, avec leur
-- source et un résumé. La mécanique est celle de SCOUT, validée en recette le
-- 6 octobre 2026 : un moteur de recherche collecte des pages, le modèle de
-- texte ne lit que leurs extraits. Ici, il n'en rédige pas une synthèse : il
-- relève les opportunités que ces pages annoncent.
--
-- Ce qui distingue la veille de tous les autres livrables : elle n'appartient
-- à aucun projet ni à aucun studio. C'est une tâche de l'administration.
--   - elle ne passe ni par un devis ni par une réservation : elle n'entame le
--     quota d'aucun studio. Elle compte dans la dépense d'IA du mois, et le
--     plafond la refuse comme toute autre ;
--   - seul un administrateur la demande, la lit et en décide. Le worker
--     revérifie que son auteur l'est toujours avant de l'exécuter ;
--   - une veille à la fois, et vingt au plus par administrateur et par
--     vingt-quatre heures.
--
-- Ce que cette migration ouvre :
--   1. des tâches, des coûts et des propositions sans projet ni studio, pour
--      la seule action `opportunity_watch` ;
--   2. la demande de veille (`demander_veille`), journalisée ;
--   3. les opportunités proposées (`ai_suggestion_opportunities`), septième
--      table fille du modèle des propositions structurées ;
--   4. le contexte et le dépôt du worker ; l'acceptation et l'écart, une à
--      une, par l'administration.
--
-- Ce que la base garantit, quoi que dépose le worker :
--   - l'adresse, le titre, l'extrait et la date d'une opportunité proposée
--     viennent de la page collectée qu'elle désigne, jamais du modèle ;
--   - le modèle ne propose ni montant, ni date limite, ni pays, ni critère :
--     un nom, un organisme, une catégorie et un résumé. Le reste se lit sur
--     la page, par l'administrateur ;
--   - une opportunité acceptée entre au catalogue « non vérifiée » : les
--     comptes ne la lisent pas tant qu'un administrateur ne l'a pas vérifiée,
--     page ouverte. Aucun chemin ne la fait naître vérifiée ;
--   - une opportunité déjà au catalogue — même nom, même organisme — n'y
--     entre pas une seconde fois.
--
-- Retour arrière — aucune opportunité acceptée n'est perdue :
--   `drop function` des sept fonctions de la veille ; rétablir
--   `ecarter_lignes_restantes`, `provisionner_recherche` (migration
--   20261006220000_griot_contexte), `reclamer_travail` (migration
--   20261001072243_worker_connexion), `clore_travail` et `annuler_travail`
--   (migration 20261001061231_taches) ; `drop table
--   public.ai_suggestion_opportunities` ; recréer les deux déclencheurs de
--   journal sans leur clause `when`. Les colonnes rendues facultatives ne
--   peuvent redevenir obligatoires que s'il n'existe aucune tâche de veille :
--   une tâche ne se supprime pas, et ses coûts sont en ajout seul.

-- ---------------------------------------------------------------------------
-- Tâches, coûts et propositions sans projet
-- ---------------------------------------------------------------------------

alter table public.jobs
  alter column reservation_id drop not null,
  alter column studio_id drop not null,
  alter column project_id drop not null;

-- Seule la veille est une tâche de la plateforme, et elle l'est toujours :
-- aucune autre action ne peut naître sans réservation, ni elle avec.
alter table public.jobs
  add constraint travail_plateforme check (
    (reservation_id is null and studio_id is null and project_id is null)
      = (action = 'opportunity_watch')
    and (reservation_id is null) = (studio_id is null)
    and (reservation_id is null) = (project_id is null)
  );

create index jobs_veille_idx on public.jobs (created_at) where action = 'opportunity_watch';

-- Les registres des coûts n'ont pas de clé étrangère : la dépense d'une
-- veille s'y inscrit sans studio ni projet, et compte dans le mois.
alter table public.provider_charges
  alter column studio_id drop not null,
  alter column project_id drop not null;

alter table public.provider_search_charges
  alter column studio_id drop not null,
  alter column project_id drop not null;

alter table public.ai_suggestions
  alter column studio_id drop not null,
  alter column project_id drop not null;

alter table public.ai_suggestions
  add constraint proposition_plateforme check (
    (studio_id is null and project_id is null) = (action = 'opportunity_watch')
    and (studio_id is null) = (project_id is null)
  );

-- Le journal des interventions dit qu'un administrateur a agi sur un projet
-- dont il n'est pas membre. Une veille n'a pas de projet : sa demande et ses
-- décisions ont leurs propres entrées au journal.
drop trigger jobs_journal_admin on public.jobs;
create trigger jobs_journal_admin
  before update on public.jobs
  for each row
  when (new.project_id is not null)
  execute function public.journaliser_intervention_admin();

drop trigger ai_suggestions_journal_admin on public.ai_suggestions;
create trigger ai_suggestions_journal_admin
  before update on public.ai_suggestions
  for each row
  when (new.project_id is not null)
  execute function public.journaliser_intervention_admin();

-- Reprise de la migration taches, avec un seul ajout : sans réservation, il
-- n'y a rien à régler.
create or replace function public.clore_travail(
  p_job public.jobs,
  p_state text,
  p_consumed integer,
  p_reason text
)
returns public.jobs
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_quantite integer;
  v_job public.jobs;
begin
  select r.quantity into v_quantite from public.reservations r where r.id = p_job.reservation_id;

  update public.jobs
  set state = p_state,
      lease_until = null,
      reason = p_reason,
      finished_at = now(),
      updated_at = now()
  where id = p_job.id
  returning * into v_job;

  if p_job.reservation_id is not null then
    perform public.regler_reservation(
      p_job.reservation_id,
      coalesce(p_consumed, case when p_state = 'succeeded' then v_quantite else 0 end)
    );
  end if;

  return v_job;
end;
$$;

-- Reprise de la migration worker_connexion, avec un seul ajout : l'auteur
-- d'une veille doit être encore administrateur au moment de l'exécution.
create or replace function public.reclamer_travail(p_worker text, p_actions text[])
returns table (
  job_id uuid,
  attempt_id uuid,
  attempt_number integer,
  action text,
  params jsonb,
  project_id uuid,
  studio_id uuid,
  lease_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_job public.jobs;
  v_essai public.job_attempts;
begin
  if p_worker is null or char_length(p_worker) not between 1 and 100 then
    raise exception 'Identifiant de worker manquant ou trop long.' using errcode = '22023';
  end if;

  if coalesce(cardinality(p_actions), 0) = 0 then
    return;
  end if;

  loop
    select j.* into v_job
    from public.jobs j
    where j.state = 'queued'
      and j.action = any (p_actions)
    order by j.created_at, j.id
    limit 1
    for update skip locked;

    if v_job.id is null then
      return;
    end if;

    if v_job.project_id is null then
      if exists (
        select 1 from public.profiles pr where pr.id = v_job.created_by and pr.role = 'admin'
      ) then
        exit;
      end if;
    elsif public.peut_engager_unites_pour(v_job.created_by, v_job.project_id) then
      exit;
    end if;

    perform public.clore_travail(
      v_job, 'cancelled', 0, 'Droits de l''auteur retirés avant l''exécution.'
    );
  end loop;

  update public.jobs
  set state = 'running',
      attempts = attempts + 1,
      worker = p_worker,
      lease_until = now() + public.duree_bail_travail(),
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  insert into public.job_attempts (job_id, number)
  values (v_job.id, v_job.attempts)
  returning * into v_essai;

  return query
    select v_job.id, v_essai.id, v_essai.number, v_job.action, v_job.params,
           v_job.project_id, v_job.studio_id, v_job.lease_until;
end;
$$;

-- Reprise de la migration taches, avec un seul ajout : une veille en attente
-- s'annule par un administrateur. Sans cela, une veille demandée alors qu'une
-- clé vient d'être retirée bloquerait les suivantes.
create or replace function public.annuler_travail(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
begin
  select j.* into v_job from public.jobs j where j.id = p_job_id for update;

  if v_job.id is null
     or (v_job.project_id is null
         and ((select auth.uid()) is null or not public.is_admin()))
     or (v_job.project_id is not null
         and not public.peut_engager_unites(v_job.project_id)) then
    raise exception 'Tâche introuvable, ou droits insuffisants pour l''annuler.'
      using errcode = '42501';
  end if;

  if v_job.state = 'cancelled' then
    return v_job;
  end if;
  if v_job.state <> 'queued' then
    raise exception 'Seule une tâche en attente s''annule.' using errcode = 'TR002';
  end if;

  return public.clore_travail(v_job, 'cancelled', 0, 'Annulée avant son exécution.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Journal d'administration : la demande de veille
-- ---------------------------------------------------------------------------

alter table public.admin_audit_log
  drop constraint action_connue,
  add constraint action_connue check (
    action in (
      'changement_role',
      'modification_profil',
      'mode_prive',
      'suppression_projet',
      'intervention_contenu',
      'intervention_studio',
      'publication_plan',
      'changement_plan_studio',
      'publication_bareme',
      'rapprochement_travail',
      'plafond_ia',
      'cle_fournisseur',
      'publication_ponderations',
      'opportunite',
      'veille_opportunites'
    )
  );

-- ---------------------------------------------------------------------------
-- Demande de veille
-- ---------------------------------------------------------------------------

-- Veilles qu'un administrateur peut demander par vingt-quatre heures. Seul
-- endroit où cette limite est fixée.
create or replace function public.veilles_par_jour()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select 20;
$$;

revoke all on function public.veilles_par_jour() from public, anon, authenticated;

-- Un administrateur demande une veille : une question, en clair. C'est elle,
-- et elle seule, qui partira chez le moteur de recherche. La tâche naît ici,
-- sans devis ni réservation, et la demande est journalisée dans la même
-- transaction.
create or replace function public.demander_veille(p_question text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_question text := btrim(coalesce(p_question, ''));
  v_job uuid;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Action réservée à l''administration.' using errcode = '42501';
  end if;

  if char_length(v_question) not between 10 and 500 or v_question ~ '[[:cntrl:]]' then
    raise exception 'Décrivez ce que la veille doit chercher : de 10 à 500 caractères, sur une ligne.'
      using errcode = '22023';
  end if;

  -- Sans ses deux clés, l'agent n'est pas en service : la tâche attendrait
  -- sans fin, et bloquerait les suivantes.
  if (select count(*) from public.ai_provider_keys k
      where k.provider in ('anthropic', 'perplexity')) < 2 then
    raise exception 'La veille demande les clés d''Anthropic et de Perplexity : posez-les depuis Intégrations IA.'
      using errcode = '55000';
  end if;

  -- Deux demandes simultanées ne se comptent pas l'une sans l'autre.
  perform pg_advisory_xact_lock(hashtext('filmfund.veille_opportunites'));

  -- Une veille à rapprocher ne bloque pas les suivantes : son issue se
  -- tranche à part, et le bail borne la durée d'une veille en cours.
  if exists (
    select 1 from public.jobs j
    where j.action = 'opportunity_watch' and j.state in ('queued', 'running')
  ) then
    raise exception 'Une veille est déjà en cours : attendez son résultat.' using errcode = 'VE001';
  end if;

  if (
    select count(*) from public.jobs j
    where j.action = 'opportunity_watch'
      and j.created_by = (select auth.uid())
      and j.created_at > now() - interval '24 hours'
  ) >= public.veilles_par_jour() then
    raise exception 'Limite atteinte : % veilles par compte et par vingt-quatre heures.', public.veilles_par_jour()
      using errcode = 'VE002';
  end if;

  insert into public.jobs (action, params, created_by)
  values (
    'opportunity_watch', jsonb_build_object('question', v_question), (select auth.uid())
  )
  returning id into v_job;

  perform public.journaliser(
    'veille_opportunites',
    null,
    jsonb_build_object('operation', 'demande', 'tache', v_job, 'question', v_question)
  );

  return v_job;
end;
$$;

revoke all on function public.demander_veille(text) from public, anon, authenticated;
grant execute on function public.demander_veille(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Opportunités proposées
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_opportunities (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  position integer not null,
  -- Ce que le modèle a relevé dans l'extrait, et rien d'autre.
  name text not null,
  -- Vide : ni le titre ni l'extrait ne nomment l'organisme. Il se saisit
  -- alors à l'acceptation ; le déduire du site serait l'inventer.
  organization text not null default '',
  category text not null,
  summary text not null,
  -- La page collectée : ces quatre colonnes viennent du moteur, jamais du
  -- modèle.
  source_url text not null,
  source_title text not null,
  source_excerpt text not null,
  published_on date,
  collected_at timestamptz not null,
  state text not null default 'proposed',
  -- Opportunité née de l'acceptation. Si l'administration la retire ensuite
  -- du catalogue, la proposition reste acceptée : elle dit ce qui a été décidé.
  opportunity_id uuid references public.funding_opportunities (id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint opportunite_proposee_etat_connu check (
    state in ('proposed', 'accepted', 'dismissed')
  ),
  constraint opportunite_proposee_nom check (
    char_length(btrim(name)) between 1 and 200 and name !~ '[[:cntrl:]]'
  ),
  constraint opportunite_proposee_organisme check (
    char_length(organization) <= 200 and organization !~ '[[:cntrl:]]'
  ),
  constraint opportunite_proposee_categorie check (
    category in (
      'fonds', 'subvention', 'residence', 'festival', 'laboratoire', 'atelier',
      'coproduction', 'bourse', 'forum_pitch'
    )
  ),
  constraint opportunite_proposee_resume check (
    char_length(btrim(summary)) between 1 and 1500
    and regexp_replace(summary, '[\n\r\t]', '', 'g') !~ '[[:cntrl:]]'
    and summary !~* '(https?://|www\.)'
  ),
  constraint opportunite_proposee_adresse check (
    char_length(source_url) <= 2000 and source_url ~ '^https://[^[:space:][:cntrl:]]+$'
  ),
  constraint opportunite_proposee_titre check (
    char_length(btrim(source_title)) between 1 and 300 and source_title !~ '[[:cntrl:]]'
  ),
  constraint opportunite_proposee_extrait check (
    char_length(btrim(source_excerpt)) between 1 and 2000
  ),
  constraint opportunite_proposee_decision check ((state = 'proposed') = (decided_at is null)),
  constraint opportunite_proposee_rang unique (suggestion_id, position)
);

comment on table public.ai_suggestion_opportunities is
  'Opportunité relevée par la veille dans une page collectée : jamais ajoutée d''elle-même, jamais vérifiée par la plateforme. Acceptée ou écartée une à une par l''administration.';

-- Pas deux fois la même dans une proposition, comme au catalogue.
create unique index ai_suggestion_opportunities_unique
  on public.ai_suggestion_opportunities (
    suggestion_id, lower(btrim(name)), lower(btrim(organization))
  );

create index ai_suggestion_opportunities_etat_idx
  on public.ai_suggestion_opportunities (state, created_at desc);

alter table public.ai_suggestion_opportunities enable row level security;

create policy "Les administrateurs lisent les opportunités proposées"
  on public.ai_suggestion_opportunities for select
  to authenticated
  using ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_opportunities
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'administration décide, par
-- fonctions.
revoke all on table public.ai_suggestion_opportunities from anon, authenticated;
grant select on table public.ai_suggestion_opportunities to authenticated;

-- Une opportunité proposée ne change que pour être acceptée ou écartée, une
-- fois ; ce qui a été relevé et collecté ne change jamais.
create or replace function public.controler_opportunite_proposee()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    -- Seule la disparition de la proposition l'emporte.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Une opportunité proposée ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.position, new.name, new.organization, new.category,
      new.summary, new.source_url, new.source_title, new.source_excerpt, new.published_on,
      new.collected_at, new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.position, old.name, old.organization, old.category,
      old.summary, old.source_url, old.source_title, old.source_excerpt, old.published_on,
      old.collected_at, old.created_at) then
    raise exception 'Ce qui a été relevé ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    -- Seul le détachement d'une opportunité retirée du catalogue passe encore.
    if pg_trigger_depth() > 1
       and new.opportunity_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Une opportunité déjà acceptée ou écartée ne change plus.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_opportunite_proposee() from public, anon, authenticated;

create trigger ai_suggestion_opportunities_controle
  before update or delete on public.ai_suggestion_opportunities
  for each row
  execute function public.controler_opportunite_proposee();

create trigger ai_suggestion_opportunities_pas_de_vidage
  before truncate on public.ai_suggestion_opportunities
  for each statement
  execute function public.registre_en_ajout_seul();

-- Reprise de la migration scout_recherche, pour les sept tables filles :
-- écarter la proposition entière, c'est écarter ce qui restait à décider.
create or replace function public.ecarter_lignes_restantes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  update public.ai_suggestion_budget_lines
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';

  update public.ai_suggestion_milestones
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';

  update public.ai_suggestion_shots
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';

  update public.ai_suggestion_gear
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';

  update public.ai_suggestion_images
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';

  update public.ai_suggestion_sources
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';

  update public.ai_suggestion_opportunities
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce que MATCH lit : la question, et rien d'autre. Null si l'essai n'est pas
-- l'essai en cours d'une veille, ou si son auteur n'est plus administrateur.
create or replace function public.contexte_veille(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'opportunity_watch';

  if v_job.id is null
     or not exists (
       select 1 from public.profiles pr where pr.id = v_job.created_by and pr.role = 'admin'
     ) then
    return null;
  end if;

  return jsonb_build_object('question', btrim(v_job.params ->> 'question'));
end;
$$;

revoke all on function public.contexte_veille(uuid) from public, anon, authenticated;
grant execute on function public.contexte_veille(uuid) to filmfund_worker;

-- Reprise de la migration griot_contexte, à l'identique : seule l'action
-- admise change. Ses droits ne changent pas — `create or replace` les garde.
create or replace function public.provisionner_recherche(
  p_attempt_id uuid,
  p_provider text,
  p_profile text,
  p_requests integer,
  p_usd numeric,
  p_reserve_usd numeric
)
returns public.provider_search_charges
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_charge public.provider_search_charges;
  v_essai public.job_attempts;
  v_job public.jobs;
  v_plafond numeric;
begin
  select c.* into v_charge
  from public.provider_search_charges c
  where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is not null then
    return v_charge;
  end if;

  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours : ne rien envoyer.' using errcode = 'TR001';
  end if;

  if p_usd is null or p_usd < 0 or p_reserve_usd is null or p_reserve_usd < 0
     or p_requests is null or p_requests < 1 then
    raise exception 'Provision invalide.' using errcode = '22023';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action not in ('research', 'cultural_context', 'opportunity_watch') then
    raise exception 'Aucune recherche n''est prévue pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select s.monthly_budget_usd into v_plafond from public.ai_settings s for update;

  if public.depense_ia_du_mois() + p_usd + p_reserve_usd > v_plafond then
    raise exception 'Plafond mensuel des dépenses d''IA atteint.' using errcode = 'IA001';
  end if;

  insert into public.provider_search_charges (
    attempt_id, job_id, studio_id, project_id, provider, profile, estimated_requests, estimated_usd
  )
  values (
    p_attempt_id, v_job.id, v_job.studio_id, v_job.project_id, p_provider, p_profile,
    p_requests, p_usd
  )
  returning * into v_charge;

  return v_charge;
end;
$$;

-- Dépôt d'une veille : les pages collectées, et les opportunités que le
-- modèle y a relevées, chacune désignant sa page par son rang. Tout est
-- contrôlé ici, quoi qu'ait déjà vérifié le worker. Aucune opportunité
-- relevée : la tâche a réussi, la proposition se dépose close, et dit
-- pourquoi — relancer l'appel ne trouverait rien de plus dans ces pages.
create or replace function public.livrer_proposition_veille(
  p_attempt_id uuid,
  p_sources jsonb,
  p_opportunities jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_charge public.provider_charges;
  v_collecte public.provider_search_settlements;
  v_proposition uuid;
  v_question text;
  v_pages integer;
  v_nombre integer;
  v_element jsonb;
  v_rang bigint;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'opportunity_watch' then
    raise exception 'Aucune veille n''est prévue pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;
  v_question := btrim(v_job.params ->> 'question');

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  -- Pas d'opportunité sans collecte : la requête de cet essai doit avoir été
  -- servie. Son instant date les extraits.
  select s.* into v_collecte
  from public.provider_search_settlements s
  where s.attempt_id = p_attempt_id and s.requests >= 1;
  if v_collecte.attempt_id is null then
    raise exception 'Aucune collecte confirmée pour cet essai.' using errcode = 'IA002';
  end if;

  if p_sources is null or jsonb_typeof(p_sources) <> 'array' then
    raise exception 'Sources invalides : une liste est attendue.' using errcode = '22023';
  end if;
  v_pages := jsonb_array_length(p_sources);
  if v_pages not between 1 and 20 then
    raise exception 'Sources invalides : de 1 à 20 attendues, % reçues.', v_pages
      using errcode = '22023';
  end if;

  for v_element, v_rang in
    select t.source, t.rang
    from jsonb_array_elements(p_sources) with ordinality as t(source, rang)
  loop
    if jsonb_typeof(v_element) <> 'object'
       or not coalesce(
         jsonb_typeof(v_element -> 'url') = 'string'
         and char_length(v_element ->> 'url') <= 2000
         and (v_element ->> 'url') ~ '^https://[^[:space:][:cntrl:]/?#@]+\.[^[:space:][:cntrl:]/?#@]+([/?#][^[:space:][:cntrl:]]*)?$'
         and jsonb_typeof(v_element -> 'title') = 'string'
         and char_length(btrim(v_element ->> 'title')) between 1 and 300
         and (v_element ->> 'title') !~ '[[:cntrl:]]'
         and jsonb_typeof(v_element -> 'excerpt') = 'string'
         and char_length(btrim(v_element ->> 'excerpt')) between 1 and 2000,
         false
       ) then
      raise exception 'Source % invalide : adresse, titre ou extrait.', v_rang
        using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(v_element -> 'published_on'), 'null') <> 'null' then
      if jsonb_typeof(v_element -> 'published_on') <> 'string'
         or (v_element ->> 'published_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Source % invalide : date.', v_rang using errcode = '22023';
      end if;
      begin
        perform (v_element ->> 'published_on')::date;
      exception when others then
        raise exception 'Source % invalide : date.', v_rang using errcode = '22023';
      end;
    end if;
  end loop;

  if p_opportunities is null or jsonb_typeof(p_opportunities) <> 'array' then
    raise exception 'Opportunités invalides : une liste est attendue.' using errcode = '22023';
  end if;
  v_nombre := jsonb_array_length(p_opportunities);
  if v_nombre > 20 then
    raise exception 'Opportunités invalides : 20 au plus, % reçues.', v_nombre
      using errcode = '22023';
  end if;

  -- Chaque opportunité désigne une page de la collecte, par son rang : c'est
  -- de là que viendront son adresse et son extrait. Le modèle n'écrit aucune
  -- adresse, ni dans un nom ni dans un résumé.
  for v_element, v_rang in
    select t.opportunite, t.rang
    from jsonb_array_elements(p_opportunities) with ordinality as t(opportunite, rang)
  loop
    if jsonb_typeof(v_element) <> 'object'
       or not coalesce(
         jsonb_typeof(v_element -> 'source') = 'number'
         and (v_element ->> 'source') ~ '^[0-9]{1,2}$'
         and (v_element ->> 'source')::integer between 1 and v_pages
         and jsonb_typeof(v_element -> 'name') = 'string'
         and char_length(btrim(v_element ->> 'name')) between 1 and 200
         and (v_element ->> 'name') !~ '[[:cntrl:]]'
         and jsonb_typeof(v_element -> 'organization') = 'string'
         and char_length(btrim(v_element ->> 'organization')) <= 200
         and (v_element ->> 'organization') !~ '[[:cntrl:]]'
         and jsonb_typeof(v_element -> 'category') = 'string'
         and jsonb_typeof(v_element -> 'summary') = 'string'
         and char_length(btrim(v_element ->> 'summary')) between 1 and 1500
         and (v_element ->> 'name') !~* '(https?://|www\.)'
         and (v_element ->> 'organization') !~* '(https?://|www\.)'
         and (v_element ->> 'summary') !~* '(https?://|www\.)',
         false
       ) then
      raise exception 'Opportunité % invalide : page désignée, nom, organisme, catégorie ou résumé.', v_rang
        using errcode = '22023';
    end if;
  end loop;

  -- Le texte de la proposition est écrit ici, pas par le modèle : il dit ce
  -- qui a été cherché et ce qui en est sorti.
  insert into public.ai_suggestions (
    job_id, action, content, profile, model, created_by, state, decided_at
  )
  values (
    v_job.id, v_job.action,
    format(
      'Veille « %s » : %s dans %s. %s',
      v_question,
      case v_nombre
        when 0 then 'aucune opportunité n''est annoncée'
        when 1 then '1 opportunité relevée'
        else v_nombre || ' opportunités relevées'
      end,
      case v_pages when 1 then 'la page collectée' else 'les ' || v_pages || ' pages collectées' end,
      case v_nombre when 0 then 'Rien n''est proposé.' else 'Rien n''est vérifié.' end
    ),
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by,
    case when v_nombre = 0 then 'dismissed' else 'proposed' end,
    case when v_nombre = 0 then now() end
  )
  returning id into v_proposition;

  insert into public.ai_suggestion_opportunities (
    suggestion_id, position, name, organization, category, summary,
    source_url, source_title, source_excerpt, published_on, collected_at
  )
  select
    v_proposition, t.rang::integer,
    btrim(t.opportunite ->> 'name'),
    btrim(t.opportunite ->> 'organization'),
    t.opportunite ->> 'category',
    btrim(t.opportunite ->> 'summary'),
    s.source ->> 'url',
    btrim(s.source ->> 'title'),
    btrim(s.source ->> 'excerpt'),
    (s.source ->> 'published_on')::date,
    v_collecte.settled_at
  from jsonb_array_elements(p_opportunities) with ordinality as t(opportunite, rang)
  join jsonb_array_elements(p_sources) with ordinality as s(source, rang)
    on s.rang = (t.opportunite ->> 'source')::integer;

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_veille(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_veille(uuid, jsonb, jsonb)
  to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'administration, opportunité par opportunité
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucune opportunité n'attend : appliquée si
-- une au moins a été acceptée, écartée sinon. Interne.
create or replace function public.clore_proposition_veille(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_opportunities l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_opportunities l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_veille(uuid) from public, anon, authenticated;

-- Verrouille la proposition puis l'opportunité, toujours dans cet ordre, et
-- la rend si l'appelant est administrateur. Un seul message pour
-- « introuvable » et « interdit ». Interne.
create or replace function public.opportunite_a_decider(p_line_id uuid)
returns public.ai_suggestion_opportunities
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_opportunities;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_opportunities l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_ligne
  from public.ai_suggestion_opportunities l
  where l.id = p_line_id
  for update;

  if v_ligne.id is null or (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Opportunité proposée introuvable, ou action réservée à l''administration.'
      using errcode = '42501';
  end if;

  return v_ligne;
end;
$$;

revoke all on function public.opportunite_a_decider(uuid) from public, anon, authenticated;

-- Accepte une opportunité : elle entre au catalogue « non vérifiée », avec
-- la page d'où elle vient, la date de la collecte et l'extrait. Le nom,
-- l'organisme et la catégorie se corrigent ici — le modèle a pu mal les lire,
-- ou ne pas trouver l'organisme ; la provenance, elle, ne se corrige pas.
-- L'ajout est journalisé par le catalogue, dans la même transaction.
create or replace function public.accepter_opportunite_proposee(
  p_line_id uuid,
  p_name text default null,
  p_organization text default null,
  p_category text default null
)
returns public.ai_suggestion_opportunities
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_opportunities;
  v_nom text;
  v_organisme text;
  v_categorie text;
  v_ajoutee uuid;
begin
  v_ligne := public.opportunite_a_decider(p_line_id);

  if v_ligne.state = 'accepted' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cette opportunité a déjà été écartée.' using errcode = 'PR001';
  end if;

  v_nom := btrim(coalesce(p_name, v_ligne.name));
  v_organisme := btrim(coalesce(p_organization, v_ligne.organization));
  v_categorie := coalesce(p_category, v_ligne.category);

  if char_length(v_nom) not between 1 and 200 or v_nom ~ '[[:cntrl:]]' then
    raise exception 'Donnez le nom de l''opportunité : 200 caractères au plus.'
      using errcode = '22023';
  end if;
  if char_length(v_organisme) not between 1 and 200 or v_organisme ~ '[[:cntrl:]]' then
    raise exception 'Indiquez l''organisme, tel que la page le nomme : la veille ne l''a pas trouvé.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.funding_opportunities o
    where lower(btrim(o.name)) = lower(v_nom)
      and lower(btrim(o.organization)) = lower(v_organisme)
  ) then
    raise exception 'Cette opportunité est déjà au catalogue, sous ce nom et cet organisme.'
      using errcode = '23505';
  end if;

  insert into public.funding_opportunities (
    name, organization, category, description, source_url, collected_on, source_excerpt, status
  )
  values (
    v_nom, v_organisme, v_categorie, v_ligne.summary, v_ligne.source_url,
    (v_ligne.collected_at at time zone 'utc')::date, v_ligne.source_excerpt, 'non_verifie'
  )
  returning id into v_ajoutee;

  update public.ai_suggestion_opportunities
  set state = 'accepted', opportunity_id = v_ajoutee,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_veille(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.accepter_opportunite_proposee(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.accepter_opportunite_proposee(uuid, text, text, text)
  to authenticated;

-- Écarte une opportunité : rien n'entre au catalogue.
create or replace function public.ecarter_opportunite_proposee(p_line_id uuid)
returns public.ai_suggestion_opportunities
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_opportunities;
begin
  v_ligne := public.opportunite_a_decider(p_line_id);

  if v_ligne.state = 'dismissed' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cette opportunité a déjà été acceptée.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_opportunities
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_veille(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.ecarter_opportunite_proposee(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_opportunite_proposee(uuid) to authenticated;
