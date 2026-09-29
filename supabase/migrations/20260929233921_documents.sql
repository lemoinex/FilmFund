-- Documents de projet.
--
-- Les textes qui accompagnent un film en développement : note d'intention,
-- traitement, scénario, biographie, lettres. Rédigés dans l'application,
-- en texte brut. Les fichiers joints (PDF, images) viendront avec le
-- stockage, qui a ses propres règles d'accès.
--
-- Qui lit : toute l'équipe du projet, lecteurs compris — une note
-- d'intention est faite pour être partagée — et les administrateurs.
-- Qui écrit et supprime : le porteur, les éditeurs et les administrateurs.

-- ---------------------------------------------------------------------------
-- Énumérations
-- ---------------------------------------------------------------------------

create type public.document_type as enum (
  'note_intention',
  'traitement',
  'scenario',
  'biographie',
  'lettre',
  'autre'
);

create type public.document_status as enum ('brouillon', 'en_relecture', 'finalise');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  type public.document_type not null,
  title text not null,
  content text not null default '',
  status public.document_status not null default 'brouillon',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_titre_non_vide check (char_length(btrim(title)) between 1 and 200),
  -- Une centaine de pages de texte : large pour un traitement, suffisant
  -- pour un scénario, et une borne contre l'envoi de volumes absurdes.
  constraint document_contenu_longueur check (char_length(content) <= 200000)
);

comment on table public.project_documents is
  'Document texte d''un projet. Lu par toute l''équipe, écrit par le porteur, les éditeurs et les administrateurs.';

-- Les documents s'affichent par projet, du plus récent au plus ancien ; le
-- tableau de bord cherche la dernière note d'intention d'un projet.
create index project_documents_project_id_type_updated_at_idx
  on public.project_documents (project_id, type, updated_at desc);

alter table public.project_documents enable row level security;

create trigger project_documents_avant_update
  before update on public.project_documents
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Droit d'écriture sur le contenu d'un projet
-- ---------------------------------------------------------------------------

-- Porteur, éditeur ou administrateur. Même règle que peut_gerer_budget,
-- nommée pour ce qu'elle dit : les deux divergeront peut-être un jour.
-- Invoker : elle n'appelle que des fonctions déjà `security definer`.
create or replace function public.peut_editer_contenu(p_project_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.acces_au_projet(p_project_id) in ('owner', 'editor')
      or public.is_admin();
$$;

revoke all on function public.peut_editer_contenu(uuid) from public, anon;
grant execute on function public.peut_editer_contenu(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

create policy "L'équipe et les administrateurs lisent les documents"
  on public.project_documents for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Création de documents"
  on public.project_documents for insert
  to authenticated
  with check (
    public.peut_editer_contenu(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification de documents"
  on public.project_documents for update
  to authenticated
  using (public.peut_editer_contenu(project_id))
  with check (public.peut_editer_contenu(project_id));

create policy "Suppression de documents"
  on public.project_documents for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

-- Mode privé : même politique restrictive que sur les autres tables. Sans
-- elle, cette table échapperait au verrou — le test SQL de couverture le
-- signalerait.
create policy "Mode privé : administrateurs uniquement"
  on public.project_documents
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Privilèges par colonne
-- ---------------------------------------------------------------------------

-- Un document ne change ni de projet ni d'auteur : seul son contenu évolue.
revoke all on table public.project_documents from anon;
revoke update on table public.project_documents from authenticated;
grant update (type, title, content, status) on table public.project_documents to authenticated;
