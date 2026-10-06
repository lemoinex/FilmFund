-- Catalogue des opportunités de financement (lot L4), sans IA.
--
-- Premier des trois lots de MATCH, décidés avec l'utilisateur le 6 octobre
-- 2026 : le catalogue d'abord, tenu par l'administration ; la consultation et
-- la compatibilité ensuite ; l'agent en dernier. Un score calculé sur des
-- opportunités non vérifiées enverrait une équipe vers un fonds fermé ou un
-- montant inventé : rien ne se calcule avant que le catalogue existe.
--
-- Ce que cette migration ouvre :
--   1. la table `funding_opportunities` : ce qu'une opportunité annonce, et
--      d'où on le tient — adresse de la source, date de collecte, extrait,
--      statut ;
--   2. ses droits : l'administration écrit, les comptes ne lisent que ce qui
--      est vérifié ou expiré ;
--   3. le journal : tout ajout, changement ou retrait y est inscrit, dans la
--      transaction de son effet.
--
-- Ce que la base garantit, quoi que fasse l'écran :
--   - une opportunité ne se dit « vérifiée » qu'avec sa source, la date de sa
--     collecte et l'extrait qui la fonde ;
--   - une opportunité de démonstration ne se lit que de l'administration :
--     aucun compte ne peut la prendre pour une opportunité réelle ;
--   - un montant ne va pas sans sa devise.
--
-- Une date limite passée ne change pas le statut enregistré : c'est l'écran
-- qui présente alors l'opportunité comme expirée, à la date du jour. La base
-- ne réécrit pas ce qu'un administrateur a constaté.
--
-- Le catalogue n'appartient à aucun projet ni à aucun studio : c'est une
-- donnée publique, tenue par l'administration, sans rien de privé.
--
-- Retour arrière :
--   `drop table public.funding_opportunities` — ce qui emporte le catalogue
--   saisi ; `drop function public.marquer_opportunite()`,
--   `public.journaliser_opportunite()` ; puis rétablir la contrainte
--   `action_connue` de la migration 20261003131559_score_maturite, s'il
--   n'existe aucune entrée « opportunite » au journal.

-- ---------------------------------------------------------------------------
-- Le catalogue
-- ---------------------------------------------------------------------------

create table public.funding_opportunities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text not null,
  category text not null,
  description text not null default '',
  -- Site de l'organisme, et page où candidater : deux adresses distinctes.
  website text,
  application_url text,
  -- Vides : l'opportunité ne le précise pas. Ce n'est pas « tous ».
  countries text[] not null default '{}',
  formats public.project_format[] not null default '{}',
  genres text[] not null default '{}',
  budget_min numeric(14, 2),
  budget_max numeric(14, 2),
  currency text,
  opens_on date,
  deadline date,
  requirements text not null default '',
  -- Provenance : d'où l'on tient ce qui précède, et de quand.
  source_url text,
  collected_on date,
  source_excerpt text not null default '',
  status text not null default 'non_verifie',
  -- Pas de clé étrangère : supprimer un compte modifierait l'historique.
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint opportunite_nom check (
    char_length(btrim(name)) between 1 and 200 and name !~ '[[:cntrl:]]'
  ),
  constraint opportunite_organisme check (
    char_length(btrim(organization)) between 1 and 200 and organization !~ '[[:cntrl:]]'
  ),
  constraint opportunite_categorie_connue check (
    category in (
      'fonds', 'subvention', 'residence', 'festival', 'laboratoire', 'atelier',
      'coproduction', 'bourse', 'forum_pitch'
    )
  ),
  constraint opportunite_textes check (
    char_length(description) <= 5000
    and char_length(requirements) <= 5000
    and char_length(source_excerpt) <= 2000
  ),
  constraint opportunite_adresses check (
    (website is null
      or (char_length(website) <= 2000 and website ~ '^https://[^[:space:][:cntrl:]]+$'))
    and (application_url is null
      or (char_length(application_url) <= 2000
          and application_url ~ '^https://[^[:space:][:cntrl:]]+$'))
    and (source_url is null
      or (char_length(source_url) <= 2000 and source_url ~ '^https://[^[:space:][:cntrl:]]+$'))
  ),
  -- Codes ISO à deux lettres, comme les pays d'un projet.
  constraint opportunite_pays check (
    cardinality(countries) <= 60
    and array_position(countries, null) is null
    and array_to_string(countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'
  ),
  constraint opportunite_formats check (
    cardinality(formats) <= 10 and array_position(formats, null) is null
  ),
  -- Les genres d'un projet, ceux-là et aucun autre.
  constraint opportunite_genres check (
    array_position(genres, null) is null
    and genres <@ array[
      'drame', 'comedie', 'comedie_dramatique', 'thriller', 'policier', 'action', 'aventure',
      'fantastique', 'science_fiction', 'horreur', 'romance', 'historique', 'biopic', 'guerre',
      'musical', 'jeunesse', 'societe', 'portrait', 'nature', 'autre'
    ]::text[]
  ),
  constraint opportunite_montants check (
    (budget_min is null or budget_min >= 0)
    and (budget_max is null or budget_max >= 0)
    and (budget_min is null or budget_max is null or budget_min <= budget_max)
  ),
  -- Un montant sans devise ne veut rien dire.
  constraint opportunite_devise check (
    (currency is null or currency ~ '^[A-Z]{3}$')
    and ((budget_min is null and budget_max is null) or currency is not null)
  ),
  constraint opportunite_dates check (
    opens_on is null or deadline is null or opens_on <= deadline
  ),
  constraint opportunite_statut_connu check (
    status in ('non_verifie', 'verifie', 'expire', 'introuvable', 'demo')
  ),
  -- « Vérifiée » engage : la source, la date où on l'a lue, et ce qu'elle dit.
  constraint opportunite_verifiee_sourcee check (
    status <> 'verifie'
    or (
      source_url is not null
      and collected_on is not null
      and char_length(btrim(source_excerpt)) >= 1
    )
  )
);

