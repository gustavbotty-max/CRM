-- CRM Lite Supabase schema / migration
-- Run this in Supabase Dashboard → SQL Editor for project lsfpyorhhhrjssurjpur.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(created_by, slug)
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'automation')),
  created_at timestamptz not null default now(),
  unique(workspace_id, email)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  contact text,
  stage text not null default 'prospect' check (stage in ('prospect', 'contacted', 'qualified', 'meeting', 'followup')),
  priority text not null default 'warm' check (priority in ('hot', 'warm', 'medium', 'low')),
  phone text,
  email text,
  website text,
  next_action_date date,
  tags text[] not null default '{}',
  notes text,
  source text default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.leads add column if not exists source text default 'manual';

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  activity_type text not null default 'note' check (activity_type in ('note', 'call', 'meeting', 'voice_note', 'transcript', 'email', 'task')),
  body text not null,
  next_action text,
  next_action_date date,
  source text default 'manual',
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

-- Security-definer helpers prevent recursive RLS policy checks on membership tables.
create or replace function public.is_workspace_member(workspace uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace
      and (wm.user_id = auth.uid() or lower(wm.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

create or replace function public.is_workspace_admin(workspace uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace
      and wm.role in ('owner', 'admin')
      and (wm.user_id = auth.uid() or lower(wm.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

-- Backfill one personal workspace for any existing leads that predate workspace support.
insert into public.workspaces (name, slug, created_by)
select 'Personal CRM', 'personal-crm', l.user_id
from public.leads l
where l.workspace_id is null
  and not exists (
    select 1 from public.workspaces w
    where w.created_by = l.user_id and w.slug = 'personal-crm'
  )
group by l.user_id;

insert into public.workspace_members (workspace_id, user_id, email, role)
select w.id, w.created_by, coalesce(u.email, 'unknown@example.com'), 'owner'
from public.workspaces w
left join auth.users u on u.id = w.created_by
where w.created_by is not null
  and not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = w.id and wm.user_id = w.created_by
  );

update public.leads l
set workspace_id = w.id
from public.workspaces w
where l.workspace_id is null
  and w.created_by = l.user_id
  and w.slug = 'personal-crm';

alter table public.leads alter column workspace_id set not null;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

-- Replace old lead-only policies if present.
drop policy if exists "Users can read their own leads" on public.leads;
drop policy if exists "Users can insert their own leads" on public.leads;
drop policy if exists "Users can update their own leads" on public.leads;
drop policy if exists "Users can delete their own leads" on public.leads;
drop policy if exists "Workspace members can read leads" on public.leads;
drop policy if exists "Workspace members can insert leads" on public.leads;
drop policy if exists "Workspace members can update leads" on public.leads;
drop policy if exists "Workspace members can delete leads" on public.leads;
drop policy if exists "Workspace members can read workspaces" on public.workspaces;
drop policy if exists "Authenticated users can create workspaces" on public.workspaces;
drop policy if exists "Workspace admins can update workspaces" on public.workspaces;
drop policy if exists "Members can read workspace memberships" on public.workspace_members;
drop policy if exists "Users can create their own membership" on public.workspace_members;
drop policy if exists "Workspace admins can manage memberships" on public.workspace_members;
drop policy if exists "Workspace admins can delete memberships" on public.workspace_members;
drop policy if exists "Workspace members can read activities" on public.lead_activities;
drop policy if exists "Workspace members can insert activities" on public.lead_activities;
drop policy if exists "Workspace members can update activities" on public.lead_activities;
drop policy if exists "Workspace members can delete activities" on public.lead_activities;

create policy "Workspace members can read workspaces"
  on public.workspaces for select
  using (public.is_workspace_member(id) or created_by = auth.uid());

create policy "Authenticated users can create workspaces"
  on public.workspaces for insert
  with check (created_by = auth.uid());

create policy "Workspace admins can update workspaces"
  on public.workspaces for update
  using (public.is_workspace_admin(id) or created_by = auth.uid())
  with check (public.is_workspace_admin(id) or created_by = auth.uid());

create policy "Members can read workspace memberships"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id) or user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "Users can create their own membership"
  on public.workspace_members for insert
  with check (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_workspace_admin(workspace_id));

create policy "Workspace admins can manage memberships"
  on public.workspace_members for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "Workspace admins can delete memberships"
  on public.workspace_members for delete
  using (public.is_workspace_admin(workspace_id));

create policy "Workspace members can read leads"
  on public.leads for select
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can insert leads"
  on public.leads for insert
  with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());

create policy "Workspace members can update leads"
  on public.leads for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "Workspace members can delete leads"
  on public.leads for delete
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can read activities"
  on public.lead_activities for select
  using (public.is_workspace_member(workspace_id));

create policy "Workspace members can insert activities"
  on public.lead_activities for insert
  with check (public.is_workspace_member(workspace_id) and (user_id = auth.uid() or user_id is null));

create policy "Workspace members can update activities"
  on public.lead_activities for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "Workspace members can delete activities"
  on public.lead_activities for delete
  using (public.is_workspace_member(workspace_id));

create index if not exists workspaces_created_by_idx on public.workspaces(created_by);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists workspace_members_email_idx on public.workspace_members(lower(email));
create index if not exists leads_workspace_stage_idx on public.leads(workspace_id, stage);
create index if not exists leads_workspace_updated_idx on public.leads(workspace_id, updated_at desc);
create index if not exists leads_tags_idx on public.leads using gin(tags);
create index if not exists lead_activities_workspace_created_idx on public.lead_activities(workspace_id, created_at desc);
create index if not exists lead_activities_lead_created_idx on public.lead_activities(lead_id, created_at desc);
