-- ARC, fiche d'un personnage proposée (lot PF3a) : ce que la suite du worker
-- ne voit pas — le barème, les droits lus au catalogue, et les garde-fous lus
-- dans les fonctions en place. Le parcours d'une proposition, ses refus et
-- l'acceptation champ par champ sont éprouvés par
-- tests/worker-arc-fiche.test.mjs, qui mène une vraie tâche jusqu'au dépôt.

begin;

select plan(12);

select is(
  (select array_agg(distinct character_sheet) from public.text_unit_rate_versions),
  array[2],
  'Chaque version publiée du barème compte la fiche d''un personnage pour 2 unités'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'character_sheet', 'insert')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'character_sheet', 'select'),
  'L''administration publie la colonne, la vitrine la lit'
);

select is(
  (
    select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'text_unit_rate_versions'
      and column_name = 'character_sheet'
  ),
  null,
  'Une version publiée ensuite doit dire son prix : aucun défaut ne le remplace'
);

select ok(
  (
    select pg_get_constraintdef(oid) like '%''character_sheet''%'
    from pg_constraint where conname = 'devis_action_connue'
  ),
  'Les devis connaissent l''action'
);

select ok(
  not has_table_privilege('anon', 'public.ai_suggestion_character_fields', 'select')
    and has_table_privilege('authenticated', 'public.ai_suggestion_character_fields', 'select')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_character_fields', 'insert')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_character_fields', 'update')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_character_fields', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.ai_suggestion_character_fields', 'select'),
  'Les champs proposés se lisent, et ne s''écrivent que par leurs fonctions ; le worker ne lit aucune table'
);

select is(
  (
    select array_agg(policyname::text || ' [' || cmd || ':' || permissive || ']' order by policyname)
    from pg_policies
    where schemaname = 'public' and tablename = 'ai_suggestion_character_fields'
  ),
  array[
    'L''équipe et les administrateurs lisent ces propositions [SELECT:PERMISSIVE]',
    'Mode privé : administrateurs uniquement [ALL:RESTRICTIVE]'
  ],
  'Deux politiques : la lecture par l''équipe, et le verrou du mode privé'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_suggestion_character_fields'::regclass),
  'La RLS est active sur la table'
);

-- Qui appelle quoi : les comptes décident, le worker lit et dépose, le reste est interne.
select is(
  (
    select array_agg(
      p.proname::text || ':' || has_function_privilege('authenticated', p.oid, 'execute')::text
        || ':' || has_function_privilege('filmfund_worker', p.oid, 'execute')::text
        || ':' || has_function_privilege('anon', p.oid, 'execute')::text
      order by p.proname
    )
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'accepter_champ_propose', 'ecarter_champ_propose', 'contexte_fiche_personnage',
        'livrer_proposition_fiche', 'champ_a_decider', 'clore_proposition_fiche',
        'champs_fiche_personnage', 'champs_vides_personnage', 'personnage_a_completer',
        'controler_champ_propose'
      )
  ),
  array[
    'accepter_champ_propose:true:false:false',
    'champ_a_decider:false:false:false',
    'champs_fiche_personnage:false:false:false',
    'champs_vides_personnage:false:false:false',
    'clore_proposition_fiche:false:false:false',
    'contexte_fiche_personnage:false:true:false',
    'controler_champ_propose:false:false:false',
    'ecarter_champ_propose:true:false:false',
    'livrer_proposition_fiche:false:true:false',
    'personnage_a_completer:false:false:false'
  ],
  'Les comptes acceptent et écartent ; le worker lit le contexte et dépose ; rien d''autre ne s''appelle du dehors'
);

-- Les champs de la base sont ceux de la fiche, avec ses bornes.
select is(
  (select array_agg(f.champ || ':' || f.colonne || ':' || f.borne || ':' || f.ligne order by f.rang)
   from public.champs_fiche_personnage() f),
  array[
    'age:age:60:true', 'occupation:occupation:160:true', 'apparence:appearance:600:false',
    'objectif:goal:600:false', 'obstacle:obstacle:600:false', 'arc:arc:800:false',
    'traits:traits:600:false', 'liens:relations:600:false'
  ],
  'Huit champs, leurs colonnes et leurs bornes'
);

select is(
  (
    select array_agg(f.champ order by f.rang)
    from public.champs_fiche_personnage() f
    join pg_constraint c
      on c.conrelid = 'public.project_characters'::regclass
     and pg_get_constraintdef(c.oid) like '%char_length(' || f.colonne || ') <= ' || f.borne || '%'
  ),
  (select array_agg(f.champ order by f.rang) from public.champs_fiche_personnage() f),
  'Chaque borne est celle que la table des personnages impose'
);

-- Le devis refuse avant toute dépense, et le contexte revérifie avant l'appel.
select ok(
  (select p.prosrc from pg_proc p where p.oid = 'public.creer_devis(uuid, text, jsonb)'::regprocedure)
    ~ 'when ''character_sheet'' then[^;]+format = ''documentaire''[^;]+raise exception'
  and (select p.prosrc from pg_proc p where p.oid = 'public.creer_devis(uuid, text, jsonb)'::regprocedure)
    ~ 'v_quantite := v_bareme\.character_sheet;'
  and (select p.prosrc from pg_proc p where p.oid = 'public.contexte_fiche_personnage(uuid)'::regprocedure)
    ~ 'v_projet\.format = ''documentaire'' then\s+return null;',
  'Un documentaire est refusé au devis, et de nouveau avant l''appel'
);

select ok(
  (select p.prosrc from pg_proc p where p.oid = 'public.ecarter_lignes_restantes()'::regprocedure)
    ~ 'update public\.ai_suggestion_character_fields'
  and (select p.prosrc from pg_proc p where p.oid = 'public.accepter_champ_propose(uuid, text)'::regprocedure)
    ~ 'champs_vides_personnage\(v_personnage\)[^;]+raise exception[^;]+PF002',
  'Écarter la proposition écarte ses champs ; un champ ne s''accepte que s''il est encore vide'
);

select * from finish();

rollback;
