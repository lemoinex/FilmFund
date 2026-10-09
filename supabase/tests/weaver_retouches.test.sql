-- WEAVER : retouches d'un passage (lot RT1) — ce que la suite d'API ne voit
-- pas : les privilèges des deux fonctions, le barème et sa contrainte, les
-- actions admises au devis, et le contrôle du passage vu depuis le
-- propriétaire de la base.

begin;

select plan(19);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000a7101', 'retouche-porteur@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-0000000a71a1', '00000000-0000-0000-0000-0000000a7101', 'Projet à retoucher'),
  ('00000000-0000-0000-0000-0000000a71a2', '00000000-0000-0000-0000-0000000a7101', 'Autre projet');

insert into public.project_documents (id, project_id, type, title, content)
values
  ('00000000-0000-0000-0000-0000000a71d1', '00000000-0000-0000-0000-0000000a71a1', 'note_intention', 'Note',
   'Avant. Le passage à retoucher. Après.'),
  ('00000000-0000-0000-0000-0000000a71d2', '00000000-0000-0000-0000-0000000a71a1', 'scenario', 'Scénario',
   'Avant. Le passage à retoucher. Après.');

-- Paramètres d'une demande pour « Le passage à retoucher. » : 7 caractères
-- le précèdent, il en compte 23.
create function pg_temp.demande(p_document text, p_passage text default 'Le passage à retoucher.')
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'document', p_document, 'debut', 7, 'longueur', 23, 'empreinte', md5(p_passage)
  );
$$;

-- ---------------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.contexte_retouche(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.contexte_retouche(uuid)', 'execute'),
  'Le contexte d''une retouche ne s''appelle pas par l''API'
);

select ok(
  has_function_privilege('filmfund_worker', 'public.contexte_retouche(uuid)', 'execute'),
  'Le worker lit le contexte d''une retouche'
);

select ok(
  not has_function_privilege('anon', 'public.passage_du_document(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.passage_du_document(uuid, jsonb)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.passage_du_document(uuid, jsonb)', 'execute'),
  'Le contrôle du passage est interne : ni comptes, ni worker'
);

select is(
  (
    select count(*)::int from pg_proc
    where oid = 'public.passage_du_document(uuid, jsonb)'::regprocedure and not prosecdef
  ),
  1,
  'Le contrôle du passage n''élève aucun droit par lui-même'
);

select is(public.contexte_retouche('00000000-0000-0000-0000-000000000000'), null,
  'Un essai inconnu n''a pas de contexte');

-- ---------------------------------------------------------------------------
-- Barème
-- ---------------------------------------------------------------------------

select ok(
  has_column_privilege('anon', 'public.text_unit_rate_versions', 'text_edit_per_passage', 'select'),
  'La vitrine lit le prix d''une retouche'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'text_edit_per_passage', 'insert')
    and not has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'text_edit_per_passage', 'update'),
  'Le prix d''une retouche se publie avec une version, et ne se réécrit pas'
);

select is(
  (select count(*)::int from public.text_unit_rate_versions where text_edit_per_passage <> 1),
  0,
  'Les versions déjà publiées valent une unité par retouche'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, character_list, episode_list, budget_plan, schedule_plan, shot_list, gear_list, research,
        cultural_context, treatment, bible, screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage)
     values (1, 1, 2, 3, 3, 3, 2, 2, 4, 3, 3, 6, 3, 4, 5, 3, 3, 8, 10, 2, 1, -1) $$,
  '23514', null, 'Un prix négatif pour une retouche est refusé'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, character_list, episode_list, budget_plan, schedule_plan, shot_list, gear_list, research,
        cultural_context, treatment, bible, screenplay_per_sequence, dialogue_per_scene)
     values (1, 1, 2, 3, 3, 3, 2, 2, 4, 3, 3, 6, 3, 4, 5, 3, 3, 8, 10, 2, 1) $$,
  '23502', null, 'Une version qui tait ce prix est refusée, au lieu de valoir un défaut'
);

