-- Opportunités : la date à laquelle une opportunité devient vérifiée (lot W2).
--
-- L'alerte « nouvelle opportunité » avait été écartée du lot W1 : la base ne
-- gardait pas la date à laquelle une opportunité devient visible des comptes.
-- `updated_at` ne la dit pas — corriger une faute de frappe la changerait.
--
-- Cette migration ajoute `verified_at`, posée par la base et par elle seule :
--   - à l'instant où le statut devient « vérifiée », à la création comme à la
--     modification ;
--   - de nouveau si l'opportunité quitte ce statut puis y revient — elle
--     redevient alors visible, et c'est bien une nouvelle ;
--   - jamais par l'écran : la colonne n'est accordée ni en insertion ni en
--     modification, et le déclencheur écrase ce qu'on lui remettrait.
--
-- Les opportunités déjà vérifiées restent sans date : on ne sait pas quand
-- elles le sont devenues, et l'inventer les ferait passer pour nouvelles.
--
-- Aucune politique ne change : la colonne se lit comme le reste de la ligne,
-- donc des comptes pour une opportunité vérifiée ou expirée. C'est une date,
-- pas un auteur.
--
-- Retour arrière — aucune opportunité perdue :
--   `drop trigger funding_opportunities_verifiee_le on public.funding_opportunities` ;
--   `drop function public.dater_verification()` ;
--   `alter table public.funding_opportunities drop column verified_at`.

alter table public.funding_opportunities
  add column verified_at timestamptz;

comment on column public.funding_opportunities.verified_at is
  'Instant où le statut est devenu « vérifiée » pour la dernière fois. Posé par la base seule ; nul pour une opportunité vérifiée avant le lot W2, ou jamais vérifiée.';

create or replace function public.dater_verification()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.verified_at := case when new.status = 'verifie' then now() end;
  elsif new.status = 'verifie' and old.status is distinct from 'verifie' then
    new.verified_at := now();
  else
    -- Ni l'écran ni une requête ne réécrivent cette date.
    new.verified_at := old.verified_at;
  end if;
  return new;
end;
$$;

revoke all on function public.dater_verification() from public, anon, authenticated;

create trigger funding_opportunities_verifiee_le
  before insert or update on public.funding_opportunities
  for each row
  execute function public.dater_verification();

-- Les alertes lisent les opportunités vérifiées récemment.
create index funding_opportunities_verifiee_le_idx
  on public.funding_opportunities (verified_at)
  where verified_at is not null;
