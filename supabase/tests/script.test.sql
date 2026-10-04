-- SCRIPT : traitement et bible (lot J1), vus depuis la base.
--
-- AUCUN FOURNISSEUR N'EST APPELÉ : le worker est joué sous son rôle, et les
-- textes sont écrits à la main. Un plan d'essai à 100 unités texte évite de
-- toucher au catalogue réel ; la transaction est annulée.

begin;

select plan(13);

-- Les tâches laissées par d'autres suites passeraient avant celles du test.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test de SCRIPT'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

create function pg_temp.travail(p_cle text) returns uuid language sql security definer as $$
  select j.id from public.jobs j
  join public.reservations r on r.id = j.reservation_id
  where r.idempotency_key = p_cle;
$$;

create function pg_temp.essai(p_cle text) returns uuid language sql security definer as $$
  select a.id from public.job_attempts a
  join public.jobs j on j.id = a.job_id
  where j.id = pg_temp.travail(p_cle) and a.number = j.attempts;
$$;

create function pg_temp.proposition(p_cle text) returns uuid language sql security definer as $$
  select s.id from public.ai_suggestions s where s.job_id = pg_temp.travail(p_cle);
$$;

-- Fonctions ordinaires, appelées sous le rôle du worker : ses droits sont
-- éprouvés, et non contournés.
create function pg_temp.preparer_essai(p_cle text) returns uuid
language plpgsql as $$
declare
  v_essai uuid := pg_temp.essai(p_cle);
begin
  perform public.marquer_tentative_soumise(v_essai);
  perform public.provisionner_cout(
    v_essai, 'anthropic', 'claude-opus-5-5', 'script.essai@1', 2000, 4000, 0.10
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

create temp table lu (repere text, contexte jsonb);
grant insert, select on lu to filmfund_worker;

insert into public.plans (code, name, position) values ('essai_script', 'Essai SCRIPT', 503);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_script', 5, 3, 0, 100, 0, 0, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000c3001', 'script-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c3002', 'script-lecteur@exemple.test', 'authenticated', 'authenticated');

update public.studio_subscriptions
set plan_code = 'essai_script', period_anchor = now() - interval '3 days'
where studio_id in (
  select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-0000000c3001'
);

insert into public.projects (id, owner_id, title, format, stage, logline, synopsis)
values (
  '00000000-0000-0000-0000-0000000c30a1', '00000000-0000-0000-0000-0000000c3001',
  'La Saison sèche', 'serie', 'ecriture', 'Un village sans pluie.', 'Un synopsis.'
);

insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000c30a1', '00000000-0000-0000-0000-0000000c3002', 'viewer');

-- Un traitement existe déjà ; aucune bible.
insert into public.project_documents (id, project_id, type, title, content, status)
values (
  '00000000-0000-0000-0000-0000000c30d1', '00000000-0000-0000-0000-0000000c30a1',
  'traitement', 'Traitement', 'Le traitement d''origine.', 'finalise'
);

update public.ai_settings set monthly_budget_usd = ceil(public.depense_ia_du_mois()) + 10;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000c3001", "role": "authenticated"}', true);

do $$
begin
  perform public.creer_devis('00000000-0000-0000-0000-0000000c30a1', 'treatment');
  perform public.creer_devis('00000000-0000-0000-0000-0000000c30a1', 'bible');
end $$;

select is(
  (
    select string_agg(q.action || '=' || q.unit || q.quantity, ', ' order by q.action)
    from public.quotes q
    where q.project_id = '00000000-0000-0000-0000-0000000c30a1'
  ),
  'bible=text10, treatment=text8',
  'Le traitement coûte 8 unités texte, la bible 10, comme au barème'
);

do $$
declare
  v_action text;
