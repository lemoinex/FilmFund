-- Couverture du mode privé.
--
-- La politique restrictive « Mode privé : administrateurs uniquement » doit
-- exister sur chaque table exposée de public dont la RLS est active. Une
-- table ajoutée sans elle échapperait au verrou : ce test fait échouer la CI.
--
-- Exception : app_settings, qui porte l'interrupteur lui-même et que les
-- politiques doivent pouvoir lire quel que soit le mode.

begin;

select plan(3);

select is_empty(
  $$
    select c.relname::text
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname <> 'app_settings'
      and not exists (
        select 1
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.policyname = 'Mode privé : administrateurs uniquement'
          and p.permissive = 'RESTRICTIVE'
      )
  $$,
  'Chaque table protégée porte la politique restrictive du mode privé'
);

select is(
  (select private_admin_only from public.app_settings where id),
  false,
  'Le mode privé est inactif par défaut après les migrations'
);

-- Le stockage des images suit le même verrou que les tables.
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Mode privé : administrateurs uniquement (images)'
      and permissive = 'RESTRICTIVE'
  ),
  1,
  'Les images portent la politique restrictive du mode privé'
);

select * from finish();

rollback;
