-- BOARD : vignettes du storyboard (lot K1).
--
-- Premier livrable qui n'est ni un texte ni des lignes : une image. Décision 7
-- tranchée par l'utilisateur le 6 octobre 2026 — OpenAI pour l'image, une
-- image par scène, une scène par demande, et jamais de remplacement d'une
-- vignette sans accord explicite.
--
-- Ce que cette migration ouvre :
--   1. le registre des coûts admet un second fournisseur, `openai` ;
--   2. l'action `storyboard_image` aux devis : une unité d'image, comptée sur
--      le quota d'images du plan, distinct du quota texte, avec la scène à
--      illustrer en paramètre ;
--   3. la table `ai_suggestion_images`, ses politiques, ses garde-fous ;
--   4. le contexte, le dépôt, l'acceptation et l'écart d'une vignette.
--
-- La vignette proposée reste en base, comme un export, tant que l'équipe n'a
-- pas décidé : le worker n'a aucun droit sur le stockage, et n'en reçoit
-- aucun. À l'acceptation, c'est l'application, sous la session de qui décide,
-- qui dépose le fichier dans le compartiment privé ; `accepter_image_proposee`
-- vérifie que l'objet y est, le rattache à la scène et rend l'ancienne image,
-- à supprimer. Rien ne remplace une vignette sans cet appel.
--
-- Le style — croquis à l'encre noire sur fond blanc — ne se contrôle pas en
-- base : il tient au profil du worker et à ses tests.
--
-- Retour arrière — aucune image rattachée à une scène n'est perdue :
--   `drop table public.ai_suggestion_images` ; rétablir
--   `ecarter_lignes_restantes` et `creer_devis` de la migration
--   20261006120000_gear_materiel ; retirer `storyboard_image` de
--   `devis_action_connue` ; rétablir `cout_fournisseur_connu` à `anthropic`
--   seul, s'il n'existe aucun coût d'OpenAI.

-- ---------------------------------------------------------------------------
-- Coûts : un second fournisseur
-- ---------------------------------------------------------------------------

alter table public.provider_charges
  drop constraint cout_fournisseur_connu,
  add constraint cout_fournisseur_connu check (provider in ('anthropic', 'openai'));

-- ---------------------------------------------------------------------------
-- Devis : l'action storyboard_image
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

-- Reprise de la migration gear_materiel, avec un seul ajout : la vignette
-- d'une scène, une unité d'image.
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
-- Vignettes proposées
-- ---------------------------------------------------------------------------

create table public.ai_suggestion_images (
  id uuid primary key default gen_random_uuid(),
  -- Une proposition, une vignette.
  suggestion_id uuid not null unique references public.ai_suggestions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- La scène illustrée. Si l'équipe la supprime, sa vignette proposée part
  -- avec elle : il n'y a plus rien à quoi la rattacher.
  scene_id uuid not null,
  file bytea not null,
  size_bytes integer generated always as (octet_length(file)) stored,
  state text not null default 'proposed',
  -- Chemin retenu dans le stockage à l'acceptation. La scène peut changer
  -- d'image ensuite : la proposition dit ce qui a été décidé, pas ce que le
  -- storyboard montre aujourd'hui.
  accepted_path text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint image_proposee_de_sa_scene foreign key (scene_id, project_id)
    references public.storyboard_scenes (id, project_id) on delete cascade,
  constraint image_proposee_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  -- PNG seulement, 5 Mo au plus : la borne du compartiment des images.
  constraint image_proposee_fichier_png check (
    octet_length(file) between 8 and 5242880
    and substring(file from 1 for 8) = '\x89504e470d0a1a0a'::bytea
  ),
  constraint image_proposee_decision check ((state = 'proposed') = (decided_at is null)),
  constraint image_proposee_chemin check ((state = 'accepted') = (accepted_path is not null))
);

comment on table public.ai_suggestion_images is
  'Vignette proposée par un agent pour une scène du storyboard : jamais rattachée d''elle-même. Acceptée ou écartée par qui écrit le storyboard.';

create index ai_suggestion_images_scene_idx
  on public.ai_suggestion_images (scene_id, state);

create index ai_suggestion_images_projet_idx
  on public.ai_suggestion_images (project_id);

alter table public.ai_suggestion_images enable row level security;

