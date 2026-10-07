-- ARC : personnages proposés (lot X2a).
--
-- Cinquième livrable structuré, sur le modèle validé en recette avec le
-- budget, le planning, le découpage et le matériel (décision 9) : une
-- proposition parente dans `ai_suggestions`, ses lignes dans une table fille
-- typée, acceptées ou écartées une à une.
--
-- Ce que cette migration ouvre :
--   1. la colonne `character_list` du barème, à 3 unités, et ses droits ;
--   2. l'action `character_list` aux devis ;
--   3. la table `ai_suggestion_characters`, ses politiques, ses garde-fous ;
--   4. le contexte, le dépôt, l'acceptation et l'écart d'un personnage proposé.
--
-- Ce qui distingue les personnages du matériel :
--   - ARC lit le projet, son concept, sa vision et les personnages déjà
--     saisis — pour ne pas les redire. Ni scénario, ni document, ni budget,
--     ni équipe ;
--   - il ne propose que des personnages à ajouter : aucun chemin ne réécrit
--     un personnage existant ;
--   - un projet porte cinquante personnages au plus. L'écran le contrôlait
--     seul ; l'acceptation le contrôle ici, et un devis est refusé quand la
--     liste est déjà pleine, avant toute dépense.
--
-- Prix décidé avec l'utilisateur le 7 octobre 2026 : 3 unités, comme un
-- planning prévisionnel. Douze personnages au plus par proposition.
--
-- Les personnages proposés suivent les droits des personnages : lus de toute
-- l'équipe, décidés par qui les écrit (`peut_editer_contenu`).
--
-- Retour arrière — aucun personnage du projet n'est perdu :
--   `drop table public.ai_suggestion_characters` ; rétablir
--   `ecarter_lignes_restantes` de la migration 20261007120000_match_veille et
--   `creer_devis` de 20261007210000_weaver_realisation_pitch ; retirer
--   `character_list` de `devis_action_connue`, puis
--   `alter table public.text_unit_rate_versions drop column character_list`
--   en reprenant la contrainte `bareme_poids_positifs`. Les personnages déjà
--   acceptés restent au projet.

-- ---------------------------------------------------------------------------
-- Barème : le prix d'une liste de personnages
-- ---------------------------------------------------------------------------

-- Le défaut remplit les versions déjà publiées, puis il est retiré : une
-- version publiée ensuite doit dire sa valeur.
alter table public.text_unit_rate_versions
  add column character_list integer not null default 3;

alter table public.text_unit_rate_versions
  alter column character_list drop default;

-- Reprise de la contrainte de la migration weaver_realisation_pitch, avec
-- une colonne de plus.
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
  );

comment on column public.text_unit_rate_versions.character_list is
  'Unités texte d''une liste de personnages proposés (agent ARC).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun.
grant insert (character_list) on table public.text_unit_rate_versions to authenticated;
grant select (character_list) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action character_list
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
      'image',
      'storyboard_image',
      'pdf_export',
      'docx_export',
      'zip_export'
    )
  );

-- Même fonction qu'au lot X1, un cas de plus.
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
-- Personnages proposés
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_characters (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null,
  name text not null,
  role text not null,
  description text not null,
  state text not null default 'proposed',
  -- Personnage né de l'acceptation. Si l'équipe le supprime ensuite, la
  -- proposition reste acceptée : elle dit ce qui a été décidé, pas ce que la
  -- liste contient aujourd'hui.
  character_id uuid references public.project_characters (id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint personnage_propose_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint personnage_propose_nom check (
    char_length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'
  ),
  constraint personnage_propose_role check (role in ('principal', 'secondaire')),
  constraint personnage_propose_description check (char_length(description) between 1 and 2000),
  constraint personnage_propose_decision check ((state = 'proposed') = (decided_at is null)),
  constraint personnage_propose_rang unique (suggestion_id, position)
);

comment on table public.ai_suggestion_characters is
  'Personnage proposé par un agent : jamais appliqué de lui-même. Accepté ou écarté un à un par qui écrit les personnages.';

create index ai_suggestion_characters_projet_idx
  on public.ai_suggestion_characters (project_id, state);

alter table public.ai_suggestion_characters enable row level security;

-- Les personnages se lisent de toute l'équipe : leurs propositions aussi.
create policy "L'équipe et les administrateurs lisent ces propositions"
  on public.ai_suggestion_characters for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_characters
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_characters from anon, authenticated;
grant select on table public.ai_suggestion_characters to authenticated;

-- Une ligne proposée ne change que pour être acceptée ou écartée, une fois ;
-- ce que l'agent a proposé ne change jamais.
create or replace function public.controler_personnage_propose()
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
    raise exception 'Un personnage proposé ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.position, new.name, new.role,
      new.description, new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.project_id, old.position, old.name, old.role,
      old.description, old.created_at) then
    raise exception 'Ce qu''un agent a proposé ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    -- Seul le détachement d'un personnage supprimé de la liste passe encore.
    if pg_trigger_depth() > 1
       and new.character_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Un personnage déjà accepté ou écarté ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_personnage_propose() from public, anon, authenticated;

