-- Exports DOCX (lot M3) : devis, quota commun avec le PDF, dépôt contrôlé
-- selon le format, export identique propre à chaque format.
--
-- AUCUN FICHIER RÉEL : les fichiers déposés sont des en-têtes écrits à la
-- main. Le worker est joué sous son rôle. Un plan d'essai à deux exports par
-- mois évite de toucher au catalogue réel ; la transaction est annulée.

begin;

select plan(20);

-- Les tâches laissées par d'autres suites passeraient avant celles du test.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test des exports Word'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

create function pg_temp.travail(p_cle text) returns uuid language sql stable security definer as $$
  select j.id from public.jobs j
  join public.reservations r on r.id = j.reservation_id
  where r.idempotency_key = p_cle;
$$;

create function pg_temp.essai(p_cle text) returns uuid language sql stable security definer as $$
  select a.id from public.job_attempts a
  join public.jobs j on j.id = a.job_id
  where j.id = pg_temp.travail(p_cle) and a.number = j.attempts;
$$;

create function pg_temp.export(p_cle text) returns uuid language sql stable security definer as $$
  select e.id from public.project_exports e where e.job_id = pg_temp.travail(p_cle);
$$;

-- « %PDF-1.3 » et « PK\x03\x04 » suivis de quelques octets : de quoi passer
-- le contrôle de signature, rien de plus.
create function pg_temp.pdf() returns bytea language sql immutable as $$
  select '\x255044462d312e330a'::bytea;
$$;

create function pg_temp.docx() returns bytea language sql immutable as $$
  select '\x504b0304140000000800'::bytea;
$$;

create temp table lu (repere text, contexte jsonb);
create temp table obtenu (repere text, valeur text);
grant insert, select on lu, obtenu to filmfund_worker;

insert into public.plans (code, name, position) values ('essai_docx', 'Essai Word', 503);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_docx', 5, 1, 0, 10, 0, 2, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000d0c01', 'docx-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d0c02', 'docx-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d0c03', 'docx-lecteur@exemple.test', 'authenticated', 'authenticated');

update public.studio_subscriptions
set plan_code = 'essai_docx', period_anchor = now() - interval '3 days'
where studio_id in (
  select id from public.studios
  where personal_owner_id = '00000000-0000-0000-0000-0000000d0c01'
);

insert into public.projects (id, owner_id, title, logline, synopsis)
values (
  '00000000-0000-0000-0000-0000000d0ca1', '00000000-0000-0000-0000-0000000d0c01',
  'Projet Word', 'Le pitch.', 'Le synopsis.'
);

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000d0ca1', '00000000-0000-0000-0000-0000000d0c02', 'editor'),
  ('00000000-0000-0000-0000-0000000d0ca1', '00000000-0000-0000-0000-0000000d0c03', 'viewer');

-- ---------------------------------------------------------------------------
-- Devis et quota
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000d0c01", "role": "authenticated"}', true);

select is(
  (
    select d.unit || ' / ' || d.quantity
    from public.creer_devis('00000000-0000-0000-0000-0000000d0ca1', 'docx_export', '{"sections": ["synthese"]}') d
  ),
  'pdf / 1',
  'Un export Word compte une unité d''export, comme un PDF'
);

