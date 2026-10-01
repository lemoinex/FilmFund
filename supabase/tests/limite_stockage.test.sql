-- Limite de stockage, sur des tailles inscrites à la main.
--
-- L'API de stockage inscrit chaque fichier avec sa taille réelle ; ce test
-- inscrit directement des lignes de `storage.objects`, sans fichier, sous un
-- plan d'essai limité à 1 Mo. Rien n'est envoyé, et la transaction est
-- annulée.

begin;

select plan(11);

insert into public.plans (code, name, position) values ('essai_stockage', 'Essai stockage', 201);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_stockage', 5, 1, 1, 0, 0, 0, 0, now() - interval '10 days');

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-00000000b201', 'stockage@exemple.test', 'authenticated', 'authenticated');

update public.studio_subscriptions
set plan_code = 'essai_stockage', period_anchor = now() - interval '1 day'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000b201');

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000b201', 'Projet illustré');

insert into storage.buckets (id, name, public) values ('autre-stockage', 'autre-stockage', false);

-- 1 Mo = 1 048 576 octets.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, metadata)
     values ('project-images', '00000000-0000-0000-0000-0000000000c9/scenes/a.png', '{"size": 600000}') $$,
  'Un fichier qui tient dans la limite est accepté'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, metadata)
     values ('project-images', '00000000-0000-0000-0000-0000000000c9/scenes/b.png', '{"size": 600000}') $$,
  '53400',
  null,
  'Un fichier qui ferait dépasser la limite est refusé'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('project-images', '00000000-0000-0000-0000-0000000000c9/scenes/essai.png') $$,
  'L''inscription d''essai, encore sans taille, passe'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, metadata)
     values ('autre-stockage', '00000000-0000-0000-0000-0000000000c9/scenes/c.png', '{"size": 5000000}') $$,
  'Un autre compartiment n''est pas concerné'
);

select throws_ok(
  $$ update storage.objects set metadata = '{"size": 1200000}'
     where name = '00000000-0000-0000-0000-0000000000c9/scenes/a.png' $$,
  '53400',
  null,
  'Un fichier remplacé par un plus gros, au-delà de la limite, est refusé'
);

select lives_ok(
  $$ update storage.objects set metadata = '{"size": 100000}'
     where name = '00000000-0000-0000-0000-0000000000c9/scenes/a.png' $$,
  'Réduire un fichier n''est jamais bloqué'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, metadata)
     values ('project-images', '00000000-0000-0000-0000-0000000000c9/scenes/b.png', '{"size": 600000}') $$,
  'La place libérée sert de nouveau'
);

-- Studio ramené à un plan sans stockage : il est au-delà de sa limite.
insert into public.plans (code, name, position) values ('essai_sans_stockage', 'Essai sans stockage', 202);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_sans_stockage', 5, 1, 0, 0, 0, 0, 0, now() - interval '10 days');
update public.studio_subscriptions
set plan_code = 'essai_sans_stockage'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000b201');

select lives_ok(
  $$ update storage.objects set metadata = '{"size": 500000}'
     where name = '00000000-0000-0000-0000-0000000000c9/scenes/b.png' $$,
  'Au-delà de la limite, réduire un fichier reste possible'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, metadata)
     values ('project-images', '00000000-0000-0000-0000-0000000000c9/scenes/d.png', '{"size": 10}') $$,
  '53400',
  null,
  'Au-delà de la limite, aucun octet ne s''ajoute'
);

select is(
  public.octets_du_studio(
    (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000b201')
  ),
  600000::bigint,
  'Seules les images des projets du studio sont comptées'
);

select ok(
  not has_function_privilege('authenticated', 'public.octets_du_studio(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.octets_du_studio(uuid)', 'execute'),
  'octets_du_studio() n''est pas appelable depuis l''application'
);

select * from finish();

rollback;
