-- SCRIPT : le scénario, une séquence par demande (lot J2a).
--
-- Décision 8, tranchée le 5 octobre 2026 : un scénario ne tient ni dans une
-- proposition — 20 000 caractères — ni dans un appel au fournisseur. Il se
-- livre donc séquence par séquence, comme le devis le chiffre depuis sa mise
-- en place (`screenplay_per_sequence`). Chaque demande écrit une séquence,
-- décrite par l'équipe ; la proposition acceptée s'ajoute à la fin du
-- document « Scénario », qui en garde une version.
--
-- Ce que cette migration ouvre :
--   1. `creer_devis` : une séquence par demande, avec sa description ;
--   2. `contexte_redaction` : la description, et la fin du scénario déjà écrit ;
--   3. `livrer_proposition`, qui refusait l'action ;
--   4. `accepter_proposition`, qui ajoute au document au lieu de le remplacer.
--
-- Le barème ne change pas : la colonne existe, à 2 unités par séquence.
-- Aucune table, politique ni droit nouveaux : les quatre fonctions gardent
-- les droits que leurs migrations leur ont donnés. Aucune donnée réécrite.
--
-- Retour arrière — aucune donnée perdue :
--   rétablir `creer_devis` de la migration 20261004160108_field_budget, puis
--   `contexte_redaction`, `livrer_proposition` et `accepter_proposition` de
--   la migration 20261004102540_arc_analyse. Les propositions déjà déposées
--   restent lisibles ; une séquence en attente ne s'appliquerait plus. Les
--   séquences déjà ajoutées à un scénario y restent, avec leurs versions.

-- ---------------------------------------------------------------------------
-- Devis : une séquence, et sa description
-- ---------------------------------------------------------------------------

-- Reprise de la migration field_budget, avec un seul changement : le scénario.
-- Le devis admettait jusqu'à 500 séquences, que rien n'exécutait. Le worker en
-- écrit une par tâche : en facturer davantage ferait payer ce qui ne serait
-- pas produit. La description voyage dans les paramètres du devis, donc de la
-- tâche ; elle est bornée ici, avant toute réservation.
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
    when 'treatment' then v_quantite := v_bareme.treatment;
    when 'bible' then v_quantite := v_bareme.bible;
    when 'screenplay' then
      -- Une séquence par demande : le plafond du paramètre est 1.
      v_quantite := v_bareme.screenplay_per_sequence
        * public.parametre_entier(v_parametres, 'sequences', 1);
      v_sequence := v_parametres ->> 'sequence';
      if jsonb_typeof(v_parametres -> 'sequence') is distinct from 'string'
         or char_length(btrim(v_sequence)) not between 1 and 800
         or regexp_replace(v_sequence, '[\n\r\t]', '', 'g') ~ '[[:cntrl:]]' then
        raise exception 'Décrivez la séquence à écrire : de 1 à 800 caractères.'
          using errcode = '22023';
      end if;
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
-- Contexte de rédaction
-- ---------------------------------------------------------------------------

-- Reprise de la migration arc_analyse, avec le scénario en plus. Pour les
-- autres actions, rien ne change : leur contexte est rendu à l'identique, et
-- leurs profils gardent donc leur version.
--
-- Une séquence demande deux choses de plus : sa description, écrite par
-- l'équipe, et la fin du scénario déjà écrit, pour que la séquence s'y
-- raccorde. Cette fin est lue dans le document où la séquence atterrira,
-- brouillon compris — c'est la seule exception à « finalisés seulement » : on
-- n'enchaîne pas sur un texte qu'on n'a pas lu. Le scénario n'est alors pas
-- répété parmi les documents finalisés.
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
      'dramatic_analysis', 'treatment', 'bible', 'screenplay'
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
          and (v_job.action <> 'screenplay' or d.type <> 'scenario')
      ),
      '[]'::jsonb
    )
  ) || case
    when v_job.action = 'screenplay' then jsonb_build_object(
      'sequence', v_job.params ->> 'sequence',
      -- Le document que l'acceptation complétera : le plus récemment modifié
      -- de son type. Sa longueur dit à l'agent où il en est ; ses 6 000
      -- derniers caractères, sur quoi enchaîner.
      'scenario', (
        select jsonb_build_object(
          'longueur', char_length(d.content),
          'fin', right(d.content, 6000)
        )
        from public.project_documents d
        where d.project_id = v_projet.id
          and d.type = 'scenario'
        order by d.updated_at desc, d.id
        limit 1
      )
    )
    else '{}'::jsonb
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dépôt d'une proposition
-- ---------------------------------------------------------------------------

-- Reprise de la migration arc_analyse, avec une borne de plus.
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

-- Reprise de la migration arc_analyse, avec un atterrissage de plus — et le
-- premier qui ajoute au lieu de remplacer. Une séquence acceptée se place à
-- la fin du document « Scénario », après une ligne vide ; ce qui précède
-- n'est pas touché, et le déclencheur du lot B en garde une version. Le
-- document plafonne à 200 000 caractères : une séquence qui l'en ferait
-- sortir est refusée ici, avec un message qui le dit, plutôt que par la
-- contrainte de la colonne.
--
-- `replaced_content` dit ce qu'une acceptation a fait disparaître : rien,
-- pour un ajout. Il vaut donc une chaîne vide — et reste nul quand le
-- document vient d'être créé.
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
    when 'dramatic_analysis' then v_max := 20000;
    when 'treatment' then v_max := 20000;
    when 'bible' then v_max := 20000;
    when 'screenplay' then v_max := 20000;
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
