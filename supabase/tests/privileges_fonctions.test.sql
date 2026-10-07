-- Droits d'exécution des fonctions `security definer`.
--
-- Une telle fonction s'exécute avec les droits de son propriétaire et
-- contourne la RLS. Chacune doit donc être appelable par qui en a besoin,
-- et par personne d'autre.
--
-- Ces tests lisent le catalogue plutôt que d'appeler l'API : PostgREST
-- n'expose pas les fonctions de déclencheur, si bien qu'un appel par l'API
-- échouerait que le droit soit accordé ou non, et ne prouverait rien.
--
-- Supabase accorde par défaut l'exécution de toute nouvelle fonction à anon
-- et à authenticated. Ces tests sont là pour qu'une fonction ajoutée sans
-- retrait explicite de ces droits fasse échouer la CI.

begin;

select plan(4);

select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
  $$,
  'Aucune fonction security definer n''est exécutable par un visiteur anonyme'
);

select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname not in (
        -- Fonctions appelées par l'application ou par les politiques RLS.
        -- Chacune vérifie elle-même l'identité de l'appelant.
        'is_admin',
        'definir_role',
        'acces_au_projet',
        'email_confirme_courant',
        'equipe_du_projet',
        'mes_invitations',
        'accepter_invitation',
        'refuser_invitation',
        'images_orphelines',
        'role_dans_studio',
        'creer_devis',
        'accepter_devis',
        'annuler_travail',
        'rapprocher_travail_admin',
        'accepter_proposition',
        'ecarter_proposition',
        'accepter_ligne_budget',
        'ecarter_ligne_budget',
        'accepter_jalon_propose',
        'ecarter_jalon_propose',
        'accepter_plan_propose',
        'ecarter_plan_propose',
        'accepter_materiel_propose',
        'ecarter_materiel_propose',
        'accepter_image_proposee',
        'ecarter_image_proposee',
        'accepter_source_proposee',
        'ecarter_source_proposee',
        'demander_veille',
        'accepter_opportunite_proposee',
        'ecarter_opportunite_proposee',
        'definir_cle_fournisseur',
        'retirer_cle_fournisseur'
      )
  $$,
  'Seules les fonctions prévues sont exécutables par un compte connecté'
);

-- Une fonction de déclencheur n'a pas à être appelable directement : le
-- déclencheur l'exécute sans vérifier ce droit, qui ne sert qu'à l'appel
-- direct.
select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
      )
  $$,
  'Aucune fonction de déclencheur security definer n''est appelable directement'
);

-- Le retrait des droits ne doit pas avoir désactivé les déclencheurs
-- eux-mêmes : la création du profil à l'inscription en dépend.
select is(
  (
    select count(*)::int
    from pg_trigger
    where tgname in ('on_auth_user_created', 'profiles_avant_update')
      and tgenabled <> 'D'
  ),
  2,
  'Les déclencheurs de profil restent actifs'
);

select * from finish();

rollback;
