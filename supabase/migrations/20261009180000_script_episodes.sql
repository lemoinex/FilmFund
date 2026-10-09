-- SCRIPT : épisodes proposés (lot SE2a).
--
-- Sixième livrable structuré, sur le modèle des personnages proposés par ARC
-- (lot X2a) : une proposition parente dans `ai_suggestions`, ses lignes dans
-- une table fille typée, acceptées ou écartées une à une.
--
-- Ce que cette migration ouvre :
--   1. la colonne `episode_list` du barème, à 3 unités, et ses droits ;
--   2. l'action `episode_list` aux devis ;
--   3. la table `ai_suggestion_episodes`, ses politiques, ses garde-fous ;
--   4. le contexte, le dépôt, l'acceptation et l'écart d'un épisode proposé.
--
-- Ce qui distingue les épisodes des personnages :
--   - SCRIPT lit le projet, son concept, sa vision, ses personnages, les
--     épisodes déjà saisis — pour ne pas les redire — et la bible de série si
--     elle existe : c'est elle qui porte l'arc de la saison. Ni scénario, ni
--     autre document, ni budget, ni équipe ;
--   - il ne propose que des épisodes à ajouter : aucun chemin ne réécrit un
--     épisode existant. Un épisode accepté prend le numéro qui suit le plus
--     grand ; ce que l'agent propose n'a pas de numéro, seulement un ordre ;
--   - il ne propose pas de durée : l'équipe la saisit ;
--   - un devis est refusé, avant toute dépense, pour un projet qui n'est pas
--     une série ou dont la saison n'a plus de numéro libre.
--
-- Décisions du 9 octobre 2026 : 3 unités, comme une liste de personnages ;
-- douze épisodes au plus par proposition ; la bible est lue.
--
-- Les épisodes proposés suivent les droits des épisodes : lus de toute
-- l'équipe, décidés par qui les écrit (`peut_editer_contenu`).
--
-- Retour arrière — aucun épisode du projet n'est perdu :
--   `drop table public.ai_suggestion_episodes` et ses fonctions ; rétablir
--   `ecarter_lignes_restantes` de la migration 20261007230000_arc_personnages
--   et `creer_devis` de 20261008180000_weaver_retouches ; retirer
--   `episode_list` de `devis_action_connue`, puis
--   `alter table public.text_unit_rate_versions drop column episode_list`
--   en reprenant la contrainte `bareme_poids_positifs`. Les épisodes déjà
--   acceptés restent au projet.

-- ---------------------------------------------------------------------------
-- Barème : le prix d'une liste d'épisodes
-- ---------------------------------------------------------------------------

-- Le défaut remplit les versions déjà publiées, puis il est retiré : une
-- version publiée ensuite doit dire sa valeur.
alter table public.text_unit_rate_versions
  add column episode_list integer not null default 3;

alter table public.text_unit_rate_versions
  alter column episode_list drop default;

-- Reprise de la contrainte de la migration weaver_retouches, avec une colonne
-- de plus.
alter table public.text_unit_rate_versions
  drop constraint bareme_poids_positifs,
  add constraint bareme_poids_positifs check (
    logline >= 0
    and synopsis_short >= 0
    and synopsis_standard >= 0
    and synopsis_detailed >= 0
    and intention_note >= 0
    and direction_note >= 0
    and pitch_extended >= 0
    and pitch_oral >= 0
    and dramatic_analysis >= 0
    and character_list >= 0
    and episode_list >= 0
    and budget_plan >= 0
    and schedule_plan >= 0
    and shot_list >= 0
    and gear_list >= 0
    and research >= 0
    and cultural_context >= 0
    and treatment >= 0
    and bible >= 0
    and screenplay_per_sequence >= 0
    and dialogue_per_scene >= 0
    and text_edit_per_passage >= 0
  );

comment on column public.text_unit_rate_versions.episode_list is
  'Unités texte d''une liste d''épisodes proposés (agent SCRIPT).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun.
grant insert (episode_list) on table public.text_unit_rate_versions to authenticated;
grant select (episode_list) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action episode_list
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
      'direction_note',
      'pitch_extended',
      'pitch_oral',
      'dramatic_analysis',
      'character_list',
      'episode_list',
      'budget_plan',
      'schedule_plan',
      'shot_list',
      'gear_list',
      'research',
      'cultural_context',
      'treatment',
      'bible',
      'screenplay',
      'dialogue',
      'text_improve',
      'text_shorten',
      'text_expand',
      'text_correct',
      'image',
      'storyboard_image',
      'pdf_export',
      'docx_export',
      'zip_export'
    )
  );

