-- Exports PDF : demande, contenu du dossier, dépôt par le worker, lecture et
-- purge, vus depuis la base.
--
-- AUCUN PDF RÉEL : le fichier déposé est un en-tête de PDF écrit à la main.
-- Le worker est joué sous son rôle. Un plan d'essai évite de toucher au
-- catalogue réel ; la transaction est annulée.

begin;

select plan(49);

-- Les tâches laissées par d'autres suites passeraient avant celles du test.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test des exports'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

-- Repères du test, lus sous n'importe quel rôle : ils s'exécutent avec les
-- droits du propriétaire, sans quoi la RLS les rendrait muets.
create function pg_temp.travail(p_cle text) returns uuid language sql security definer as $$
  select j.id from public.jobs j
  join public.reservations r on r.id = j.reservation_id
  where r.idempotency_key = p_cle;
$$;

create function pg_temp.essai(p_cle text) returns uuid language sql security definer as $$
  select a.id from public.job_attempts a
  join public.jobs j on j.id = a.job_id
  where j.id = pg_temp.travail(p_cle) and a.number = j.attempts;
$$;

create function pg_temp.export(p_cle text) returns uuid language sql security definer as $$
  select e.id from public.project_exports e where e.job_id = pg_temp.travail(p_cle);
$$;

-- « %PDF-1.3 » : de quoi passer le contrôle, rien de plus.
create function pg_temp.pdf() returns bytea language sql immutable as $$
  select '\x255044462d312e330a'::bytea;
$$;

-- Ce que le worker lit et obtient, écrit sous son propre rôle : les
-- affirmations, elles, se font sous celui du propriétaire.
create temp table lu (repere text, contexte jsonb);
create temp table obtenu (repere text, valeur text);
grant insert, select on lu, obtenu to filmfund_worker;

insert into public.plans (code, name, position) values ('essai_pdf', 'Essai PDF', 502);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_pdf', 5, 1, 0, 10, 0, 5, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000e1001', 'pdf-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1002', 'pdf-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1003', 'pdf-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1004', 'pdf-admin@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1005', 'pdf-etranger@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000e1004';

update public.studio_subscriptions
set plan_code = 'essai_pdf', period_anchor = now() - interval '3 days'
where studio_id in (
  select id from public.studios
  where personal_owner_id = '00000000-0000-0000-0000-0000000e1001'
);

insert into public.projects (id, owner_id, title, logline, synopsis)
values (
  '00000000-0000-0000-0000-0000000e10a1', '00000000-0000-0000-0000-0000000e1001',
  'Projet PDF', 'Le pitch.', 'Le synopsis.'
);

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000e10a1', '00000000-0000-0000-0000-0000000e1002', 'editor'),
  ('00000000-0000-0000-0000-0000000e10a1', '00000000-0000-0000-0000-0000000e1003', 'viewer');

insert into public.project_documents (project_id, type, title, content, status)
values
  ('00000000-0000-0000-0000-0000000e10a1', 'note_intention', 'Note finale', 'Texte final.', 'finalise'),
  ('00000000-0000-0000-0000-0000000e10a1', 'note_intention', 'Note en cours', 'Brouillon.', 'brouillon'),
  ('00000000-0000-0000-0000-0000000e10a1', 'scenario', 'Scénario', 'INT. JOUR', 'en_relecture'),
  ('00000000-0000-0000-0000-0000000e10a1', 'lettre', 'Lettre de soutien', 'Madame, Monsieur', 'finalise');

insert into public.project_budgets (project_id, currency)
values ('00000000-0000-0000-0000-0000000e10a1', 'XAF');
insert into public.budget_lines (project_id, category, label, quantity, unit_cost)
values ('00000000-0000-0000-0000-0000000e10a1', 'developpement', 'Écriture', 2, 1500);

insert into public.project_fundings (project_id, funder, currency, amount_requested, notes)
values (
  '00000000-0000-0000-0000-0000000e10a1', 'Fonds Image', 'EUR', 25000,
  'Note interne, à ne pas exporter'
);

insert into public.project_milestones (project_id, title, due_on)
values ('00000000-0000-0000-0000-0000000e10a1', 'Dépôt du dossier', '2027-03-12');

-- ---------------------------------------------------------------------------
-- Demande : forme canonique
-- ---------------------------------------------------------------------------

