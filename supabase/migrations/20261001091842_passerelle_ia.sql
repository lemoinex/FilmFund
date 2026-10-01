-- Passerelle IA : propositions, coûts fournisseurs et plafond (lot I1).
--
-- Décisions de l'utilisateur (1er octobre 2026) :
--   - premier agent, WEAVER, pour une seule action : la logline ;
--   - modèle Claude Opus 5.5 (Anthropic) ;
--   - plafond de dépense de 5 $ par mois, vérifié avant chaque appel ;
--   - seule la fiche du projet est transmise au fournisseur : titre, format,
--     étape, synopsis et logline actuelle.
--
-- L'appel au fournisseur se fait dans le worker (lots H1 et H2), jamais dans
-- l'application ni dans le navigateur. Le worker ne lit aucune table : il
-- obtient la fiche du projet, provisionne et confirme ses coûts, et dépose
-- sa proposition par les fonctions ci-dessous, pour la seule tâche qu'il
-- tient.
--
-- Trois principes :
--   - une génération ne remplace jamais un texte de l'utilisateur : elle
--     dépose une proposition, que le porteur ou un éditeur compare, modifie
--     s'il le veut, puis applique ou écarte. Le texte remplacé est conservé ;
--   - les coûts fournisseurs forment un registre distinct des droits
--     commerciaux (lot G) : une dépense reste inscrite même si la tâche
--     échoue et que les unités du studio sont rendues ;
--   - un plafond interne atteint fait échouer la tâche et rend les unités :
--     il ne retire aucun droit au studio.
--
-- Retour arrière : retirer fonctions, déclencheurs et politiques, puis les
-- tables. Le registre des coûts est une comptabilité : le supprimer efface
-- la trace des dépenses. Les propositions acceptées ont déjà été recopiées
-- dans les projets ; les supprimer efface la trace du texte remplacé.

-- ---------------------------------------------------------------------------
-- Plafond de dépense
-- ---------------------------------------------------------------------------

create table public.ai_settings (
  id boolean primary key default true,
  -- Dollars américains, la devise de facturation du fournisseur.
  monthly_budget_usd numeric(10, 2) not null,
  updated_at timestamptz not null default now(),

  constraint reglage_ia_unique check (id),
  constraint plafond_ia_positif check (monthly_budget_usd >= 0)
);

comment on table public.ai_settings is
  'Réglage unique : plafond mensuel des dépenses d''IA, en dollars. Lu et modifié par les administrateurs.';

insert into public.ai_settings (monthly_budget_usd) values (5.00);

alter table public.ai_settings enable row level security;

create policy "Les administrateurs lisent le plafond d'IA"
  on public.ai_settings for select
  to authenticated
  using ((select public.is_admin()));

create policy "Les administrateurs modifient le plafond d'IA"
  on public.ai_settings for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_settings
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

revoke all on table public.ai_settings from anon, authenticated;
grant select on table public.ai_settings to authenticated;
grant update (monthly_budget_usd) on table public.ai_settings to authenticated;

create trigger ai_settings_avant_update
  before update on public.ai_settings
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Registre des coûts fournisseurs
-- ---------------------------------------------------------------------------

-- Pas de clé étrangère vers les tâches ni les studios : supprimer un compte
-- emporte ses tâches, pas la dépense qu'elles ont causée.
create table public.provider_charges (
  attempt_id uuid primary key,
  job_id uuid not null,
  studio_id uuid not null,
  project_id uuid not null,
  provider text not null,
  model text not null,
  -- Profil d'agent et sa version, par exemple « weaver.logline@1 ».
  profile text not null,
  -- Provision avant l'appel : ce qu'il coûterait au pire.
  estimated_input_tokens integer not null,
  estimated_output_tokens integer not null,
  estimated_usd numeric(12, 6) not null,
  created_at timestamptz not null default now(),

  constraint cout_fournisseur_connu check (provider in ('anthropic')),
  constraint cout_provision_positive check (
    estimated_input_tokens >= 0 and estimated_output_tokens >= 0 and estimated_usd >= 0
  )
);

comment on table public.provider_charges is
  'Coût provisionné avant chaque appel à un fournisseur d''IA. En ajout seul ; lu par les administrateurs.';

create index provider_charges_created_at_idx on public.provider_charges (created_at);