begin
  foreach v_action in array array['treatment', 'bible']
  loop
    perform public.accepter_devis(
      (
        select q.id from public.quotes q
        where q.project_id = '00000000-0000-0000-0000-0000000c30a1' and q.action = v_action
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

select public.reclamer_travail('worker-script', array['treatment']);
select public.reclamer_travail('worker-script', array['bible']);
update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

set local role filmfund_worker;
insert into lu select 'traitement', public.contexte_redaction(pg_temp.essai('k-treatment'));
insert into lu select 'bible', public.contexte_redaction(pg_temp.essai('k-bible'));
reset role;

select is(
  (select c.contexte -> 'projet' ->> 'titre' from lu c where c.repere = 'traitement'),
  'La Saison sèche',
  'Le worker lit la fiche du projet pour un traitement'
);

select is(
  (select c.contexte ->> 'action' from lu c where c.repere = 'bible'),
  'bible',
  'Le contexte d''une bible porte son action'
);

select is(
  (
    select string_agg(d ->> 'type', ', ')
    from lu c, jsonb_array_elements(c.contexte -> 'documents') d
    where c.repere = 'bible'
  ),
  'traitement',
  'Le traitement finalisé nourrit la bible'
);

-- ---------------------------------------------------------------------------
-- Dépôt
-- ---------------------------------------------------------------------------

set local role filmfund_worker;
select pg_temp.preparer_essai('k-treatment');
reset role;

select throws_ok(
  format($$ select public.livrer_proposition(%L, %L) $$, pg_temp.essai('k-treatment'), repeat('x', 20001)),
  '22023',
  null,
  'Un traitement de plus de 20 000 caractères est refusé'
);

set local role filmfund_worker;
select public.livrer_proposition(pg_temp.essai('k-treatment'), repeat('a', 20000));
select pg_temp.deposer('k-bible', 'Le concept.' || chr(10) || chr(10) || 'L''univers.');
reset role;

select is(
  (select char_length(s.content) from public.ai_suggestions s where s.id = pg_temp.proposition('k-treatment')),
  20000,
  'Un traitement de 20 000 caractères passe : c''est la borne de la table'
);

-- ---------------------------------------------------------------------------
-- Acceptation : où chaque texte atterrit
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000c3002", "role": "authenticated"}', true);
select throws_ok(
  format($$ select public.accepter_proposition(%L) $$, pg_temp.proposition('k-bible')),
  '42501',
  null,
  'Un lecteur n''applique pas une proposition de SCRIPT'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000c3001", "role": "authenticated"}', true);

select is(
  (
    select s.replaced_content
    from public.accepter_proposition(pg_temp.proposition('k-treatment')) s
  ),
  'Le traitement d''origine.',
  'Le traitement remplacé est conservé dans la proposition'
);

select is(
  (
    select string_agg(v.content, ' | ' order by v.version_number)
    from public.project_document_versions v
    where v.document_id = '00000000-0000-0000-0000-0000000c30d1'
  ),
  'Le traitement d''origine. | ' || repeat('a', 20000),
  'Le document existant est versionné : rien n''est écrasé sans trace'
);

select public.accepter_proposition(pg_temp.proposition('k-bible'));

select is(
  (
    select d.title || ' / ' || d.status || ' / ' || d.content
    from public.project_documents d
    where d.project_id = '00000000-0000-0000-0000-0000000c30a1' and d.type = 'bible'
  ),
  'Bible de série / brouillon / Le concept.' || chr(10) || chr(10) || 'L''univers.',
  'La bible crée un document en brouillon, à l''équipe de le finaliser'
);

select is(
  (
    select count(*)::int
    from public.project_document_versions v
    join public.project_documents d on d.id = v.document_id
    where d.project_id = '00000000-0000-0000-0000-0000000c30a1' and d.type = 'bible'
  ),
  1,
  'La bible créée reçoit sa première version'
);

select is(
  (
    select count(*)::int from public.project_documents d
    where d.project_id = '00000000-0000-0000-0000-0000000c30a1'
  ),
  2,
  'Le traitement n''a pas été dupliqué : deux documents en tout'
);

-- Le statut du traitement n'a pas été touché par l'acceptation.
select is(
  (select d.status::text from public.project_documents d where d.id = '00000000-0000-0000-0000-0000000c30d1'),
  'finalise',
  'Un document finalisé le reste quand une proposition le réécrit'
);

select * from finish();

rollback;