-- ---------------------------------------------------------------------------
-- Actions admises au devis
-- ---------------------------------------------------------------------------

select ok(
  (
    select pg_get_constraintdef(oid) like '%''text_improve''%'
       and pg_get_constraintdef(oid) like '%''text_shorten''%'
       and pg_get_constraintdef(oid) like '%''text_expand''%'
       and pg_get_constraintdef(oid) like '%''text_correct''%'
       and pg_get_constraintdef(oid) like '%''dialogue''%'
       and pg_get_constraintdef(oid) like '%''character_list''%'
    from pg_constraint
    where conrelid = 'public.quotes'::regclass and conname = 'devis_action_connue'
  ),
  'Le devis admet les quatre retouches, sans perdre les actions déjà en place'
);

-- ---------------------------------------------------------------------------
-- Le passage désigné
-- ---------------------------------------------------------------------------

select is(
  public.passage_du_document('00000000-0000-0000-0000-0000000a71a1',
    pg_temp.demande('00000000-0000-0000-0000-0000000a71d1')),
  'Le passage à retoucher.',
  'Le passage désigné est rendu tel qu''il est écrit'
);

select is(
  public.passage_du_document('00000000-0000-0000-0000-0000000a71a1',
    pg_temp.demande('00000000-0000-0000-0000-0000000a71d2')),
  'Le passage à retoucher.',
  'Un scénario se retouche comme un autre document'
);

select is(
  public.passage_du_scenario('00000000-0000-0000-0000-0000000a71a1',
    pg_temp.demande('00000000-0000-0000-0000-0000000a71d1')),
  null,
  'Les dialogues restent réservés au scénario : leur contrôle n''a pas changé'
);

select is(
  public.passage_du_document('00000000-0000-0000-0000-0000000a71a2',
    pg_temp.demande('00000000-0000-0000-0000-0000000a71d1')),
  null,
  'Le document d''un autre projet n''est pas rendu'
);

select is(
  public.passage_du_document('00000000-0000-0000-0000-0000000a71a1',
    pg_temp.demande('00000000-0000-0000-0000-0000000a71d1', 'Un autre texte.')),
  null,
  'Une empreinte qui n''est pas celle du passage ne rend rien'
);

-- Un document assez long pour porter un passage de plus de 6 000 caractères :
-- sur un texte court, la borne ne se distinguerait pas d'un passage hors du texte.
insert into public.project_documents (id, project_id, type, title, content)
values ('00000000-0000-0000-0000-0000000a71d3', '00000000-0000-0000-0000-0000000a71a1', 'traitement',
        'Traitement', repeat('a', 7000));

select is(
  char_length(public.passage_du_document('00000000-0000-0000-0000-0000000a71a1',
    jsonb_build_object('document', '00000000-0000-0000-0000-0000000a71d3', 'debut', 0,
                       'longueur', 6000, 'empreinte', md5(repeat('a', 6000))))),
  6000,
  'Un passage de 6 000 caractères est rendu'
);

select is(
  public.passage_du_document('00000000-0000-0000-0000-0000000a71a1',
    jsonb_build_object('document', '00000000-0000-0000-0000-0000000a71d3', 'debut', 0,
                       'longueur', 6001, 'empreinte', md5(repeat('a', 6001)))),
  null,
  'Un passage de 6 001 caractères, bien désigné, ne rend rien'
);

update public.project_documents set content = 'Ajout. ' || content
where id = '00000000-0000-0000-0000-0000000a71d1';

select is(
  public.passage_du_document('00000000-0000-0000-0000-0000000a71a1',
    pg_temp.demande('00000000-0000-0000-0000-0000000a71d1')),
  null,
  'Le document a changé à cet endroit : le passage n''est plus rendu'
);

select * from finish();
rollback;
