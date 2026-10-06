-- GEAR : propositions de matériel (lot J3c-3).
--
-- Quatrième livrable structuré, sur le modèle validé en recette avec le
-- budget, le planning et le découpage (décision 9) : une proposition parente
-- dans `ai_suggestions`, ses lignes dans une table fille typée, acceptées ou
-- écartées une à une. Cahier des charges : docs/product/CDC_FRAME_GEAR.md.
--
-- Ce que cette migration ouvre :
--   1. la colonne `gear_list` du barème, à 5 unités, et ses droits ;
--   2. l'action `gear_list` aux devis ;
--   3. la table `ai_suggestion_gear`, ses politiques, ses garde-fous ;
--   4. le contexte, le dépôt, l'acceptation et l'écart d'une ligne proposée.
--
-- Ce qui distingue le matériel du découpage :
--   - une demande vise le projet entier ;
--   - GEAR lit le storyboard, le découpage et le matériel déjà saisi, avec le
--     concept du projet. Ni scénario, ni budget, ni équipe ;
--   - il ne rend aucun calcul : la base n'a ni total, ni intensité à déposer.
--     Une puissance proposée est un ordre de grandeur, que l'équipe vérifie ;
--     elle peut être absente.
--
-- Les lignes proposées suivent les droits du matériel : lues de toute
-- l'équipe, décidées par qui l'écrit (`peut_editer_contenu`).
--
-- Retour arrière — aucun équipement du projet n'est perdu :
--   `drop table public.ai_suggestion_gear` ; rétablir
--   `ecarter_lignes_restantes` et `creer_devis` de la migration
--   20261006010000_frame_decoupage ; retirer `gear_list` de
--   `devis_action_connue`, puis
--   `alter table public.text_unit_rate_versions drop column gear_list` en
--   reprenant la contrainte `bareme_poids_positifs`. Les équipements déjà
--   acceptés restent au matériel.

-- ---------------------------------------------------------------------------
-- Barème : le prix d'une liste de matériel
-- ---------------------------------------------------------------------------

alter table public.text_unit_rate_versions
  add column gear_list integer not null default 5;

alter table public.text_unit_rate_versions
  alter column gear_list drop default;

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
    and gear_list >= 0
    and treatment >= 0
    and bible >= 0
    and screenplay_per_sequence >= 0
    and dialogue_per_scene >= 0
  );

comment on column public.text_unit_rate_versions.gear_list is
  'Unités texte d''une proposition de liste de matériel (agent GEAR).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun. Sans ces deux lignes, l'administration ne
-- publierait plus de version, et la vitrine perdrait ses chiffres.
grant insert (gear_list) on table public.text_unit_rate_versions to authenticated;
grant select (gear_list) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action gear_list
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
      'gear_list',
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

-- Reprise de la migration frame_decoupage, avec un seul ajout : la liste de
-- matériel, au prix du barème.
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
-- Lignes de matériel proposées
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_gear (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null,
  category public.gear_category not null,
  label text not null,
  quantity integer not null,
  -- Ordre de grandeur avancé par l'agent, sans fiche technique ; nulle s'il
  -- ne s'avance pas.
  unit_power_watts integer,
  simultaneous boolean not null,
  state text not null default 'proposed',
  -- Équipement né de l'acceptation. Si l'équipe le supprime ensuite, la
  -- proposition reste acceptée : elle dit ce qui a été décidé, pas ce que la
  -- liste contient aujourd'hui.
  gear_id uuid references public.project_gear (id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint materiel_propose_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint materiel_propose_designation check (
    char_length(btrim(label)) between 1 and 200 and label !~ '[[:cntrl:]]'
  ),
  constraint materiel_propose_quantite check (quantity between 1 and 1000),
  constraint materiel_propose_puissance check (unit_power_watts between 0 and 1000000),
  constraint materiel_propose_decision check ((state = 'proposed') = (decided_at is null)),
  constraint materiel_propose_rang unique (suggestion_id, position)
);

comment on table public.ai_suggestion_gear is
  'Équipement proposé par un agent : jamais appliqué de lui-même. Accepté ou écarté un à un par qui écrit le matériel.';

create index ai_suggestion_gear_projet_idx
  on public.ai_suggestion_gear (project_id, state);

alter table public.ai_suggestion_gear enable row level security;

-- Le matériel se lit de toute l'équipe : ses propositions aussi.
create policy "L'équipe et les administrateurs lisent le matériel proposé"
  on public.ai_suggestion_gear for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_gear
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_gear from anon, authenticated;
grant select on table public.ai_suggestion_gear to authenticated;

-- Une ligne proposée ne change que pour être acceptée ou écartée, une fois ;
-- ce que l'agent a proposé ne change jamais.
create or replace function public.controler_materiel_propose()
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
    raise exception 'Un équipement proposé ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.position, new.category, new.label,
      new.quantity, new.unit_power_watts, new.simultaneous, new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.project_id, old.position, old.category, old.label,
      old.quantity, old.unit_power_watts, old.simultaneous, old.created_at) then
    raise exception 'Ce qu''un agent a proposé ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    -- Seul le détachement d'un équipement supprimé de la liste passe encore.
    if pg_trigger_depth() > 1
       and new.gear_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Un équipement déjà accepté ou écarté ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_materiel_propose() from public, anon, authenticated;

