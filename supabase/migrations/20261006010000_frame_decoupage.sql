-- FRAME : propositions de plans pour une scène (lot J3c-2a).
--
-- Troisième livrable structuré, sur le modèle validé en recette avec le
-- budget et le planning (décision 9) : une proposition parente dans
-- `ai_suggestions`, ses lignes dans une table fille typée, acceptées ou
-- écartées une à une. Cahier des charges : docs/product/CDC_FRAME_GEAR.md.
--
-- Ce que cette migration ouvre :
--   1. la colonne `shot_list` du barème, à 4 unités, et ses droits ;
--   2. l'action `shot_list` aux devis, avec la scène à découper en paramètre ;
--   3. la table `ai_suggestion_shots`, ses politiques, ses garde-fous ;
--   4. le contexte, le dépôt, l'acceptation et l'écart d'un plan proposé.
--
-- Ce qui distingue le découpage du planning :
--   - une demande vise une scène du storyboard, que le devis désigne et que
--     la base vérifie : elle existe, dans ce projet ;
--   - FRAME lit le scénario enregistré, en entier (décision de l'utilisateur
--     du 6 octobre 2026 : jusqu'à 220 000 caractères, un document en portant
--     200 000 au plus), avec le concept du projet. Ni budget, ni équipe ;
--   - un plan accepté s'ajoute à la fin de la scène, dans `scene_shots`. Le
--     cadrage principal de la scène n'est pas touché.
--
-- Les plans proposés suivent les droits du storyboard : lus de toute l'équipe,
-- décidés par qui l'écrit (`peut_editer_contenu`).
--
-- Retour arrière — aucun plan du découpage n'est perdu :
--   `drop table public.ai_suggestion_shots` ; rétablir
--   `ecarter_lignes_restantes` de la migration 20261005170000_field_planning et
--   `creer_devis` de la migration 20261005190000_voice_dialogues ; retirer
--   `shot_list` de `devis_action_connue`, puis
--   `alter table public.text_unit_rate_versions drop column shot_list` en
--   reprenant la contrainte `bareme_poids_positifs`. Les plans déjà acceptés
--   restent dans le découpage.

-- ---------------------------------------------------------------------------
-- Barème : le prix du découpage d'une scène
-- ---------------------------------------------------------------------------

-- Même geste que pour le budget et le planning : le défaut remplit les
-- versions déjà publiées, puis il est retiré pour qu'une version publiée
-- ensuite dise sa valeur.
alter table public.text_unit_rate_versions
  add column shot_list integer not null default 4;

alter table public.text_unit_rate_versions
  alter column shot_list drop default;

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
    and shot_list >= 0
    and treatment >= 0
    and bible >= 0
    and screenplay_per_sequence >= 0
    and dialogue_per_scene >= 0
  );

comment on column public.text_unit_rate_versions.shot_list is
  'Unités texte du découpage technique d''une scène (agent FRAME).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun. Sans ces deux lignes, l'administration ne
-- publierait plus de version, et la vitrine perdrait ses chiffres.
grant insert (shot_list) on table public.text_unit_rate_versions to authenticated;
grant select (shot_list) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action shot_list
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
      'shot_list',
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

