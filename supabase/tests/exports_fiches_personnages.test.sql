-- Fiches des personnages dans le dossier exporté (lot PF2) : la section que la
-- base admet, ce qu'elle y met, et ce qu'elle laisse exactement comme avant.
--
-- Un contrôle tient à un défaut évité à l'écriture du lot : `contenu_dossier`
-- s'exécute aussi sous les droits du compte, pour reconnaître un dossier
-- identique. Elle ne doit donc rien appeler qui soit fermé aux comptes.

begin;

select plan(10);

select lives_ok(
  $$ select public.parametres_export('{"sections": ["fiches_personnages"]}') $$,
  'La section est admise'
);

select throws_ok(
  $$ select public.parametres_export('{"sections": ["fiches"]}') $$,
  '22023', null, 'Une section inconnue reste refusée'
);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000f2c01', 'fiches-porteuse@exemple.test', 'authenticated', 'authenticated');

update public.app_settings set private_admin_only = false where id;

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2c01', 'Projet à dossier');

insert into public.project_characters (id, project_id, position, name, role, description)
values
  ('00000000-0000-0000-0000-0000000f2b01', '00000000-0000-0000-0000-0000000f2a01', 1, 'Awa', 'principal', 'Pêcheuse.'),
  ('00000000-0000-0000-0000-0000000f2b02', '00000000-0000-0000-0000-0000000f2a01', 2, 'Le chef', 'secondaire', 'Autoritaire.');

select is(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiches_personnages"]}'
  ) -> 'fiches_personnages',
  '[]'::jsonb,
  'Aucun personnage n''a de fiche détaillée : la section est vide, et le dossier l''omettra'
);

select set_config(
  'test.empreinte_fiche_avant',
  public.empreinte_dossier('00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiche_projet"]}'),
  true
);
select set_config(
  'test.empreinte_fiches_avant',
  public.empreinte_dossier('00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiches_personnages"]}'),
  true
);

update public.project_characters
set age = ' la quarantaine ', goal = 'Retrouver sa fille.', traits = '   '
where id = '00000000-0000-0000-0000-0000000f2b01';

select is(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiches_personnages"]}'
  ) -> 'fiches_personnages',
  '[{"nom": "Awa", "role": "principal", "age": "la quarantaine", "objectif": "Retrouver sa fille."}]'::jsonb,
  'Seul le personnage qui a une fiche y entre, avec ses seuls champs remplis, sans sa description'
);

-- Les deux écritures d'un personnage détaillé restent égales : celle du
-- dossier, et celle que lisent les agents.
select is(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiches_personnages"]}'
  ) -> 'fiches_personnages',
  (
    select jsonb_agg(public.personnage_pour_agent(c) - 'description' order by c.position)
    from public.project_characters c
    where c.id = '00000000-0000-0000-0000-0000000f2b01'
  ),
  'Le dossier nomme les champs comme les agents les lisent'
);

select is(
  (
    select array_agg(k order by k)
    from jsonb_object_keys(
      public.contenu_dossier('00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiche_projet"]}')
    ) k
  ),
  array['demande', 'fiche', 'fiche_projet'],
  'Sans la section, le dossier ne porte rien de plus'
);

select is(
  public.contenu_dossier(
    '00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiche_projet"]}'
  ) #> '{fiche_projet,personnages}',
  '[{"nom": "Awa", "role": "principal", "description": "Pêcheuse."},
    {"nom": "Le chef", "role": "secondaire", "description": "Autoritaire."}]'::jsonb,
  'La fiche du projet garde son tableau à trois colonnes, fiche détaillée ou non'
);

select is(
  array[
    public.empreinte_dossier('00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiche_projet"]}')
      = current_setting('test.empreinte_fiche_avant'),
    public.empreinte_dossier('00000000-0000-0000-0000-0000000f2a01', '{"sections": ["fiches_personnages"]}')
      = current_setting('test.empreinte_fiches_avant')
  ],
  array[true, false],
  'Remplir une fiche ne change pas l''empreinte d''un dossier sans la section, et change celle d''un dossier qui la porte'
);

-- Sous la session de la porteuse : la reconnaissance d'un dossier identique
-- lit le contenu sous ses droits, section nouvelle comprise.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000f2c01', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.empreinte_dossier(
       '00000000-0000-0000-0000-0000000f2a01',
       '{"sections": ["fiche_projet", "fiches_personnages"]}'
     ) $$,
  'Un compte calcule l''empreinte d''un dossier qui porte la section, sous ses propres droits'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'public.personnage_pour_agent(public.project_characters)', 'execute')
    and not (select p.prosecdef from pg_proc p where p.oid = 'public.contenu_dossier(uuid, jsonb)'::regprocedure)
    and (select p.prosrc !~ 'personnage_pour_agent' from pg_proc p where p.oid = 'public.contenu_dossier(uuid, jsonb)'::regprocedure),
  'La fonction des agents reste fermée aux comptes, et le dossier ne l''appelle pas'
);

select * from finish();

rollback;
