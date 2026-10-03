-- Score de maturité : pondérations versionnées et faits d'un projet (lot S1).
--
-- Décidé par l'utilisateur le 3 octobre 2026 :
--   - le score mesure ce qui est renseigné dans le projet, critère par
--     critère ; il ne juge pas la qualité de l'écriture ;
--   - il se montre au porteur, aux éditeurs et aux administrateurs — il
--     tient compte du budget et du financement, que les lecteurs ne lisent
--     pas ;
--   - les pondérations des neuf critères sont versionnées, de total 100.
--
-- La base ne calcule pas le score. Elle fournit deux choses : la version des
-- pondérations en vigueur, et les faits d'un projet — des compteurs et des
-- oui/non, jamais de contenu. Le calcul se fait dans l'application
-- (`src/lib/maturite.ts`), où il se teste sans base. Rien n'est stocké : le
-- score est recalculé à chaque affichage, sur l'état réel du projet.
--
-- Les pondérations suivent le modèle du barème des unités texte : en ajout
-- seul, numérotées par la base, publiées par un administrateur, chaque
-- publication journalisée dans la même transaction.
--
-- Retour arrière — les versions publiées seraient perdues :
--   drop function public.faits_maturite(uuid);
--   drop table public.readiness_weight_versions;
--   drop function public.journaliser_publication_ponderations();
--   drop function public.version_ponderations_en_ajout_seul();
--   drop function public.numeroter_version_ponderations();
--   puis rétablir la contrainte action_connue de la migration
--   20261001124014_integrations_ia ; les entrées « publication_ponderations »
--   du journal, en ajout seul, devraient d'abord en être retirées.

-- ---------------------------------------------------------------------------
-- Pondérations des critères
-- ---------------------------------------------------------------------------

create table public.readiness_weight_versions (
  id uuid primary key default gen_random_uuid(),
  -- Fixé par le déclencheur de numérotation, comme pour le barème.
  version_number integer not null default 0,
  -- Points de chaque critère, sur un total de 100.
  concept integer not null,
  narrative integer not null,
  characters integer not null,
  artistic_vision integer not null,
  feasibility integer not null,
  budget integer not null,
  financing integer not null,
  market integer not null,
  dossier integer not null,
  published_at timestamptz not null default now(),
  -- Pas de clé étrangère : supprimer un compte modifierait l'historique.
  -- Nul : version publiée par migration ou en SQL direct.
  published_by uuid,

  constraint ponderations_version_unique unique (version_number),
  constraint ponderations_version_positive check (version_number >= 1),
  constraint ponderations_positives check (
    concept >= 0
    and narrative >= 0
    and characters >= 0
    and artistic_vision >= 0
    and feasibility >= 0
    and budget >= 0
    and financing >= 0
    and market >= 0
    and dossier >= 0
  ),
  -- Un score « sur 100 » n'a de sens que si les points s'additionnent à 100.
  constraint ponderations_total_cent check (
    concept + narrative + characters + artistic_vision + feasibility
      + budget + financing + market + dossier = 100
  )
);

comment on table public.readiness_weight_versions is
  'Pondérations des critères du score de maturité, en ajout seul. Publiées par l''administration ; jamais modifiées ni supprimées.';

alter table public.readiness_weight_versions enable row level security;

-- Un verrou consultatif sérialise deux publications simultanées, qui
-- prendraient sinon le même numéro.
create or replace function public.numeroter_version_ponderations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.readiness_weight_versions'));

  select coalesce(max(v.version_number), 0) + 1
  into new.version_number
  from public.readiness_weight_versions v;

  if (select auth.uid()) is not null then
    new.published_at := now();
    new.published_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger readiness_weight_versions_numerotation
  before insert on public.readiness_weight_versions
  for each row
  execute function public.numeroter_version_ponderations();

create or replace function public.version_ponderations_en_ajout_seul()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Une version des pondérations ne se modifie ni ne se supprime : publiez-en une nouvelle.'
    using errcode = '42501';
end;
$$;

create trigger readiness_weight_versions_ajout_seul
  before update or delete on public.readiness_weight_versions
  for each row
  execute function public.version_ponderations_en_ajout_seul();

create trigger readiness_weight_versions_pas_de_vidage
  before truncate on public.readiness_weight_versions
  for each statement
  execute function public.version_ponderations_en_ajout_seul();

-- Les pondérations ne font pas partie de la vitrine : seuls les comptes
-- connectés les lisent.
create policy "Les comptes connectés lisent les pondérations"
  on public.readiness_weight_versions for select
  to authenticated
  using (true);

create policy "Les administrateurs publient les pondérations"
  on public.readiness_weight_versions for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.readiness_weight_versions
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Ni le numéro, ni l'auteur, ni la date ne se fournissent : la base les fixe.
revoke all on table public.readiness_weight_versions from anon, authenticated;
grant select on table public.readiness_weight_versions to authenticated;
grant insert (
  concept,
  narrative,
  characters,
  artistic_vision,
  feasibility,
  budget,
  financing,
  market,
  dossier
) on table public.readiness_weight_versions to authenticated;

