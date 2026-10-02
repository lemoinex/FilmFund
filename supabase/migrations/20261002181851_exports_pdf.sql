-- Exports PDF d'un projet : base et fonctions du worker (lot M1).
--
-- Décision 8, prise par l'utilisateur le 2 octobre 2026 :
--   - un dossier se compose à la carte : synthèse (pitch et synopsis), types
--     de documents, budget, plan de financement, planning ;
--   - seuls les documents finalisés y entrent ;
--   - le PDF est fabriqué par le worker (Railway), jamais par le navigateur ;
--   - pas d'image dans cette première version.
--
-- Le devis et la réservation existent déjà (lot G) : l'action `pdf_export`
-- compte une unité PDF, et la tâche naît de la réservation (lot H1). Cette
-- migration ajoute ce qui manquait : de quoi lire le contenu du dossier, et
-- où déposer le fichier.
--
-- Trois principes :
--   - le fichier est rangé en base, pas dans le stockage : y écrire
--     demanderait de confier au worker une clé qui contourne toute la RLS. Il
--     le dépose donc par une fonction, pour la seule tâche qu'il tient, comme
--     il dépose une proposition ;
--   - un export peut contenir le budget : il n'est lisible que de ceux qui
--     lisent le budget — porteur, éditeurs, administrateurs —, pas des
--     lecteurs du projet ;
--   - un export identique n'est pas refait : chaque fichier porte l'empreinte
--     de son contenu, et `export_disponible` retrouve celui qui correspond
--     encore à l'état du projet.
--
-- Un fichier pèse 5 Mo au plus et se conserve 30 jours : des PDF en base
-- comptent dans la taille de la base.
--
-- Retour arrière : retirer les fonctions, puis la table. Les fichiers sont
-- perdus ; ils se refont depuis le projet. Les unités déjà consommées
-- restent au registre.

-- ---------------------------------------------------------------------------
-- Demande : sections et types de documents
-- ---------------------------------------------------------------------------

-- Forme canonique d'une demande : listes triées, sans doublon. Deux demandes
-- qui ne diffèrent que par l'ordre de leurs cases cochées sont la même.
-- 22023 : paramètres mal formés, section inconnue, ou rien de demandé.
create or replace function public.parametres_export(p_params jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_sections text[];
  v_documents text[];
begin
  if jsonb_typeof(p_params) is distinct from 'object'
     or jsonb_typeof(coalesce(p_params -> 'sections', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_params -> 'documents', '[]')) <> 'array' then
    raise exception 'Demande d''export invalide : deux listes sont attendues.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct valeur order by valeur), '{}')
    into v_sections
    from jsonb_array_elements_text(coalesce(p_params -> 'sections', '[]')) as valeur;
  select coalesce(array_agg(distinct valeur order by valeur), '{}')
    into v_documents
    from jsonb_array_elements_text(coalesce(p_params -> 'documents', '[]')) as valeur;

  if not v_sections <@ array['synthese', 'budget', 'financements', 'planning']
     or not v_documents <@ enum_range(null::public.document_type)::text[] then
    raise exception 'Demande d''export invalide : section ou type de document inconnu.'
      using errcode = '22023';
  end if;

  if cardinality(v_sections) + cardinality(v_documents) = 0 then
    raise exception 'Demande d''export invalide : aucune section demandée.'
      using errcode = '22023';
  end if;

  return jsonb_build_object('sections', to_jsonb(v_sections), 'documents', to_jsonb(v_documents));
end;
$$;

-- ---------------------------------------------------------------------------
-- Contenu du dossier
-- ---------------------------------------------------------------------------

-- Ce qu'un dossier contient, pour une demande donnée : la fiche du projet,
-- puis les seules sections demandées. Ni image, ni note interne, ni identité
-- des membres. Nul si le projet n'est pas visible de l'appelant.
--
-- Sans `security definer` : appelée par un compte, elle ne lit que ce que la
-- RLS lui ouvre ; appelée par contexte_export(), elle lit pour le worker.
create or replace function public.contenu_dossier(p_project_id uuid, p_params jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_demande jsonb := public.parametres_export(p_params);
  v_sections text[];
  v_documents text[];
  v_projet public.projects;
  v_contenu jsonb;
begin
  v_sections := array(select jsonb_array_elements_text(v_demande -> 'sections'));
  v_documents := array(select jsonb_array_elements_text(v_demande -> 'documents'));

  select p.* into v_projet from public.projects p where p.id = p_project_id;
  if v_projet.id is null then
    return null;
  end if;

  v_contenu := jsonb_build_object(
    'demande', v_demande,
    'fiche', jsonb_build_object(
      'titre', v_projet.title,
      'format', v_projet.format,
      'etape', v_projet.stage
    )
  );

  if 'synthese' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'synthese', jsonb_build_object('pitch', v_projet.logline, 'synopsis', v_projet.synopsis)
    );
  end if;

  -- Finalisés seulement : un brouillon ne part pas dans un dossier par erreur.
  if cardinality(v_documents) > 0 then
    v_contenu := v_contenu || jsonb_build_object(
      'documents', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('type', d.type, 'titre', d.title, 'contenu', d.content)
            order by d.type, d.created_at, d.id
          )
          from public.project_documents d
          where d.project_id = p_project_id
            and d.status = 'finalise'
            and d.type::text = any (v_documents)
        ),
        '[]'::jsonb
      )
    );
  end if;

  -- Le prévisionnel seulement : le réalisé est un suivi interne.
  if 'budget' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'budget', (
        select jsonb_build_object(
          'devise', b.currency,
          'lignes', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'poste', l.category,
                  'libelle', l.label,
                  'quantite', l.quantity,
                  'cout_unitaire', l.unit_cost,
                  'total', l.total
                )
                order by l.category, l.created_at, l.id
              )
              from public.budget_lines l
              where l.project_id = p_project_id
            ),
            '[]'::jsonb
          )
        )
        from public.project_budgets b
        where b.project_id = p_project_id
      )
    );
  end if;

  if 'financements' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'financements', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'organisme', f.funder,
              'programme', f.program,
              'type', f.kind,
              'statut', f.status,
              'devise', f.currency,
              'demande', f.amount_requested,
              'accorde', f.amount_granted,
              'echeance', f.deadline
            )
            order by f.deadline nulls last, f.created_at, f.id
          )
          from public.project_fundings f
          where f.project_id = p_project_id
        ),
        '[]'::jsonb
      )
    );
  end if;

  if 'planning' = any (v_sections) then
    v_contenu := v_contenu || jsonb_build_object(
      'planning', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'titre', m.title,
              'phase', m.phase,
              'debut', m.starts_on,
              'fin', m.due_on,
              'statut', m.status
            )
            order by coalesce(m.starts_on, m.due_on) nulls last, m.due_on nulls last,
                     m.created_at, m.id
          )
          from public.project_milestones m
          where m.project_id = p_project_id
        ),
        '[]'::jsonb
      )
    );
  end if;

  return v_contenu;
