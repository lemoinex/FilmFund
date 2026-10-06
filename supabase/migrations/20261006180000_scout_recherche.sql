-- SCOUT : recherche documentaire sourcée (lot L1, base et worker).
--
-- Décision de l'utilisateur, le 6 octobre 2026 : Perplexity collecte,
-- Anthropic synthétise. Le moteur de recherche rend des pages — adresse,
-- titre, extrait, date — et ne rédige rien ; le modèle de texte ne reçoit que
-- ces extraits et ne cite qu'eux. C'est le « pipeline avant modèle » de
-- docs/roles-anthropic-openai-filmfund-africa.md.
--
-- Ce que cette migration ouvre :
--   1. un troisième fournisseur au coffre des clés, `perplexity` ;
--   2. le registre des coûts de recherche : une requête par essai, à côté du
--      coût du modèle, et comptée avec lui dans la dépense du mois ;
--   3. la colonne `research` du barème, à 3 unités, et l'action `research`
--      aux devis ;
--   4. les sources proposées (`ai_suggestion_sources`), sixième table fille
--      du modèle des propositions structurées, et les sources retenues par
--      l'équipe (`project_sources`) ;
--   5. le contexte, le dépôt, l'acceptation et l'écart d'une source.
--
-- Ce qui distingue la recherche des autres livrables :
--   - deux fournisseurs dans une même tâche. La requête de recherche a son
--     propre coût, provisionné avec une réserve pour la synthèse qui suit :
--     le plafond du mois refuse l'ensemble avant le premier appel, pas à
--     mi-chemin ;
--   - seule la question part chez le moteur de recherche. Ni titre, ni
--     scénario, ni budget, ni identité ;
--   - le worker ne visite aucune page citée : toute source naît
--     « non vérifiée ». Une source citée n'est pas une source vérifiée ;
--   - la base ne se fie ni au site ni aux renvois annoncés : elle tire le
--     site de l'adresse, relit chaque renvoi « [n] » de la synthèse, et
--     refuse un texte qui citerait une source absente de la collecte ou
--     écrirait une adresse de lui-même.
--
-- L'organisme d'une source n'est pas connu : le moteur ne le donne pas, et
-- le déduire serait l'inventer. La colonne `site` porte l'hôte de l'adresse,
-- rien de plus.
--
-- Retour arrière — aucune source retenue n'est perdue si on s'arrête avant
-- le dernier pas :
--   `drop table public.ai_suggestion_sources` ; rétablir
--   `ecarter_lignes_restantes`, `creer_devis` et `devis_action_connue` de la
--   migration 20261006160000_board_images ; rétablir `depense_ia_du_mois` de
--   la migration 20261001091842_passerelle_ia, puis
--   `drop table public.provider_search_settlements, public.provider_search_charges`
--   — ce qui efface la trace de dépenses réelles : à n'envisager que s'il
--   n'en existe aucune ; retirer `research` du barème en reprenant
--   `bareme_poids_positifs` ; rétablir `definir_cle_fournisseur` et
--   `fournisseur_ia_connu` de la migration 20261001124014_integrations_ia,
--   après avoir retiré la clé de Perplexity depuis l'écran ; enfin
--   `drop table public.project_sources`, qui emporte les sources retenues.

-- ---------------------------------------------------------------------------
-- Coffre : un troisième fournisseur
-- ---------------------------------------------------------------------------

alter table public.ai_provider_keys
  drop constraint fournisseur_ia_connu,
  add constraint fournisseur_ia_connu check (provider in ('anthropic', 'openai', 'perplexity'));

