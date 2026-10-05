-- WEAVER : synopsis court, standard, détaillé et note d'intention (lot I2a),
-- vus depuis la base.
--
-- AUCUN FOURNISSEUR N'EST APPELÉ : le worker est joué sous son rôle, et les
-- textes sont écrits à la main. Un plan d'essai à 100 unités texte évite de
-- toucher au catalogue réel ; la transaction est annulée.

begin;

select plan(20);

-- Les tâches laissées par d'autres suites passeraient avant celles du test.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test de WEAVER'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

-- Repères du test : ils s'exécutent avec les droits du propriétaire, sans
-- quoi la RLS les rendrait muets.
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

create function pg_temp.proposition(p_cle text) returns uuid language sql stable security definer as $$
  select s.id from public.ai_suggestions s where s.job_id = pg_temp.travail(p_cle);
$$;

-- Le worker : essai soumis, coût provisionné, proposition déposée. Fonctions
-- ordinaires — pas `security definer` —, appelées sous le rôle du worker :
-- ses droits sont donc éprouvés, et non contournés.
create function pg_temp.preparer_essai(p_cle text) returns uuid
language plpgsql as $$
declare
  v_essai uuid := pg_temp.essai(p_cle);
begin
  perform public.marquer_tentative_soumise(v_essai);
  perform public.provisionner_cout(
    v_essai, 'anthropic', 'claude-opus-5-5', 'weaver.essai@1', 1000, 2000, 0.05
  );
  return v_essai;
end;
$$;

create function pg_temp.deposer(p_cle text, p_texte text) returns uuid
language plpgsql as $$
begin
  return public.livrer_proposition(pg_temp.preparer_essai(p_cle), p_texte);
end;
$$;

-- Ce que le worker lit, écrit sous son propre rôle.
create temp table lu (repere text, contexte jsonb);
grant insert, select on lu to filmfund_worker;

insert into public.plans (code, name, position) values ('essai_weaver', 'Essai WEAVER', 502);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_weaver', 5, 3, 0, 100, 0, 0, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000b2001', 'weaver-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b2002', 'weaver-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b2003', 'weaver-lecteur@exemple.test', 'authenticated', 'authenticated');

update public.studio_subscriptions
set plan_code = 'essai_weaver', period_anchor = now() - interval '3 days'
where studio_id in (
  select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-0000000b2001'
);

insert into public.projects (
  id, owner_id, title, format, stage, logline, synopsis, genre, countries, languages,
  duration_minutes, short_synopsis, theme, stakes, artistic_vision, goals, audience
)
values (
  '00000000-0000-0000-0000-0000000b20a1', '00000000-0000-0000-0000-0000000b2001',
  'Les Eaux de Kribi', 'long_metrage', 'ecriture',
  'Une pêcheuse défend sa plage.', 'Le synopsis d''origine.',
  'drame', array['CM', 'SN'], 'Batanga, français', 95,
  'Le synopsis court d''origine.', 'La transmission', 'Perdre la plage.',
  'Caméra à l''épaule.', 'Trouver un coproducteur.', 'Festivals et salles.'
);

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000b20a1', '00000000-0000-0000-0000-0000000b2002', 'editor'),
  ('00000000-0000-0000-0000-0000000b20a1', '00000000-0000-0000-0000-0000000b2003', 'viewer');

insert into public.project_characters (project_id, name, role, description, position)
values
  ('00000000-0000-0000-0000-0000000b20a1', 'Ɛyɔ', 'principal', 'Pêcheuse, quarante ans.', 0),
  ('00000000-0000-0000-0000-0000000b20a1', 'Le promoteur', 'secondaire', '', 1);

insert into public.project_documents (id, project_id, type, title, content, status)
values
  ('00000000-0000-0000-0000-0000000b20d1', '00000000-0000-0000-0000-0000000b20a1',
   'note_intention', 'Note d''intention', 'La note d''origine.', 'finalise'),
  ('00000000-0000-0000-0000-0000000b20d2', '00000000-0000-0000-0000-0000000b20a1',
   'traitement', 'Traitement', 'Un brouillon de traitement.', 'brouillon');

-- Le registre local garde les dépenses des autres suites : le plafond du
-- test se règle par rapport à elles.
update public.ai_settings set monthly_budget_usd = ceil(public.depense_ia_du_mois()) + 10;

-- Cinq tâches : les quatre rédactions, et une logline pour éprouver qu'elle
-- garde ses propres règles.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000b2001", "role": "authenticated"}', true);

