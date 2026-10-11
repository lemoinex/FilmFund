-- ARC : fiche d'un personnage proposée (lot PF3a).
--
-- Décidé par l'utilisateur le 11 octobre 2026. L'assistant complète la fiche
-- détaillée d'**un personnage existant**, désigné par la demande, sur le
-- modèle des propositions structurées : une proposition parente dans
-- `ai_suggestions`, ses lignes dans une table fille, acceptées ou écartées
-- une à une. Ici, une ligne est **un champ** de la fiche.
--
-- Ce que cette migration ouvre :
--   1. la colonne `character_sheet` du barème, à 2 unités, et ses droits ;
--   2. l'action `character_sheet` aux devis, avec son personnage désigné ;
--   3. la table `ai_suggestion_character_fields`, ses politiques, ses garde-fous ;
--   4. le contexte, le dépôt, l'acceptation et l'écart d'un champ proposé.
--
-- Quatre règles, tenues par la base quel que soit le chemin :
--   - **ARC ne propose que pour les champs vides.** Un champ déjà rempli n'est
--     ni demandé, ni déposé, ni écrasé : à l'acceptation, le champ doit être
--     encore vide, sinon rien n'est écrit (`PF002`) ;
--   - **aucune fiche pour un documentaire** : ses personnages sont des
--     personnes réelles. Le devis est refusé, avant toute dépense ;
--   - le personnage est celui du projet, relu au devis, au contexte, au dépôt
--     et à l'acceptation. Retiré entre-temps : rien n'est écrit (`PF001`) ;
--   - un devis est refusé quand la fiche n'a plus aucun champ vide.
--
-- Ce qu'ARC lit : le projet, son concept, sa vision, tous les personnages
-- avec leurs fiches, le personnage à compléter, ses champs vides, et les
-- scénarios enregistrés — sans épisode d'abord, puis par numéro d'épisode —,
-- deux cent mille caractères au plus en tout, la borne du découpage. Au-delà,
-- le texte est coupé et le contexte le dit. Ni budget, ni équipe, ni identité.
--
-- Prix fixé le 11 octobre 2026, l'utilisateur l'ayant laissé à l'assistant :
-- 2 unités. Huit champs au plus par proposition : ceux de la fiche.
--
-- Les champs proposés suivent les droits des personnages : lus de toute
-- l'équipe, décidés par qui les écrit (`peut_editer_contenu`).
--
-- Retour arrière — aucune fiche saisie n'est perdue :
--   `drop table public.ai_suggestion_character_fields` ; retirer de
--   `ecarter_lignes_restantes` la mise à jour de cette table, et de
--   `creer_devis` le cas `character_sheet` ; supprimer les fonctions de ce
--   fichier ; retirer `character_sheet` de `devis_action_connue`, puis
--   `alter table public.text_unit_rate_versions drop column character_sheet`.
--   Les champs déjà acceptés restent dans les fiches.

-- ---------------------------------------------------------------------------
-- Barème : le prix d'une fiche de personnage
-- ---------------------------------------------------------------------------

-- Le défaut remplit les versions déjà publiées, puis il est retiré : une
-- version publiée ensuite doit dire sa valeur.
alter table public.text_unit_rate_versions
  add column character_sheet integer not null default 2;

alter table public.text_unit_rate_versions
  alter column character_sheet drop default,
  add constraint bareme_fiche_personnage_positive check (character_sheet >= 0);

comment on column public.text_unit_rate_versions.character_sheet is
  'Unités texte de la fiche d''un personnage proposée (agent ARC).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun.
grant insert (character_sheet) on table public.text_unit_rate_versions to authenticated;
grant select (character_sheet) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action character_sheet
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
      'character_sheet',
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

-- Les champs de la fiche détaillée : le nom que lit un agent, la colonne, la
-- borne de la base, et s'il tient sur une ligne. Une seule liste pour le
-- devis, le contexte, le dépôt et l'acceptation.
create function public.champs_fiche_personnage()
returns table (rang integer, champ text, colonne text, borne integer, ligne boolean)
language sql
immutable
set search_path = pg_catalog, public
as $$
  values
    (1, 'age', 'age', 60, true),
    (2, 'occupation', 'occupation', 160, true),
    (3, 'apparence', 'appearance', 600, false),
    (4, 'objectif', 'goal', 600, false),
    (5, 'obstacle', 'obstacle', 600, false),
    (6, 'arc', 'arc', 800, false),
    (7, 'traits', 'traits', 600, false),
    (8, 'liens', 'relations', 600, false);
