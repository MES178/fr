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

## Optional Cloud Sync

GitHub Pages is static hosting, so cross-browser history needs an external database. This app supports optional Supabase sync without npm or build tools.

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase/schema.sql`.
3. If you change `syncId` in `js/cloud-config.js`, also replace `french-tracker-main` in the SQL policies before running them.
4. In `js/cloud-config.js`, set:
   - `enabled: true`
   - `supabaseUrl` to your Supabase project URL
   - `supabaseAnonKey` to your public anon/publishable key
   - `syncId` to your chosen row ID
5. Deploy the folder to GitHub Pages.

The app still saves to localStorage first. When cloud sync is enabled, it also stores one JSON record in Supabase so Safari and Chrome can share the same history.
