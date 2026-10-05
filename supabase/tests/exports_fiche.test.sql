-- Fiche du projet dans les exports (lot M4) : la section admise, ce qu'elle
-- contient, ce qu'elle ne laisse pas fuir, et son effet sur l'empreinte.
--
-- AUCUN FICHIER RÉEL : le fichier déposé est un en-tête écrit à la main. Le
-- worker est joué sous son rôle. Un plan d'essai évite de toucher au
-- catalogue réel ; la transaction est annulée.

begin;

select plan(24);

-- Les tâches laissées par d'autres suites passeraient avant celle du test.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test de la fiche exportée'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

-- Repères du test, lus sous n'importe quel rôle : ils s'exécutent avec les
-- droits du propriétaire, sans quoi la RLS les rendrait muets.
create function pg_temp.travail(p_cle text) returns uuid language sql stable security definer as $$
  select j.id from public.jobs j
  join public.reservations r on r.id = j.reservation_id
  where r.idempotency_key = p_cle;
$$;

create function pg_temp.essai(p_cle text) returns uuid language sql stable security definer as $$
  select a.id from public.job_attempts a
  join public.jobs j on j.id = a.job_id
  where j.id = pg_temp.travail(p_cle) and a.number = j.attempts;
$$;

create function pg_temp.export(p_cle text) returns uuid language sql stable security definer as $$
  select e.id from public.project_exports e where e.job_id = pg_temp.travail(p_cle);
$$;

-- « PK\x03\x04 » suivi de quelques octets : de quoi passer le contrôle de
-- signature, rien de plus.
create function pg_temp.docx() returns bytea language sql immutable as $$
  select '\x504b0304140000000800'::bytea;
$$;

create temp table lu (repere text, contexte jsonb);
create temp table obtenu (repere text, valeur text);
grant insert, select on lu, obtenu to filmfund_worker;

insert into public.plans (code, name, position) values ('essai_fiche', 'Essai fiche', 504);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_fiche', 5, 1, 0, 10, 0, 5, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000f1c01', 'fiche-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1c03', 'fiche-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1c04', 'fiche-admin@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1c05', 'fiche-etranger@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000f1c04';

update public.studio_subscriptions
set plan_code = 'essai_fiche', period_anchor = now() - interval '3 days'
where studio_id in (
  select id from public.studios
  where personal_owner_id = '00000000-0000-0000-0000-0000000f1c01'
);

-- Le projet du test : une fiche complète, trois personnages saisis dans le
-- désordre.
insert into public.projects (
  id, owner_id, title, format, stage, logline, synopsis,
  genre, countries, languages, duration_minutes, short_synopsis, theme,
  stakes, artistic_vision, goals, audience
)
values (
  '00000000-0000-0000-0000-0000000f1ca1', '00000000-0000-0000-0000-0000000f1c01',
  'Projet fiche', 'documentaire', 'ecriture', 'Le pitch.', 'Le synopsis.',
  'drame', '{CM,SN}', 'Batanga, français', 95, 'Le synopsis court.', 'La transmission',
  'Les enjeux.', 'La vision.', 'Les objectifs.', 'Le public.'
);

insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000f1ca1', '00000000-0000-0000-0000-0000000f1c03', 'viewer');

insert into public.project_characters (project_id, name, role, description, position)
values
  ('00000000-0000-0000-0000-0000000f1ca1', 'Troisième', 'secondaire', '', 3),
  ('00000000-0000-0000-0000-0000000f1ca1', 'Premier', 'principal', 'Pêcheuse.', 1),
  ('00000000-0000-0000-0000-0000000f1ca1', 'Deuxième', 'secondaire', 'Promoteur.', 2);

insert into public.project_budgets (project_id, currency)
values ('00000000-0000-0000-0000-0000000f1ca1', 'XAF');
insert into public.budget_lines (project_id, category, label, quantity, unit_cost)
values ('00000000-0000-0000-0000-0000000f1ca1', 'developpement', 'Écriture', 1, 1000);

-- Le projet d'un autre compte : une fiche vide, et un personnage qui ne doit
-- jamais paraître dans le dossier du premier.
insert into public.projects (id, owner_id, title)
values (
  '00000000-0000-0000-0000-0000000f1cb1', '00000000-0000-0000-0000-0000000f1c05', 'Autre projet'
);

insert into public.project_characters (project_id, name, position)
values ('00000000-0000-0000-0000-0000000f1cb1', 'Intrus', 0);

-- ---------------------------------------------------------------------------
-- Demande : la section fiche_projet
-- ---------------------------------------------------------------------------

select is(
  public.parametres_export('{"sections": ["synthese", "fiche_projet", "fiche_projet"]}'),
  '{"sections": ["fiche_projet", "synthese"], "documents": []}'::jsonb,
  'La section fiche_projet est admise, et rangée comme les autres'
);

