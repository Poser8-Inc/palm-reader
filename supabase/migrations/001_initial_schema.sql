-- Palm Reader — Initial Schema
-- Run via: supabase db push

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Profiles ──────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  readings_used   integer not null default 0,
  is_premium      boolean not null default false,
  premium_expires_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Row level security
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on auth signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Readings ──────────────────────────────────────────────────────────────────
create table if not exists public.readings (
  id              uuid primary key default uuid_generate_v4(),
  user_id         text not null,  -- text allows 'anonymous' for non-auth users
  image_url       text,           -- Supabase Storage URL (future)
  image_thumbnail text,           -- base64 jpeg thumbnail for local display
  heart_line      text,
  head_line       text,
  life_line       text,
  fate_line       text,
  mounts          text,
  overall         text,
  raw_reading     text,           -- full raw Claude response
  created_at      timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists readings_user_id_idx on public.readings(user_id);
create index if not exists readings_created_at_idx on public.readings(created_at desc);

-- Row level security
alter table public.readings enable row level security;

create policy "Users can view their own readings"
  on public.readings for select
  using (auth.uid()::text = user_id or user_id = 'anonymous');

create policy "Users can insert their own readings"
  on public.readings for insert
  with check (auth.uid()::text = user_id or user_id = 'anonymous');

-- Service role bypass (for edge function inserts)
create policy "Service role can do everything"
  on public.readings for all
  using (auth.role() = 'service_role');

-- ── Helper function for incrementing readings_used ────────────────────────────
create or replace function public.increment_readings_used(user_uuid uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set readings_used = readings_used + 1, updated_at = now()
  where id = user_uuid;
end;
$$;

-- ── Updated_at auto-update trigger ────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
