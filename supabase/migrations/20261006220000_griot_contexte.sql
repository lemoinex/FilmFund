-- GRIOT : contexte historique et culturel (lot L3).
--
-- GRIOT reprend la mécanique de SCOUT, validée en recette le 6 octobre 2026 :
-- un moteur de recherche collecte, le modèle de texte synthétise sur les
-- seuls extraits rendus, et chaque source se retient ou s'écarte une à une.
-- Ce qui le distingue tient au worker, pas à la base : une collecte
-- restreinte à une liste fermée de sources savantes, et des consignes
-- d'historien. Décidé avec l'utilisateur le 6 octobre 2026.
--
-- Ce que cette migration ouvre, et rien d'autre :
--   1. la colonne `cultural_context` du barème, à 3 unités, et ses droits ;
--   2. l'action `cultural_context` aux devis, sur une question en clair ;
--   3. le contexte, la provision et le dépôt d'une recherche, ouverts aux
--      deux actions.
--
-- Aucune table nouvelle : les sources proposées, les sources retenues et le
-- registre des coûts sont ceux de SCOUT. Une source de GRIOT naît elle aussi
-- « non vérifiée » : la liste des sites admis dit où chercher, elle ne
-- valide rien.
--
-- Retour arrière — aucune source retenue n'est perdue :
--   rétablir `creer_devis`, `contexte_recherche`, `provisionner_recherche`,
--   `livrer_proposition_recherche` et `devis_action_connue` de la migration
--   20261006180000_scout_recherche ; puis
--   `alter table public.text_unit_rate_versions drop column cultural_context`
--   en reprenant la contrainte `bareme_poids_positifs`. Les propositions déjà
--   déposées sous cette action restent lisibles.

-- ---------------------------------------------------------------------------
-- Barème : le prix d'un contexte historique et culturel
-- ---------------------------------------------------------------------------

alter table public.text_unit_rate_versions
  add column cultural_context integer not null default 3;

alter table public.text_unit_rate_versions
  alter column cultural_context drop default;

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
    and research >= 0
    and cultural_context >= 0
    and treatment >= 0
    and bible >= 0
    and screenplay_per_sequence >= 0
    and dialogue_per_scene >= 0
  );

comment on column public.text_unit_rate_versions.cultural_context is
  'Unités texte d''un contexte historique et culturel sourcé (agent GRIOT).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun.
grant insert (cultural_context) on table public.text_unit_rate_versions to authenticated;
grant select (cultural_context) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action cultural_context
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

-- Reprise de la migration scout_recherche, avec un seul ajout : le contexte
-- historique et culturel, à son prix, sur la même question en clair.
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
-- Fonctions du worker : ouvertes aux deux actions
-- ---------------------------------------------------------------------------

-- Reprises de la migration scout_recherche, à l'identique : seule l'action
-- admise change. Leurs droits ne changent pas — `create or replace` les garde.
create or replace function public.contexte_recherche(p_attempt_id uuid)
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
    and j.action in ('research', 'cultural_context');

  if v_job.id is null then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  if v_projet.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'action', v_job.action,
    'question', btrim(v_job.params ->> 'question'),
    'projet', jsonb_build_object(
      'format', v_projet.format,
      'genre', v_projet.genre,
      'pays', to_jsonb(v_projet.countries)
    )
  );
end;
$$;

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
  if v_job.action not in ('research', 'cultural_context') then
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

