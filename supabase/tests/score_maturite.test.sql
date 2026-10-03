-- Score de maturité (lot S1) : pondérations versionnées et faits d'un projet,
-- vus depuis la base.
--
-- Le calcul du score se fait dans l'application et a sa propre suite. Ici se
-- vérifient la table des pondérations — total 100, ajout seul, publication
-- réservée et journalisée, mode privé — et ce que la fonction des faits
-- remet à chaque rôle. La transaction est annulée.

begin;

select plan(27);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000005c001', 'maturite-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000005c003', 'maturite-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000005c004', 'maturite-admin@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000005c005', 'maturite-etranger@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000005c004';

insert into public.projects (id, owner_id, title, logline, genre)
values (
  '00000000-0000-0000-0000-00000005c0a1', '00000000-0000-0000-0000-00000005c001',
  'Projet mesuré', 'Le pitch.', 'drame'
);

insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-00000005c0a1', '00000000-0000-0000-0000-00000005c003', 'viewer');

insert into public.project_characters (project_id, name, role, description, position)
values ('00000000-0000-0000-0000-00000005c0a1', 'Awa', 'principal', 'Décrite.', 1);

insert into public.project_budgets (project_id, currency)
values ('00000000-0000-0000-0000-00000005c0a1', 'XAF');
insert into public.budget_lines (project_id, category, label, quantity, unit_cost)
values ('00000000-0000-0000-0000-00000005c0a1', 'developpement', 'Écriture', 1, 1000);

insert into public.project_fundings (project_id, funder, currency, amount_requested, notes)
values ('00000000-0000-0000-0000-00000005c0a1', 'Fonds Image', 'EUR', 25000, 'Note interne');

-- ---------------------------------------------------------------------------
-- Pondérations : la table
-- ---------------------------------------------------------------------------

select is(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.readiness_weight_versions'::regclass),
  true,
  'La RLS est active sur les pondérations'
);

select is(
  (
    select array[concept, narrative, characters, artistic_vision, feasibility, budget, financing, market, dossier]
    from public.readiness_weight_versions
    where version_number = 1
  ),
  array[20, 15, 15, 15, 10, 10, 5, 5, 5],
  'La première version porte les pondérations du cahier des charges'
);

select throws_ok(
  $$ insert into public.readiness_weight_versions
       (concept, narrative, characters, artistic_vision, feasibility, budget, financing, market, dossier)
     values (19, 15, 15, 15, 10, 10, 5, 5, 5) $$,
  '23514',
  null,
  'Un total différent de 100 est refusé'
);

select throws_ok(
  $$ insert into public.readiness_weight_versions
       (concept, narrative, characters, artistic_vision, feasibility, budget, financing, market, dossier)
     values (30, 15, 15, 15, 10, 10, 5, 5, -5) $$,
  '23514',
  null,
  'Un poids négatif est refusé, même si le total fait 100'
);

select throws_ok(
  $$ update public.readiness_weight_versions set concept = concept where version_number = 1 $$,
  '42501',
  null,
  'Une version publiée ne se modifie pas'
);

select throws_ok(
  $$ delete from public.readiness_weight_versions where version_number = 1 $$,
  '42501',
  null,
  'Une version publiée ne se supprime pas'
);

select throws_ok(
  $$ truncate public.readiness_weight_versions $$,
  '42501',
  null,
  'La table des pondérations ne se vide pas'
);

select ok(
  not has_table_privilege('anon', 'public.readiness_weight_versions', 'select')
  and has_table_privilege('authenticated', 'public.readiness_weight_versions', 'select')
  and not has_table_privilege('authenticated', 'public.readiness_weight_versions', 'update, delete, truncate')
  and not has_column_privilege('authenticated', 'public.readiness_weight_versions', 'version_number', 'insert')
  and not has_column_privilege('authenticated', 'public.readiness_weight_versions', 'published_by', 'insert')
  and not has_column_privilege('authenticated', 'public.readiness_weight_versions', 'published_at', 'insert'),
  'Les comptes lisent les pondérations ; ni le numéro, ni l''auteur, ni la date ne se fournissent ; les visiteurs n''y ont pas accès'
);

-- ---------------------------------------------------------------------------
-- Pondérations : la publication
-- ---------------------------------------------------------------------------

select set_config(
  'test.derniere', (select max(version_number)::text from public.readiness_weight_versions), true
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005c001", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.readiness_weight_versions where version_number = 1),
  1,
  'Un compte connecté lit les pondérations'
);

