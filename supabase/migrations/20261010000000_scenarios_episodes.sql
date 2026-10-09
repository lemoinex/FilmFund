-- Le scénario d'un épisode (lot SE3a), sans IA.
--
-- Une série a ses épisodes (lot SE1), mais rien ne reliait un document à un
-- épisode : un projet pouvait porter plusieurs scénarios sans qu'on sache
-- lequel était celui de quel épisode. Décisions du 9 octobre 2026 : tous les
-- épisodes peuvent avoir leur scénario, pas le pilote seulement ; le scénario
-- qu'une série portait déjà reste « sans épisode », et se rattache à la main.
--
-- Cette migration ajoute une colonne à `project_documents` : `episode_id`,
-- facultative. Nulle, le document n'est rattaché à aucun épisode — c'est le
-- cas de tous les documents existants, et de tout document d'un film.
--
-- Ce que la base garantit, quoi que fasse l'écran :
--   - seul un scénario se rattache à un épisode ;
--   - un épisode a un scénario au plus ;
--   - l'épisode est celui du même projet que le document.
--
-- Retirer un épisode ne supprime pas son scénario : le lien disparaît, le
-- texte reste, « sans épisode ». Supprimer un texte parce qu'on renumérote
-- une saison effacerait un travail sans que personne l'ait demandé.
--
-- Aucune politique ne change : la colonne se lit et s'écrit comme le reste du
-- document. Les droits de modification d'un document sont accordés colonne
-- par colonne ; ils le sont ici pour celle-ci. Rattacher un document ne crée
-- aucune version : seuls le titre et le contenu en créent.
--
-- Aucun chemin d'IA n'est touché : l'écriture d'une séquence vise toujours le
-- scénario le plus récemment modifié du projet. La faire viser le scénario
-- d'un épisode est l'objet du lot SE3b.
--
-- Retour arrière — aucun document n'est perdu, seul le lien l'est :
--   `drop trigger project_documents_episode on public.project_documents` ;
--   `drop function public.controler_episode_du_document()` ;
--   `alter table public.project_documents drop column episode_id`.

alter table public.project_documents
  add column episode_id uuid references public.project_episodes (id) on delete set null,
  add constraint document_episode_scenario check (episode_id is null or type = 'scenario');

comment on column public.project_documents.episode_id is
  'Épisode dont ce document est le scénario. Nul : le document n''est rattaché à aucun épisode.';

-- Un épisode a un scénario au plus.
create unique index project_documents_episode_unique
  on public.project_documents (episode_id)
  where episode_id is not null;

-- L'épisode est celui du même projet. Exécutée sous les droits de l'appelant :
-- qui ne lit pas l'épisode n'apprend rien de lui, et n'y rattache rien.
create or replace function public.controler_episode_du_document()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.episode_id is not null and not exists (
    select 1 from public.project_episodes e
    where e.id = new.episode_id and e.project_id = new.project_id
  ) then
    raise exception 'Cet épisode n''est pas un épisode de ce projet.' using errcode = 'SE003';
  end if;
  return new;
end;
$$;

revoke all on function public.controler_episode_du_document() from public, anon, authenticated;

create trigger project_documents_episode
  before insert or update of episode_id, project_id on public.project_documents
  for each row
  execute function public.controler_episode_du_document();

grant update (episode_id) on table public.project_documents to authenticated;
