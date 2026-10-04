-- FIELD : proposition de lignes de budget (lot J3b-1).
--
-- Premier agent dont la proposition n'est pas un texte. Décision 9, prise
-- avec l'utilisateur le 4 octobre 2026 : une proposition structurée garde
-- son parent dans `ai_suggestions` — tâche, coût, profil — et porte ses
-- données dans une table fille typée, chaque ligne ayant son propre état.
-- L'équipe accepte ou écarte ligne par ligne.
--
-- Ce que cette migration ouvre :
--   1. la colonne `budget_plan` du barème, à 6 unités, et ses droits ;
--   2. l'action `budget_plan` aux devis, refusée tant que le budget du
--      projet n'est pas ouvert ;
--   3. la table `ai_suggestion_budget_lines`, ses politiques, ses garde-fous ;
--   4. `contexte_budget` et `livrer_proposition_budget`, pour le worker ;
--   5. `accepter_ligne_budget` et `ecarter_ligne_budget`, pour l'équipe.
--
-- Cloisonnement : le budget ne se lit que du porteur, des éditeurs et des
-- administrateurs, alors que toute l'équipe lit les propositions. Les lignes
-- proposées suivent donc `peut_gerer_budget`, et le texte de la proposition
-- parente est écrit par la base — un nombre de lignes, aucun montant.
--
-- Les financements restent hors de FIELD : proposer un organisme ou un
-- montant de fonds, ce serait inventer une source. C'est le lot L (MATCH).
--
-- Retour arrière — aucune ligne de budget perdue :
--   supprimer les fonctions et les déclencheurs de cette migration, puis
--   `drop table public.ai_suggestion_budget_lines` ; rétablir `creer_devis`
--   de la migration 20261004102540_arc_analyse, retirer `budget_plan` de
--   `devis_action_connue`, puis
--   `alter table public.text_unit_rate_versions drop column budget_plan` en
--   reprenant la contrainte `bareme_poids_positifs`. Les lignes déjà
--   acceptées restent dans `budget_lines` : elles y sont des lignes comme
--   les autres. Les propositions parentes restent lisibles, sans leur détail.

-- ---------------------------------------------------------------------------
-- Barème : le prix d'une proposition de budget
-- ---------------------------------------------------------------------------

-- Même geste que pour l'analyse : le défaut remplit les versions déjà
-- publiées, puis il est retiré pour qu'une version publiée ensuite dise sa
-- valeur.
alter table public.text_unit_rate_versions
  add column budget_plan integer not null default 6;

alter table public.text_unit_rate_versions
  alter column budget_plan drop default;

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
    and treatment >= 0
    and bible >= 0
    and screenplay_per_sequence >= 0
    and dialogue_per_scene >= 0
  );

comment on column public.text_unit_rate_versions.budget_plan is
  'Unités texte d''une proposition de lignes de budget (agent FIELD).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun. Sans ces deux lignes, l'administration ne
-- publierait plus de version, et la vitrine perdrait ses chiffres.
grant insert (budget_plan) on table public.text_unit_rate_versions to authenticated;
grant select (budget_plan) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action budget_plan
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

