-- WEAVER, lot X1 : note de réalisation, pitch développé, pitch oral — ce que
-- la base en tient, lu au catalogue et vu depuis une session simulée. Le
-- parcours entier, de la demande au document versionné, est éprouvé par
-- tests/worker-realisation-pitch.test.mjs.

begin;

select plan(15);

-- ---------------------------------------------------------------------------
-- Barème
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(distinct row(direction_note, pitch_extended, pitch_oral)::text)
   from public.text_unit_rate_versions),
  array['(3,2,2)'],
  'Chaque version déjà publiée a reçu le prix des trois livrables'
);

select ok(
  (select bool_and(column_default is null) from information_schema.columns
   where table_schema = 'public' and table_name = 'text_unit_rate_versions'
     and column_name in ('direction_note', 'pitch_extended', 'pitch_oral')),
  'Le défaut est retiré : une version publiée doit dire ses prix'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'direction_note', 'insert')
    and has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'pitch_extended', 'insert')
    and has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'pitch_oral', 'insert')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'direction_note', 'select')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'pitch_extended', 'select')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'pitch_oral', 'select')
    and not has_column_privilege('anon', 'public.text_unit_rate_versions', 'pitch_oral', 'insert'),
  'L''administration publie ces prix, la vitrine les lit, un visiteur ne les écrit pas'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, character_list, budget_plan, schedule_plan, shot_list, gear_list, research,
        cultural_context, treatment, bible, screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage)
     values (1, 1, 2, 3, 3, 3, -1, 2, 4, 3, 6, 3, 4, 5, 3, 3, 8, 10, 2, 1, 1) $$,
  '23514', null, 'Un prix négatif pour un pitch est refusé'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        dramatic_analysis, character_list, budget_plan, schedule_plan, shot_list, gear_list, research,
        cultural_context, treatment, bible, screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage)
     values (1, 1, 2, 3, 3, 4, 3, 6, 3, 4, 5, 3, 3, 8, 10, 2, 1, 1) $$,
  '23502', null, 'Une version qui tait ces prix est refusée, au lieu de valoir un défaut'
);

-- ---------------------------------------------------------------------------
-- Actions et types
-- ---------------------------------------------------------------------------

select ok(
  (select pg_get_constraintdef(oid) like '%''direction_note''%'
          and pg_get_constraintdef(oid) like '%''pitch_extended''%'
          and pg_get_constraintdef(oid) like '%''pitch_oral''%'
          -- Rien n'est retiré aux autres.
          and pg_get_constraintdef(oid) like '%''intention_note''%'
          and pg_get_constraintdef(oid) like '%''cultural_context''%'
          and pg_get_constraintdef(oid) like '%''storyboard_image''%'
          and pg_get_constraintdef(oid) like '%''zip_export''%'
   from pg_constraint
   where conname = 'devis_action_connue' and conrelid = 'public.quotes'::regclass),
  'Les devis admettent les trois actions, sans rien retirer aux autres'
);

select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
   from pg_enum e where e.enumtypid = 'public.document_type'::regtype),
  array[
    'pitch_developpe', 'note_intention', 'note_realisation', 'synopsis', 'traitement', 'bible',
    'scenario', 'biographie', 'lettre', 'analyse', 'pitch_oral', 'autre'
  ],
  'Trois types de document de plus, rangés où un dossier les présente'
);

-- ---------------------------------------------------------------------------
-- Les quatre fonctions gardent leurs droits
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.creer_devis(uuid, text, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.accepter_proposition(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.creer_devis(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_proposition(uuid, text)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.accepter_proposition(uuid, text)', 'execute'),
  'Un compte demande un devis et applique une proposition ; ni un visiteur, ni le worker'
);

select ok(
  has_function_privilege('filmfund_worker', 'public.contexte_redaction(uuid)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.livrer_proposition(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.contexte_redaction(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition(uuid, text)', 'execute'),
  'Seul le worker lit le contexte et dépose une proposition'
);

-- Les bornes telles que la base les applique, lues dans les fonctions en
-- place : le worker refuse déjà un texte trop long avant de le déposer, si
-- bien qu'aucun parcours ne dirait que le dépôt a perdu la sienne.
select ok(
  (select bool_and(
     pg_get_functiondef(p.oid) like '%when ''direction_note'' then v_max := 20000;%'
     and pg_get_functiondef(p.oid) like '%when ''pitch_extended'' then v_max := 6000;%'
     and pg_get_functiondef(p.oid) like '%when ''pitch_oral'' then v_max := 6000;%'
   ) and count(*) = 2
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('livrer_proposition', 'accepter_proposition')),
  'Le dépôt comme l''acceptation bornent la note à 20 000 caractères et un pitch à 6 000'
);

-- ---------------------------------------------------------------------------
-- Devis : chaque action se chiffre au barème du studio
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000a7101', 'porteur-realisation@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-0000000e7101', '00000000-0000-0000-0000-0000000a7101', 'Projet du lot X1');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000a7101", "role": "authenticated"}',
  true
);

select is(
  (select row(d.unit, d.quantity)::text
   from public.creer_devis('00000000-0000-0000-0000-0000000e7101', 'direction_note') d),
  '(text,3)', 'Une note de réalisation se chiffre à 3 unités texte'
);

select is(
  (select row(d.unit, d.quantity)::text
   from public.creer_devis('00000000-0000-0000-0000-0000000e7101', 'pitch_extended') d),
  '(text,2)', 'Un pitch développé se chiffre à 2 unités texte'
);

select is(
  (select row(d.unit, d.quantity)::text
   from public.creer_devis('00000000-0000-0000-0000-0000000e7101', 'pitch_oral') d),
  '(text,2)', 'Un pitch oral se chiffre à 2 unités texte'
);

select throws_ok(
  $$ select * from public.creer_devis('00000000-0000-0000-0000-0000000e7101', 'pitch') $$,
  '22023', null, 'Une action qui n''est pas au catalogue reste refusée'
);

reset role;

select is(
  (select count(*)::int from public.quotes q
   where q.project_id = '00000000-0000-0000-0000-0000000e7101'
     and q.action in ('direction_note', 'pitch_extended', 'pitch_oral')
     and q.rate_version_id is not null),
  3,
  'Chaque devis garde la version du barème qui l''a chiffré'
);

select * from finish();

rollback;
