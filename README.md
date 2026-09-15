# Ringo / 링고

A bilingual digital-content marketplace prototype with an English storefront, Korean review mode, role-based demo workspaces, product deep links and simulated purchases.

## Current state

This is a browser-local demo, not a production payment or authentication system. PostgreSQL schema for the future AWS backend is in `db/schema.postgres.sql`; it is not connected yet. Full status and next steps: `IMPLEMENTATION.md`.

## Project

- `components/ringo.tsx`: storefront and role-specific interfaces
- `lib/ringo/data.ts`: sample products, types and original back-office menu map
- `app/globals.css`: responsive theme
- `public/images`: generated product artwork
- `db/schema.postgres.sql`: planned AWS PostgreSQL schema

Use the existing pnpm lockfile and the Node version required by `package.json`. The current `dev` and `build` scripts target the preview runtime. For a later Windows/AWS move, first configure the portable execution profile and follow `IMPLEMENTATION.md`; the hosted Workers output itself is not an AWS deployment package.