$$;

-- Les champs encore vides d'un personnage, dans l'ordre de la fiche.
create function public.champs_vides_personnage(p_personnage public.project_characters)
returns text[]
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(f.champ order by f.rang), '{}')
  from public.champs_fiche_personnage() f
  where btrim(coalesce(to_jsonb(p_personnage) ->> f.colonne, '')) = '';
$$;

-- Le personnage que désigne une demande, s'il est bien de ce projet ; une
-- ligne nulle sinon. La demande le désigne, elle ne le transporte pas.
create function public.personnage_a_completer(p_project_id uuid, p_params jsonb)
returns public.project_characters
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_designe text := p_params ->> 'character';
  v_personnage public.project_characters;
begin
  if v_designe is null
     or v_designe !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_personnage;
  end if;

  select c.* into v_personnage
  from public.project_characters c
  where c.id = v_designe::uuid and c.project_id = p_project_id;

  return v_personnage;
end;
$$;

-- Internes : le devis et les fonctions du lot les appellent sous les droits
-- de leur propriétaire.
revoke all on function public.champs_fiche_personnage() from public, anon, authenticated;
revoke all on function public.champs_vides_personnage(public.project_characters)
  from public, anon, authenticated;
revoke all on function public.personnage_a_completer(uuid, jsonb)
  from public, anon, authenticated;

-- `creer_devis` sert tous les livrables : seul son cas nouveau est écrit, dans
-- sa définition en place, juste avant celui des épisodes. La migration
-- s'arrête si ce repère ne s'y trouve pas exactement une fois.
do $$
declare
  v_definition text;
  v_repere text := E'    when ''episode_list'' then\n';
  v_cas text := $cas$    when 'character_sheet' then
      -- La fiche d'un personnage désigné. Refusé ici, avant toute réservation,
      -- quand rien de ce qui serait proposé ne pourrait être accepté.
      if exists (
        select 1 from public.projects p
        where p.id = p_project_id and p.format = 'documentaire'
      ) then
        raise exception 'La fiche d''un personnage ne se propose pas pour un documentaire : ses personnages sont des personnes réelles.'
          using errcode = '55000';
      end if;
      if (public.personnage_a_completer(p_project_id, v_parametres)).id is null then
        raise exception 'Désignez le personnage à compléter : il doit être de ce projet.'
          using errcode = '22023';
      end if;
      if cardinality(
        public.champs_vides_personnage(public.personnage_a_completer(p_project_id, v_parametres))
      ) = 0 then
        raise exception 'La fiche de ce personnage est déjà complète : il ne reste aucun champ à proposer.'
          using errcode = '55000';
      end if;
      v_quantite := v_bareme.character_sheet;
$cas$;
begin
  v_definition := pg_get_functiondef('public.creer_devis(uuid, text, jsonb)'::regprocedure);
  if (length(v_definition) - length(replace(v_definition, v_repere, ''))) <> length(v_repere) then
    raise exception 'Le cas des épisodes est introuvable ou en double dans creer_devis.';
  end if;
  execute replace(v_definition, v_repere, v_cas || v_repere);
end;
$$;

-- ---------------------------------------------------------------------------
-- Champs proposés
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_character_fields (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Le personnage à compléter. Retiré de la liste, le lien se vide : plus
  -- rien de cette proposition ne peut être accepté.
  character_id uuid references public.project_characters (id) on delete set null,
  position integer not null,
  field text not null,
  value text not null,
  state text not null default 'proposed',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint champ_propose_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint champ_propose_connu check (
    field in ('age', 'occupation', 'apparence', 'objectif', 'obstacle', 'arc', 'traits', 'liens')
  ),
  constraint champ_propose_valeur check (char_length(value) between 1 and 800),
  constraint champ_propose_decision check ((state = 'proposed') = (decided_at is null)),
  constraint champ_propose_rang unique (suggestion_id, position),
  -- Un champ, une proposition : l'assistant ne se contredit pas.
  constraint champ_propose_unique unique (suggestion_id, field)
);

