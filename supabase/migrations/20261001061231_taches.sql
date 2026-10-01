-- Tâches persistantes, essais auprès du fournisseur et rapprochement (lot H1).
--
-- Décision 4 (30 septembre 2026) : une table de tâches dans PostgreSQL,
-- exécutées par un worker Node sur Railway (lot H2), qui les réclame par
-- `FOR UPDATE SKIP LOCKED`. Décisions du 1er octobre 2026 : le worker se
-- connecte sous un rôle PostgreSQL dédié, sans aucun droit sur les tables,
-- qui ne peut qu'exécuter les fonctions ci-dessous.
--
-- Garanties :
--   - une tâche naît dans la transaction de sa réservation (déclencheur) :
--     elle ne peut ni manquer ni exister sans réservation — l'outbox est la
--     table elle-même ;
--   - deux workers ne prennent jamais la même tâche, et une tâche déjà prise
--     ne l'est pas une seconde fois ;
--   - avant l'exécution, les droits de l'auteur sont revérifiés : retirés,
--     ou fermés par le mode privé, la tâche est annulée et rendue ;
--   - le worker marque l'essai « soumis » avant d'appeler le fournisseur.
--     Si son bail expire après ce point, l'issue est inconnue : la tâche
--     passe « à rapprocher », sans relance à l'aveugle. Avant ce point, rien
--     n'a été envoyé : la tâche repart sans risque ;
--   - deux essais au plus : une seule reprise automatique ;
--   - la réservation est réglée — consommée ou rendue — exactement une fois,
--     par regler_reservation() (lot G).
--
-- Une tâche change d'état ; ses transitions sont contrôlées par un
-- déclencheur, exploitant compris. Son historique est porté par ses essais,
-- numérotés. Aucune action de l'application ne crée encore de tâche : les
-- assistants arrivent au lot I.
--
-- Retour arrière : retirer fonctions, déclencheurs, politiques et tables,
-- puis le rôle. L'historique des tâches et des essais est alors perdu.

-- ---------------------------------------------------------------------------
-- Rôle du worker
-- ---------------------------------------------------------------------------

-- Un rôle vaut pour tout le serveur : il peut déjà exister (base locale
-- réinitialisée). Sans connexion tant que le lot H2 ne l'ouvre pas, avec un
-- mot de passe fixé hors de Git.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'filmfund_worker') then
    create role filmfund_worker nologin noinherit;
  end if;
end;
$$;

-- L'exploitant peut agir sous ce rôle — c'est ainsi que les tests
-- l'éprouvent — sans en hériter de droits.
grant filmfund_worker to postgres with inherit false, set true;

grant usage on schema public to filmfund_worker;

-- Seul endroit où la durée du bail est fixée. Le worker le prolonge tant
-- qu'il travaille ; expiré, la tâche est récupérée.
create or replace function public.duree_bail_travail()
returns interval
language sql
immutable
set search_path = pg_catalog
as $$
  select interval '5 minutes';
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations (id) on delete cascade,
  studio_id uuid not null references public.studios (id) on delete cascade,
  -- Pas de clé étrangère vers le projet, comme pour le registre.
  project_id uuid not null,
  action text not null,
  params jsonb not null,
  created_by uuid not null,
  state text not null default 'queued',
  -- Essais commencés ; deux au plus.
  attempts integer not null default 0,
  lease_until timestamptz,
  worker text,
  -- Motif d'une annulation ou d'un échec.
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,

  constraint travail_etat_connu check (
    state in ('queued', 'running', 'awaiting_reconciliation', 'succeeded', 'failed', 'cancelled')
  ),
  constraint travail_deux_essais check (attempts between 0 and 2),
  constraint travail_bail_si_en_cours check ((state = 'running') = (lease_until is not null)),
  constraint travail_fin_si_termine check (
    (state in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null)
  )
);

comment on table public.jobs is
  'Tâches nées des réservations, exécutées par le worker. Écrites par les fonctions uniquement ; transitions contrôlées.';

create index jobs_en_attente_idx on public.jobs (created_at) where state = 'queued';
create index jobs_en_cours_idx on public.jobs (lease_until) where state = 'running';

create table public.job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  number integer not null,
  state text not null default 'prepared',
  provider_ref text,
  error text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  finished_at timestamptz,

  constraint essai_unique unique (job_id, number),
  constraint essai_numero check (number between 1 and 2),
  constraint essai_etat_connu check (
    state in ('prepared', 'submitted', 'unknown', 'completed', 'failed')
  ),
  constraint essai_reference_longueur check (char_length(provider_ref) <= 200),
  constraint essai_erreur_longueur check (char_length(error) <= 2000)
);

