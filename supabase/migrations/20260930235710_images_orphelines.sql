-- Images orphelines.
--
-- Un fichier d'image peut rester dans le stockage sans que rien ne le
-- désigne : envoi interrompu entre le dépôt du fichier et son rattachement,
-- suppression de l'image remplacée qui échoue, deux remplacements
-- simultanés dont chacun efface l'ancienne image mais pas celle de l'autre.
-- Rien ne l'effaçait jamais.
--
-- Plutôt qu'un registre des envois, qu'il faudrait tenir synchronisé avec
-- le stockage, les orphelines se lisent à la source : les fichiers d'un
-- projet que ni sa couverture ni aucune de ses scènes ne désignent. Un délai
-- d'une heure protège l'envoi en cours, que rien ne désigne encore entre le
-- dépôt du fichier et son rattachement.
--
-- La suppression passe par l'API de stockage — la base refuse qu'on efface
-- ses fichiers en SQL —, avec la session de l'utilisateur : l'application
-- nettoie le projet à chaque action sur ses images. Le worker prévu au lot H
-- pourra balayer tous les projets avec la même fonction.
--
-- Retour arrière : la fonction peut être retirée sans perte.

-- Security definer : les références sont cherchées dans toutes les lignes,
-- et non dans celles que la RLS de l'appelant laisse voir. Une politique
-- future qui masquerait une scène ne doit pas faire passer son image pour
-- orpheline — elle serait supprimée.
--
-- En contrepartie, l'accès est vérifié ici, nommément : seul qui peut
-- supprimer ces fichiers, selon les politiques du stockage, apprend
-- lesquels sont orphelins.
create or replace function public.images_orphelines(p_project_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not coalesce(public.peut_editer_contenu(p_project_id), false)
     or (coalesce(public.mode_prive(), false) and not coalesce(public.is_admin(), false)) then
    raise exception 'Vous n''avez pas le droit de modifier les images de ce projet.'
      using errcode = '42501';
  end if;

  return query
    select o.name
    from storage.objects o
    where o.bucket_id = 'project-images'
      and public.projet_du_chemin(o.name) = p_project_id
      and o.created_at < now() - interval '1 hour'
      and not exists (select 1 from public.projects p where p.cover_path = o.name)
      and not exists (select 1 from public.storyboard_scenes s where s.image_path = o.name)
    order by o.name;
end;
$$;

comment on function public.images_orphelines(uuid) is
  'Fichiers du compartiment project-images d''un projet, déposés depuis plus d''une heure, que ni la couverture ni aucune scène ne désignent. Réservée à qui peut modifier les images du projet.';

revoke all on function public.images_orphelines(uuid) from public, anon, authenticated;
grant execute on function public.images_orphelines(uuid) to authenticated;
