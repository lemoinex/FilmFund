-- Financements : les candidatures d'un projet auprès des guichets.
--
-- Chaque candidature vise un organisme (fonds d'aide, coproducteur,
-- diffuseur, mécène…), porte un montant demandé puis, le cas échéant,
-- accordé, une date limite de dépôt et un statut. Elle rattache les
-- documents du projet qui composent le dossier.
--
-- Pas de catalogue de guichets : chaque projet saisit les siens. Un
-- catalogue partagé demanderait des données — montants, calendriers — que
-- personne n'a encore vérifiées.
--
-- Qui voit et modifie : les mêmes que pour le budget (peut_gerer_budget) —
-- porteur, éditeurs, administrateurs. Pas les lecteurs : les montants
-- demandés et obtenus sont aussi confidentiels qu'un budget.

create type public.funding_kind as enum (
  'aide_publique',
  'coproduction',
  'preachat',
  'mecenat',
  'financement_participatif',
  'residence',
  'autre'
);

create type public.funding_status as enum ('a_preparer', 'deposee', 'acceptee', 'refusee');

-- ---------------------------------------------------------------------------
-- Candidatures
-- ---------------------------------------------------------------------------

create table public.project_fundings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  funder text not null,
  program text not null default '',
  kind public.funding_kind not null default 'aide_publique',
  status public.funding_status not null default 'a_preparer',
  currency text not null,
  amount_requested numeric(16, 2),
  amount_granted numeric(16, 2),
  deadline date,
  notes text not null default '',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint financement_organisme_non_vide check (char_length(btrim(funder)) between 1 and 200),
  constraint financement_programme_longueur check (char_length(program) <= 200),
  constraint financement_notes_longueur check (char_length(notes) <= 2000),
  constraint financement_devise_iso check (currency ~ '^[A-Z]{3}$'),
  constraint financement_montants_positifs check (
    (amount_requested is null or amount_requested >= 0)
    and (amount_granted is null or amount_granted >= 0)
  ),

  -- Clé composite : permet aux pièces du dossier de référencer à la fois la
  -- candidature et son projet, et de garantir ainsi qu'un document rattaché
  -- appartient au même projet.
  constraint project_fundings_id_project_id_key unique (id, project_id)
);

comment on table public.project_fundings is
  'Candidature d''un projet à un financement. Visible et modifiable par le porteur, les éditeurs et les administrateurs ; jamais par les lecteurs.';

comment on column public.project_fundings.amount_granted is
  'Montant obtenu. Nul tant qu''aucune réponse favorable n''est connue : zéro signifierait un refus chiffré, ce qui n''est pas la même chose.';

create index project_fundings_project_id_deadline_idx
  on public.project_fundings (project_id, deadline);

alter table public.project_fundings enable row level security;

create trigger project_fundings_avant_update
  before update on public.project_fundings
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pièces du dossier
-- ---------------------------------------------------------------------------

-- Même clé composite côté documents. Contrainte ajoutée à une table
-- existante : `id` étant déjà la clé primaire, elle ne peut échouer sur
-- aucune donnée présente.
alter table public.project_documents
  add constraint project_documents_id_project_id_key unique (id, project_id);

create table public.funding_documents (
  project_id uuid not null,
  funding_id uuid not null,
  document_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (funding_id, document_id),
  -- Les deux références passent par le même project_id : une candidature
  -- ne peut pas rattacher le document d'un autre projet, même si son
  -- auteur a accès aux deux.
  foreign key (funding_id, project_id)
    references public.project_fundings (id, project_id) on delete cascade,
  foreign key (document_id, project_id)
    references public.project_documents (id, project_id) on delete cascade
);

comment on table public.funding_documents is
  'Documents du projet rattachés à une candidature. Un document et une candidature d''un même projet seulement.';

create index funding_documents_document_id_idx on public.funding_documents (document_id);

alter table public.funding_documents enable row level security;

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

create policy "Porteur, éditeurs et administrateurs lisent les financements"
  on public.project_fundings for select
  to authenticated
  using (public.peut_gerer_budget(project_id));

create policy "Création de candidatures"
  on public.project_fundings for insert
  to authenticated
  with check (
    public.peut_gerer_budget(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification de candidatures"
  on public.project_fundings for update
  to authenticated
  using (public.peut_gerer_budget(project_id))
  with check (public.peut_gerer_budget(project_id));

create policy "Suppression de candidatures"
  on public.project_fundings for delete
  to authenticated
  using (public.peut_gerer_budget(project_id));

create policy "Lecture des pièces du dossier"
  on public.funding_documents for select
  to authenticated
  using (public.peut_gerer_budget(project_id));

create policy "Rattachement de pièces"
  on public.funding_documents for insert
  to authenticated
  with check (public.peut_gerer_budget(project_id));

create policy "Détachement de pièces"
  on public.funding_documents for delete
  to authenticated
  using (public.peut_gerer_budget(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.project_fundings
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.funding_documents
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------------

-- Une candidature ne change ni de projet ni d'auteur. Une pièce se rattache
-- ou se détache ; elle ne se modifie pas.
revoke all on table public.project_fundings from anon;
revoke all on table public.funding_documents from anon;

revoke update on table public.project_fundings from authenticated;
grant update (funder, program, kind, status, currency, amount_requested, amount_granted, deadline, notes)
  on table public.project_fundings to authenticated;

revoke update on table public.funding_documents from authenticated;

-- ---------------------------------------------------------------------------
-- Remplacement des pièces d'un dossier
-- ---------------------------------------------------------------------------

-- Remplace d'un coup la liste des pièces d'une candidature : tout ou rien.
-- Deux requêtes séparées depuis l'application pourraient laisser un dossier
-- à moitié vidé si la seconde échouait.
--
-- `security invoker` : la RLS s'applique à chaque requête. Un appelant sans
-- droit sur la candidature ne peut ni la voir ni en modifier les pièces.
create or replace function public.definir_pieces_candidature(
  p_funding_id uuid,
  p_document_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  projet uuid;
begin
  select project_id into projet from public.project_fundings where id = p_funding_id;

  if projet is null then
    raise exception 'Candidature introuvable.' using errcode = 'P0002';
  end if;

  delete from public.funding_documents where funding_id = p_funding_id;

  -- Les documents d'un autre projet sont refusés par la clé composite ;
  -- ceux d'un document invisible, par la clé étrangère elle-même.
  insert into public.funding_documents (project_id, funding_id, document_id)
  select projet, p_funding_id, document_id
  from unnest(coalesce(p_document_ids, '{}')) as document_id;
end;
$$;

revoke all on function public.definir_pieces_candidature(uuid, uuid[]) from public, anon;
grant execute on function public.definir_pieces_candidature(uuid, uuid[]) to authenticated;
