-- Profil professionnel : prénom, nom, pays, ville, profession et type.
--
-- Migration additive : six colonnes sur `profiles`, toutes facultatives. Rien
-- ne change pour les comptes existants, dont le nom affiché reste celui que
-- voient les équipes, les invitations et le journal.
--
-- Aucune politique nouvelle : celles de `profiles` portent sur la ligne
-- entière. Chacun lit et modifie son profil, les administrateurs lisent et
-- modifient tout, et la politique du mode privé s'applique. Ces champs ne
-- sont donc visibles que du titulaire et des administrateurs ; les coéquipiers
-- ne reçoivent toujours que `display_name`, par `equipe_du_projet()`.
--
-- Le journal d'administration s'étend de lui-même : `journaliser_profil()`
-- compare la ligne entière et ne retient que les noms des champs modifiés par
-- un tiers, jamais leurs valeurs.
--
-- La photo n'est pas ici : elle demande un espace de stockage et ses propres
-- politiques.
--
-- Retour arrière — les valeurs saisies seraient perdues :
--   alter table public.profiles
--     drop column first_name, drop column last_name, drop column country,
--     drop column city, drop column profession, drop column profile_type;
--   drop type public.profile_type;

-- ---------------------------------------------------------------------------
-- Type de profil
-- ---------------------------------------------------------------------------

-- Un métier déclaré, pas un droit : aucun accès n'en dépend. Les rôles vivent
-- dans `profiles.role`, `project_members.role` et `studio_members.role`.
create type public.profile_type as enum ('AUTHOR', 'DIRECTOR', 'PRODUCER');

-- ---------------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column first_name text not null default '',
  add column last_name text not null default '',
  -- Code ISO 3166-1 à deux lettres ; nul tant que le pays n'est pas renseigné.
  -- La liste des pays proposés vit dans l'application : la base ne garantit
  -- que la forme.
  add column country text,
  add column city text not null default '',
  add column profession text not null default '',
  add column profile_type public.profile_type;

-- Un compte peut écrire son profil par l'API sans passer par l'écran : les
-- bornes sont donc ici, et pas seulement dans l'action serveur. Aucun
-- caractère de contrôle : ces textes tiennent sur une ligne.
alter table public.profiles
  add constraint first_name_forme
    check (char_length(first_name) <= 80 and first_name !~ '[[:cntrl:]]'),
  add constraint last_name_forme
    check (char_length(last_name) <= 80 and last_name !~ '[[:cntrl:]]'),
  add constraint country_forme
    check (country ~ '^[A-Z]{2}$'),
  add constraint city_forme
    check (char_length(city) <= 120 and city !~ '[[:cntrl:]]'),
  add constraint profession_forme
    check (char_length(profession) <= 120 and profession !~ '[[:cntrl:]]');

comment on column public.profiles.profile_type is
  'Métier déclaré par le titulaire (auteur, réalisateur, producteur). Jamais un rôle d''accès.';
