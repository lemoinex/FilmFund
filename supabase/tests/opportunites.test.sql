-- Catalogue des opportunités (lot L4) : droits lus au catalogue et bornes de
-- la table. Ce que lisent et écrivent réellement un administrateur, un compte
-- et un visiteur est éprouvé par tests/opportunites.test.mjs.

begin;

select plan(22);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.funding_opportunities'::regclass),
  'La RLS est active sur le catalogue'
);

select ok(
  not has_table_privilege('anon', 'public.funding_opportunities', 'select')
    and has_table_privilege('authenticated', 'public.funding_opportunities', 'select')
    and has_table_privilege('authenticated', 'public.funding_opportunities', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.funding_opportunities', 'select'),
  'Un visiteur ne lit pas le catalogue ; le worker non plus'
);

-- Ni l'auteur, ni les dates d'écriture, ni l'identifiant ne se fournissent.
select ok(
  has_column_privilege('authenticated', 'public.funding_opportunities', 'status', 'insert')
    and has_column_privilege('authenticated', 'public.funding_opportunities', 'status', 'update')
    and not has_column_privilege('authenticated', 'public.funding_opportunities', 'created_by', 'insert')
    and not has_column_privilege('authenticated', 'public.funding_opportunities', 'created_by', 'update')
    and not has_column_privilege('authenticated', 'public.funding_opportunities', 'updated_by', 'update')
    and not has_column_privilege('authenticated', 'public.funding_opportunities', 'created_at', 'insert')
    and not has_column_privilege('authenticated', 'public.funding_opportunities', 'updated_at', 'update')
    and not has_column_privilege('authenticated', 'public.funding_opportunities', 'id', 'update'),
  'Auteur, dates et identifiant sont fixés par la base'
);

select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
   where schemaname = 'public' and tablename = 'funding_opportunities'),
  array[
    'Les administrateurs ajoutent des opportunités',
    'Les administrateurs modifient les opportunités',
    'Les administrateurs retirent des opportunités',
    'Les comptes lisent les opportunités vérifiées ou expirées',
    'Mode privé : administrateurs uniquement'
  ],
  'Cinq politiques, dont celle du mode privé'
);

-- La lecture d'un compte : vérifiée ou expirée, rien d'autre. Écrire : l'administration.
select ok(
  (select qual like '%verifie%' and qual like '%expire%' and qual like '%is_admin()%'
          and qual not like '%demo%' and qual not like '%non_verifie%'
   from pg_policies
   where tablename = 'funding_opportunities'
     and policyname = 'Les comptes lisent les opportunités vérifiées ou expirées')
  and (select bool_and(coalesce(qual, with_check) like '%is_admin()%')
       from pg_policies
       where tablename = 'funding_opportunities' and cmd in ('INSERT', 'UPDATE', 'DELETE')),
  'Un compte ne lit que le vérifié et l''expiré ; seule l''administration écrit'
);

select ok(
  not has_function_privilege('authenticated', 'public.marquer_opportunite()', 'execute')
    and not has_function_privilege('authenticated', 'public.journaliser_opportunite()', 'execute')
    and not has_function_privilege('anon', 'public.journaliser_opportunite()', 'execute'),
  'Les fonctions de déclencheur ne s''appellent pas directement'
);

-- Les bornes, éprouvées en SQL direct : la base les tient quel que soit le chemin.
-- Le nom suit la catégorie : deux opportunités du même nom chez le même
-- organisme n'entrent pas au catalogue.
prepare ajouter(text, text, date, text, numeric, text, date, date, text, text[], text[], text) as
  insert into public.funding_opportunities
    (name, organization, category, status, source_url, collected_on, source_excerpt,
     budget_min, currency, opens_on, deadline, website, countries, genres)
  values (initcap($12) || ' d''essai', 'Organisme', $12, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);