select throws_ok(
  $$ select public.parametres_export('{"sections": ["fiche_projet", "storyboard"]}') $$,
  '22023',
  null,
  'Une section inconnue reste refusée'
);

-- ---------------------------------------------------------------------------
-- Contenu : la fiche et ses personnages
-- ---------------------------------------------------------------------------

select is(
  (
    public.contenu_dossier(
      '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'
    ) -> 'fiche_projet'
  ) - 'personnages',
  '{
    "genre": "drame", "pays": ["CM", "SN"], "langues": "Batanga, français", "duree": 95,
    "synopsis_court": "Le synopsis court.", "theme": "La transmission",
    "enjeux": "Les enjeux.", "vision": "La vision.", "objectifs": "Les objectifs.",
    "public": "Le public."
  }'::jsonb,
  'La fiche demandée arrive entière, les pays dans leur ordre'
);

select is(
  (
    select jsonb_agg(p ->> 'nom')
    from jsonb_array_elements(
      public.contenu_dossier(
        '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'
      ) -> 'fiche_projet' -> 'personnages'
    ) p
  ),
  '["Premier", "Deuxième", "Troisième"]'::jsonb,
  'Les personnages suivent leur rang, pas leur ordre de saisie'
);

select is(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'
  ) -> 'fiche_projet' -> 'personnages' -> 0,
  '{"nom": "Premier", "role": "principal", "description": "Pêcheuse."}'::jsonb,
  'Un personnage ne porte que son nom, son rôle et sa description'
);

select ok(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'
  )::text not like '%Intrus%',
  'Aucun personnage d''un autre projet n''entre dans le dossier'
);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["synthese"]}'),
  '{
    "demande": {"sections": ["synthese"], "documents": []},
    "fiche": {"titre": "Projet fiche", "format": "documentaire", "etape": "ecriture"},
    "synthese": {"pitch": "Le pitch.", "synopsis": "Le synopsis."}
  }'::jsonb,
  'Sans la fiche, le contenu d''une demande reste celui d''avant : rien de plus n''y entre'
);

select is(
  (
    public.contenu_dossier(
      '00000000-0000-0000-0000-0000000f1cb1', '{"sections": ["fiche_projet"]}'
    ) -> 'fiche_projet'
  ) - 'personnages',
  '{
    "genre": null, "pays": [], "langues": "", "duree": null, "synopsis_court": "", "theme": "",
    "enjeux": "", "vision": "", "objectifs": "", "public": ""
  }'::jsonb,
  'Une fiche vide arrive vide : c''est le worker qui omet la section'
);

select is(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000f1cb1', '{"sections": ["fiche_projet"]}'
  ) -> 'fiche_projet' -> 'personnages',
  '[{"nom": "Intrus", "role": "secondaire", "description": ""}]'::jsonb,
  'Chaque projet ne remet que ses propres personnages'
);

-- ---------------------------------------------------------------------------
-- Empreinte : sensible à la fiche quand elle est demandée, et alors seulement
-- ---------------------------------------------------------------------------

select set_config(
  'test.avec_fiche',
  public.empreinte_dossier('00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'),
  true
);
select set_config(
  'test.sans_fiche',
  public.empreinte_dossier('00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["synthese"]}'),
  true
);

update public.project_characters
set description = 'Pêcheuse, quarante ans.'
where project_id = '00000000-0000-0000-0000-0000000f1ca1' and name = 'Premier';

select isnt(
  public.empreinte_dossier('00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'),
  current_setting('test.avec_fiche'),
  'Modifier un personnage change l''empreinte d''un dossier qui contient la fiche'
);

select is(
  public.empreinte_dossier('00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["synthese"]}'),
  current_setting('test.sans_fiche'),
  'Modifier un personnage laisse intacte l''empreinte d''un dossier sans la fiche'
);

-- ---------------------------------------------------------------------------
-- Les deux fonctions reprises gardent leur nature et leurs droits
-- ---------------------------------------------------------------------------

select is(
  (
    select bool_or(p.prosecdef)
    from pg_proc p
    where p.oid in (
      'public.parametres_export(jsonb)'::regprocedure,
      'public.contenu_dossier(uuid, jsonb)'::regprocedure
    )
  ),
  false,
  'Ni parametres_export() ni contenu_dossier() ne sont security definer : la RLS de l''appelant s''applique'
);

select ok(
  not has_function_privilege('anon', 'public.parametres_export(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.contenu_dossier(uuid, jsonb)', 'execute')
  and not has_function_privilege('filmfund_worker', 'public.contenu_dossier(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.parametres_export(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.contenu_dossier(uuid, jsonb)', 'execute'),
  'Les deux fonctions restent fermées aux visiteurs et au worker, ouvertes aux comptes'
);

