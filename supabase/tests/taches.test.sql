-- Tâches persistantes, essais et rapprochement, vus depuis la base.
--
-- Les tâches d'une même transaction naissent au même instant : l'ordre de
-- réclamation entre elles serait arbitraire. Chaque scénario ne laisse donc
-- qu'une tâche en attente à la fois. Les appels du worker sont faits sous
-- son rôle quand c'est l'objet du test, sinon par le propriétaire de la
-- base — les fonctions s'exécutent de toute façon avec ses droits. Un plan
-- d'essai évite de toucher au catalogue réel ; la transaction est annulée.

begin;

select plan(49);

-- Les autres suites laissent des tâches en attente ou en cours : le worker
-- les prendrait ou les récupérerait avant celles du test. Le temps de la
-- transaction, les premières sont annulées et le bail des secondes repoussé.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test des tâches'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

-- Tâche d'une réservation, et son essai en cours, par clé d'idempotence.
create function pg_temp.travail(p_cle text) returns uuid language sql as $$
  select j.id from public.jobs j
  join public.reservations r on r.id = j.reservation_id
  where r.idempotency_key = p_cle;
$$;

create function pg_temp.essai(p_cle text) returns uuid language sql as $$
  select a.id from public.job_attempts a
  join public.jobs j on j.id = a.job_id
  where j.id = pg_temp.travail(p_cle) and a.number = j.attempts;
$$;

create function pg_temp.reglement(p_cle text) returns text language sql as $$
  select s.consumed || '/' || s.released
  from public.reservation_settlements s
  join public.reservations r on r.id = s.reservation_id
  where r.idempotency_key = p_cle;
$$;

-- Un worker qui saurait tout exécuter.
create function pg_temp.toutes() returns text[] language sql as $$
  select array[
    'logline', 'synopsis_short', 'synopsis_standard', 'synopsis_detailed', 'intention_note',
    'treatment', 'bible', 'screenplay', 'dialogue', 'image', 'pdf_export'
  ];
$$;

-- Ce que le worker reçoit en réclamant, écrit sous son propre rôle.
create temp table pris (job_id uuid, attempt_id uuid, attempt_number integer, action text);
grant insert, select on pris to filmfund_worker;

insert into public.plans (code, name, position) values ('essai_taches', 'Essai tâches', 401);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_taches', 5, 1, 0, 100, 0, 0, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000f001', 'taches-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f002', 'taches-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f003', 'taches-admin@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000f003';

update public.studio_subscriptions
set plan_code = 'essai_taches', period_anchor = now() - interval '3 days'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000f001');

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f001', 'Projet des tâches');

insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-00000000f0a1', '00000000-0000-0000-0000-00000000f002', 'editor');

-- ---------------------------------------------------------------------------
-- Rôle du worker
-- ---------------------------------------------------------------------------

select is(
  (select rolcanlogin || ' ' || rolconnlimit || ' ' || rolsuper || ' ' || rolinherit || ' ' || rolbypassrls
   from pg_roles where rolname = 'filmfund_worker'),
  'true 5 false false false',
  'Le worker se connecte, cinq connexions au plus, sans super-pouvoir, héritage ni contournement de la RLS'
);

select is(
  (select array_agg(parametre order by parametre)
   from pg_db_role_setting s
   join pg_roles r on r.oid = s.setrole
   cross join unnest(s.setconfig) as parametre
   where r.rolname = 'filmfund_worker'),
  array['idle_in_transaction_session_timeout=30s', 'statement_timeout=30s'],
  'Ses requêtes et ses transactions pendues sont bornées à trente secondes'
);

select is_empty(
  $$
    select c.relname::text
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'v', 'm', 'p')
      and (
        has_table_privilege('filmfund_worker', c.oid, 'select')
        or has_table_privilege('filmfund_worker', c.oid, 'insert')
        or has_table_privilege('filmfund_worker', c.oid, 'update')
        or has_table_privilege('filmfund_worker', c.oid, 'delete')
      )
  $$,
  'Le worker n''a aucun droit sur les tables'
);

select is(
  array(
    select p.proname::text collate "C"
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and has_function_privilege('filmfund_worker', p.oid, 'execute')
    order by 1
  ),
  array[
    'marquer_tentative_soumise', 'prolonger_bail', 'rapprocher_travail',
    'reclamer_travail', 'recuperer_travaux_expires', 'terminer_tentative'
  ]::text[],
  'Le worker n''exécute que ses six fonctions'
);