-- Un essai, une dépense : la confirmation remplace la provision, elle ne
-- s'y ajoute pas.
create table public.provider_charge_settlements (
  attempt_id uuid primary key references public.provider_charges (attempt_id),
  -- Modèle qui a réellement répondu : un repli peut différer du modèle demandé.
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  -- Nul : tarif du modèle servi inconnu du profil, montant à rapprocher.
  usd numeric(12, 6),
  fallback boolean not null default false,
  settled_at timestamptz not null default now(),

  constraint cout_confirme_positif check (
    input_tokens >= 0 and output_tokens >= 0 and (usd is null or usd >= 0)
  )
);

comment on table public.provider_charge_settlements is
  'Usage confirmé par le fournisseur après un appel. Un seul par essai ; en ajout seul.';

alter table public.provider_charges enable row level security;
alter table public.provider_charge_settlements enable row level security;

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['provider_charges', 'provider_charge_settlements']
  loop
    execute format(
      $f$
        create policy "Les administrateurs lisent les coûts fournisseurs"
          on public.%I for select
          to authenticated
          using ((select public.is_admin()))
      $f$,
      nom_table
    );
    execute format(
      $f$
        create policy "Mode privé : administrateurs uniquement"
          on public.%I
          as restrictive
          for all
          to authenticated
          using (not (select public.mode_prive()) or (select public.is_admin()))
          with check (not (select public.mode_prive()) or (select public.is_admin()))
      $f$,
      nom_table
    );
    execute format('revoke all on table public.%I from anon, authenticated', nom_table);
    execute format('grant select on table public.%I to authenticated', nom_table);
    execute format(
      $f$
        create trigger %I
          before update or delete on public.%I
          for each row
          execute function public.registre_en_ajout_seul()
      $f$,
      nom_table || '_ajout_seul',
      nom_table
    );
    execute format(
      $f$
        create trigger %I
          before truncate on public.%I
          for each statement
          execute function public.registre_en_ajout_seul()
      $f$,
      nom_table || '_pas_de_vidage',
      nom_table
    );
  end loop;
end;
$$;

-- Dépense du mois civil en cours (UTC) : le montant confirmé quand il est
-- connu, la provision sinon — un appel en cours compte donc au pire.
create or replace function public.depense_ia_du_mois()
returns numeric
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(coalesce(s.usd, c.estimated_usd)), 0)
  from public.provider_charges c
  left join public.provider_charge_settlements s on s.attempt_id = c.attempt_id
  where (c.created_at at time zone 'utc') >= date_trunc('month', now() at time zone 'utc');
$$;

-- ---------------------------------------------------------------------------
-- Propositions
-- ---------------------------------------------------------------------------

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  -- Une tâche, une proposition.
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  studio_id uuid not null references public.studios (id) on delete cascade,
  project_id uuid not null,
  action text not null,
  content text not null,
  profile text not null,
  model text not null,
  state text not null default 'proposed',
  -- Texte retenu à l'acceptation : la proposition, ou sa version modifiée.
  final_content text,
  -- Texte en place avant l'acceptation : rien n'est remplacé sans trace.
  replaced_content text,
  decided_by uuid,
  decided_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),

  constraint proposition_etat_connu check (state in ('proposed', 'accepted', 'dismissed')),
  constraint proposition_non_vide check (char_length(btrim(content)) between 1 and 20000),
  constraint proposition_decision check ((state = 'proposed') = (decided_at is null))
);

comment on table public.ai_suggestions is
  'Proposition d''un agent : jamais appliquée d''elle-même. Lue par l''équipe du projet ; appliquée ou écartée par les fonctions.';

create index ai_suggestions_project_idx on public.ai_suggestions (project_id, action, created_at desc);

alter table public.ai_suggestions enable row level security;

create policy "L'équipe du projet et les administrateurs lisent les propositions"
  on public.ai_suggestions for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_suggestions
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

revoke all on table public.ai_suggestions from anon, authenticated;
grant select on table public.ai_suggestions to authenticated;

