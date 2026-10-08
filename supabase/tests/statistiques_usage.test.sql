-- Statistiques d'usage (lot Z3) : les droits de la fonction, ce qu'elle
-- compte, et à qui elle le rend.

begin;

select plan(16);

select ok(
  has_function_privilege('authenticated', 'public.statistiques_usage()', 'execute')
    and not has_function_privilege('anon', 'public.statistiques_usage()', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.statistiques_usage()', 'execute'),
  'La lecture est ouverte aux comptes, fermée aux visiteurs et au worker'
);

select ok(
  (select not prosecdef and provolatile = 's' from pg_proc
   where oid = 'public.statistiques_usage()'::regprocedure),
  'La fonction lit avec les droits de l''appelant, sans rien écrire'
);

-- Sous les droits de l'appelant, un compte ordinaire compterait ses propres
-- projets : ce contrôle est ce qui l'en empêche.
select ok(
  (select prosrc from pg_proc where oid = 'public.statistiques_usage()'::regprocedure)
    ~ 'if \(select auth\.uid\(\)\) is null or not public\.is_admin\(\) then\s+raise exception [^;]+using errcode = ''42501''',
  'Elle refuse quiconque n''est pas administrateur, session absente comprise'
);

-- Ce que la fonction rend ne porte que des codes et des nombres.
select is(
  (
    select array_agg(a.nom::text order by a.rang)
    from pg_proc p, unnest(p.proargnames) with ordinality as a(nom, rang)
    where p.oid = 'public.statistiques_usage()'::regprocedure
  ),
  array['domaine', 'cle', 'detail', 'nombre'],
  'Quatre colonnes : un domaine, une clé, un détail, un nombre'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.statistiques_usage()'::regprocedure)
    !~* '\m(display_name|first_name|last_name|email|title|content|name|funder|amount_\w+|reason|description|label|logline|synopsis|organization|source_url|params)\M',
  'Elle ne lit ni nom, ni adresse, ni titre, ni contenu, ni montant, ni motif'
);

-- L'activité récente se borne à trente jours : sans cette lecture, élargir la
-- fenêtre ne ferait tomber aucun test, faute de tâche ancienne à compter.
select ok(
  (select prosrc from pg_proc where oid = 'public.statistiques_usage()'::regprocedure)
    ~ 'from public\.jobs j\s+where j\.created_at >= now\(\) - interval ''30 days''',
  'Les demandes comptées sont celles des trente derniers jours'
);

-- Trois comptes : une administratrice, une porteuse, un membre suspendu.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000571a1', 'stats-admin@exemple.test'),
  ('00000000-0000-0000-0000-0000000571a2', 'stats-porteuse@exemple.test'),
  ('00000000-0000-0000-0000-0000000571a3', 'stats-suspendu@exemple.test');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000571a1';

insert into public.account_suspensions (user_id, reason, suspended_by)
values ('00000000-0000-0000-0000-0000000571a3', 'MOTIF CONFIDENTIEL de la suspension', '00000000-0000-0000-0000-0000000571a1');

-- Les comptages d'avant, lus sans la RLS, pour mesurer des écarts : la base
-- locale porte déjà d'autres lignes.
create temporary table avant on commit drop as
select
  (select count(*) from public.projects) as projets,
  (select count(*) from public.projects where format = 'documentaire') as documentaires,
  (select count(*) from public.projects where stage = 'ecriture') as en_ecriture,
  (select count(*) from public.project_documents where type = 'synopsis' and status = 'finalise') as synopsis_finalises,
  (select count(*) from public.project_characters) as personnages,
  (select count(*) from public.funding_opportunities where status = 'demo') as demonstrations,
  (select count(*) from public.profiles) as comptes,
  (select count(*) from public.profiles where role = 'admin') as administrateurs,
  (select count(*) from public.account_suspensions) as suspendus;
grant select on avant to authenticated;

-- Deux projets, un document finalisé, deux personnages, une opportunité.
insert into public.projects (id, owner_id, studio_id, title, format, stage)
select v.id, '00000000-0000-0000-0000-0000000571a2', s.id, v.titre, v.format::public.project_format,
       v.etape::public.project_stage
from public.studios s,
     (values
        ('00000000-0000-0000-0000-0000000571b1'::uuid, 'TITRE CONFIDENTIEL', 'documentaire', 'ecriture'),
        ('00000000-0000-0000-0000-0000000571b2'::uuid, 'AUTRE TITRE', 'documentaire', 'idee')
     ) as v(id, titre, format, etape)
where s.personal_owner_id = '00000000-0000-0000-0000-0000000571a2';

insert into public.project_documents (project_id, type, title, content, status, created_by)
values ('00000000-0000-0000-0000-0000000571b1', 'synopsis', 'Synopsis', 'CONTENU CONFIDENTIEL',
        'finalise', '00000000-0000-0000-0000-0000000571a2');

insert into public.project_characters (project_id, name, created_by)
values
  ('00000000-0000-0000-0000-0000000571b1', 'NOM CONFIDENTIEL', '00000000-0000-0000-0000-0000000571a2'),
  ('00000000-0000-0000-0000-0000000571b1', 'AUTRE NOM', '00000000-0000-0000-0000-0000000571a2');

insert into public.funding_opportunities (name, organization, category, status)
values ('FONDS CONFIDENTIEL', 'ORGANISME', 'fonds', 'demo');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000571a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.statistiques_usage() $$,
  '42501', null, 'Une porteuse ne lit pas les statistiques, même réduites à ses projets'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.statistiques_usage() $$,
  '42501', null, 'Sans identité, la lecture est refusée'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000571a1","role":"authenticated"}', true);

select is(
  (select sum(nombre) from public.statistiques_usage() where domaine = 'projets_par_format'),
  (select projets + 2 from avant)::numeric,
  'Une administratrice compte tous les projets, ceux des autres compris'
);

select is(
  (select nombre from public.statistiques_usage() where domaine = 'projets_par_format' and cle = 'documentaire'),
  (select documentaires + 2 from avant),
  'Les projets se comptent par format'
);

select is(
  (select nombre from public.statistiques_usage() where domaine = 'projets_par_etape' and cle = 'ecriture'),
  (select en_ecriture + 1 from avant),
  'Les projets se comptent par étape'
);

select is(
  (select nombre from public.statistiques_usage()
   where domaine = 'documents' and cle = 'synopsis' and detail = 'finalise'),
  (select synopsis_finalises + 1 from avant),
  'Les documents se comptent par type et par statut'
);

select is(
  (select nombre from public.statistiques_usage() where domaine = 'contenus' and cle = 'personnages'),
  (select personnages + 2 from avant),
  'Les personnages se comptent, sans rien en lire'
);

select is(
  (select nombre from public.statistiques_usage() where domaine = 'opportunites' and cle = 'demo'),
  (select demonstrations + 1 from avant),
  'Le catalogue se compte par statut, démonstrations comprises'
);

select is(
  (select array_agg(s.cle || ' ' || s.nombre order by s.cle) from public.statistiques_usage() s
   where s.domaine = 'comptes'),
  (select array['administrateurs ' || administrateurs, 'suspendus ' || suspendus, 'total ' || comptes]
   from avant),
  'Les comptes se comptent : total, administrateurs, suspendus, chacun à son nombre'
);

select is_empty(
  $$ select * from public.statistiques_usage() s
     where s.domaine || ' ' || s.cle || ' ' || coalesce(s.detail, '')
           ~* 'confidentiel|autre titre|autre nom|organisme|exemple\.test|essai' $$,
  'Aucun titre, nom, contenu, adresse ni motif ne sort'
);

reset role;

select * from finish();

rollback;
