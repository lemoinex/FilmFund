-- Les administrateurs lisent les équipes (lot Z4) : la règle de lecture
-- ajoutée, ce qu'elle ouvre et ce qu'elle laisse fermé, et — pour chaque
-- table que lisent les statistiques d'usage — l'égalité entre ce qui existe
-- et ce qu'un administrateur lit. C'est ce dernier contrôle qui aurait
-- attrapé le défaut : sous les droits de l'appelant, une table qu'un
-- administrateur ne lit pas en entier fausse son comptage sans rien signaler.
--
-- Les lectures sous RLS sont relevées dans un réglage de session, puis
-- vérifiées une fois le rôle rendu.

begin;

select plan(12);

select is(
  (
    select array[cmd::text, permissive::text, roles::text, qual]
    from pg_policies
    where schemaname = 'public' and tablename = 'project_members'
      and policyname = 'Un administrateur lit toutes les équipes'
  ),
  array['SELECT', 'PERMISSIVE', '{authenticated}', '( SELECT is_admin() AS is_admin)'],
  'Une règle de lecture, pour les comptes, tenue par is_admin()'
);

select is(
  (select array_agg(policyname::text || ' [' || cmd || ']' order by policyname) from pg_policies
   where schemaname = 'public' and tablename = 'project_members'),
  array[
    'Le porteur modifie les membres de son projet [UPDATE]',
    'Le porteur retire un membre, un membre se retire [DELETE]',
    'Mode privé : administrateurs uniquement [ALL]',
    'Un administrateur lit toutes les équipes [SELECT]',
    'Un membre voit l''équipe de ses projets [SELECT]'
  ],
  'Rien d''autre ne change : ni l''écriture, ni la règle des membres, ni le mode privé'
);

select ok(
  not has_table_privilege('anon', 'public.project_members', 'select')
    and not has_table_privilege('filmfund_worker', 'public.project_members', 'select'),
  'Ni visiteur ni worker ne lisent les équipes'
);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000a4c01', 'equipes-admin@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a4c02', 'equipes-porteuse@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a4c03', 'equipes-membre@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a4c04', 'equipes-etranger@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000a4c01';

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-0000000a4a01', '00000000-0000-0000-0000-0000000a4c02', 'Projet à équipe'),
  ('00000000-0000-0000-0000-0000000a4a02', '00000000-0000-0000-0000-0000000a4c04', 'Projet d''ailleurs');

-- Deux adhésions, dans deux projets : l'administratrice n'est membre d'aucun.
insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000a4a01', '00000000-0000-0000-0000-0000000a4c03', 'viewer'),
  ('00000000-0000-0000-0000-0000000a4a02', '00000000-0000-0000-0000-0000000a4c03', 'editor');

-- De quoi peupler d'autres tables que lisent les statistiques.
insert into public.project_characters (project_id, position, name, role)
values ('00000000-0000-0000-0000-0000000a4a01', 1, 'Awa', 'principal');
insert into public.storyboard_scenes (project_id, position, title, setting, time_of_day)
values ('00000000-0000-0000-0000-0000000a4a02', 1, 'Une scène', 'ext', 'aube');

create function pg_temp.session(p_compte text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
$$;

-- Les quinze tables que lit `statistiques_usage()`, comptées telles quelles.
create function pg_temp.comptages() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'profiles', (select count(*) from public.profiles),
    'account_suspensions', (select count(*) from public.account_suspensions),
    'studio_subscriptions', (select count(*) from public.studio_subscriptions),
    'projects', (select count(*) from public.projects),
    'project_documents', (select count(*) from public.project_documents),
    'project_characters', (select count(*) from public.project_characters),
    'storyboard_scenes', (select count(*) from public.storyboard_scenes),
    'scene_shots', (select count(*) from public.scene_shots),
    'project_gear', (select count(*) from public.project_gear),
    'project_fundings', (select count(*) from public.project_fundings),
    'project_members', (select count(*) from public.project_members),
    'jobs', (select count(*) from public.jobs),
    'ai_suggestions', (select count(*) from public.ai_suggestions),
    'project_exports', (select count(*) from public.project_exports),
    'funding_opportunities', (select count(*) from public.funding_opportunities)
  );
$$;

-- La liste de ce test est bien celle de la fonction : une table qu'elle lirait
-- en plus ferait tomber ce contrôle, jusqu'à ce qu'on l'inscrive ici.
select is(
  (
    select array_agg(distinct m[1] order by m[1])
    from regexp_matches(
      (select prosrc from pg_proc where oid = 'public.statistiques_usage()'::regprocedure),
      'from public\.(\w+)', 'g'
    ) as m
  ),
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.comptages()) k),
  'Ce test compte les mêmes tables que les statistiques d''usage'
);