-- Une proposition ne change que pour être appliquée ou écartée, une fois ;
-- son texte et son origine ne changent jamais.
create or replace function public.controler_proposition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Une proposition ne se supprime pas.' using errcode = '42501';
  end if;

  if (new.id, new.job_id, new.studio_id, new.project_id, new.action, new.content, new.profile,
      new.model, new.created_by, new.created_at)
     is distinct from
     (old.id, old.job_id, old.studio_id, old.project_id, old.action, old.content, old.profile,
      old.model, old.created_by, old.created_at) then
    raise exception 'Le texte et l''origine d''une proposition ne changent pas.'
      using errcode = '42501';
  end if;

  if old.state <> 'proposed' then
    raise exception 'Une proposition déjà appliquée ou écartée ne change plus.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger ai_suggestions_controle
  before update or delete on public.ai_suggestions
  for each row
  execute function public.controler_proposition();

create trigger ai_suggestions_pas_de_vidage
  before truncate on public.ai_suggestions
  for each statement
  execute function public.registre_en_ajout_seul();

-- Un administrateur qui écarte la proposition d'un projet dont il n'est pas
-- membre intervient sur ce projet.
create trigger ai_suggestions_journal_admin
  before update on public.ai_suggestions
  for each row
  execute function public.journaliser_intervention_admin();

-- ---------------------------------------------------------------------------
-- Fonctions du worker
-- ---------------------------------------------------------------------------

