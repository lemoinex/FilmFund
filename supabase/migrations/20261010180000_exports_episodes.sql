-- Exports : les épisodes d'une série dans le dossier (lot SE4).
--
-- Une série a ses épisodes (lot SE1) et un scénario par épisode (lot SE3a),
-- mais le dossier exporté n'en disait rien : ni la saison, ni de quel épisode
-- est un scénario — rangé par date de création, l'épisode 3 pouvait y
-- précéder l'épisode 1.
--
-- Cette migration ne change aucun schéma. Elle reprend deux fonctions :
--
--   1. `parametres_export` admet une huitième section, `episodes` ;
--   2. `contenu_dossier` rend la saison — numéro, titre, durée, résumé —, et
--      chaque scénario d'épisode avec son numéro, rangé à sa place.
--
-- Décisions du 10 octobre 2026 :
--   - la section est admise pour tout projet : un film n'a pas d'épisodes, la
--     liste est vide et le dossier l'omet, comme toute section vide. L'écran
--     ne la propose qu'aux séries ;
--   - les résumés partent entiers ;
--   - un document sans épisode garde sa forme : l'empreinte des dossiers déjà
--     fabriqués ne change pas, et aucun n'est refait pour rien.
--
-- Les droits des deux fonctions ne changent pas : `create or replace` les
-- garde. Le dossier reste lisible de qui gère le budget ; les épisodes se
-- lisent déjà de toute l'équipe.
--
-- Retour arrière — aucune donnée n'est touchée :
--   rétablir parametres_export et contenu_dossier de la migration
--   20261006140000_exports_decoupage_materiel.

-- ---------------------------------------------------------------------------
-- Demande : une section de plus
-- ---------------------------------------------------------------------------

-- Même fonction qu'au lot J3c-4, la section des épisodes en plus.
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
       'synthese', 'fiche_projet', 'episodes', 'budget', 'financements', 'planning',
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

-- ---------------------------------------------------------------------------
-- Contenu : la saison, et l'épisode de chaque scénario
-- ---------------------------------------------------------------------------

-- Même fonction qu'au lot J3c-4, la saison et le numéro d'épisode en plus.
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

  -- La saison d'une série, entière, dans l'ordre de ses numéros : cinq cents
  -- épisodes au plus, la borne que la base tient pour un numéro — un dossier
  -- ne tait pas la fin d'une saison. Ni auteur, ni dates. Un
  -- projet qui n'est pas une série n'a pas d'épisodes : la liste est vide, et
  -- le dossier omet une section vide.
  if 'episodes' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'episodes', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'numero', t.number,
              'titre', t.title,
              'duree', t.duration_minutes,
              'resume', t.summary
            )
            order by t.number
          )
          from (
            select e.* from public.project_episodes e
            where e.project_id = p_project_id
            order by e.number
            limit 500
          ) t
        ),
        '[]'::jsonb
      )
    );
  end if;

  -- Finalisés seulement : un brouillon ne part pas dans un dossier par erreur.
  -- Le scénario d'un épisode dit son numéro, lu par le lien du document et
  -- non dans son titre ; les scénarios se rangent sans épisode d'abord, puis
  -- par numéro. Un document sans épisode garde exactement la forme qu'il
  -- avait : l'empreinte d'un dossier déjà fabriqué ne change pas.
  if cardinality(v_documents) > 0 then
    v_contenu := v_contenu || jsonb_build_object(
      'documents', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('type', d.type, 'titre', d.title, 'contenu', d.content)
              || case
                   when e.number is null then '{}'::jsonb
                   else jsonb_build_object('episode', e.number)
                 end
            order by d.type, e.number nulls first, d.created_at, d.id
          )
          from public.project_documents d
          left join public.project_episodes e
            on e.id = d.episode_id and e.project_id = p_project_id
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