select set_config('test.reel', pg_temp.comptages()::text, true);

-- Sous la session de l'administratrice, membre d'aucun projet.
select pg_temp.session('00000000-0000-0000-0000-0000000a4c01');
set local role authenticated;
select set_config('test.admin', pg_temp.comptages()::text, true);
select set_config(
  'test.admin_membres',
  (
    select string_agg(m.project_id::text || ':' || m.role, ',' order by m.project_id)
    from public.project_members m
    -- Les seuls projets de ce test : la base peut en porter d'autres.
    where m.project_id in ('00000000-0000-0000-0000-0000000a4a01', '00000000-0000-0000-0000-0000000a4a02')
  ),
  true
);
select set_config(
  'test.admin_statistique',
  (select s.nombre::text from public.statistiques_usage() s where s.domaine = 'contenus' and s.cle = 'membres_equipe'),
  true
);
reset role;

select is(
  current_setting('test.admin')::jsonb,
  current_setting('test.reel')::jsonb,
  'Un administrateur lit en entier chacune des tables que comptent les statistiques'
);

select cmp_ok(
  (current_setting('test.reel')::jsonb ->> 'project_members')::integer,
  '>=',
  2,
  'Les adhésions du test existent bien : l''égalité ne porte pas sur du vide'
);

select is(
  current_setting('test.admin_membres'),
  '00000000-0000-0000-0000-0000000a4a01:viewer,00000000-0000-0000-0000-0000000a4a02:editor',
  'Une administratrice hors de toute équipe lit les adhésions de tous les projets'
);

select is(
  current_setting('test.admin_statistique'),
  current_setting('test.reel')::jsonb ->> 'project_members',
  'Le comptage « membres d''équipe » est celui de la plateforme, pas celui des équipes de qui le lit'
);

-- Un membre, une porteuse, un étranger : rien ne s'ouvre pour eux.
select pg_temp.session('00000000-0000-0000-0000-0000000a4c03');
set local role authenticated;
select set_config('test.membre', (select count(*)::text from public.project_members), true);
reset role;

select pg_temp.session('00000000-0000-0000-0000-0000000a4c02');
set local role authenticated;
select set_config('test.porteuse', (select count(*)::text from public.project_members), true);
reset role;

select pg_temp.session('00000000-0000-0000-0000-0000000a4c04');
set local role authenticated;
select set_config(
  'test.etranger',
  (select count(*)::text from public.project_members m where m.project_id = '00000000-0000-0000-0000-0000000a4a01'),
  true
);
reset role;

select is(
  array[current_setting('test.membre'), current_setting('test.porteuse'), current_setting('test.etranger')],
  array['2', '1', '0'],
  'Un membre lit les équipes de ses projets, une porteuse la sienne, un étranger aucune autre'
);

-- En mode privé, la règle restrictive garde le dernier mot pour les comptes ordinaires.
update public.app_settings set private_admin_only = true where id;

select pg_temp.session('00000000-0000-0000-0000-0000000a4c03');
set local role authenticated;
select set_config('test.membre_prive', (select count(*)::text from public.project_members), true);
reset role;

select pg_temp.session('00000000-0000-0000-0000-0000000a4c01');
set local role authenticated;
select set_config('test.admin_prive', (select count(*)::text from public.project_members), true);
reset role;

select is(
  array[current_setting('test.membre_prive'), current_setting('test.admin_prive')],
  array['0', current_setting('test.reel')::jsonb ->> 'project_members'],
  'En mode privé, un membre ne lit plus rien ; l''administratrice lit toujours tout'
);

-- Lire n'est pas écrire : la règle ajoutée ne porte que sur la lecture.
select pg_temp.session('00000000-0000-0000-0000-0000000a4c01');
set local role authenticated;

select is_empty(
  $$ update public.project_members set role = 'editor'
     where project_id = '00000000-0000-0000-0000-0000000a4a01'
     returning 1 $$,
  'Une administratrice hors équipe ne change pas un rôle par cette table'
);

select is_empty(
  $$ delete from public.project_members
     where project_id = '00000000-0000-0000-0000-0000000a4a01'
     returning 1 $$,
  'Elle ne retire pas un membre par cette table'
);

reset role;

select * from finish();

rollback;