comment on table public.ai_suggestion_character_fields is
  'Champ de la fiche d''un personnage proposé par un agent : jamais appliqué de lui-même. Accepté ou écarté un à un par qui écrit les personnages, et seulement si le champ est encore vide.';

create index ai_suggestion_character_fields_projet_idx
  on public.ai_suggestion_character_fields (project_id, state);
create index ai_suggestion_character_fields_character_id_idx
  on public.ai_suggestion_character_fields (character_id);

alter table public.ai_suggestion_character_fields enable row level security;

-- Les personnages se lisent de toute l'équipe : leurs propositions aussi.
create policy "L'équipe et les administrateurs lisent ces propositions"
  on public.ai_suggestion_character_fields for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_character_fields
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_character_fields from anon, authenticated;
grant select on table public.ai_suggestion_character_fields to authenticated;

-- Une ligne proposée ne change que pour être acceptée ou écartée, une fois ;
-- ce que l'agent a proposé ne change jamais.
create or replace function public.controler_champ_propose()
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
    raise exception 'Un champ proposé ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.position, new.field, new.value,
      new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.project_id, old.position, old.field, old.value,
      old.created_at) then
    raise exception 'Ce qu''un agent a proposé ne change pas.' using errcode = '42501';
  end if;

  -- Le lien au personnage ne change que pour se vider, quand le personnage
  -- est retiré de la liste.
  if new.character_id is distinct from old.character_id then
    if pg_trigger_depth() > 1
       and new.character_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Un champ proposé ne change pas de personnage.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    raise exception 'Un champ déjà accepté ou écarté ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_champ_propose() from public, anon, authenticated;

create trigger ai_suggestion_character_fields_controle
  before update or delete on public.ai_suggestion_character_fields
  for each row
  execute function public.controler_champ_propose();

create trigger ai_suggestion_character_fields_pas_de_vidage
  before truncate on public.ai_suggestion_character_fields
  for each statement
  execute function public.registre_en_ajout_seul();

-- Écarter la proposition entière, c'est écarter ce qui restait à décider :
-- la fonction commune reçoit la table de plus, dans sa définition en place.
do $$
declare
  v_definition text;
  v_repere text := E'  return null;\n';
  v_ajout text := $ajout$
  update public.ai_suggestion_character_fields
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';
$ajout$;
begin
  v_definition := pg_get_functiondef('public.ecarter_lignes_restantes()'::regprocedure);
  if (length(v_definition) - length(replace(v_definition, v_repere, ''))) <> length(v_repere) then
    raise exception 'La fin de ecarter_lignes_restantes est introuvable ou en double.';
  end if;
  execute replace(v_definition, v_repere, v_ajout || v_repere);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce qu'ARC lit pour compléter une fiche. Null si l'essai n'est pas l'essai en
