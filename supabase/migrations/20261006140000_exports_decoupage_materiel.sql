-- Découpage et matériel dans les exports (lot J3c-4).
--
-- Deux sections de plus dans un dossier, en PDF, en Word comme en archive :
-- `decoupage`, les plans de chaque scène du storyboard, et `materiel`, la liste
-- des équipements du tournage. Cochées à l'écran comme les autres.
--
-- Deux sections de plus, et rien d'autre : une demande qui ne les désigne pas
-- garde le même contenu, donc la même empreinte, et un dossier déjà fabriqué
-- reste retrouvé par `export_disponible`.
--
-- Le matériel sort sans besoin électrique (décision de l'utilisateur du 6
-- octobre 2026) : ni charge, ni intensité, ni groupe conseillé. Ce calcul est
-- celui de l'application, il n'est pas certifié, et le refaire ici en créerait
-- un second.
--
-- Aucune table, aucune politique, aucune fonction nouvelles. Les deux
-- fonctions reprises gardent leurs droits : `create or replace` ne les touche
-- pas. `contenu_dossier` reste sans `security definer` : un compte n'en tire
-- que ce que la RLS lui ouvre déjà — le découpage et le matériel se lisent de
-- toute l'équipe et des administrateurs.
--
-- Retour arrière — aucune donnée perdue :
--   rétablir parametres_export et contenu_dossier de la migration
--   20261003031944_exports_fiche. Un export déjà fabriqué avec ces sections
--   reste téléchargeable ; une tâche en attente qui les demande échouerait, et
--   son unité serait rendue.

-- ---------------------------------------------------------------------------
-- Demande : les sections decoupage et materiel
-- ---------------------------------------------------------------------------

-- Reprise de la migration exports_fiche, avec un seul ajout : deux sections.
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
       'synthese', 'fiche_projet', 'budget', 'financements', 'planning', 'decoupage', 'materiel'
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

-- ---------------------------------------------------------------------------
-- Contenu du dossier : les plans de chaque scène, et le matériel
-- ---------------------------------------------------------------------------

-- Reprise de la migration exports_fiche, avec un seul ajout : les blocs
-- `decoupage` et `materiel`.
create or replace function public.contenu_dossier(p_project_id uuid, p_params jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_demande jsonb := public.parametres_export(p_params);
  v_sections text[];
  v_documents text[];
  v_projet public.projects;
  v_contenu jsonb;
begin
  v_sections := array(select jsonb_array_elements_text(v_demande -> 'sections'));
  v_documents := array(select jsonb_array_elements_text(v_demande -> 'documents'));

  select p.* into v_projet from public.projects p where p.id = p_project_id;
  if v_projet.id is null then
    return null;
  end if;

  v_contenu := jsonb_build_object(
    'demande', v_demande,
    'fiche', jsonb_build_object(
      'titre', v_projet.title,
      'format', v_projet.format,
      'etape', v_projet.stage
    )
  );

  if 'synthese' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'synthese', jsonb_build_object('pitch', v_projet.logline, 'synopsis', v_projet.synopsis)
    );
  end if;

  -- Les personnages du seul projet demandé, dans l'ordre de l'écran. Ni leur
  -- auteur, ni leurs dates : rien qui désigne un membre de l'équipe.
  if 'fiche_projet' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'fiche_projet', jsonb_build_object(
        'genre', v_projet.genre,
        'pays', to_jsonb(v_projet.countries),
        'langues', v_projet.languages,
        'duree', v_projet.duration_minutes,
        'synopsis_court', v_projet.short_synopsis,
        'theme', v_projet.theme,
        'enjeux', v_projet.stakes,
        'vision', v_projet.artistic_vision,
        'objectifs', v_projet.goals,
        'public', v_projet.audience,
        'personnages', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('nom', c.name, 'role', c.role, 'description', c.description)
              order by c.position, c.created_at, c.id
            )
            from public.project_characters c
            where c.project_id = p_project_id
          ),
          '[]'::jsonb
        )
      )
    );
  end if;

  -- Finalisés seulement : un brouillon ne part pas dans un dossier par erreur.
  if cardinality(v_documents) > 0 then
    v_contenu := v_contenu || jsonb_build_object(
      'documents', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('type', d.type, 'titre', d.title, 'contenu', d.content)
            order by d.type, d.created_at, d.id
          )
          from public.project_documents d
          where d.project_id = p_project_id
            and d.status = 'finalise'
            and d.type::text = any (v_documents)
        ),
        '[]'::jsonb
      )
    );
  end if;

  -- Le prévisionnel seulement : le réalisé est un suivi interne.
  if 'budget' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'budget', (
        select jsonb_build_object(
          'devise', b.currency,
          'lignes', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'poste', l.category,
                  'libelle', l.label,
                  'quantite', l.quantity,
                  'cout_unitaire', l.unit_cost,
                  'total', l.total
                )
                order by l.category, l.created_at, l.id
              )
              from public.budget_lines l
              where l.project_id = p_project_id
            ),
            '[]'::jsonb
          )
        )
        from public.project_budgets b
        where b.project_id = p_project_id
      )
    );
  end if;

  if 'financements' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'financements', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'organisme', f.funder,
              'programme', f.program,
              'type', f.kind,
              'statut', f.status,
              'devise', f.currency,
              'demande', f.amount_requested,
              'accorde', f.amount_granted,
              'echeance', f.deadline
            )
            order by f.deadline nulls last, f.created_at, f.id
          )
          from public.project_fundings f
          where f.project_id = p_project_id
        ),
        '[]'::jsonb
      )
    );
  end if;

  if 'planning' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'planning', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'titre', m.title,
              'phase', m.phase,
              'debut', m.starts_on,
              'fin', m.due_on,
              'statut', m.status
            )
            order by coalesce(m.starts_on, m.due_on) nulls last, m.due_on nulls last,
                     m.created_at, m.id
          )
          from public.project_milestones m
          where m.project_id = p_project_id
        ),
        '[]'::jsonb
      )
    );
  end if;

  -- Les seules scènes qui ont des plans, dans l'ordre du film ; chaque scène
  -- porte ses plans dans leur ordre. Ni auteur, ni date, ni image.
  if 'decoupage' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'decoupage', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'titre', s.title,
              'decor', s.setting,
              'lieu', s.location,
              'moment', s.time_of_day,
              'plans', (
                select jsonb_agg(
                  jsonb_build_object(
                    'cadrage', p.shot,
                    'focale', p.focal_mm,
                    'angle', p.angle,
                    'mouvement', p.movement,
                    'duree', p.duration_seconds,
                    'description', p.description
                  )
                  order by p.position, p.id
                )
                from public.scene_shots p
                where p.scene_id = s.id
              )
            )
            order by s.position, s.id
          )
          from public.storyboard_scenes s
          where s.project_id = p_project_id
            and exists (select 1 from public.scene_shots p where p.scene_id = s.id)
        ),
        '[]'::jsonb
      )
    );
  end if;

  -- La liste, sans aucun calcul : ni charge, ni intensité, ni groupe conseillé.
  -- Un chiffrage électrique non certifié n'a pas sa place dans un dossier.
  if 'materiel' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'materiel', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'categorie', g.category,
              'designation', g.label,
              'quantite', g.quantity,
              'puissance', g.unit_power_watts
            )
            order by g.category, g.created_at, g.id
          )
          from public.project_gear g
          where g.project_id = p_project_id
        ),
        '[]'::jsonb
      )
    );
  end if;

  return v_contenu;
end;
$$;