-- Reprise de la migration integrations_ia, avec un seul ajout : Perplexity.
create or replace function public.definir_cle_fournisseur(p_provider text, p_cle text)
returns public.ai_provider_keys
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_provider_keys;
  v_secret uuid;
  v_cle text := btrim(coalesce(p_cle, ''));
  v_operation text;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Action réservée à l''administration.' using errcode = '42501';
  end if;

  if p_provider is null or p_provider not in ('anthropic', 'openai', 'perplexity') then
    raise exception 'Fournisseur inconnu.' using errcode = '22023';
  end if;

  -- Bornes larges : les formats varient d'un fournisseur à l'autre. Une clé
  -- ne contient jamais d'espace ni de retour à la ligne ; ce contrôle attrape
  -- un copier-coller qui aurait emporté du texte autour.
  if char_length(v_cle) not between 20 and 500 or v_cle ~ '\s' then
    raise exception 'Clé invalide : de 20 à 500 caractères, sans espace ni retour à la ligne.'
      using errcode = '22023';
  end if;

  select k.* into v_ligne from public.ai_provider_keys k where k.provider = p_provider for update;

  if v_ligne.provider is null then
    v_operation := 'ajout';
    v_secret := vault.create_secret(
      v_cle,
      'ia_' || p_provider,
      'Clé d''API du fournisseur ' || p_provider || ', posée depuis l''écran Intégrations IA.'
    );
    insert into public.ai_provider_keys (provider, secret_id, configured_by)
    values (p_provider, v_secret, (select auth.uid()))
    returning * into v_ligne;
  else
    v_operation := 'remplacement';
    perform vault.update_secret(v_ligne.secret_id, v_cle);
    update public.ai_provider_keys k
    set configured_by = (select auth.uid()), configured_at = now()
    where k.provider = p_provider
    returning * into v_ligne;
  end if;

  perform public.journaliser(
    'cle_fournisseur',
    null,
    jsonb_build_object('fournisseur', p_provider, 'operation', v_operation)
  );

  return v_ligne;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registre des coûts de recherche
-- ---------------------------------------------------------------------------

-- Une requête de recherche se paie à l'unité, sans jeton : elle n'entre pas
-- dans `provider_charges`, qui compte un appel de modèle par essai. Même
-- principe : provision avant l'appel, confirmation après, en ajout seul, et
-- pas de clé étrangère vers les tâches — la dépense survit à ce qui l'a causée.
create table public.provider_search_charges (
  attempt_id uuid primary key,
  job_id uuid not null,
  studio_id uuid not null,
  project_id uuid not null,
  provider text not null,
  -- Profil d'agent et sa version, par exemple « scout.recherche@1 ».
  profile text not null,
  estimated_requests integer not null,
  estimated_usd numeric(12, 6) not null,
  created_at timestamptz not null default now(),

  constraint cout_recherche_fournisseur_connu check (provider in ('perplexity')),
  constraint cout_recherche_provision_positive check (
    estimated_requests between 1 and 10 and estimated_usd >= 0
  )
);

comment on table public.provider_search_charges is
  'Coût provisionné avant chaque requête à un moteur de recherche. En ajout seul ; lu par les administrateurs.';

create index provider_search_charges_created_at_idx
  on public.provider_search_charges (created_at);

create table public.provider_search_settlements (
  attempt_id uuid primary key references public.provider_search_charges (attempt_id),
  -- Zéro : la requête a été refusée, donc ni servie ni facturée.
  requests integer not null,
  -- Nul : montant à rapprocher.
  usd numeric(12, 6),
  settled_at timestamptz not null default now(),

  constraint cout_recherche_confirme_positif check (
    requests between 0 and 10 and (usd is null or usd >= 0)
  )
);

comment on table public.provider_search_settlements is
  'Requêtes de recherche confirmées après l''appel. Une seule ligne par essai ; en ajout seul.';

alter table public.provider_search_charges enable row level security;
alter table public.provider_search_settlements enable row level security;

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['provider_search_charges', 'provider_search_settlements']
  loop
    execute format(
      $f$
        create policy "Les administrateurs lisent les coûts de recherche"
          on public.%I for select
          to authenticated
          using ((select public.is_admin()))
      $f$,
      nom_table
    );
    execute format(
      $f$
        create policy "Mode privé : administrateurs uniquement"
          on public.%I
          as restrictive
          for all
          to authenticated
          using (not (select public.mode_prive()) or (select public.is_admin()))
          with check (not (select public.mode_prive()) or (select public.is_admin()))
      $f$,
      nom_table
    );
    execute format('revoke all on table public.%I from anon, authenticated', nom_table);
    execute format('grant select on table public.%I to authenticated', nom_table);
    execute format(
      $f$
        create trigger %I
          before update or delete on public.%I
          for each row
          execute function public.registre_en_ajout_seul()
      $f$,
      nom_table || '_ajout_seul',
      nom_table
    );
    execute format(
      $f$
        create trigger %I
          before truncate on public.%I
          for each statement
          execute function public.registre_en_ajout_seul()
      $f$,
      nom_table || '_pas_de_vidage',
      nom_table
    );
  end loop;
end;
$$;