comment on table public.job_attempts is
  'Essais d''une tâche auprès du fournisseur : préparé, soumis, inconnu, terminé, échoué.';

alter table public.jobs enable row level security;
alter table public.job_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- Transitions
-- ---------------------------------------------------------------------------

-- Les transitions permises, et rien d'autre : un état final ne bouge plus,
-- et l'identité d'une tâche — réservation, projet, action, auteur — non
-- plus. Une suppression n'est admise qu'en cascade, avec la réservation ou
-- le studio.
create or replace function public.controler_travail()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Une tâche ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.reservation_id, new.studio_id, new.project_id, new.action, new.params,
      new.created_by, new.created_at)
     is distinct from
     (old.id, old.reservation_id, old.studio_id, old.project_id, old.action, old.params,
      old.created_by, old.created_at) then
    raise exception 'L''identité d''une tâche ne change pas.' using errcode = '42501';
  end if;

  if new.attempts < old.attempts then
    raise exception 'Le nombre d''essais d''une tâche ne diminue pas.' using errcode = '42501';
  end if;

  if new.state is distinct from old.state and not (
    (old.state = 'queued' and new.state in ('running', 'cancelled'))
    or (old.state = 'running'
        and new.state in ('queued', 'succeeded', 'failed', 'awaiting_reconciliation'))
    or (old.state = 'awaiting_reconciliation' and new.state in ('succeeded', 'failed'))
  ) then
    raise exception 'Transition de tâche interdite : % → %.', old.state, new.state
      using errcode = '42501';
  end if;

  if old.state in ('succeeded', 'failed', 'cancelled') then
    raise exception 'Une tâche terminée ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger jobs_controle
  before update or delete on public.jobs
  for each row
  execute function public.controler_travail();

create or replace function public.controler_essai()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Un essai ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.job_id, new.number, new.created_at)
     is distinct from (old.id, old.job_id, old.number, old.created_at) then
    raise exception 'L''identité d''un essai ne change pas.' using errcode = '42501';
  end if;

  if new.state is distinct from old.state and not (
    (old.state = 'prepared' and new.state in ('submitted', 'failed'))
    or (old.state = 'submitted' and new.state in ('completed', 'failed', 'unknown'))
    or (old.state = 'unknown' and new.state in ('completed', 'failed'))
  ) then
    raise exception 'Transition d''essai interdite : % → %.', old.state, new.state
      using errcode = '42501';
  end if;

  if old.state in ('completed', 'failed') then
    raise exception 'Un essai terminé ne change plus.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger job_attempts_controle
  before update or delete on public.job_attempts
  for each row
  execute function public.controler_essai();

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['jobs', 'job_attempts']
  loop
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

-- ---------------------------------------------------------------------------
-- Naissance d'une tâche
-- ---------------------------------------------------------------------------

-- Dans la transaction de la réservation : si l'une échoue, l'autre aussi.
create or replace function public.creer_travail()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.jobs (reservation_id, studio_id, project_id, action, params, created_by)
  select new.id, new.studio_id, new.project_id, new.action, q.params, new.created_by
  from public.quotes q
  where q.id = new.quote_id;

  return null;
end;
$$;

create trigger reservations_travail
  after insert on public.reservations
  for each row
  execute function public.creer_travail();

-- ---------------------------------------------------------------------------
-- Lecture
-- ---------------------------------------------------------------------------

-- Même règle que le registre : l'équipe du projet et les administrateurs.
create policy "L'équipe du projet et les administrateurs lisent les tâches"
  on public.jobs for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Qui lit la tâche lit ses essais"
  on public.job_attempts for select
  to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id));

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['jobs', 'job_attempts']
  loop
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
  end loop;
end;
$$;

-- Un administrateur qui annule ou rapproche la tâche d'un projet dont il
-- n'est pas membre intervient sur ce projet : journalisé comme tel. Le
-- worker, sans identité, ne l'est pas.
create trigger jobs_journal_admin
  before update on public.jobs
  for each row
  execute function public.journaliser_intervention_admin();

-- ---------------------------------------------------------------------------
-- Droits d'un auteur, avec ou sans session
-- ---------------------------------------------------------------------------

