-- Coûts de l'IA : la lecture agrégée de l'écran d'administration (lot Z1).
--
-- Tout est déjà enregistré : chaque appel à un fournisseur laisse une réserve
-- (`provider_charges`, `provider_search_charges`) puis un solde
-- (`provider_charge_settlements`, `provider_search_settlements`). Les
-- administrateurs lisent ces registres sous la RLS ; aucun écran ne les
-- montrait.
--
-- Cette migration ne pose qu'une fonction, qui les additionne par mois, par
-- fournisseur, par profil et par modèle. Elle s'exécute **avec les droits de
-- l'appelant** : la RLS des quatre registres décide de ce qu'elle voit. Un
-- administrateur lit tout ; un compte ordinaire ne lit rien, et reçoit une
-- liste vide. Aucun droit ne change, aucun détail par studio ni par projet ne
-- sort.
--
-- Le mois est le mois civil en UTC, celui du plafond. Le montant « compté »
-- est celui que le plafond additionne — le coût confirmé quand il existe, la
-- réserve sinon — : la somme d'un mois égale `depense_ia_du_mois()`.
--
-- Retour arrière — aucune donnée perdue :
--   `drop function public.couts_ia_par_mois()`.

create or replace function public.couts_ia_par_mois()
returns table (
  mois date,
  fournisseur text,
  profil text,
  modele text,
  appels bigint,
  non_soldes bigint,
  a_rapprocher bigint,
  sans_cout bigint,
  replis bigint,
  jetons_entree bigint,
  jetons_sortie bigint,
  requetes bigint,
  compte numeric,
  dont_reserve numeric
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with appels as (
    -- Textes et images : le modèle retenu est celui qui a répondu, quand il
    -- est connu — un repli peut différer du modèle demandé.
    select
      date_trunc('month', c.created_at at time zone 'utc')::date as mois,
      c.provider as fournisseur,
      c.profile as profil,
      coalesce(s.model, c.model) as modele,
      s.attempt_id is null as non_solde,
      s.attempt_id is not null and s.usd is null as a_rapprocher,
      coalesce(s.usd = 0 and s.input_tokens = 0 and s.output_tokens = 0, false) as sans_cout,
      coalesce(s.fallback, false) as repli,
      coalesce(s.input_tokens, 0)::bigint as jetons_entree,
      coalesce(s.output_tokens, 0)::bigint as jetons_sortie,
      0::bigint as requetes,
      coalesce(s.usd, c.estimated_usd) as compte,
      case when s.usd is null then c.estimated_usd else 0 end as reserve
    from public.provider_charges c
    left join public.provider_charge_settlements s on s.attempt_id = c.attempt_id
    where (c.created_at at time zone 'utc')
      >= date_trunc('month', now() at time zone 'utc') - interval '11 months'

    union all

    -- Recherches : facturées à la requête, sans modèle ni jetons.
    select
      date_trunc('month', c.created_at at time zone 'utc')::date,
      c.provider,
      c.profile,
      null::text,
      s.attempt_id is null,
      s.attempt_id is not null and s.usd is null,
      coalesce(s.usd = 0 and s.requests = 0, false),
      false,
      0::bigint,
      0::bigint,
      coalesce(s.requests, 0)::bigint,
      coalesce(s.usd, c.estimated_usd),
      case when s.usd is null then c.estimated_usd else 0 end
    from public.provider_search_charges c
    left join public.provider_search_settlements s on s.attempt_id = c.attempt_id
    where (c.created_at at time zone 'utc')
      >= date_trunc('month', now() at time zone 'utc') - interval '11 months'
  )
  select
    a.mois,
    a.fournisseur,
    a.profil,
    a.modele,
    count(*),
    count(*) filter (where a.non_solde),
    count(*) filter (where a.a_rapprocher),
    count(*) filter (where a.sans_cout),
    count(*) filter (where a.repli),
    sum(a.jetons_entree)::bigint,
    sum(a.jetons_sortie)::bigint,
    sum(a.requetes)::bigint,
    sum(a.compte),
    sum(a.reserve)
  from appels a
  group by a.mois, a.fournisseur, a.profil, a.modele
  order by a.mois desc, sum(a.compte) desc, a.profil, a.modele nulls last
  -- Douze mois, quelques dizaines de profils et de modèles : très loin de
  -- cette borne, qui n'est là que pour qu'il y en ait une.
  limit 1000;
$$;

comment on function public.couts_ia_par_mois() is
  'Coûts de l''IA des douze derniers mois civils (UTC), par fournisseur, profil et modèle. Sous les droits de l''appelant : la RLS des registres ne laisse lire que les administrateurs.';

revoke all on function public.couts_ia_par_mois() from public, anon, authenticated;
grant execute on function public.couts_ia_par_mois() to authenticated;
