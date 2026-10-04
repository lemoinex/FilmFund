-- Mode privé : l'équipe d'un projet, les invitations reçues et les décisions
-- qu'on prend sur elles suivent le verrou, vu depuis des sessions simulées au
-- niveau SQL.
--
-- `equipe_du_projet()` et `mes_invitations()` contournent la RLS : sans leur
-- propre contrôle, elles livreraient ce que les tables refusent. Chaque
-- lecture est d'abord faite verrou levé, pour établir qu'elle rend bien
-- quelque chose.
--
-- Les lectures sont relevées dans un réglage de session, puis vérifiées une
-- fois le rôle rendu.

begin;

select plan(13);

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

-- ---------------------------------------------------------------------------
-- Agir sur une invitation suit le même verrou que la lire
-- ---------------------------------------------------------------------------

-- Deux projets de plus, deux invitations de plus pour la même invitée : une
-- pour éprouver le refus, une pour éprouver l'acceptation, et celle du haut
-- de ce fichier reste pour le mode privé.
-- Deux invitées de plus sur le même projet : le plan d'essai ne permet
-- qu'un projet par studio.
insert into auth.users (id, email, aud, role, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000d0e1', 'refusante-equipe@exemple.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000e0e1', 'entrante-equipe@exemple.test', 'authenticated', 'authenticated', now());

insert into public.project_invitations (id, project_id, email, role, invited_by)
values
  ('00000000-0000-0000-0000-00000000f0e2', '00000000-0000-0000-0000-0000000000e1',
   'refusante-equipe@exemple.test', 'viewer', '00000000-0000-0000-0000-00000000b0e1'),
  ('00000000-0000-0000-0000-00000000f0e3', '00000000-0000-0000-0000-0000000000e1',
   'entrante-equipe@exemple.test', 'editor', '00000000-0000-0000-0000-00000000b0e1');

update public.app_settings set private_admin_only = false where id;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d0e1", "role": "authenticated"}',
  true
);

select lives_ok(
  $$ select public.refuser_invitation('00000000-0000-0000-0000-00000000f0e2') $$,
  'Verrou levé, une invitée refuse son invitation'
);

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000e0e1", "role": "authenticated"}',
  true
);

select is(
  (select public.accepter_invitation('00000000-0000-0000-0000-00000000f0e3')),
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  'Verrou levé, une autre accepte et rejoint le projet'
);

reset role;

select is(
  (
    select m.role::text from public.project_members m
    where m.project_id = '00000000-0000-0000-0000-0000000000e1'
      and m.user_id = '00000000-0000-0000-0000-00000000e0e1'
  ),
  'editor',
  'Elle y entre avec le rôle de son invitation'
);

-- ---------------------------------------------------------------------------
-- Mode privé : la liste était cachée, l'action l'est aussi
-- ---------------------------------------------------------------------------

update public.app_settings set private_admin_only = true where id;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000c0e1", "role": "authenticated"}',
  true
);

-- Un compte ordinaire ne voit toujours rien de ses invitations : c'est ce
-- que `mes_invitations()` garantit, et l'action refuse de la même façon.
select is(
  (select count(*)::int from public.mes_invitations()),
  0,
  'En mode privé, un compte ordinaire ne voit aucune invitation à accepter'
);

reset role;

-- Le refus n'a rien écrit : l'invitation du haut de ce fichier est intacte,
-- et personne n'a rejoint le projet.
select is(
  (
    select count(*)::int from public.project_invitations i
    where i.project_id = '00000000-0000-0000-0000-0000000000e1'
  ),
  1,
  'L''invitation refusée par le verrou est toujours là : rien n''a été écrit'
);

-- ---------------------------------------------------------------------------
-- Écarter une proposition suit le verrou, comme l'appliquer
-- ---------------------------------------------------------------------------

-- Contrôle de structure, et non de comportement : fabriquer une proposition
-- demande un devis, une réservation, une tâche et un coût provisionné, que la
-- suite de la passerelle éprouve déjà. Ce qui manquait ici, c'est que les
-- deux décisions — appliquer et écarter — consultent le même verrou. Retirer
-- la condition de l'une ou de l'autre fait tomber ce test.
select is(
  (
    select string_agg(p.proname, ', ' order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'accepter_invitation', 'refuser_invitation',
        'accepter_proposition', 'ecarter_proposition',
        'equipe_du_projet', 'mes_invitations'
      )
      and pg_get_functiondef(p.oid) like '%mode_prive()%'
  ),
  'accepter_invitation, accepter_proposition, ecarter_proposition, equipe_du_projet, '
    || 'mes_invitations, refuser_invitation',
  'Les six fonctions qui touchent à l''équipe et aux propositions consultent le verrou'
);

select * from finish();

rollback;