select public.accepter_devis(
  (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-0000000d0ca1'
     and q.action = 'docx_export'
     and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-docx'
);

select public.creer_devis('00000000-0000-0000-0000-0000000d0ca1', 'pdf_export', '{"sections": ["synthese"]}');
select public.accepter_devis(
  (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-0000000d0ca1'
     and q.action = 'pdf_export'
     and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-pdf'
);

select isnt(
  (select q.fingerprint from public.quotes q
   where q.project_id = '00000000-0000-0000-0000-0000000d0ca1' and q.action = 'docx_export'),
  (select q.fingerprint from public.quotes q
   where q.project_id = '00000000-0000-0000-0000-0000000d0ca1' and q.action = 'pdf_export'),
  'La même demande en Word et en PDF : deux empreintes distinctes'
);

select throws_ok(
  $$ select public.creer_devis('00000000-0000-0000-0000-0000000d0ca1', 'docx_export', '{"sections": ["synthese"]}') $$,
  '53400',
  null,
  'Le quota d''exports est commun : un Word et un PDF l''épuisent'
);

select throws_ok(
  $$ select public.creer_devis('00000000-0000-0000-0000-0000000d0ca1', 'pdf_export', '{"sections": ["synthese"]}') $$,
  '53400',
  null,
  'Un PDF de plus est refusé lui aussi'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000d0c03", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.creer_devis('00000000-0000-0000-0000-0000000d0ca1', 'docx_export', '{"sections": ["synthese"]}') $$,
  '42501',
  null,
  'Un lecteur ne demande pas d''export Word'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Ce que le worker lit et dépose
-- ---------------------------------------------------------------------------

select public.reclamer_travail('worker-docx', array['docx_export']);

select is(
  (
    select string_agg(j.action || '=' || j.state, ', ' order by j.action)
    from public.jobs j
    where j.id in (pg_temp.travail('k-docx'), pg_temp.travail('k-pdf'))
  ),
  'docx_export=running, pdf_export=queued',
  'Un worker qui ne demande que le Word ne prend pas la tâche PDF'
);

select public.reclamer_travail('worker-pdf', array['pdf_export']);

set local role filmfund_worker;
insert into lu select 'docx', public.contexte_export(pg_temp.essai('k-docx'));
insert into lu select 'pdf', public.contexte_export(pg_temp.essai('k-pdf'));
reset role;

select is(
  (select string_agg(repere || '=' || (contexte ->> 'format'), ', ' order by repere) from lu),
  'docx=docx, pdf=pdf',
  'Le contexte remis au worker indique le format de la tâche'
);

select is(
  (select contexte -> 'contenu' -> 'fiche' ->> 'titre' from lu where repere = 'docx'),
  'Projet Word',
  'Le worker lit le contenu du dossier d''une tâche Word'
);

select set_config('test.empreinte', (select contexte ->> 'empreinte' from lu where repere = 'docx'), true);

select public.marquer_tentative_soumise(pg_temp.essai('k-docx'));
select public.marquer_tentative_soumise(pg_temp.essai('k-pdf'));

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.pdf(), null, %L) $$,
    pg_temp.essai('k-docx'), current_setting('test.empreinte')
  ),
  '22023',
  null,
  'Un PDF déposé pour une tâche Word est refusé'
);

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.docx(), 3, %L) $$,
    pg_temp.essai('k-docx'), current_setting('test.empreinte')
  ),
  '22023',
  null,
  'Un fichier Word ne déclare pas de nombre de pages'
);

select throws_ok(
  format(
    $$ select public.livrer_export(%L, pg_temp.docx(), 3, %L) $$,
    pg_temp.essai('k-pdf'), current_setting('test.empreinte')
  ),
  '22023',
  null,
  'Une archive Word déposée pour une tâche PDF est refusée'
);

set local role filmfund_worker;
insert into obtenu
select 'docx', public.livrer_export(
  pg_temp.essai('k-docx'), pg_temp.docx(), null, current_setting('test.empreinte')
)::text;
insert into obtenu
select 'pdf', public.livrer_export(
  pg_temp.essai('k-pdf'), pg_temp.pdf(), 2, current_setting('test.empreinte')
)::text;
reset role;

select is(
  (
    select e.format || ' / ' || coalesce(e.pages::text, 'sans pages') || ' / ' || e.size_bytes
    from public.project_exports e where e.id = pg_temp.export('k-docx')
  ),
  'docx / sans pages / 10',
  'Le worker dépose le fichier Word, sans nombre de pages'
);

select is(
  (
    select s.consumed
    from public.reservation_settlements s
    join public.jobs j on j.reservation_id = s.reservation_id
    where j.id = pg_temp.travail('k-docx')
  ),
  1,
  'L''unité d''export réservée pour le Word est consommée'
);

-- ---------------------------------------------------------------------------
-- La table elle-même
-- ---------------------------------------------------------------------------

select throws_ok(
  format(
    $$ update public.project_exports set file = pg_temp.pdf() where id = %L $$,
    pg_temp.export('k-docx')
  ),
  '23514',
  null,
  'La table refuse un PDF rangé comme fichier Word'
);

select throws_ok(
  format(
    $$ update public.project_exports set format = 'odt' where id = %L $$,
    pg_temp.export('k-docx')
  ),
  '23514',
  null,
  'La table refuse un format inconnu'
);

select throws_ok(
  format(
    $$ update public.project_exports set pages = null where id = %L $$,
    pg_temp.export('k-pdf')
  ),
  '23514',
  null,
  'Un PDF garde son nombre de pages'
);

-- ---------------------------------------------------------------------------
-- Export identique, format par format
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000d0c01", "role": "authenticated"}', true);

select is(
  public.export_disponible('00000000-0000-0000-0000-0000000d0ca1', '{"sections": ["synthese"]}', 'docx'),
  pg_temp.export('k-docx'),
  'Une demande en Word retrouve l''export Word identique'
);

select is(
  public.export_disponible('00000000-0000-0000-0000-0000000d0ca1', '{"sections": ["synthese"]}'),
  pg_temp.export('k-pdf'),
  'Sans format précisé, c''est le PDF identique qui est retrouvé'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000d0c02", "role": "authenticated"}', true);
select is(
  (select string_agg(format, ', ' order by format) from public.project_exports),
  'docx, pdf',
  'Un éditeur lit les exports des deux formats'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000d0c03", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.project_exports),
  0,
  'Un lecteur ne lit aucun export, Word compris : il peut contenir le budget'
);

reset role;

select * from finish();

rollback;
