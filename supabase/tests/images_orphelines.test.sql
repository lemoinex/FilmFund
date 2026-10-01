-- Images orphelines, avec des fichiers antidatés.
--
-- L'API de stockage date elle-même ses fichiers : le délai d'une heure ne
-- s'éprouve qu'ici, en insérant des lignes de `storage.objects` vieillies à
-- la main. Aucun fichier réel n'est créé, et la transaction est annulée.

begin;

select plan(7);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000d001', 'porteur-images@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d002', 'tiers-images@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d001', 'Projet illustré'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d001', 'Autre projet');

insert into public.storyboard_scenes (id, project_id, position, title)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1, 'Ouverture');

insert into storage.buckets (id, name, public) values ('autre-compartiment', 'autre-compartiment', false);

insert into storage.objects (bucket_id, name, created_at)
values
  ('project-images', '00000000-0000-0000-0000-0000000000a1/couverture/rattachee.png', now() - interval '2 hours'),
  ('project-images', '00000000-0000-0000-0000-0000000000a1/scenes/rattachee.png', now() - interval '2 hours'),
  ('project-images', '00000000-0000-0000-0000-0000000000a1/couverture/abandonnee.png', now() - interval '2 hours'),
  ('project-images', '00000000-0000-0000-0000-0000000000a1/scenes/abandonnee.png', now() - interval '2 hours'),
  ('project-images', '00000000-0000-0000-0000-0000000000a1/scenes/en-cours.png', now() - interval '10 minutes'),
  ('project-images', '00000000-0000-0000-0000-0000000000a2/couverture/abandonnee.png', now() - interval '2 hours'),
  ('autre-compartiment', '00000000-0000-0000-0000-0000000000a1/couverture/ailleurs.png', now() - interval '2 hours');

update public.projects
set cover_path = '00000000-0000-0000-0000-0000000000a1/couverture/rattachee.png'
where id = '00000000-0000-0000-0000-0000000000a1';

update public.storyboard_scenes
set image_path = '00000000-0000-0000-0000-0000000000a1/scenes/rattachee.png'
where id = '00000000-0000-0000-0000-0000000000b1';

-- Session du porteur.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d001", "role": "authenticated"}',
  true
);

select results_eq(
  $$ select * from public.images_orphelines('00000000-0000-0000-0000-0000000000a1') $$,
  $$ values
       ('00000000-0000-0000-0000-0000000000a1/couverture/abandonnee.png'::text),
       ('00000000-0000-0000-0000-0000000000a1/scenes/abandonnee.png'::text) $$,
  'Seuls les fichiers anciens que rien ne désigne sont orphelins, dans ce projet et ce compartiment'
);

select is_empty(
  $$
    select * from public.images_orphelines('00000000-0000-0000-0000-0000000000a1') as chemin
    where chemin like '%/rattachee.png'
  $$,
  'Une image rattachée, couverture ou planche, n''est jamais orpheline'
);

select is_empty(
  $$
    select * from public.images_orphelines('00000000-0000-0000-0000-0000000000a1') as chemin
    where chemin like '%/en-cours.png'
  $$,
  'Un envoi de moins d''une heure est protégé : son rattachement peut être en cours'
);

-- Session d'un compte hors équipe.
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d002", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.images_orphelines('00000000-0000-0000-0000-0000000000a1') $$,
  '42501',
  null,
  'Un compte hors équipe n''apprend rien des fichiers du projet'
);

-- Mode privé : le porteur, qui n'est pas administrateur, perd la main.
reset role;
update public.app_settings set private_admin_only = true;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d001", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.images_orphelines('00000000-0000-0000-0000-0000000000a1') $$,
  '42501',
  null,
  'En mode privé, un porteur non administrateur n''y a plus accès'
);

reset role;

select ok(
  has_function_privilege('authenticated', 'public.images_orphelines(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.images_orphelines(uuid)', 'execute'),
  'La fonction est ouverte aux comptes connectés, pas aux visiteurs'
);

select is(
  (select provolatile from pg_proc where oid = 'public.images_orphelines(uuid)'::regprocedure),
  's',
  'La fonction ne fait que lire : la suppression passe par l''API de stockage'
);

select * from finish();

rollback;
