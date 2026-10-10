-- Les épisodes dans les exports (lot SE4) : la section admise, ce qu'elle
-- contient, l'épisode de chaque scénario, et ce que le lot ne change pas pour
-- une demande qui ne désigne ni épisode ni scénario d'épisode.
--
-- La fabrication du dossier par le worker, dans les trois formats, est
-- éprouvée par tests/exports-episodes.test.mjs.

begin;

select plan(21);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000e5c01', 'exports-episodes@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title, format)
values
  ('00000000-0000-0000-0000-0000000e5a01', '00000000-0000-0000-0000-0000000e5c01', 'Série à exporter', 'serie'),
  ('00000000-0000-0000-0000-0000000e5a02', '00000000-0000-0000-0000-0000000e5c01', 'Autre série', 'serie'),
  ('00000000-0000-0000-0000-0000000e5a03', '00000000-0000-0000-0000-0000000e5c01', 'Un film', 'long_metrage');

-- Saisis dans le désordre : c'est le numéro qui range la saison.
insert into public.project_episodes (id, project_id, number, title, summary, duration_minutes)
values
  ('00000000-0000-0000-0000-0000000e5e03', '00000000-0000-0000-0000-0000000e5a01', 3, 'La crue', 'Le fleuve monte.' || E'\n' || 'Tout le village avec lui.', null),
  ('00000000-0000-0000-0000-0000000e5e01', '00000000-0000-0000-0000-0000000e5a01', 1, 'Le filet', 'Awa perd son filet.', 26),
  ('00000000-0000-0000-0000-0000000e5e02', '00000000-0000-0000-0000-0000000e5a01', 2, 'La dette', '', 52),
  ('00000000-0000-0000-0000-0000000e5e09', '00000000-0000-0000-0000-0000000e5a02', 1, 'Épisode d''ailleurs', 'Ailleurs.', 13);

-- Les scénarios, créés dans un ordre qui n'est pas celui de la saison : celui
-- de l'épisode 3 d'abord, puis le scénario sans épisode, puis l'épisode 1.
insert into public.project_documents (id, project_id, type, title, content, status, episode_id, created_at)
values
  ('00000000-0000-0000-0000-0000000e5d03', '00000000-0000-0000-0000-0000000e5a01', 'scenario', 'Un titre que l''équipe a changé', 'EXT. FLEUVE', 'finalise', '00000000-0000-0000-0000-0000000e5e03', '2026-10-01 10:00+00'),
  ('00000000-0000-0000-0000-0000000e5d00', '00000000-0000-0000-0000-0000000e5a01', 'scenario', 'Scénario général', 'EXT. ROUTE', 'finalise', null, '2026-10-02 10:00+00'),
  ('00000000-0000-0000-0000-0000000e5d01', '00000000-0000-0000-0000-0000000e5a01', 'scenario', 'Scénario — épisode 1', 'EXT. BERGE', 'finalise', '00000000-0000-0000-0000-0000000e5e01', '2026-10-03 10:00+00'),
  ('00000000-0000-0000-0000-0000000e5d02', '00000000-0000-0000-0000-0000000e5a01', 'scenario', 'Brouillon de l''épisode 2', 'INT. MARCHÉ', 'brouillon', '00000000-0000-0000-0000-0000000e5e02', '2026-10-04 10:00+00'),
  ('00000000-0000-0000-0000-0000000e5d10', '00000000-0000-0000-0000-0000000e5a01', 'note_intention', 'Note d''intention', 'Pourquoi cette série.', 'finalise', null, '2026-10-05 10:00+00');

create function pg_temp.dossier(p_demande jsonb) returns jsonb language sql stable as $$
  select public.contenu_dossier('00000000-0000-0000-0000-0000000e5a01', p_demande);
$$;

