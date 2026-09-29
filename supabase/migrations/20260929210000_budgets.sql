-- Budgets de projet.
--
-- Un budget se compose de lignes de dépense, rangées par poste. Chaque ligne
-- porte un montant prévisionnel (quantité × coût unitaire) et, une fois la
-- dépense engagée, un montant réel : l'écart entre les deux est ce qu'un
-- producteur surveille pendant la fabrication du film.
--
-- Qui voit et modifie le budget :
--   - le porteur et les éditeurs du projet ;
--   - les administrateurs, qui ont accès à tout dans l'application ;
--   - pas les lecteurs : un lecteur peut être un comédien ou un technicien,
--     et les cachets comme les tarifs négociés des autres ne le regardent
--     pas.

-- ---------------------------------------------------------------------------
-- Postes budgétaires
-- ---------------------------------------------------------------------------

-- Inspirés de la structure habituelle d'un devis de film, regroupés pour
-- rester lisibles sur un projet indépendant.
create type public.budget_category as enum (
  'developpement',
  'droits',
  'equipe_technique',
  'interpretation',
  'decors_costumes',
  'materiel',
  'transport_regie',
  'postproduction',
  'assurances_divers',
  'promotion_distribution',
  'imprevus'
);

-- ---------------------------------------------------------------------------
-- Budget d'un projet
-- ---------------------------------------------------------------------------

-- Une ligne par projet, qui fixe la devise. Les lignes de dépense s'y
-- rattachent : impossible de saisir un montant sans savoir dans quelle
-- monnaie il est exprimé.
create table public.project_budgets (
  project_id uuid primary key references public.projects (id) on delete cascade,
  currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Code ISO 4217. La liste proposée vit dans l'application ; la base ne
  -- contrôle que la forme, pour ne pas figer ici une liste de monnaies.
  constraint currency_iso check (currency ~ '^[A-Z]{3}$')
);

comment on table public.project_budgets is
  'Budget d''un projet : sa devise. Visible et modifiable par le porteur, les éditeurs et les administrateurs ; jamais par les lecteurs.';

alter table public.project_budgets enable row level security;

create trigger project_budgets_avant_update
  before update on public.project_budgets
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Lignes de dépense
-- ---------------------------------------------------------------------------

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_budgets (project_id) on delete cascade,
  category public.budget_category not null,
  label text not null,
  quantity numeric(12, 2) not null default 1,
  unit_cost numeric(14, 2) not null,
  -- Calculé par la base : le total affiché ne peut pas diverger de ses
  -- composantes, quelle que soit la façon dont la ligne a été écrite.
  total numeric(16, 2) generated always as (round(quantity * unit_cost, 2)) stored,
  actual_amount numeric(16, 2),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint label_non_vide check (char_length(btrim(label)) between 1 and 200),
  constraint quantite_positive check (quantity > 0),
  constraint cout_unitaire_positif check (unit_cost >= 0),
  constraint montant_reel_positif check (actual_amount is null or actual_amount >= 0)
);

comment on column public.budget_lines.actual_amount is
  'Montant réellement dépensé. Nul tant que la dépense n''est pas engagée : zéro signifierait une dépense gratuite, ce qui n''est pas la même chose.';

-- Le budget s'affiche toujours projet par projet, groupé par poste.
create index budget_lines_project_id_category_idx
  on public.budget_lines (project_id, category);

alter table public.budget_lines enable row level security;

create trigger budget_lines_avant_update
  before update on public.budget_lines
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

-- Porteur, éditeur ou administrateur : les trois seuls à qui le budget
-- s'ouvre. Une fonction plutôt qu'une condition recopiée dans huit
-- politiques : la règle ne peut pas diverger d'une politique à l'autre.
--
-- Pas de `security definer` : elle n'appelle que des fonctions qui le sont
-- déjà, et s'exécute donc sans privilège propre.
create or replace function public.peut_gerer_budget(p_project_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.acces_au_projet(p_project_id) in ('owner', 'editor')
      or public.is_admin();
$$;

revoke all on function public.peut_gerer_budget(uuid) from public, anon;
grant execute on function public.peut_gerer_budget(uuid) to authenticated;

create policy "Le budget s'ouvre au porteur, aux éditeurs et aux administrateurs"
  on public.project_budgets for select
  to authenticated
  using (public.peut_gerer_budget(project_id));

create policy "Ouverture du budget"
  on public.project_budgets for insert
  to authenticated
  with check (public.peut_gerer_budget(project_id));

create policy "Changement de devise"
  on public.project_budgets for update
  to authenticated
  using (public.peut_gerer_budget(project_id))
  with check (public.peut_gerer_budget(project_id));

-- Pas de suppression du budget lui-même : il disparaît avec le projet. Vider
-- un budget se fait ligne par ligne.

create policy "Lecture des lignes"
  on public.budget_lines for select
  to authenticated
  using (public.peut_gerer_budget(project_id));

create policy "Ajout de lignes"
  on public.budget_lines for insert
  to authenticated
  with check (
    public.peut_gerer_budget(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification des lignes"
  on public.budget_lines for update
  to authenticated
  using (public.peut_gerer_budget(project_id))
  with check (public.peut_gerer_budget(project_id));

create policy "Suppression des lignes"
  on public.budget_lines for delete
  to authenticated
  using (public.peut_gerer_budget(project_id));

-- ---------------------------------------------------------------------------
-- Privilèges par colonne
-- ---------------------------------------------------------------------------

-- Les politiques disent quelles lignes on peut toucher, pas quelles colonnes.
-- Réécrire project_id déplacerait une dépense vers un autre projet ;
-- réécrire created_by en attribuerait la saisie à quelqu'un d'autre. Seul le
-- contenu d'une ligne se modifie. Pour le budget, seule la devise.
revoke all on table public.project_budgets from anon;
revoke all on table public.budget_lines from anon;

revoke update on table public.project_budgets from authenticated;
grant update (currency) on table public.project_budgets to authenticated;

revoke update on table public.budget_lines from authenticated;
grant update (category, label, quantity, unit_cost, actual_amount)
  on table public.budget_lines to authenticated;
