# French Habit Tracker

A static, mobile-first French study habit tracker for GitHub Pages.

## Structure

- `index.html` - page markup
- `css/styles.css` - visual design and responsive layout
- `js/app.js` - localStorage data model, calendar, stats, charts, import/export, cloud sync
- `js/cloud-config.js` - optional Supabase configuration for syncing across browsers
- `assets/icons/` - favicon and app icons
- `assets/images/` - future local images
- `supabase/schema.sql` - optional database table and policies

## Deploy

Upload the contents of this folder to GitHub Pages. No build step, backend, or dependencies are required.

## Private Cloud Sync With Supabase Auth

GitHub Pages is static hosting, so cross-browser history needs an external database. This app uses Supabase Auth and RLS so only the signed-in user can read or write their history.

1. Create a Supabase project.
2. In Supabase, go to Authentication -> Providers and keep Email enabled.
3. In Authentication -> URL Configuration, add your GitHub Pages URL to the allowed redirect/site URLs.
4. Open the Supabase SQL editor and run `supabase/schema.sql`.
5. In `js/cloud-config.js`, set:
   - `enabled: true`
   - `supabaseUrl` to your Supabase project URL
   - `supabaseAnonKey` to your public anon/publishable key
6. Deploy the folder to GitHub Pages.

The app still saves to user-scoped localStorage first. When cloud sync is enabled and the user is signed in, it stores one JSON record in Supabase under that user's `auth.uid()`.