-- Pondérations par défaut, celles du cahier des charges (CLAUDE.md).
insert into public.readiness_weight_versions (
  concept, narrative, characters, artistic_vision, feasibility,
  budget, financing, market, dossier
)
values (20, 15, 15, 15, 10, 10, 5, 5, 5);

-- ---------------------------------------------------------------------------
-- Journal d'administration : publication d'une version
-- ---------------------------------------------------------------------------

alter table public.admin_audit_log
  drop constraint action_connue,
  add constraint action_connue check (
    action in (
      'changement_role',
      'modification_profil',
      'mode_prive',
      'suppression_projet',
      'intervention_contenu',
      'intervention_studio',
      'publication_plan',
      'changement_plan_studio',
      'publication_bareme',
      'rapprochement_travail',
      'plafond_ia',
      'cle_fournisseur',
      'publication_ponderations'
    )
  );

create or replace function public.journaliser_publication_ponderations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is not null then
    perform public.journaliser(
      'publication_ponderations',
      null,
      jsonb_build_object('version', new.version_number)
    );
  end if;
  return null;
end;
$$;

create trigger readiness_weight_versions_journal
  after insert on public.readiness_weight_versions
  for each row
  execute function public.journaliser_publication_ponderations();

-- ---------------------------------------------------------------------------
-- Faits d'un projet
-- ---------------------------------------------------------------------------

-- Ce qui est renseigné dans un projet, en compteurs et en oui/non : aucun
-- texte, aucun montant, aucune identité. Nul si le projet n'est pas visible
-- de l'appelant.
--
-- Sans `security definer` : la RLS de l'appelant s'applique à chaque table
-- lue. Un lecteur de l'équipe n'y apprend rien du budget ni des
-- financements, qu'il ne lit pas : ces faits lui reviennent vides.
create or replace function public.faits_maturite(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'pitch', btrim(p.logline) <> '',
    'synopsis_court', btrim(p.short_synopsis) <> '',
    'theme', btrim(p.theme) <> '',
    'genre', p.genre is not null,
    'synopsis', btrim(p.synopsis) <> '',
    'vision', btrim(p.artistic_vision) <> '',
    'duree', p.duration_minutes is not null,
    'pays', cardinality(p.countries) > 0,
    'langues', btrim(p.languages) <> '',
    'public', btrim(p.audience) <> '',
    'objectifs', btrim(p.goals) <> '',
    'personnages', (
      select count(*) from public.project_characters c where c.project_id = p.id
    ),
    'personnages_principaux', (
      select count(*) from public.project_characters c
      where c.project_id = p.id and c.role = 'principal'
    ),
    'personnages_decrits', (
      select count(*) from public.project_characters c
      where c.project_id = p.id and btrim(c.description) <> ''
    ),
    'recits', (
      select count(*) from public.project_documents d
      where d.project_id = p.id and d.type in ('traitement', 'scenario')
    ),
    'recits_finalises', (
      select count(*) from public.project_documents d
      where d.project_id = p.id and d.type in ('traitement', 'scenario')
        and d.status = 'finalise'
    ),
    'notes_intention', (
      select count(*) from public.project_documents d
      where d.project_id = p.id and d.type = 'note_intention'
    ),
    'notes_intention_finalisees', (
      select count(*) from public.project_documents d
      where d.project_id = p.id and d.type = 'note_intention' and d.status = 'finalise'
    ),
    'documents_finalises', (
      select count(*) from public.project_documents d
      where d.project_id = p.id and d.status = 'finalise'
    ),
    'presentations', (
      select count(*) from public.project_documents d
      where d.project_id = p.id and d.type in ('biographie', 'lettre')
    ),
    'etapes_datees', (
      select count(*) from public.project_milestones m
      where m.project_id = p.id and (m.starts_on is not null or m.due_on is not null)
    ),
    'budget_ouvert', exists (
      select 1 from public.project_budgets b where b.project_id = p.id
    ),
    'lignes_budget', (
      select count(*) from public.budget_lines l where l.project_id = p.id
    ),
    'postes_budget', (
      select count(distinct l.category) from public.budget_lines l where l.project_id = p.id
    ),
    'candidatures', (
      select count(*) from public.project_fundings f where f.project_id = p.id
    ),
    'candidatures_chiffrees', (
      select count(*) from public.project_fundings f
      where f.project_id = p.id and f.amount_requested is not null
    )
  )
  from public.projects p
  where p.id = p_project_id;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

revoke all on function public.numeroter_version_ponderations() from public, anon, authenticated;
revoke all on function public.version_ponderations_en_ajout_seul() from public, anon, authenticated;
revoke all on function public.journaliser_publication_ponderations() from public, anon, authenticated;

-- Sans `security definer` : la RLS de l'appelant s'applique. Fermée aux
-- visiteurs tout de même.
revoke all on function public.faits_maturite(uuid) from public, anon;
grant execute on function public.faits_maturite(uuid) to authenticated;