-- Même fonction qu'au lot RT1, un cas de plus.
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
  v_question text;
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
    when 'direction_note' then v_quantite := v_bareme.direction_note;
    when 'pitch_extended' then v_quantite := v_bareme.pitch_extended;
    when 'pitch_oral' then v_quantite := v_bareme.pitch_oral;
    when 'dramatic_analysis' then v_quantite := v_bareme.dramatic_analysis;
    when 'character_list' then
      -- Liste pleine : rien de ce qui serait proposé ne pourrait être
      -- accepté. Refusé ici, avant toute réservation.
      if (
        select count(*) from public.project_characters c where c.project_id = p_project_id
      ) >= 50 then
        raise exception 'Ce projet compte déjà 50 personnages : aucun autre ne peut y être ajouté.'
          using errcode = '55000';
      end if;
      v_quantite := v_bareme.character_list;
    when 'episode_list' then
      -- Des épisodes ne se proposent qu'à une série, et tant qu'un numéro
      -- reste libre : rien de ce qui serait proposé ne pourrait être accepté.
      -- Refusé ici, avant toute réservation.
      if not exists (
        select 1 from public.projects p
        where p.id = p_project_id and p.format in ('serie', 'web_serie')
      ) then
        raise exception 'Les épisodes sont réservés aux projets de série.' using errcode = '55000';
      end if;
      if (
        select coalesce(max(e.number), 0) from public.project_episodes e
        where e.project_id = p_project_id
      ) >= 500 then
        raise exception 'Cette série a atteint son dernier numéro d''épisode : aucun autre ne peut y être ajouté.'
          using errcode = '55000';
      end if;
      v_quantite := v_bareme.episode_list;
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
    when 'gear_list' then v_quantite := v_bareme.gear_list;
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
    when 'research', 'cultural_context' then
      -- Une question par demande, en clair : c'est elle, et elle seule, qui
      -- part chez le moteur de recherche.
      v_quantite := case p_action
        when 'cultural_context' then v_bareme.cultural_context
        else v_bareme.research
      end;
      v_question := v_parametres ->> 'question';
      if jsonb_typeof(v_parametres -> 'question') is distinct from 'string'
         or char_length(btrim(v_question)) not between 10 and 500
         or v_question ~ '[[:cntrl:]]' then
        raise exception 'Posez la question à rechercher : de 10 à 500 caractères, sur une ligne.'
          using errcode = '22023';
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
    when 'text_improve', 'text_shorten', 'text_expand', 'text_correct' then
      -- Un passage par demande, désigné et non transporté : relu et contrôlé
      -- ici, avant toute réservation. Les quatre retouches ont un seul prix.
      v_quantite := v_bareme.text_edit_per_passage;
      if public.passage_du_document(p_project_id, v_parametres) is null then
        raise exception 'Le passage sélectionné ne correspond pas au document : sélectionnez-le de nouveau.'
          using errcode = '22023';
      end if;
    when 'storyboard_image' then
      -- Une scène, donc une image, par demande : comptée sur le quota
      -- d'images du plan. La scène doit exister, et dans ce projet.
      v_unite := 'image';
      v_quantite := 1;
      if jsonb_typeof(v_parametres -> 'scene') is distinct from 'string'
         or (v_parametres ->> 'scene') !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
         or not exists (
           select 1 from public.storyboard_scenes s
           where s.id = (v_parametres ->> 'scene')::uuid and s.project_id = p_project_id
         ) then
        raise exception 'Désignez la scène du storyboard à illustrer.' using errcode = '22023';
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
-- Épisodes proposés
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_episodes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- L'ordre dans lequel l'agent les propose : pas un numéro d'épisode.
  position integer not null,
  title text not null,
  summary text not null,
  state text not null default 'proposed',
  -- Épisode né de l'acceptation. Si l'équipe le retire ensuite, la
  -- proposition reste acceptée : elle dit ce qui a été décidé, pas ce que la
  -- saison contient aujourd'hui.
  episode_id uuid references public.project_episodes (id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint episode_propose_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint episode_propose_titre check (
    char_length(btrim(title)) between 1 and 200 and title !~ '[[:cntrl:]]'
  ),
  constraint episode_propose_resume check (char_length(summary) between 1 and 2000),
  constraint episode_propose_decision check ((state = 'proposed') = (decided_at is null)),
  constraint episode_propose_rang unique (suggestion_id, position)
);

comment on table public.ai_suggestion_episodes is
  'Épisode proposé par un agent : jamais appliqué de lui-même. Accepté ou écarté un à un par qui écrit les épisodes.';

create index ai_suggestion_episodes_projet_idx
  on public.ai_suggestion_episodes (project_id, state);

alter table public.ai_suggestion_episodes enable row level security;