create trigger ai_suggestion_characters_controle
  before update or delete on public.ai_suggestion_characters
  for each row
  execute function public.controler_personnage_propose();

create trigger ai_suggestion_characters_pas_de_vidage
  before truncate on public.ai_suggestion_characters
  for each statement
  execute function public.registre_en_ajout_seul();

-- Reprise de la migration match_veille, pour les huit tables filles : écarter
-- la proposition entière, c'est écarter ce qui restait à décider.
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
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce qu'ARC lit pour proposer des personnages : le projet, son concept, sa
-- vision, et les personnages déjà saisis — pour ne pas les redire. Ni
-- scénario, ni document, ni budget, ni équipe, ni identité. Null si l'essai
-- n'est pas l'essai en cours d'une tâche de personnages.
create or replace function public.contexte_personnages(p_attempt_id uuid)
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
    and j.action = 'character_list';

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
    )
  );
end;
$$;

revoke all on function public.contexte_personnages(uuid) from public, anon, authenticated;
grant execute on function public.contexte_personnages(uuid) to filmfund_worker;

-- Dépôt des personnages proposés. Chacun est contrôlé ici, quoi qu'ait déjà
-- vérifié le worker : la base ne se fie pas à ce qu'on lui remet.
create or replace function public.livrer_proposition_personnages(p_attempt_id uuid, p_lines jsonb)
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
  v_nom text;
  v_description text;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'character_list' then
    raise exception 'Aucun personnage n''est prévu pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Personnages invalides : une liste est attendue.' using errcode = '22023';
  end if;
  v_nombre := jsonb_array_length(p_lines);
  if v_nombre not between 1 and 12 then
    raise exception 'Personnages invalides : de 1 à 12 attendus, % reçus.', v_nombre
      using errcode = '22023';
  end if;

  for v_ligne, v_rang in
    select t.ligne, t.rang
    from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang)
  loop
    if jsonb_typeof(v_ligne) <> 'object' then
      raise exception 'Personnage % invalide : un objet est attendu.', v_rang
        using errcode = '22023';
    end if;
    v_nom := btrim(coalesce(v_ligne ->> 'name', ''));
    v_description := btrim(coalesce(v_ligne ->> 'description', ''));
    if not coalesce((v_ligne ->> 'role') in ('principal', 'secondaire'), false)
       or jsonb_typeof(v_ligne -> 'name') is distinct from 'string'
       or char_length(v_nom) not between 1 and 120
       or v_nom ~ '[[:cntrl:]]'
       or jsonb_typeof(v_ligne -> 'description') is distinct from 'string'
       or char_length(v_description) not between 1 and 2000
       or regexp_replace(v_description, '[\n\r\t]', '', 'g') ~ '[[:cntrl:]]' then
      raise exception 'Personnage % invalide : nom, rôle ou description.', v_rang
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
      when v_nombre = 1 then '1 personnage proposé par l''assistant.'
      else v_nombre || ' personnages proposés par l''assistant.'
    end,
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  insert into public.ai_suggestion_characters (
    suggestion_id, project_id, position, name, role, description
  )
  select
    v_proposition, v_job.project_id, t.rang::integer,
    btrim(t.ligne ->> 'name'),
    t.ligne ->> 'role',
    btrim(t.ligne ->> 'description')
  from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_personnages(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_personnages(uuid, jsonb) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe, personnage par personnage
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucun personnage n'attend : appliquée si un
-- au moins a été accepté, écartée sinon. Interne.
create or replace function public.clore_proposition_personnages(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_characters l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_characters l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_personnages(uuid)
  from public, anon, authenticated;

-- Verrouille la proposition puis la ligne, toujours dans cet ordre, et rend
-- la ligne si l'appelant a le droit d'en décider : qui écrit les personnages.
-- Un seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.personnage_a_decider(p_line_id uuid)
returns public.ai_suggestion_characters
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_characters;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_characters l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_ligne
  from public.ai_suggestion_characters l
  where l.id = p_line_id
  for update;

  if v_ligne.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_editer_contenu(v_ligne.project_id), false) then
    raise exception 'Personnage proposé introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_ligne;
end;
$$;

revoke all on function public.personnage_a_decider(uuid) from public, anon, authenticated;

-- Accepte une ligne : le personnage entre au projet, à la fin de la liste, tel
-- que proposé ou tel que l'équipe l'a corrigé. `p_corrige`, s'il est donné,
-- porte les trois champs, pris tels quels — une description peut y être vide,
-- comme dans la saisie.
create or replace function public.accepter_personnage_propose(
  p_line_id uuid,
  p_corrige jsonb default null
)
returns public.ai_suggestion_characters
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_characters;
  v_retenu jsonb;
  v_cree uuid;
  v_nombre bigint;
  v_rang integer;
begin
  v_ligne := public.personnage_a_decider(p_line_id);

  if v_ligne.state = 'accepted' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Ce personnage a déjà été écarté.' using errcode = 'PR001';
  end if;

  v_retenu := coalesce(
    p_corrige,
    jsonb_build_object(
      'name', v_ligne.name, 'role', v_ligne.role, 'description', v_ligne.description
    )
  );

  if jsonb_typeof(v_retenu) <> 'object'
     or not coalesce(
       (v_retenu ->> 'role') in ('principal', 'secondaire')
       and jsonb_typeof(v_retenu -> 'name') = 'string'
       and char_length(btrim(v_retenu ->> 'name')) between 1 and 120
       and (v_retenu ->> 'name') !~ '[[:cntrl:]]'
       and jsonb_typeof(v_retenu -> 'description') = 'string'
       and char_length(v_retenu ->> 'description') <= 2000,
       false
     ) then
    raise exception 'Personnage invalide : nom, rôle ou description.' using errcode = '22023';
  end if;

  -- Deux propositions d'un même projet se décident sous des verrous
  -- distincts : celui du projet les met en file, pour que la liste ne dépasse
  -- pas sa borne.
  perform 1 from public.projects p where p.id = v_ligne.project_id for update;

  select count(*), coalesce(max(c.position), -1) + 1
  into v_nombre, v_rang
  from public.project_characters c
  where c.project_id = v_ligne.project_id;

  if v_nombre >= 50 then
    raise exception 'Ce projet compte déjà 50 personnages : aucun autre ne peut y être ajouté.'
      using errcode = 'PR003';
  end if;

  -- Les contraintes de `project_characters` bornent ce qui est retenu.
  insert into public.project_characters (
    project_id, name, role, description, position, created_by
  )
  values (
    v_ligne.project_id,
    btrim(v_retenu ->> 'name'),
    v_retenu ->> 'role',
    v_retenu ->> 'description',
    least(v_rang, 10000),
    (select auth.uid())
  )
  returning id into v_cree;

  update public.ai_suggestion_characters
  set state = 'accepted', character_id = v_cree,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_personnages(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.accepter_personnage_propose(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.accepter_personnage_propose(uuid, jsonb) to authenticated;

-- Écarte une ligne : rien n'entre au projet.
create or replace function public.ecarter_personnage_propose(p_line_id uuid)
returns public.ai_suggestion_characters
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_characters;
begin
  v_ligne := public.personnage_a_decider(p_line_id);

  if v_ligne.state = 'dismissed' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Ce personnage a déjà été accepté.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_characters
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_personnages(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.ecarter_personnage_propose(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_personnage_propose(uuid) to authenticated;
