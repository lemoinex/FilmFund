-- FIELD : propositions de jalons de planning (lot J3b-3a).
--
-- Second livrable structuré, sur le modèle validé en recette avec le budget
-- (décision 9) : une proposition parente dans `ai_suggestions`, ses lignes
-- dans une table fille typée, acceptées ou écartées une à une.
--
-- Ce que cette migration ouvre :
--   1. la colonne `schedule_plan` du barème, à 3 unités, et ses droits ;
--   2. l'action `schedule_plan` aux devis ;
--   3. la table `ai_suggestion_milestones`, ses politiques, ses garde-fous ;
--   4. le contexte, le dépôt, l'acceptation et l'écart d'un jalon.
--
-- Trois choses distinguent le planning du budget :
--   - il se lit de toute l'équipe : les jalons proposés aussi ; en décider
--     reste à qui écrit le planning (`peut_editer_contenu`) ;
--   - l'agent ne propose aucune date. Il ne connaît ni le jour ni le
--     calendrier de l'équipe : il donne une durée, et l'équipe date le jalon
--     en l'acceptant. Sans date, la durée estimée est gardée dans les notes
--     du jalon ;
--   - son contexte ne porte pas le budget, que les lecteurs ne lisent pas.
--
-- Écarter la proposition d'un bloc écarte les jalons restants, par le même
-- déclencheur que le budget : sa fonction est reprise pour les deux tables.
--
-- Retour arrière — aucune donnée du planning n'est perdue :
--   `drop table public.ai_suggestion_milestones` ; rétablir
--   `ecarter_lignes_restantes` de la migration 20261004160108_field_budget et
--   `creer_devis` de la migration 20261005150000_scenario_contexte ; retirer
--   `schedule_plan` de `devis_action_connue`, puis
--   `alter table public.text_unit_rate_versions drop column schedule_plan` en
--   reprenant la contrainte `bareme_poids_positifs`. Les jalons déjà acceptés
--   restent au planning.

-- ---------------------------------------------------------------------------
-- Barème : le prix d'une proposition de planning
-- ---------------------------------------------------------------------------

-- Même geste que pour l'analyse et le budget : le défaut remplit les versions
-- déjà publiées, puis il est retiré pour qu'une version publiée ensuite dise
-- sa valeur.
alter table public.text_unit_rate_versions
  add column schedule_plan integer not null default 3;

alter table public.text_unit_rate_versions
  alter column schedule_plan drop default;

alter table public.text_unit_rate_versions
  drop constraint bareme_poids_positifs,
  add constraint bareme_poids_positifs check (
    logline >= 0
    and synopsis_short >= 0
    and synopsis_standard >= 0
    and synopsis_detailed >= 0
    and intention_note >= 0
    and dramatic_analysis >= 0
    and budget_plan >= 0
    and schedule_plan >= 0
    and treatment >= 0
    and bible >= 0
    and screenplay_per_sequence >= 0
    and dialogue_per_scene >= 0
  );

comment on column public.text_unit_rate_versions.schedule_plan is
  'Unités texte d''une proposition de jalons de planning (agent FIELD).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun. Sans ces deux lignes, l'administration ne
-- publierait plus de version, et la vitrine perdrait ses chiffres.
grant insert (schedule_plan) on table public.text_unit_rate_versions to authenticated;
grant select (schedule_plan) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action schedule_plan
-- ---------------------------------------------------------------------------

alter table public.quotes
  drop constraint devis_action_connue,
  add constraint devis_action_connue check (
    action in (
      'logline',
      'synopsis_short',
      'synopsis_standard',
      'synopsis_detailed',
      'intention_note',
      'dramatic_analysis',
      'budget_plan',
      'schedule_plan',
      'treatment',
      'bible',
      'screenplay',
      'dialogue',
      'image',
      'pdf_export',
      'docx_export',
      'zip_export'
    )
  );