-- Reprise de la migration voice_dialogues, avec un seul ajout : le découpage
-- d'une scène, au prix du barème.
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
    when 'shot_list' then
      -- Une scène par demande, désignée par son identifiant : elle doit
      -- exister, et dans ce projet.
      v_quantite := v_bareme.shot_list;
      if jsonb_typeof(v_parametres -> 'scene') is distinct from 'string'
         or (v_parametres ->> 'scene') !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
         or not exists (
           select 1 from public.storyboard_scenes s
           where s.id = (v_parametres ->> 'scene')::uuid and s.project_id = p_project_id
         ) then
        raise exception 'Désignez la scène du storyboard à découper.' using errcode = '22023';
      end if;
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
      -- Une scène par demande : le plafond du paramètre est 1. Le passage est
      -- désigné, pas transporté ; il est relu et contrôlé ici, avant toute
      -- réservation.
      v_quantite := v_bareme.dialogue_per_scene
        * public.parametre_entier(v_parametres, 'scenes', 1);
      if public.passage_du_scenario(p_project_id, v_parametres) is null then
        raise exception 'Le passage sélectionné ne correspond pas au scénario : sélectionnez-le de nouveau.'
          using errcode = '22023';
      end if;
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
-- Plans proposés
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_shots (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- La scène découpée. Si l'équipe la supprime, ses plans proposés partent
  -- avec elle : il n'y a plus rien à quoi les ajouter.
  scene_id uuid not null,
  position integer not null,
  shot public.shot_type not null,
  focal_mm integer,
  angle public.shot_angle not null,
  movement public.shot_movement not null,
  description text not null default '',
  duration_seconds integer,
  state text not null default 'proposed',
  -- Plan né de l'acceptation. Si l'équipe le supprime ensuite, la proposition
  -- reste acceptée : elle dit ce qui a été décidé, pas ce que le découpage
  -- contient aujourd'hui.
  shot_id uuid references public.scene_shots (id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint plan_propose_de_sa_scene foreign key (scene_id, project_id)
    references public.storyboard_scenes (id, project_id) on delete cascade,
  constraint plan_propose_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint plan_propose_focale check (focal_mm between 1 and 2000),
  constraint plan_propose_description check (
    char_length(description) <= 500 and description !~ '[[:cntrl:]]'
  ),
  constraint plan_propose_duree check (duration_seconds between 1 and 3600),
  constraint plan_propose_decision check ((state = 'proposed') = (decided_at is null)),
  constraint plan_propose_rang unique (suggestion_id, position)
);

comment on table public.ai_suggestion_shots is
  'Plan proposé par un agent pour une scène du storyboard : jamais appliqué de lui-même. Accepté ou écarté un à un par qui écrit le storyboard.';

create index ai_suggestion_shots_scene_idx
  on public.ai_suggestion_shots (scene_id, state);

create index ai_suggestion_shots_projet_idx
  on public.ai_suggestion_shots (project_id);

alter table public.ai_suggestion_shots enable row level security;

-- Le storyboard se lit de toute l'équipe : ses propositions aussi.
create policy "L'équipe et les administrateurs lisent les plans proposés"
  on public.ai_suggestion_shots for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_shots
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_shots from anon, authenticated;
grant select on table public.ai_suggestion_shots to authenticated;

-- Un plan proposé ne change que pour être accepté ou écarté, une fois ; ce
-- que l'agent a proposé ne change jamais.
create or replace function public.controler_plan_propose()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    -- Seule la disparition de la proposition, de la scène ou du projet
    -- l'emporte.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Un plan proposé ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.scene_id, new.position, new.shot,
      new.focal_mm, new.angle, new.movement, new.description, new.duration_seconds,
      new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.project_id, old.scene_id, old.position, old.shot,
      old.focal_mm, old.angle, old.movement, old.description, old.duration_seconds,
      old.created_at) then
    raise exception 'Ce qu''un agent a proposé ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    -- Seul le détachement d'un plan supprimé du découpage passe encore.
    if pg_trigger_depth() > 1
       and new.shot_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Un plan déjà accepté ou écarté ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_plan_propose() from public, anon, authenticated;

create trigger ai_suggestion_shots_controle
  before update or delete on public.ai_suggestion_shots
  for each row
  execute function public.controler_plan_propose();

create trigger ai_suggestion_shots_pas_de_vidage
  before truncate on public.ai_suggestion_shots
  for each statement
  execute function public.registre_en_ajout_seul();

