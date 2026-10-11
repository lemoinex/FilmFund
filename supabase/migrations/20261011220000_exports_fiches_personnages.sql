-- Les fiches détaillées des personnages dans le dossier exporté (lot PF2).
--
-- Décidé par l'utilisateur le 11 octobre 2026 : une section nouvelle,
-- « Fiches des personnages », à part de la fiche du projet. Un dossier part
-- souvent chez un tiers — un fonds, un coproducteur —, et la fiche détaillée
-- dit l'apparence, les traits et les liens d'un personnage, qui est une
-- personne réelle dans un documentaire : la section ne part que si on la
-- demande, et l'écran la laisse décochée.
--
-- Deux fonctions changent. La première, courte, est redéfinie en entier ; la
-- seconde, longue, reçoit un seul bloc, écrit dans sa définition en place
-- comme au lot PF1 :
--
--   1. `parametres_export` admet la section `fiches_personnages` ;
--   2. `contenu_dossier` la remplit, quand elle est demandée, avec les seuls
--      personnages dont un champ de fiche au moins est rempli. Aucun n'en a :
--      la liste est vide, et le dossier omet la section.
--
-- Chaque fiche porte le nom, le rôle et les champs remplis, sous les noms que
-- les agents lisent déjà. La description n'y est pas redite : le tableau des
-- personnages de la fiche du projet la porte.
--
-- Les champs sont écrits ici, et non par `personnage_pour_agent` :
-- `contenu_dossier` s'exécute aussi sous les droits du compte, pour
-- reconnaître un dossier identique, et cette fonction-là est fermée aux
-- comptes. Le test du lot tient les deux écritures égales.
--
-- **Rien ne change pour un dossier qui ne demande pas la section** : la
-- fiche du projet garde son tableau à trois colonnes, et l'empreinte des
-- dossiers déjà fabriqués ne bouge pas.
--
-- Mêmes droits qu'avant : un dossier se demande et se lit par le porteur, les
-- éditeurs et les administrateurs. Aucune table, colonne ni politique.
--
-- Retour arrière : remettre, dans `parametres_export`, la liste des sections
-- sans `'fiches_personnages'`, et retirer de `contenu_dossier` le bloc
-- « Fiches des personnages ». Un dossier fabriqué avec la section reste
-- lisible : c'est un fichier.

-- 1. La section est admise. La fonction est courte : elle est redéfinie en
-- entier, et le test qui compare les sections de l'écran à celles de la base
-- lit sa liste ici.
create or replace function public.parametres_export(p_params jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_sections text[];
  v_documents text[];
begin
  if jsonb_typeof(p_params) is distinct from 'object'
     or jsonb_typeof(coalesce(p_params -> 'sections', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_params -> 'documents', '[]')) <> 'array' then
    raise exception 'Demande d''export invalide : deux listes sont attendues.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct valeur order by valeur), '{}')
    into v_sections
    from jsonb_array_elements_text(coalesce(p_params -> 'sections', '[]')) as valeur;
  select coalesce(array_agg(distinct valeur order by valeur), '{}')
    into v_documents
    from jsonb_array_elements_text(coalesce(p_params -> 'documents', '[]')) as valeur;

  if not v_sections <@ array[
       'synthese', 'fiche_projet', 'fiches_personnages', 'episodes', 'budget', 'financements', 'planning',
       'decoupage', 'materiel'
     ]
     or not v_documents <@ enum_range(null::public.document_type)::text[] then
    raise exception 'Demande d''export invalide : section ou type de document inconnu.'
      using errcode = '22023';
  end if;

  if cardinality(v_sections) + cardinality(v_documents) = 0 then
    raise exception 'Demande d''export invalide : aucune section demandée.'
      using errcode = '22023';
  end if;

  return jsonb_build_object('sections', to_jsonb(v_sections), 'documents', to_jsonb(v_documents));
end;
$$;

-- 2. La section est remplie, juste avant les documents. `contenu_dossier` est
-- longue : seul le bloc ajouté est écrit, dans sa définition en place.
do $$
declare
  v_definition text;
  v_ancienne text;
  v_nouvelle text;
begin
  v_ancienne := '  -- Finalisés seulement : un brouillon ne part pas dans un dossier par erreur.';
  v_nouvelle := $bloc$  -- Fiches des personnages : les seuls personnages dont un champ de fiche
  -- est rempli, cinquante au plus. La description reste dans la fiche du projet.
  if 'fiches_personnages' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'fiches_personnages', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('nom', t.name, 'role', t.role)
              || jsonb_strip_nulls(
                jsonb_build_object(
                  'age', nullif(btrim(t.age), ''),
                  'occupation', nullif(btrim(t.occupation), ''),
                  'apparence', nullif(btrim(t.appearance), ''),
                  'objectif', nullif(btrim(t.goal), ''),
                  'obstacle', nullif(btrim(t.obstacle), ''),
                  'arc', nullif(btrim(t.arc), ''),
                  'traits', nullif(btrim(t.traits), ''),
                  'liens', nullif(btrim(t.relations), '')
                )
              )
            order by t.position, t.created_at, t.id
          )
          from (
            select c.* from public.project_characters c
            where c.project_id = p_project_id
              and btrim(
                c.age || c.occupation || c.appearance || c.goal
                  || c.obstacle || c.arc || c.traits || c.relations
              ) <> ''
            order by c.position, c.created_at, c.id
            limit 50
          ) t
        ),
        '[]'::jsonb
      )
    );
  end if;

$bloc$ || v_ancienne;
  v_definition := pg_get_functiondef('public.contenu_dossier(uuid, jsonb)'::regprocedure);
  if (length(v_definition) - length(replace(v_definition, v_ancienne, ''))) <> length(v_ancienne) then
    raise exception 'Le repère des documents est introuvable ou en double dans contenu_dossier.';
  end if;
  execute replace(v_definition, v_ancienne, v_nouvelle);
end;
$$;