comment on table public.funding_opportunities is
  'Catalogue des opportunités de financement, tenu par l''administration. Chaque ligne porte sa source, sa date de collecte, son extrait et son statut ; les comptes ne lisent que ce qui est vérifié ou expiré.';

create index funding_opportunities_statut_echeance_idx
  on public.funding_opportunities (status, deadline);

alter table public.funding_opportunities enable row level security;

-- Auteur et dates sont fixés ici : l'écran ne les fournit pas. Une date de
-- collecte ne peut pas être dans l'avenir — on n'a pas lu une page demain.
create or replace function public.marquer_opportunite()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.collected_on is not null and new.collected_on > (now() at time zone 'utc')::date + 1 then
    raise exception 'La date de collecte ne peut pas être dans l''avenir.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := (select auth.uid());
  else
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

revoke all on function public.marquer_opportunite() from public, anon, authenticated;

create trigger funding_opportunities_marque
  before insert or update on public.funding_opportunities
  for each row
  execute function public.marquer_opportunite();

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

-- Un compte ne lit que ce qui a été vérifié, ou vérifié puis expiré. Ni ce
-- qui attend une vérification, ni ce qui n'a pas été retrouvé, ni — surtout —
-- une démonstration.
create policy "Les comptes lisent les opportunités vérifiées ou expirées"
  on public.funding_opportunities for select
  to authenticated
  using (status in ('verifie', 'expire') or (select public.is_admin()));

create policy "Les administrateurs ajoutent des opportunités"
  on public.funding_opportunities for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Les administrateurs modifient les opportunités"
  on public.funding_opportunities for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Les administrateurs retirent des opportunités"
  on public.funding_opportunities for delete
  to authenticated
  using ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.funding_opportunities
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Ni l'auteur, ni les dates d'écriture ne se fournissent.
revoke all on table public.funding_opportunities from anon, authenticated;
grant select, delete on table public.funding_opportunities to authenticated;
grant insert (
  name, organization, category, description, website, application_url, countries, formats,
  genres, budget_min, budget_max, currency, opens_on, deadline, requirements, source_url,
  collected_on, source_excerpt, status
) on table public.funding_opportunities to authenticated;
grant update (
  name, organization, category, description, website, application_url, countries, formats,
  genres, budget_min, budget_max, currency, opens_on, deadline, requirements, source_url,
  collected_on, source_excerpt, status
) on table public.funding_opportunities to authenticated;

-- ---------------------------------------------------------------------------
-- Journal d'administration
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
      'publication_ponderations',
      'opportunite'
    )
  );

-- Inscrit au journal dans la transaction de l'écriture : si le journal
-- refuse, l'écriture n'a pas lieu. Le nom, l'organisme et les statuts ne
-- sont pas des données privées ; rien d'autre n'y entre.
create or replace function public.journaliser_opportunite()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.journaliser(
      'opportunite',
      null,
      jsonb_build_object(
        'operation', 'retrait', 'nom', old.name, 'organisme', old.organization,
        'statut', old.status
      )
    );
  elsif tg_op = 'INSERT' then
    perform public.journaliser(
      'opportunite',
      null,
      jsonb_build_object(
        'operation', 'ajout', 'nom', new.name, 'organisme', new.organization,
        'statut', new.status
      )
    );
  else
    perform public.journaliser(
      'opportunite',
      null,
      jsonb_build_object(
        'operation', 'modification', 'nom', new.name, 'organisme', new.organization,
        'statut', new.status, 'ancien_statut', old.status
      )
    );
  end if;
  return null;
end;
$$;

revoke all on function public.journaliser_opportunite() from public, anon, authenticated;

create trigger funding_opportunities_journal
  after insert or update or delete on public.funding_opportunities
  for each row
  execute function public.journaliser_opportunite();