-- ---------------------------------------------------------------------------
-- Naissance d'une tâche
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000f001", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-00000000f0a1', 'logline');
select public.accepter_devis(
  (select q.id from public.quotes q where q.action = 'logline' and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-rapprochee'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select j.state || ' ' || j.action || ' ' || j.attempts from public.jobs j where j.id = pg_temp.travail('k-rapprochee')),
  'queued logline 0',
  'Accepter un devis crée sa tâche, en attente, dans la même transaction'
);

select throws_ok(
  $$ update public.jobs set state = 'succeeded' where id = pg_temp.travail('k-rapprochee') $$,
  '42501',
  'Transition de tâche interdite : queued → succeeded.',
  'Une tâche ne saute pas d''état, même pour l''exploitant'
);

select throws_ok(
  $$ delete from public.jobs where id = pg_temp.travail('k-rapprochee') $$,
  '42501',
  'Une tâche ne se supprime pas.',
  'Une tâche ne se supprime pas directement'
);

-- ---------------------------------------------------------------------------
-- Réclamation, sous le rôle du worker
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.reclamer_travail('worker-a', array[]::text[]))
    + (select count(*)::int from public.reclamer_travail('worker-a', null)),
  0,
  'Un worker sans savoir-faire ne prend rien'
);

select is(
  (select count(*)::int from public.reclamer_travail('worker-a', array['treatment', 'image'])),
  0,
  'Un worker ne prend pas une action qu''il ne sait pas exécuter'
);

select is(
  (select j.state from public.jobs j where j.id = pg_temp.travail('k-rapprochee')),
  'queued',
  'La tâche qu''aucun worker ne sait exécuter attend, sans échouer'
);

select is(
  to_regprocedure('public.reclamer_travail(text)'),
  null,
  'La réclamation sans liste d''actions n''existe plus'
);

set local role filmfund_worker;
insert into pris select job_id, attempt_id, attempt_number, action from public.reclamer_travail('worker-a', pg_temp.toutes());
reset role;

select is(
  (select job_id from pris),
  pg_temp.travail('k-rapprochee'),
  'Le worker, sous son rôle, réclame la tâche en attente'
);

select is(
  (select j.state || ' ' || j.worker || ' ' || j.attempts || ' '
          || (j.lease_until between now() + interval '4 minutes' and now() + interval '6 minutes')
   from public.jobs j where j.id = pg_temp.travail('k-rapprochee')),
  'running worker-a 1 true',
  'La tâche réclamée est en cours, avec un bail de cinq minutes'
);

select is(
  (select count(*)::int from public.reclamer_travail('worker-b', pg_temp.toutes())),
  0,
  'Une tâche prise ne l''est pas une seconde fois'
);

select throws_ok(
  format('select public.terminer_tentative(%L, true)', pg_temp.essai('k-rapprochee')),
  'TR001',
  'Cet essai n''est plus en cours.',
  'Un succès sans envoi préalable est refusé'
);

-- ---------------------------------------------------------------------------
-- Bail expiré avant l'envoi : rien n'est parti, la tâche repart
-- ---------------------------------------------------------------------------

update public.jobs set lease_until = now() - interval '1 minute' where id = pg_temp.travail('k-rapprochee');

select is(public.recuperer_travaux_expires(), 1, 'Une tâche au bail expiré est récupérée');

select is(
  (select j.state || ' ' || j.attempts from public.jobs j where j.id = pg_temp.travail('k-rapprochee')),
  'queued 1',
  'Essai jamais soumis : la tâche repart en attente'
);

select is(
  (select a.state || ' ' || a.error from public.job_attempts a where a.id = (select attempt_id from pris)),
  'failed Bail expiré avant l''envoi.',
  'L''essai abandonné est clos comme échoué'
);

select throws_ok(
  format('select public.marquer_tentative_soumise(%L)', (select attempt_id from pris)),
  'TR001',
  'Cet essai n''est plus en cours : ne rien envoyer.',
  'Le worker en retard ne peut plus soumettre : il n''envoie rien'
);

select is(
  public.prolonger_bail((select attempt_id from pris)),
  false,
  'Le worker en retard ne peut plus prolonger un bail perdu'
);

-- ---------------------------------------------------------------------------
-- Bail expiré après l'envoi : issue inconnue, rapprochement
-- ---------------------------------------------------------------------------

