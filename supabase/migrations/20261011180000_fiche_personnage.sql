-- Fiche détaillée d'un personnage (lot PF1).
--
-- Décidé par l'utilisateur le 11 octobre 2026. Un personnage tenait en trois
-- champs : un nom, un rôle, une description libre. Il en reçoit huit de plus,
-- tous facultatifs : âge, occupation, apparence physique, objectif, obstacle,
-- arc, traits, liens. L'arc est un texte, pas une structure — décision du
-- même jour.
--
-- La description reste : aucun personnage déjà saisi n'est touché, et une
-- fiche détaillée ne remplace rien.
--
-- Mêmes droits qu'avant : toute l'équipe lit ; le porteur, les éditeurs et les
-- administrateurs écrivent. Aucune politique nouvelle. La table n'ouvre la
-- modification que colonne par colonne — un personnage ne change ni de projet
-- ni d'auteur — : les huit colonnes s'ajoutent à cette liste.
--
-- Décidé aussi : les agents lisent la fiche tout de suite. Les quatre
-- fonctions qui leur transmettent les personnages en détail — celles de la
-- rédaction, des dialogues, des épisodes et des personnages proposés —
-- passent par une seule fonction, `personnage_pour_agent`. **Un champ vide
-- n'est pas transmis** : un personnage sans fiche détaillée part exactement
-- comme avant, clé pour clé. Les consignes des agents ne changent pas.
--
-- Ce que cela déplace : dans un documentaire, un personnage est une personne
-- réelle. Ce que l'équipe écrit de son apparence, de ses traits ou de ses
-- liens part chez le fournisseur avec le reste du dossier, comme sa
-- description jusqu'ici. L'écran le dit avant la saisie.
--
-- Hors de ce lot : les exports, le score de maturité et les statistiques ne
-- lisent pas la fiche détaillée ; l'assistant ne la remplit pas.
--
-- Retour arrière — les fiches détaillées saisies seraient perdues. Remettre
-- d'abord, dans les quatre fonctions de contexte, la ligne d'origine à la
-- place de l'appel à `personnage_pour_agent`, puis :
--   drop function public.personnage_pour_agent(public.project_characters);
--   alter table public.project_characters
--     drop column age, drop column occupation, drop column appearance,
--     drop column goal, drop column obstacle, drop column arc,
--     drop column traits, drop column relations;

-- ---------------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------------

-- L'âge est un texte : « la quarantaine », « 17 ans au début du récit ». Âge
-- et occupation tiennent sur une ligne ; les autres admettent des retours à
-- la ligne, comme la description.
alter table public.project_characters
  add column age text not null default '',
  add column occupation text not null default '',
  add column appearance text not null default '',
  add column goal text not null default '',
  add column obstacle text not null default '',
  add column arc text not null default '',
  add column traits text not null default '',
  add column relations text not null default '',
  add constraint personnage_age check (char_length(age) <= 60 and age !~ '[[:cntrl:]]'),
  add constraint personnage_occupation check (
    char_length(occupation) <= 160 and occupation !~ '[[:cntrl:]]'
  ),
  add constraint personnage_apparence check (char_length(appearance) <= 600),
  add constraint personnage_objectif check (char_length(goal) <= 600),
  add constraint personnage_obstacle check (char_length(obstacle) <= 600),
  add constraint personnage_arc check (char_length(arc) <= 800),
  add constraint personnage_traits check (char_length(traits) <= 600),
  add constraint personnage_liens check (char_length(relations) <= 600);

grant update (age, occupation, appearance, goal, obstacle, arc, traits, relations)
  on table public.project_characters to authenticated;

-- ---------------------------------------------------------------------------
-- Ce qu'un agent lit d'un personnage
-- ---------------------------------------------------------------------------

-- Le nom, le rôle et la description, toujours ; puis les champs de la fiche
-- détaillée qui ne sont pas vides. Une seule forme pour tous les agents.
create function public.personnage_pour_agent(p_personnage public.project_characters)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select
    jsonb_build_object(
      'nom', p_personnage.name,
      'role', p_personnage.role,
      'description', p_personnage.description
    )
    || jsonb_strip_nulls(
      jsonb_build_object(
        'age', nullif(btrim(p_personnage.age), ''),
        'occupation', nullif(btrim(p_personnage.occupation), ''),
        'apparence', nullif(btrim(p_personnage.appearance), ''),
        'objectif', nullif(btrim(p_personnage.goal), ''),
        'obstacle', nullif(btrim(p_personnage.obstacle), ''),
        'arc', nullif(btrim(p_personnage.arc), ''),
        'traits', nullif(btrim(p_personnage.traits), ''),
        'liens', nullif(btrim(p_personnage.relations), '')
      )
    );
$$;

comment on function public.personnage_pour_agent(public.project_characters) is
  'Ce qu''un agent lit d''un personnage : nom, rôle, description, et les champs remplis de sa fiche détaillée.';

-- Les fonctions de contexte l'appellent sous les droits de leur propriétaire ;
-- ni les comptes ni le worker n'ont à l'appeler eux-mêmes.
revoke all on function public.personnage_pour_agent(public.project_characters)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Les quatre fonctions de contexte
-- ---------------------------------------------------------------------------

-- Chacune ne change que d'une ligne : celle qui écrit un personnage. Les
-- recopier en entier — la plus longue sert presque tous les livrables
-- d'écriture — exposerait à en modifier une autre par mégarde. La ligne est
-- donc remplacée dans la définition en place, et la migration s'arrête si
-- elle ne s'y trouve pas exactement une fois. Les droits d'exécution, le mode
-- `security definer` et le chemin de recherche suivent la définition.
do $$
declare
  v_cible record;
  v_ancienne text;
  v_definition text;
begin
  for v_cible in
    select *
    from (
      values
        ('contexte_redaction', 'c'),
        ('contexte_dialogue', 'c'),
        ('contexte_personnages', 't'),
        ('contexte_episodes', 't')
    ) as cibles (fonction, alias)
  loop
    v_ancienne := format(
      'jsonb_build_object(''nom'', %1$s.name, ''role'', %1$s.role, ''description'', %1$s.description)',
      v_cible.alias
    );
    v_definition := pg_get_functiondef(format('public.%I(uuid)', v_cible.fonction)::regprocedure);

    if (length(v_definition) - length(replace(v_definition, v_ancienne, '')))
       <> length(v_ancienne) then
      raise exception 'La ligne des personnages est introuvable ou en double dans %.',
        v_cible.fonction;
    end if;

    -- Dans deux de ces fonctions, la ligne vient d'une sous-requête bornée :
    -- elle est remise à son type avant l'appel.
    execute replace(
      v_definition,
      v_ancienne,
      format('public.personnage_pour_agent(%s::public.project_characters)', v_cible.alias)
    );
  end loop;
end;
$$;