-- Le storyboard se lit de toute l'équipe : ses propositions aussi.
create policy "L'équipe et les administrateurs lisent les vignettes"
  on public.ai_suggestion_images for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestion_images
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture directe : le worker dépose, l'équipe décide, par fonctions.
revoke all on table public.ai_suggestion_images from anon, authenticated;
grant select on table public.ai_suggestion_images to authenticated;

-- Une vignette proposée ne change que pour être acceptée ou écartée, une
-- fois ; ce que l'agent a produit ne change jamais.
create or replace function public.controler_image_proposee()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    -- Seule la disparition de la proposition, de la scène ou du projet
    -- l'emporte.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Une vignette proposée ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.suggestion_id, new.project_id, new.scene_id, new.created_at)
       is distinct from (old.id, old.suggestion_id, old.project_id, old.scene_id, old.created_at)
     or new.file is distinct from old.file then
    raise exception 'Ce qu''un agent a proposé ne change pas.' using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    raise exception 'Une vignette déjà acceptée ou écartée ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.controler_image_proposee() from public, anon, authenticated;

create trigger ai_suggestion_images_controle
  before update or delete on public.ai_suggestion_images
  for each row
  execute function public.controler_image_proposee();

create trigger ai_suggestion_images_pas_de_vidage
  before truncate on public.ai_suggestion_images
  for each statement
  execute function public.registre_en_ajout_seul();

-- Reprise de la migration gear_materiel, pour les cinq tables filles : écarter
-- la proposition entière, c'est écarter ce qui restait à décider. Le
-- déclencheur `ai_suggestions_ecarte_les_lignes` reste celui du lot J3b-1.
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
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Ce que BOARD lit pour dessiner une scène : la scène, ses premiers plans,
-- et la vision artistique du projet. Ni scénario, ni budget, ni équipe, ni
-- identité, ni autre document. Null si l'essai n'est pas l'essai en cours
-- d'une tâche de vignette, ou si la scène n'existe plus : rien ne doit alors
-- être envoyé.
create or replace function public.contexte_image(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_projet public.projects;
  v_scene public.storyboard_scenes;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'storyboard_image';

  if v_job.id is null
     or (v_job.params ->> 'scene') is null
     or (v_job.params ->> 'scene') !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$' then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  select s.* into v_scene
  from public.storyboard_scenes s
  where s.id = (v_job.params ->> 'scene')::uuid and s.project_id = v_job.project_id;

  if v_projet.id is null or v_scene.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'action', v_job.action,
    'projet', jsonb_build_object(
      'format', v_projet.format,
      'genre', v_projet.genre,
      'vision', v_projet.artistic_vision
    ),
    'scene', jsonb_build_object(
      'titre', v_scene.title,
      'decor', v_scene.setting,
      'lieu', v_scene.location,
      'moment', v_scene.time_of_day,
      'cadrage', v_scene.shot,
      'description', v_scene.description
    ),
    -- Les six premiers plans du découpage : de quoi choisir le cadre, sans
    -- demander six images.
    'plans', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cadrage', t.shot, 'angle', t.angle, 'description', t.description
          )
          order by t.position
        )
        from (
          select p.* from public.scene_shots p
          where p.scene_id = v_scene.id
          order by p.position
          limit 6
        ) t
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.contexte_image(uuid) from public, anon, authenticated;
grant execute on function public.contexte_image(uuid) to filmfund_worker;