end;
$$;

-- Empreinte d'un contenu : le texte d'un jsonb est canonique, si bien qu'un
-- même contenu donne toujours la même empreinte.
create or replace function public.empreinte_contenu(p_contenu jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(sha256(convert_to(p_contenu::text, 'UTF8')), 'hex');
$$;

-- Empreinte de ce que contiendrait le dossier aujourd'hui. Nulle si le
-- projet n'est pas visible de l'appelant.
create or replace function public.empreinte_dossier(p_project_id uuid, p_params jsonb)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.empreinte_contenu(public.contenu_dossier(p_project_id, p_params));
$$;

-- ---------------------------------------------------------------------------
-- Exports
-- ---------------------------------------------------------------------------

create table public.project_exports (
  id uuid primary key default gen_random_uuid(),
  -- Une tâche, un fichier.
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  studio_id uuid not null references public.studios (id) on delete cascade,
  -- Le fichier reprend le contenu du projet : il disparaît avec lui.
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid not null,
  -- La demande, sous sa forme canonique.
  params jsonb not null,
  content_fingerprint text not null,
  file bytea not null,
  size_bytes integer generated always as (octet_length(file)) stored,
  pages integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',

  constraint export_empreinte check (content_fingerprint ~ '^[0-9a-f]{64}$'),
  -- 5 Mo : la même borne que livrer_export(), qui la dit en clair.
  constraint export_fichier_pdf check (
    octet_length(file) between 5 and 5242880
    and substring(file from 1 for 5) = '\x255044462d'::bytea
  ),
  constraint export_pages check (pages between 1 and 2000),
  constraint export_expiration check (expires_at > created_at)
);

comment on table public.project_exports is
  'Dossiers PDF d''un projet, déposés par le worker. Écrits par les fonctions uniquement ; conservés 30 jours.';

create index project_exports_project_id_created_at_idx
  on public.project_exports (project_id, created_at desc);
create index project_exports_expires_at_idx on public.project_exports (expires_at);

alter table public.project_exports enable row level security;

-- Même règle que le budget, qu'un export peut contenir : un lecteur du
-- projet n'y a pas accès. peut_gerer_budget() couvre les administrateurs.
create policy "Porteur, éditeurs et administrateurs lisent les exports"
  on public.project_exports for select
  to authenticated
  using (public.peut_gerer_budget(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.project_exports
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Aucune écriture par l'API, pas même pour un administrateur : le fichier et
-- son empreinte doivent rester d'accord, ce que seule la fonction garantit.
revoke all on table public.project_exports from anon, authenticated;
grant select on table public.project_exports to authenticated;

-- ---------------------------------------------------------------------------
-- Fonction des comptes connectés
-- ---------------------------------------------------------------------------

-- Export encore disponible dont le contenu est celui du projet aujourd'hui,
-- pour cette demande ; nul sinon. L'écran le propose au lieu d'engager une
-- unité. La RLS s'applique : un compte ne retrouve que ce qu'il peut lire.
create or replace function public.export_disponible(p_project_id uuid, p_params jsonb)
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$
  select e.id
  from public.project_exports e
  where e.project_id = p_project_id
    and e.expires_at > now()
    and e.content_fingerprint = public.empreinte_dossier(p_project_id, p_params)
  order by e.created_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Contenu du dossier de la tâche que le worker tient, et son empreinte.
-- Nul si l'essai n'est pas l'essai en cours d'une tâche d'export en cours,
-- ou si le projet n'existe plus. 22023 si la demande est invalide.
create or replace function public.contexte_export(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_contenu jsonb;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'pdf_export';

  if v_job.id is null then
    return null;
  end if;

  v_contenu := public.contenu_dossier(v_job.project_id, v_job.params);
  if v_contenu is null then
    return null;
  end if;

  return jsonb_build_object(
    'contenu', v_contenu,
    'empreinte', public.empreinte_contenu(v_contenu)
  );
end;
$$;

-- Dépose le fichier et conclut l'essai, dans la même transaction : pas de
-- tâche réussie sans fichier, ni l'inverse. Le fichier est contrôlé ici
-- aussi : le worker n'est pas cru sur parole.
create or replace function public.livrer_export(
  p_attempt_id uuid,
  p_file bytea,
  p_pages integer,
  p_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_export uuid;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  if v_job.action <> 'pdf_export' then
    raise exception 'Aucun export n''est prévu pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;

  if p_file is null
     or octet_length(p_file) not between 5 and 5242880
     or substring(p_file from 1 for 5) <> '\x255044462d'::bytea then
    raise exception 'Fichier invalide : un PDF de 5 Mo au plus est attendu.'
      using errcode = '22023';
  end if;
  if p_pages is null or p_pages not between 1 and 2000 then
    raise exception 'Nombre de pages invalide.' using errcode = '22023';
  end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte invalide.' using errcode = '22023';
  end if;

  insert into public.project_exports (
    job_id, studio_id, project_id, created_by, params, content_fingerprint, file, pages
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.created_by,
    public.parametres_export(v_job.params), p_fingerprint, p_file, p_pages
  )
  returning id into v_export;

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_export;
end;
$$;

-- Supprime les exports expirés ; renvoie leur nombre. Le worker l'appelle de
-- temps à autre : sans cela, les fichiers s'accumuleraient dans la base.
create or replace function public.purger_exports_expires()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_nombre integer;
begin
  delete from public.project_exports e where e.expires_at <= now();
  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

-- Fonctions sans `security definer` : la RLS de l'appelant s'applique. Elles
-- restent fermées aux visiteurs.
revoke all on function public.parametres_export(jsonb) from public, anon;
revoke all on function public.contenu_dossier(uuid, jsonb) from public, anon;
revoke all on function public.empreinte_contenu(jsonb) from public, anon;
revoke all on function public.empreinte_dossier(uuid, jsonb) from public, anon;
revoke all on function public.export_disponible(uuid, jsonb) from public, anon;
grant execute on function public.parametres_export(jsonb) to authenticated;
grant execute on function public.contenu_dossier(uuid, jsonb) to authenticated;
grant execute on function public.empreinte_contenu(jsonb) to authenticated;
grant execute on function public.empreinte_dossier(uuid, jsonb) to authenticated;
grant execute on function public.export_disponible(uuid, jsonb) to authenticated;

-- Le worker, et lui seul.
revoke all on function public.contexte_export(uuid) from public, anon, authenticated;
revoke all on function public.livrer_export(uuid, bytea, integer, text) from public, anon, authenticated;
revoke all on function public.purger_exports_expires() from public, anon, authenticated;

grant execute on function public.contexte_export(uuid) to filmfund_worker;
grant execute on function public.livrer_export(uuid, bytea, integer, text) to filmfund_worker;
grant execute on function public.purger_exports_expires() to filmfund_worker;