create trigger ai_suggestion_gear_controle
  before update or delete on public.ai_suggestion_gear
  for each row
  execute function public.controler_materiel_propose();

create trigger ai_suggestion_gear_pas_de_vidage
  before truncate on public.ai_suggestion_gear
  for each statement
  execute function public.registre_en_ajout_seul();

-- Reprise de la migration frame_decoupage, pour les quatre tables filles :
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

  update public.ai_suggestion_gear
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce que GEAR lit pour proposer du matériel : le projet et son concept, les
-- scènes du storyboard, le découpage, et le matériel déjà saisi — pour ne pas
-- le redire. Ni scénario, ni budget, ni équipe, ni identité. Null si l'essai
-- n'est pas l'essai en cours d'une tâche de matériel.
create or replace function public.contexte_materiel(p_attempt_id uuid)
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
    and j.action = 'gear_list';

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
    -- Les cent premières scènes, dans l'ordre du film : décors et moments
    -- disent la lumière et le son à prévoir.
    'scenes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'titre', t.title, 'decor', t.setting, 'lieu', t.location, 'moment', t.time_of_day
          )
          order by t.position
        )
        from (
          select s.* from public.storyboard_scenes s
          where s.project_id = v_projet.id
          order by s.position
          limit 100
        ) t
      ),
      '[]'::jsonb
    ),
    -- Le découpage, borné : cadrages, mouvements et focales disent la
    -- machinerie et les optiques, sans les descriptions.
    'plans', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cadrage', t.shot, 'mouvement', t.movement, 'angle', t.angle, 'focale', t.focal_mm
          )
        )
        from (
          select p.* from public.scene_shots p
          where p.project_id = v_projet.id
          order by p.created_at, p.id
          limit 300
        ) t
      ),
      '[]'::jsonb
    ),
    'materiel', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'categorie', t.category, 'designation', t.label, 'quantite', t.quantity
          )
          order by t.created_at, t.id
        )
        from (
          select g.* from public.project_gear g
          where g.project_id = v_projet.id
          order by g.created_at, g.id
          limit 300
        ) t
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.contexte_materiel(uuid) from public, anon, authenticated;
grant execute on function public.contexte_materiel(uuid) to filmfund_worker;