select is(
  (select attempt_number from public.reclamer_travail('worker-b', pg_temp.toutes())),
  2,
  'La tâche repart pour son second et dernier essai'
);

select public.marquer_tentative_soumise(pg_temp.essai('k-rapprochee'), 'ref-fournisseur');
update public.jobs set lease_until = now() - interval '1 minute' where id = pg_temp.travail('k-rapprochee');
select public.recuperer_travaux_expires();

select is(
  (select j.state || ' / ' || a.state || ' / ' || a.provider_ref
   from public.jobs j join public.job_attempts a on a.job_id = j.id and a.number = j.attempts
   where j.id = pg_temp.travail('k-rapprochee')),
  'awaiting_reconciliation / unknown / ref-fournisseur',
  'Essai soumis puis bail expiré : issue inconnue, tâche à rapprocher'
);

select is(
  (select count(*)::int from public.reclamer_travail('worker-c', pg_temp.toutes())),
  0,
  'Une tâche à rapprocher n''est jamais relancée'
);

select is(
  (select r.state from public.rapprocher_travail(pg_temp.travail('k-rapprochee'), true, 1) r),
  'succeeded',
  'Le rapprochement tranche : réussie'
);

select is(pg_temp.reglement('k-rapprochee'), '1/0', 'La consommation est imputée une fois');

select is(
  (select r.state from public.rapprocher_travail(pg_temp.travail('k-rapprochee'), true, 1) r),
  'succeeded',
  'Rejouer le même rapprochement ne change rien'
);

select throws_ok(
  format('select public.rapprocher_travail(%L, false)', pg_temp.travail('k-rapprochee')),
  'TR002',
  'Cette tâche n''attend pas de rapprochement.',
  'Une tâche tranchée ne se rapproche plus autrement'
);

