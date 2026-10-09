-- La séquence d'un épisode (lot SE3b) : ce que la suite du worker ne voit pas
-- — les droits des trois fonctions reprises, lus au catalogue, et les règles
-- lues dans les fonctions en place. Le parcours d'une séquence, du devis au
-- scénario de son épisode, est éprouvé par
-- tests/worker-sequence-episode.test.mjs, qui mène de vraies tâches.

begin;

select plan(13);

-- Reprendre une fonction ne doit rien ouvrir : mêmes droits qu'avant le lot.
select ok(
  has_function_privilege('authenticated', 'public.creer_devis(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.creer_devis(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.creer_devis(uuid, text, jsonb)', 'execute'),
  'Le devis reste aux comptes : ni visiteur, ni worker'
);

select ok(
  has_function_privilege('filmfund_worker', 'public.contexte_redaction(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.contexte_redaction(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.contexte_redaction(uuid)', 'execute'),
  'Le contexte d''une rédaction reste au worker seul'
);

select ok(
  has_function_privilege('authenticated', 'public.accepter_proposition(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_proposition(uuid, text)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.accepter_proposition(uuid, text)', 'execute'),
  'L''acceptation reste aux comptes : le worker n''écrit dans aucun document'
);

select is(
  (
    select array_agg(p.proname::text || ' ' || p.prosecdef::text || ' ' || p.proconfig::text order by p.proname)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('creer_devis', 'contexte_redaction', 'accepter_proposition')
  ),
  array[
    'accepter_proposition true {"search_path=pg_catalog, public"}',
    'contexte_redaction true {"search_path=pg_catalog, public"}',
    'creer_devis true {"search_path=pg_catalog, public"}'
  ],
  'Une seule définition de chacune, au chemin de recherche fermé'
);

-- Le devis : l'épisode désigné est un épisode de CE projet.
select ok(
  (select prosrc from pg_proc where oid = 'public.creer_devis(uuid, text, jsonb)'::regprocedure)
    ~ 'e\.id::text = lower\(v_parametres ->> ''episode''\) and e\.project_id = p_project_id',
  'Le devis cherche l''épisode dans le projet de la demande'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.creer_devis(uuid, text, jsonb)'::regprocedure)
    ~ 'jsonb_typeof\(v_parametres -> ''episode''\) is distinct from ''string''',
  'Le devis refuse un épisode qui n''est pas un texte'
);

-- Le contexte : le scénario de l'épisode, et aucun autre scénario d'épisode.
select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_redaction(uuid)'::regprocedure)
    ~ 'and d\.episode_id is not distinct from v_episode\.id',
  'Le contexte vise le scénario de l''épisode — sans épisode, un scénario sans épisode'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_redaction(uuid)'::regprocedure)
    ~ 'e\.id::text = lower\(v_job\.params ->> ''episode''\) and e\.project_id = v_projet\.id'
  and (select prosrc from pg_proc where oid = 'public.contexte_redaction(uuid)'::regprocedure)
    ~ 'if v_episode\.id is null then\s+return null;',
  'Le contexte relit l''épisode dans le projet de la tâche, et ne rend rien s''il a été retiré'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_redaction(uuid)'::regprocedure)
    ~ 'and not \(v_episode\.id is not null and d\.episode_id is not null\)',
  'Pour la séquence d''un épisode, les scénarios des autres épisodes ne partent pas'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_redaction(uuid)'::regprocedure)
    ~ 'left\(t\.summary, 300\)'
  and (select prosrc from pg_proc where oid = 'public.contexte_redaction(uuid)'::regprocedure)
    ~ 'order by e\.number\s+limit 100',
  'La saison transmise est bornée : cent épisodes, le début de chaque résumé'
);

-- L'acceptation : dans le scénario de l'épisode, ou nulle part.
select ok(
  (select prosrc from pg_proc where oid = 'public.accepter_proposition(uuid, text)'::regprocedure)
    ~ 'v_proposition\.action <> ''screenplay'' or d\.episode_id is not distinct from v_episode',
  'La séquence s''ajoute au scénario de son épisode ; les autres livrables ne changent pas'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.accepter_proposition(uuid, text)'::regprocedure)
    ~ 'using errcode = ''SE004'''
  and (select prosrc from pg_proc where oid = 'public.accepter_proposition(uuid, text)'::regprocedure)
    ~ 'and e\.project_id = v_proposition\.project_id',
  'Épisode retiré, ou d''un autre projet : l''acceptation est refusée'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.accepter_proposition(uuid, text)'::regprocedure)
    ~ 'values \(v_proposition\.project_id, v_type, v_titre, v_final, v_episode\)',
  'Le scénario créé par l''acceptation naît rattaché à son épisode'
);

select * from finish();

rollback;
