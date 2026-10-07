-- Administration des comptes (lot V1) : qui lit la liste des comptes, ce
-- qu'elle rend, et dans quelles bornes — vu depuis des sessions simulées.
--
-- Les lectures sont relevées dans un réglage de session, puis vérifiées une
-- fois le rôle rendu.

begin;

select plan(18);

insert into auth.users (id, email, aud, role, email_confirmed_at, last_sign_in_at)
values
  ('00000000-0000-0000-0000-0000000a0c01', 'admin-comptes@exemple.test', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000b0c01', 'membre-comptes@exemple.test', 'authenticated', 'authenticated', null, null),
  ('00000000-0000-0000-0000-0000000c0c01', 'autre-comptes@exemple.test', 'authenticated', 'authenticated', now(), null);

update public.profiles set role = 'admin', display_name = 'Awa Comptes'
where id = '00000000-0000-0000-0000-0000000a0c01';

update public.profiles
set display_name = 'Bintou', first_name = 'Zéphyrine-Comptes', country = 'CM', profile_type = 'PRODUCER'
where id = '00000000-0000-0000-0000-0000000b0c01';

-- ---------------------------------------------------------------------------
-- Ce que la fonction est, lu au catalogue
-- ---------------------------------------------------------------------------

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'comptes_administration'
  ),
  'TABLE(id uuid, email text, email_confirme boolean, cree_le timestamp with time zone, derniere_connexion timestamp with time zone, display_name text, role user_role, profile_type profile_type, country text, total bigint)',
  'La liste ne rend d''un compte que son adresse, ses dates et l''essentiel du profil'
);

select ok(
  (
    select p.prosecdef and p.provolatile = 's'
      and p.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'comptes_administration'
  ),
  'La fonction ne modifie rien, et son chemin de recherche est figé'
);

select ok(
  not has_function_privilege('anon', 'public.comptes_administration(text, integer, integer, uuid)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.comptes_administration(text, integer, integer, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.comptes_administration(text, integer, integer, uuid)', 'execute'),
  'Ni un visiteur ni le worker n''exécutent la fonction'
);

-- ---------------------------------------------------------------------------
-- Sans session, puis sous la session d'un membre : refus
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.comptes_administration() $$,
  '42501', null, 'Sans session, la liste est refusée'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000b0c01", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.comptes_administration() $$,
  '42501', null, 'Un membre ne lit pas la liste des comptes'
);

select throws_ok(
  $$ select * from public.comptes_administration(
       p_compte => '00000000-0000-0000-0000-0000000b0c01') $$,
  '42501', null, 'Un membre ne lit pas même son propre compte par cette fonction'
);

-- ---------------------------------------------------------------------------
-- Session d'un administrateur
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000a0c01", "role": "authenticated"}',
  true
);

select set_config(
  'test.membre',
  (
    select row(c.email, c.email_confirme, c.derniere_connexion is null, c.display_name, c.role,
               c.profile_type, c.country, c.total)::text
    from public.comptes_administration('membre-comptes@exemple.test') c
  ),
  true
);

select set_config(
  'test.par_casse',
  (select count(*)::text from public.comptes_administration('  MEMBRE-Comptes@EXEMPLE.test ')),
  true
);

select set_config(
  'test.par_prenom',
  (select string_agg(c.email, ',') from public.comptes_administration('zéphyrine-comptes') c),
  true
);

select set_config(
  'test.par_nom_affiche',
  (select string_agg(c.email, ',') from public.comptes_administration('awa comptes') c),
  true
);

-- Avec `like`, « _ » vaudrait n'importe quel caractère, et « % » toute la liste.
select set_config(
  'test.motif',
  (
    select (select count(*) from public.comptes_administration('membre_comptes@exemple.test'))
      + (select count(*) from public.comptes_administration('%-comptes@exemple.test%'))
  )::text,
  true
);

select set_config(
  'test.page',
  (
    select count(*)::text || '/' || max(c.total)::text
    from public.comptes_administration('-comptes@exemple.test', 2, 0) c
  ),
  true
);

select set_config(
  'test.page_suivante',
  (
    select count(*)::text
    from public.comptes_administration('-comptes@exemple.test', 2, 2) c
  ),
  true
);

select set_config(
  'test.un_compte',
  (
    select string_agg(c.email || '/' || c.total::text, ',')
    from public.comptes_administration(p_compte => '00000000-0000-0000-0000-0000000c0c01') c
  ),
  true
);

select set_config(
  'test.compte_absent',
  (
    select count(*)::text
    from public.comptes_administration(p_compte => '00000000-0000-0000-0000-0000000d0c01') c
  ),
  true
);

select throws_ok(
  $$ select * from public.comptes_administration('', 101) $$,
  '22023', null, 'Plus de cent comptes par appel sont refusés'
);

select throws_ok(
  $$ select * from public.comptes_administration('', 0) $$,
  '22023', null, 'Une limite nulle est refusée'
);

select throws_ok(
  $$ select * from public.comptes_administration('', 50, -1) $$,
  '22023', null, 'Un décalage négatif est refusé'
);

select throws_ok(
  $$ select * from public.comptes_administration(repeat('a', 121)) $$,
  '22023', null, 'Une recherche de 121 caractères est refusée'
);

reset role;

select is(
  current_setting('test.membre'),
  row('membre-comptes@exemple.test'::text, false, true, 'Bintou'::text, 'member'::public.user_role,
      'PRODUCER'::public.profile_type, 'CM'::text, 1::bigint)::text,
  'Un administrateur lit l''adresse, la confirmation, la dernière connexion et le profil d''un compte'
);

select is(
  current_setting('test.par_casse') || '|' || current_setting('test.par_prenom') || '|'
    || current_setting('test.par_nom_affiche'),
  '1|membre-comptes@exemple.test|admin-comptes@exemple.test',
  'La recherche porte sur l''adresse, le prénom et le nom affiché, sans tenir compte de la casse'
);

select is(
  current_setting('test.motif'),
  '0',
  'Le texte cherché n''est jamais lu comme un motif'
);

select is(
  current_setting('test.page') || '|' || current_setting('test.page_suivante'),
  '2/3|1',
  'La liste se lit par pages, et chaque ligne dit le nombre total de comptes trouvés'
);

select is(
  current_setting('test.un_compte') || '|' || current_setting('test.compte_absent'),
  'autre-comptes@exemple.test/1|0',
  'Un compte se lit par son identifiant ; un identifiant inconnu ne rend rien'
);

-- Une lecture ne laisse aucune trace : le journal ne retient que des actions.
select is(
  (
    select count(*)::int from public.admin_audit_log
    where actor_id in (
      '00000000-0000-0000-0000-0000000a0c01',
      '00000000-0000-0000-0000-0000000b0c01'
    )
  ),
  0,
  'Consulter la liste n''écrit rien au journal'
);

-- ---------------------------------------------------------------------------
-- Mode privé : rien ne change, la liste reste aux administrateurs
-- ---------------------------------------------------------------------------

update public.app_settings set private_admin_only = true where id;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000b0c01", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.comptes_administration() $$,
  '42501', null, 'En mode privé, un membre ne lit toujours pas la liste'
);

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000a0c01", "role": "authenticated"}',
  true
);

select set_config(
  'test.prive_admin',
  (select count(*)::text from public.comptes_administration('-comptes@exemple.test')),
  true
);

reset role;

select is(
  current_setting('test.prive_admin'),
  '3',
  'En mode privé, un administrateur lit toujours la liste'
);

select * from finish();

rollback;