-- Dépôt des lignes proposées. Chacune est contrôlée ici, quoi qu'ait déjà
-- vérifié le worker : la base ne se fie pas à ce qu'on lui remet.
create or replace function public.livrer_proposition_materiel(p_attempt_id uuid, p_lines jsonb)
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
  v_designation text;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'gear_list' then
    raise exception 'Aucun équipement n''est prévu pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Matériel invalide : une liste est attendue.' using errcode = '22023';
  end if;
  v_nombre := jsonb_array_length(p_lines);
  if v_nombre not between 1 and 30 then
    raise exception 'Matériel invalide : de 1 à 30 lignes attendues, % reçues.', v_nombre
      using errcode = '22023';
  end if;

  for v_ligne, v_rang in
    select t.ligne, t.rang
    from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang)
  loop
    if jsonb_typeof(v_ligne) <> 'object' then
      raise exception 'Ligne % invalide : un objet est attendu.', v_rang using errcode = '22023';
    end if;
    v_designation := btrim(coalesce(v_ligne ->> 'label', ''));
    if not coalesce(
         (v_ligne ->> 'category') in ('image', 'lumiere', 'son', 'machinerie', 'energie', 'regie'),
         false
       )
       or char_length(v_designation) not between 1 and 200
       or v_designation ~ '[[:cntrl:]]'
       or jsonb_typeof(v_ligne -> 'simultaneous') is distinct from 'boolean'
       or jsonb_typeof(v_ligne -> 'quantity') is distinct from 'number'
       or (v_ligne ->> 'quantity')::numeric <> trunc((v_ligne ->> 'quantity')::numeric)
       or not (v_ligne ->> 'quantity')::numeric between 1 and 1000 then
      raise exception 'Ligne % invalide : catégorie, désignation, quantité ou simultanéité.', v_rang
        using errcode = '22023';
    end if;
    -- La puissance est facultative : absente ou nulle, sinon entière et dans
    -- ses bornes.
    if coalesce(jsonb_typeof(v_ligne -> 'unit_power_watts'), 'null') <> 'null'
       and (
         jsonb_typeof(v_ligne -> 'unit_power_watts') <> 'number'
         or (v_ligne ->> 'unit_power_watts')::numeric
              <> trunc((v_ligne ->> 'unit_power_watts')::numeric)
         or not (v_ligne ->> 'unit_power_watts')::numeric between 0 and 1000000
       ) then
      raise exception 'Ligne % invalide : puissance.', v_rang using errcode = '22023';
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
      when v_nombre = 1 then '1 équipement proposé par l''assistant.'
      else v_nombre || ' équipements proposés par l''assistant.'
    end,
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  insert into public.ai_suggestion_gear (
    suggestion_id, project_id, position, category, label, quantity, unit_power_watts,
    simultaneous
  )
  select
    v_proposition, v_job.project_id, t.rang::integer,
    (t.ligne ->> 'category')::public.gear_category,
    btrim(t.ligne ->> 'label'),
    (t.ligne ->> 'quantity')::numeric::integer,
    (t.ligne ->> 'unit_power_watts')::numeric::integer,
    (t.ligne ->> 'simultaneous')::boolean
  from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_materiel(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_materiel(uuid, jsonb) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe, ligne par ligne
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucune ligne n'attend : appliquée si une
-- ligne au moins a été acceptée, écartée sinon. Interne.
create or replace function public.clore_proposition_materiel(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_gear l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_gear l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_materiel(uuid) from public, anon, authenticated;

-- Verrouille la proposition puis la ligne, toujours dans cet ordre, et rend
-- la ligne si l'appelant a le droit d'en décider : qui écrit le matériel. Un
-- seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.materiel_a_decider(p_line_id uuid)
returns public.ai_suggestion_gear
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_gear;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_gear l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_ligne
  from public.ai_suggestion_gear l
  where l.id = p_line_id
  for update;

  if v_ligne.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_editer_contenu(v_ligne.project_id), false) then
    raise exception 'Équipement proposé introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_ligne;
end;
$$;

revoke all on function public.materiel_a_decider(uuid) from public, anon, authenticated;

-- Accepte une ligne : l'équipement entre au matériel, tel que proposé ou tel
-- que l'équipe l'a corrigé. `p_corrige`, s'il est donné, porte les cinq
-- champs de la ligne, pris tels quels — une puissance inconnue s'y dit par
-- null.
create or replace function public.accepter_materiel_propose(
  p_line_id uuid,
  p_corrige jsonb default null
)
returns public.ai_suggestion_gear
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_gear;
  v_retenu jsonb;
  v_cree uuid;
begin
  v_ligne := public.materiel_a_decider(p_line_id);

  if v_ligne.state = 'accepted' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cet équipement a déjà été écarté.' using errcode = 'PR001';
  end if;

  v_retenu := coalesce(
    p_corrige,
    jsonb_build_object(
      'category', v_ligne.category, 'label', v_ligne.label, 'quantity', v_ligne.quantity,
      'unit_power_watts', v_ligne.unit_power_watts, 'simultaneous', v_ligne.simultaneous
    )
  );

  if jsonb_typeof(v_retenu) <> 'object'
     or not coalesce(
       (v_retenu ->> 'category') in ('image', 'lumiere', 'son', 'machinerie', 'energie', 'regie')
       and jsonb_typeof(v_retenu -> 'label') = 'string'
       and char_length(btrim(v_retenu ->> 'label')) between 1 and 200
       and (v_retenu ->> 'label') !~ '[[:cntrl:]]'
       and jsonb_typeof(v_retenu -> 'simultaneous') = 'boolean'
       and jsonb_typeof(v_retenu -> 'quantity') = 'number'
       and (v_retenu ->> 'quantity')::numeric = trunc((v_retenu ->> 'quantity')::numeric)
       and (v_retenu ->> 'quantity')::numeric between 1 and 1000,
       false
     ) then
    raise exception 'Équipement invalide : catégorie, désignation, quantité ou simultanéité.'
      using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(v_retenu -> 'unit_power_watts'), 'null') <> 'null'
     and (
       jsonb_typeof(v_retenu -> 'unit_power_watts') <> 'number'
       or (v_retenu ->> 'unit_power_watts')::numeric
            <> trunc((v_retenu ->> 'unit_power_watts')::numeric)
       or not (v_retenu ->> 'unit_power_watts')::numeric between 0 and 1000000
     ) then
    raise exception 'Équipement invalide : puissance.' using errcode = '22023';
  end if;

  -- Les contraintes de `project_gear` bornent ce qui est retenu.
  insert into public.project_gear (
    project_id, category, label, quantity, unit_power_watts, simultaneous, created_by
  )
  values (
    v_ligne.project_id,
    (v_retenu ->> 'category')::public.gear_category,
    btrim(v_retenu ->> 'label'),
    (v_retenu ->> 'quantity')::numeric::integer,
    (v_retenu ->> 'unit_power_watts')::numeric::integer,
    (v_retenu ->> 'simultaneous')::boolean,
    (select auth.uid())
  )
  returning id into v_cree;

  update public.ai_suggestion_gear
  set state = 'accepted', gear_id = v_cree,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_materiel(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.accepter_materiel_propose(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.accepter_materiel_propose(uuid, jsonb) to authenticated;

-- Écarte une ligne : rien n'entre au matériel.
create or replace function public.ecarter_materiel_propose(p_line_id uuid)
returns public.ai_suggestion_gear
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_gear;
begin
  v_ligne := public.materiel_a_decider(p_line_id);

  if v_ligne.state = 'dismissed' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cet équipement a déjà été accepté.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_gear
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_materiel(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.ecarter_materiel_propose(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_materiel_propose(uuid) to authenticated;
