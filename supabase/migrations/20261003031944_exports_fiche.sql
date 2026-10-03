-- Fiche du projet dans les exports (lot M4).
--
-- Décidé par l'utilisateur le 3 octobre 2026 : un dossier, en PDF comme en
-- Word, peut contenir la fiche de l'assistant de création (lot R1) — repères,
-- synopsis court, thème, personnages, enjeux, vision, objectifs, public. Une
-- seule section, `fiche_projet`, cochée à l'écran comme les autres.
--
-- Une section de plus, et rien d'autre : une demande qui ne la désigne pas
-- garde le même contenu, donc la même empreinte, et un dossier déjà fabriqué
-- reste retrouvé par `export_disponible`.
--
-- Aucune table, aucune politique, aucune fonction nouvelles. Les deux
-- fonctions reprises gardent leurs droits : `create or replace` ne les touche
-- pas. `contenu_dossier` reste sans `security definer` : un compte n'en tire
-- que ce que la RLS lui ouvre déjà — la fiche et les personnages se lisent de
-- toute l'équipe et des administrateurs.
--
-- Retour arrière — aucune donnée perdue :
--   rétablir parametres_export et contenu_dossier de la migration
--   20261002181851_exports_pdf. Un export déjà fabriqué avec la fiche reste
--   téléchargeable ; une tâche en attente qui la demande échouerait, et son
--   unité serait rendue.

-- ---------------------------------------------------------------------------
-- Demande : la section fiche_projet
-- ---------------------------------------------------------------------------

-- Reprise de la migration exports_pdf, avec un seul ajout : `fiche_projet`.
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

  if not v_sections <@ array['synthese', 'fiche_projet', 'budget', 'financements', 'planning']
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
-- Contenu du dossier : la fiche et ses personnages
-- ---------------------------------------------------------------------------

-- Reprise de la migration exports_pdf, avec un seul ajout : le bloc
-- `fiche_projet`. La clé `fiche`, elle, reste celle de la page de garde —
-- titre, format, étape —, toujours présente.
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

  return v_contenu;
end;
$$;
