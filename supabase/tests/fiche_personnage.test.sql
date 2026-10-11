-- Fiche détaillée d'un personnage (lot PF1) : les huit colonnes et leurs
-- bornes, les droits — inchangés, colonne par colonne —, ce qu'un agent lit
-- d'un personnage, et les quatre fonctions de contexte qui le lui remettent.
--
-- L'invariant du lot est éprouvé ici : un personnage sans fiche détaillée
-- part exactement comme avant, clé pour clé.
--
-- Les lectures et écritures sous RLS sont relevées dans un réglage de
-- session, puis vérifiées une fois le rôle rendu.

begin;

select plan(15);

select is(
  (
    select array_agg(column_name::text order by column_name)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'project_characters'
      and column_name in ('age', 'occupation', 'appearance', 'goal', 'obstacle', 'arc', 'traits', 'relations')
      and data_type = 'text' and is_nullable = 'NO' and column_default = '''''::text'
  ),
  array['age', 'appearance', 'arc', 'goal', 'obstacle', 'occupation', 'relations', 'traits'],
  'Huit colonnes de texte, jamais nulles, vides par défaut'
);

select is(
  (
    select array_agg(policyname::text order by policyname) from pg_policies
    where schemaname = 'public' and tablename = 'project_characters'
  ),
  array[
    'Création de personnages',
    'L''équipe et les administrateurs lisent les personnages',
    'Mode privé : administrateurs uniquement',
    'Modification de personnages',
    'Suppression de personnages'
  ],
  'Aucune politique nouvelle : les droits sont ceux des personnages'
);

select ok(
  (
    select bool_and(has_column_privilege('authenticated', 'public.project_characters', c, 'update'))
    from unnest(array['age', 'occupation', 'appearance', 'goal', 'obstacle', 'arc', 'traits', 'relations']) c
  )
    and not has_column_privilege('authenticated', 'public.project_characters', 'project_id', 'update')
    and not has_column_privilege('authenticated', 'public.project_characters', 'created_by', 'update')
    and not has_table_privilege('anon', 'public.project_characters', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.project_characters', 'select'),
  'Les huit colonnes se modifient ; un personnage ne change toujours ni de projet ni d''auteur ; ni visiteur ni worker ne lisent la table'
);

select ok(
  not has_function_privilege('anon', 'public.personnage_pour_agent(public.project_characters)', 'execute')
    and not has_function_privilege('authenticated', 'public.personnage_pour_agent(public.project_characters)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.personnage_pour_agent(public.project_characters)', 'execute'),
  'Personne n''appelle directement la fonction : les fonctions de contexte le font sous les droits de leur propriétaire'
);

-- Les quatre fonctions de contexte : une ligne changée, et rien de leurs droits.
select is(
  (
    select array_agg(
      p.proname::text || ':'
        || ((length(p.prosrc) - length(replace(p.prosrc, 'public.personnage_pour_agent(', '')))
            / length('public.personnage_pour_agent('))::text
        || ':' || (p.prosrc ~ '''nom'', [a-z]\.name')::text
        || ':' || p.prosecdef::text
        || ':' || has_function_privilege('filmfund_worker', p.oid, 'execute')::text
        || ':' || has_function_privilege('authenticated', p.oid, 'execute')::text
      order by p.proname
    )
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('contexte_redaction', 'contexte_dialogue', 'contexte_personnages', 'contexte_episodes')
  ),
  array[
    'contexte_dialogue:1:false:true:true:false',
    'contexte_episodes:1:false:true:true:false',
    'contexte_personnages:1:false:true:true:false',
    'contexte_redaction:1:false:true:true:false'
  ],
  'Chaque fonction de contexte appelle la fonction une fois, n''écrit plus un personnage elle-même, et garde ses droits'
);

-- Aucune autre fonction lue par un agent n'écrit un personnage à sa façon.
-- Le dossier exporté garde sa forme : il n'entre pas dans ce lot.
select is(
  (
    select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosrc ~ '''nom'', [a-z]\.name, ''role'''
  ),
  array['contenu_dossier'],
  'Seul le dossier exporté écrit encore un personnage lui-même'
);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000f1c01', 'fiche-porteuse@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1c02', 'fiche-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1c03', 'fiche-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1c04', 'fiche-etranger@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1c05', 'fiche-admin@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000f1c05';
update public.app_settings set private_admin_only = false where id;

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-0000000f1a01', '00000000-0000-0000-0000-0000000f1c01', 'Projet à fiches');

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000f1a01', '00000000-0000-0000-0000-0000000f1c02', 'editor'),
  ('00000000-0000-0000-0000-0000000f1a01', '00000000-0000-0000-0000-0000000f1c03', 'viewer');

insert into public.project_characters (id, project_id, position, name, role, description)
values
  ('00000000-0000-0000-0000-0000000f1b01', '00000000-0000-0000-0000-0000000f1a01', 1, 'Awa', 'principal', 'Pêcheuse.'),
  ('00000000-0000-0000-0000-0000000f1b02', '00000000-0000-0000-0000-0000000f1a01', 2, 'Le chef', 'secondaire', '');

