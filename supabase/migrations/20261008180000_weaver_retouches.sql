-- WEAVER : les retouches d'un passage (lot RT1).
--
-- Améliorer, raccourcir, développer, corriger : quatre retouches que le
-- cahier des charges prévoit sur un texte. Une retouche porte sur un passage
-- sélectionné dans un document, jamais sur le document entier — un document
-- peut faire 200 000 caractères, une proposition 20 000.
--
-- La mécanique est celle des dialogues (lot J2b-1), ouverte à tout type de
-- document : le passage est désigné par la demande — document, position,
-- longueur — et scellé par son empreinte. La base le relit trois fois, au
-- devis, à la préparation de l'appel et à l'acceptation, et vérifie chaque
-- fois qu'il est toujours celui qui a été désigné. Si le document a changé à
-- cet endroit, l'acceptation est refusée : rien n'est remplacé, la
-- proposition reste lisible.
--
-- Quatre actions, une par retouche : chacune a son profil versionné côté
-- worker, donc ses consignes. Elles partagent tout le reste — un seul prix
-- au barème, un seul contrôle du passage, un seul contexte, une seule
-- acceptation.
--
-- Ce que cette migration ouvre :
--   1. une colonne du barème, `text_edit_per_passage`, avec ses droits ;
--   2. quatre actions aux devis ;
--   3. `passage_du_document`, le contrôle du passage pour tout document ;
--   4. `creer_devis`, `livrer_proposition` et `accepter_proposition`, chacune
--      reprise de sa dernière définition avec les cas des retouches ;
--   5. `contexte_retouche`, pour le worker.
--
-- `passage_du_scenario` et les dialogues ne changent pas. Aucune table ni
-- politique nouvelles.
--
-- Retour arrière — aucune donnée perdue :
--   rétablir `creer_devis` de la migration 20261007230000_arc_personnages,
--   `livrer_proposition` et `accepter_proposition` de la migration
--   20261007210000_weaver_realisation_pitch ; `drop function
--   public.contexte_retouche` puis `public.passage_du_document` ; retirer les
--   quatre actions de `devis_action_connue` et la colonne du barème. Les
--   passages déjà remplacés restent dans leurs documents, avec leurs versions.

-- ---------------------------------------------------------------------------
-- Barème : le prix d'une retouche
-- ---------------------------------------------------------------------------

-- Le défaut remplit les versions déjà publiées, puis il est retiré : une
-- version publiée ensuite doit dire sa valeur.
alter table public.text_unit_rate_versions
  add column text_edit_per_passage integer not null default 1;

alter table public.text_unit_rate_versions
  alter column text_edit_per_passage drop default;

-- Reprise de la contrainte de la migration arc_personnages, avec une colonne
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

comment on column public.text_unit_rate_versions.text_edit_per_passage is
  'Unités texte d''une retouche de passage — améliorer, raccourcir, développer ou corriger (agent WEAVER).';

-- Les droits du barème sont accordés colonne par colonne : une colonne
-- ajoutée n'en hérite aucun.
grant insert (text_edit_per_passage) on table public.text_unit_rate_versions to authenticated;
grant select (text_edit_per_passage) on table public.text_unit_rate_versions to anon;

-- ---------------------------------------------------------------------------
-- Devis : les quatre retouches
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

-- ---------------------------------------------------------------------------
-- Le passage désigné
-- ---------------------------------------------------------------------------

-- Rend le passage que désignent les paramètres d'une demande, ou null s'il
-- n'est pas — ou plus — celui qui a été désigné : document d'un autre projet,
-- bornes hors du texte, passage vide ou trop long, empreinte différente.
-- Même contrôle que `passage_du_scenario`, sans la condition sur le type :
-- une retouche se demande sur tout document. Interne : appelée par le devis,
-- le contexte et l'acceptation, jamais depuis l'API.
--
-- Positions en caractères, comme `substr` : le serveur les calcule ainsi
-- avant de demander le devis.
create or replace function public.passage_du_document(p_project_id uuid, p_params jsonb)
returns text
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_document uuid;
  v_debut numeric;
  v_longueur numeric;
  v_contenu text;
  v_passage text;
