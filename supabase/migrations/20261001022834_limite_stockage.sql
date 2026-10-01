-- Limite de stockage des studios (lot F2).
--
-- Constats faits sur l'API de stockage avant d'écrire cette migration :
--   - le navigateur envoie le fichier directement à l'API, qui l'inscrit
--     dans `storage.objects` une fois reçu, avec sa taille réelle
--     (`metadata ->> 'size'`) ;
--   - cette inscription se fait sous le rôle de service, sans l'identité de
--     l'utilisateur : le contrôle d'accès a eu lieu juste avant, par les
--     politiques. Le lien avec le studio passe donc par le projet en tête
--     du chemin, pas par l'utilisateur ;
--   - si un déclencheur refuse l'inscription, l'envoi échoue, le navigateur
--     reçoit le code 53400, et l'API efface le fichier reçu : rien ne reste
--     sur le disque.
--
-- La limite porte sur l'ajout d'octets : un nouveau fichier, ou un fichier
-- remplacé par un plus gros. Consulter, télécharger, supprimer ou réduire
-- n'est jamais bloqué, même au-delà de la limite — après un passage à un
-- plan inférieur, par exemple.
--
-- Contrairement aux autres limites, l'exploitant n'en est pas exempté :
-- l'API inscrit les fichiers sous le rôle de service, sans identité, et
-- rien ne la distingue d'une requête SQL directe.
--
-- Retour arrière : retirer le déclencheur et les fonctions, sans perte.

-- Octets occupés par les images des projets d'un studio. Le filtre par
-- préfixe de chemin suit l'index `name_prefix_search` du stockage.
create or replace function public.octets_du_studio(p_studio_id uuid)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from public.projects p
  join storage.objects o
    on o.bucket_id = 'project-images'
   and o.name like p.id::text || '/%'
  where p.studio_id = p_studio_id;
$$;

comment on function public.octets_du_studio(uuid) is
  'Octets occupés par les images des projets d''un studio, dans le compartiment project-images.';

create or replace function public.limiter_stockage_du_studio()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ajout bigint;
  studio uuid;
  limite_mo integer;
  occupes bigint;
begin
  if new.bucket_id <> 'project-images' then
    return new;
  end if;

  -- Octets ajoutés : la taille du fichier, ou sa croissance s'il remplace
  -- un fichier existant. L'inscription d'essai qui précède l'envoi n'a pas
  -- encore de taille : elle passe.
  ajout := coalesce((new.metadata ->> 'size')::bigint, 0);
  if tg_op = 'UPDATE' then
    ajout := ajout - coalesce((old.metadata ->> 'size')::bigint, 0);
  end if;
  if ajout <= 0 then
    return new;
  end if;

  select p.studio_id into studio
  from public.projects p
  where p.id = public.projet_du_chemin(new.name);
  if studio is null then
    return new;
  end if;

  -- Deux envois simultanés dans le même studio ne prennent pas la même
  -- dernière place : le second compte après que le premier a abouti.
  perform 1 from public.studios where id = studio for update;

  select v.storage_mb into limite_mo from public.plan_en_vigueur(studio) v;
  -- Avant l'écriture : un fichier remplacé est compté à son ancienne
  -- taille, et `ajout` n'en porte que la croissance.
  occupes := public.octets_du_studio(studio);

  if occupes + ajout > coalesce(limite_mo, 0)::bigint * 1048576 then
    raise exception 'Le plan de ce studio ne permet pas de stocker davantage (limite : % Mo).', coalesce(limite_mo, 0)
      using errcode = '53400';
  end if;

  return new;
end;
$$;

create trigger objects_limite_stockage_studio
  before insert or update of metadata on storage.objects
  for each row
  execute function public.limiter_stockage_du_studio();

revoke all on function public.octets_du_studio(uuid) from public, anon, authenticated;
revoke all on function public.limiter_stockage_du_studio() from public, anon, authenticated;
