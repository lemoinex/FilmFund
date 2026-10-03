-- Exports DOCX d'un projet (lot M3).
--
-- Décidé par l'utilisateur le 3 octobre 2026 : le même dossier que le PDF,
-- composé à la carte sur le même écran, peut sortir en Word ; un export Word
-- consomme la même unité d'export qu'un PDF, sur le même quota.
--
-- Le format n'est pas un paramètre de la demande : c'est l'action elle-même,
-- `pdf_export` ou `docx_export`. Le devis d'un format a donc une autre
-- empreinte que celui de l'autre, le worker sait quoi produire sans relire la
-- base, et un worker qui ne connaît pas encore `docx_export` laisse ces
-- tâches en attente.
--
-- L'unité reste nommée `pdf` en base : c'est l'unité d'export des plans
-- (`pdf_exports_per_month`), et la renommer obligerait à republier chaque
-- version de plan. Seuls les libellés de l'application changent.
--
-- Aucune table, aucune politique nouvelles : un export Word se lit comme un
-- export PDF, par le porteur, les éditeurs et les administrateurs.
--
-- Retour arrière — les fichiers Word seraient perdus :
--   delete from public.project_exports where format = 'docx';
--   rétablir creer_devis, contexte_export et livrer_export de la migration
--   20261002181851_exports_pdf (et 20261001044633 pour creer_devis) ;
--   remplacer export_disponible(uuid, jsonb, text) par sa forme à deux
--   arguments ; rétablir les contraintes export_fichier_pdf et export_pages,
--   puis retirer la colonne format et l'action docx_export des devis.

-- ---------------------------------------------------------------------------
-- Devis : l'action docx_export
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
      'treatment',
      'bible',
      'screenplay',
      'dialogue',
      'image',
      'pdf_export',
      'docx_export'
    )
  );

-- Reprise de la définition de la migration devis_reservations, avec un seul
-- ajout : `docx_export` compte une unité d'export, comme `pdf_export`.
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
    when 'pdf_export', 'docx_export' then
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
-- Exports : le format de chaque fichier
-- ---------------------------------------------------------------------------

-- Un DOCX est une archive ZIP : il commence par « PK\x03\x04 ». Il n'a pas de
-- nombre de pages fixe — le traitement de texte le recalcule à l'ouverture —,
-- si bien que `pages` n'est exigé que d'un PDF. `coalesce` : un format hors
-- liste rendrait le `case` nul, et une contrainte nulle passerait.
alter table public.project_exports
  add column format text not null default 'pdf',
  alter column pages drop not null,
  drop constraint export_fichier_pdf,
  drop constraint export_pages,
  add constraint export_format check (format in ('pdf', 'docx')),
  add constraint export_fichier check (
    octet_length(file) between 5 and 5242880
    and coalesce(
      case format
        when 'pdf' then substring(file from 1 for 5) = '\x255044462d'::bytea
        when 'docx' then substring(file from 1 for 4) = '\x504b0304'::bytea
      end,
      false
    )
  ),
  add constraint export_pages check (
    coalesce(
      case format
        when 'pdf' then pages between 1 and 2000
        when 'docx' then pages is null
      end,
      false
    )
  );

comment on table public.project_exports is
  'Dossiers d''un projet, en PDF ou en Word, déposés par le worker. Écrits par les fonctions uniquement ; conservés 30 jours.';

comment on column public.project_exports.format is
  'pdf ou docx, selon l''action de la tâche (pdf_export, docx_export).';

-- ---------------------------------------------------------------------------
-- Fonction des comptes connectés
-- ---------------------------------------------------------------------------

-- Le même contenu peut exister dans les deux formats : la recherche d'un
-- export identique porte désormais sur le format aussi. Par défaut, le PDF :
-- un appel à deux arguments garde son sens.
drop function public.export_disponible(uuid, jsonb);

create function public.export_disponible(
  p_project_id uuid,
  p_params jsonb,
  p_format text default 'pdf'
)
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$
  select e.id
  from public.project_exports e
  where e.project_id = p_project_id
    and e.format = p_format
    and e.expires_at > now()
    and e.content_fingerprint = public.empreinte_dossier(p_project_id, p_params)
  order by e.created_at desc
  limit 1;
$$;

revoke all on function public.export_disponible(uuid, jsonb, text) from public, anon;
grant execute on function public.export_disponible(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Reprise de la migration exports_pdf : les deux actions d'export, et le
-- format attendu remis avec le contenu.
create or replace function public.contexte_export(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_contenu jsonb;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action in ('pdf_export', 'docx_export');

  if v_job.id is null then
    return null;
  end if;

  v_contenu := public.contenu_dossier(v_job.project_id, v_job.params);
  if v_contenu is null then
    return null;
  end if;

  return jsonb_build_object(
    'contenu', v_contenu,
    'empreinte', public.empreinte_contenu(v_contenu),
    'format', case v_job.action when 'docx_export' then 'docx' else 'pdf' end
  );
end;
$$;

-- Reprise de la migration exports_pdf : le fichier est contrôlé selon le
-- format de la tâche. Le worker n'est pas cru sur parole — un PDF déposé pour
-- une tâche Word, ou l'inverse, est refusé.
create or replace function public.livrer_export(
  p_attempt_id uuid,
  p_file bytea,
  p_pages integer,
  p_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_format text;
  v_export uuid;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  v_format := case v_job.action
    when 'pdf_export' then 'pdf'
    when 'docx_export' then 'docx'
  end;
  if v_format is null then
    raise exception 'Aucun export n''est prévu pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  if p_file is null
     or octet_length(p_file) not between 5 and 5242880
     or (v_format = 'pdf' and substring(p_file from 1 for 5) <> '\x255044462d'::bytea)
     or (v_format = 'docx' and substring(p_file from 1 for 4) <> '\x504b0304'::bytea) then
    raise exception 'Fichier invalide : un % de 5 Mo au plus est attendu.', upper(v_format)
      using errcode = '22023';
  end if;
  if v_format = 'pdf' and (p_pages is null or p_pages not between 1 and 2000) then
    raise exception 'Nombre de pages invalide.' using errcode = '22023';
  end if;
  if v_format = 'docx' and p_pages is not null then
    raise exception 'Un fichier Word ne déclare pas de nombre de pages.' using errcode = '22023';
  end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte invalide.' using errcode = '22023';
  end if;

  insert into public.project_exports (
    job_id, studio_id, project_id, created_by, params, content_fingerprint, file, pages, format
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.created_by,
    public.parametres_export(v_job.params), p_fingerprint, p_file, p_pages, v_format
  )
  returning id into v_export;

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_export;
end;
$$;
