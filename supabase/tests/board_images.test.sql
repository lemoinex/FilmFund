-- BOARD, vignettes proposées (lot K1) : ce que la suite du worker ne voit pas
-- — le second fournisseur au registre des coûts, et les droits lus au
-- catalogue. Le parcours d'une vignette, ses garde-fous et le mode privé sont
-- éprouvés par tests/worker-board.test.mjs, qui mène une vraie tâche jusqu'au
-- dépôt, avec un fournisseur d'images factice.

begin;

select plan(9);

select is(
  (
    select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'cout_fournisseur_connu' and conrelid = 'public.provider_charges'::regclass
  ),
  'CHECK ((provider = ANY (ARRAY[''anthropic''::text, ''openai''::text])))',
  'Le registre des coûts admet deux fournisseurs, et eux seuls'
);

select ok(
  (
    select pg_get_constraintdef(oid) like '%''storyboard_image''%'
       and pg_get_constraintdef(oid) like '%''gear_list''%'
       and pg_get_constraintdef(oid) like '%''zip_export''%'
    from pg_constraint where conname = 'devis_action_connue'
  ),
  'Le devis admet la vignette, sans rien retirer aux autres actions'
);

select ok(
  not has_table_privilege('anon', 'public.ai_suggestion_images', 'select')
    and has_table_privilege('authenticated', 'public.ai_suggestion_images', 'select')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_images', 'insert')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_images', 'update')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_images', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.ai_suggestion_images', 'select'),
  'Les vignettes proposées se lisent, et ne s''écrivent que par leurs fonctions'
);

select ok(
  not has_function_privilege('authenticated', 'public.contexte_image(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_image(uuid, bytea)', 'execute')
    and not has_function_privilege('authenticated', 'public.image_a_decider(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_image_proposee(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.ecarter_image_proposee(uuid)', 'execute'),
  'Le contexte et le dépôt restent au worker ; un visiteur ne décide de rien'
);

-- Le worker ne reçoit aucun droit sur le stockage : c'est l'application, sous
-- la session de qui décide, qui y dépose le fichier.
select ok(
  not has_table_privilege('filmfund_worker', 'storage.objects', 'insert')
    and not has_table_privilege('filmfund_worker', 'storage.objects', 'select')
    and not has_table_privilege('filmfund_worker', 'public.storyboard_scenes', 'update'),
  'Le worker n''écrit ni dans le stockage ni dans le storyboard'
);

select is(public.contexte_image('00000000-0000-0000-0000-000000000000'), null,
  'Sans essai en cours, le contexte de la vignette ne rend rien');

select throws_ok(
  $$ truncate public.ai_suggestion_images $$,
  null, null, 'La table des vignettes proposées ne se vide pas'
);

select is(
  (
    select count(*)::int from pg_constraint
    where conrelid = 'public.ai_suggestion_images'::regclass
      and conname in ('image_proposee_fichier_png', 'image_proposee_de_sa_scene', 'image_proposee_chemin')
  ),
  3,
  'La table borne le fichier à un PNG de 5 Mo, sa scène à son projet, et son chemin à l''acceptation'
);

-- Le quota d'images est celui du plan, distinct du quota texte.
select is(
  (select public.allocation_du_plan(v, 'image') = v.images_per_month from public.plan_versions v limit 1),
  true,
  'Une vignette se compte sur le quota d''images du plan'
);

select * from finish();

rollback;