-- Dépôt de la vignette. Le fichier est contrôlé ici, quoi qu'ait déjà vérifié
-- le worker : la base ne se fie pas à ce qu'on lui remet.
create or replace function public.livrer_proposition_image(p_attempt_id uuid, p_file bytea)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_charge public.provider_charges;
  v_scene public.storyboard_scenes;
  v_proposition uuid;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'storyboard_image' then
    raise exception 'Aucune vignette n''est prévue pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  -- La scène a pu être supprimée pendant l'appel : il n'y a plus rien à
  -- quoi rattacher la vignette.
  select s.* into v_scene
  from public.storyboard_scenes s
  where s.id::text = (v_job.params ->> 'scene') and s.project_id = v_job.project_id;
  if v_scene.id is null then
    raise exception 'La scène à illustrer n''existe plus.' using errcode = '22023';
  end if;

  if p_file is null
     or octet_length(p_file) not between 8 and 5242880
     or substring(p_file from 1 for 8) <> '\x89504e470d0a1a0a'::bytea then
    raise exception 'Vignette invalide : un fichier PNG de 5 Mo au plus est attendu.'
      using errcode = '22023';
  end if;

  -- Le texte de la proposition est écrit ici, sans rien de ce que le modèle
  -- a produit.
  insert into public.ai_suggestions (
    job_id, studio_id, project_id, action, content, profile, model, created_by
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.action,
    'Vignette proposée par l''assistant pour une scène.',
    v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  insert into public.ai_suggestion_images (suggestion_id, project_id, scene_id, file)
  values (v_proposition, v_job.project_id, v_scene.id, p_file);

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

revoke all on function public.livrer_proposition_image(uuid, bytea)
  from public, anon, authenticated;
grant execute on function public.livrer_proposition_image(uuid, bytea) to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Décision de l'équipe
-- ---------------------------------------------------------------------------

-- Verrouille la proposition puis la vignette, toujours dans cet ordre, et
-- rend la vignette si l'appelant a le droit d'en décider : qui écrit le
-- storyboard. Un seul message pour « introuvable » et « interdit ». Interne.
create or replace function public.image_a_decider(p_image_id uuid)
returns public.ai_suggestion_images
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_image public.ai_suggestion_images;
begin
  perform 1
  from public.ai_suggestions s
  join public.ai_suggestion_images i on i.suggestion_id = s.id
  where i.id = p_image_id
  for update of s;

  select i.* into v_image
  from public.ai_suggestion_images i
  where i.id = p_image_id
  for update;

  if v_image.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.peut_editer_contenu(v_image.project_id), false) then
    raise exception 'Vignette proposée introuvable, ou droits insuffisants pour en décider.'
      using errcode = '42501';
  end if;

  return v_image;
end;
$$;

revoke all on function public.image_a_decider(uuid) from public, anon, authenticated;

-- Accepte la vignette : elle devient l'image de sa scène. L'application a
-- déposé le fichier dans le compartiment privé, sous la session de
-- l'appelant ; cette fonction vérifie que l'objet y est, à un chemin de ce
-- projet, puis le rattache. Elle rend le chemin de l'image que la scène
-- portait jusque-là, pour que l'application la supprime : c'est le seul
-- endroit où une vignette en remplace une autre, et il faut l'appeler.
create or replace function public.accepter_image_proposee(p_image_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_image public.ai_suggestion_images;
  v_ancienne text;
begin
  v_image := public.image_a_decider(p_image_id);

  if v_image.state = 'accepted' then
    return null;
  end if;
  if v_image.state <> 'proposed' then
    raise exception 'Cette vignette a déjà été écartée.' using errcode = 'PR001';
  end if;

  -- Le chemin est celui d'une image de scène de ce projet, et l'objet existe.
  if p_path is null
     or p_path not like v_image.project_id::text || '/scenes/%'
     or p_path like '%/../%'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'project-images' and o.name = p_path
     ) then
    raise exception 'Le fichier de la vignette n''a pas été déposé à sa place.'
      using errcode = '22023';
  end if;

  select s.image_path into v_ancienne
  from public.storyboard_scenes s
  where s.id = v_image.scene_id
  for update;

  update public.storyboard_scenes set image_path = p_path where id = v_image.scene_id;

  update public.ai_suggestion_images
  set state = 'accepted', accepted_path = p_path,
      decided_by = (select auth.uid()), decided_at = now()
  where id = v_image.id;

  update public.ai_suggestions s
  set state = 'accepted', decided_by = (select auth.uid()), decided_at = now()
  where s.id = v_image.suggestion_id and s.state = 'proposed';

  return v_ancienne;
end;
$$;

revoke all on function public.accepter_image_proposee(uuid, text)
  from public, anon, authenticated;
grant execute on function public.accepter_image_proposee(uuid, text) to authenticated;

-- Écarte la vignette : la scène garde l'image qu'elle avait, ou n'en a pas.
create or replace function public.ecarter_image_proposee(p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_image public.ai_suggestion_images;
begin
  v_image := public.image_a_decider(p_image_id);

  if v_image.state = 'dismissed' then
    return;
  end if;
  if v_image.state <> 'proposed' then
    raise exception 'Cette vignette a déjà été acceptée.' using errcode = 'PR001';
  end if;

  update public.ai_suggestion_images
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_image.id;

  update public.ai_suggestions s
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where s.id = v_image.suggestion_id and s.state = 'proposed';
end;
$$;

revoke all on function public.ecarter_image_proposee(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_image_proposee(uuid) to authenticated;
