-- Intégrations IA : les clés des fournisseurs, vues depuis la base.
--
-- Aucune clé réelle : les valeurs ci-dessous sont factices et n'ouvrent rien.
-- La transaction est annulée ; les secrets créés disparaissent avec elle.

begin;

select plan(30);

create temp table lu (cle text);
grant insert, select on lu to filmfund_worker;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000c1001', 'integ-admin@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c1002', 'integ-membre@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000c1001';

create function pg_temp.en_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000c1001", "role": "authenticated"}', true)::void;
$$;

create function pg_temp.en_membre() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000c1002", "role": "authenticated"}', true)::void;
$$;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_provider_keys'::regclass),
  'La RLS est active sur l''état des intégrations'
);

select ok(
  exists (
    select 1 from pg_policies
    where tablename = 'ai_provider_keys'
      and policyname = 'Mode privé : administrateurs uniquement'
  ),
  'L''état des intégrations porte la politique restrictive du mode privé'
);

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'ai_provider_keys'
     and column_name in ('secret', 'key', 'cle', 'api_key', 'value')),
  0,
  'Aucune colonne de cette table ne peut contenir une clé'
);

select ok(
  has_function_privilege('filmfund_worker', 'public.cle_fournisseur(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.cle_fournisseur(text)', 'execute')
    and not has_function_privilege('anon', 'public.cle_fournisseur(text)', 'execute'),
  'La lecture de la clé n''est offerte qu''au worker'
);

select ok(
  has_function_privilege('authenticated', 'public.definir_cle_fournisseur(text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.retirer_cle_fournisseur(text)', 'execute')
    and not has_function_privilege('anon', 'public.definir_cle_fournisseur(text, text)', 'execute')
    and not has_function_privilege('anon', 'public.retirer_cle_fournisseur(text)', 'execute'),
  'Configurer un fournisseur demande un compte connecté'
);

select ok(
  not has_function_privilege('filmfund_worker', 'public.definir_cle_fournisseur(text, text)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.retirer_cle_fournisseur(text)', 'execute'),
  'Le worker lit la clé, il n''en pose ni n''en retire'
);

-- ---------------------------------------------------------------------------
-- Qui configure
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.en_membre();

select throws_ok(
  $$ select public.definir_cle_fournisseur('anthropic', 'sk-ant-factice-aaaaaaaaaaaaaaaaaaaa') $$,
  '42501',
  'Action réservée à l''administration.',
  'Un compte ordinaire n''enregistre aucune clé'
);

select pg_temp.en_admin();

select throws_ok(
  $$ select public.definir_cle_fournisseur('mistral', 'sk-factice-aaaaaaaaaaaaaaaaaaaaaa') $$,
  '22023',
  null,
  'Un fournisseur inconnu est refusé'
);

select throws_ok(
  $$ select public.definir_cle_fournisseur('anthropic', 'trop-courte') $$,
  '22023',
  null,
  'Une clé trop courte est refusée'
);

select throws_ok(
  $$ select public.definir_cle_fournisseur('anthropic', 'sk-ant-factice avec espace zzzz') $$,
  '22023',
  null,
  'Une clé contenant une espace est refusée : un copier-coller trop large'
);

select is(
  (select k.provider || ' / ' || k.configured_by
   from public.definir_cle_fournisseur('anthropic', '  sk-ant-factice-aaaaaaaaaaaaaaaaaaaa  ') k),
  'anthropic / 00000000-0000-0000-0000-0000000c1001',
  'Un administrateur enregistre la clé, à son nom'
);

select is(
  (select count(*)::int from public.ai_provider_keys),
  1,
  'L''état est inscrit'
);

-- ---------------------------------------------------------------------------
-- Ce que le worker lit, et personne d'autre
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);

-- Le coffre ne se lit qu'avec les droits du propriétaire de la base : ces
-- comptages sortent donc du rôle `authenticated`.
select is(
  (select count(*)::int from vault.secrets where name = 'ia_anthropic'),
  1,
  'Le secret est entré au coffre'
);

