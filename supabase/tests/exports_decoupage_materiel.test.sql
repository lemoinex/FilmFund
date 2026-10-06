-- Découpage et matériel dans les exports (lot J3c-4) : les deux sections
-- admises, ce qu'elles contiennent, ce qu'elles ne laissent pas fuir, et ce
-- qu'elles ne changent pas pour une demande qui ne les désigne pas.
--
-- Les lectures sous RLS sont relevées dans un réglage de session, puis
-- vérifiées une fois le rôle rendu.

begin;

select plan(20);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000e4c01', 'exports-tech-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e4c02', 'exports-tech-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e4c03', 'exports-tech-etranger@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e4c04', 'exports-tech-admin@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000e4c04';

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-0000000e4a01', '00000000-0000-0000-0000-0000000e4c01', 'Projet à exporter'),
  ('00000000-0000-0000-0000-0000000e4a02', '00000000-0000-0000-0000-0000000e4c01', 'Autre projet');

insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000e4a01', '00000000-0000-0000-0000-0000000e4c02', 'viewer');

-- Trois scènes : la deuxième n'a pas de plan ; une quatrième est d'un autre projet.
insert into public.storyboard_scenes (id, project_id, position, title, setting, location, time_of_day)
values
  ('00000000-0000-0000-0000-0000000e4b01', '00000000-0000-0000-0000-0000000e4a01', 1, 'Le départ', 'ext', 'Berge', 'aube'),
  ('00000000-0000-0000-0000-0000000e4b02', '00000000-0000-0000-0000-0000000e4a01', 2, 'Scène sans plan', 'int', '', 'jour'),
  ('00000000-0000-0000-0000-0000000e4b03', '00000000-0000-0000-0000-0000000e4a01', 3, 'Le retour', 'int', 'Case', 'nuit'),
  ('00000000-0000-0000-0000-0000000e4b04', '00000000-0000-0000-0000-0000000e4a02', 1, 'Scène d''ailleurs', 'ext', '', 'jour');

insert into public.scene_shots (project_id, scene_id, position, shot, focal_mm, angle, movement, description, duration_seconds)
values
  ('00000000-0000-0000-0000-0000000e4a01', '00000000-0000-0000-0000-0000000e4b01', 2, 'gros_plan', null, 'plongee', 'epaule', 'Second plan', null),
  ('00000000-0000-0000-0000-0000000e4a01', '00000000-0000-0000-0000-0000000e4b01', 1, 'plan_large', 24, 'normal', 'travelling', 'Premier plan', 8),
  ('00000000-0000-0000-0000-0000000e4a01', '00000000-0000-0000-0000-0000000e4b03', 1, 'insert', 85, 'normal', 'fixe', 'Plan du retour', 3),
  ('00000000-0000-0000-0000-0000000e4a02', '00000000-0000-0000-0000-0000000e4b04', 1, 'plan_moyen', null, 'normal', 'fixe', 'Plan d''ailleurs', null);

insert into public.project_gear (project_id, category, label, quantity, unit_power_watts, simultaneous)
values
  ('00000000-0000-0000-0000-0000000e4a01', 'son', 'Perche', 1, 0, true),
  ('00000000-0000-0000-0000-0000000e4a01', 'image', 'Moniteur', 2, 45, false),
  ('00000000-0000-0000-0000-0000000e4a01', 'lumiere', 'Projecteur', 2, null, true),
  ('00000000-0000-0000-0000-0000000e4a02', 'image', 'Matériel d''ailleurs', 1, 9000, true);

insert into public.project_power_settings (project_id, voltage_volts, generator_margin_percent)
values ('00000000-0000-0000-0000-0000000e4a01', 110, 50);

create function pg_temp.session(p_compte text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.dossier(p_sections text) returns jsonb language sql as $$
  select public.contenu_dossier(
    '00000000-0000-0000-0000-0000000e4a01',
    jsonb_build_object('sections', to_jsonb(string_to_array(p_sections, ',')))
  );
$$;

-- ---------------------------------------------------------------------------
-- Demande
-- ---------------------------------------------------------------------------

select is(
  public.parametres_export('{"sections": ["materiel", "decoupage", "materiel", "budget"]}'),
  '{"sections": ["budget", "decoupage", "materiel"], "documents": []}'::jsonb,
  'Les deux sections sont admises, triées et dédoublonnées comme les autres'
);

select is(
  public.parametres_export('{"sections": ["planning", "budget", "synthese"], "documents": ["scenario"]}')::text,
  '{"sections": ["budget", "planning", "synthese"], "documents": ["scenario"]}',
  'Une demande d''avant garde sa forme au caractère près : son empreinte ne change pas'
);

select throws_ok(
  $$ select public.parametres_export('{"sections": ["decoupage", "electricite"]}') $$,
  '22023', null, 'Une section inconnue est toujours refusée'
);

select is(
  (
    select count(*)::int from pg_proc
    where oid in (
      'public.parametres_export(jsonb)'::regprocedure,
      'public.contenu_dossier(uuid, jsonb)'::regprocedure
    ) and prosecdef
  ),
  0,
  'Ni parametres_export() ni contenu_dossier() ne sont security definer : la RLS de l''appelant s''applique'
);

-- ---------------------------------------------------------------------------
-- Contenu
-- ---------------------------------------------------------------------------

select is(
  (select jsonb_agg(s ->> 'titre') from jsonb_array_elements(pg_temp.dossier('decoupage') -> 'decoupage') s),
  '["Le départ", "Le retour"]'::jsonb,
  'Le découpage rend les scènes qui ont des plans, dans l''ordre du film, et elles seules'
);

select is(
  pg_temp.dossier('decoupage') -> 'decoupage' -> 0,
  '{
    "titre": "Le départ", "decor": "ext", "lieu": "Berge", "moment": "aube",
    "plans": [
      {"cadrage": "plan_large", "focale": 24, "angle": "normal", "mouvement": "travelling", "duree": 8, "description": "Premier plan"},
      {"cadrage": "gros_plan", "focale": null, "angle": "plongee", "mouvement": "epaule", "duree": null, "description": "Second plan"}
    ]
  }'::jsonb,
  'Chaque scène porte ses plans dans leur ordre, avec leurs seuls champs'
);

