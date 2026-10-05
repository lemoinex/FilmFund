-- ARC : analyse dramaturgique (lot J3a), vue depuis la base.
--
-- AUCUN FOURNISSEUR N'EST APPELÉ : le worker est joué sous son rôle, et les
-- textes sont écrits à la main. Un plan d'essai à 100 unités texte évite de
-- toucher au catalogue réel ; la transaction est annulée.

begin;

select plan(14);

-- Les tâches laissées par d'autres suites passeraient avant celles du test.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test d''ARC'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

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

-- Fonctions ordinaires, appelées sous le rôle du worker : ses droits sont
-- éprouvés, et non contournés.
create function pg_temp.preparer_essai(p_cle text) returns uuid
language plpgsql as $$
declare
  v_essai uuid := pg_temp.essai(p_cle);
begin
  perform public.marquer_tentative_soumise(v_essai);
  perform public.provisionner_cout(
    v_essai, 'anthropic', 'claude-opus-5-5', 'arc.essai@1', 1500, 3000, 0.08
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

-- ---------------------------------------------------------------------------
-- Le barème : la colonne nouvelle a une valeur partout
-- ---------------------------------------------------------------------------

-- Les versions publiées avant cette colonne doivent porter un prix, sans quoi
-- un studio resté sur l'une d'elles n'obtiendrait aucun devis.
select is_empty(
  $$ select v.version_number from public.text_unit_rate_versions v where v.dramatic_analysis is null $$,
  'Toute version du barème porte un prix pour l''analyse'
);

-- Le défaut a été retiré : publier une version sans ce prix échoue, au lieu
-- de valoir 4 en silence.
select throws_ok(
  $$
    insert into public.text_unit_rate_versions (
      logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
      budget_plan, treatment, bible, screenplay_per_sequence, dialogue_per_scene
    ) values (1, 1, 2, 3, 3, 6, 8, 10, 2, 1)
  $$,
  '23502',
  null,
  'Une version publiée sans prix d''analyse est refusée'
);

-- Les droits du barème sont accordés colonne par colonne : la colonne
-- nouvelle doit être ouverte à la publication et à la vitrine, comme les autres.
select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'dramatic_analysis', 'INSERT'),
  'Une version du barème peut être publiée avec son prix d''analyse'
);

select ok(
  has_column_privilege('anon', 'public.text_unit_rate_versions', 'dramatic_analysis', 'SELECT'),
  'La vitrine lit le prix d''une analyse sans session'
);

-- ---------------------------------------------------------------------------
-- Préparation
-- ---------------------------------------------------------------------------

insert into public.plans (code, name, position) values ('essai_arc', 'Essai ARC', 504);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_arc', 5, 3, 0, 100, 0, 0, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000e4001', 'arc-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e4002', 'arc-lecteur@exemple.test', 'authenticated', 'authenticated');

update public.studio_subscriptions
set plan_code = 'essai_arc', period_anchor = now() - interval '3 days'
where studio_id in (
  select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-0000000e4001'
);

insert into public.projects (id, owner_id, title, format, stage, logline, synopsis)
values (
  '00000000-0000-0000-0000-0000000e40a1', '00000000-0000-0000-0000-0000000e4001',
  'Le Fleuve immobile', 'long_metrage', 'ecriture', 'Un passeur sans rive.', 'Un synopsis.'
);

insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000e40a1', '00000000-0000-0000-0000-0000000e4002', 'viewer');

insert into public.project_characters (project_id, name, role, description, position)
values ('00000000-0000-0000-0000-0000000e40a1', 'Le passeur', 'principal', 'Il ne descend jamais.', 0);

update public.ai_settings set monthly_budget_usd = ceil(public.depense_ia_du_mois()) + 10;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e4001", "role": "authenticated"}', true);

select is(
  (
    select d.unit || d.quantity
    from public.creer_devis('00000000-0000-0000-0000-0000000e40a1', 'dramatic_analysis') d
  ),
  'text4',
  'Une analyse coûte 4 unités texte, comme au barème'
);

