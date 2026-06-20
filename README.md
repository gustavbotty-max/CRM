# CRM Lite

A mobile-friendly visual CRM funnel for prospects and leads.

## Features

- Drag-and-drop funnel stages
- Add/edit/delete leads
- Notes, tags, priority, next action date
- Search/filter
- Magic-link login with Supabase Auth
- Supabase database sync across laptop/mobile
- JSON export backup
- Local fallback mode when Supabase env vars are missing

## Funnel stages

1. Prospects
2. Contacted
3. Qualified
4. Meeting / Sample
5. Follow-up / Won

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in:

```env
VITE_SUPABASE_URL=https://lsfpyorhhhrjssurjpur.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The URL is already set from the project ID Jonathan provided. The anon key comes from:

Supabase Dashboard → Project Settings → API → `anon public` key.

### 3. Create the database table

Run `supabase-schema.sql` in:

Supabase Dashboard → SQL Editor → New query → Run.

This creates the `leads` table, indexes, and row-level security policies so each authenticated user only sees their own leads.

### 4. Enable magic-link login

In Supabase:

Authentication → URL Configuration

Add your deployed URL to allowed redirect URLs once hosting is set up.

For local dev, also allow:

```text
http://localhost:5173
```

### 5. Run locally

```bash
npm run dev
```

Open the local URL Vite prints.

## Deployment

This is a static Vite app. It can deploy to GitHub Pages, Vercel, Netlify, or here.now.

Recommended first deployment: Vercel or Netlify because they handle Vite environment variables and SPA routing cleanly.

## Privacy note

Do not commit `.env`. It is ignored by git. The Supabase anon key is okay for frontend use only because Row Level Security protects data, but the service role key must never be exposed in this app.