-- Le worker n'a pas de session : il revérifie les droits de l'auteur de la
-- tâche, nommé. Même règle que pour engager des unités — porteur ou éditeur
-- du projet, ou administrateur, et mode privé ouvert à l'auteur —, si bien
-- que peut_engager_unites() s'appuie désormais sur elle.
create or replace function public.peut_engager_unites_pour(p_user uuid, p_project_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  with auteur as (
    select exists (
      select 1 from public.profiles pr where pr.id = p_user and pr.role = 'admin'
    ) as admin
  )
  select coalesce(
    p_user is not null
    and exists (select 1 from public.projects p where p.id = p_project_id)
    and (not public.mode_prive() or auteur.admin)
    and (
      exists (
        select 1 from public.projects p
        where p.id = p_project_id and p.owner_id = p_user
      )
      or exists (
        select 1 from public.project_members m
        where m.project_id = p_project_id and m.user_id = p_user and m.role = 'editor'
      )
      or auteur.admin
    ),
    false
  )
  from auteur;
$$;

create or replace function public.peut_engager_unites(p_project_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.peut_engager_unites_pour((select auth.uid()), p_project_id);
$$;

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------

-- Termine une tâche et règle sa réservation, dans la même transaction.
-- Consommé par défaut : tout en cas de succès, rien sinon.
create or replace function public.clore_travail(
  p_job public.jobs,
  p_state text,
  p_consumed integer,
  p_reason text
)
returns public.jobs
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_quantite integer;
  v_job public.jobs;
begin
  select r.quantity into v_quantite from public.reservations r where r.id = p_job.reservation_id;

  update public.jobs
  set state = p_state,
      lease_until = null,
      reason = p_reason,
      finished_at = now(),
      updated_at = now()
  where id = p_job.id
  returning * into v_job;

  perform public.regler_reservation(
    p_job.reservation_id,
    coalesce(p_consumed, case when p_state = 'succeeded' then v_quantite else 0 end)
  );

  return v_job;
end;
$$;

-- Essai en cours d'une tâche en cours, verrouillé avec elle ; nul sinon.
create or replace function public.essai_courant(p_attempt_id uuid)
returns public.job_attempts
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
begin
  select a.* into v_essai
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id
  where a.id = p_attempt_id
    and j.state = 'running'
    and j.attempts = a.number
  for update of a, j;

  return v_essai;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Prend la plus ancienne tâche en attente. Un autre worker saute les lignes
-- verrouillées : deux réclamations simultanées n'obtiennent jamais la même.
-- Si l'auteur n'a plus le droit d'engager des unités sur le projet, la tâche
-- est annulée et rendue, et la suivante est examinée.
create or replace function public.reclamer_travail(p_worker text)
returns table (
  job_id uuid,
  attempt_id uuid,
  attempt_number integer,
  action text,
  params jsonb,
  project_id uuid,
  studio_id uuid,
  lease_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_job public.jobs;
  v_essai public.job_attempts;
begin
  if p_worker is null or char_length(p_worker) not between 1 and 100 then
    raise exception 'Identifiant de worker manquant ou trop long.' using errcode = '22023';
  end if;

  loop
    select j.* into v_job
    from public.jobs j
    where j.state = 'queued'
    order by j.created_at, j.id
    limit 1
    for update skip locked;

    if v_job.id is null then
      return;
    end if;

    if public.peut_engager_unites_pour(v_job.created_by, v_job.project_id) then
      exit;
    end if;

    perform public.clore_travail(
      v_job, 'cancelled', 0, 'Droits de l''auteur retirés avant l''exécution.'
    );
  end loop;

  update public.jobs
  set state = 'running',
      attempts = attempts + 1,
      worker = p_worker,
      lease_until = now() + public.duree_bail_travail(),
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  insert into public.job_attempts (job_id, number)
  values (v_job.id, v_job.attempts)
  returning * into v_essai;

  return query
    select v_job.id, v_essai.id, v_essai.number, v_job.action, v_job.params,
           v_job.project_id, v_job.studio_id, v_job.lease_until;
end;
$$;

-- Le worker prolonge son bail tant qu'il travaille. Faux : la tâche ne lui
-- appartient plus — récupérée ou terminée —, il doit s'arrêter.
create or replace function public.prolonger_bail(p_attempt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state not in ('prepared', 'submitted') then
    return false;
  end if;

  update public.jobs
  set lease_until = now() + public.duree_bail_travail(), updated_at = now()
  where id = v_essai.job_id;

  return true;
end;
$$;

-- À appeler juste avant l'envoi au fournisseur, et à valider avant lui :
-- passé ce point, une coupure laisse une issue inconnue. Refusé si la tâche
-- a été récupérée entre-temps (TR001) : le worker ne doit alors rien envoyer.
create or replace function public.marquer_tentative_soumise(
  p_attempt_id uuid,
  p_provider_ref text default null
)
returns public.job_attempts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
begin
  v_essai := public.essai_courant(p_attempt_id);

  if v_essai.id is not null and v_essai.state = 'submitted' then
    return v_essai;
  end if;
  if v_essai.id is null or v_essai.state <> 'prepared' then
    raise exception 'Cet essai n''est plus en cours : ne rien envoyer.' using errcode = 'TR001';
  end if;

  update public.job_attempts
  set state = 'submitted', submitted_at = now(), provider_ref = p_provider_ref
  where id = p_attempt_id
  returning * into v_essai;

  return v_essai;
end;
$$;

-- Issue d'un essai. Succès : la tâche réussit, la consommation est imputée.
-- Échec : une reprise si c'était le premier essai, sinon échec et
-- restitution. Rejouer la même issue renvoie la tâche sans rien régler deux
-- fois.
create or replace function public.terminer_tentative(
  p_attempt_id uuid,
  p_success boolean,
  p_consumed integer default null,
  p_error text default null
)
returns public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_issue text := case when p_success then 'completed' else 'failed' end;
begin
  select a.* into v_essai from public.job_attempts a where a.id = p_attempt_id;
  if v_essai.id is not null and v_essai.state = v_issue then
    select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
    return v_job;
  end if;

  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null
     or v_essai.state not in ('prepared', 'submitted')
     or (p_success and v_essai.state <> 'submitted') then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  update public.job_attempts
  set state = v_issue, error = left(p_error, 2000), finished_at = now()
  where id = p_attempt_id;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;

  if p_success then
    return public.clore_travail(v_job, 'succeeded', p_consumed, null);
  end if;

  if v_job.attempts < 2 then
    update public.jobs
    set state = 'queued', lease_until = null, worker = null, updated_at = now()
    where id = v_job.id
    returning * into v_job;
    return v_job;
  end if;

  return public.clore_travail(v_job, 'failed', p_consumed, left(p_error, 2000));
end;
$$;

-- Tâches dont le bail a expiré : le worker s'est arrêté sans conclure.
-- Essai jamais soumis : rien n'est parti, la tâche repart (ou échoue et est
-- rendue au second essai). Essai soumis : l'issue est inconnue, la tâche
-- attend un rapprochement. Renvoie le nombre de tâches récupérées.
create or replace function public.recuperer_travaux_expires()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_essai public.job_attempts;
  v_nombre integer := 0;
begin
  for v_job in
    select j.* from public.jobs j
    where j.state = 'running' and j.lease_until < now()
    order by j.lease_until
    for update skip locked
  loop
    select a.* into v_essai
    from public.job_attempts a
    where a.job_id = v_job.id and a.number = v_job.attempts
    for update;

    if v_essai.state = 'submitted' then
      update public.job_attempts set state = 'unknown' where id = v_essai.id;
      update public.jobs
      set state = 'awaiting_reconciliation', lease_until = null, updated_at = now()
      where id = v_job.id;
    else
      update public.job_attempts
      set state = 'failed', error = 'Bail expiré avant l''envoi.', finished_at = now()
      where id = v_essai.id;

      if v_job.attempts < 2 then
        update public.jobs
        set state = 'queued', lease_until = null, worker = null, updated_at = now()
        where id = v_job.id;
      else
        perform public.clore_travail(v_job, 'failed', 0, 'Bail expiré avant l''envoi, deux fois.');
      end if;
    end if;

    v_nombre := v_nombre + 1;
  end loop;

  return v_nombre;
end;
$$;

-- Tranche une tâche à rapprocher, une fois l'issue connue (statut demandé
-- au fournisseur, lot I) : jamais de relance. Rejouer la même issue renvoie
-- la tâche sans rien régler deux fois.
create or replace function public.trancher_rapprochement(
  p_job_id uuid,
  p_success boolean,
  p_consumed integer
)
returns public.jobs
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_issue text := case when p_success then 'succeeded' else 'failed' end;
begin
  select j.* into v_job from public.jobs j where j.id = p_job_id for update;

  if v_job.state = v_issue then
    return v_job;
  end if;
  if v_job.id is null or v_job.state <> 'awaiting_reconciliation' then
    raise exception 'Cette tâche n''attend pas de rapprochement.' using errcode = 'TR002';
  end if;

  if p_success then
    update public.job_attempts
    set state = 'completed', finished_at = now()
    where job_id = v_job.id and number = v_job.attempts;
    return public.clore_travail(v_job, 'succeeded', p_consumed, null);
  end if;

  update public.job_attempts
  set state = 'failed', error = 'Issue établie par rapprochement : échec.', finished_at = now()
  where job_id = v_job.id and number = v_job.attempts;
  return public.clore_travail(v_job, 'failed', p_consumed, 'Échec établi par rapprochement.');
end;
$$;

create or replace function public.rapprocher_travail(
  p_job_id uuid,
  p_success boolean,
  p_consumed integer default null
)
returns public.jobs
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.trancher_rapprochement(p_job_id, p_success, p_consumed);
$$;

-- ---------------------------------------------------------------------------
-- Fonctions des comptes connectés
-- ---------------------------------------------------------------------------

-- Le porteur, un éditeur ou un administrateur annule une tâche encore en
-- attente : la réservation est rendue. Une tâche déjà prise par le worker
-- ne s'annule pas (TR002).
create or replace function public.annuler_travail(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
begin
  select j.* into v_job from public.jobs j where j.id = p_job_id for update;

  if v_job.id is null or not public.peut_engager_unites(v_job.project_id) then
    raise exception 'Tâche introuvable, ou droits insuffisants pour l''annuler.'
      using errcode = '42501';
  end if;

  if v_job.state = 'cancelled' then
    return v_job;
  end if;
  if v_job.state <> 'queued' then
    raise exception 'Seule une tâche en attente s''annule.' using errcode = 'TR002';
  end if;

  return public.clore_travail(v_job, 'cancelled', 0, 'Annulée avant son exécution.');
end;
$$;

-- Rapprochement manuel par l'administration, journalisé avant d'agir.
create or replace function public.rapprocher_travail_admin(
  p_job_id uuid,
  p_success boolean,
  p_consumed integer default null
)
returns public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_projet uuid;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Action réservée à l''administration.' using errcode = '42501';
  end if;

  select j.project_id into v_projet from public.jobs j where j.id = p_job_id;

  perform public.journaliser(
    'rapprochement_travail',
    v_projet,
    jsonb_build_object('tache', p_job_id, 'succes', p_success, 'consomme', p_consumed)
  );

  return public.trancher_rapprochement(p_job_id, p_success, p_consumed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Journal d'administration
-- ---------------------------------------------------------------------------

alter table public.admin_audit_log
  drop constraint action_connue,
  add constraint action_connue check (
    action in (
      'changement_role',
      'modification_profil',
      'mode_prive',
      'suppression_projet',
      'intervention_contenu',
      'intervention_studio',
      'publication_plan',
      'changement_plan_studio',
      'publication_bareme',
      'rapprochement_travail'
    )
  );

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

revoke all on function public.duree_bail_travail() from public, anon, authenticated;
revoke all on function public.controler_travail() from public, anon, authenticated;
revoke all on function public.controler_essai() from public, anon, authenticated;
revoke all on function public.creer_travail() from public, anon, authenticated;
revoke all on function public.peut_engager_unites_pour(uuid, uuid) from public, anon, authenticated;
revoke all on function public.peut_engager_unites(uuid) from public, anon, authenticated;
revoke all on function public.clore_travail(public.jobs, text, integer, text) from public, anon, authenticated;
revoke all on function public.essai_courant(uuid) from public, anon, authenticated;
revoke all on function public.trancher_rapprochement(uuid, boolean, integer) from public, anon, authenticated;

-- Le worker : réclamer, prolonger, soumettre, conclure, récupérer, rapprocher.
revoke all on function public.reclamer_travail(text) from public, anon, authenticated;
revoke all on function public.prolonger_bail(uuid) from public, anon, authenticated;
revoke all on function public.marquer_tentative_soumise(uuid, text) from public, anon, authenticated;
revoke all on function public.terminer_tentative(uuid, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.recuperer_travaux_expires() from public, anon, authenticated;
revoke all on function public.rapprocher_travail(uuid, boolean, integer) from public, anon, authenticated;

grant execute on function public.reclamer_travail(text) to filmfund_worker;
grant execute on function public.prolonger_bail(uuid) to filmfund_worker;
grant execute on function public.marquer_tentative_soumise(uuid, text) to filmfund_worker;
grant execute on function public.terminer_tentative(uuid, boolean, integer, text) to filmfund_worker;
grant execute on function public.recuperer_travaux_expires() to filmfund_worker;
grant execute on function public.rapprocher_travail(uuid, boolean, integer) to filmfund_worker;

-- Les comptes connectés : annuler une tâche en attente ; l'administration,
-- rapprocher.
revoke all on function public.annuler_travail(uuid) from public, anon, authenticated;
grant execute on function public.annuler_travail(uuid) to authenticated;
revoke all on function public.rapprocher_travail_admin(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.rapprocher_travail_admin(uuid, boolean, integer) to authenticated;
