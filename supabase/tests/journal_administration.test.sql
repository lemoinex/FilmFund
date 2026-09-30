-- Journal d'administration : écriture d'un administrateur dans le projet
-- d'autrui, vue depuis une session simulée au niveau SQL.
--
-- peut_editer_contenu() ouvre le planning de tout projet aux administrateurs ;
-- l'écriture passe donc la RLS, et doit laisser sa trace.

begin;

select plan(5);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000a001', 'admin-journal@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b001', 'porteur-journal@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin'
where id = '00000000-0000-0000-0000-00000000a001';

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000b001', 'Projet du porteur'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000a001', 'Projet de l''administrateur');

-- Session de l'administrateur.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}',
  true
);

insert into public.project_milestones (project_id, title)
values ('00000000-0000-0000-0000-0000000000f1', 'Étape ajoutée par l''administrateur');

insert into public.project_milestones (project_id, title)
values ('00000000-0000-0000-0000-0000000000f2', 'Étape dans son propre projet');

select is(
  (
    select count(*)::int from public.admin_audit_log
    where action = 'intervention_contenu'
      and project_id = '00000000-0000-0000-0000-0000000000f1'
      and actor_id = '00000000-0000-0000-0000-00000000a001'
      and details ->> 'table' = 'project_milestones'
      and details ->> 'operation' = 'insert'
  ),
  1,
  'L''écriture d''un administrateur dans le projet d''autrui est journalisée'
);

select is(
  (
    select count(*)::int from public.admin_audit_log
    where project_id = '00000000-0000-0000-0000-0000000000f2'
  ),
  0,
  'Un administrateur dans son propre projet n''est pas journalisé'
);

select is(
  (
    select count(*)::int from public.admin_audit_log
    where action = 'intervention_contenu'
      and details::text like '%ajoutée par%'
  ),
  0,
  'Le journal ne recopie pas le contenu écrit'
);

-- Session du porteur, dans son propre projet.
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000b001", "role": "authenticated"}',
  true
);

insert into public.project_milestones (project_id, title)
values ('00000000-0000-0000-0000-0000000000f1', 'Étape du porteur');

reset role;

select is(
  (
    select count(*)::int from public.admin_audit_log
    where actor_id = '00000000-0000-0000-0000-00000000b001'
  ),
  0,
  'Le porteur qui travaille dans son projet n''est pas journalisé'
);

set local role authenticated;

select throws_ok(
  $$ select public.journaliser('mode_prive', null, '{}') $$,
  '42501',
  null,
  'Le rôle authenticated ne peut pas écrire dans le journal'
);

reset role;

select * from finish();

rollback;
