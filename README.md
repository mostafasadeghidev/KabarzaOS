# KabarzaOS

Agency management — projects, team, clients, finance and reporting in a
single self-hosted web app, with full right-to-left support.

## Install on a server

```bash
git clone https://github.com/mostafasadeghidev/KabarzaOS.git && cd KabarzaOS
docker compose up -d --build
```

Docker is the only prerequisite. **No environment variables are
required**: secrets are generated on first boot, database migrations run
at startup, and the storage bucket creates itself.

Then open the address — the **setup wizard** creates the owner account
and signs you straight in.

Update:

```bash
git pull && docker compose up -d --build
```

Coolify, optional variables and backups: [`docs/DEPLOY.md`](docs/DEPLOY.md).

`install.sh` is also available. It does the same, and additionally
generates a unique database password, picks a free port and waits until
the app reports healthy.

## Features

- **Projects** — cards and detail view, tasks with role and priority,
  comments and reviews, QA checklists, attachments and links, tenders and
  bids, archiving and multi-stage deletion
- **People and clients** — roles, tags, offices, live presence,
  three-state off-boarding
- **Finance** — multi-currency ledger, accounts, transfers, recurring
  costs, payment requests, piecework, invoices, opening and closing
  fiscal periods
- **Reports** — ten tabs, CSV export, per-member and per-client detail
- **Time tracking** — server-side timer, manual entry, abandoned-timer
  nudge
- **Meetings** — invitations, multi-stage reminders, ICS export
- **Messaging** — conversations, one-way announcements, messages to
  management
- **Leave** — for yourself or, with permission, on behalf of a member
- **Notifications** — in-app, email and Telegram, with per-user opt-out
- **Scheduler** — reminders, upcoming meetings, abandoned timers, daily
  digest, automatic cleanup

## Access control

Five roles: owner, staff admin (section by section), finance, team
member, client.

Members and clients see **what they belong to**, not what a global
permission grants them. "Project manager" is scoped to a single project:
full control there, no global access anywhere else. Office managers and
accountants are similarly scoped.

## Localization

Nine languages — Persian, English, Arabic, Kurdish, German, Spanish,
French, Portuguese, Turkish — with full RTL. Language and calendar are
per-user, and the sidebar flips with text direction. Tag names are
translatable too.

## Stack

Next.js 16 · React 19 · TypeScript · PostgreSQL 17 · Drizzle ·
Tailwind 4 · shadcn/ui · S3-compatible storage

Authentication and authorization are built in, with no external service.
Passwords are hashed with argon2id.

## Development

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # database and storage
cp .env.example .env.local
pnpm db:migrate && pnpm db:seed
pnpm dev
```

| Command | Purpose |
|---|---|
| `pnpm test` | Unit tests |
| `pnpm test:db` | Integration tests (requires the database) |
| `pnpm typecheck` | Type checking |
| `pnpm build` | Production build |

## Documentation

| File | Contents |
|---|---|
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Deployment, variables, backups |
| [`docs/ACCOUNTS.md`](docs/ACCOUNTS.md) | Accounts and roles |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack and layering |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Database schema |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Technical decisions and why |