select is(
  pg_temp.dossier('materiel') -> 'materiel',
  '[
    {"categorie": "image", "designation": "Moniteur", "quantite": 2, "puissance": 45},
    {"categorie": "lumiere", "designation": "Projecteur", "quantite": 2, "puissance": null},
    {"categorie": "son", "designation": "Perche", "quantite": 1, "puissance": 0}
  ]'::jsonb,
  'Le matériel sort dans l''ordre des catégories, avec ses seuls champs'
);

select ok(
  pg_temp.dossier('decoupage,materiel')::text !~ 'ailleurs|9000',
  'Rien d''un autre projet n''entre dans le dossier'
);

select ok(
  pg_temp.dossier('decoupage,materiel')::text !~ '110|voltage|tension|marge|simultan|charge|intensit',
  'Le dossier ne porte ni réglage ni calcul électrique'
);

select ok(
  pg_temp.dossier('decoupage,materiel')::text !~ 'created_by|created_at|exemple\.test|0000000e4c0',
  'Ni auteur, ni date, ni compte dans le dossier'
);

select ok(
  not (pg_temp.dossier('materiel') ? 'decoupage') and not (pg_temp.dossier('decoupage') ? 'materiel'),
  'Une section non demandée n''est pas rendue'
);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000e4a01', '{"sections": ["synthese"]}') ?| array['decoupage', 'materiel'],
  false,
  'Une demande d''avant ne reçoit aucun des deux blocs'
);

select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000e4a02', '{"sections": ["decoupage"]}') -> 'decoupage' -> 0 ->> 'titre',
  'Scène d''ailleurs',
  'Chaque projet a son propre découpage'
);

delete from public.scene_shots where project_id = '00000000-0000-0000-0000-0000000e4a02';
select is(
  public.contenu_dossier('00000000-0000-0000-0000-0000000e4a02', '{"sections": ["decoupage"]}') -> 'decoupage',
  '[]'::jsonb,
  'Sans aucun plan, le découpage est une liste vide, pas une absence'
);

-- ---------------------------------------------------------------------------
-- Qui lit quoi
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.session('00000000-0000-0000-0000-0000000e4c01');
select set_config('test.porteur', jsonb_array_length(pg_temp.dossier('decoupage,materiel') -> 'materiel')::text, true);

select pg_temp.session('00000000-0000-0000-0000-0000000e4c02');
select set_config('test.lecteur', jsonb_array_length(pg_temp.dossier('decoupage,materiel') -> 'decoupage')::text, true);

select pg_temp.session('00000000-0000-0000-0000-0000000e4c03');
select set_config('test.etranger', coalesce(pg_temp.dossier('decoupage,materiel')::text, 'nul'), true);

select pg_temp.session('00000000-0000-0000-0000-0000000e4c04');
select set_config('test.admin', jsonb_array_length(pg_temp.dossier('decoupage,materiel') -> 'materiel')::text, true);

reset role;

select is(current_setting('test.porteur'), '3', 'Le porteur tire le matériel de son projet');
select is(current_setting('test.lecteur'), '2', 'Un lecteur n''en tire que ce qu''il lit déjà : le découpage se lit de toute l''équipe');
select is(current_setting('test.etranger'), 'nul', 'Un compte étranger n''en tire rien : le projet lui est invisible');
select is(current_setting('test.admin'), '3', 'Un administrateur hors équipe en tire le matériel');

update public.app_settings set private_admin_only = true where id;

set local role authenticated;
select pg_temp.session('00000000-0000-0000-0000-0000000e4c01');
select set_config('test.prive', coalesce(pg_temp.dossier('decoupage,materiel')::text, 'nul'), true);
select pg_temp.session('00000000-0000-0000-0000-0000000e4c04');
select set_config('test.prive_admin', jsonb_array_length(pg_temp.dossier('decoupage,materiel') -> 'decoupage')::text, true);
reset role;

select is(current_setting('test.prive'), 'nul', 'En mode privé, le porteur n''en tire plus rien');
select is(current_setting('test.prive_admin'), '2', 'En mode privé, un administrateur en tire toujours le découpage');

update public.app_settings set private_admin_only = false where id;

select * from finish();

rollback;
