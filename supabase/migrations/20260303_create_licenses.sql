create extension if not exists pgcrypto;

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  license_key text,
  license_key_masked text,
  plan text not null default 'free' check (plan in ('free', 'trial', 'pro')),
  trial_device_id text,
  trial_start timestamptz,
  trial_end timestamptz,
  purchase_date timestamptz,
  gumroad_sale_id text,
  gumroad_product_id text,
  gumroad_variant_id text,
  gumroad_refunded boolean not null default false,
  gumroad_disputed boolean not null default false,
  raw_gumroad jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists licenses_license_key_unique_idx
on public.licenses (license_key)
where license_key is not null;

create unique index if not exists licenses_trial_device_unique_idx
on public.licenses (trial_device_id)
where trial_device_id is not null;

create index if not exists licenses_plan_idx on public.licenses (plan);
create index if not exists licenses_trial_end_idx on public.licenses (trial_end);
create index if not exists licenses_updated_at_idx on public.licenses (updated_at desc);

create table if not exists public.license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id text not null,
  device_name text,
  app_version text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  released_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (license_id, device_id)
);

create index if not exists license_devices_license_active_idx
on public.license_devices (license_id, is_active, last_seen_at desc);

alter table public.licenses enable row level security;
alter table public.license_devices enable row level security;

drop policy if exists "service_role_full_access_licenses" on public.licenses;
create policy "service_role_full_access_licenses"
on public.licenses
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role_full_access_license_devices" on public.license_devices;
create policy "service_role_full_access_license_devices"
on public.license_devices
for all
to service_role
using (true)
with check (true);