select is(
  public.parametres_export(
    '{"sections": ["planning", "budget", "budget"], "documents": ["scenario", "note_intention"], "autre": 1}'
  ),
  '{"sections": ["budget", "planning"], "documents": ["note_intention", "scenario"]}'::jsonb,
  'Une demande est ramenée à sa forme canonique : listes triées, sans doublon'
);

select throws_ok(
  $$ select public.parametres_export('{"sections": ["storyboard"]}') $$,
  '22023',
  null,
  'Une section inconnue est refusée'
);

select throws_ok(
  $$ select public.parametres_export('{"documents": ["facture"]}') $$,
  '22023',
  null,
  'Un type de document inconnu est refusé'
);

select throws_ok(
  $$ select public.parametres_export('{"sections": [], "documents": []}') $$,
  '22023',
  null,
  'Une demande sans aucune section est refusée'
);

select throws_ok(
  $$ select public.parametres_export('["budget"]') $$,
  '22023',
  null,
  'Une demande qui n''est pas un objet est refusée'
);

-- ---------------------------------------------------------------------------
-- Contenu du dossier
-- ---------------------------------------------------------------------------

select is(
  (
    select jsonb_agg(d ->> 'titre')
    from jsonb_array_elements(
      public.contenu_dossier(
        '00000000-0000-0000-0000-0000000e10a1',
        '{"documents": ["note_intention", "scenario"]}'
      ) -> 'documents'
    ) d
  ),
  '["Note finale"]'::jsonb,
  'Seuls les documents finalisés, des types demandés, entrent dans le dossier'
);

select ok(
  not (
    public.contenu_dossier('00000000-0000-0000-0000-0000000e10a1', '{"sections": ["synthese"]}')
    ?| array['budget', 'financements', 'planning', 'documents']
  ),
  'Une section non demandée n''est pas transmise'
);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000e10a1', '{"sections": ["budget"]}')
    -> 'budget' -> 'lignes' -> 0 ->> 'total',
  '3000.00',
  'Le budget demandé arrive avec ses lignes et leurs totaux'
);

select ok(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000e10a1', '{"sections": ["financements", "planning"]}'
  )::text not like '%Note interne%',
  'Les notes internes d''une candidature ne partent pas dans le dossier'
);

select is(
  public.contenu_dossier(gen_random_uuid(), '{"sections": ["synthese"]}'),
  null,
  'Aucun contenu pour un projet qui n''existe pas'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    where p.oid = 'public.contenu_dossier(uuid, jsonb)'::regprocedure
  ),
  false,
  'contenu_dossier() n''est pas security definer : la RLS de l''appelant s''applique'
);

-- Le lecteur ne lit pas le budget : appelée par lui, la fonction ne le lui
-- livre pas davantage.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e1003", "role": "authenticated"}', true);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000e10a1', '{"sections": ["budget"]}')
    -> 'budget',
  'null'::jsonb,
  'Un lecteur n''obtient pas le budget par le contenu du dossier'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e1005", "role": "authenticated"}', true);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000e10a1', '{"sections": ["synthese"]}'),
  null,
  'Un compte étranger au projet n''obtient aucun contenu'
);

-- ---------------------------------------------------------------------------
-- Demande d'export
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e1001", "role": "authenticated"}', true);

select is(
  (
    select d.unit || ' / ' || d.quantity
    from public.creer_devis(
      '00000000-0000-0000-0000-0000000e10a1', 'pdf_export',
      '{"sections": ["synthese", "budget"], "documents": ["note_intention"]}'
    ) d
  ),
  'pdf / 1',
  'Un export compte une unité PDF'
);

