-- ============================================================
-- SeatCover OMS — Supabase database schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- 1. PROFILES TABLE (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  role text not null default 'sales' check (role in ('admin', 'sales', 'production', 'shipping')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Profiles: users can read all profiles, update only their own
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select using (auth.role() = 'authenticated');

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Admins can update any profile"
  on public.profiles for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'sales')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. ORDERS TABLE
create table public.orders (
  id uuid default gen_random_uuid() primary key,
  order_ref text unique not null,
  customer_name text not null,
  phone text,
  email text,
  car text not null,
  vin text,
  seats text default 'Full set (5)',
  color text,
  source text default 'Manual' check (source in ('Shopify', 'eBay', 'Manual')),
  stage text default 'New' check (stage in (
    'New', 'Awaiting verification', 'Verified',
    'In production', 'Production completed', 'Packed', 'Shipped'
  )),
  notes text,
  order_date date default current_date,
  photos jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.orders enable row level security;

-- Orders: all authenticated users can read; only admin/sales/production can write
create policy "Orders viewable by authenticated users"
  on public.orders for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert orders"
  on public.orders for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update orders"
  on public.orders for update using (auth.role() = 'authenticated');

create policy "Only admins can delete orders"
  on public.orders for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger orders_updated_at
  before update on public.orders
  for each row execute procedure public.set_updated_at();


-- 3. STORAGE BUCKET for order photos
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', true);

create policy "Anyone authenticated can upload photos"
  on storage.objects for insert
  with check (bucket_id = 'order-photos' and auth.role() = 'authenticated');

create policy "Photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'order-photos');

create policy "Authenticated users can delete photos"
  on storage.objects for delete
  using (bucket_id = 'order-photos' and auth.role() = 'authenticated');


-- 4. SEED DATA (optional — delete this section after first run if you want a clean start)
insert into public.orders (order_ref, customer_name, phone, email, car, vin, seats, color, source, stage, notes, order_date)
values
  ('SC-1001', 'Erik Lindqvist',  '0701234567', 'erik@example.com',   'Volvo XC60 2021',      'YV1BZBAB0M2345678', 'Full set (5)', 'Black/Grey',  'Shopify', 'Awaiting verification', 'Extra padding on driver seat', '2026-03-24'),
  ('SC-1002', 'Anna Karlsson',   '0709876543', 'anna@example.com',   'BMW 3 Series 2019',    'WBA5E1C50KAJ12345', 'Front pair',   'Beige',       'eBay',    'In production',          '',                            '2026-03-23'),
  ('SC-1003', 'Lars Pettersson', '0731112233', 'lars@example.com',   'Toyota Corolla 2022',  'JTDBRMFE0N3001234', 'Full set (5)', 'Navy Blue',   'Manual',  'New',                   'Urgent — needed by Friday',   '2026-03-25'),
  ('SC-1004', 'Maria Svensson',  '0762223344', 'maria@example.com',  'Audi A4 2020',         'WAUZZZF40LA012345', 'Front pair',   'Black',       'Shopify', 'Production completed',  '',                            '2026-03-20'),
  ('SC-1005', 'Johan Berg',      '0703334455', 'johan@example.com',  'VW Golf 2018',         'WVWZZZ1KZ7W123456', 'Full set (5)', 'Dark Grey',   'eBay',    'Packed',                'Include installation guide',  '2026-03-19'),
  ('SC-1006', 'Sofia Nilsson',   '0704445566', 'sofia@example.com',  'Skoda Octavia 2023',   'TMBHE7NE5N0123456', 'Rear bench',  'Charcoal',    'Manual',  'Shipped',               '',                            '2026-03-17');