set local role filmfund_worker;
insert into lu select public.cle_fournisseur('anthropic');
do $$ begin
  perform 1 from public.ai_provider_keys;
  insert into lu values ('TABLE LUE');
exception when others then insert into lu values ('table refusée (' || sqlstate || ')');
end $$;
reset role;

select is(
  (select cle from lu limit 1),
  'sk-ant-factice-aaaaaaaaaaaaaaaaaaaa',
  'Le worker lit la clé, débarrassée des espaces de bord'
);

select is(
  (select cle from lu offset 1 limit 1),
  'table refusée (42501)',
  'Le worker n''a aucun droit sur la table d''état'
);

select is(
  (select public.cle_fournisseur('openai')),
  null,
  'Un fournisseur non configuré ne rend aucune clé'
);

-- ---------------------------------------------------------------------------
-- Remplacement, lecture et retrait
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.en_admin();

select is(
  (select count(*)::int from public.definir_cle_fournisseur('anthropic', 'sk-ant-factice-bbbbbbbbbbbbbbbbbbbb')),
  1,
  'Un administrateur remplace la clé'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.ai_provider_keys),
  1,
  'Un remplacement ne crée pas une seconde ligne'
);

select is(
  (select count(*)::int from vault.secrets where name = 'ia_anthropic'),
  1,
  'Un remplacement ne laisse pas l''ancien secret au coffre'
);

set local role filmfund_worker;
insert into lu select public.cle_fournisseur('anthropic');
reset role;

select is(
  (select cle from lu offset 2 limit 1),
  'sk-ant-factice-bbbbbbbbbbbbbbbbbbbb',
  'Le worker lit la nouvelle clé'
);

set local role authenticated;
select pg_temp.en_membre();

select is(
  (select count(*)::int from public.ai_provider_keys),
  0,
  'Un compte ordinaire ne lit même pas l''état des intégrations'
);

select throws_ok(
  $$ select public.retirer_cle_fournisseur('anthropic') $$,
  '42501',
  null,
  'Un compte ordinaire ne retire aucune clé'
);

select pg_temp.en_admin();

select is(
  (select count(*)::int from public.ai_provider_keys),
  1,
  'Un administrateur lit l''état des intégrations'
);

select throws_ok(
  $$ select public.retirer_cle_fournisseur('openai') $$,
  'IN001',
  null,
  'Retirer une clé absente est signalé, pas silencieux'
);

select lives_ok(
  $$ select public.retirer_cle_fournisseur('anthropic') $$,
  'Un administrateur retire la clé'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.ai_provider_keys)
    || ' / ' || (select count(*)::int from vault.secrets where name = 'ia_anthropic'),
  '0 / 0',
  'Le retrait emporte l''état et le secret'
);

-- ---------------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------------

-- Filtré sur l'auteur du test : les suites d'API laissent leurs propres
-- entrées dans la base locale.
select is(
  (select string_agg(details ->> 'operation', ', ' order by created_at, id)
   from public.admin_audit_log
   where action = 'cle_fournisseur' and actor_id = '00000000-0000-0000-0000-0000000c1001'),
  'ajout, remplacement, retrait',
  'Chaque changement de clé est journalisé'
);

select is(
  (select count(*)::int from public.admin_audit_log
   where action = 'cle_fournisseur'
     and actor_id = '00000000-0000-0000-0000-0000000c1001'
     and details ->> 'fournisseur' = 'anthropic'),
  3,
  'Le journal nomme l''auteur et le fournisseur'
);

select is(
  (select count(*)::int from public.admin_audit_log
   where action = 'cle_fournisseur'
     and actor_id = '00000000-0000-0000-0000-0000000c1001'
     and details::text like '%factice%'),
  0,
  'Le journal ne reprend jamais la valeur de la clé'
);

-- ---------------------------------------------------------------------------
-- Écriture directe
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.en_admin();

select throws_ok(
  $$ insert into public.ai_provider_keys (provider, secret_id) values ('openai', gen_random_uuid()) $$,
  '42501',
  null,
  'Même un administrateur n''écrit pas l''état à la main : le coffre et la table resteraient désaccordés'
);

reset role;

select * from finish();

rollback;