do $$
begin
  perform public.creer_devis('00000000-0000-0000-0000-0000000b20a1', 'synopsis_short');
  perform public.creer_devis('00000000-0000-0000-0000-0000000b20a1', 'synopsis_standard');
  perform public.creer_devis('00000000-0000-0000-0000-0000000b20a1', 'synopsis_detailed');
  perform public.creer_devis('00000000-0000-0000-0000-0000000b20a1', 'intention_note');
end $$;

select is(
  (
    select string_agg(q.action || '=' || q.unit || q.quantity, ', ' order by q.action)
    from public.quotes q
    where q.project_id = '00000000-0000-0000-0000-0000000b20a1'
  ),
  'intention_note=text3, synopsis_detailed=text3, synopsis_short=text1, synopsis_standard=text2',
  'Chaque livrable est facturé en unités texte, aux quantités de son barème'
);

-- Chaque devis est accepté sous sa propre clé : le devis le plus récent de
-- l'action, encore sans réservation.
do $$
declare
  v_action text;
begin
  foreach v_action in array array['synopsis_short', 'synopsis_standard', 'synopsis_detailed', 'intention_note', 'logline']
  loop
    if v_action = 'logline' then
      perform public.creer_devis('00000000-0000-0000-0000-0000000b20a1', 'logline');
    end if;
    perform public.accepter_devis(
      (
        select q.id from public.quotes q
        where q.project_id = '00000000-0000-0000-0000-0000000b20a1' and q.action = v_action
          and not exists (select 1 from public.reservations r where r.quote_id = q.id)
        order by q.created_at desc
        limit 1
      ),
      'k-' || v_action
    );
  end loop;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Contexte de rédaction
-- ---------------------------------------------------------------------------

select public.reclamer_travail('worker-weaver', array['synopsis_short']);
select public.reclamer_travail('worker-weaver', array['synopsis_standard']);
select public.reclamer_travail('worker-weaver', array['synopsis_detailed']);
select public.reclamer_travail('worker-weaver', array['intention_note']);
select public.reclamer_travail('worker-weaver', array['logline']);

-- Les baux des cinq tâches sont prolongés : le test dure plus longtemps
-- qu'un bail, et une tâche reprise entre deux assertions ne prouverait rien.
update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

set local role filmfund_worker;
insert into lu select 'court', public.contexte_redaction(pg_temp.essai('k-synopsis_short'));
insert into lu select 'logline', public.contexte_redaction(pg_temp.essai('k-logline'));
insert into lu select 'inconnu', public.contexte_redaction(gen_random_uuid());
reset role;

select is(
  (
    select (c.contexte -> 'projet' ->> 'titre') || ' / '
        || (c.contexte -> 'projet' ->> 'genre') || ' / '
        || (c.contexte -> 'projet' ->> 'pays') || ' / '
        || (c.contexte -> 'contexte' ->> 'theme') || ' / '
        || (c.contexte -> 'vision' ->> 'artistique')
    from lu c where c.repere = 'court'
  ),
  'Les Eaux de Kribi / drame / ["CM", "SN"] / La transmission / Caméra à l''épaule.',
  'Le worker lit la fiche du projet de sa tâche, pays et vision comprises'
);

select is(
  (
    select string_agg(p ->> 'nom', ', ')
    from lu c, jsonb_array_elements(c.contexte -> 'personnages') p
    where c.repere = 'court'
  ),
  'Ɛyɔ, Le promoteur',
  'Les personnages lui parviennent dans l''ordre de l''écran'
);

select is(
  (
    select string_agg(d ->> 'type', ', ')
    from lu c, jsonb_array_elements(c.contexte -> 'documents') d
    where c.repere = 'court'
  ),
  'note_intention',
  'Les documents finalisés seulement : un brouillon ne nourrit pas une génération'
);

select is(
  (select c.contexte from lu c where c.repere = 'logline'),
  null,
  'Une tâche de logline n''a pas de contexte de rédaction : son profil garde le sien'
);

