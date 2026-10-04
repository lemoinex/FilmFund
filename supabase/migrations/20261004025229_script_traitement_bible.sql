-- SCRIPT : traitement et bible (lot J1).
--
-- Deux livrables de plus sur le chemin de WEAVER, inchangé depuis le lot I2 :
-- devis, réservation, tâche, worker, proposition, acceptation. Le barème les
-- connaît depuis sa mise en place — traitement 8 unités, bible 10 — et
-- `creer_devis` les facture déjà : rien n'y est touché.
--
-- Ce que cette migration ouvre :
--   1. le type de document `bible` ;
--   2. `contexte_redaction` pour les deux actions ;
--   3. `livrer_proposition`, qui les refusait ;
--   4. `accepter_proposition`, qui ne savait pas où les écrire.
--
-- Où atterrit un texte accepté :
--   treatment -> document de type `traitement`
--   bible     -> document de type `bible`
-- Comme pour le synopsis détaillé et la note d'intention : le document le
-- plus récemment modifié de son type, versionné par le déclencheur du lot B,
-- créé en brouillon s'il n'en existe pas.
--
-- Limite assumée : une proposition plafonne à 20 000 caractères
-- (`proposition_non_vide`), soit une dizaine de pages. Un traitement de long
-- métrage en fait davantage ; celui que SCRIPT produit sera donc condensé.
-- Lever ce plafond, ou livrer par parties, est la décision du lot J2.
--
-- Aucune table ni politique nouvelles. Aucune donnée réécrite.
--
-- Retour arrière — aucune donnée perdue :
--   rétablir `contexte_redaction`, `livrer_proposition` et
--   `accepter_proposition` de la migration 20261003234544_weaver_synopsis.
--   Les propositions déjà déposées restent lisibles ; une proposition de
--   traitement ou de bible en attente ne s'appliquerait plus. La valeur
--   `bible` de `document_type` ne se retire pas : un enum ne rétrécit pas.

-- ---------------------------------------------------------------------------
-- Un type de document pour la bible
-- ---------------------------------------------------------------------------

-- Placée après `traitement` : l'ordre de l'enum est celui dans lequel un
-- dossier range ses documents, et une bible de série vient après le
-- traitement, avant le scénario.
--
-- Aucune autre instruction de cette migration ne nomme cette valeur en
-- dehors du corps d'une fonction : PostgreSQL interdit d'employer une valeur
-- d'enum ajoutée dans la transaction qui l'ajoute.
alter type public.document_type add value if not exists 'bible' before 'scenario';

-- ---------------------------------------------------------------------------
-- Contexte de rédaction
-- ---------------------------------------------------------------------------

-- Reprise de la migration weaver_synopsis, avec un seul changement : les deux
-- actions de SCRIPT rejoignent la liste. Le contexte lui-même ne bouge pas —
-- fiche du projet, personnages, vision, documents finalisés.
create or replace function public.contexte_redaction(p_attempt_id uuid)
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
    and j.action in (
      'synopsis_short', 'synopsis_standard', 'synopsis_detailed', 'intention_note',
      'treatment', 'bible'
    );

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
    'vision', jsonb_build_object(
      'artistique', v_projet.artistic_vision,
      'objectifs', v_projet.goals,
      'public', v_projet.audience
    ),
    -- Finalisés seulement, comme dans un dossier : un brouillon en cours
    -- d'écriture n'a pas à nourrir une génération.
    'documents', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('type', d.type, 'titre', d.title, 'contenu', d.content)
          order by d.type, d.created_at, d.id
        )
        from public.project_documents d
        where d.project_id = v_projet.id
          and d.status = 'finalise'
      ),
      '[]'::jsonb
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Dépôt d'une proposition
-- ---------------------------------------------------------------------------

-- Reprise de la migration weaver_synopsis, avec deux bornes de plus. Les deux
-- livrables de SCRIPT touchent le plafond de la table des propositions :
-- 20 000 caractères.
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
    when 'treatment' then v_max := 20000;
    when 'bible' then v_max := 20000;
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

-- Reprise de la migration weaver_synopsis, avec deux atterrissages de plus,
-- tous deux en document. Le reste est inchangé.
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
    when 'treatment' then v_max := 20000;
    when 'bible' then v_max := 20000;
    else
      raise exception 'Cette proposition ne peut pas encore être appliquée.' using errcode = '0A000';
  end case;

  if char_length(v_final) > v_max then
    raise exception 'Le texte appliqué ne peut pas dépasser % caractères.', v_max
      using errcode = '22023';
  end if;

  if v_proposition.action in ('logline', 'synopsis_short', 'synopsis_standard') then
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
      when 'treatment' then
        v_type := 'traitement';
        v_titre := 'Traitement';
      when 'bible' then
        v_type := 'bible';
        v_titre := 'Bible de série';
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
