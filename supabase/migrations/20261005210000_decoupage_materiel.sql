-- Découpage technique et matériel (lot J3c-1) : la saisie manuelle, sans IA.
--
-- Cahier des charges : docs/product/CDC_FRAME_GEAR.md. Cette migration pose
-- les données que FRAME et GEAR rempliront ensuite (lots J3c-2 et J3c-3) :
--
--   - `scene_shots` : les plans d'une scène du storyboard. Le cadrage que
--     porte déjà la scène reste son cadrage principal : rien n'est renommé ;
--   - `project_gear` : le matériel du tournage, par projet, avec la puissance
--     de chaque équipement ;
--   - `project_power_settings` : la tension et la marge du groupe électrogène
--     d'un projet. Sans ligne, l'application retient 230 V et 30 % — un choix
--     du lot, pas une norme.
--
-- Aucun calcul n'est stocké : la charge, l'intensité et le groupe conseillé
-- sont recalculés à la lecture, par l'application.
--
-- Mêmes droits que le storyboard : toute l'équipe lit, lecteurs compris ; le
-- porteur, les éditeurs et les administrateurs écrivent (`peut_editer_contenu`),
-- toute intervention d'un administrateur hors de ses projets étant journalisée.
-- Les réglages vivent dans leur propre table plutôt que sur `projects`, qu'un
-- administrateur ne réécrit pas (décision du lot A).
--
-- Une fonction nouvelle, `deplacer_plan`, en `security invoker`.
--
-- Retour arrière — les plans, le matériel et les réglages saisis seraient
-- perdus :
--   drop function public.deplacer_plan(uuid, boolean);
--   drop table public.project_power_settings;
--   drop table public.project_gear;
--   drop table public.scene_shots;
--   drop type public.gear_category;
--   drop type public.shot_movement;
--   drop type public.shot_angle;
--   alter table public.storyboard_scenes drop constraint scene_et_projet;

-- ---------------------------------------------------------------------------
-- Énumérations
-- ---------------------------------------------------------------------------

create type public.shot_angle as enum ('normal', 'plongee', 'contre_plongee');

create type public.shot_movement as enum ('fixe', 'panoramique', 'travelling', 'epaule', 'autre');

create type public.gear_category as enum (
  'image',
  'lumiere',
  'son',
  'machinerie',
  'energie',
  'regie'
);

-- ---------------------------------------------------------------------------
-- Plans d'une scène
-- ---------------------------------------------------------------------------

-- Cible de la clé étrangère composée des plans : un plan porte le projet de
-- sa scène, et la base refuse qu'il en porte un autre.
alter table public.storyboard_scenes
  add constraint scene_et_projet unique (id, project_id);

create table public.scene_shots (
  id uuid primary key default gen_random_uuid(),
  -- Répété depuis la scène : les politiques et le journal d'administration
  -- lisent le projet sur la ligne, comme sur toute table de contenu.
  project_id uuid not null references public.projects (id) on delete cascade,
  scene_id uuid not null,
  position integer not null,
  shot public.shot_type not null,
  focal_mm integer,
  angle public.shot_angle not null default 'normal',
  movement public.shot_movement not null default 'fixe',
  description text not null default '',
  duration_seconds integer,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plan_de_sa_scene foreign key (scene_id, project_id)
    references public.storyboard_scenes (id, project_id) on delete cascade,
  constraint plan_position check (position between 1 and 1000),
  constraint plan_focale check (focal_mm between 1 and 2000),
  constraint plan_description check (char_length(description) <= 500),
  constraint plan_duree check (duration_seconds between 1 and 3600),

  -- Différée, comme pour les scènes : l'échange de deux plans passe par un
  -- état où ils ont brièvement le même rang.
  constraint un_plan_par_position unique (scene_id, position) deferrable initially deferred
);

comment on table public.scene_shots is
  'Plans d''une scène du storyboard : le découpage technique. Lus par toute l''équipe, écrits par le porteur, les éditeurs et les administrateurs.';

comment on column public.scene_shots.position is
  'Rang du plan dans sa scène. Le numéro affiché est calculé à la lecture.';

create index scene_shots_project_id_idx on public.scene_shots (project_id);

alter table public.scene_shots enable row level security;

create trigger scene_shots_avant_update
  before update on public.scene_shots
  for each row
  execute function public.touch_updated_at();

create trigger scene_shots_journal_admin
  before insert or update or delete on public.scene_shots
  for each row
  execute function public.journaliser_intervention_admin();

