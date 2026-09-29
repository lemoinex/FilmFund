-- Équipes de projet.
--
-- Un projet cesse d'être l'affaire de son seul porteur : il peut y associer
-- des collaborateurs, chacun avec un rôle.
--
--   - porteur (owner) : le créateur du projet, désigné par projects.owner_id.
--     Seul à pouvoir inviter, retirer un membre, changer un rôle ou supprimer
--     le projet. Il ne figure pas dans project_members : une seule source de
--     vérité pour la propriété.
--   - éditeur (editor) : lit et modifie le projet, sans pouvoir le supprimer
--     ni en changer le porteur.
--   - lecteur (viewer) : lit le projet.
--
-- On n'ajoute personne à un projet d'office : le porteur envoie une
-- invitation à une adresse e-mail, que son destinataire accepte ou refuse.
-- Deux raisons à ce détour :
--
--   1. le consentement : figurer dans l'équipe d'un projet engage, et nul ne
--      doit s'y retrouver à son insu ;
--   2. l'énumération : ajouter directement « par e-mail » obligerait à dire
--      au porteur si l'adresse correspond à un compte. N'importe quel
--      utilisateur pourrait alors sonder la liste des inscrits. Une
--      invitation, elle, s'enregistre de la même façon que le compte existe
--      ou non.
--
-- Aucun e-mail n'est envoyé à ce stade : le destinataire trouve ses
-- invitations dans son tableau de bord, à l'inscription ou à la connexion.

-- ---------------------------------------------------------------------------
-- Rôle au sein d'un projet
-- ---------------------------------------------------------------------------

create type public.project_member_role as enum ('editor', 'viewer');

-- ---------------------------------------------------------------------------
-- Membres
-- ---------------------------------------------------------------------------

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_member_role not null default 'viewer',
  job_title text not null default '',
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (project_id, user_id),
  constraint job_title_longueur check (char_length(job_title) <= 80)
);

comment on table public.project_members is
  'Collaborateurs d''un projet, hors porteur. Une ligne naît uniquement de l''acceptation d''une invitation, par la fonction accepter_invitation.';

comment on column public.project_members.job_title is
  'Poste occupé sur le film : réalisation, production, image… Texte libre, purement descriptif, sans effet sur les droits.';

-- La clé primaire couvre la recherche par projet. La liste « projets
-- partagés avec moi » part de l'utilisateur : elle a besoin de cet index.
create index project_members_user_id_idx on public.project_members (user_id);

alter table public.project_members enable row level security;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  role public.project_member_role not null default 'viewer',
  job_title text not null default '',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Adresse stockée normalisée : la comparaison avec celle du compte se
  -- fait alors par simple égalité, sans dépendre de la casse saisie.
  constraint email_normalise check (email = lower(btrim(email))),
  constraint email_format check (
    char_length(email) <= 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint invitation_job_title_longueur check (char_length(job_title) <= 80),
  constraint une_invitation_par_adresse unique (project_id, email)
);

comment on table public.project_invitations is
  'Invitation en attente à rejoindre un projet. Supprimée à l''acceptation comme au refus.';

-- Le destinataire retrouve ses invitations par son adresse.
create index project_invitations_email_idx on public.project_invitations (email);

alter table public.project_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- Niveau d'accès de l'utilisateur courant à un projet
-- ---------------------------------------------------------------------------

-- Renvoie 'owner', 'editor', 'viewer', ou null sans accès.
--
-- `security definer` : les politiques de projects consultent project_members
-- et inversement. Évaluées sous RLS, elles s'appelleraient l'une l'autre sans
-- fin. La fonction lit les deux tables hors RLS, et ne révèle rien d'autre
-- que la relation de l'appelant lui-même au projet.
create or replace function public.acces_au_projet(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and p.owner_id = (select auth.uid())
    ) then 'owner'
    else (
      select m.role::text
      from public.project_members m
      where m.project_id = p_project_id
        and m.user_id = (select auth.uid())
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- Projets : accès des membres
-- ---------------------------------------------------------------------------

create policy "Un membre lit les projets de son équipe"
  on public.projects for select
  to authenticated
  using (public.acces_au_projet(id) in ('editor', 'viewer'));

create policy "Un éditeur modifie les projets de son équipe"
  on public.projects for update
  to authenticated
  using (public.acces_au_projet(id) = 'editor')
  with check (public.acces_au_projet(id) = 'editor');

-- Aucune politique de suppression pour les membres : supprimer un projet
-- reste l'apanage du porteur (et des administrateurs).

-- Le porteur d'un projet ne change pas. Sans ce verrou, la politique
-- ci-dessus laisserait un éditeur réécrire owner_id à son nom et s'approprier
-- le projet, puis en exclure son auteur.
--
-- Même exemption que pour les rôles : une requête SQL directe, sans session
-- applicative, reste libre — c'est le seul chemin d'un transfert de
-- propriété, qui relève pour l'instant de l'exploitant.
create or replace function public.empecher_changement_de_porteur()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and (select auth.uid()) is not null then
    raise exception 'Le porteur d''un projet ne peut pas être changé.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger projects_porteur_immuable
  before update on public.projects
  for each row
  execute function public.empecher_changement_de_porteur();

-- ---------------------------------------------------------------------------
-- Membres : politiques
-- ---------------------------------------------------------------------------

create policy "Un membre voit l'équipe de ses projets"
  on public.project_members for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null);

create policy "Le porteur modifie les membres de son projet"
  on public.project_members for update
  to authenticated
  using (public.acces_au_projet(project_id) = 'owner')
  with check (public.acces_au_projet(project_id) = 'owner');