create or replace function public.livrer_proposition_recherche(
  p_attempt_id uuid,
  p_content text,
  p_sources jsonb
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
  v_texte text := btrim(coalesce(p_content, ''));
  v_nombre integer;
  v_source jsonb;
  v_rang bigint;
  v_renvois integer;
  v_renvoi_min integer;
  v_renvoi_max integer;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action not in ('research', 'cultural_context') then
    raise exception 'Aucune recherche n''est prévue pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  -- Pas de source sans collecte : la requête de cet essai doit avoir été
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
  v_nombre := jsonb_array_length(p_sources);
  if v_nombre not between 1 and 20 then
    raise exception 'Sources invalides : de 1 à 20 attendues, % reçues.', v_nombre
      using errcode = '22023';
  end if;

  for v_source, v_rang in
    select t.source, t.rang
    from jsonb_array_elements(p_sources) with ordinality as t(source, rang)
  loop
    if jsonb_typeof(v_source) <> 'object'
       or not coalesce(
         jsonb_typeof(v_source -> 'url') = 'string'
         and char_length(v_source ->> 'url') <= 2000
         and (v_source ->> 'url') ~ '^https://[^[:space:][:cntrl:]/?#@]+\.[^[:space:][:cntrl:]/?#@]+([/?#][^[:space:][:cntrl:]]*)?$'
         and jsonb_typeof(v_source -> 'title') = 'string'
         and char_length(btrim(v_source ->> 'title')) between 1 and 300
         and (v_source ->> 'title') !~ '[[:cntrl:]]'
         and jsonb_typeof(v_source -> 'excerpt') = 'string'
         and char_length(btrim(v_source ->> 'excerpt')) between 1 and 2000,
         false
       ) then
      raise exception 'Source % invalide : adresse, titre ou extrait.', v_rang
        using errcode = '22023';
    end if;
    -- La date est facultative : absente ou nulle, sinon une date du
    -- calendrier, écrite AAAA-MM-JJ.
    if coalesce(jsonb_typeof(v_source -> 'published_on'), 'null') <> 'null' then
      if jsonb_typeof(v_source -> 'published_on') <> 'string'
         or (v_source ->> 'published_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Source % invalide : date.', v_rang using errcode = '22023';
      end if;
      begin
        perform (v_source ->> 'published_on')::date;
      exception when others then
        raise exception 'Source % invalide : date.', v_rang using errcode = '22023';
      end;
    end if;
  end loop;

  -- La synthèse : un texte, sans adresse écrite de lui-même, dont chaque
  -- renvoi « [n] » désigne une source collectée, et qui en cite au moins une.
  if char_length(v_texte) not between 1 and 20000
     or regexp_replace(v_texte, '[\n\r\t]', '', 'g') ~ '[[:cntrl:]]' then
    raise exception 'Synthèse invalide : de 1 à 20 000 caractères.' using errcode = '22023';
  end if;
  if v_texte ~* '(https?://|www\.)' then
    raise exception 'Synthèse invalide : elle ne doit écrire aucune adresse.'
      using errcode = '22023';
  end if;
  select count(*), min((m.c)[1]::integer), max((m.c)[1]::integer)
  into v_renvois, v_renvoi_min, v_renvoi_max
  from regexp_matches(v_texte, '\[([0-9]{1,4})\]', 'g') as m(c);
  if v_renvois = 0 or v_renvoi_min < 1 or v_renvoi_max > v_nombre then
    raise exception 'Synthèse invalide : chaque renvoi doit désigner une source collectée, et il en faut au moins un.'
      using errcode = '22023';
  end if;

  insert into public.ai_suggestions (
    job_id, studio_id, project_id, action, content, profile, model, created_by
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.action, v_texte,
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  -- Le site est tiré de l'adresse, le renvoi relu dans la synthèse : ni l'un
  -- ni l'autre n'est pris sur parole.
  insert into public.ai_suggestion_sources (
    suggestion_id, project_id, position, url, title, site, excerpt, published_on,
    collected_at, cited
  )
  select
    v_proposition, v_job.project_id, t.rang::integer,
    t.source ->> 'url',
    btrim(t.source ->> 'title'),
    lower(substring(t.source ->> 'url' from '^https://([^/?#:]+)')),
    btrim(t.source ->> 'excerpt'),
    (t.source ->> 'published_on')::date,
    v_collecte.settled_at,
    position('[' || t.rang || ']' in v_texte) > 0
  from jsonb_array_elements(p_sources) with ordinality as t(source, rang);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;
