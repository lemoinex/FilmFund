-- Opportunités : la langue, la durée et le stade qu'une opportunité demande
-- (lot OP2), sans IA.
--
-- Le cahier des charges prévoit un filtre par langue, et une compatibilité qui
-- regarde la durée et le stade du projet. Le catalogue ne portait aucune de
-- ces trois choses dans un champ comparable : elles se lisaient, au mieux,
-- dans le texte des exigences.
--
-- Cette migration ajoute quatre colonnes au catalogue :
--   - `languages` : les langues de tournage ou de dossier que l'opportunité
--     demande, dans une liste fermée de cinq ;
--   - `stages` : les stades d'avancement qu'elle admet, ceux d'un projet ;
--   - `duration_min_minutes`, `duration_max_minutes` : la fourchette de durée
--     qu'elle admet, dans les bornes de la durée d'un projet.
--
-- Vides ou nulles, elles veulent dire « la source ne le précise pas » — jamais
-- « toutes les langues », « tout stade » ou « toute durée ». C'est leur valeur
-- par défaut : les opportunités déjà saisies, et celles que la veille fait
-- entrer au catalogue, ne précisent rien.
--
-- Aucune politique ne change : ces colonnes se lisent et s'écrivent comme le
-- reste de la ligne. Les droits d'écriture du catalogue sont accordés colonne
-- par colonne ; ils le sont ici pour ces quatre-là. Le journal d'administration
-- inscrit déjà toute modification d'une opportunité.
--
-- Retour arrière — ce qui emporte ce qui aura été saisi dans ces colonnes :
--   `alter table public.funding_opportunities
--      drop column languages, drop column stages,
--      drop column duration_min_minutes, drop column duration_max_minutes`.

alter table public.funding_opportunities
  add column languages text[] not null default '{}',
  add column stages public.project_stage[] not null default '{}',
  add column duration_min_minutes integer,
  add column duration_max_minutes integer,
  -- Cinq langues, et aucune autre : une autre langue se dit dans les exigences.
  add constraint opportunite_langues check (
    array_position(languages, null) is null
    and languages <@ array['fr', 'en', 'pt', 'ar', 'es']::text[]
  ),
  add constraint opportunite_stades check (
    cardinality(stages) <= 10 and array_position(stages, null) is null
  ),
  -- Les bornes de la durée d'un projet ; une fourchette ne se referme pas à l'envers.
  add constraint opportunite_durees check (
    (duration_min_minutes is null or duration_min_minutes between 1 and 1000)
    and (duration_max_minutes is null or duration_max_minutes between 1 and 1000)
    and (
      duration_min_minutes is null
      or duration_max_minutes is null
      or duration_min_minutes <= duration_max_minutes
    )
  );

comment on column public.funding_opportunities.languages is
  'Langues que l''opportunité demande, parmi fr, en, pt, ar, es. Vide : la source ne le précise pas.';
comment on column public.funding_opportunities.stages is
  'Stades d''avancement que l''opportunité admet. Vide : la source ne le précise pas.';
comment on column public.funding_opportunities.duration_min_minutes is
  'Durée minimale admise, en minutes. Nulle : la source ne la précise pas.';
comment on column public.funding_opportunities.duration_max_minutes is
  'Durée maximale admise, en minutes. Nulle : la source ne la précise pas.';

grant insert (languages, stages, duration_min_minutes, duration_max_minutes)
  on table public.funding_opportunities to authenticated;
grant update (languages, stages, duration_min_minutes, duration_max_minutes)
  on table public.funding_opportunities to authenticated;