-- Reprise de la migration passerelle_ia, avec un seul ajout : les requêtes de
-- recherche comptent dans la dépense du mois, au même titre que les appels
-- de modèle. Montant confirmé quand il est connu, provision sinon.
create or replace function public.depense_ia_du_mois()
returns numeric
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    coalesce(
      (
        select sum(coalesce(s.usd, c.estimated_usd))
        from public.provider_charges c
        left join public.provider_charge_settlements s on s.attempt_id = c.attempt_id
        where (c.created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc')
      ),
      0
    )
    + coalesce(
      (
        select sum(coalesce(s.usd, c.estimated_usd))
        from public.provider_search_charges c
        left join public.provider_search_settlements s on s.attempt_id = c.attempt_id
        where (c.created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc')
      ),
      0
    );
$$;

-- Provision d'une requête de recherche. `p_reserve_usd` est ce que coûterait
-- au pire la synthèse qui suit : le plafond du mois est comparé à l'ensemble,
-- pour ne pas payer une collecte dont la synthèse serait ensuite refusée.
-- Seule la requête est inscrite ; la synthèse provisionnera son propre coût.
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
  if v_job.action <> 'research' then
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

revoke all on function public.provisionner_recherche(uuid, text, text, integer, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.provisionner_recherche(uuid, text, text, integer, numeric, numeric)
  to filmfund_worker;

create or replace function public.confirmer_recherche(
  p_attempt_id uuid,
  p_requests integer,
  p_usd numeric
)
returns public.provider_search_settlements
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reglement public.provider_search_settlements;
begin
  select s.* into v_reglement
  from public.provider_search_settlements s
  where s.attempt_id = p_attempt_id;
  if v_reglement.attempt_id is not null then
    return v_reglement;
  end if;

  if not exists (
    select 1 from public.provider_search_charges c where c.attempt_id = p_attempt_id
  ) then
    raise exception 'Aucune recherche provisionnée pour cet essai.' using errcode = 'IA002';
  end if;

  insert into public.provider_search_settlements (attempt_id, requests, usd)
  values (p_attempt_id, p_requests, p_usd)
  returning * into v_reglement;

  return v_reglement;
end;
$$;

revoke all on function public.confirmer_recherche(uuid, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.confirmer_recherche(uuid, integer, numeric) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Barème : le prix d'une recherche
-- ---------------------------------------------------------------------------

alter table public.text_unit_rate_versions
  add column research integer not null default 3;

alter table public.text_unit_rate_versions
  alter column research drop default;

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
    and treatment >= 0
    and bible >= 0
    and screenplay_per_sequence >= 0
    and dialogue_per_scene >= 0
  );

comment on column public.text_unit_rate_versions.research is
  'Unités texte d''une recherche documentaire sourcée (agent SCOUT).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun.
grant insert (research) on table public.text_unit_rate_versions to authenticated;
grant select (research) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : l'action research
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

-- Reprise de la migration board_images, avec un seul ajout : la recherche,
-- au prix du barème, sur une question en clair.
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
    when 'research' then
      -- Une question par demande, en clair : c'est elle, et elle seule, qui
      -- part chez le moteur de recherche.
      v_quantite := v_bareme.research;
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
-- Sources retenues par l'équipe
-- ---------------------------------------------------------------------------

create table public.project_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  url text not null,
  title text not null,
  -- Hôte de l'adresse. Ce n'est pas l'organisme : celui-là n'est pas connu.
  site text not null,
  excerpt text not null,
  -- Date annoncée par le moteur ; nulle s'il n'en donne pas.
  published_on date,
  -- Moment de la collecte : une page change, cet instant dit de quand date
  -- l'extrait.
  collected_at timestamptz not null,
  status text not null default 'non_verifie',
  -- La question à laquelle cette source répondait.
  question text not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint source_statut_connu check (
    status in ('non_verifie', 'verifie', 'expire', 'introuvable', 'demo')
  ),
  constraint source_adresse check (
    char_length(url) <= 2000 and url ~ '^https://[^[:space:][:cntrl:]]+$'
  ),
  constraint source_titre check (
    char_length(btrim(title)) between 1 and 300 and title !~ '[[:cntrl:]]'
  ),
  constraint source_site check (char_length(site) between 1 and 253),
  constraint source_extrait check (char_length(btrim(excerpt)) between 1 and 2000),
  constraint source_question check (char_length(btrim(question)) between 1 and 500),
  constraint source_unique_par_projet unique (project_id, url)
);

comment on table public.project_sources is
  'Sources retenues par l''équipe d''un projet, avec leur provenance : adresse, extrait, date de collecte, statut de vérification. Aucune n''est vérifiée par la plateforme.';

alter table public.project_sources enable row level security;

create trigger project_sources_journal_admin
  before insert or update or delete on public.project_sources
  for each row
  execute function public.journaliser_intervention_admin();

create policy "L'équipe et les administrateurs lisent les sources"
  on public.project_sources for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Suppression de sources"
  on public.project_sources for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.project_sources
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()))
;