select public.accepter_devis(
  (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-0000000e10a1'
     and q.action = 'pdf_export'
     and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-export'
);

-- Une tâche de logline, pour vérifier qu'aucun export ne s'y lit ni ne s'y
-- dépose. Ses paramètres seraient ceux d'un export valide : seule son action
-- doit la tenir à l'écart.
select public.creer_devis(
  '00000000-0000-0000-0000-0000000e10a1', 'logline', '{"sections": ["synthese"]}'
);
select public.accepter_devis(
  (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-0000000e10a1'
     and q.action = 'logline'
     and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-logline'
);

reset role;
select set_config('request.jwt.claims', '', true);

select public.reclamer_travail('worker-pdf', array['pdf_export']);
select public.reclamer_travail('worker-pdf', array['logline']);

-- ---------------------------------------------------------------------------
-- Ce que le worker lit
-- ---------------------------------------------------------------------------

set local role filmfund_worker;
insert into lu select 'export', public.contexte_export(pg_temp.essai('k-export'));
insert into lu select 'inconnu', public.contexte_export(gen_random_uuid());
insert into lu select 'logline', public.contexte_export(pg_temp.essai('k-logline'));
reset role;

select is(
  (select contexte -> 'contenu' -> 'fiche' ->> 'titre' from lu where repere = 'export'),
  'Projet PDF',
  'Le worker, sous son rôle, lit le contenu du dossier de sa tâche'
);

select is(
  (select contexte from lu where repere = 'inconnu'),
  null,
  'Aucun contenu pour un essai qui n''existe pas'
);

select is(
  (select contexte from lu where repere = 'logline'),
  null,
  'Aucun contenu de dossier pour une tâche qui n''est pas un export'
);

select ok(
  not has_table_privilege('filmfund_worker', 'public.project_exports', 'select, insert, update, delete'),
  'Le worker n''a aucun droit sur la table des exports'
);

select ok(
  not has_function_privilege('filmfund_worker', 'public.contenu_dossier(uuid, jsonb)', 'execute')
  and not has_function_privilege('filmfund_worker', 'public.export_disponible(uuid, jsonb, text)', 'execute'),
  'Le worker ne lit pas le contenu d''un projet hors de sa tâche'
);

select is(
  (select contexte ->> 'empreinte' from lu where repere = 'export'),
  public.empreinte_dossier(
    '00000000-0000-0000-0000-0000000e10a1',
    '{"documents": ["note_intention"], "sections": ["budget", "synthese"]}'
  ),
  'L''empreinte remise au worker est celle du contenu, quel que soit l''ordre de la demande'
);

select set_config(
  'test.empreinte', (select contexte ->> 'empreinte' from lu where repere = 'export'), true
);

-- ---------------------------------------------------------------------------
-- Dépôt du fichier
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.pdf(), 3, %L) $$,
    pg_temp.essai('k-export'), current_setting('test.empreinte')
  ),
  'TR001',
  null,
  'Pas de dépôt avant que l''essai soit marqué soumis'
);

select public.marquer_tentative_soumise(pg_temp.essai('k-export'));
select public.marquer_tentative_soumise(pg_temp.essai('k-logline'));

select throws_ok(
  format(
    $$ select public.livrer_export(%L, '\x00010203040506'::bytea, 3, %L) $$,
    pg_temp.essai('k-export'), current_setting('test.empreinte')
  ),
  '22023',
  null,
  'Un fichier qui n''est pas un PDF est refusé'
);

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.pdf() || decode(repeat('00', 5242880), 'hex'), 3, %L) $$,
    pg_temp.essai('k-export'), current_setting('test.empreinte')
  ),
  '22023',
  null,
  'Un fichier de plus de 5 Mo est refusé'
);

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.pdf(), 0, %L) $$,
    pg_temp.essai('k-export'), current_setting('test.empreinte')
  ),
  '22023',
  null,
  'Un nombre de pages nul est refusé'
);

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.pdf(), 3, 'pas-une-empreinte') $$,
    pg_temp.essai('k-export')
  ),
  '22023',
  null,
  'Une empreinte mal formée est refusée'
);

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.pdf(), 3, %L) $$,
    pg_temp.essai('k-logline'), current_setting('test.empreinte')
  ),
  '0A000',
  null,
  'Aucun export ne se dépose sur une tâche d''une autre action'
);

set local role filmfund_worker;
insert into obtenu
select 'depot', public.livrer_export(
  pg_temp.essai('k-export'), pg_temp.pdf(), 3, current_setting('test.empreinte')
)::text;
reset role;

select is(
  (select valeur from obtenu where repere = 'depot'),
  pg_temp.export('k-export')::text,
  'Le worker, sous son rôle, dépose le fichier'
);

select is(
  (select j.state from public.jobs j where j.id = pg_temp.travail('k-export')),
  'succeeded',
  'Le dépôt conclut la tâche dans la même transaction'
);

select is(
  (
    select s.consumed
    from public.reservation_settlements s
    join public.jobs j on j.reservation_id = s.reservation_id
    where j.id = pg_temp.travail('k-export')
  ),
  1,
  'L''unité PDF réservée est consommée'
);

select is(
  (
    select e.size_bytes || ' octets / ' || e.pages || ' pages / '
      || extract(day from e.expires_at - e.created_at) || ' jours'
    from public.project_exports e
    where e.id = pg_temp.export('k-export')
  ),
  '9 octets / 3 pages / 30 jours',
  'L''export garde sa taille, ses pages et son échéance à 30 jours'
);

