-- Versions des documents de projet.
--
-- Jusqu'ici, chaque enregistrement d'un document écrasait le précédent.
-- Désormais, chaque état enregistré — titre et texte — devient une version,
-- conservée telle quelle. C'est un prérequis avant toute génération par un
-- agent : aucun texte écrit par une personne ne doit pouvoir être écrasé.
--
-- Ce qui fait une version : un changement de titre ou de texte. Changer le
-- statut ou le type d'un document n'en crée pas — ce sont des étiquettes,
-- pas l'œuvre —, et enregistrer sans rien changer non plus.
--
-- Les versions sont créées en base, par déclencheur : aucun chemin
-- d'écriture — éditeur, SQL direct, agent à venir — ne peut les contourner.
--
-- Restaurer une version, c'est enregistrer à nouveau son titre et son
-- texte : la restauration crée une nouvelle version, marquée comme telle.
-- L'historique n'est jamais réécrit.
--
-- Qui lit : comme les documents, toute l'équipe et les administrateurs.
-- Qui écrit : personne directement, le déclencheur seul.
-- Qui restaure : qui peut modifier le document — porteur, éditeurs,
-- administrateurs.
--
-- Retour arrière : les déclencheurs et la fonction de restauration peuvent
-- être retirés sans perte. La table, elle, porte l'historique : la
-- supprimer le détruit, ce qui ne se rattrape pas.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

-- La clé étrangère composée `version_du_document` s'appuie sur la contrainte
-- unique (id, project_id) posée par la migration des financements : une
-- version désigne son document et son projet ensemble, et ne peut donc pas
-- se rattacher au projet d'un autre document.
create table public.project_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  project_id uuid not null,
  version_number integer not null,
  title text not null,
  content text not null,
  -- Numéro de la version restaurée, quand celle-ci en est une restauration.
  restored_from integer,
  -- Pas de clé étrangère vers les comptes : avec `on delete set null`,
  -- supprimer un compte modifierait ses versions, ce que l'ajout seul
  -- refuse — et la suppression du compte échouerait.
  --
  -- Nul : écriture faite hors de l'application, ou version reprise à la
  -- mise en place de l'historique.
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint version_du_document foreign key (document_id, project_id)
    references public.project_documents (id, project_id) on delete cascade,
  constraint version_numero_unique unique (document_id, version_number),
  constraint version_numero_positif check (version_number >= 1),
  -- On ne restaure qu'une version antérieure, et existante.
  constraint version_restauree_anterieure check (restored_from < version_number),
  constraint version_restauree_existante foreign key (document_id, restored_from)
    references public.project_document_versions (document_id, version_number)
);

comment on table public.project_document_versions is
  'Versions successives du titre et du texte d''un document, en ajout seul. Lues par l''équipe et les administrateurs ; écrites par déclencheur uniquement.';

alter table public.project_document_versions enable row level security;

create policy "L'équipe et les administrateurs lisent les versions"
  on public.project_document_versions for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

-- Aucune politique d'écriture : seul le déclencheur de versionnement,
-- exécuté avec les droits de son propriétaire, y écrit.

create policy "Mode privé : administrateurs uniquement"
  on public.project_document_versions
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

revoke all on table public.project_document_versions from anon, authenticated;
grant select on table public.project_document_versions to authenticated;

-- ---------------------------------------------------------------------------
-- Ajout seul
-- ---------------------------------------------------------------------------

-- Une version ne se modifie jamais, et ne disparaît qu'avec son document.
-- La suppression en cascade s'exécute depuis le déclencheur de clé
-- étrangère, donc à une profondeur supérieure à 1 ; toute suppression
-- directe est refusée — rôle de service et SQL direct compris, que les
-- privilèges n'arrêtent pas.
create or replace function public.version_en_ajout_seul()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Une version de document ne se modifie ni ne se supprime.'
    using errcode = '42501';
end;
$$;

create trigger project_document_versions_ajout_seul
  before update or delete on public.project_document_versions
  for each row
  execute function public.version_en_ajout_seul();

create trigger project_document_versions_pas_de_vidage
  before truncate on public.project_document_versions
  for each statement
  execute function public.version_en_ajout_seul();

-- ---------------------------------------------------------------------------
-- Reprise de l'existant
-- ---------------------------------------------------------------------------

-- L'état actuel de chaque document non vide devient sa première version,
-- sans auteur : on ne sait pas qui l'a enregistré en dernier.
insert into public.project_document_versions
  (document_id, project_id, version_number, title, content, created_at)
select id, project_id, 1, title, content, updated_at
from public.project_documents
where content <> '';

-- ---------------------------------------------------------------------------
-- Versionnement
-- ---------------------------------------------------------------------------

-- Security definer : aucun compte n'écrit dans la table des versions, pas
-- même celui qui enregistre ; seul ce déclencheur le fait.
--
-- Après l'écriture, et non avant : à la création, la version désigne un
-- document qui doit déjà exister. Le verrou posé sur la ligne du document
-- sérialise deux enregistrements simultanés, qui ne peuvent donc pas
-- prendre le même numéro.
create or replace function public.versionner_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    -- Un document naît vide : sa première version est son premier texte.
    if new.content = '' then
      return null;
    end if;
  elsif new.title = old.title and new.content = old.content then
    return null;
  end if;

  insert into public.project_document_versions
    (document_id, project_id, version_number, title, content, restored_from, created_by)
  select
    new.id,
    new.project_id,
    coalesce(max(v.version_number), 0) + 1,
    new.title,
    new.content,
    -- Posé par restaurer_version_document(), le temps de sa transaction.
    nullif(current_setting('filmfund.version_restauree', true), '')::integer,
    (select auth.uid())
  from public.project_document_versions v
  where v.document_id = new.id;

  return null;
end;
$$;

create trigger project_documents_versions
  after insert or update of title, content on public.project_documents
  for each row
  execute function public.versionner_document();

-- ---------------------------------------------------------------------------
-- Restauration
-- ---------------------------------------------------------------------------

-- Security invoker : la lecture de la version et la modification du
-- document passent par la RLS de l'appelant. Un lecteur de l'équipe voit
-- les versions mais n'en restaure aucune ; un compte hors équipe ne les
-- voit même pas.
create or replace function public.restaurer_version_document(p_version_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  version public.project_document_versions;
  lignes integer;
begin
  select * into version
  from public.project_document_versions
  where id = p_version_id;

  if not found then
    raise exception 'Version introuvable.' using errcode = 'P0002';
  end if;

  perform set_config('filmfund.version_restauree', version.version_number::text, true);

  update public.project_documents
  set title = version.title, content = version.content
  where id = version.document_id
    and project_id = version.project_id;
  get diagnostics lignes = row_count;

  perform set_config('filmfund.version_restauree', '', true);

  if lignes = 0 then
    raise exception 'Vous n''avez pas le droit de modifier ce document.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.restaurer_version_document(uuid) is
  'Restaure le titre et le texte d''une version dans son document ; la restauration crée une nouvelle version. Soumise à la RLS de l''appelant.';

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

revoke all on function public.version_en_ajout_seul() from public, anon, authenticated;
revoke all on function public.versionner_document() from public, anon, authenticated;
revoke all on function public.restaurer_version_document(uuid) from public, anon;
grant execute on function public.restaurer_version_document(uuid) to authenticated;
