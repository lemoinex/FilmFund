-- Brouillons des documents (lot ED3) : la sauvegarde automatique.
--
-- L'éditeur n'enregistrait que sur son bouton ; entre deux clics, le texte ne
-- vivait que dans le navigateur. Le sauvegarder dans `project_documents`
-- toutes les quelques secondes créerait une version à chaque fois
-- (`versionner_document`) et noierait l'historique. Décision du 8 octobre
-- 2026 : la sauvegarde automatique écrit un brouillon en cours, sans créer de
-- version ; une version naît du bouton « Enregistrer ».
--
-- Un brouillon est à un compte, pour un document : deux éditeurs qui
-- travaillent le même texte ne s'écrasent pas la frappe. Rien d'autre que
-- l'éditeur ne le lit — ni les exports, ni les agents, ni le repérage d'un
-- passage, qui lisent tous `project_documents.content`.
--
-- Qui lit et écrit : le titulaire du brouillon, tant qu'il peut éditer le
-- projet. Les administrateurs lisent tout ; ils écrivent le leur comme un
-- éditeur, et peuvent supprimer celui d'un autre, ce qui est journalisé.
--
-- Pas de journal sur les écritures ordinaires : un administrateur qui tape
-- dans un projet qui n'est pas le sien n'a encore rien changé au projet. Son
-- intervention est journalisée quand il enregistre le document, par le
-- déclencheur déjà en place sur `project_documents`.
--
-- Retour arrière :
--   drop table public.project_document_drafts;
--   drop function public.dater_base_brouillon();
--   drop function public.journaliser_suppression_brouillon();

create table public.project_document_drafts (
  document_id uuid not null,
  -- Répété depuis le document : les politiques le lisent sans jointure.
  project_id uuid not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Vide permis : un titre en cours de frappe peut l'être un instant.
  title text not null default '',
  content text not null default '',
  -- Numéro de la dernière version du document quand le brouillon est né ;
  -- zéro si le document n'en avait pas. Posé par la base, jamais par l'écran :
  -- il dit si le document a été enregistré depuis.
  base_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint brouillon_un_par_compte primary key (document_id, user_id),
  -- Même clé composée que les versions : un brouillon désigne son document
  -- et son projet ensemble, et disparaît avec le document.
  constraint brouillon_du_document foreign key (document_id, project_id)
    references public.project_documents (id, project_id) on delete cascade,
  -- Les bornes du document lui-même.
  constraint brouillon_titre_longueur check (char_length(title) <= 200),
  constraint brouillon_contenu_longueur check (char_length(content) <= 200000),
  constraint brouillon_base_positive check (base_version >= 0)
);

comment on table public.project_document_drafts is
  'Brouillon en cours d''un document, un par compte : la sauvegarde automatique de l''éditeur. Ne crée aucune version ; lu par son seul titulaire et les administrateurs.';
comment on column public.project_document_drafts.base_version is
  'Dernière version du document à la naissance du brouillon. Posé par la base.';

create index project_document_drafts_user_id_idx on public.project_document_drafts (user_id);

alter table public.project_document_drafts enable row level security;

create trigger project_document_drafts_avant_update
  before update on public.project_document_drafts
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Version de départ
-- ---------------------------------------------------------------------------

-- Definer : le numéro se lit même si une politique venait à changer, et la
-- valeur envoyée par l'appelant est toujours remplacée.
create or replace function public.dater_base_brouillon()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  select coalesce(max(v.version_number), 0)
  into new.base_version
  from public.project_document_versions v
  where v.document_id = new.document_id;
  return new;
end;
$$;

revoke all on function public.dater_base_brouillon() from public, anon, authenticated;

create trigger project_document_drafts_base
  before insert on public.project_document_drafts
  for each row
  execute function public.dater_base_brouillon();

-- ---------------------------------------------------------------------------
-- Journal : un administrateur supprime le brouillon d'un autre
-- ---------------------------------------------------------------------------

-- `pg_trigger_depth() = 1` écarte la cascade : supprimer un document ou un
-- compte emporte ses brouillons sans une ligne de journal par brouillon.
create or replace function public.journaliser_suppression_brouillon()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is not null
     and pg_trigger_depth() = 1
     and old.user_id is distinct from (select auth.uid())
     and public.is_admin() then
    perform public.journaliser(
      'intervention_contenu',
      old.project_id,
      jsonb_build_object(
        'table', tg_table_name,
        'operation', 'delete',
        'ligne', old.document_id
      )
    );
  end if;
  return old;
end;
$$;

revoke all on function public.journaliser_suppression_brouillon() from public, anon, authenticated;

create trigger project_document_drafts_journal_admin
  before delete on public.project_document_drafts
  for each row
  execute function public.journaliser_suppression_brouillon();

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

create policy "Le titulaire et les administrateurs lisent un brouillon"
  on public.project_document_drafts for select
  to authenticated
  using (
    (user_id = (select auth.uid()) and public.peut_editer_contenu(project_id))
    or (select public.is_admin())
  );

create policy "Création de son brouillon"
  on public.project_document_drafts for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.peut_editer_contenu(project_id));

create policy "Modification de son brouillon"
  on public.project_document_drafts for update
  to authenticated
  using (user_id = (select auth.uid()) and public.peut_editer_contenu(project_id))
  with check (user_id = (select auth.uid()) and public.peut_editer_contenu(project_id));

create policy "Suppression de son brouillon, ou par un administrateur"
  on public.project_document_drafts for delete
  to authenticated
  using (
    (user_id = (select auth.uid()) and public.peut_editer_contenu(project_id))
    or (select public.is_admin())
  );

create policy "Mode privé : administrateurs uniquement"
  on public.project_document_drafts
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Privilèges par colonne
-- ---------------------------------------------------------------------------

-- Un brouillon ne change ni de document, ni de projet, ni de titulaire ; sa
-- version de départ et ses dates sont à la base.
revoke all on table public.project_document_drafts from anon, authenticated;
grant select, delete on table public.project_document_drafts to authenticated;
grant insert (document_id, project_id, title, content)
  on table public.project_document_drafts to authenticated;
grant update (title, content) on table public.project_document_drafts to authenticated;