-- L'invariant : sans fiche détaillée, la forme d'avant, clé pour clé.
select is(
  (
    select jsonb_agg(public.personnage_pour_agent(c) order by c.position)
    from public.project_characters c
    where c.project_id = '00000000-0000-0000-0000-0000000f1a01'
  ),
  '[{"nom": "Awa", "role": "principal", "description": "Pêcheuse."},
    {"nom": "Le chef", "role": "secondaire", "description": ""}]'::jsonb,
  'Un personnage sans fiche détaillée part exactement comme avant'
);

update public.project_characters
set age = ' la quarantaine ', goal = 'Retrouver sa fille.', traits = '   ', relations = E'Sœur du chef.\nVeuve.'
where id = '00000000-0000-0000-0000-0000000f1b01';

select is(
  (select public.personnage_pour_agent(c) from public.project_characters c
   where c.id = '00000000-0000-0000-0000-0000000f1b01'),
  jsonb_build_object(
    'nom', 'Awa', 'role', 'principal', 'description', 'Pêcheuse.',
    'age', 'la quarantaine', 'objectif', 'Retrouver sa fille.', 'liens', E'Sœur du chef.\nVeuve.'
  ),
  'Seuls les champs remplis partent, sans leurs espaces de bord ; un champ d''espaces ne part pas'
);

-- Les bornes, tenues par la base quel que soit le chemin.
select throws_ok(
  format($$ update public.project_characters set age = %L where id = '00000000-0000-0000-0000-0000000f1b01' $$, repeat('a', 61)),
  '23514', null, 'Un âge de plus de 60 caractères est refusé'
);

select throws_ok(
  $$ update public.project_characters set occupation = E'Pêcheuse\nveuve' where id = '00000000-0000-0000-0000-0000000f1b01' $$,
  '23514', null, 'Une occupation tient sur une ligne'
);

select throws_ok(
  format($$ update public.project_characters set arc = %L where id = '00000000-0000-0000-0000-0000000f1b01' $$, repeat('a', 801)),
  '23514', null, 'Un arc de plus de 800 caractères est refusé'
);

select lives_ok(
  format(
    $$ update public.project_characters
       set age = %L, occupation = %L, appearance = %L, goal = %L, obstacle = %L, arc = %L, traits = %L, relations = %L
       where id = '00000000-0000-0000-0000-0000000f1b02' $$,
    repeat('a', 60), repeat('a', 160), repeat('a', 600), repeat('a', 600), repeat('a', 600),
    repeat('a', 800), repeat('a', 600), repeat('a', 600)
  ),
  'Chaque champ rempli jusqu''à sa borne est admis'
);

-- Qui écrit la fiche détaillée : les mêmes que la description.
create function pg_temp.session(p_compte text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.ecrire(p_valeur text) returns text language sql as $$
  with ecrit as (
    update public.project_characters set obstacle = p_valeur
    where id = '00000000-0000-0000-0000-0000000f1b01'
    returning 1
  )
  select count(*)::text from ecrit;
$$;

select pg_temp.session('00000000-0000-0000-0000-0000000f1c01');
set local role authenticated;
select set_config('test.porteuse', pg_temp.ecrire('La mer.'), true);
reset role;

select pg_temp.session('00000000-0000-0000-0000-0000000f1c02');
set local role authenticated;
select set_config('test.editeur', pg_temp.ecrire('Le chef.'), true);
reset role;

select pg_temp.session('00000000-0000-0000-0000-0000000f1c03');
set local role authenticated;
select set_config('test.lecteur', pg_temp.ecrire('Rien.'), true);
select set_config(
  'test.lecteur_lit',
  (select c.goal from public.project_characters c where c.id = '00000000-0000-0000-0000-0000000f1b01'),
  true
);
reset role;

select pg_temp.session('00000000-0000-0000-0000-0000000f1c04');
set local role authenticated;
select set_config('test.etranger', pg_temp.ecrire('Rien.'), true);
select set_config(
  'test.etranger_lit',
  (select count(*)::text from public.project_characters c where c.project_id = '00000000-0000-0000-0000-0000000f1a01'),
  true
);
reset role;

select pg_temp.session('00000000-0000-0000-0000-0000000f1c05');
set local role authenticated;
select set_config('test.admin', pg_temp.ecrire('Vu par l''administration.'), true);
reset role;

select is(
  array[
    current_setting('test.porteuse'), current_setting('test.editeur'), current_setting('test.lecteur'),
    current_setting('test.etranger'), current_setting('test.admin')
  ],
  array['1', '1', '0', '0', '1'],
  'La porteuse, l''éditeur et l''administratrice écrivent la fiche ; le lecteur et l''étranger, non'
);

select is(
  array[current_setting('test.lecteur_lit'), current_setting('test.etranger_lit')],
  array['Retrouver sa fille.', '0'],
  'Le lecteur lit la fiche détaillée ; un compte étranger ne lit aucun personnage'
);

-- Un personnage ne change toujours pas de projet, même par qui écrit sa fiche.
select pg_temp.session('00000000-0000-0000-0000-0000000f1c01');
set local role authenticated;

select throws_ok(
  $$ update public.project_characters set project_id = '00000000-0000-0000-0000-0000000f1a01'
     where id = '00000000-0000-0000-0000-0000000f1b01' $$,
  '42501', null, 'La porteuse ne déplace pas un personnage : le droit reste colonne par colonne'
);

reset role;

select * from finish();

rollback;