select public.accepter_devis(
  (
    select q.id from public.quotes q
    where q.project_id = '00000000-0000-0000-0000-0000000e40a1' and q.action = 'dramatic_analysis'
      and not exists (select 1 from public.reservations r where r.quote_id = q.id)
    order by q.created_at desc
    limit 1
  ),
  'k-analyse'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Contexte et dépôt
-- ---------------------------------------------------------------------------

select public.reclamer_travail('worker-arc', array['dramatic_analysis']);
update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

set local role filmfund_worker;
insert into lu select 'analyse', public.contexte_redaction(pg_temp.essai('k-analyse'));
reset role;

select is(
  (select c.contexte ->> 'action' from lu c where c.repere = 'analyse'),
  'dramatic_analysis',
  'Le contexte remis au worker porte l''action'
);

select is(
  (
    select p ->> 'nom'
    from lu c, jsonb_array_elements(c.contexte -> 'personnages') p
    where c.repere = 'analyse'
  ),
  'Le passeur',
  'ARC reçoit les personnages : il en analysera les arcs'
);

set local role filmfund_worker;
select pg_temp.preparer_essai('k-analyse');
reset role;

select throws_ok(
  format($$ select public.livrer_proposition(%L, %L) $$, pg_temp.essai('k-analyse'), repeat('x', 20001)),
  '22023',
  null,
  'Une analyse de plus de 20 000 caractères est refusée'
);

set local role filmfund_worker;
select public.livrer_proposition(
  pg_temp.essai('k-analyse'),
  'Structure.' || chr(10) || chr(10) || 'Arcs.' || chr(10) || chr(10) || 'Ce qui manque.'
);
reset role;

select is(
  (select s.action from public.ai_suggestions s where s.id = pg_temp.proposition('k-analyse')),
  'dramatic_analysis',
  'La proposition porte l''action de l''analyse'
);

-- ---------------------------------------------------------------------------
-- Acceptation : le document d'analyse
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e4002", "role": "authenticated"}', true);
select throws_ok(
  format($$ select public.accepter_proposition(%L) $$, pg_temp.proposition('k-analyse')),
  '42501',
  null,
  'Un lecteur n''applique pas une analyse'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000e4001", "role": "authenticated"}', true);
select public.accepter_proposition(pg_temp.proposition('k-analyse'));
reset role;

select is(
  (
    select d.type::text || ' / ' || d.title || ' / ' || d.status
    from public.project_documents d
    where d.project_id = '00000000-0000-0000-0000-0000000e40a1'
  ),
  'analyse / Analyse dramaturgique / brouillon',
  'L''analyse crée un document de son type, en brouillon'
);

select is(
  (
    select v.content
    from public.project_document_versions v
    join public.project_documents d on d.id = v.document_id
    where d.project_id = '00000000-0000-0000-0000-0000000e40a1' and v.version_number = 1
  ),
  'Structure.' || chr(10) || chr(10) || 'Arcs.' || chr(10) || chr(10) || 'Ce qui manque.',
  'Le document créé reçoit sa première version'
);

-- ARC lit le projet : il n'y écrit rien d'autre que son document.
select is(
  (
    select p.logline || ' / ' || p.synopsis
    from public.projects p where p.id = '00000000-0000-0000-0000-0000000e40a1'
  ),
  'Un passeur sans rive. / Un synopsis.',
  'Le projet lui-même n''a pas bougé : ARC analyse, il ne réécrit pas'
);

select is(
  (
    select st.consumed || '/' || r.quantity
    from public.jobs j
    join public.reservations r on r.id = j.reservation_id
    join public.reservation_settlements st on st.reservation_id = r.id
    where j.project_id = '00000000-0000-0000-0000-0000000e40a1'
      and j.action = 'dramatic_analysis'
  ),
  '4/4',
  'Les quatre unités devisées sont consommées, rien n''est rendu'
);

select * from finish();

rollback;