-- Reprise de la migration field_planning, pour les trois tables filles :
-- écarter la proposition entière, c'est écarter ce qui restait à décider. Le
-- déclencheur `ai_suggestions_ecarte_les_lignes` reste celui du lot J3b-1.
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
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce que FRAME lit pour découper une scène : le projet et son concept, la
-- scène désignée par la demande, celles qui la précèdent, les plans qu'elle
-- porte déjà — pour ne pas les redire —, et le scénario enregistré. Ni
-- budget, ni équipe, ni identité, ni autre document. Null si l'essai n'est
-- pas l'essai en cours d'une tâche de découpage, ou si la scène n'existe plus :
-- rien ne doit alors être envoyé.
create or replace function public.contexte_decoupage(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_projet public.projects;
  v_scene public.storyboard_scenes;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'shot_list';

  if v_job.id is null
     or (v_job.params ->> 'scene') is null
     or (v_job.params ->> 'scene') !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$' then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  select s.* into v_scene
  from public.storyboard_scenes s
  where s.id = (v_job.params ->> 'scene')::uuid and s.project_id = v_job.project_id;

  if v_projet.id is null or v_scene.id is null then
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
    'scene', jsonb_build_object(
      'titre', v_scene.title,
      'decor', v_scene.setting,
      'lieu', v_scene.location,
      'moment', v_scene.time_of_day,
      'cadrage', v_scene.shot,
      'description', v_scene.description
    ),
    -- Les trente scènes qui précèdent, dans l'ordre du film : de quoi situer
    -- la scène, sans redonner tout le storyboard.
    'avant', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'titre', t.title, 'decor', t.setting, 'lieu', t.location, 'moment', t.time_of_day
          )
          order by t.position
        )
        from (
          select s.* from public.storyboard_scenes s
          where s.project_id = v_projet.id and s.position < v_scene.position
          order by s.position desc
          limit 30
        ) t
      ),
      '[]'::jsonb
    ),
    'plans', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cadrage', p.shot, 'focale', p.focal_mm, 'angle', p.angle,
            'mouvement', p.movement, 'description', p.description, 'duree', p.duration_seconds
          )
          order by p.position
        )
        from public.scene_shots p
        where p.scene_id = v_scene.id
      ),
      '[]'::jsonb
    ),
    -- Le scénario enregistré : le document de ce type le plus récemment
    -- modifié, comme le choisit l'écriture d'une séquence. Vide s'il n'y en a
    -- pas : FRAME travaille alors d'après la scène et le concept.
    'scenario', coalesce(
      (
        select left(d.content, 220000)
        from public.project_documents d
        where d.project_id = v_projet.id and d.type = 'scenario'
        order by d.updated_at desc, d.id
        limit 1
      ),
      ''
    )
  );
end;
$$;

revoke all on function public.contexte_decoupage(uuid) from public, anon, authenticated;
grant execute on function public.contexte_decoupage(uuid) to filmfund_worker;