-- ---------------------------------------------------------------------------
-- Droits : reprendre une fonction ne doit rien ouvrir
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.parametres_export(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.parametres_export(jsonb)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.parametres_export(jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.contenu_dossier(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.contenu_dossier(uuid, jsonb)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.contenu_dossier(uuid, jsonb)', 'execute'),
  'Les deux fonctions gardent leurs droits : les comptes, ni visiteur ni worker'
);

select is(
  (
    select array_agg(p.proname::text || ' ' || p.prosecdef::text || ' ' || p.proconfig::text order by p.proname)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('parametres_export', 'contenu_dossier')
  ),
  array[
    'contenu_dossier false {"search_path=pg_catalog, public"}',
    'parametres_export false {"search_path=pg_catalog, public"}'
  ],
  'Une seule définition de chacune, sous les droits de l''appelant, au chemin de recherche fermé'
);

-- ---------------------------------------------------------------------------
-- Demande
-- ---------------------------------------------------------------------------

select is(
  public.parametres_export('{"sections": ["materiel", "episodes", "synthese", "episodes"]}'),
  '{"sections": ["episodes", "materiel", "synthese"], "documents": []}'::jsonb,
  'La section des épisodes est admise, rangée et dédoublée comme les autres'
);

select throws_ok(
  $$ select public.parametres_export('{"sections": ["episode"]}') $$,
  '22023', null, 'Une section inconnue reste refusée'
);

select is(
  public.parametres_export('{"sections": ["budget", "decoupage", "materiel"]}'),
  '{"sections": ["budget", "decoupage", "materiel"], "documents": []}'::jsonb,
  'Une demande d''avant le lot est rendue à l''identique'
);

-- ---------------------------------------------------------------------------
-- La saison
-- ---------------------------------------------------------------------------

select is(
  pg_temp.dossier('{"sections": ["episodes"]}') -> 'episodes',
  '[
    {"numero": 1, "titre": "Le filet", "duree": 26, "resume": "Awa perd son filet."},
    {"numero": 2, "titre": "La dette", "duree": 52, "resume": ""},
    {"numero": 3, "titre": "La crue", "duree": null, "resume": "Le fleuve monte.\nTout le village avec lui."}
  ]'::jsonb,
  'La saison est rendue dans l''ordre de ses numéros, résumés entiers, durée absente comprise'
);

select ok(
  pg_temp.dossier('{"sections": ["episodes"]}')::text !~ 'created_by|created_at|updated_at|exemple\.test|0000000e5',
  'Ni auteur, ni date, ni identifiant dans la saison'
);

select is(
  pg_temp.dossier('{"sections": ["synthese", "fiche_projet"]}') ? 'episodes',
  false,
  'Une section non demandée n''est pas rendue'
);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000e5a02', '{"sections": ["episodes"]}') -> 'episodes',
  '[{"numero": 1, "titre": "Épisode d''ailleurs", "duree": 13, "resume": "Ailleurs."}]'::jsonb,
  'Chaque projet a sa propre saison'
);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000e5a03', '{"sections": ["episodes"]}') -> 'episodes',
  '[]'::jsonb,
  'Un film n''a pas d''épisodes : la liste est vide, sans erreur'
);

-- Toute la saison part : la borne est celle d'un numéro, pas une troncature.
insert into public.project_episodes (project_id, number, title)
select '00000000-0000-0000-0000-0000000e5a02', n, 'Épisode ' || n from generate_series(2, 130) n;

select is(
  jsonb_array_length(
    public.contenu_dossier('00000000-0000-0000-0000-0000000e5a02', '{"sections": ["episodes"]}') -> 'episodes'
  ),
  130,
  'Une saison de plus de cent épisodes part entière'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.contenu_dossier(uuid, jsonb)'::regprocedure)
    ~ 'order by e\.number\s+limit 500',
  'La lecture de la saison reste bornée, à la borne d''un numéro'
);

-- ---------------------------------------------------------------------------
-- Les scénarios d'épisode
-- ---------------------------------------------------------------------------