begin
  if jsonb_typeof(p_params -> 'document') is distinct from 'string'
     or jsonb_typeof(p_params -> 'empreinte') is distinct from 'string'
     or jsonb_typeof(p_params -> 'debut') is distinct from 'number'
     or jsonb_typeof(p_params -> 'longueur') is distinct from 'number'
     or (p_params ->> 'document') !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
     or (p_params ->> 'empreinte') !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  v_document := (p_params ->> 'document')::uuid;
  v_debut := (p_params ->> 'debut')::numeric;
  v_longueur := (p_params ->> 'longueur')::numeric;
  if v_debut <> trunc(v_debut) or v_longueur <> trunc(v_longueur)
     or v_debut < 0 or v_longueur not between 1 and 6000 then
    return null;
  end if;

  select d.content into v_contenu
  from public.project_documents d
  where d.id = v_document
    and d.project_id = p_project_id;

  if v_contenu is null or v_debut + v_longueur > char_length(v_contenu) then
    return null;
  end if;

  v_passage := substr(v_contenu, v_debut::integer + 1, v_longueur::integer);
  if btrim(v_passage) = '' or md5(v_passage) <> (p_params ->> 'empreinte') then
    return null;
  end if;

  return v_passage;
end;
$$;

revoke all on function public.passage_du_document(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Devis
-- ---------------------------------------------------------------------------

-- Même fonction qu'au lot X2, un cas de plus.
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
-- Contexte du worker
-- ---------------------------------------------------------------------------

-- Ce que WEAVER lit pour retoucher un passage : le projet en quelques
-- repères, le document dont vient le passage, le passage, et ce qui
-- l'entoure — pour le ton et le raccord. Ni personnages, ni vision, ni
-- budget : une retouche travaille le texte qu'on lui donne. Null si l'essai
-- n'est pas l'essai en cours d'une retouche, ou si le passage n'est plus
-- celui qui a été désigné : rien ne part alors chez le fournisseur.
create or replace function public.contexte_retouche(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_projet public.projects;
  v_document public.project_documents;
  v_passage text;
  v_debut integer;
  v_longueur integer;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action in ('text_improve', 'text_shorten', 'text_expand', 'text_correct');

  if v_job.id is null then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  v_passage := public.passage_du_document(v_job.project_id, v_job.params);
  if v_projet.id is null or v_passage is null then
    return null;
  end if;

  select d.* into v_document
  from public.project_documents d
  where d.id = (v_job.params ->> 'document')::uuid;
  v_debut := (v_job.params ->> 'debut')::integer;
  v_longueur := (v_job.params ->> 'longueur')::integer;

  return jsonb_build_object(
    'action', v_job.action,
    'projet', jsonb_build_object(
      'titre', v_projet.title,
      'format', v_projet.format,
      'genre', v_projet.genre,
      'langues', v_projet.languages
    ),
    'contexte', jsonb_build_object('pitch', v_projet.logline),
    'document', jsonb_build_object('type', v_document.type, 'titre', v_document.title),
    'passage', v_passage,
    -- Les 1 500 caractères qui précèdent le passage, et les 500 qui le suivent.
    'avant', substr(v_document.content, greatest(v_debut - 1500, 0) + 1, least(v_debut, 1500)),
    'apres', substr(v_document.content, v_debut + v_longueur + 1, 500)
  );
end;
$$;

revoke all on function public.contexte_retouche(uuid) from public, anon, authenticated;
grant execute on function public.contexte_retouche(uuid) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Dépôt et acceptation
-- ---------------------------------------------------------------------------

-- Mêmes fonctions qu'au lot X1, avec les bornes des quatre retouches et le
-- remplacement de leur passage.
create or replace function public.livrer_proposition(p_attempt_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_charge public.provider_charges;
  v_texte text := btrim(coalesce(p_content, ''));
  v_proposition uuid;
  v_max integer;
  v_un_paragraphe boolean := false;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  case v_job.action
    when 'logline' then
      v_max := 500;
      v_un_paragraphe := true;
    when 'synopsis_short' then v_max := 1500;
    when 'synopsis_standard' then v_max := 8000;
    when 'synopsis_detailed' then v_max := 20000;
    when 'intention_note' then v_max := 20000;
    when 'direction_note' then v_max := 20000;
    when 'pitch_extended' then v_max := 6000;
    when 'pitch_oral' then v_max := 6000;
    when 'dramatic_analysis' then v_max := 20000;
    when 'treatment' then v_max := 20000;
    when 'bible' then v_max := 20000;
    when 'screenplay' then v_max := 20000;
    when 'dialogue' then v_max := 12000;
    -- Un passage retouché : le double du passage admis, sauf raccourci.
    when 'text_improve' then v_max := 12000;
    when 'text_expand' then v_max := 12000;
    when 'text_correct' then v_max := 12000;
    when 'text_shorten' then v_max := 6000;
    else
      raise exception 'Aucune proposition n''est prévue pour l''action %.', v_job.action
        using errcode = '0A000';
  end case;

  if char_length(v_texte) not between 1 and v_max
     or (v_un_paragraphe and v_texte ~ '[\n\r]')
     or regexp_replace(v_texte, '[\n\r\t]', '', 'g') ~ '[[:cntrl:]]' then
    raise exception 'Texte invalide pour l''action % : de 1 à % caractères attendus.',
      v_job.action, v_max
      using errcode = '22023';
  end if;

  insert into public.ai_suggestions (
    job_id, studio_id, project_id, action, content, profile, model, created_by
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.action, v_texte, v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

create or replace function public.accepter_proposition(
  p_suggestion_id uuid,
  p_content text default null
)
returns public.ai_suggestions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_proposition public.ai_suggestions;
  v_final text;
  v_ancien text;
  v_max integer;
  v_type public.document_type;
  v_titre text;
  v_document uuid;
  v_parametres jsonb;
  v_debut integer;
  v_longueur integer;
begin
  select s.* into v_proposition
  from public.ai_suggestions s
  where s.id = p_suggestion_id
  for update;

  if v_proposition.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.acces_au_projet(v_proposition.project_id) in ('owner', 'editor'), false) then
    raise exception 'Proposition introuvable, ou droits insuffisants pour l''appliquer.'
      using errcode = '42501';
  end if;

  if v_proposition.state = 'accepted' then
    return v_proposition;
  end if;
  if v_proposition.state <> 'proposed' then
    raise exception 'Cette proposition a déjà été écartée.' using errcode = 'PR001';
  end if;

  v_final := coalesce(nullif(btrim(p_content), ''), v_proposition.content);

  -- Les bornes des colonnes du projet, répétées ici : une proposition
  -- modifiée à l'écran avant d'être appliquée doit y entrer.
  case v_proposition.action
    when 'logline' then v_max := 500;
    when 'synopsis_short' then v_max := 1500;
    when 'synopsis_standard' then v_max := 20000;
    when 'synopsis_detailed' then v_max := 20000;
    when 'intention_note' then v_max := 20000;
    when 'direction_note' then v_max := 20000;
    when 'pitch_extended' then v_max := 6000;
    when 'pitch_oral' then v_max := 6000;
    when 'dramatic_analysis' then v_max := 20000;
    when 'treatment' then v_max := 20000;
    when 'bible' then v_max := 20000;
    when 'screenplay' then v_max := 20000;
    when 'dialogue' then v_max := 12000;
    when 'text_improve' then v_max := 12000;
    when 'text_expand' then v_max := 12000;
    when 'text_correct' then v_max := 12000;
    when 'text_shorten' then v_max := 6000;
    else
      raise exception 'Cette proposition ne peut pas encore être appliquée.' using errcode = '0A000';
  end case;

  if char_length(v_final) > v_max then
    raise exception 'Le texte appliqué ne peut pas dépasser % caractères.', v_max
      using errcode = '22023';
  end if;

  if v_proposition.action in ('text_improve', 'text_shorten', 'text_expand', 'text_correct') then
    -- Même mécanique que pour les dialogues, sur un document de tout type :
    -- le passage désigné à la demande, et lui seul. Le document est verrouillé
    -- avant d'être relu ; s'il a changé à cet endroit, rien n'est remplacé.
    select j.params into v_parametres from public.jobs j where j.id = v_proposition.job_id;

    select d.id into v_document
    from public.project_documents d
    where d.id = (v_parametres ->> 'document')::uuid
      and d.project_id = v_proposition.project_id
    for update;

    v_ancien := public.passage_du_document(v_proposition.project_id, v_parametres);
    if v_document is null or v_ancien is null then
      raise exception 'Le document a changé à cet endroit depuis la demande : le passage ne peut plus y être remplacé.'
        using errcode = 'PR002';
    end if;

    v_debut := (v_parametres ->> 'debut')::integer;
    v_longueur := (v_parametres ->> 'longueur')::integer;

    if (select char_length(d.content) from public.project_documents d where d.id = v_document)
         - v_longueur + char_length(v_final) > 200000 then
      raise exception 'Le document atteindrait sa longueur maximale : ce passage n''y entre plus.'
        using errcode = '22023';
    end if;

    update public.project_documents d
    set content = left(d.content, v_debut) || v_final || substr(d.content, v_debut + v_longueur + 1)
    where d.id = v_document;
  elsif v_proposition.action = 'dialogue' then
    -- Le passage désigné à la demande, et lui seul. Le document est verrouillé
    -- avant d'être relu : si le scénario a changé à cet endroit depuis la
    -- demande, rien n'est remplacé — la proposition reste lisible, et
    -- l'équipe la reporte à la main ou l'écarte.
    select j.params into v_parametres from public.jobs j where j.id = v_proposition.job_id;

    select d.id into v_document
    from public.project_documents d
    where d.id = (v_parametres ->> 'document')::uuid
      and d.project_id = v_proposition.project_id
      and d.type = 'scenario'
    for update;

    v_ancien := public.passage_du_scenario(v_proposition.project_id, v_parametres);
    if v_document is null or v_ancien is null then
      raise exception 'Le scénario a changé à cet endroit depuis la demande : la scène ne peut plus y être remplacée.'
        using errcode = 'PR002';
    end if;

    v_debut := (v_parametres ->> 'debut')::integer;
    v_longueur := (v_parametres ->> 'longueur')::integer;

    if (select char_length(d.content) from public.project_documents d where d.id = v_document)
         - v_longueur + char_length(v_final) > 200000 then
      raise exception 'Le scénario atteindrait sa longueur maximale : cette scène n''y entre plus.'
        using errcode = '22023';
    end if;

    update public.project_documents d
    set content = left(d.content, v_debut) || v_final || substr(d.content, v_debut + v_longueur + 1)
    where d.id = v_document;
  elsif v_proposition.action in ('logline', 'synopsis_short', 'synopsis_standard') then
    select
      case v_proposition.action
        when 'logline' then p.logline
        when 'synopsis_short' then p.short_synopsis
        else p.synopsis
      end
    into v_ancien
    from public.projects p
    where p.id = v_proposition.project_id
    for update;

    update public.projects
    set logline = case when v_proposition.action = 'logline' then v_final else logline end,
        short_synopsis =
          case when v_proposition.action = 'synopsis_short' then v_final else short_synopsis end,
        synopsis =
          case when v_proposition.action = 'synopsis_standard' then v_final else synopsis end
    where id = v_proposition.project_id;
  else
    case v_proposition.action
      when 'synopsis_detailed' then
        v_type := 'synopsis';
        v_titre := 'Synopsis détaillé';
      when 'dramatic_analysis' then
        v_type := 'analyse';
        v_titre := 'Analyse dramaturgique';
      when 'treatment' then
        v_type := 'traitement';
        v_titre := 'Traitement';
      when 'bible' then
        v_type := 'bible';
        v_titre := 'Bible de série';
      when 'screenplay' then
        v_type := 'scenario';
        v_titre := 'Scénario';
      when 'direction_note' then
        v_type := 'note_realisation';
        v_titre := 'Note de réalisation';
      when 'pitch_extended' then
        v_type := 'pitch_developpe';
        v_titre := 'Pitch développé';
      when 'pitch_oral' then
        v_type := 'pitch_oral';
        v_titre := 'Pitch oral';
      else
        v_type := 'note_intention';
        v_titre := 'Note d''intention';
    end case;

    select d.id, d.content into v_document, v_ancien
    from public.project_documents d
    where d.project_id = v_proposition.project_id
      and d.type = v_type
    order by d.updated_at desc, d.id
    limit 1
    for update;

    if v_document is null then
      insert into public.project_documents (project_id, type, title, content)
      values (v_proposition.project_id, v_type, v_titre, v_final);
      v_ancien := null;
    elsif v_proposition.action = 'screenplay' then
      if char_length(v_ancien) + 2 + char_length(v_final) > 200000 then
        raise exception 'Le scénario atteindrait sa longueur maximale : cette séquence n''y entre plus.'
          using errcode = '22023';
      end if;
      update public.project_documents
      set content = case
        when btrim(v_ancien) = '' then v_final
        else v_ancien || E'\n\n' || v_final
      end
      where id = v_document;
      v_ancien := '';
    else
      update public.project_documents set content = v_final where id = v_document;
    end if;
  end if;

  update public.ai_suggestions
  set state = 'accepted',
      final_content = v_final,
      replaced_content = v_ancien,
      decided_by = (select auth.uid()),
      decided_at = now()
  where id = v_proposition.id
  returning * into v_proposition;

  return v_proposition;
end;
$$;