-- Les épisodes se lisent de toute l'équipe : leurs propositions aussi.
create policy "L'équipe et les administrateurs lisent ces propositions"
  on public.ai_suggestion_episodes for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_episodes
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_episodes from anon, authenticated;
grant select on table public.ai_suggestion_episodes to authenticated;

-- Une ligne proposée ne change que pour être acceptée ou écartée, une fois ;
-- ce que l'agent a proposé ne change jamais.
create or replace function public.controler_episode_propose()
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
    raise exception 'Un épisode proposé ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.position, new.title, new.summary,
      new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.project_id, old.position, old.title, old.summary,
      old.created_at) then
    raise exception 'Ce qu''un agent a proposé ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    -- Seul le détachement d'un épisode retiré de la saison passe encore.
    if pg_trigger_depth() > 1
       and new.episode_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Un épisode déjà accepté ou écarté ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_episode_propose() from public, anon, authenticated;

create trigger ai_suggestion_episodes_controle
  before update or delete on public.ai_suggestion_episodes
  for each row
  execute function public.controler_episode_propose();

create trigger ai_suggestion_episodes_pas_de_vidage
  before truncate on public.ai_suggestion_episodes
  for each statement
  execute function public.registre_en_ajout_seul();

-- Reprise de la migration arc_personnages, pour les neuf tables filles :
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

  update public.ai_suggestion_characters
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';

  update public.ai_suggestion_episodes
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce que SCRIPT lit pour proposer des épisodes : le projet, son concept, sa
-- vision, ses personnages, les épisodes déjà saisis — pour ne pas les redire
-- — et la bible de série, si elle existe. Ni scénario, ni autre document, ni
-- budget, ni équipe, ni identité. Null si l'essai n'est pas l'essai en cours
-- d'une tâche d'épisodes.
create or replace function public.contexte_episodes(p_attempt_id uuid)
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
    and j.action = 'episode_list';

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
    -- Tous les personnages du projet : cinquante au plus.
    'personnages', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('nom', t.name, 'role', t.role, 'description', t.description)
          order by t.position, t.created_at, t.id
        )
        from (
          select c.* from public.project_characters c
          where c.project_id = v_projet.id
          order by c.position, c.created_at, c.id
          limit 50
        ) t
      ),
      '[]'::jsonb
    ),
    -- Les épisodes déjà saisis, dans l'ordre de la saison : cent au plus, et
    -- le début de chaque résumé — de quoi ne pas les redire, pas davantage.
    'episodes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('numero', t.number, 'titre', t.title, 'resume', left(t.summary, 600))
          order by t.number
        )
        from (
          select e.* from public.project_episodes e
          where e.project_id = v_projet.id
          order by e.number
          limit 100
        ) t
      ),
      '[]'::jsonb
    ),
    -- La bible la plus récente, brouillon compris : ses vingt mille premiers
    -- caractères, la longueur d'une bible proposée. Chaîne vide s'il n'y en a pas.
    'bible', coalesce(
      (
        select left(d.content, 20000)
        from public.project_documents d
        where d.project_id = v_projet.id and d.type = 'bible'
        order by d.updated_at desc, d.id
        limit 1
      ),
      ''
    )
  );
end;
$$;

revoke all on function public.contexte_episodes(uuid) from public, anon, authenticated;
grant execute on function public.contexte_episodes(uuid) to filmfund_worker;