select is(
  (select c.contexte from lu c where c.repere = 'inconnu'),
  null,
  'Aucun contexte pour un essai qui n''existe pas'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000b2001", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.contexte_redaction(gen_random_uuid()) $$,
  '42501',
  null,
  'Un compte connecté n''appelle pas le contexte de rédaction'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Dépôt d'une proposition
-- ---------------------------------------------------------------------------

-- Les dépôts se font sous le rôle du worker : ses droits sont éprouvés, et
-- non contournés. Les assertions, elles, restent sous le rôle par défaut —
-- le worker n'a pas pgTAP dans son chemin de recherche.
set local role filmfund_worker;
select pg_temp.deposer('k-synopsis_standard', 'Premier paragraphe.' || chr(10) || chr(10) || 'Second paragraphe.');
select pg_temp.preparer_essai('k-synopsis_short');
select pg_temp.preparer_essai('k-logline');
reset role;

select is(
  (select s.content from public.ai_suggestions s where s.id = pg_temp.proposition('k-synopsis_standard')),
  'Premier paragraphe.' || chr(10) || chr(10) || 'Second paragraphe.',
  'Un synopsis de plusieurs paragraphes est déposé, tel quel'
);

select throws_ok(
  format($$ select public.livrer_proposition(%L, %L) $$, pg_temp.essai('k-synopsis_short'), repeat('x', 1501)),
  '22023',
  null,
  'Un synopsis court de plus de 1 500 caractères est refusé'
);
select throws_ok(
  format($$ select public.livrer_proposition(%L, %L) $$, pg_temp.essai('k-synopsis_short'), 'Un texte' || chr(1) || 'troué.'),
  '22023',
  null,
  'Un caractère de contrôle est refusé'
);
select throws_ok(
  format($$ select public.livrer_proposition(%L, %L) $$, pg_temp.essai('k-logline'), 'Deux' || chr(10) || 'lignes.'),
  '22023',
  null,
  'Une logline reste d''un seul paragraphe'
);

-- Les textes retenus pour l'acceptation, déposés sous le même rôle.
set local role filmfund_worker;
select public.livrer_proposition(pg_temp.essai('k-synopsis_short'), 'Le nouveau synopsis court.');
select pg_temp.deposer('k-synopsis_detailed', 'Séquence une.' || chr(10) || chr(10) || 'Séquence deux.');
select pg_temp.deposer('k-intention_note', 'La note, réécrite.');
reset role;

-- ---------------------------------------------------------------------------
-- Acceptation : où chaque texte atterrit
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000b2003", "role": "authenticated"}', true);
select throws_ok(
  format($$ select public.accepter_proposition(%L) $$, pg_temp.proposition('k-synopsis_short')),
  '42501',
  null,
  'Un lecteur n''applique pas une proposition de synopsis'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000b2002", "role": "authenticated"}', true);

select is(
  (
    select s.replaced_content
    from public.accepter_proposition(pg_temp.proposition('k-synopsis_short')) s
  ),
  'Le synopsis court d''origine.',
  'Le synopsis court remplacé est conservé dans la proposition'
);
select is(
  (select p.short_synopsis from public.projects p where p.id = '00000000-0000-0000-0000-0000000b20a1'),
  'Le nouveau synopsis court.',
  'Le synopsis court atterrit dans la fiche du projet'
);

select public.accepter_proposition(pg_temp.proposition('k-synopsis_standard'));
select is(
  (select p.synopsis from public.projects p where p.id = '00000000-0000-0000-0000-0000000b20a1'),
  'Premier paragraphe.' || chr(10) || chr(10) || 'Second paragraphe.',
  'Le synopsis standard atterrit dans le synopsis du projet'
);

select public.accepter_proposition(pg_temp.proposition('k-synopsis_detailed'));
select is(
  (
    select d.title || ' / ' || d.status || ' / ' || d.content
    from public.project_documents d
    where d.project_id = '00000000-0000-0000-0000-0000000b20a1' and d.type = 'synopsis'
  ),
  'Synopsis détaillé / brouillon / Séquence une.' || chr(10) || chr(10) || 'Séquence deux.',
  'Le synopsis détaillé crée un document en brouillon, à l''équipe de le finaliser'
);
select is(
  (
    select count(*)::int
    from public.project_document_versions v
    join public.project_documents d on d.id = v.document_id
    where d.project_id = '00000000-0000-0000-0000-0000000b20a1' and d.type = 'synopsis'
  ),
  1,
  'Le document créé reçoit sa première version'
);

select is(
  (
    select s.replaced_content
    from public.accepter_proposition(pg_temp.proposition('k-intention_note')) s
  ),
  'La note d''origine.',
  'La note d''intention remplacée est conservée dans la proposition'
);
select is(
  (
    select string_agg(v.content, ' | ' order by v.version_number)
    from public.project_document_versions v
    where v.document_id = '00000000-0000-0000-0000-0000000b20d1'
  ),
  'La note d''origine. | La note, réécrite.',
  'La note d''intention est versionnée : rien n''est écrasé sans trace'
);

select public.accepter_proposition(pg_temp.proposition('k-intention_note'), 'Un autre texte.');
select is(
  (
    select count(*)::int
    from public.project_document_versions v
    where v.document_id = '00000000-0000-0000-0000-0000000b20d1'
  ),
  2,
  'Rejouer l''acceptation n''écrit rien de plus : aucune version ajoutée'
);

select * from finish();

rollback;