-- Reprise de la migration arc_analyse, avec un seul ajout : la proposition
-- de budget, au prix du barème, et seulement si le budget est ouvert.
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
    when 'treatment' then v_quantite := v_bareme.treatment;
    when 'bible' then v_quantite := v_bareme.bible;
    when 'screenplay' then
      v_quantite := v_bareme.screenplay_per_sequence
        * public.parametre_entier(v_parametres, 'sequences', 500);
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
-- Lignes proposées
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_budget_lines (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null,
  category public.budget_category not null,
  label text not null,
  quantity numeric(12, 2) not null,
  unit_cost numeric(14, 2) not null,
  state text not null default 'proposed',
  -- Ligne de budget née de l'acceptation. Si l'équipe la supprime ensuite,
  -- la proposition reste acceptée : elle dit ce qui a été décidé, pas ce que
  -- le budget contient aujourd'hui.
  budget_line_id uuid references public.budget_lines (id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint ligne_proposee_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint ligne_proposee_label check (char_length(btrim(label)) between 1 and 200),
  constraint ligne_proposee_quantite check (quantity > 0),
  constraint ligne_proposee_cout check (unit_cost >= 0),
  constraint ligne_proposee_decision check ((state = 'proposed') = (decided_at is null)),
  constraint ligne_proposee_rang unique (suggestion_id, position)
);

comment on table public.ai_suggestion_budget_lines is
  'Ligne de budget proposée par un agent : jamais appliquée d''elle-même. Acceptée ou écartée une à une par qui gère le budget.';

create index ai_suggestion_budget_lines_projet_idx
  on public.ai_suggestion_budget_lines (project_id, state);

alter table public.ai_suggestion_budget_lines enable row level security;

-- Le budget ne se lit pas de toute l'équipe : ses propositions non plus.
create policy "Qui gère le budget lit les lignes proposées"
  on public.ai_suggestion_budget_lines for select
  to authenticated
  using (public.peut_gerer_budget(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_budget_lines
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_budget_lines from anon, authenticated;
grant select on table public.ai_suggestion_budget_lines to authenticated;

-- Une ligne proposée ne change que pour être acceptée ou écartée, une fois ;
-- ce que l'agent a proposé ne change jamais.
create or replace function public.controler_ligne_proposee()
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
    raise exception 'Une ligne proposée ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.position, new.category, new.label,
      new.quantity, new.unit_cost, new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.project_id, old.position, old.category, old.label,
      old.quantity, old.unit_cost, old.created_at) then
    raise exception 'Ce qu''un agent a proposé ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    -- Seul le détachement d'une ligne de budget supprimée passe encore.
    if pg_trigger_depth() > 1
       and new.budget_line_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Une ligne déjà acceptée ou écartée ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_ligne_proposee() from public, anon, authenticated;

create trigger ai_suggestion_budget_lines_controle
  before update or delete on public.ai_suggestion_budget_lines
  for each row
  execute function public.controler_ligne_proposee();

create trigger ai_suggestion_budget_lines_pas_de_vidage
  before truncate on public.ai_suggestion_budget_lines
  for each statement
  execute function public.registre_en_ajout_seul();

-- Écarter la proposition entière, c'est écarter ce qui restait à décider :
-- aucune ligne ne doit rester « proposée » sous une proposition close.
create or replace function public.ecarter_lignes_restantes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  update public.ai_suggestion_budget_lines
  set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at
  where suggestion_id = new.id and state = 'proposed';
  return null;
end;
$$;

revoke all on function public.ecarter_lignes_restantes() from public, anon, authenticated;

create trigger ai_suggestions_ecarte_les_lignes
  after update on public.ai_suggestions
  for each row
  when (old.state = 'proposed' and new.state = 'dismissed')
  execute function public.ecarter_lignes_restantes();

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce que FIELD lit pour proposer un budget : le projet, ce qu'il raconte,
-- le budget déjà saisi — pour ne pas le redire — et le planning. Ni
-- documents, ni équipe, ni identité. Null si l'essai n'est pas l'essai en
-- cours d'une tâche de budget, ou si le budget n'est pas ouvert.
create or replace function public.contexte_budget(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_projet public.projects;
  v_devise text;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'budget_plan';

  if v_job.id is null then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  select b.currency into v_devise
  from public.project_budgets b
  where b.project_id = v_job.project_id;
  if v_projet.id is null or v_devise is null then
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
    'budget', jsonb_build_object(
      'devise', v_devise,
      'lignes', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'categorie', l.category,
              'libelle', l.label,
              'quantite', l.quantity,
              'cout_unitaire', l.unit_cost
            )
            order by l.category, l.created_at, l.id
          )
          from public.budget_lines l
          where l.project_id = v_projet.id
        ),
        '[]'::jsonb
      )
    ),
    'planning', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'titre', m.title, 'phase', m.phase, 'debut', m.starts_on, 'echeance', m.due_on
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

revoke all on function public.contexte_budget(uuid) from public, anon, authenticated;
grant execute on function public.contexte_budget(uuid) to filmfund_worker;