-- ---------------------------------------------------------------------------
-- Échec : une seule reprise, puis restitution
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000f001", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-00000000f0a1', 'treatment');
select public.accepter_devis(
  (select q.id from public.quotes q where q.action = 'treatment' and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-echec'
);
reset role;
select set_config('request.jwt.claims', '', true);

select public.reclamer_travail('worker-a', pg_temp.toutes());
select public.marquer_tentative_soumise(pg_temp.essai('k-echec'));

select is(
  (select r.state from public.terminer_tentative(pg_temp.essai('k-echec'), false, null, 'Erreur du fournisseur') r),
  'queued',
  'Premier échec : une reprise automatique'
);

select public.reclamer_travail('worker-a', pg_temp.toutes());
select public.marquer_tentative_soumise(pg_temp.essai('k-echec'));

select is(
  (select r.state || ' : ' || r.reason from public.terminer_tentative(pg_temp.essai('k-echec'), false, null, 'Erreur du fournisseur') r),
  'failed : Erreur du fournisseur',
  'Second échec : la tâche échoue, sans autre reprise'
);

select is(pg_temp.reglement('k-echec'), '0/8', 'L''échec rend toute la réservation');

select is(
  (select count(*)::int from public.reclamer_travail('worker-a', pg_temp.toutes())),
  0,
  'Pas de troisième essai'
);

-- ---------------------------------------------------------------------------
-- Succès : consommation complète par défaut
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000f001", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-00000000f0a1', 'intention_note');
select public.accepter_devis(
  (select q.id from public.quotes q where q.action = 'intention_note' and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-succes'
);
reset role;
select set_config('request.jwt.claims', '', true);

select public.reclamer_travail('worker-a', pg_temp.toutes());
select public.marquer_tentative_soumise(pg_temp.essai('k-succes'));

select is(
  (select r.state from public.terminer_tentative(pg_temp.essai('k-succes'), true) r),
  'succeeded',
  'Succès : la tâche réussit'
);

select is(pg_temp.reglement('k-succes'), '3/0', 'Sans précision, tout ce qui était réservé est consommé');

select is(
  (select r.state from public.terminer_tentative(pg_temp.essai('k-succes'), true) r),
  'succeeded',
  'Rejouer le succès ne règle rien deux fois'
);

-- ---------------------------------------------------------------------------
-- Droits revérifiés avant l'exécution
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000f002", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-00000000f0a1', 'logline');
select public.accepter_devis(
  (select q.id from public.quotes q where q.action = 'logline' and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-editeur-retire'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- L'éditeur quitte l'équipe avant que le worker ne passe.
delete from public.project_members
where project_id = '00000000-0000-0000-0000-00000000f0a1' and user_id = '00000000-0000-0000-0000-00000000f002';

select is(
  (select count(*)::int from public.reclamer_travail('worker-a', pg_temp.toutes())),
  0,
  'La tâche d''un auteur qui a perdu ses droits n''est pas exécutée'
);

select is(
  (select j.state || ' : ' || j.reason from public.jobs j where j.id = pg_temp.travail('k-editeur-retire')),
  'cancelled : Droits de l''auteur retirés avant l''exécution.',
  'Elle est annulée, avec son motif'
);

select is(pg_temp.reglement('k-editeur-retire'), '0/1', 'Et sa réservation est rendue');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000f001", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-00000000f0a1', 'bible');
select public.accepter_devis(
  (select q.id from public.quotes q where q.action = 'bible' and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-mode-prive'
);
reset role;
select set_config('request.jwt.claims', '', true);

update public.app_settings set private_admin_only = true where id;

select is(
  (select count(*)::int from public.reclamer_travail('worker-a', pg_temp.toutes())),
  0,
  'Le mode privé ferme l''exécution aux auteurs non administrateurs'
);

select is(pg_temp.reglement('k-mode-prive'), '0/10', 'La tâche fermée par le mode privé est rendue');

update public.app_settings set private_admin_only = false where id;

-- ---------------------------------------------------------------------------
-- Annulation par le porteur
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000f001", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-00000000f0a1', 'synopsis_short');
select public.accepter_devis(
  (select q.id from public.quotes q where q.action = 'synopsis_short' and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-annulee'
);

select is(
  (select r.state from public.annuler_travail(pg_temp.travail('k-annulee')) r),
  'cancelled',
  'Le porteur annule une tâche en attente'
);

select is(
  (select r.state from public.annuler_travail(pg_temp.travail('k-annulee')) r),
  'cancelled',
  'Annuler deux fois ne change rien'
);

select throws_ok(
  format('select public.annuler_travail(%L)', pg_temp.travail('k-succes')),
  'TR002',
  'Seule une tâche en attente s''annule.',
  'Une tâche terminée ne s''annule pas'
);

select throws_ok(
  format('select public.rapprocher_travail_admin(%L, true)', pg_temp.travail('k-annulee')),
  '42501',
  'Action réservée à l''administration.',
  'Un porteur ne rapproche pas une tâche'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.reglement('k-annulee'), '0/1', 'L''annulation rend la réservation');

-- ---------------------------------------------------------------------------
-- Rapprochement par l'administration, journalisé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000f001", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-00000000f0a1', 'synopsis_standard');
select public.accepter_devis(
  (select q.id from public.quotes q where q.action = 'synopsis_standard' and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-admin'
);
reset role;
select set_config('request.jwt.claims', '', true);

select public.reclamer_travail('worker-a', pg_temp.toutes());
select public.marquer_tentative_soumise(pg_temp.essai('k-admin'));
update public.jobs set lease_until = now() - interval '1 minute' where id = pg_temp.travail('k-admin');
select public.recuperer_travaux_expires();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000f003", "role": "authenticated"}', true);

select is(
  (select r.state from public.rapprocher_travail_admin(pg_temp.travail('k-admin'), false) r),
  'failed',
  'L''administration tranche un rapprochement'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.reglement('k-admin'), '0/2', 'Échec établi : la réservation est rendue');

select is(
  (select count(*)::int from public.admin_audit_log
   where action = 'rapprochement_travail'
     and actor_id = '00000000-0000-0000-0000-00000000f003'
     and project_id = '00000000-0000-0000-0000-00000000f0a1'
     and details ->> 'tache' = pg_temp.travail('k-admin')::text),
  1,
  'Le rapprochement par l''administration est journalisé'
);

-- ---------------------------------------------------------------------------
-- Essais en ajout contrôlé
-- ---------------------------------------------------------------------------

select throws_ok(
  format('update public.job_attempts set state = %L where id = %L', 'completed', pg_temp.essai('k-echec')),
  '42501',
  'Transition d''essai interdite : failed → completed.',
  'Un essai terminé ne change plus'
);

select throws_ok(
  $$ delete from public.job_attempts $$,
  '42501',
  'Un essai ne se supprime pas.',
  'Un essai ne se supprime pas directement'
);

select * from finish();

rollback;