-- cours d'une tâche de fiche, ou si la demande ne tient plus : personnage
-- retiré, fiche complétée entre-temps, projet devenu documentaire. Rien ne
-- part alors chez le fournisseur.
create or replace function public.contexte_fiche_personnage(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_projet public.projects;
  v_personnage public.project_characters;
  v_vides text[];
  v_scenario text;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'character_sheet';

  if v_job.id is null then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  if v_projet.id is null or v_projet.format = 'documentaire' then
    return null;
  end if;

  v_personnage := public.personnage_a_completer(v_job.project_id, v_job.params);
  v_vides := public.champs_vides_personnage(v_personnage);
  if v_personnage.id is null or cardinality(v_vides) = 0 then
    return null;
  end if;

  -- Les scénarios enregistrés, bout à bout : sans épisode d'abord, puis par
  -- numéro d'épisode.
  select coalesce(
    string_agg(d.content, E'\n\n' order by e.number nulls first, d.updated_at desc, d.id),
    ''
  )
  into v_scenario
  from public.project_documents d
  left join public.project_episodes e on e.id = d.episode_id
  where d.project_id = v_projet.id and d.type = 'scenario' and btrim(d.content) <> '';

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
    -- Tous les personnages du projet, avec leurs fiches : cinquante au plus.
    'personnages', coalesce(
      (
        select jsonb_agg(
          public.personnage_pour_agent(t::public.project_characters)
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
    'personnage', public.personnage_pour_agent(v_personnage),
    'champs_vides', to_jsonb(v_vides),
    'scenario', left(v_scenario, 200000),
    'scenario_coupe', char_length(v_scenario) > 200000
  );
end;
$$;

revoke all on function public.contexte_fiche_personnage(uuid) from public, anon, authenticated;
grant execute on function public.contexte_fiche_personnage(uuid) to filmfund_worker;

-- Dépôt des champs proposés. Chacun est contrôlé ici, quoi qu'ait déjà
-- vérifié le worker. Un champ que l'équipe a rempli pendant l'appel n'est pas
-- déposé : il ne pourrait plus être accepté.
create or replace function public.livrer_proposition_fiche(p_attempt_id uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_charge public.provider_charges;
  v_personnage public.project_characters;
  v_vides text[];
  v_proposition uuid;
  v_nombre integer;
  v_ligne jsonb;
  v_rang bigint;
  v_champ text;
  v_valeur text;
  v_regle record;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'character_sheet' then
    raise exception 'Aucune fiche de personnage n''est prévue pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  v_personnage := public.personnage_a_completer(v_job.project_id, v_job.params);
  if v_personnage.id is null then
    raise exception 'Le personnage à compléter a été retiré du projet.' using errcode = 'PF001';
  end if;
  v_vides := public.champs_vides_personnage(v_personnage);

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Fiche invalide : une liste de champs est attendue.' using errcode = '22023';
  end if;
  v_nombre := jsonb_array_length(p_lines);
  if v_nombre not between 1 and 8 then
    raise exception 'Fiche invalide : de 1 à 8 champs attendus, % reçus.', v_nombre
      using errcode = '22023';
  end if;

  for v_ligne, v_rang in
    select t.ligne, t.rang
    from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang)
  loop
    if jsonb_typeof(v_ligne) <> 'object'
       or jsonb_typeof(v_ligne -> 'field') is distinct from 'string'
       or jsonb_typeof(v_ligne -> 'value') is distinct from 'string' then
      raise exception 'Champ % invalide : un nom de champ et un texte sont attendus.', v_rang
        using errcode = '22023';
    end if;
    v_champ := v_ligne ->> 'field';
    v_valeur := btrim(v_ligne ->> 'value');
    select f.* into v_regle from public.champs_fiche_personnage() f where f.champ = v_champ;
    if v_regle.champ is null
       or char_length(v_valeur) not between 1 and v_regle.borne
       or (v_regle.ligne and v_valeur ~ '[[:cntrl:]]')
       or regexp_replace(v_valeur, '[\n\r]', '', 'g') ~ '[[:cntrl:]]' then
      raise exception 'Champ % invalide : nom inconnu, texte vide, trop long ou non autorisé.', v_rang
        using errcode = '22023';
    end if;
  end loop;

  if (select count(distinct t.ligne ->> 'field') from jsonb_array_elements(p_lines) as t(ligne))
     <> v_nombre then
    raise exception 'Fiche invalide : un même champ est proposé deux fois.' using errcode = '22023';
  end if;

  -- Ne restent que les champs encore vides.
  select count(*) into v_nombre
  from jsonb_array_elements(p_lines) as t(ligne)
  where (t.ligne ->> 'field') = any (v_vides);
  if v_nombre = 0 then
    raise exception 'Fiche invalide : aucun des champs proposés n''est encore vide.'
      using errcode = '22023';
  end if;

  -- Le texte de la proposition est écrit ici, sans rien de ce que le modèle
  -- a produit.
  insert into public.ai_suggestions (
    job_id, studio_id, project_id, action, content, profile, model, created_by
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.action,
    case
      when v_nombre = 1 then '1 champ proposé par l''assistant pour la fiche d''un personnage.'
      else v_nombre || ' champs proposés par l''assistant pour la fiche d''un personnage.'
    end,
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  -- Dans l'ordre de la fiche, quel que soit celui de la réponse.
  insert into public.ai_suggestion_character_fields (
    suggestion_id, project_id, character_id, position, field, value
  )
  select
    v_proposition, v_job.project_id, v_personnage.id,
    (row_number() over (order by f.rang))::integer,
    f.champ,
    btrim(t.ligne ->> 'value')
  from jsonb_array_elements(p_lines) as t(ligne)
  join public.champs_fiche_personnage() f on f.champ = t.ligne ->> 'field'
  where f.champ = any (v_vides);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_fiche(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_fiche(uuid, jsonb) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe, champ par champ
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucun champ n'attend : appliquée si un au
-- moins a été accepté, écartée sinon. Interne.
create or replace function public.clore_proposition_fiche(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_character_fields l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_character_fields l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_fiche(uuid) from public, anon, authenticated;

-- Verrouille la proposition puis la ligne, toujours dans cet ordre, et rend
-- la ligne si l'appelant a le droit d'en décider : qui écrit les personnages.
-- Un seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.champ_a_decider(p_line_id uuid)
returns public.ai_suggestion_character_fields
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_character_fields;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_character_fields l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_ligne
  from public.ai_suggestion_character_fields l
  where l.id = p_line_id
  for update;

  if v_ligne.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_editer_contenu(v_ligne.project_id), false) then
    raise exception 'Champ proposé introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_ligne;
end;
$$;

revoke all on function public.champ_a_decider(uuid) from public, anon, authenticated;

-- Accepte un champ : il entre dans la fiche du personnage, tel que proposé ou
-- tel que l'équipe l'a corrigé — **seulement s'il y est encore vide**. Rempli
-- entre-temps, ou personnage retiré : rien n'est écrit, et la ligne reste à
-- décider.
create or replace function public.accepter_champ_propose(
  p_line_id uuid,
  p_corrige text default null
)
returns public.ai_suggestion_character_fields
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_character_fields;
  v_regle record;
  v_personnage public.project_characters;
  v_retenu text;
begin
  v_ligne := public.champ_a_decider(p_line_id);

  if v_ligne.state = 'accepted' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Ce champ a déjà été écarté.' using errcode = 'PR001';
  end if;

  select f.* into v_regle from public.champs_fiche_personnage() f where f.champ = v_ligne.field;

  v_retenu := btrim(coalesce(p_corrige, v_ligne.value));
  if char_length(v_retenu) not between 1 and v_regle.borne
     or (v_regle.ligne and v_retenu ~ '[[:cntrl:]]')
     or regexp_replace(v_retenu, '[\n\r]', '', 'g') ~ '[[:cntrl:]]' then
    raise exception 'Texte invalide pour ce champ : vide, trop long ou non autorisé.'
      using errcode = '22023';
  end if;

  -- Le personnage est verrouillé : deux champs d'une même fiche, ou une
  -- saisie de l'équipe, ne se croisent pas.
  select c.* into v_personnage
  from public.project_characters c
  where c.id = v_ligne.character_id and c.project_id = v_ligne.project_id
  for update;

  if v_personnage.id is null then
    raise exception 'Ce personnage a été retiré du projet : sa fiche ne peut plus être complétée.'
      using errcode = 'PF001';
  end if;

  if not (v_ligne.field = any (public.champs_vides_personnage(v_personnage))) then
    raise exception 'Ce champ a été rempli depuis la demande : rien n''a été remplacé.'
      using errcode = 'PF002';
  end if;

  -- Les contraintes de `project_characters` bornent ce qui est retenu.
  execute format(
    'update public.project_characters set %I = $1 where id = $2',
    v_regle.colonne
  )
  using v_retenu, v_personnage.id;

  update public.ai_suggestion_character_fields
  set state = 'accepted', decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_fiche(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.accepter_champ_propose(uuid, text)
  from public, anon, authenticated;
grant execute on function public.accepter_champ_propose(uuid, text) to authenticated;

-- Écarte un champ : rien n'entre dans la fiche.
create or replace function public.ecarter_champ_propose(p_line_id uuid)
returns public.ai_suggestion_character_fields
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_character_fields;
begin
  v_ligne := public.champ_a_decider(p_line_id);

  if v_ligne.state = 'dismissed' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Ce champ a déjà été accepté.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_character_fields
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_fiche(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.ecarter_champ_propose(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_champ_propose(uuid) to authenticated;
