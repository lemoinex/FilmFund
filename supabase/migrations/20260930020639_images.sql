-- Images de projet : couverture et images des planches du storyboard.
--
-- Stockage privé : aucun fichier n'est public. L'application délivre des
-- liens signés, de durée limitée, et seulement à qui peut lire le projet —
-- les politiques ci-dessous le vérifient à chaque demande.
--
-- Organisation des fichiers dans le compartiment :
--   <projet>/couverture/<fichier>
--   <projet>/scenes/<fichier>
-- Le premier dossier est l'identifiant du projet : c'est lui que les
-- politiques lisent pour décider de l'accès.

-- ---------------------------------------------------------------------------
-- Compartiment
-- ---------------------------------------------------------------------------

-- Limites imposées par Supabase lui-même, et non par l'interface seule :
-- un envoi direct à l'API qui les dépasse est refusé.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Projet d'un fichier
-- ---------------------------------------------------------------------------

-- Lit l'identifiant de projet en tête du chemin. Renvoie null plutôt que de
-- lever une erreur sur un chemin mal formé : une politique qui échoue sur
-- une conversion bloquerait toute la requête, fichiers valides compris.
create or replace function public.projet_du_chemin(p_chemin text)
returns uuid
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when split_part(p_chemin, '/', 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_chemin, '/', 1)::uuid
  end;
$$;

revoke all on function public.projet_du_chemin(text) from public, anon;
grant execute on function public.projet_du_chemin(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Politiques de stockage
-- ---------------------------------------------------------------------------

-- Lecture : toute l'équipe du projet et les administrateurs, comme le
-- storyboard. C'est cette lecture qui autorise la création d'un lien signé.
create policy "Images : lecture par l'équipe"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-images'
    and (
      public.acces_au_projet(public.projet_du_chemin(name)) is not null
      or (select public.is_admin())
    )
  );

-- Écriture : porteur, éditeurs, administrateurs, et seulement dans l'un des
-- deux dossiers prévus. Un chemin arbitraire est refusé.
create policy "Images : envoi"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-images'
    and public.peut_editer_contenu(public.projet_du_chemin(name))
    and split_part(name, '/', 2) in ('couverture', 'scenes')
    and split_part(name, '/', 3) <> ''
    and split_part(name, '/', 4) = ''
  );

create policy "Images : remplacement"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-images'
    and public.peut_editer_contenu(public.projet_du_chemin(name))
  )
  with check (
    bucket_id = 'project-images'
    and public.peut_editer_contenu(public.projet_du_chemin(name))
  );

create policy "Images : suppression"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-images'
    and public.peut_editer_contenu(public.projet_du_chemin(name))
  );

-- Mode privé : même verrou que sur les tables, limité à ce compartiment
-- pour ne rien présumer des usages futurs du stockage.
create policy "Mode privé : administrateurs uniquement (images)"
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (
    bucket_id <> 'project-images'
    or not (select public.mode_prive())
    or (select public.is_admin())
  )
  with check (
    bucket_id <> 'project-images'
    or not (select public.mode_prive())
    or (select public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Rattachement des images
-- ---------------------------------------------------------------------------

-- Le chemin enregistré doit désigner un fichier du bon projet et du bon
-- dossier : sans cette contrainte, un projet pourrait afficher comme
-- couverture l'image d'un autre projet, dont le lien signé serait délivré
-- à des personnes qui n'y ont pas accès.
alter table public.projects
  add column cover_path text,
  add constraint couverture_du_projet check (
    cover_path is null
    or (cover_path like id::text || '/couverture/%' and cover_path not like '%/../%')
  );

comment on column public.projects.cover_path is
  'Chemin de l''image de couverture dans le compartiment project-images, sous <projet>/couverture/.';

alter table public.storyboard_scenes
  add column image_path text,
  add constraint image_de_la_scene check (
    image_path is null
    or (image_path like project_id::text || '/scenes/%' and image_path not like '%/../%')
  );

comment on column public.storyboard_scenes.image_path is
  'Chemin de l''image de la planche dans le compartiment project-images, sous <projet>/scenes/.';

-- Les colonnes modifiables d'une scène sont listées une à une (migration
-- storyboard) : la nouvelle colonne doit y être ajoutée explicitement.
grant update (image_path) on table public.storyboard_scenes to authenticated;
