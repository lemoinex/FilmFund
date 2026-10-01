-- Connexion du worker et réclamation par action (lot H2).
--
-- Le worker Node (dossier `worker/`, déployé sur Railway) se connecte sous
-- le rôle `filmfund_worker`, créé au lot H1 sans connexion. Cette migration
-- l'ouvre ; elle ne fixe aucun mot de passe. Sans mot de passe, le rôle ne
-- peut toujours pas s'authentifier : l'exploitant le fixe à la main, hors de
-- Git (`alter role filmfund_worker password '…'`), et le range dans Railway.
-- Voir docs/worker.md.
--
-- Le worker ne réclame désormais que les actions qu'il sait exécuter : il
-- en donne la liste. Tant qu'aucun exécuteur n'existe en production (lot I),
-- la liste est vide et aucune tâche n'est prise ; elle attend, au lieu
-- d'échouer faute de savoir-faire. Plusieurs workers spécialisés pourront
-- aussi se partager la file.
--
-- Elle corrige aussi l'ordre des verrous d'essai_courant() (lot H1), que les
-- tests du worker ont pris en défaut : voir plus bas.
--
-- Retour arrière : `alter role filmfund_worker nologin`, puis rétablir
-- reclamer_travail(text) depuis la migration du lot H1. La correction
-- d'essai_courant() est à conserver.

-- ---------------------------------------------------------------------------
-- Connexion
-- ---------------------------------------------------------------------------

-- Peu de connexions : un worker en ouvre deux au plus. Les délais bornent
-- une requête ou une transaction qui resterait pendue, verrou compris.
alter role filmfund_worker with login connection limit 5;
alter role filmfund_worker set statement_timeout = '30s';
alter role filmfund_worker set idle_in_transaction_session_timeout = '30s';

-- ---------------------------------------------------------------------------
-- Ordre des verrous
-- ---------------------------------------------------------------------------

-- Correction du lot H1. essai_courant() verrouillait l'essai et la tâche en
-- une seule lecture, dans un ordre laissé au planificateur ; la récupération
-- des baux expirés verrouille la tâche, puis l'essai. Un worker prolongeant
-- son bail au moment où sa tâche était récupérée pouvait donc s'interbloquer
-- avec elle : PostgreSQL interrompait l'une des deux transactions. Aucune
-- donnée n'en souffrait, mais une récupération ou une prolongation échouait
-- sans raison. Partout désormais : la tâche d'abord, l'essai ensuite.
create or replace function public.essai_courant(p_attempt_id uuid)
returns public.job_attempts
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
begin
  perform 1
  from public.jobs j
  where j.id = (select a.job_id from public.job_attempts a where a.id = p_attempt_id)
  for update;

  select a.* into v_essai
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id
  where a.id = p_attempt_id
    and j.state = 'running'
    and j.attempts = a.number
  for update of a;

  return v_essai;
end;
$$;

revoke all on function public.essai_courant(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Réclamation par action
-- ---------------------------------------------------------------------------

drop function public.reclamer_travail(text);

-- Prend la plus ancienne tâche en attente parmi les actions données. Un
-- autre worker saute les lignes verrouillées : deux réclamations
-- simultanées n'obtiennent jamais la même. Si l'auteur n'a plus le droit
-- d'engager des unités sur le projet, la tâche est annulée et rendue, et la
-- suivante est examinée. Sans action, rien n'est pris.
create or replace function public.reclamer_travail(p_worker text, p_actions text[])
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

  if coalesce(cardinality(p_actions), 0) = 0 then
    return;
  end if;

  loop
    select j.* into v_job
    from public.jobs j
    where j.state = 'queued'
      and j.action = any (p_actions)
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

revoke all on function public.reclamer_travail(text, text[]) from public, anon, authenticated;
grant execute on function public.reclamer_travail(text, text[]) to filmfund_worker;