-- Fiche du projet de la tâche que le worker tient, et rien d'autre : ni
-- documents, ni budget, ni équipe, ni identité. Aucune ligne si l'essai
-- n'est pas l'essai en cours d'une tâche en cours.
create or replace function public.contexte_travail(p_attempt_id uuid)
returns table (
  title text,
  format text,
  stage text,
  logline text,
  synopsis text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.title, p.format::text, p.stage::text, p.logline, p.synopsis
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  join public.projects p on p.id = j.project_id
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted');
$$;

-- Avant l'appel : inscrit ce qu'il coûterait au pire, et le refuse si le
-- plafond du mois serait dépassé (IA001). Le verrou sur le réglage
-- sérialise les provisions : deux appels simultanés ne se partagent pas le
-- même reste. Le message ne porte aucun montant : il est lu par l'équipe du
-- projet, à qui le budget interne n'a pas à être montré.
create or replace function public.provisionner_cout(
  p_attempt_id uuid,
  p_provider text,
  p_model text,
  p_profile text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_usd numeric
)
returns public.provider_charges
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_charge public.provider_charges;
  v_essai public.job_attempts;
  v_job public.jobs;
  v_plafond numeric;
begin
  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is not null then
    return v_charge;
  end if;

  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours : ne rien envoyer.' using errcode = 'TR001';
  end if;

  if p_usd is null or p_usd < 0 or p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'Provision invalide.' using errcode = '22023';
  end if;

  select s.monthly_budget_usd into v_plafond from public.ai_settings s for update;

  if public.depense_ia_du_mois() + p_usd > v_plafond then
    raise exception 'Plafond mensuel des dépenses d''IA atteint.' using errcode = 'IA001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;

  insert into public.provider_charges (
    attempt_id, job_id, studio_id, project_id, provider, model, profile,
    estimated_input_tokens, estimated_output_tokens, estimated_usd
  )
  values (
    p_attempt_id, v_job.id, v_job.studio_id, v_job.project_id, p_provider, p_model, p_profile,
    p_input_tokens, p_output_tokens, p_usd
  )
  returning * into v_charge;

  return v_charge;
end;
$$;

-- Après l'appel : l'usage que le fournisseur a facturé, que la tâche
-- aboutisse ou non, et même si elle a été récupérée entre-temps — la
-- dépense a eu lieu. Une seule confirmation par essai ; la rejouer renvoie
-- la première.
create or replace function public.confirmer_cout(
  p_attempt_id uuid,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_usd numeric,
  p_fallback boolean default false
)
returns public.provider_charge_settlements
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reglement public.provider_charge_settlements;
begin
  select s.* into v_reglement
  from public.provider_charge_settlements s
  where s.attempt_id = p_attempt_id;
  if v_reglement.attempt_id is not null then
    return v_reglement;
  end if;

  if not exists (select 1 from public.provider_charges c where c.attempt_id = p_attempt_id) then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  insert into public.provider_charge_settlements (
    attempt_id, model, input_tokens, output_tokens, usd, fallback
  )
  values (p_attempt_id, p_model, p_input_tokens, p_output_tokens, p_usd, coalesce(p_fallback, false))
  returning * into v_reglement;

  return v_reglement;
end;
$$;

-- Dépose la proposition et conclut l'essai, dans la même transaction : pas
-- de tâche réussie sans proposition, ni l'inverse. Le texte est contrôlé
-- ici aussi : le worker n'est pas cru sur parole.
create or replace function public.livrer_proposition(p_attempt_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_essai public.job_attempts;
  v_job public.jobs;
  v_charge public.provider_charges;
  v_texte text := btrim(coalesce(p_content, ''));
  v_proposition uuid;
begin
  v_essai := public.essai_courant(p_attempt_id);
  if v_essai.id is null or v_essai.state <> 'submitted' then
    raise exception 'Cet essai n''est plus en cours.' using errcode = 'TR001';
  end if;

  select j.* into v_job from public.jobs j where j.id = v_essai.job_id;
  select c.* into v_charge from public.provider_charges c where c.attempt_id = p_attempt_id;
  if v_charge.attempt_id is null then
    raise exception 'Aucun coût provisionné pour cet essai.' using errcode = 'IA002';
  end if;

  if v_job.action <> 'logline' then
    raise exception 'Aucune proposition n''est prévue pour l''action %.', v_job.action
      using errcode = '0A000';
  end if;
  if char_length(v_texte) not between 1 and 500 or v_texte ~ '[\n\r]' then
    raise exception 'Logline invalide : un seul paragraphe, de 1 à 500 caractères.'
      using errcode = '22023';
  end if;

  insert into public.ai_suggestions (
    job_id, studio_id, project_id, action, content, profile, model, created_by
  )
  values (
    v_job.id, v_job.studio_id, v_job.project_id, v_job.action, v_texte, v_charge.profile,
    coalesce(
      (select s.model from public.provider_charge_settlements s where s.attempt_id = p_attempt_id),
      v_charge.model
    ),
    v_job.created_by
  )
  returning id into v_proposition;

  perform public.terminer_tentative(p_attempt_id, true, null, null);

  return v_proposition;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions des comptes connectés
-- ---------------------------------------------------------------------------

-- Applique une proposition au projet : le porteur ou un éditeur seulement —
-- un administrateur ne réécrit pas le projet d'un auteur. Le texte peut
-- avoir été modifié avant d'être appliqué ; celui qu'il remplace est
-- conservé dans la proposition. Rejouer renvoie la proposition appliquée.
create or replace function public.accepter_proposition(
  p_suggestion_id uuid,
  p_content text default null
)
returns public.ai_suggestions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_proposition public.ai_suggestions;
  v_final text;
  v_ancien text;
begin
  select s.* into v_proposition
  from public.ai_suggestions s
  where s.id = p_suggestion_id
  for update;

  if v_proposition.id is null
     or (select auth.uid()) is null
     or (public.mode_prive() and not public.is_admin())
     or not coalesce(public.acces_au_projet(v_proposition.project_id) in ('owner', 'editor'), false) then
    raise exception 'Proposition introuvable, ou droits insuffisants pour l''appliquer.'
      using errcode = '42501';
  end if;

  if v_proposition.state = 'accepted' then
    return v_proposition;
  end if;
  if v_proposition.state <> 'proposed' then
    raise exception 'Cette proposition a déjà été écartée.' using errcode = 'PR001';
  end if;

  v_final := coalesce(nullif(btrim(p_content), ''), v_proposition.content);

  if v_proposition.action <> 'logline' then
    raise exception 'Cette proposition ne peut pas encore être appliquée.' using errcode = '0A000';
  end if;
  if char_length(v_final) > 500 then
    raise exception 'Le pitch ne peut pas dépasser 500 caractères.' using errcode = '22023';
  end if;

  select p.logline into v_ancien
  from public.projects p
  where p.id = v_proposition.project_id
  for update;

  update public.projects set logline = v_final where id = v_proposition.project_id;

  update public.ai_suggestions
  set state = 'accepted',
      final_content = v_final,
      replaced_content = v_ancien,
      decided_by = (select auth.uid()),
      decided_at = now()
  where id = v_proposition.id
  returning * into v_proposition;

  return v_proposition;
end;
$$;

-- Écarte une proposition : le porteur, un éditeur ou un administrateur.
-- Rien n'est écrit dans le projet.
create or replace function public.ecarter_proposition(p_suggestion_id uuid)
returns public.ai_suggestions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_proposition public.ai_suggestions;
begin
  select s.* into v_proposition
  from public.ai_suggestions s
  where s.id = p_suggestion_id
  for update;

  if v_proposition.id is null or not public.peut_engager_unites(v_proposition.project_id) then
    raise exception 'Proposition introuvable, ou droits insuffisants pour l''écarter.'
      using errcode = '42501';
  end if;

  if v_proposition.state = 'dismissed' then
    return v_proposition;
  end if;
  if v_proposition.state <> 'proposed' then
    raise exception 'Cette proposition a déjà été appliquée.' using errcode = 'PR001';
  end if;

  update public.ai_suggestions
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_proposition.id
  returning * into v_proposition;

  return v_proposition;
end;
$$;

-- ---------------------------------------------------------------------------
-- Limite de débit des devis
-- ---------------------------------------------------------------------------

create index quotes_created_by_created_at_idx on public.quotes (created_by, created_at);

-- Dix devis par minute et par compte : au-delà, ce n'est plus une personne
-- qui hésite. L'exploitant, en SQL direct, n'est pas limité.
create or replace function public.limiter_debit_devis()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is not null
     and (
       select count(*)
       from public.quotes q
       where q.created_by = new.created_by
         and q.created_at > now() - interval '1 minute'
     ) >= 10 then
    raise exception 'Trop de demandes en une minute : patientez un instant.'
      using errcode = 'DV005';
  end if;

  return new;
end;
$$;

create trigger quotes_debit
  before insert on public.quotes
  for each row
  execute function public.limiter_debit_devis();

-- ---------------------------------------------------------------------------
-- Journal d'administration
-- ---------------------------------------------------------------------------

alter table public.admin_audit_log
  drop constraint action_connue,
  add constraint action_connue check (
    action in (
      'changement_role',
      'modification_profil',
      'mode_prive',
      'suppression_projet',
      'intervention_contenu',
      'intervention_studio',
      'publication_plan',
      'changement_plan_studio',
      'publication_bareme',
      'rapprochement_travail',
      'plafond_ia'
    )
  );

-- Avant l'écriture, dans la même transaction, comme pour le mode privé.
create or replace function public.journaliser_plafond_ia()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.journaliser(
    'plafond_ia',
    null,
    jsonb_build_object('ancien', old.monthly_budget_usd, 'nouveau', new.monthly_budget_usd)
  );
  return new;
end;
$$;

create trigger ai_settings_journal
  before update of monthly_budget_usd on public.ai_settings
  for each row
  when (old.monthly_budget_usd is distinct from new.monthly_budget_usd)
  execute function public.journaliser_plafond_ia();

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

revoke all on function public.depense_ia_du_mois() from public, anon, authenticated;
revoke all on function public.controler_proposition() from public, anon, authenticated;
revoke all on function public.limiter_debit_devis() from public, anon, authenticated;
revoke all on function public.journaliser_plafond_ia() from public, anon, authenticated;

-- Le worker : lire la fiche de sa tâche, provisionner, confirmer, livrer.
revoke all on function public.contexte_travail(uuid) from public, anon, authenticated;
revoke all on function public.provisionner_cout(uuid, text, text, text, integer, integer, numeric) from public, anon, authenticated;
revoke all on function public.confirmer_cout(uuid, text, integer, integer, numeric, boolean) from public, anon, authenticated;
revoke all on function public.livrer_proposition(uuid, text) from public, anon, authenticated;

grant execute on function public.contexte_travail(uuid) to filmfund_worker;
grant execute on function public.provisionner_cout(uuid, text, text, text, integer, integer, numeric) to filmfund_worker;
grant execute on function public.confirmer_cout(uuid, text, integer, integer, numeric, boolean) to filmfund_worker;
grant execute on function public.livrer_proposition(uuid, text) to filmfund_worker;

-- Les comptes connectés : appliquer ou écarter une proposition.
revoke all on function public.accepter_proposition(uuid, text) from public, anon, authenticated;
grant execute on function public.accepter_proposition(uuid, text) to authenticated;
revoke all on function public.ecarter_proposition(uuid) from public, anon, authenticated;
grant execute on function public.ecarter_proposition(uuid) to authenticated;
