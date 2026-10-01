-- Catalogue public : la vitrine lit l'offre en base.
--
-- Décision de l'utilisateur (1er octobre 2026) : la page d'accueil affiche
-- la dernière version publiée de chaque plan, lue en base. Une seule source
-- de vérité, modifiable depuis « Plans et quotas » ; aucun prix recopié dans
-- le code.
--
-- Seules les colonnes de l'offre sont ouvertes aux visiteurs. Restent
-- fermés : l'identifiant d'une version et son auteur (un administrateur),
-- les abonnements des studios, et toute écriture.
--
-- La politique restrictive du mode privé vise les comptes connectés : elle
-- ne s'applique pas ici, et c'est voulu — l'offre est publique, comme la
-- vitrine qui l'affiche.
--
-- Retour arrière : retirer les deux politiques et les droits accordés à anon.

create policy "Les visiteurs lisent les plans"
  on public.plans for select
  to anon
  using (true);

create policy "Les visiteurs lisent les versions de plan"
  on public.plan_versions for select
  to anon
  using (true);

grant select (code, name, position) on table public.plans to anon;

grant select (
  plan_code,
  version_number,
  max_projects,
  max_members,
  storage_mb,
  text_units_per_month,
  images_per_month,
  pdf_exports_per_month,
  price_xaf_per_month,
  published_at
) on table public.plan_versions to anon;
