-- SCRIPT : la séquence d'un épisode (lot SE3b).
--
-- Depuis le lot SE3a, un épisode a son scénario. Mais la demande de séquence
-- ne désignait aucun document : la base choisissait « le scénario le plus
-- récemment modifié », au contexte comme à l'acceptation. Avec un scénario par
-- épisode, une séquence s'ajoutait à celui qu'on avait touché en dernier.
--
-- Cette migration ne change aucun schéma. Elle reprend trois fonctions, pour
-- un paramètre facultatif de la demande : `episode`.
--
--   1. `creer_devis` : l'épisode désigné est un épisode de ce projet, contrôlé
--      avant toute réservation ;
--   2. `contexte_redaction` : la séquence d'un épisode reçoit cet épisode, la
--      saison où il se place et la fin de SON scénario ; les scénarios des
--      autres épisodes ne partent pas, même finalisés ;
--   3. `accepter_proposition` : la séquence s'ajoute au scénario de son
--      épisode, créé en brouillon et rattaché s'il n'existe pas encore.
--
-- Décisions du 9 octobre 2026 :
--   - sans épisode, la demande ne vise que les scénarios sans épisode. Pour un
--     film, rien ne change ; dans une série, elle ne s'ajoute plus jamais au
--     scénario d'un épisode ;
--   - si l'épisode a été retiré entre la demande et l'acceptation, celle-ci
--     est refusée (`SE004`) : rien n'est écrit ailleurs. Retiré avant l'appel,
--     le contexte ne rend rien, et rien ne part chez le fournisseur ;
--   - le profil de SCRIPT ne change pas : `script.scenario@1`. Le contexte dit
--     de lui-même de quel épisode il s'agit.
--
-- Le prix ne change pas : une séquence par demande, au barème. Les droits des
-- trois fonctions ne changent pas : `create or replace` les garde.
--
-- Retour arrière — aucune donnée n'est touchée :
--   rétablir `creer_devis` de la migration 20261009180000_script_episodes,
--   `contexte_redaction` de 20261007210000_weaver_realisation_pitch et
--   `accepter_proposition` de 20261008180000_weaver_retouches.

-- ---------------------------------------------------------------------------
-- Devis : un épisode peut être désigné
-- ---------------------------------------------------------------------------

-- Même fonction qu'au lot SE2a, un contrôle de plus dans le cas du scénario.
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
    when 'episode_list' then
      -- Des épisodes ne se proposent qu'à une série, et tant qu'un numéro
      -- reste libre : rien de ce qui serait proposé ne pourrait être accepté.
      -- Refusé ici, avant toute réservation.
      if not exists (
        select 1 from public.projects p
        where p.id = p_project_id and p.format in ('serie', 'web_serie')
      ) then
        raise exception 'Les épisodes sont réservés aux projets de série.' using errcode = '55000';
      end if;
      if (
        select coalesce(max(e.number), 0) from public.project_episodes e
        where e.project_id = p_project_id
      ) >= 500 then
        raise exception 'Cette série a atteint son dernier numéro d''épisode : aucun autre ne peut y être ajouté.'
          using errcode = '55000';
      end if;
      v_quantite := v_bareme.episode_list;
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
      -- Un épisode, s'il est désigné : un épisode de ce projet. Contrôlé ici,
      -- avant toute réservation ; sans lui, la séquence vise un scénario sans
      -- épisode.
      if v_parametres ? 'episode' and (
           jsonb_typeof(v_parametres -> 'episode') is distinct from 'string'
           or (v_parametres ->> 'episode') !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
           or not exists (
             select 1 from public.project_episodes e
             where e.id::text = lower(v_parametres ->> 'episode') and e.project_id = p_project_id
           )
         ) then
        raise exception 'Désignez un épisode de ce projet.' using errcode = '22023';
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
-- Contexte : le scénario de l'épisode, et lui seul
-- ---------------------------------------------------------------------------

