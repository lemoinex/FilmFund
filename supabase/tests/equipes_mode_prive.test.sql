-- Mode privé : l'équipe d'un projet et les invitations reçues suivent le
-- verrou, vu depuis des sessions simulées au niveau SQL.
--
-- `equipe_du_projet()` et `mes_invitations()` contournent la RLS : sans leur
-- propre contrôle, elles livreraient ce que les tables refusent. Chaque
-- lecture est d'abord faite verrou levé, pour établir qu'elle rend bien
-- quelque chose.
--
-- Les lectures sont relevées dans un réglage de session, puis vérifiées une
-- fois le rôle rendu.

begin;

select plan(7);

insert into auth.users (id, email, aud, role, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000a0e1', 'admin-equipe@exemple.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000b0e1', 'porteuse-equipe@exemple.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000c0e1', 'invitee-equipe@exemple.test', 'authenticated', 'authenticated', now());

update public.profiles set role = 'admin'
where id = '00000000-0000-0000-0000-00000000a0e1';

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000b0e1', 'Projet à équipe');

insert into public.project_invitations (project_id, email, role, invited_by)
values (
  '00000000-0000-0000-0000-0000000000e1',
  'invitee-equipe@exemple.test',
  'viewer',
  '00000000-0000-0000-0000-00000000b0e1'
);

-- ---------------------------------------------------------------------------
-- Verrou levé : les deux fonctions rendent ce qu'elles doivent
-- ---------------------------------------------------------------------------

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000b0e1", "role": "authenticated"}',
  true
);
select set_config(
  'test.equipe_ouverte',
  (select count(*)::text from public.equipe_du_projet('00000000-0000-0000-0000-0000000000e1')),
  true
);

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000c0e1", "role": "authenticated"}',
  true
);
select set_config(
  'test.invitations_ouvertes',
  (select count(*)::text from public.mes_invitations()),
  true
);

reset role;

select is(
  current_setting('test.equipe_ouverte'),
  '1',
  'Verrou levé, la porteuse lit l''équipe de son projet'
);

select is(
  current_setting('test.invitations_ouvertes'),
  '1',
  'Verrou levé, l''invitée lit son invitation'
);

-- ---------------------------------------------------------------------------
-- Mode privé : seuls les administrateurs lisent encore
-- ---------------------------------------------------------------------------

update public.app_settings set private_admin_only = true where id;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000b0e1", "role": "authenticated"}',
  true
);
select set_config(
  'test.equipe_privee',
  (select count(*)::text from public.equipe_du_projet('00000000-0000-0000-0000-0000000000e1')),
  true
);

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000c0e1", "role": "authenticated"}',
  true
);
select set_config(
  'test.invitations_privees',
  (select count(*)::text from public.mes_invitations()),
  true
);

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000a0e1", "role": "authenticated"}',
  true
);
select set_config(
  'test.equipe_privee_admin',
  (select count(*)::text from public.equipe_du_projet('00000000-0000-0000-0000-0000000000e1')),
  true
);

reset role;

select is(
  current_setting('test.equipe_privee'),
  '0',
  'En mode privé, un compte ordinaire ne lit plus l''équipe de son projet'
);

select is(
  current_setting('test.invitations_privees'),
  '0',
  'En mode privé, un compte ordinaire ne lit plus ses invitations'
);

select is(
  current_setting('test.equipe_privee_admin'),
  '1',
  'En mode privé, un administrateur lit toujours l''équipe d''un projet'
);

-- ---------------------------------------------------------------------------
-- Les droits d'exécution n'ont pas bougé
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.equipe_du_projet(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.mes_invitations()', 'execute'),
  'Les comptes connectés appellent toujours les deux fonctions'
);

select ok(
  not has_function_privilege('anon', 'public.equipe_du_projet(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.mes_invitations()', 'execute'),
  'Les visiteurs n''appellent aucune des deux'
);

select * from finish();

rollback;