create policy "L'équipe et les administrateurs lisent le découpage"
  on public.scene_shots for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Création de plans"
  on public.scene_shots for insert
  to authenticated
  with check (
    public.peut_editer_contenu(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification de plans"
  on public.scene_shots for update
  to authenticated
  using (public.peut_editer_contenu(project_id))
  with check (public.peut_editer_contenu(project_id));

create policy "Suppression de plans"
  on public.scene_shots for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.scene_shots
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Un plan ne change ni de projet, ni de scène, ni d'auteur.
revoke all on table public.scene_shots from anon;
revoke update on table public.scene_shots from authenticated;
grant update (position, shot, focal_mm, angle, movement, description, duration_seconds)
  on table public.scene_shots to authenticated;

-- ---------------------------------------------------------------------------
-- Déplacement d'un plan
-- ---------------------------------------------------------------------------

-- Échange le plan avec son voisin dans la scène, dans une seule transaction,
-- sur le modèle de `deplacer_scene`. `security invoker` : la RLS s'applique à
-- chaque requête, la fonction ne donne aucun droit que l'appelant n'a pas.
create or replace function public.deplacer_plan(p_plan_id uuid, p_vers_le_haut boolean)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  plan public.scene_shots;
  voisin public.scene_shots;
  modifies integer;
begin
  select * into plan from public.scene_shots where id = p_plan_id;

  if plan.id is null then
    raise exception 'Plan introuvable.' using errcode = 'P0002';
  end if;

  if p_vers_le_haut then
    select * into voisin from public.scene_shots
    where scene_id = plan.scene_id and position < plan.position
    order by position desc limit 1;
  else
    select * into voisin from public.scene_shots
    where scene_id = plan.scene_id and position > plan.position
    order by position asc limit 1;
  end if;

  -- Déjà en tête ou en fin de scène : rien à faire.
  if voisin.id is null then
    return;
  end if;

  update public.scene_shots set position = voisin.position where id = plan.id;
  get diagnostics modifies = row_count;

  -- La RLS ne lève pas d'erreur sur une modification interdite : elle ne
  -- touche aucune ligne. Un lecteur doit l'apprendre.
  if modifies = 0 then
    raise exception 'Vous n''avez pas le droit de modifier ce découpage.' using errcode = '42501';
  end if;

  update public.scene_shots set position = plan.position where id = voisin.id;
end;
$$;

revoke all on function public.deplacer_plan(uuid, boolean) from public, anon;
grant execute on function public.deplacer_plan(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Matériel
-- ---------------------------------------------------------------------------

create table public.project_gear (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  category public.gear_category not null,
  label text not null,
  quantity integer not null default 1,
  -- En watts. Nulle : puissance non renseignée, l'équipement n'entre pas
  -- dans le calcul et l'écran le dit. Zéro : il ne se branche pas.
  unit_power_watts integer,
  -- Compte-t-il dans la charge en même temps que les autres.
  simultaneous boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint materiel_designation check (
    char_length(btrim(label)) between 1 and 200 and label !~ '[[:cntrl:]]'
  ),
  constraint materiel_quantite check (quantity between 1 and 1000),
  constraint materiel_puissance check (unit_power_watts between 0 and 1000000)
);

comment on table public.project_gear is
  'Matériel du tournage d''un projet. Lu par toute l''équipe, écrit par le porteur, les éditeurs et les administrateurs. Ni marque imposée, ni prix : les prix sont au budget.';

create index project_gear_project_id_category_idx
  on public.project_gear (project_id, category);

alter table public.project_gear enable row level security;

create trigger project_gear_avant_update
  before update on public.project_gear
  for each row
  execute function public.touch_updated_at();

create trigger project_gear_journal_admin
  before insert or update or delete on public.project_gear
  for each row
  execute function public.journaliser_intervention_admin();

create policy "L'équipe et les administrateurs lisent le matériel"
  on public.project_gear for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Création d'équipements"
  on public.project_gear for insert
  to authenticated
  with check (
    public.peut_editer_contenu(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification d'équipements"
  on public.project_gear for update
  to authenticated
  using (public.peut_editer_contenu(project_id))
  with check (public.peut_editer_contenu(project_id));

create policy "Suppression d'équipements"
  on public.project_gear for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.project_gear
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Un équipement ne change ni de projet ni d'auteur.
revoke all on table public.project_gear from anon;
revoke update on table public.project_gear from authenticated;
grant update (category, label, quantity, unit_power_watts, simultaneous)
  on table public.project_gear to authenticated;

-- ---------------------------------------------------------------------------
-- Réglages électriques d'un projet
-- ---------------------------------------------------------------------------

create table public.project_power_settings (
  project_id uuid primary key references public.projects (id) on delete cascade,
  -- Monophasé : l'intensité est la charge divisée par la tension, ce qui ne
  -- vaut pas pour une alimentation triphasée.
  voltage_volts integer not null default 230,
  generator_margin_percent integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reglages_tension check (voltage_volts between 100 and 250),
  constraint reglages_marge check (generator_margin_percent between 0 and 100)
);

comment on table public.project_power_settings is
  'Tension et marge du groupe électrogène retenues pour un projet. Valeurs par défaut choisies par le lot, sans valeur de norme : à faire valider par un chef électricien.';

alter table public.project_power_settings enable row level security;

create trigger project_power_settings_avant_update
  before update on public.project_power_settings
  for each row
  execute function public.touch_updated_at();

create trigger project_power_settings_journal_admin
  before insert or update or delete on public.project_power_settings
  for each row
  execute function public.journaliser_intervention_admin();

create policy "L'équipe et les administrateurs lisent les réglages"
  on public.project_power_settings for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Création des réglages électriques"
  on public.project_power_settings for insert
  to authenticated
  with check (public.peut_editer_contenu(project_id));

create policy "Modification des réglages électriques"
  on public.project_power_settings for update
  to authenticated
  using (public.peut_editer_contenu(project_id))
  with check (public.peut_editer_contenu(project_id));

create policy "Suppression des réglages électriques"
  on public.project_power_settings for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.project_power_settings
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Des réglages ne changent pas de projet.
revoke all on table public.project_power_settings from anon;
revoke update on table public.project_power_settings from authenticated;
grant update (voltage_volts, generator_margin_percent)
  on table public.project_power_settings to authenticated;