-- ---------------------------------------------------------------------------
-- Ce que chaque compte obtient
-- ---------------------------------------------------------------------------

-- Le lecteur lit déjà la fiche à l'écran : la fonction ne lui apprend rien de
-- plus. Le budget, lui, reste hors de sa portée.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1c03", "role": "authenticated"}', true);

select is(
  jsonb_array_length(
    public.contenu_dossier(
      '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'
    ) -> 'fiche_projet' -> 'personnages'
  ),
  3,
  'Un lecteur obtient la fiche qu''il lit déjà à l''écran'
);

select is(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet", "budget"]}'
  ) -> 'budget',
  'null'::jsonb,
  'Un lecteur n''obtient toujours pas le budget, même demandé avec la fiche'
);

select throws_ok(
  $$ select public.creer_devis('00000000-0000-0000-0000-0000000f1ca1', 'pdf_export', '{"sections": ["fiche_projet"]}') $$,
  '42501',
  null,
  'Un lecteur ne demande pas d''export, fût-il réduit à la fiche'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1c05", "role": "authenticated"}', true);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'),
  null,
  'Un compte étranger au projet n''obtient pas la fiche'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1c04", "role": "authenticated"}', true);

select is(
  jsonb_array_length(
    public.contenu_dossier(
      '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'
    ) -> 'fiche_projet' -> 'personnages'
  ),
  3,
  'Un administrateur hors de l''équipe obtient la fiche et ses personnages'
);

-- ---------------------------------------------------------------------------
-- Du devis au dossier retrouvé
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1c01", "role": "authenticated"}', true);

select is(
  (
    select d.unit || ' / ' || d.quantity
    from public.creer_devis(
      '00000000-0000-0000-0000-0000000f1ca1', 'docx_export', '{"sections": ["fiche_projet"]}'
    ) d
  ),
  'pdf / 1',
  'Un dossier réduit à la fiche compte une unité d''export'
);

select public.accepter_devis(
  (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-0000000f1ca1'
     and q.action = 'docx_export'
     and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-fiche'
);

reset role;
select set_config('request.jwt.claims', '', true);

select public.reclamer_travail('worker-fiche', array['docx_export']);

set local role filmfund_worker;
insert into lu select 'fiche', public.contexte_export(pg_temp.essai('k-fiche'));
reset role;

select is(
  (
    select jsonb_agg(p ->> 'nom')
    from lu, jsonb_array_elements(contexte -> 'contenu' -> 'fiche_projet' -> 'personnages') p
    where repere = 'fiche'
  ),
  '["Premier", "Deuxième", "Troisième"]'::jsonb,
  'Le worker, sous son rôle, lit la fiche et les personnages de sa tâche'
);

select set_config(
  'test.empreinte', (select contexte ->> 'empreinte' from lu where repere = 'fiche'), true
);

-- Sans cette égalité, un dossier identique ne serait jamais retrouvé : le
-- compte calcule l'empreinte sous sa RLS, le worker la reçoit hors RLS.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1c01", "role": "authenticated"}', true);

select is(
  public.empreinte_dossier('00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}'),
  current_setting('test.empreinte'),
  'L''empreinte que le porteur calcule est celle que le worker reçoit'
);

reset role;
select set_config('request.jwt.claims', '', true);

select public.marquer_tentative_soumise(pg_temp.essai('k-fiche'));

set local role filmfund_worker;
insert into obtenu
select 'fiche', public.livrer_export(
  pg_temp.essai('k-fiche'), pg_temp.docx(), null, current_setting('test.empreinte')
)::text;
reset role;

select is(
  (select e.params from public.project_exports e where e.id = pg_temp.export('k-fiche')),
  '{"sections": ["fiche_projet"], "documents": []}'::jsonb,
  'Le worker dépose le dossier, rangé avec sa demande'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1c01", "role": "authenticated"}', true);

select is(
  public.export_disponible(
    '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}', 'docx'
  ),
  pg_temp.export('k-fiche'),
  'Tant que la fiche ne change pas, le dossier est retrouvé plutôt que refait'
);

reset role;
select set_config('request.jwt.claims', '', true);

update public.project_characters
set name = 'Première'
where project_id = '00000000-0000-0000-0000-0000000f1ca1' and name = 'Premier';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1c01", "role": "authenticated"}', true);

select is(
  public.export_disponible(
    '00000000-0000-0000-0000-0000000f1ca1', '{"sections": ["fiche_projet"]}', 'docx'
  ),
  null,
  'Dès qu''un personnage change, le dossier n''est plus proposé comme identique'
);

reset role;

select * from finish();

rollback;