select is(
  (
    select jsonb_agg(jsonb_build_array(d ->> 'titre', d -> 'episode') order by rang)
    from jsonb_array_elements(pg_temp.dossier('{"documents": ["scenario"]}') -> 'documents')
      with ordinality as t(d, rang)
  ),
  '[
    ["Scénario général", null],
    ["Scénario — épisode 1", 1],
    ["Un titre que l''équipe a changé", 3]
  ]'::jsonb,
  'Les scénarios se rangent sans épisode d''abord, puis par numéro, quel que soit leur ordre de création'
);

select is(
  (pg_temp.dossier('{"documents": ["scenario"]}') -> 'documents' -> 2 ->> 'episode')::integer,
  3,
  'Le numéro vient du lien du document, pas de son titre'
);

select ok(
  pg_temp.dossier('{"documents": ["scenario"]}')::text !~ 'INT\. MARCHÉ|Brouillon',
  'Le scénario en brouillon d''un épisode ne part pas'
);

select is(
  (
    select array_agg(k order by k)
    from jsonb_object_keys(pg_temp.dossier('{"documents": ["scenario"]}') -> 'documents' -> 0) k
  ),
  array['contenu', 'titre', 'type'],
  'Un document sans épisode garde exactement sa forme d''avant : aucune clé de plus'
);

select is(
  pg_temp.dossier('{"documents": ["note_intention"]}') -> 'documents',
  '[{"type": "note_intention", "titre": "Note d''intention", "contenu": "Pourquoi cette série."}]'::jsonb,
  'Un autre type de document n''est pas touché'
);

select ok(
  pg_temp.dossier('{"documents": ["scenario"]}')::text !~ '0000000e5e0|episode_id',
  'Aucun identifiant d''épisode ne part dans le dossier'
);

-- Épisode retiré : le scénario reste, sans épisode, et reprend sa place.
delete from public.project_episodes where id = '00000000-0000-0000-0000-0000000e5e03';

select is(
  (
    select jsonb_agg(jsonb_build_array(d ->> 'titre', d -> 'episode') order by rang)
    from jsonb_array_elements(pg_temp.dossier('{"documents": ["scenario"]}') -> 'documents')
      with ordinality as t(d, rang)
  ),
  '[
    ["Un titre que l''équipe a changé", null],
    ["Scénario général", null],
    ["Scénario — épisode 1", 1]
  ]'::jsonb,
  'Épisode retiré : son scénario redevient un scénario sans épisode, rangé par date de création'
);

-- ---------------------------------------------------------------------------
-- Ce que le lot ne change pas
-- ---------------------------------------------------------------------------

select is(
  public.empreinte_contenu(
    public.contenu_dossier('00000000-0000-0000-0000-0000000e5a03', '{"sections": ["synthese", "fiche_projet"], "documents": ["scenario"]}')
  ),
  public.empreinte_contenu(
    jsonb_build_object(
      'demande', '{"sections": ["fiche_projet", "synthese"], "documents": ["scenario"]}'::jsonb,
      'fiche', jsonb_build_object('titre', 'Un film', 'format', 'long_metrage', 'etape', (select stage from public.projects where id = '00000000-0000-0000-0000-0000000e5a03')),
      'synthese', jsonb_build_object('pitch', '', 'synopsis', ''),
      'fiche_projet', public.contenu_dossier('00000000-0000-0000-0000-0000000e5a03', '{"sections": ["fiche_projet"]}') -> 'fiche_projet',
      'documents', '[]'::jsonb
    )
  ),
  'Le dossier d''un film garde la forme qu''il avait : son empreinte ne dépend pas du lot'
);

select is(
  (
    select array_agg(p.proname::text || ' ' || p.provolatile::text order by p.proname)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('parametres_export', 'contenu_dossier')
  ),
  array['contenu_dossier s', 'parametres_export s'],
  'Les deux fonctions restent stables : composer un dossier n''écrit rien'
);

select * from finish();

rollback;
