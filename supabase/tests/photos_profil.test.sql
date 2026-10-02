-- Photo de profil (lot Q2) : compartiment, politiques et chemin enregistré.
--
-- Le parcours réel des fichiers — envoi, lecture, suppression entre comptes
-- — passe par l'API de stockage : tests/photos-profil.test.mjs. Ici, ce qui
-- se lit dans le catalogue, et la contrainte du chemin.

begin;

select plan(14);

-- ---------------------------------------------------------------------------
-- Compartiment
-- ---------------------------------------------------------------------------

select is(
  (
    select row(public, file_size_limit, allowed_mime_types)::text
    from storage.buckets where id = 'profile-photos'
  ),
  row(false, 2097152::bigint, array['image/jpeg', 'image/png', 'image/webp']::text[])::text,
  'Le compartiment des photos est privé, borné à 2 Mo et à trois formats'
);

-- ---------------------------------------------------------------------------
-- Politiques de stockage
-- ---------------------------------------------------------------------------

select is(
  (
    select array_agg(cmd::text order by cmd)
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and permissive = 'PERMISSIVE'
      and qual || coalesce(with_check, '') like '%profile-photos%'
  ),
  array['DELETE', 'SELECT'],
  'Lecture et suppression : une politique chacune, et pas de modification'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and permissive = 'PERMISSIVE' and cmd = 'INSERT'
      and with_check like '%profile-photos%'
  ),
  1,
  'Envoi : une seule politique'
);

select ok(
  (
    select bool_and(coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%'
                and coalesce(qual, '') || coalesce(with_check, '') like '%is_admin()%')
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and permissive = 'PERMISSIVE'
      and coalesce(qual, '') || coalesce(with_check, '') like '%profile-photos%'
  ),
  'Chaque politique des photos s''en tient au titulaire et aux administrateurs'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Mode privé : administrateurs uniquement (photos de profil)'
      and permissive = 'RESTRICTIVE' and cmd = 'ALL'
  ),
  1,
  'Les photos portent la politique restrictive du mode privé'
);

-- ---------------------------------------------------------------------------
-- Chemin enregistré dans le profil
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000a0e1', 'photo-titulaire@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b0e1', 'photo-autre@exemple.test', 'authenticated', 'authenticated');

select is(
  (select avatar_path from public.profiles where id = '00000000-0000-0000-0000-00000000a0e1'),
  null,
  'Un compte naît sans photo'
);

select lives_ok(
  $$ update public.profiles
     set avatar_path = '00000000-0000-0000-0000-00000000a0e1/4f1c2b3a-9d8e-4f7a-8b6c-5d4e3f2a1b0c.png'
     where id = '00000000-0000-0000-0000-00000000a0e1' $$,
  'Une photo du dossier du compte est admise'
);

select lives_ok(
  $$ update public.profiles set avatar_path = null
     where id = '00000000-0000-0000-0000-00000000a0e1' $$,
  'La photo peut être retirée'
);

select throws_ok(
  $$ update public.profiles
     set avatar_path = '00000000-0000-0000-0000-00000000b0e1/4f1c2b3a-9d8e-4f7a-8b6c-5d4e3f2a1b0c.png'
     where id = '00000000-0000-0000-0000-00000000a0e1' $$,
  '23514', null, 'La photo d''un autre compte est refusée'
);

select throws_ok(
  $$ update public.profiles
     set avatar_path = '00000000-0000-0000-0000-00000000a0e1/scenes/4f1c2b3a-9d8e-4f7a-8b6c-5d4e3f2a1b0c.png'
     where id = '00000000-0000-0000-0000-00000000a0e1' $$,
  '23514', null, 'Un sous-dossier est refusé'
);

select throws_ok(
  $$ update public.profiles
     set avatar_path = '00000000-0000-0000-0000-00000000a0e1/photo.png'
     where id = '00000000-0000-0000-0000-00000000a0e1' $$,
  '23514', null, 'Un nom choisi est refusé'
);

select throws_ok(
  $$ update public.profiles
     set avatar_path = '00000000-0000-0000-0000-00000000a0e1/4f1c2b3a-9d8e-4f7a-8b6c-5d4e3f2a1b0c.html'
     where id = '00000000-0000-0000-0000-00000000a0e1' $$,
  '23514', null, 'Une extension hors liste est refusée'
);

select throws_ok(
  $$ update public.profiles
     set avatar_path = '00000000-0000-0000-0000-00000000a0e1/../00000000-0000-0000-0000-00000000b0e1/4f1c2b3a-9d8e-4f7a-8b6c-5d4e3f2a1b0c.png'
     where id = '00000000-0000-0000-0000-00000000a0e1' $$,
  '23514', null, 'Une remontée de dossier est refusée'
);

select throws_ok(
  $$ update public.profiles
     set avatar_path = 'x00000000-0000-0000-0000-00000000a0e1/4f1c2b3a-9d8e-4f7a-8b6c-5d4e3f2a1b0c.png'
     where id = '00000000-0000-0000-0000-00000000a0e1' $$,
  '23514', null, 'Un préfixe ajouté devant le dossier est refusé'
);

select * from finish();

rollback;
