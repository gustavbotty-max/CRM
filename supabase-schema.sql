-- CRM Lite Supabase schema
-- Run this in Supabase Dashboard → SQL Editor for project lsfpyorhhhrjssurjpur.

create extension if not exists pgcrypto;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;

create policy "Users can read their own leads"
  on public.leads for select
  using (auth.uid() = user_id);

create policy "Users can insert their own leads"
  on public.leads for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own leads"
  on public.leads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own leads"
  on public.leads for delete
  using (auth.uid() = user_id);

create index if not exists leads_user_stage_idx on public.leads(user_id, stage);
create index if not exists leads_user_updated_idx on public.leads(user_id, updated_at desc);
create index if not exists leads_tags_idx on public.leads using gin(tags);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();
