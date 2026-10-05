-- VOICE : les dialogues d'une scène (lot J2b-1).
--
-- Réécrire les répliques d'une scène, c'est remplacer un passage du scénario
-- sans toucher au reste. Le scénario est un texte continu, sans découpage en
-- scènes : le passage est donc désigné par la demande — document, position,
-- longueur — et scellé par son empreinte.
--
-- Le texte de la scène ne voyage pas dans le devis, plafonné à 2 000 octets :
-- la base le relit elle-même, trois fois, et vérifie chaque fois qu'il est
-- toujours celui qui a été désigné :
--   1. au devis, avant toute réservation ;
--   2. à la préparation de l'appel, par le worker ;
--   3. à l'acceptation, document verrouillé.
-- Si le scénario a changé à cet endroit entre-temps, l'acceptation est
-- refusée : rien n'est remplacé, la proposition reste lisible.
--
-- Ce que cette migration ouvre :
--   1. `passage_du_scenario`, qui relit et contrôle le passage ;
--   2. `creer_devis` : une scène par demande, avec son passage ;
--   3. `contexte_dialogue`, pour le worker ;
--   4. `livrer_proposition`, qui refusait l'action ;
--   5. `accepter_proposition`, qui remplace le passage, et lui seul.
--
-- Le barème ne change pas : la colonne existe, à 1 unité par scène. Aucune
-- table ni politique nouvelles.
--
-- Retour arrière — aucune donnée perdue :
--   rétablir `creer_devis` de la migration 20261005170000_field_planning,
--   `livrer_proposition` et `accepter_proposition` de la migration
--   20261005130000_script_scenario ; `drop function public.contexte_dialogue`
--   puis `public.passage_du_scenario`. Les scènes déjà remplacées restent
--   dans leurs documents, avec leurs versions.

-- ---------------------------------------------------------------------------
-- Le passage désigné
-- ---------------------------------------------------------------------------

-- Rend le passage que désignent les paramètres d'une demande, ou null s'il
-- n'est pas — ou plus — celui qui a été désigné : document d'un autre projet
-- ou d'un autre type, bornes hors du texte, passage vide ou trop long,
-- empreinte différente. Interne : appelée par le devis, le contexte et
-- l'acceptation, jamais depuis l'API.
--
-- Positions en caractères, comme `substr` : le serveur les calcule ainsi
-- avant de demander le devis.
create or replace function public.passage_du_scenario(p_project_id uuid, p_params jsonb)
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
    and d.project_id = p_project_id
    and d.type = 'scenario';

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

revoke all on function public.passage_du_scenario(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Devis : une scène, et son passage
-- ---------------------------------------------------------------------------

-- Reprise de la migration field_planning, avec un seul changement : les
-- dialogues. Le devis admettait jusqu'à 1 000 scènes, que rien n'exécutait.
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
-- Contexte du worker
-- ---------------------------------------------------------------------------

-- Ce que VOICE lit pour réécrire les répliques d'une scène : le projet, ses
-- personnages, la scène elle-même, et ce qui la précède — pour le ton et la
-- continuité. Null si l'essai n'est pas l'essai en cours d'une tâche de
-- dialogues, ou si le passage n'est plus celui qui a été désigné : rien ne
-- part alors chez le fournisseur.
create or replace function public.contexte_dialogue(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_projet public.projects;
  v_scene text;
  v_debut integer;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'dialogue';

  if v_job.id is null then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  v_scene := public.passage_du_scenario(v_job.project_id, v_job.params);
  if v_projet.id is null or v_scene is null then
    return null;
  end if;
  v_debut := (v_job.params ->> 'debut')::integer;

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
    'personnages', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('nom', c.name, 'role', c.role, 'description', c.description)
          order by c.position, c.created_at, c.id
        )
        from public.project_characters c
        where c.project_id = v_projet.id
      ),
      '[]'::jsonb
    ),
    'scene', v_scene,
    -- Les 3 000 caractères qui précèdent la scène, dans le même document.
    'avant', (
      select substr(d.content, greatest(v_debut - 3000, 0) + 1, least(v_debut, 3000))
      from public.project_documents d
      where d.id = (v_job.params ->> 'document')::uuid
    )
  );
end;
$$;

revoke all on function public.contexte_dialogue(uuid) from public, anon, authenticated;
grant execute on function public.contexte_dialogue(uuid) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Dépôt d'une proposition
-- ---------------------------------------------------------------------------

-- Reprise de la migration script_scenario, avec une borne de plus : une scène
-- réécrite tient en 12 000 caractères, le double du passage admis.
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
    when 'dramatic_analysis' then v_max := 20000;
    when 'treatment' then v_max := 20000;
    when 'bible' then v_max := 20000;
    when 'screenplay' then v_max := 20000;
    when 'dialogue' then v_max := 12000;
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

-- ---------------------------------------------------------------------------
-- Acceptation d'une proposition
-- ---------------------------------------------------------------------------

-- Reprise de la migration script_scenario, avec un atterrissage de plus — le
-- premier qui remplace une partie d'un document, et elle seule. Ce qui
-- précède et ce qui suit le passage restent à l'identique ; le déclencheur du
-- lot B garde une version. `replaced_content` porte la scène remplacée.
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
    when 'dramatic_analysis' then v_max := 20000;
    when 'treatment' then v_max := 20000;
    when 'bible' then v_max := 20000;
    when 'screenplay' then v_max := 20000;
    when 'dialogue' then v_max := 12000;
    else
      raise exception 'Cette proposition ne peut pas encore être appliquée.' using errcode = '0A000';
  end case;

  if char_length(v_final) > v_max then
    raise exception 'Le texte appliqué ne peut pas dépasser % caractères.', v_max
      using errcode = '22023';
  end if;

  if v_proposition.action = 'dialogue' then
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
