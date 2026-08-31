# Architecture

Technical decisions and the reasoning behind each are in
[`DECISIONS.md`](DECISIONS.md). This file describes the resulting shape.

## Layers

```
src/app/          Next.js App Router — pages, Server Actions, API routes
      │
src/server/       Data access and per-request authorization
      │
src/domain/       Business logic — pure, no UI and no HTTP
      │
src/db/           Drizzle schema and SQL migrations
      │
   Postgres                    S3-compatible object store
```

**The rule that matters:** no business rule lives in a component or a
route handler. Rules live in `src/domain`, which is testable without a UI
and without a database. Guards belong in the domain or service layer —
never only in the page, because a page is one of several ways to reach an
action.

| Directory | Contents |
|---|---|
| `src/app` | Pages, layouts, Server Actions, `api/` routes |
| `src/domain` | Business rules, permission matrix, pure functions |
| `src/server` | Repositories, services, session and actor resolution |
| `src/components` | Shared UI, `components/ui` from shadcn/ui |
| `src/db` | Schema, migrations, seed |
| `src/i18n` | Message catalogs and the translation container |

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL 17 |
| ORM | Drizzle, with hand-written SQL migrations |
| UI | Tailwind 4 + shadcn/ui |
| Tables | TanStack Table |
| Forms | react-hook-form + zod |
| Tests | Vitest — unit and integration |
| Files | S3-compatible object store |
| Passwords | argon2id |
| Deployment | Docker, Coolify |

Validation schemas are written once with zod and used by both the form and
the action, so client and server cannot disagree about what is valid.

## Data flow

A form submits to a Server Action. The action resolves the current actor,
calls a service, and the service calls domain functions to decide whether
the operation is allowed and what it should do. Only then does a
repository touch the database.

Permissions are read **from the database on every request**, never from
the session token. If they lived in the token, revoking access would have
no effect until the session expired.

## Localization

Nine languages with full RTL. The active locale is resolved per request
through a `cache()`-backed container.

⚠️ Layouts and pages render **in parallel** in the App Router, so data
fetching does not wait for the layout. Anything that needs the locale at
query time must await it explicitly rather than assume the layout has
already primed it.

## Testing

| Command | Scope |
|---|---|
| `pnpm test` | Unit — domain logic, no database |
| `pnpm test:db` | Integration — against a real Postgres |

Domain tests are cheap because `Actor` carries only identity and
permissions. Integration tests cover the paths where the wiring, not the
logic, is what breaks.
