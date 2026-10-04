-- WEAVER : synopsis court, standard, détaillé et note d'intention (lot I2a).
--
-- Quatre actions de plus sur le chemin du pitch, déjà livré par le lot I1 :
-- devis, réservation, tâche, worker, proposition, acceptation. Le devis les
-- connaît depuis la mise en place du barème (`text_unit_rate_versions` porte
-- déjà leurs unités, et `creer_devis` les facture) : rien n'y est touché.
--
-- Ce que cette migration ouvre :
--   1. `contexte_redaction()`, le contexte riche d'une tâche de rédaction —
--      la fiche du lot R1, les personnages, les documents finalisés ;
--   2. `livrer_proposition`, qui n'acceptait que la logline ;
--   3. `accepter_proposition`, qui ne savait écrire que `projects.logline` ;
--   4. le type de document `synopsis`, pour le synopsis détaillé.
--
-- `contexte_travail()` n'est pas touchée. Le profil `weaver.logline@1` a été
-- écrit pour ce qu'elle rend : lui en donner davantage changerait ce que
-- l'agent voit, donc le profil, donc sa version. La logline garde son
-- contexte jusqu'à une éventuelle version 2 ; les nouvelles actions lisent le
-- contexte riche. Deux fonctions, deux profils, aucun chemin d'appel en
-- double.
--
-- Où atterrit un texte accepté :
--   logline            -> projects.logline
--   synopsis_short     -> projects.short_synopsis
--   synopsis_standard  -> projects.synopsis
--   synopsis_detailed  -> document de type `synopsis`
--   intention_note     -> document de type `note_intention`
-- Un document reçoit une version par le déclencheur du lot B : rien n'est
-- écrasé sans trace, et le texte remplacé reste dans la proposition.
--
-- Aucune table ni politique nouvelles. Aucune donnée réécrite.
--
-- Retour arrière — aucune donnée perdue :
--   rétablir `livrer_proposition` et `accepter_proposition` de la migration
--   20261001091842_passerelle_ia, puis `drop function
--   public.contexte_redaction(uuid)`. Les propositions déjà déposées restent
--   lisibles ; une proposition de synopsis en attente ne s'appliquerait plus.
--   La valeur `synopsis` de `document_type` ne se retire pas : un enum ne
--   rétrécit pas. Les documents de ce type, s'il en existe, resteraient
--   lisibles et exportables.

-- ---------------------------------------------------------------------------
-- Un type de document pour le synopsis détaillé
-- ---------------------------------------------------------------------------

-- Placé avant `traitement` : l'ordre de l'enum est celui dans lequel un
-- dossier range ses documents, et un synopsis vient avant un traitement.
--
-- Aucune autre instruction de cette migration ne nomme cette valeur en
-- dehors du corps d'une fonction : PostgreSQL interdit d'employer une valeur
-- d'enum ajoutée dans la transaction qui l'ajoute.
alter type public.document_type add value if not exists 'synopsis' before 'traitement';

-- ---------------------------------------------------------------------------
-- Contexte d'une tâche de rédaction
-- ---------------------------------------------------------------------------

-- Ce que le worker a le droit de lire pour rédiger : le projet de la tâche
-- qu'il tient, et rien d'autre. Même forme que `contenu_dossier` — un objet
-- par bloc, des clés françaises — pour que l'agent et l'export décrivent un
-- projet de la même façon.
--
-- `security definer` : le worker n'a aucun droit sur les tables. La fonction
-- est bornée à un essai en cours, donc à une tâche réclamée par le worker ;
-- sans cela elle lirait n'importe quel projet.
--
-- Ni auteur, ni dates, ni identifiants de comptes : rien qui désigne un
-- membre de l'équipe ne part chez un fournisseur.
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
    and j.action in ('synopsis_short', 'synopsis_standard', 'synopsis_detailed', 'intention_note');

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

comment on function public.contexte_redaction(uuid) is
  'Contexte du projet d''une tâche de rédaction WEAVER. Réservée au rôle du worker, bornée à l''essai en cours.';

-- Supabase accorde l'exécution de toute fonction nouvelle à anon et
-- authenticated : les deux droits sont retirés nommément, puis seul le
-- worker le reçoit.
revoke all on function public.contexte_redaction(uuid) from public, anon, authenticated;
grant execute on function public.contexte_redaction(uuid) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Dépôt d'une proposition
-- ---------------------------------------------------------------------------

-- Reprise de la migration passerelle_ia, avec un seul changement : les cinq
-- actions de WEAVER au lieu de la seule logline, chacune avec sa longueur
-- maximale. Les bornes suivent les colonnes où le texte atterrira, et la
-- proposition elle-même plafonne à 20 000 caractères (`proposition_non_vide`).
--
-- Une logline reste d'un seul paragraphe. Les autres livrables en comptent
-- plusieurs : seuls les caractères de contrôle autres que le saut de ligne et
-- la tabulation y sont refusés.
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

-- Reprise de la migration passerelle_ia, avec un seul changement : chaque
-- action sait où son texte atterrit. Le reste est inchangé — porteur ou
-- éditeur seulement, mode privé respecté, texte modifiable avant
-- application, texte remplacé conservé, rejouer renvoie la proposition.
--
-- Un synopsis détaillé et une note d'intention atterrissent dans un
-- document : le plus récemment modifié de son type, comme le tableau de bord
-- le cherche ; à défaut, un document est créé, en brouillon — c'est à
-- l'équipe de le finaliser, et un dossier n'emporte que des documents
-- finalisés.
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
    if v_proposition.action = 'synopsis_detailed' then
      v_type := 'synopsis';
      v_titre := 'Synopsis détaillé';
    else
      v_type := 'note_intention';
      v_titre := 'Note d''intention';
    end if;

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