-- Dépôt des plans proposés. Chaque plan est contrôlé ici, quoi qu'ait déjà
-- vérifié le worker : la base ne se fie pas à ce qu'on lui remet.
create or replace function public.livrer_proposition_decoupage(p_attempt_id uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_charge public.provider_charges;
  v_scene public.storyboard_scenes;
  v_proposition uuid;
  v_nombre integer;
  v_ligne jsonb;
  v_rang bigint;
  v_cle text;
  v_description text;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'shot_list' then
    raise exception 'Aucun plan n''est prévu pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  -- La scène a pu être supprimée pendant l'appel : il n'y a plus rien à
  -- quoi rattacher les plans.
  select s.* into v_scene
  from public.storyboard_scenes s
  where s.id::text = (v_job.params ->> 'scene') and s.project_id = v_job.project_id;
  if v_scene.id is null then
    raise exception 'La scène à découper n''existe plus.' using errcode = '22023';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Plans invalides : une liste est attendue.' using errcode = '22023';
  end if;
  v_nombre := jsonb_array_length(p_lines);
  if v_nombre not between 1 and 20 then
    raise exception 'Plans invalides : de 1 à 20 plans attendus, % reçus.', v_nombre
      using errcode = '22023';
  end if;

  for v_ligne, v_rang in
    select t.ligne, t.rang
    from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang)
  loop
    if jsonb_typeof(v_ligne) <> 'object' then
      raise exception 'Plan % invalide : un objet est attendu.', v_rang using errcode = '22023';
    end if;
    v_description := coalesce(v_ligne ->> 'description', '');
    if not coalesce(
         (v_ligne ->> 'shot') in (
           'plan_ensemble', 'plan_large', 'plan_moyen', 'plan_americain', 'plan_rapproche',
           'gros_plan', 'tres_gros_plan', 'insert', 'plan_sequence'
         )
         and (v_ligne ->> 'angle') in ('normal', 'plongee', 'contre_plongee')
         and (v_ligne ->> 'movement') in ('fixe', 'panoramique', 'travelling', 'epaule', 'autre'),
         false
       )
       or jsonb_typeof(v_ligne -> 'description') is distinct from 'string'
       or char_length(v_description) > 500
       or v_description ~ '[[:cntrl:]]' then
      raise exception 'Plan % invalide : cadrage, angle, mouvement ou description.', v_rang
        using errcode = '22023';
    end if;
    -- Focale et durée sont facultatives : absentes ou nulles, sinon entières
    -- et dans leurs bornes.
    foreach v_cle in array array['focal_mm', 'duration_seconds'] loop
      if coalesce(jsonb_typeof(v_ligne -> v_cle), 'null') = 'null' then
        continue;
      end if;
      if jsonb_typeof(v_ligne -> v_cle) <> 'number'
         or (v_ligne ->> v_cle)::numeric <> trunc((v_ligne ->> v_cle)::numeric)
         or not (v_ligne ->> v_cle)::numeric
              between 1 and (case v_cle when 'focal_mm' then 2000 else 3600 end) then
        raise exception 'Plan % invalide : focale ou durée.', v_rang using errcode = '22023';
      end if;
    end loop;
  end loop;

  -- Le texte de la proposition est écrit ici, sans rien de ce que le modèle
  -- a produit.
  insert into public.ai_suggestions (
    job_id, studio_id, project_id, action, content, profile, model, created_by
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.action,
    case
      when v_nombre = 1 then '1 plan proposé par l''assistant pour une scène.'
      else v_nombre || ' plans proposés par l''assistant pour une scène.'
    end,
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  insert into public.ai_suggestion_shots (
    suggestion_id, project_id, scene_id, position, shot, focal_mm, angle, movement,
    description, duration_seconds
  )
  select
    v_proposition, v_job.project_id, v_scene.id, t.rang::integer,
    (t.ligne ->> 'shot')::public.shot_type,
    (t.ligne ->> 'focal_mm')::numeric::integer,
    (t.ligne ->> 'angle')::public.shot_angle,
    (t.ligne ->> 'movement')::public.shot_movement,
    btrim(t.ligne ->> 'description'),
    (t.ligne ->> 'duration_seconds')::numeric::integer
  from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_decoupage(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_decoupage(uuid, jsonb) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe, plan par plan
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucun plan n'attend : appliquée si un plan
-- au moins a été accepté, écartée sinon. Interne.
create or replace function public.clore_proposition_decoupage(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_shots l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_shots l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_decoupage(uuid) from public, anon, authenticated;

-- Verrouille la proposition puis le plan, toujours dans cet ordre, et rend le
-- plan si l'appelant a le droit d'en décider : qui écrit le storyboard. Un
-- seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.plan_a_decider(p_line_id uuid)
returns public.ai_suggestion_shots
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_plan public.ai_suggestion_shots;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_shots l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_plan
  from public.ai_suggestion_shots l
  where l.id = p_line_id
  for update;

  if v_plan.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_editer_contenu(v_plan.project_id), false) then
    raise exception 'Plan proposé introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_plan;
end;
$$;

revoke all on function public.plan_a_decider(uuid) from public, anon, authenticated;

-- Accepte un plan : il s'ajoute à la fin de sa scène, tel que proposé ou tel
-- que l'équipe l'a corrigé. `p_corrige`, s'il est donné, porte les six champs
-- du plan, pris tels quels — une focale ou une durée nulle s'y dit par null.
create or replace function public.accepter_plan_propose(
  p_line_id uuid,
  p_corrige jsonb default null
)
returns public.ai_suggestion_shots
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.ai_suggestion_shots;
  v_retenu jsonb;
  v_cle text;
  v_rang integer;
  v_cree uuid;
begin
  v_plan := public.plan_a_decider(p_line_id);

  if v_plan.state = 'accepted' then
    return v_plan;
  end if;
  if v_plan.state <> 'proposed' then
    raise exception 'Ce plan a déjà été écarté.' using errcode = 'PR001';
  end if;

  v_retenu := coalesce(
    p_corrige,
    jsonb_build_object(
      'shot', v_plan.shot, 'focal_mm', v_plan.focal_mm, 'angle', v_plan.angle,
      'movement', v_plan.movement, 'description', v_plan.description,
      'duration_seconds', v_plan.duration_seconds
    )
  );

  if jsonb_typeof(v_retenu) <> 'object'
     or not coalesce(
       (v_retenu ->> 'shot') in (
         'plan_ensemble', 'plan_large', 'plan_moyen', 'plan_americain', 'plan_rapproche',
         'gros_plan', 'tres_gros_plan', 'insert', 'plan_sequence'
       )
       and (v_retenu ->> 'angle') in ('normal', 'plongee', 'contre_plongee')
       and (v_retenu ->> 'movement') in ('fixe', 'panoramique', 'travelling', 'epaule', 'autre')
       and jsonb_typeof(v_retenu -> 'description') = 'string'
       and char_length(v_retenu ->> 'description') <= 500,
       false
     ) then
    raise exception 'Plan invalide : cadrage, angle, mouvement ou description.'
      using errcode = '22023';
  end if;
  foreach v_cle in array array['focal_mm', 'duration_seconds'] loop
    if coalesce(jsonb_typeof(v_retenu -> v_cle), 'null') = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_retenu -> v_cle) <> 'number'
       or (v_retenu ->> v_cle)::numeric <> trunc((v_retenu ->> v_cle)::numeric)
       or not (v_retenu ->> v_cle)::numeric
            between 1 and (case v_cle when 'focal_mm' then 2000 else 3600 end) then
      raise exception 'Plan invalide : focale ou durée.' using errcode = '22023';
    end if;
  end loop;

  -- La scène est verrouillée le temps de prendre le rang suivant : deux
  -- acceptations simultanées ne visent pas la même place.
  perform 1 from public.storyboard_scenes s where s.id = v_plan.scene_id for update;
  select coalesce(max(p.position), 0) + 1 into v_rang
  from public.scene_shots p
  where p.scene_id = v_plan.scene_id;

  -- Les contraintes de `scene_shots` bornent ce qui est retenu.
  insert into public.scene_shots (
    project_id, scene_id, position, shot, focal_mm, angle, movement, description,
    duration_seconds, created_by
  )
  values (
    v_plan.project_id, v_plan.scene_id, v_rang,
    (v_retenu ->> 'shot')::public.shot_type,
    (v_retenu ->> 'focal_mm')::numeric::integer,
    (v_retenu ->> 'angle')::public.shot_angle,
    (v_retenu ->> 'movement')::public.shot_movement,
    btrim(v_retenu ->> 'description'),
    (v_retenu ->> 'duration_seconds')::numeric::integer,
    (select auth.uid())
  )
  returning id into v_cree;

  update public.ai_suggestion_shots
  set state = 'accepted', shot_id = v_cree,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_plan.id
  returning * into v_plan;

  perform public.clore_proposition_decoupage(v_plan.suggestion_id);

  return v_plan;
end;
$$;

revoke all on function public.accepter_plan_propose(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.accepter_plan_propose(uuid, jsonb) to authenticated;

-- Écarte un plan : rien n'entre dans le découpage.
create or replace function public.ecarter_plan_propose(p_line_id uuid)
returns public.ai_suggestion_shots
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.ai_suggestion_shots;
begin
  v_plan := public.plan_a_decider(p_line_id);

  if v_plan.state = 'dismissed' then
    return v_plan;
  end if;
  if v_plan.state <> 'proposed' then
    raise exception 'Ce plan a déjà été accepté.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_shots
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_plan.id
  returning * into v_plan;

  perform public.clore_proposition_decoupage(v_plan.suggestion_id);

  return v_plan;
end;
$$;

revoke all on function public.ecarter_plan_propose(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_plan_propose(uuid) to authenticated;