select lives_ok(
  $$ execute ajouter('verifie', 'https://exemple.org/appel', '2026-10-01', 'Extrait.',
       5000000, 'XAF', '2026-09-01', '2026-12-31', 'https://exemple.org/', '{CM,GA}', '{drame}', 'fonds') $$,
  'Une opportunité vérifiée, complète et sourcée, entre au catalogue'
);

select throws_ok(
  $$ execute ajouter('verifie', null, '2026-10-01', 'Extrait.', null, null, null, null, null, '{}', '{}', 'fonds') $$,
  '23514', null, 'Vérifiée sans adresse de source : refusée'
);

select throws_ok(
  $$ execute ajouter('verifie', 'https://exemple.org/appel', null, 'Extrait.', null, null, null, null, null, '{}', '{}', 'fonds') $$,
  '23514', null, 'Vérifiée sans date de collecte : refusée'
);

select throws_ok(
  $$ execute ajouter('verifie', 'https://exemple.org/appel', '2026-10-01', '   ', null, null, null, null, null, '{}', '{}', 'fonds') $$,
  '23514', null, 'Vérifiée sans extrait : refusée'
);

select lives_ok(
  $$ execute ajouter('non_verifie', null, null, '', null, null, null, null, null, '{}', '{}', 'residence') $$,
  'Non vérifiée, une opportunité se saisit sans source'
);

select throws_ok(
  $$ execute ajouter('non_verifie', null, null, '', 5000000, null, null, null, null, '{}', '{}', 'fonds') $$,
  '23514', null, 'Un montant sans devise est refusé'
);

select throws_ok(
  $$ execute ajouter('non_verifie', null, null, '', null, null, '2026-12-31', '2026-09-01', null, '{}', '{}', 'fonds') $$,
  '23514', null, 'Une ouverture après la date limite est refusée'
);

select throws_ok(
  $$ execute ajouter('non_verifie', 'http://exemple.org/appel', null, '', null, null, null, null, null, '{}', '{}', 'fonds') $$,
  '23514', null, 'Une source en clair, sans https, est refusée'
);

select throws_ok(
  $$ execute ajouter('certifie', null, null, '', null, null, null, null, null, '{}', '{}', 'fonds') $$,
  '23514', null, 'Un statut hors des cinq du dépôt est refusé'
);

select throws_ok(
  $$ execute ajouter('non_verifie', null, null, '', null, null, null, null, null, '{Cameroun}', '{}', 'fonds') $$,
  '23514', null, 'Un pays qui n''est pas un code à deux lettres est refusé'
);

select throws_ok(
  $$ execute ajouter('non_verifie', null, null, '', null, null, null, null, null, '{}', '{western}', 'fonds') $$,
  '23514', null, 'Un genre inconnu des projets est refusé'
);

select throws_ok(
  $$ execute ajouter('non_verifie', null, null, '', null, null, null, null, null, '{}', '{}', 'loterie') $$,
  '23514', null, 'Une catégorie inconnue est refusée'
);

select throws_ok(
  $$ insert into public.funding_opportunities (name, organization, category, source_url, collected_on)
     values ('Fonds de demain', 'Organisme', 'fonds', 'https://exemple.org/', current_date + 30) $$,
  '22023', null, 'Une collecte datée de l''avenir est refusée'
);

-- Pas deux fois la même : un nom chez un organisme, casse et espaces mis à part.
select throws_ok(
  $$ execute ajouter('non_verifie', null, null, '', null, null, null, null, null, '{}', '{}', 'fonds') $$,
  '23505', null, 'La même opportunité saisie une seconde fois est refusée'
);

select throws_ok(
  $$ insert into public.funding_opportunities (name, organization, category)
     values ('  FONDS D''ESSAI ', ' organisme', 'fonds') $$,
  '23505', null, 'Ni la casse ni les espaces autour n''en font une autre'
);

select lives_ok(
  $$ insert into public.funding_opportunities (name, organization, category)
     values ('Fonds d''essai', 'Autre organisme', 'fonds') $$,
  'Le même nom chez un autre organisme est une autre opportunité'
);

select * from finish();

rollback;