create policy "Le porteur retire un membre, un membre se retire"
  on public.project_members for delete
  to authenticated
  using (
    public.acces_au_projet(project_id) = 'owner'
    or user_id = (select auth.uid())
  );

-- Aucune politique d'insertion : un membre n'entre que par
-- accepter_invitation. Personne, pas même le porteur, n'inscrit un tiers
-- directement.

-- La politique de modification autorise le porteur à toucher une ligne ;
-- elle ne dit rien des colonnes. Or réécrire user_id ferait entrer dans
-- l'équipe quelqu'un qui n'a rien accepté, et réécrire project_id
-- déplacerait un membre vers un autre projet. Seuls le rôle et le poste
-- sont modifiables.
revoke all on table public.project_members from anon;
revoke insert, update on table public.project_members from authenticated;
grant update (role, job_title) on table public.project_members to authenticated;

-- ---------------------------------------------------------------------------
-- Invitations : politiques
-- ---------------------------------------------------------------------------

create policy "Le porteur voit les invitations de son projet"
  on public.project_invitations for select
  to authenticated
  using (public.acces_au_projet(project_id) = 'owner');

create policy "Le porteur invite sur son projet"
  on public.project_invitations for insert
  to authenticated
  with check (
    public.acces_au_projet(project_id) = 'owner'
    and invited_by = (select auth.uid())
  );

create policy "Le porteur annule une invitation"
  on public.project_invitations for delete
  to authenticated
  using (public.acces_au_projet(project_id) = 'owner');

-- Le destinataire ne passe pas par ces politiques : il ne peut pas lire le
-- projet avant d'en être membre. Il consulte ses invitations, les accepte ou
-- les refuse par les fonctions ci-dessous.

revoke all on table public.project_invitations from anon;
revoke update on table public.project_invitations from authenticated;

-- ---------------------------------------------------------------------------
-- Adresse confirmée de l'utilisateur courant
-- ---------------------------------------------------------------------------

-- Une invitation se rattache à son destinataire par l'adresse e-mail. Il faut
-- donc que celle-ci soit prouvée : sans cette exigence, quiconque s'inscrit
-- avec l'adresse d'un autre — sans pouvoir la confirmer — recueillerait ses
-- invitations. Là où la confirmation est désactivée, comme en développement
-- local, toute adresse est réputée confirmée dès l'inscription.
create or replace function public.email_confirme_courant()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null;
$$;

-- ---------------------------------------------------------------------------
-- Équipe d'un projet, avec les noms
-- ---------------------------------------------------------------------------

-- Les profils ne sont lisibles que par leur titulaire. Plutôt que d'ouvrir
-- toute la table aux coéquipiers — rôle applicatif compris —, cette fonction
-- rend exactement ce que la page d'équipe affiche : ni adresse e-mail, ni
-- rôle d'administration.
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
  where public.acces_au_projet(p_project_id) is not null
     or public.is_admin()
  order by membres.depuis;
$$;

-- ---------------------------------------------------------------------------
-- Invitations reçues
-- ---------------------------------------------------------------------------

-- Le titre du projet et le nom de qui invite sont nécessaires pour décider
-- d'accepter, alors que le destinataire n'a encore aucun accès au projet.
-- Rien d'autre n'est révélé : ni pitch, ni synopsis, ni reste de l'équipe.
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
  order by i.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Acceptation et refus
-- ---------------------------------------------------------------------------

create or replace function public.accepter_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invitation public.project_invitations;
begin
  select * into invitation
  from public.project_invitations
  where id = p_invitation_id
    and email = public.email_confirme_courant()
  for update;

  -- Même réponse pour une invitation inexistante et pour celle d'un autre :
  -- l'appelant n'apprend rien d'un identifiant qui ne lui est pas destiné.
  if invitation.id is null then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;

  -- Le porteur qui s'invite lui-même n'a rien à rejoindre ; un membre déjà
  -- présent garde son rôle, que le porteur peut changer par ailleurs.
  if not exists (
    select 1 from public.projects
    where id = invitation.project_id
      and owner_id = (select auth.uid())
  ) then
    insert into public.project_members (project_id, user_id, role, job_title, added_by)
    values (
      invitation.project_id,
      (select auth.uid()),
      invitation.role,
      invitation.job_title,
      invitation.invited_by
    )
    on conflict (project_id, user_id) do nothing;
  end if;

  delete from public.project_invitations where id = invitation.id;

  return invitation.project_id;
end;
$$;

create or replace function public.refuser_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.project_invitations
  where id = p_invitation_id
    and email = public.email_confirme_courant();

  if not found then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

-- Supabase accorde par défaut l'exécution de toute nouvelle fonction à anon :
-- le retrait doit le viser nommément, un simple `from public` ne suffit pas.
revoke all on function public.acces_au_projet(uuid) from public, anon;
revoke all on function public.empecher_changement_de_porteur() from public, anon, authenticated;
revoke all on function public.email_confirme_courant() from public, anon;
revoke all on function public.equipe_du_projet(uuid) from public, anon;
revoke all on function public.mes_invitations() from public, anon;
revoke all on function public.accepter_invitation(uuid) from public, anon;
revoke all on function public.refuser_invitation(uuid) from public, anon;

grant execute on function public.acces_au_projet(uuid) to authenticated;
grant execute on function public.email_confirme_courant() to authenticated;
grant execute on function public.equipe_du_projet(uuid) to authenticated;
grant execute on function public.mes_invitations() to authenticated;
grant execute on function public.accepter_invitation(uuid) to authenticated;
grant execute on function public.refuser_invitation(uuid) to authenticated;