-- Reprise de la migration scenario_contexte, avec un seul ajout : la
-- proposition de planning, au prix du barème.
create or replace function public.creer_devis(
  p_project_id uuid,
  p_action text,
  p_params jsonb default '{}'
)
returns table (
  quote_id uuid,
  unit text,
  quantity integer,
  expires_at timestamptz,
  allowance integer,
  available integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_parametres jsonb := coalesce(p_params, '{}');
  v_studio uuid;
  v_debut timestamptz;
  v_plan public.plan_versions;
  v_bareme public.text_unit_rate_versions;
  v_unite text := 'text';
  v_quantite integer;
  v_allocation integer;
  v_disponible integer;
  v_devis public.quotes;
  v_sequence text;
begin
  if not public.peut_engager_unites(p_project_id) then
    raise exception 'Projet introuvable, ou droits insuffisants pour y engager des unités.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(v_parametres) <> 'object' or octet_length(v_parametres::text) > 2000 then
    raise exception 'Paramètres invalides : un objet de taille raisonnable est attendu.'
      using errcode = '22023';
  end if;

  select p.studio_id into v_studio from public.projects p where p.id = p_project_id;
  select public.debut_periode(a.period_anchor) into v_debut
  from public.studio_subscriptions a
  where a.studio_id = v_studio;
  select * into v_plan from public.plan_en_vigueur(v_studio);
  select * into v_bareme from public.bareme_en_vigueur(v_studio);

  if v_debut is null or v_plan.id is null or v_bareme.id is null then
    raise exception 'Ce studio n''a pas de plan en vigueur.' using errcode = '55000';
  end if;

  case p_action
    when 'logline' then v_quantite := v_bareme.logline;
    when 'synopsis_short' then v_quantite := v_bareme.synopsis_short;
    when 'synopsis_standard' then v_quantite := v_bareme.synopsis_standard;
    when 'synopsis_detailed' then v_quantite := v_bareme.synopsis_detailed;
    when 'intention_note' then v_quantite := v_bareme.intention_note;
    when 'dramatic_analysis' then v_quantite := v_bareme.dramatic_analysis;
    when 'budget_plan' then
      -- Sans budget ouvert, pas de devise : les montants proposés ne
      -- voudraient rien dire.
      if not exists (
        select 1 from public.project_budgets b where b.project_id = p_project_id
      ) then
        raise exception 'Ouvrez d''abord le budget du projet : sa devise est nécessaire.'
          using errcode = '55000';
      end if;
      v_quantite := v_bareme.budget_plan;
    when 'schedule_plan' then v_quantite := v_bareme.schedule_plan;
    when 'treatment' then v_quantite := v_bareme.treatment;
    when 'bible' then v_quantite := v_bareme.bible;
    when 'screenplay' then
      -- Une séquence par demande : le plafond du paramètre est 1.
      v_quantite := v_bareme.screenplay_per_sequence
        * public.parametre_entier(v_parametres, 'sequences', 1);
      v_sequence := v_parametres ->> 'sequence';
      if jsonb_typeof(v_parametres -> 'sequence') is distinct from 'string'
         or char_length(btrim(v_sequence)) not between 1 and 1200
         or regexp_replace(v_sequence, '[\n\r\t]', '', 'g') ~ '[[:cntrl:]]' then
        raise exception 'Décrivez la séquence à écrire : de 1 à 1 200 caractères.'
          using errcode = '22023';
      end if;
    when 'dialogue' then
      v_quantite := v_bareme.dialogue_per_scene
        * public.parametre_entier(v_parametres, 'scenes', 1000);
    when 'image' then
      v_unite := 'image';
      v_quantite := public.parametre_entier(v_parametres, 'count', 100);
    when 'pdf_export', 'docx_export', 'zip_export' then
      v_unite := 'pdf';
      v_quantite := 1;
    else
      raise exception 'Action inconnue : %.', p_action using errcode = '22023';
  end case;

  v_allocation := public.allocation_du_plan(v_plan, v_unite);
  v_disponible := greatest(v_allocation - public.unites_engagees(v_studio, v_unite, v_debut), 0);

  if v_quantite > v_disponible then
    raise exception 'Quota insuffisant pour cette période : l''action demande %, il reste % sur %.',
      v_quantite, v_disponible, v_allocation
      using errcode = '53400';
  end if;

  insert into public.quotes (
    studio_id, project_id, created_by, action, params, unit, quantity,
    plan_version_id, rate_version_id, period_start, fingerprint, expires_at
  )
  values (
    v_studio, p_project_id, (select auth.uid()), p_action, v_parametres, v_unite, v_quantite,
    v_plan.id, case when v_unite = 'text' then v_bareme.id end, v_debut,
    public.empreinte_demande(p_project_id, p_action, v_parametres),
    now() + public.duree_validite_devis()
  )
  returning * into v_devis;

  return query
    select v_devis.id, v_devis.unit, v_devis.quantity, v_devis.expires_at, v_allocation, v_disponible;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jalons proposés
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_milestones (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null,
  title text not null,
  phase public.project_stage not null,
  -- Durée estimée par l'agent, en jours : il ne propose aucune date.
  duration_days integer not null,
  state text not null default 'proposed',
  -- Jalon né de l'acceptation. Si l'équipe le supprime ensuite, la
  -- proposition reste acceptée : elle dit ce qui a été décidé, pas ce que le
  -- planning contient aujourd'hui.
  milestone_id uuid references public.project_milestones (id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint jalon_propose_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint jalon_propose_titre check (char_length(btrim(title)) between 1 and 200),
  -- « Terminé » décrit un projet achevé, pas une période de travail.
  constraint jalon_propose_phase check (phase <> 'termine'),
  constraint jalon_propose_duree check (duration_days between 1 and 730),
  constraint jalon_propose_decision check ((state = 'proposed') = (decided_at is null)),
  constraint jalon_propose_rang unique (suggestion_id, position)
);

comment on table public.ai_suggestion_milestones is
  'Jalon de planning proposé par un agent : jamais appliqué de lui-même. Accepté ou écarté un à un par qui écrit le planning.';

create index ai_suggestion_milestones_projet_idx
  on public.ai_suggestion_milestones (project_id, state);

alter table public.ai_suggestion_milestones enable row level security;

-- Le planning se lit de toute l'équipe : ses propositions aussi.
create policy "L'équipe et les administrateurs lisent les jalons proposés"
  on public.ai_suggestion_milestones for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_milestones
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_milestones from anon, authenticated;
grant select on table public.ai_suggestion_milestones to authenticated;

-- Un jalon proposé ne change que pour être accepté ou écarté, une fois ; ce
-- que l'agent a proposé ne change jamais.
create or replace function public.controler_jalon_propose()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    -- Seule la disparition de la proposition ou du projet l'emporte.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Un jalon proposé ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.position, new.title, new.phase,
      new.duration_days, new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.project_id, old.position, old.title, old.phase,
      old.duration_days, old.created_at) then
    raise exception 'Ce qu''un agent a proposé ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    -- Seul le détachement d'un jalon supprimé du planning passe encore.
    if pg_trigger_depth() > 1
       and new.milestone_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Un jalon déjà accepté ou écarté ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_jalon_propose() from public, anon, authenticated;

create trigger ai_suggestion_milestones_controle
  before update or delete on public.ai_suggestion_milestones
  for each row
  execute function public.controler_jalon_propose();

create trigger ai_suggestion_milestones_pas_de_vidage
  before truncate on public.ai_suggestion_milestones
  for each statement
  execute function public.registre_en_ajout_seul();

-- Reprise de la migration field_budget, pour les deux tables filles : écarter
-- la proposition entière, c'est écarter ce qui restait à décider, lignes de
-- budget ou jalons. Le déclencheur `ai_suggestions_ecarte_les_lignes` reste
-- celui du lot J3b-1.
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
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce que FIELD lit pour proposer un planning : le projet, ce qu'il raconte,
-- et le planning déjà saisi — pour ne pas le redire. Ni budget, ni documents,
-- ni équipe, ni identité. Null si l'essai n'est pas l'essai en cours d'une
-- tâche de planning.
create or replace function public.contexte_planning(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_projet public.projects;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'schedule_plan';

  if v_job.id is null then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  if v_projet.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'action', v_job.action,
    'projet', jsonb_build_object(
      'titre', v_projet.title,
      'format', v_projet.format,
      'etape', v_projet.stage,
      'genre', v_projet.genre,
      'pays', to_jsonb(v_projet.countries),
      'langues', v_projet.languages,
      'duree', v_projet.duration_minutes
    ),
    'contexte', jsonb_build_object(
      'pitch', v_projet.logline,
      'synopsis_court', v_projet.short_synopsis,
      'synopsis', v_projet.synopsis,
      'theme', v_projet.theme,
      'enjeux', v_projet.stakes
    ),
    'vision', jsonb_build_object(
      'artistique', v_projet.artistic_vision,
      'objectifs', v_projet.goals,
      'public', v_projet.audience
    ),
    'personnages', (
      select count(*) from public.project_characters c where c.project_id = v_projet.id
    ),
    'planning', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'titre', m.title, 'phase', m.phase, 'statut', m.status,
            'debut', m.starts_on, 'echeance', m.due_on
          )
          order by m.starts_on nulls last, m.due_on nulls last, m.created_at, m.id
        )
        from public.project_milestones m
        where m.project_id = v_projet.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.contexte_planning(uuid) from public, anon, authenticated;