select throws_ok(
  $$ insert into public.readiness_weight_versions
       (concept, narrative, characters, artistic_vision, feasibility, budget, financing, market, dossier)
     values (20, 15, 15, 15, 10, 10, 5, 5, 5) $$,
  '42501',
  null,
  'Un compte ordinaire ne publie pas de pondérations'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005c004", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.readiness_weight_versions
       (concept, narrative, characters, artistic_vision, feasibility, budget, financing, market, dossier)
     values (25, 15, 15, 15, 10, 10, 5, 5, 0) $$,
  'Un administrateur publie une version'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (
    select version_number || ' / ' || published_by
    from public.readiness_weight_versions
    order by version_number desc
    limit 1
  ),
  (current_setting('test.derniere')::int + 1) || ' / 00000000-0000-0000-0000-00000005c004',
  'La base numérote la version et la signe du compte qui la publie'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log l
    where l.action = 'publication_ponderations'
      and l.actor_id = '00000000-0000-0000-0000-00000005c004'
      and l.details = jsonb_build_object('version', current_setting('test.derniere')::int + 1)
  ),
  1,
  'La publication est journalisée dans la même transaction, avec son numéro'
);

-- ---------------------------------------------------------------------------
-- Fonctions : nature et droits
-- ---------------------------------------------------------------------------

select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.faits_maturite(uuid)'::regprocedure),
  false,
  'faits_maturite() n''est pas security definer : la RLS de l''appelant s''applique'
);

select ok(
  not has_function_privilege('anon', 'public.faits_maturite(uuid)', 'execute')
  and not has_function_privilege('filmfund_worker', 'public.faits_maturite(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.faits_maturite(uuid)', 'execute'),
  'faits_maturite() est fermée aux visiteurs et au worker, ouverte aux comptes'
);

select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    where p.oid in (
      'public.numeroter_version_ponderations()'::regprocedure,
      'public.version_ponderations_en_ajout_seul()'::regprocedure,
      'public.journaliser_publication_ponderations()'::regprocedure
    )
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
      )
  $$,
  'Les fonctions de déclencheur des pondérations ne s''appellent pas directement'
);

-- ---------------------------------------------------------------------------
-- Faits d'un projet
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::int
    from jsonb_object_keys(public.faits_maturite('00000000-0000-0000-0000-00000005c0a1'))
  ),
  26,
  'Les faits d''un projet comptent vingt-six éléments'
);

select is(
  (
    select bool_and(jsonb_typeof(valeur) in ('boolean', 'number'))
    from jsonb_each(public.faits_maturite('00000000-0000-0000-0000-00000005c0a1')) as f(cle, valeur)
  ),
  true,
  'Les faits ne sont que des compteurs et des oui/non : ni texte, ni montant, ni identité'
);

select is(
  public.faits_maturite(gen_random_uuid()),
  null,
  'Aucun fait pour un projet qui n''existe pas'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005c001", "role": "authenticated"}', true);

select is(
  (
    select jsonb_build_array(
      f -> 'pitch', f -> 'genre', f -> 'theme', f -> 'personnages', f -> 'personnages_principaux',
      f -> 'budget_ouvert', f -> 'lignes_budget', f -> 'candidatures', f -> 'candidatures_chiffrees'
    )
    from public.faits_maturite('00000000-0000-0000-0000-00000005c0a1') f
  ),
  '[true, true, false, 1, 1, true, 1, 1, 1]'::jsonb,
  'Le porteur obtient les faits de son projet, budget et financements compris'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005c003", "role": "authenticated"}', true);

select is(
  (
    select jsonb_build_array(
      f -> 'pitch', f -> 'personnages',
      f -> 'budget_ouvert', f -> 'lignes_budget', f -> 'postes_budget',
      f -> 'candidatures', f -> 'candidatures_chiffrees'
    )
    from public.faits_maturite('00000000-0000-0000-0000-00000005c0a1') f
  ),
  '[true, 1, false, 0, 0, 0, 0]'::jsonb,
  'Un lecteur n''apprend rien du budget ni des financements par les faits'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005c005", "role": "authenticated"}', true);

select is(
  public.faits_maturite('00000000-0000-0000-0000-00000005c0a1'),
  null,
  'Un compte étranger au projet n''obtient aucun fait'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005c004", "role": "authenticated"}', true);

select is(
  (
    select jsonb_build_array(f -> 'budget_ouvert', f -> 'candidatures')
    from public.faits_maturite('00000000-0000-0000-0000-00000005c0a1') f
  ),
  '[true, 1]'::jsonb,
  'Un administrateur hors de l''équipe obtient tous les faits'
);

-- ---------------------------------------------------------------------------
-- Mode privé
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
update public.app_settings set private_admin_only = true where id;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005c001", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.readiness_weight_versions),
  0,
  'En mode privé, un compte ordinaire ne lit plus les pondérations'
);

select is(
  public.faits_maturite('00000000-0000-0000-0000-00000005c0a1'),
  null,
  'En mode privé, le porteur n''obtient plus les faits de son projet'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005c004", "role": "authenticated"}', true);

select ok(
  (select count(*) from public.readiness_weight_versions) >= 1,
  'En mode privé, un administrateur lit toujours les pondérations'
);

select isnt(
  public.faits_maturite('00000000-0000-0000-0000-00000005c0a1'),
  null,
  'En mode privé, un administrateur obtient toujours les faits'
);

reset role;

select * from finish();

rollback;
