# Order & Delivery Tracking Website

Vanilla HTML, CSS, and JavaScript frontend for a three-role delivery platform backed by Supabase Auth, Postgres, Row Level Security, and Supabase Realtime.

## Run Locally

This app uses ES modules, so run it through a local static server:

```bash
npx serve .
```

Then open the printed local URL.

## Configure Supabase

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. In `js/config.js`, set:

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_ANON_KEY = "your-public-anon-key";
```

4. Create users through `register.html` or Supabase Auth.
5. Promote roles in SQL:

```sql
update public.profiles set role = 'ADMIN' where email = 'admin@example.com';
update public.profiles set role = 'DELIVERY_GUY' where email = 'driver@example.com';
```

## Security Model

- Passwords are handled by Supabase Auth and are never stored in localStorage.
- The frontend never trusts a locally stored role. Every protected page loads the authenticated user's profile from Supabase.
- RLS policies block customers from admin and delivery data.
- Customer GPS data is written only while an assigned active delivery exists.
- Delivery guys can see only deliveries assigned to them.
- Realtime channels subscribe to rows the current user can read under RLS.

## Demo Flow

1. Customer registers, adds products to cart, and places an order.
2. Admin logs in, confirms/prepares the order, assigns a delivery guy, and marks it out for delivery.
3. Delivery guy logs in, starts delivery, grants GPS permission, and updates status.
4. Customer opens tracking, grants GPS permission, and both sides see realtime location updates.
5. Delivery guy marks delivered. Location watchers stop and tracking data is cleared.