select is(
  (select e.params from public.project_exports e where e.id = pg_temp.export('k-export')),
  '{"sections": ["budget", "synthese"], "documents": ["note_intention"]}'::jsonb,
  'L''export garde la demande sous sa forme canonique'
);

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.pdf(), 3, %L) $$,
    pg_temp.essai('k-export'), current_setting('test.empreinte')
  ),
  'TR001',
  null,
  'Un second dépôt pour le même essai est refusé'
);

-- ---------------------------------------------------------------------------
-- Lecture des exports
-- ---------------------------------------------------------------------------

set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e1001", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.project_exports),
  1,
  'Le porteur lit l''export de son projet'
);

select is(
  public.export_disponible(
    '00000000-0000-0000-0000-0000000e10a1',
    '{"documents": ["note_intention"], "sections": ["synthese", "budget"]}'
  ),
  pg_temp.export('k-export'),
  'Un export identique encore disponible est retrouvé'
);

select is(
  public.export_disponible(
    '00000000-0000-0000-0000-0000000e10a1', '{"sections": ["synthese"]}'
  ),
  null,
  'Une autre demande ne retrouve pas cet export'
);

select throws_ok(
  $$ delete from public.project_exports $$,
  '42501',
  null,
  'Le porteur ne supprime pas un export par l''API'
);

select throws_ok(
  format(
    $$ update public.project_exports set pages = 1 where id = %L $$,
    pg_temp.export('k-export')
  ),
  '42501',
  null,
  'Le porteur ne modifie pas un export par l''API'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e1002", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.project_exports),
  1,
  'Un éditeur lit l''export'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e1003", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.project_exports),
  0,
  'Un lecteur ne lit pas l''export : il peut contenir le budget'
);

select is(
  public.export_disponible(
    '00000000-0000-0000-0000-0000000e10a1',
    '{"documents": ["note_intention"], "sections": ["synthese", "budget"]}'
  ),
  null,
  'Un lecteur ne retrouve aucun export'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e1005", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.project_exports),
  0,
  'Un compte étranger au projet ne lit pas l''export'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e1004", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.project_exports where project_id = '00000000-0000-0000-0000-0000000e10a1'),
  1,
  'Un administrateur lit l''export'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Le contenu change : l'export ne correspond plus à l'état du projet.
update public.projects set synopsis = 'Un autre synopsis.' where id = '00000000-0000-0000-0000-0000000e10a1';

select is(
  (
    select e.id
    from public.project_exports e
    where e.id = pg_temp.export('k-export')
      and e.content_fingerprint = public.empreinte_dossier(e.project_id, e.params)
  ),
  null,
  'Un export n''est plus tenu pour identique dès que le contenu du projet change'
);

-- ---------------------------------------------------------------------------
-- Droits d'exécution et purge
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'public.contexte_export(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.livrer_export(uuid, bytea, integer, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.purger_exports_expires()', 'execute'),
  'Aucun compte connecté n''exécute les fonctions du worker'
);

select ok(
  not has_function_privilege('anon', 'public.export_disponible(uuid, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'public.contenu_dossier(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.empreinte_dossier(uuid, jsonb)', 'execute'),
  'Un visiteur n''exécute aucune fonction des exports'
);

select ok(
  has_table_privilege('authenticated', 'public.project_exports', 'select')
  and not has_table_privilege('authenticated', 'public.project_exports', 'insert, update, delete, truncate')
  and not has_table_privilege('anon', 'public.project_exports', 'select, insert, update, delete'),
  'La table des exports ne s''ouvre qu''en lecture, aux comptes connectés'
);

update public.project_exports
set created_at = now() - interval '31 days', expires_at = now() - interval '1 day'
where id = pg_temp.export('k-export');

set local role filmfund_worker;
insert into obtenu select 'purge', public.purger_exports_expires()::text;
reset role;

select is(
  (select valeur from obtenu where repere = 'purge'),
  '1',
  'Le worker, sous son rôle, purge les exports expirés'
);

select is(
  (select count(*)::int from public.project_exports where project_id = '00000000-0000-0000-0000-0000000e10a1'),
  0,
  'Un export expiré disparaît'
);

select is(
  (select j.state from public.jobs j where j.id = pg_temp.travail('k-export')),
  'succeeded',
  'La tâche et sa consommation survivent à la purge du fichier'
);

select * from finish();

rollback;