-- Même fonction qu'au lot X1, le cas de l'épisode en plus.
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
  v_scenario uuid;
  v_episode public.project_episodes;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action in (
      'synopsis_short', 'synopsis_standard', 'synopsis_detailed', 'intention_note',
      'direction_note', 'pitch_extended', 'pitch_oral',
      'dramatic_analysis', 'treatment', 'bible', 'screenplay'
    );

  if v_job.id is null then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  if v_projet.id is null then
    return null;
  end if;

  -- Le document que l'acceptation complétera, comme `accepter_proposition`
  -- le choisit : le scénario de l'épisode désigné à la demande ; sans
  -- épisode, le scénario sans épisode le plus récemment modifié.
  if v_job.action = 'screenplay' then
    if v_job.params ? 'episode' then
      select e.* into v_episode
      from public.project_episodes e
      where e.id::text = lower(v_job.params ->> 'episode') and e.project_id = v_projet.id;
      -- L'épisode a été retiré depuis la demande : rien ne part.
      if v_episode.id is null then
        return null;
      end if;
    end if;

    select d.id into v_scenario
    from public.project_documents d
    where d.project_id = v_projet.id
      and d.type = 'scenario'
      and d.episode_id is not distinct from v_episode.id
    order by d.updated_at desc, d.id
    limit 1;
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
          -- Seul le document cible est écarté : sa fin est donnée plus bas.
          -- Un autre scénario finalisé reste lu en entier.
          and d.id is distinct from v_scenario
          -- Pour la séquence d'un épisode, les scénarios des autres épisodes
          -- ne partent pas : chacun peut compter 200 000 caractères.
          and not (v_episode.id is not null and d.episode_id is not null)
      ),
      '[]'::jsonb
    )
  ) || case
    when v_job.action = 'screenplay' then jsonb_build_object(
      'sequence', v_job.params ->> 'sequence',
      -- Sa longueur dit à l'agent où il en est ; ses 6 000 derniers
      -- caractères, sur quoi enchaîner.
      'scenario', (
        select jsonb_build_object(
          'longueur', char_length(d.content),
          'fin', right(d.content, 6000)
        )
        from public.project_documents d
        where d.id = v_scenario
      )
    ) || case
      -- L'épisode à écrire, et la saison où il se place : cent épisodes au
      -- plus, le début de chaque résumé.
      when v_episode.id is not null then jsonb_build_object(
        'episode', jsonb_build_object(
          'numero', v_episode.number,
          'titre', v_episode.title,
          'resume', v_episode.summary
        ),
        'saison', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('numero', t.number, 'titre', t.title, 'resume', left(t.summary, 300))
              order by t.number
            )
            from (
              select e.* from public.project_episodes e
              where e.project_id = v_projet.id
              order by e.number
              limit 100
            ) t
          ),
          '[]'::jsonb
        )
      )
      else '{}'::jsonb
    end
    else '{}'::jsonb
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acceptation : la séquence s'ajoute au scénario de son épisode
-- ---------------------------------------------------------------------------

-- Même fonction qu'au lot RT1, le cas de l'épisode en plus.
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
  v_episode uuid;
  v_numero integer;
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

    -- Une séquence vise le scénario de l'épisode désigné à la demande ; sans
    -- épisode, un scénario sans épisode. Si l'épisode a été retiré depuis,
    -- rien n'est écrit ailleurs : la proposition reste lisible, et l'équipe
    -- la reporte à la main ou l'écarte.
    if v_proposition.action = 'screenplay' then
      select j.params into v_parametres from public.jobs j where j.id = v_proposition.job_id;
      if v_parametres ? 'episode' then
        select e.id, e.number into v_episode, v_numero
        from public.project_episodes e
        where e.id::text = lower(v_parametres ->> 'episode')
          and e.project_id = v_proposition.project_id;
        if v_episode is null then
          raise exception 'L''épisode de cette séquence n''existe plus : elle ne peut plus y être ajoutée.'
            using errcode = 'SE004';
        end if;
        v_titre := 'Scénario — épisode ' || v_numero;
      end if;
    end if;

    select d.id, d.content into v_document, v_ancien
    from public.project_documents d
    where d.project_id = v_proposition.project_id
      and d.type = v_type
      and (v_proposition.action <> 'screenplay' or d.episode_id is not distinct from v_episode)
    order by d.updated_at desc, d.id
    limit 1
    for update;

    if v_document is null then
      insert into public.project_documents (project_id, type, title, content, episode_id)
      values (v_proposition.project_id, v_type, v_titre, v_final, v_episode);
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