grant execute on function public.contexte_planning(uuid) to filmfund_worker;

-- Dépôt des jalons proposés. Chaque jalon est contrôlé ici, quoi qu'ait déjà
-- vérifié le worker : la base ne se fie pas à ce qu'on lui remet.
create or replace function public.livrer_proposition_planning(p_attempt_id uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_charge public.provider_charges;
  v_proposition uuid;
  v_nombre integer;
  v_ligne jsonb;
  v_rang bigint;
  v_titre text;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'schedule_plan' then
    raise exception 'Aucun jalon de planning n''est prévu pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Jalons invalides : une liste est attendue.' using errcode = '22023';
  end if;
  v_nombre := jsonb_array_length(p_lines);
  if v_nombre not between 1 and 30 then
    raise exception 'Jalons invalides : de 1 à 30 jalons attendus, % reçus.', v_nombre
      using errcode = '22023';
  end if;

  for v_ligne, v_rang in
    select t.ligne, t.rang
    from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang)
  loop
    if jsonb_typeof(v_ligne) <> 'object' then
      raise exception 'Jalon % invalide : un objet est attendu.', v_rang using errcode = '22023';
    end if;
    v_titre := btrim(coalesce(v_ligne ->> 'title', ''));
    if not coalesce(
         (v_ligne ->> 'phase') in (
           'idee', 'developpement', 'ecriture', 'preproduction', 'production', 'postproduction'
         ),
         false
       )
       or char_length(v_titre) not between 1 and 200
       or v_titre ~ '[[:cntrl:]]'
       or jsonb_typeof(v_ligne -> 'duration_days') is distinct from 'number'
       or not coalesce((v_ligne ->> 'duration_days')::numeric between 1 and 730, false)
       or (v_ligne ->> 'duration_days')::numeric <> trunc((v_ligne ->> 'duration_days')::numeric) then
      raise exception 'Jalon % invalide : titre, phase ou durée.', v_rang using errcode = '22023';
    end if;
  end loop;

  -- Le texte de la proposition est écrit ici, sans rien de ce que le modèle
  -- a produit.
  insert into public.ai_suggestions (
    job_id, studio_id, project_id, action, content, profile, model, created_by
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.action,
    case
      when v_nombre = 1 then '1 jalon de planning proposé par l''assistant.'
      else v_nombre || ' jalons de planning proposés par l''assistant.'
    end,
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  insert into public.ai_suggestion_milestones (
    suggestion_id, project_id, position, title, phase, duration_days
  )
  select
    v_proposition, v_job.project_id, t.rang::integer,
    btrim(t.ligne ->> 'title'),
    (t.ligne ->> 'phase')::public.project_stage,
    (t.ligne ->> 'duration_days')::numeric::integer
  from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_planning(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_planning(uuid, jsonb) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe, jalon par jalon
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucun jalon n'attend : appliquée si un jalon
-- au moins a été accepté, écartée sinon. Interne.
create or replace function public.clore_proposition_planning(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_milestones l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_milestones l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_planning(uuid) from public, anon, authenticated;

-- Verrouille la proposition puis le jalon, toujours dans cet ordre, et rend
-- le jalon si l'appelant a le droit d'en décider : qui écrit le planning.
-- Un seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.jalon_a_decider(p_line_id uuid)
returns public.ai_suggestion_milestones
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_jalon public.ai_suggestion_milestones;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_milestones l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_jalon
  from public.ai_suggestion_milestones l
  where l.id = p_line_id
  for update;

  if v_jalon.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_editer_contenu(v_jalon.project_id), false) then
    raise exception 'Jalon proposé introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_jalon;
end;
$$;

revoke all on function public.jalon_a_decider(uuid) from public, anon, authenticated;

-- Accepte un jalon : il entre au planning, tel que proposé ou tel que
-- l'équipe l'a corrigé, aux dates qu'elle lui donne. L'agent n'en propose
-- aucune : sans date, le jalon entre non daté, et la durée estimée est gardée
-- dans ses notes plutôt que perdue.
create or replace function public.accepter_jalon_propose(
  p_line_id uuid,
  p_title text default null,
  p_phase text default null,
  p_starts_on date default null,
  p_due_on date default null
)
returns public.ai_suggestion_milestones
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_jalon public.ai_suggestion_milestones;
  v_phase text;
  v_cree uuid;
begin
  v_jalon := public.jalon_a_decider(p_line_id);

  if v_jalon.state = 'accepted' then
    return v_jalon;
  end if;
  if v_jalon.state <> 'proposed' then
    raise exception 'Ce jalon a déjà été écarté.' using errcode = 'PR001';
  end if;

  v_phase := coalesce(nullif(btrim(p_phase), ''), v_jalon.phase::text);
  if v_phase not in (
    'idee', 'developpement', 'ecriture', 'preproduction', 'production', 'postproduction'
  ) then
    raise exception 'Phase inconnue.' using errcode = '22023';
  end if;
  if p_starts_on is not null and p_due_on is not null and p_due_on < p_starts_on then
    raise exception 'L''échéance ne peut pas précéder le début.' using errcode = '22023';
  end if;

  -- Les contraintes de `project_milestones` bornent ce qui est retenu.
  insert into public.project_milestones (
    project_id, title, phase, starts_on, due_on, notes, created_by
  )
  values (
    v_jalon.project_id,
    coalesce(nullif(btrim(p_title), ''), v_jalon.title),
    v_phase::public.project_stage,
    p_starts_on,
    p_due_on,
    case
      when p_starts_on is not null and p_due_on is not null then ''
      when v_jalon.duration_days = 1 then 'Durée estimée par l''assistant : 1 jour.'
      else 'Durée estimée par l''assistant : ' || v_jalon.duration_days || ' jours.'
    end,
    (select auth.uid())
  )
  returning id into v_cree;

  update public.ai_suggestion_milestones
  set state = 'accepted', milestone_id = v_cree,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_jalon.id
  returning * into v_jalon;

  perform public.clore_proposition_planning(v_jalon.suggestion_id);

  return v_jalon;
end;
$$;

revoke all on function public.accepter_jalon_propose(uuid, text, text, date, date)
  from public, anon, authenticated;
grant execute on function public.accepter_jalon_propose(uuid, text, text, date, date)
  to authenticated;

-- Écarte un jalon : rien n'entre au planning.
create or replace function public.ecarter_jalon_propose(p_line_id uuid)
returns public.ai_suggestion_milestones
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_jalon public.ai_suggestion_milestones;
begin
  v_jalon := public.jalon_a_decider(p_line_id);

  if v_jalon.state = 'dismissed' then
    return v_jalon;
  end if;
  if v_jalon.state <> 'proposed' then
    raise exception 'Ce jalon a déjà été accepté.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_milestones
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_jalon.id
  returning * into v_jalon;

  perform public.clore_proposition_planning(v_jalon.suggestion_id);

  return v_jalon;
end;
$$;

revoke all on function public.ecarter_jalon_propose(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_jalon_propose(uuid) to authenticated;
