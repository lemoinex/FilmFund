-- Intégrations IA : les clés des fournisseurs, rangées dans le coffre.
--
-- Décision de l'utilisateur (1er octobre 2026) : les clés ne se saisissent
-- plus dans Railway, mais depuis un écran d'administration, qui ne les
-- réaffiche jamais une fois enregistrées.
--
-- Où vit la clé : dans `vault.secrets`, chiffrée par Supabase avec une clé
-- qui ne vit pas dans la base. La table ci-dessous n'en garde que l'état :
-- quel fournisseur est configuré, par qui, et quand. Jamais la valeur.
--
-- Qui la lit : personne, sauf le worker, par `cle_fournisseur`, réservée à
-- son rôle. Ni l'application, ni les administrateurs, ni l'API ne la
-- relisent — l'écran n'affiche que l'état.
--
-- Ce que cela déplace : auparavant la base ne détenait aucune clé. Désormais,
-- un accès SQL au projet Supabase, ou le mot de passe du worker, permet de la
-- déchiffrer. Les garde-fous restent la limite de dépense chez le fournisseur,
-- le plafond mensuel interne (`ai_settings`) et la rotation depuis l'écran.
--
-- Retour arrière : retirer les fonctions, la table, puis les secrets du
-- coffre. Les clés enregistrées seraient perdues ; il faudrait les ressaisir
-- ailleurs. Le worker, sans clé, ne prend simplement aucune tâche.

-- ---------------------------------------------------------------------------
-- État des intégrations
-- ---------------------------------------------------------------------------

create table public.ai_provider_keys (
  provider text primary key,
  -- Renvoi vers `vault.secrets`. Connaître cet identifiant ne donne rien :
  -- le déchiffrement demande les droits du propriétaire de la base.
  secret_id uuid not null,
  configured_by uuid references auth.users (id) on delete set null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fournisseur_ia_connu check (provider in ('anthropic', 'openai'))
);

comment on table public.ai_provider_keys is
  'État des clés de fournisseurs d''IA : qui a configuré quoi, et quand. La clé elle-même est dans le coffre, jamais ici.';

alter table public.ai_provider_keys enable row level security;

create policy "Les administrateurs lisent l'état des intégrations"
  on public.ai_provider_keys for select
  to authenticated
  using ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.ai_provider_keys
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Lecture seule par l'API : l'écriture passe par les fonctions ci-dessous,
-- qui seules savent tenir le coffre et la table d'accord.
revoke all on table public.ai_provider_keys from anon, authenticated;
grant select on table public.ai_provider_keys to authenticated;

create trigger ai_provider_keys_avant_update
  before update on public.ai_provider_keys
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Fonctions de l'administration
-- ---------------------------------------------------------------------------

-- Enregistre ou remplace la clé d'un fournisseur. Le secret entre dans le
-- coffre ; la table n'en garde que l'état. Aucun message, aucun journal ne
-- reprend la valeur, même tronquée.
create or replace function public.definir_cle_fournisseur(p_provider text, p_cle text)
returns public.ai_provider_keys
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_provider_keys;
  v_secret uuid;
  v_cle text := btrim(coalesce(p_cle, ''));
  v_operation text;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Action réservée à l''administration.' using errcode = '42501';
  end if;

  if p_provider is null or p_provider not in ('anthropic', 'openai') then
    raise exception 'Fournisseur inconnu.' using errcode = '22023';
  end if;

  -- Bornes larges : les formats varient d'un fournisseur à l'autre. Une clé
  -- ne contient jamais d'espace ni de retour à la ligne ; ce contrôle attrape
  -- un copier-coller qui aurait emporté du texte autour.
  if char_length(v_cle) not between 20 and 500 or v_cle ~ '\s' then
    raise exception 'Clé invalide : de 20 à 500 caractères, sans espace ni retour à la ligne.'
      using errcode = '22023';
  end if;

  select k.* into v_ligne from public.ai_provider_keys k where k.provider = p_provider for update;

  if v_ligne.provider is null then
    v_operation := 'ajout';
    v_secret := vault.create_secret(
      v_cle,
      'ia_' || p_provider,
      'Clé d''API du fournisseur ' || p_provider || ', posée depuis l''écran Intégrations IA.'
    );
    insert into public.ai_provider_keys (provider, secret_id, configured_by)
    values (p_provider, v_secret, (select auth.uid()))
    returning * into v_ligne;
  else
    v_operation := 'remplacement';
    perform vault.update_secret(v_ligne.secret_id, v_cle);
    update public.ai_provider_keys k
    set configured_by = (select auth.uid()), configured_at = now()
    where k.provider = p_provider
    returning * into v_ligne;
  end if;

  perform public.journaliser(
    'cle_fournisseur',
    null,
    jsonb_build_object('fournisseur', p_provider, 'operation', v_operation)
  );

  return v_ligne;
end;
$$;

-- Retire la clé : le secret quitte le coffre, l'état disparaît. Le worker
-- cesse de prendre les tâches de ce fournisseur à sa prochaine relecture ;
-- celles déjà en file y restent, annulables par leur auteur.
create or replace function public.retirer_cle_fournisseur(p_provider text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ligne public.ai_provider_keys;
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Action réservée à l''administration.' using errcode = '42501';
  end if;

  select k.* into v_ligne from public.ai_provider_keys k where k.provider = p_provider for update;
  if v_ligne.provider is null then
    raise exception 'Aucune clé enregistrée pour ce fournisseur.' using errcode = 'IN001';
  end if;

  delete from public.ai_provider_keys k where k.provider = p_provider;
  delete from vault.secrets s where s.id = v_ligne.secret_id;

  perform public.journaliser(
    'cle_fournisseur',
    null,
    jsonb_build_object('fournisseur', p_provider, 'operation', 'retrait')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonction du worker
-- ---------------------------------------------------------------------------

-- La seule porte de sortie de la clé, et elle ne s'ouvre que pour le worker.
-- Null si le fournisseur n'est pas configuré : l'agent reste alors hors service.
create or replace function public.cle_fournisseur(p_provider text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.decrypted_secret
  from public.ai_provider_keys k
  join vault.decrypted_secrets s on s.id = k.secret_id
  where k.provider = p_provider;
$$;

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
      'plafond_ia',
      'cle_fournisseur'
    )
  );

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

-- La lecture de la clé n'est offerte qu'au worker. Un compte connecté qui
-- appellerait `cle_fournisseur` doit se heurter à un refus de droits, pas à
-- une valeur.
revoke all on function public.cle_fournisseur(text) from public, anon, authenticated;
grant execute on function public.cle_fournisseur(text) to filmfund_worker;

-- L'administration configure depuis l'écran ; les fonctions vérifient
-- elles-mêmes le rôle de l'appelant.
revoke all on function public.definir_cle_fournisseur(text, text) from public, anon, authenticated;
grant execute on function public.definir_cle_fournisseur(text, text) to authenticated;
revoke all on function public.retirer_cle_fournisseur(text) from public, anon, authenticated;
grant execute on function public.retirer_cle_fournisseur(text) to authenticated;
