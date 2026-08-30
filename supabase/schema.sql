create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('CUSTOMER', 'ADMIN', 'DELIVERY_GUY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('ORDER_PLACED', 'CONFIRMED', 'PREPARING', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_status as enum ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text,
  address text,
  role public.user_role not null default 'CUSTOMER',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  price numeric(10,2) not null check (price >= 0),
  category text not null,
  image_url text not null,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  status public.order_status not null default 'ORDER_PLACED',
  delivery_address text not null,
  delivery_instructions text,
  total numeric(10,2) not null default 0,
  eta_minutes int not null default 35,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  delivery_guy_id uuid not null references public.profiles(id),
  status public.delivery_status not null default 'ASSIGNED',
  customer_lat double precision,
  customer_lng double precision,
  driver_lat double precision,
  driver_lng double precision,
  sharing_active boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  note text,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create or replace function public.current_role()
returns public.user_role
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.touch_order()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists touch_orders on public.orders;
create trigger touch_orders before update on public.orders for each row execute function public.touch_order();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create or replace function public.guard_order_update()
returns trigger language plpgsql security definer as $$
declare
  actor_role public.user_role;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role = 'CUSTOMER' then
    if old.customer_id <> auth.uid() then
      raise exception 'Customers can update only their own orders';
    end if;
    if new.status <> 'CANCELLED' or old.status not in ('ORDER_PLACED', 'CONFIRMED') then
      raise exception 'Customers can only cancel early orders';
    end if;
    new.customer_id := old.customer_id;
    new.delivery_address := old.delivery_address;
    new.delivery_instructions := old.delivery_instructions;
    new.total := old.total;
    new.eta_minutes := old.eta_minutes;
  elsif actor_role = 'DELIVERY_GUY' then
    if not exists (select 1 from public.deliveries d where d.order_id = old.id and d.delivery_guy_id = auth.uid()) then
      raise exception 'Delivery not assigned to this account';
    end if;
    if new.status not in ('CONFIRMED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED') then
      raise exception 'Invalid delivery status update';
    end if;
    new.customer_id := old.customer_id;
    new.delivery_address := old.delivery_address;
    new.delivery_instructions := old.delivery_instructions;
    new.total := old.total;
    new.eta_minutes := old.eta_minutes;
  elsif actor_role <> 'ADMIN' then
    raise exception 'Unauthorized order update';
  end if;
  return new;
end $$;

drop trigger if exists guard_orders on public.orders;
create trigger guard_orders before update on public.orders for each row execute function public.guard_order_update();

create or replace function public.stop_tracking_when_order_finishes()
returns trigger language plpgsql security definer as $$
begin
  if new.status in ('DELIVERED', 'CANCELLED') then
    update public.deliveries
    set sharing_active = false,
        customer_lat = null,
        customer_lng = null,
        driver_lat = null,
        driver_lng = null,
        updated_at = now()
    where order_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists stop_tracking_orders on public.orders;
create trigger stop_tracking_orders after update of status on public.orders for each row execute function public.stop_tracking_when_order_finishes();

create or replace function public.guard_delivery_update()
returns trigger language plpgsql security definer as $$
declare
  actor_role public.user_role;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role = 'CUSTOMER' then
    if not exists (select 1 from public.orders o where o.id = old.order_id and o.customer_id = auth.uid() and o.status = 'OUT_FOR_DELIVERY') then
      raise exception 'Customer location can be shared only during active delivery';
    end if;
    new.order_id := old.order_id;
    new.delivery_guy_id := old.delivery_guy_id;
    new.status := old.status;
    new.driver_lat := old.driver_lat;
    new.driver_lng := old.driver_lng;
  elsif actor_role = 'DELIVERY_GUY' then
    if old.delivery_guy_id <> auth.uid() then
      raise exception 'Delivery not assigned to this account';
    end if;
    new.order_id := old.order_id;
    new.delivery_guy_id := old.delivery_guy_id;
    new.customer_lat := old.customer_lat;
    new.customer_lng := old.customer_lng;
    new.sharing_active := old.sharing_active;
  elsif actor_role <> 'ADMIN' then
    raise exception 'Unauthorized delivery update';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists guard_deliveries on public.deliveries;
create trigger guard_deliveries before update on public.deliveries for each row execute function public.guard_delivery_update();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.order_events enable row level security;

drop policy if exists "profiles self or admin" on public.profiles;
create policy "profiles self or admin" on public.profiles for select using (id = auth.uid() or public.current_role() = 'ADMIN');
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products for select using (true);
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read" on storage.objects for select using (bucket_id = 'product-images');
drop policy if exists "product images admin write" on storage.objects;
create policy "product images admin write" on storage.objects for all using (bucket_id = 'product-images' and public.current_role() = 'ADMIN') with check (bucket_id = 'product-images' and public.current_role() = 'ADMIN');

drop policy if exists "orders scoped read" on public.orders;
create policy "orders scoped read" on public.orders for select using (
  customer_id = auth.uid()
  or public.current_role() = 'ADMIN'
  or exists (select 1 from public.deliveries d where d.order_id = id and d.delivery_guy_id = auth.uid())
);
drop policy if exists "customers create orders" on public.orders;
create policy "customers create orders" on public.orders for insert with check (customer_id = auth.uid() and public.current_role() = 'CUSTOMER');
drop policy if exists "orders scoped update" on public.orders;
create policy "orders scoped update" on public.orders for update using (
  public.current_role() = 'ADMIN'
  or customer_id = auth.uid()
  or exists (select 1 from public.deliveries d where d.order_id = id and d.delivery_guy_id = auth.uid())
);

drop policy if exists "order items scoped read" on public.order_items;
create policy "order items scoped read" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id)
);
drop policy if exists "customers add order items" on public.order_items;
create policy "customers add order items" on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
);

drop policy if exists "deliveries scoped read" on public.deliveries;
create policy "deliveries scoped read" on public.deliveries for select using (
  public.current_role() = 'ADMIN'
  or delivery_guy_id = auth.uid()
  or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid() and o.status in ('PICKED_UP','OUT_FOR_DELIVERY'))
);
drop policy if exists "admin manages deliveries" on public.deliveries;
create policy "admin manages deliveries" on public.deliveries for insert with check (public.current_role() = 'ADMIN');
drop policy if exists "delivery updates assigned" on public.deliveries;
create policy "delivery updates assigned" on public.deliveries for update using (
  public.current_role() = 'ADMIN'
  or delivery_guy_id = auth.uid()
  or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid() and o.status = 'OUT_FOR_DELIVERY')
);

drop policy if exists "events scoped read" on public.order_events;
create policy "events scoped read" on public.order_events for select using (exists (select 1 from public.orders o where o.id = order_id));
drop policy if exists "events scoped insert" on public.order_events;
create policy "events scoped insert" on public.order_events for insert with check (exists (select 1 from public.orders o where o.id = order_id));

insert into public.products (name, description, price, category, image_url, available)
values
('Harvest Grain Bowl', 'Roasted chicken, quinoa, greens, avocado, tomato relish, and citrus tahini.', 15.99, 'Meals', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80', true),
('Spiced Salmon Plate', 'Seared salmon, herbed rice, cucumber salad, and lemon yogurt.', 18.99, 'Meals', 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=80', true),
('Fresh Market Box', 'Seasonal fruit, vegetables, herbs, and pantry staples for the week.', 24.99, 'Grocery', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80', true),
('Iced Citrus Tea', 'Cold-brewed black tea with orange, lemon, mint, and light cane syrup.', 4.99, 'Drinks', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80', true)
on conflict do nothing;