-- Dépôt des lignes proposées. Chaque ligne est contrôlée ici, quoi qu'ait
-- déjà vérifié le worker : la base ne se fie pas à ce qu'on lui remet.
create or replace function public.livrer_proposition_budget(p_attempt_id uuid, p_lines jsonb)
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
  v_libelle text;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'budget_plan' then
    raise exception 'Aucune ligne de budget n''est prévue pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Lignes invalides : une liste est attendue.' using errcode = '22023';
  end if;
  v_nombre := jsonb_array_length(p_lines);
  if v_nombre not between 1 and 40 then
    raise exception 'Lignes invalides : de 1 à 40 lignes attendues, % reçues.', v_nombre
      using errcode = '22023';
  end if;

  for v_ligne, v_rang in
    select t.ligne, t.rang
    from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang)
  loop
    if jsonb_typeof(v_ligne) <> 'object' then
      raise exception 'Ligne % invalide : un objet est attendu.', v_rang using errcode = '22023';
    end if;
    v_libelle := btrim(coalesce(v_ligne ->> 'label', ''));
    if not coalesce(
         (v_ligne ->> 'category') = any (enum_range(null::public.budget_category)::text[]), false
       )
       or char_length(v_libelle) not between 1 and 200
       or v_libelle ~ '[[:cntrl:]]'
       or jsonb_typeof(v_ligne -> 'quantity') is distinct from 'number'
       or jsonb_typeof(v_ligne -> 'unit_cost') is distinct from 'number'
       or not coalesce((v_ligne ->> 'quantity')::numeric between 0.01 and 9999999999, false)
       or not coalesce((v_ligne ->> 'unit_cost')::numeric between 0 and 999999999999, false) then
      raise exception 'Ligne % invalide : catégorie, libellé, quantité ou coût unitaire.', v_rang
        using errcode = '22023';
    end if;
  end loop;

  -- Le texte de la proposition se lit de toute l'équipe, lecteurs compris :
  -- il est écrit ici, sans rien de ce que le modèle a produit, et ne porte
  -- aucun montant.
  insert into public.ai_suggestions (
    job_id, studio_id, project_id, action, content, profile, model, created_by
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.action,
    case
      when v_nombre = 1 then '1 ligne de budget proposée par l''assistant.'
      else v_nombre || ' lignes de budget proposées par l''assistant.'
    end,
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  insert into public.ai_suggestion_budget_lines (
    suggestion_id, project_id, position, category, label, quantity, unit_cost
  )
  select
    v_proposition, v_job.project_id, t.rang::integer,
    (t.ligne ->> 'category')::public.budget_category,
    btrim(t.ligne ->> 'label'),
    round((t.ligne ->> 'quantity')::numeric, 2),
    round((t.ligne ->> 'unit_cost')::numeric, 2)
  from jsonb_array_elements(p_lines) with ordinality as t(ligne, rang);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_budget(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_budget(uuid, jsonb) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe, ligne par ligne
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucune ligne n'attend : appliquée si une
-- ligne au moins a été acceptée, écartée sinon. Interne : appelée par les
-- deux fonctions de décision, jamais directement.
create or replace function public.clore_proposition_budget(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_budget_lines l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_budget_lines l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_budget(uuid) from public, anon, authenticated;

-- Verrouille la proposition puis la ligne, toujours dans cet ordre, et rend
-- la ligne si l'appelant a le droit d'en décider. Le verrou d'abord, le droit
-- ensuite, et un seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.ligne_budget_a_decider(p_line_id uuid)
returns public.ai_suggestion_budget_lines
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_budget_lines;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_budget_lines l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_ligne
  from public.ai_suggestion_budget_lines l
  where l.id = p_line_id
  for update;

  if v_ligne.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_gerer_budget(v_ligne.project_id), false) then
    raise exception 'Ligne proposée introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_ligne;
end;
$$;

revoke all on function public.ligne_budget_a_decider(uuid) from public, anon, authenticated;

-- Accepte une ligne : elle entre au budget, telle que proposée ou telle que
-- l'équipe l'a corrigée avant d'accepter. Ce que l'agent avait proposé reste
-- inscrit sur la ligne proposée ; ce qui a été retenu vit dans le budget.
create or replace function public.accepter_ligne_budget(
  p_line_id uuid,
  p_category text default null,
  p_label text default null,
  p_quantity numeric default null,
  p_unit_cost numeric default null
)
returns public.ai_suggestion_budget_lines
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_budget_lines;
  v_categorie text;
  v_creee uuid;
begin
  v_ligne := public.ligne_budget_a_decider(p_line_id);

  if v_ligne.state = 'accepted' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cette ligne a déjà été écartée.' using errcode = 'PR001';
  end if;

  v_categorie := coalesce(nullif(btrim(p_category), ''), v_ligne.category::text);
  if not (v_categorie = any (enum_range(null::public.budget_category)::text[])) then
    raise exception 'Catégorie de budget inconnue.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.project_budgets b where b.project_id = v_ligne.project_id
  ) then
    raise exception 'Le budget de ce projet n''est pas ouvert.' using errcode = '55000';
  end if;

  -- Les contraintes de `budget_lines` bornent ce qui est retenu : libellé,
  -- quantité strictement positive, coût unitaire positif ou nul.
  insert into public.budget_lines (project_id, category, label, quantity, unit_cost, created_by)
  values (
    v_ligne.project_id,
    v_categorie::public.budget_category,
    coalesce(nullif(btrim(p_label), ''), v_ligne.label),
    coalesce(p_quantity, v_ligne.quantity),
    coalesce(p_unit_cost, v_ligne.unit_cost),
    (select auth.uid())
  )
  returning id into v_creee;

  update public.ai_suggestion_budget_lines
  set state = 'accepted', budget_line_id = v_creee,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_budget(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.accepter_ligne_budget(uuid, text, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.accepter_ligne_budget(uuid, text, text, numeric, numeric)
  to authenticated;

-- Écarte une ligne : rien n'entre au budget.
create or replace function public.ecarter_ligne_budget(p_line_id uuid)
returns public.ai_suggestion_budget_lines
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_budget_lines;
begin
  v_ligne := public.ligne_budget_a_decider(p_line_id);

  if v_ligne.state = 'dismissed' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cette ligne a déjà été acceptée.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_budget_lines
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_budget(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.ecarter_ligne_budget(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_ligne_budget(uuid) to authenticated;
