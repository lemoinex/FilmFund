-- Durcissements relevés par l'audit du 4 octobre 2026.
--
-- 1. Limite de stockage : déplacer une image vers le projet d'un autre studio
--    n'était pas compté. Le déclencheur ne se levait que sur un changement de
--    `metadata`, et retranchait l'ancienne taille du fichier quel que soit le
--    studio qui la portait : pour le studio d'arrivée, l'ajout valait zéro.
--    Il se lève désormais aussi sur un changement de chemin ou de
--    compartiment, et ne retranche l'ancienne taille que si elle pesait déjà
--    sur le même studio. Un déplacement entre deux projets d'un même studio
--    n'ajoute toujours rien.
--
-- 2. Politique « Images : remplacement » : sa condition d'écriture n'imposait
--    pas la forme du chemin que l'envoi impose (`<projet>/couverture|scenes/
--    <fichier>`). Un déplacement pouvait ranger un fichier ailleurs dans le
--    dossier du projet.
--
-- 3. Mode privé : `equipe_du_projet()` et `mes_invitations()` contournent la
--    RLS (`security definer`) et ne consultaient pas le verrou. Un compte non
--    administrateur y lisait encore l'équipe de ses projets et ses
--    invitations, que les tables lui refusent. Elles suivent désormais le
--    verrou, comme `images_orphelines()`.
--
-- Aucune table, aucune donnée modifiée. `create or replace` conserve les
-- droits d'exécution déjà réglés.
--
-- Retour arrière : reprendre les définitions de
-- 20261001022834_limite_stockage.sql (fonction et déclencheur),
-- 20260930020639_images.sql (politique) et
-- 20260929200048_equipes_de_projet.sql (les deux fonctions), sans perte.

-- ---------------------------------------------------------------------------
-- 1. Limite de stockage : un déplacement compte pour le studio d'arrivée
-- ---------------------------------------------------------------------------

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

  -- L'inscription d'essai qui précède l'envoi n'a pas encore de taille :
  -- elle passe.
  ajout := coalesce((new.metadata ->> 'size')::bigint, 0);
  if ajout <= 0 then
    return new;
  end if;

  select p.studio_id into studio
  from public.projects p
  where p.id = public.projet_du_chemin(new.name);
  if studio is null then
    return new;
  end if;

  -- Octets ajoutés à ce studio : la taille du fichier, ou sa seule croissance
  -- s'il y pesait déjà — remplacé sur place, ou déplacé entre deux de ses
  -- projets. Venu d'un autre studio ou d'un autre compartiment, il compte
  -- en entier.
  if tg_op = 'UPDATE'
     and old.bucket_id = 'project-images'
     and exists (
       select 1
       from public.projects p
       where p.id = public.projet_du_chemin(old.name)
         and p.studio_id = studio
     ) then
    ajout := ajout - coalesce((old.metadata ->> 'size')::bigint, 0);
  end if;
  if ajout <= 0 then
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

create or replace trigger objects_limite_stockage_studio
  before insert or update of metadata, name, bucket_id on storage.objects
  for each row
  execute function public.limiter_stockage_du_studio();

revoke all on function public.limiter_stockage_du_studio() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Images : un fichier remplacé ou déplacé garde un chemin admis à l'envoi
-- ---------------------------------------------------------------------------

alter policy "Images : remplacement" on storage.objects
  with check (
    bucket_id = 'project-images'
    and public.peut_editer_contenu(public.projet_du_chemin(name))
    and split_part(name, '/', 2) in ('couverture', 'scenes')
    and split_part(name, '/', 3) <> ''
    and split_part(name, '/', 4) = ''
  );

-- ---------------------------------------------------------------------------
-- 3. Mode privé : l'équipe et les invitations suivent le verrou
-- ---------------------------------------------------------------------------

create or replace function public.equipe_du_projet(p_project_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  job_title text,
  depuis timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select membres.*
  from (
    select p.owner_id, pr.display_name, 'owner'::text, ''::text, p.created_at
    from public.projects p
    join public.profiles pr on pr.id = p.owner_id
    where p.id = p_project_id

    union all

    select m.user_id, pr.display_name, m.role::text, m.job_title, m.created_at
    from public.project_members m
    join public.profiles pr on pr.id = m.user_id
    where m.project_id = p_project_id
  ) as membres (user_id, display_name, role, job_title, depuis)
  where (
      public.acces_au_projet(p_project_id) is not null
      or public.is_admin()
    )
    and (not public.mode_prive() or public.is_admin())
  order by membres.depuis;
$$;

create or replace function public.mes_invitations()
returns table (
  id uuid,
  project_id uuid,
  project_title text,
  role public.project_member_role,
  job_title text,
  invited_by_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select i.id, i.project_id, p.title, i.role, i.job_title,
         coalesce(pr.display_name, ''), i.created_at
  from public.project_invitations i
  join public.projects p on p.id = i.project_id
  left join public.profiles pr on pr.id = i.invited_by
  where i.email = public.email_confirme_courant()
    and (not public.mode_prive() or public.is_admin())
  order by i.created_at desc;
$$;