-- Dépôt des épisodes proposés. Chacun est contrôlé ici, quoi qu'ait déjà
-- vérifié le worker : la base ne se fie pas à ce qu'on lui remet.
create or replace function public.livrer_proposition_episodes(p_attempt_id uuid, p_lines jsonb)
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
  v_resume text;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'episode_list' then
    raise exception 'Aucun épisode n''est prévu pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Épisodes invalides : une liste est attendue.' using errcode = '22023';
  end if;
  v_nombre := jsonb_array_length(p_lines);
  if v_nombre not between 1 and 12 then
    raise exception 'Épisodes invalides : de 1 à 12 attendus, % reçus.', v_nombre
      using errcode = '22023';
  end if;

  for v_ligne, v_rang in
    select t.ligne, t.rang
    from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang)
  loop
    if jsonb_typeof(v_ligne) <> 'object' then
      raise exception 'Épisode % invalide : un objet est attendu.', v_rang
        using errcode = '22023';
    end if;
    v_titre := btrim(coalesce(v_ligne ->> 'title', ''));
    v_resume := btrim(coalesce(v_ligne ->> 'summary', ''));
    if jsonb_typeof(v_ligne -> 'title') is distinct from 'string'
       or char_length(v_titre) not between 1 and 200
       or v_titre ~ '[[:cntrl:]]'
       or jsonb_typeof(v_ligne -> 'summary') is distinct from 'string'
       or char_length(v_resume) not between 1 and 2000
       or regexp_replace(v_resume, '[\n\r\t]', '', 'g') ~ '[[:cntrl:]]' then
      raise exception 'Épisode % invalide : titre ou résumé.', v_rang
        using errcode = '22023';
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
      when v_nombre = 1 then '1 épisode proposé par l''assistant.'
      else v_nombre || ' épisodes proposés par l''assistant.'
    end,
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  insert into public.ai_suggestion_episodes (
    suggestion_id, project_id, position, title, summary
  )
  select
    v_proposition, v_job.project_id, t.rang::integer,
    btrim(t.ligne ->> 'title'),
    btrim(t.ligne ->> 'summary')
  from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_episodes(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_episodes(uuid, jsonb) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe, épisode par épisode
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucun épisode n'attend : appliquée si un au
-- moins a été accepté, écartée sinon. Interne.
create or replace function public.clore_proposition_episodes(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_episodes l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_episodes l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_episodes(uuid)
  from public, anon, authenticated;

-- Verrouille la proposition puis la ligne, toujours dans cet ordre, et rend
-- la ligne si l'appelant a le droit d'en décider : qui écrit les épisodes.
-- Un seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.episode_a_decider(p_line_id uuid)
returns public.ai_suggestion_episodes
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_episodes;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_episodes l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_ligne
  from public.ai_suggestion_episodes l
  where l.id = p_line_id
  for update;

  if v_ligne.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_editer_contenu(v_ligne.project_id), false) then
    raise exception 'Épisode proposé introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_ligne;
end;
$$;

revoke all on function public.episode_a_decider(uuid) from public, anon, authenticated;

-- Accepte une ligne : l'épisode entre dans la saison, sous le numéro qui suit
-- le plus grand, tel que proposé ou tel que l'équipe l'a corrigé. `p_corrige`,
-- s'il est donné, porte le titre et le résumé, pris tels quels — un résumé
-- peut y être vide, comme dans la saisie. Aucun épisode existant n'est touché.
create or replace function public.accepter_episode_propose(
  p_line_id uuid,
  p_corrige jsonb default null
)
returns public.ai_suggestion_episodes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_episodes;
  v_retenu jsonb;
  v_cree uuid;
  v_numero integer;
begin
  v_ligne := public.episode_a_decider(p_line_id);

  if v_ligne.state = 'accepted' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cet épisode a déjà été écarté.' using errcode = 'PR001';
  end if;

  v_retenu := coalesce(
    p_corrige,
    jsonb_build_object('title', v_ligne.title, 'summary', v_ligne.summary)
  );

  if jsonb_typeof(v_retenu) <> 'object'
     or not coalesce(
       jsonb_typeof(v_retenu -> 'title') = 'string'
       and char_length(btrim(v_retenu ->> 'title')) between 1 and 200
       and (v_retenu ->> 'title') !~ '[[:cntrl:]]'
       and jsonb_typeof(v_retenu -> 'summary') = 'string'
       and char_length(v_retenu ->> 'summary') <= 2000,
       false
     ) then
    raise exception 'Épisode invalide : titre ou résumé.' using errcode = '22023';
  end if;

  -- Deux propositions d'un même projet se décident sous des verrous
  -- distincts : celui du projet les met en file, pour que deux épisodes
  -- acceptés ensemble ne visent pas le même numéro.
  perform 1 from public.projects p where p.id = v_ligne.project_id for update;

  select coalesce(max(e.number), 0) + 1 into v_numero
  from public.project_episodes e
  where e.project_id = v_ligne.project_id;

  if v_numero > 500 then
    raise exception 'Cette série a atteint son dernier numéro d''épisode : aucun autre ne peut y être ajouté.'
      using errcode = 'PR003';
  end if;

  -- Les contraintes et le déclencheur de `project_episodes` bornent ce qui
  -- est retenu : un projet qui n'est plus une série n'en reçoit pas.
  insert into public.project_episodes (project_id, number, title, summary, created_by)
  values (
    v_ligne.project_id,
    v_numero,
    btrim(v_retenu ->> 'title'),
    v_retenu ->> 'summary',
    (select auth.uid())
  )
  returning id into v_cree;

  update public.ai_suggestion_episodes
  set state = 'accepted', episode_id = v_cree,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_episodes(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.accepter_episode_propose(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.accepter_episode_propose(uuid, jsonb) to authenticated;

-- Écarte une ligne : rien n'entre dans la saison.
create or replace function public.ecarter_episode_propose(p_line_id uuid)
returns public.ai_suggestion_episodes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_episodes;
begin
  v_ligne := public.episode_a_decider(p_line_id);

  if v_ligne.state = 'dismissed' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cet épisode a déjà été accepté.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_episodes
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_episodes(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.ecarter_episode_propose(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_episode_propose(uuid) to authenticated;
