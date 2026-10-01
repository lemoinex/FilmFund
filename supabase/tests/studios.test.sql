-- Studios, vus depuis le propriétaire de la base.
--
-- Ce que l'API ne montre pas : l'invariant laissé par la reprise de
-- l'existant, la protection du studio personnel face au SQL direct, et la
-- cascade à la suppression d'un compte.

begin;

select plan(5);

select is(
  (
    select count(*)::int
    from public.profiles p
    where not exists (
      select 1
      from public.studios s
      join public.studio_members m on m.studio_id = s.id and m.user_id = p.id and m.role = 'owner'
      where s.personal_owner_id = p.id
    )
  ),
  0,
  'Chaque compte a son studio personnel, dont il est propriétaire'
);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-00000000f001', 'porteur-studio@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-00000000f001', 'Projet du studio personnel');

select is(
  (
    select s.personal_owner_id
    from public.projects p
    join public.studios s on s.id = p.studio_id
    where p.id = '00000000-0000-0000-0000-0000000000f5'
  ),
  '00000000-0000-0000-0000-00000000f001'::uuid,
  'Un projet créé en SQL direct naît aussi dans le studio personnel de son porteur'
);

select throws_ok(
  $$ delete from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000f001' $$,
  '42501',
  null,
  'Le propriétaire de la base ne supprime pas directement un studio personnel'
);

select ok(
  has_function_privilege('authenticated', 'public.role_dans_studio(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.role_dans_studio(uuid)', 'execute'),
  'role_dans_studio() est ouverte aux comptes connectés, pas aux visiteurs'
);

-- Suppression du compte : studio personnel, adhésion et projets partent
-- ensemble, sans que la protection du studio personnel ne s'y oppose.
delete from public.profiles where id = '00000000-0000-0000-0000-00000000f001';

select is(
  (
    select count(*)::int from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000f001'
  ) + (
    select count(*)::int from public.studio_members where user_id = '00000000-0000-0000-0000-00000000f001'
  ) + (
    select count(*)::int from public.projects where id = '00000000-0000-0000-0000-0000000000f5'
  ),
  0,
  'La suppression d''un compte emporte son studio personnel, son adhésion et ses projets'
);

select * from finish();

rollback;