-- Une source n'entre que par l'acceptation d'une source proposée, et son
-- statut ne change pas encore : vérifier une source est un geste à part,
-- que ce lot n'ouvre pas.
revoke all on table public.project_sources from anon, authenticated;
grant select, delete on table public.project_sources to authenticated;

-- ---------------------------------------------------------------------------
-- Sources proposées
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_sources (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Le numéro du renvoi « [n] » dans la synthèse.
  position integer not null,
  url text not null,
  title text not null,
  site text not null,
  excerpt text not null,
  published_on date,
  collected_at timestamptz not null,
  -- La synthèse renvoie-t-elle à cette source. Calculé par la base.
  cited boolean not null,
  state text not null default 'proposed',
  -- Source née de l'acceptation. Si l'équipe la supprime ensuite, la
  -- proposition reste acceptée : elle dit ce qui a été décidé.
  source_id uuid references public.project_sources (id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint source_proposee_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint source_proposee_adresse check (
    char_length(url) <= 2000 and url ~ '^https://[^[:space:][:cntrl:]]+$'
  ),
  constraint source_proposee_titre check (
    char_length(btrim(title)) between 1 and 300 and title !~ '[[:cntrl:]]'
  ),
  constraint source_proposee_site check (char_length(site) between 1 and 253),
  constraint source_proposee_extrait check (char_length(btrim(excerpt)) between 1 and 2000),
  constraint source_proposee_decision check ((state = 'proposed') = (decided_at is null)),
  constraint source_proposee_rang unique (suggestion_id, position),
  constraint source_proposee_adresse_unique unique (suggestion_id, url)
);

comment on table public.ai_suggestion_sources is
  'Source collectée pour une recherche : jamais retenue d''elle-même, jamais vérifiée par la plateforme. Acceptée ou écartée une à une par qui écrit le projet.';

create index ai_suggestion_sources_projet_idx
  on public.ai_suggestion_sources (project_id, state);

alter table public.ai_suggestion_sources enable row level security;

create policy "L'équipe et les administrateurs lisent les sources proposées"
  on public.ai_suggestion_sources for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_sources
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_sources from anon, authenticated;
grant select on table public.ai_suggestion_sources to authenticated;

-- Une source proposée ne change que pour être acceptée ou écartée, une fois ;
-- ce qui a été collecté ne change jamais.
create or replace function public.controler_source_proposee()
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
    raise exception 'Une source proposée ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.position, new.url, new.title, new.site,
      new.excerpt, new.published_on, new.collected_at, new.cited, new.created_at)
     is distinct from
     (old.id, old.suggestion_id, old.project_id, old.position, old.url, old.title, old.site,
      old.excerpt, old.published_on, old.collected_at, old.cited, old.created_at) then
    raise exception 'Ce qui a été collecté ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    -- Seul le détachement d'une source supprimée du projet passe encore.
    if pg_trigger_depth() > 1
       and new.source_id is null
       and (new.state, new.decided_by, new.decided_at)
           is not distinct from (old.state, old.decided_by, old.decided_at) then
      return new;
    end if;
    raise exception 'Une source déjà acceptée ou écartée ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_source_proposee() from public, anon, authenticated;

create trigger ai_suggestion_sources_controle
  before update or delete on public.ai_suggestion_sources
  for each row
  execute function public.controler_source_proposee();

create trigger ai_suggestion_sources_pas_de_vidage
  before truncate on public.ai_suggestion_sources
  for each statement
  execute function public.registre_en_ajout_seul();

-- Reprise de la migration board_images, pour les six tables filles : écarter
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
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce que SCOUT lit : la question, et de quoi situer la synthèse — le format,
-- le genre et les pays du projet. Ni titre, ni texte du projet, ni budget,
-- ni équipe. Null si l'essai n'est pas l'essai en cours d'une recherche.
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
    and j.action = 'research';

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

