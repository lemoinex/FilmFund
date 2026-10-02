-- Photo de profil.
--
-- Même modèle que les images de projet (migration images), mais fondé sur le
-- compte et non sur le projet : compartiment privé, liens signés de durée
-- limitée, envoi direct du navigateur au stockage, rattachement par une
-- action serveur.
--
-- Organisation des fichiers dans le compartiment :
--   <compte>/<identifiant aléatoire>.<jpg|png|webp>
-- Le premier dossier est l'identifiant du compte : c'est lui que les
-- politiques lisent pour décider de l'accès.
--
-- Une photo n'est visible que de son titulaire et des administrateurs, comme
-- les autres champs du profil : les équipes ne reçoivent que le nom affiché.
--
-- Hors quota de studio : limiter_stockage_du_studio() ne compte que le
-- compartiment project-images. Une photo pèse 2 Mo au plus, et un compte
-- n'en garde qu'une ; les fichiers jamais rattachés sont supprimés par
-- l'application après une heure.
--
-- Aucune fonction nouvelle.
--
-- Retour arrière — les photos seraient perdues :
--   alter table public.profiles drop column avatar_path;
--   drop policy "Photos de profil : lecture" on storage.objects;
--   drop policy "Photos de profil : envoi" on storage.objects;
--   drop policy "Photos de profil : suppression" on storage.objects;
--   drop policy "Mode privé : administrateurs uniquement (photos de profil)" on storage.objects;
--   puis vider le compartiment par l'API de stockage et le supprimer.

-- ---------------------------------------------------------------------------
-- Compartiment
-- ---------------------------------------------------------------------------

-- Limites imposées par Supabase lui-même, et non par l'interface seule : un
-- envoi direct à l'API qui les dépasse est refusé. Le type vérifié ici est
-- celui que déclare l'envoi ; les octets réels sont contrôlés par l'action
-- de rattachement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  2 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Politiques de stockage
-- ---------------------------------------------------------------------------

-- Lecture : le titulaire et les administrateurs. C'est cette lecture qui
-- autorise la création d'un lien signé, et la suppression par l'API.
create policy "Photos de profil : lecture"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

-- Envoi : dans le dossier du compte, sous un nom de la forme que produit
-- l'application. Un chemin imbriqué ou un nom choisi (« photo.html ») est
-- refusé.
create policy "Photos de profil : envoi"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

-- Pas de politique de modification : un fichier n'est jamais réécrit, chaque
-- photo reçoit un nom neuf.
create policy "Photos de profil : suppression"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

-- Mode privé : même verrou que sur les tables et sur les images de projet.
create policy "Mode privé : administrateurs uniquement (photos de profil)"
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (
    bucket_id <> 'profile-photos'
    or not (select public.mode_prive())
    or (select public.is_admin())
  )
  with check (
    bucket_id <> 'profile-photos'
    or not (select public.mode_prive())
    or (select public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Rattachement
-- ---------------------------------------------------------------------------

-- Le chemin enregistré doit désigner un fichier du dossier du compte, sous
-- un nom de la forme que produit l'application : sans cette contrainte, un
-- profil pourrait désigner la photo d'un autre compte. Les politiques de
-- profiles s'appliquent : chacun modifie la sienne, les administrateurs
-- toutes, et le journal relève une modification faite par un tiers.
alter table public.profiles
  add column avatar_path text,
  add constraint avatar_path_forme check (
    avatar_path is null
    or avatar_path ~ (
      '^' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  );

comment on column public.profiles.avatar_path is
  'Chemin de la photo de profil dans le compartiment profile-photos, sous <compte>/.';