revoke all on function public.contexte_recherche(uuid) from public, anon, authenticated;
grant execute on function public.contexte_recherche(uuid) to filmfund_worker;

-- Dépôt d'une recherche : la synthèse, et les sources collectées. Tout est
-- contrôlé ici, quoi qu'ait déjà vérifié le worker : la base ne se fie pas à
-- ce qu'on lui remet.
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
  if v_job.action <> 'research' then
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

revoke all on function public.livrer_proposition_recherche(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_recherche(uuid, text, jsonb)
  to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe, source par source
-- ---------------------------------------------------------------------------

-- Clôt la proposition quand plus aucune source n'attend : appliquée si une
-- source au moins a été retenue, écartée sinon. Interne.
create or replace function public.clore_proposition_recherche(p_suggestion_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.ai_suggestion_sources l
    where l.suggestion_id = p_suggestion_id and l.state = 'proposed'
  ) then
    return;
  end if;

  update public.ai_suggestions s
  set state = case
        when exists (
          select 1 from public.ai_suggestion_sources l
          where l.suggestion_id = s.id and l.state = 'accepted'
        ) then 'accepted'
        else 'dismissed'
      end,
      decided_by = (select auth.uid()),
      decided_at = now()
  where s.id = p_suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.clore_proposition_recherche(uuid) from public, anon, authenticated;

-- Verrouille la proposition puis la source, toujours dans cet ordre, et rend
-- la source si l'appelant a le droit d'en décider : qui écrit le projet. Un
-- seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.source_a_decider(p_line_id uuid)
returns public.ai_suggestion_sources
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_sources;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_sources l on l.suggestion_id = s.id
  where l.id = p_line_id
  for update of s;

  select l.* into v_ligne
  from public.ai_suggestion_sources l
  where l.id = p_line_id
  for update;

  if v_ligne.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_editer_contenu(v_ligne.project_id), false) then
    raise exception 'Source proposée introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_ligne;
end;
$$;

revoke all on function public.source_a_decider(uuid) from public, anon, authenticated;

-- Retient une source : elle entre au projet telle que collectée, sans
-- correction possible — on ne réécrit pas ce qu'une page disait —, et
-- « non vérifiée ». Une adresse déjà retenue n'est pas doublée : la source
-- proposée s'y rattache.
create or replace function public.accepter_source_proposee(p_line_id uuid)
returns public.ai_suggestion_sources
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_sources;
  v_question text;
  v_retenue uuid;
begin
  v_ligne := public.source_a_decider(p_line_id);

  if v_ligne.state = 'accepted' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cette source a déjà été écartée.' using errcode = 'PR001';
  end if;

  select btrim(j.params ->> 'question') into v_question
  from public.ai_suggestions s
  join public.jobs j on j.id = s.job_id
  where s.id = v_ligne.suggestion_id;

  insert into public.project_sources (
    project_id, url, title, site, excerpt, published_on, collected_at, status, question,
    created_by
  )
  values (
    v_ligne.project_id, v_ligne.url, v_ligne.title, v_ligne.site, v_ligne.excerpt,
    v_ligne.published_on, v_ligne.collected_at, 'non_verifie', v_question,
    (select auth.uid())
  )
  on conflict (project_id, url) do nothing
  returning id into v_retenue;

  if v_retenue is null then
    select p.id into v_retenue
    from public.project_sources p
    where p.project_id = v_ligne.project_id and p.url = v_ligne.url;
  end if;

  update public.ai_suggestion_sources
  set state = 'accepted', source_id = v_retenue,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_recherche(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.accepter_source_proposee(uuid) from public, anon, authenticated;
grant execute on function public.accepter_source_proposee(uuid) to authenticated;

-- Écarte une source : rien n'entre au projet.
create or replace function public.ecarter_source_proposee(p_line_id uuid)
returns public.ai_suggestion_sources
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_suggestion_sources;
begin
  v_ligne := public.source_a_decider(p_line_id);

  if v_ligne.state = 'dismissed' then
    return v_ligne;
  end if;
  if v_ligne.state <> 'proposed' then
    raise exception 'Cette source a déjà été acceptée.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_sources
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_ligne.id
  returning * into v_ligne;

  perform public.clore_proposition_recherche(v_ligne.suggestion_id);

  return v_ligne;
end;
$$;

revoke all on function public.ecarter_source_proposee(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_source_proposee(uuid) to authenticated;
