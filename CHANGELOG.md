# Changelog

Versioning follows [SemVer](https://semver.org/).

## [1.8.0]

Review pass over settings, people and projects.

### Fixed

- **Finance was a dead end on a fresh install.** With no accounts the page
  showed "create a bank account first" while replacing the very tab where
  accounts are created. You now land on the create form.
- **The plaintext password of a new member went into the audit log.** Only
  `hasPassword` is recorded now. Audit rows are widely readable and nobody
  expects a secret in one.
- **No password policy when creating a member**, while changing a password
  enforced one — a password the change form rejected could be planted at
  creation.
- **Email uniqueness compared case-sensitively** while the database index
  does not, so `A@x.com` passed the check and then hit a raw Postgres
  error instead of a readable message.
- **Deleting an office was permanent in practice.** It sets `isActive`
  false so old references survive, but no form field could set it back.

### Changed

- **Company details moved from Profile to Settings.** Profile is about the
  user; company data belongs to the organisation.
- **Profile and Settings moved into the account menu** at the bottom of
  the sidebar. The Settings entry there had been disabled with a comment
  saying its page did not exist yet; it does.
- **Daily report is a section under System**, not its own tab — both are
  system settings and both depend on the scheduler.
- **The project dialog is tabbed** (details / settings and access) instead
  of one long scroll. Both panels stay mounted, so hidden fields still
  submit.

### Added

- **Optional username when creating a member.** The login form already
  accepted either identifier; there was no way to set the second one.

---

## [1.7.0]

### Added

- **The full default tag catalogue** — 32 tags: member roles, ledger
  categories, project statuses, task statuses and priorities, each with
  names in all nine languages. Only three status tags shipped before,
  which left a fresh install unable to give a project a status, tag a
  ledger row, or assign a role.
- **Tags now expose what they actually mean.** `status_group` is a
  dropdown whose choices and label change with the tag type — kanban
  column for task statuses, pipeline tab for project statuses, and
  **accounting direction** (deposit / withdrawal / both) for ledger
  categories. It used to be a free-text box whose placeholder was
  `in_progress`, so the value had to be memorised.
- **"This status means the task is done"** and **"this status is the
  review column"** checkboxes. The columns existed in the schema and were
  read by the app, but nothing could set them.
- **All five access categories** a member-role tag can grant: project
  manager, team manager, accountant (assigned accounts), accounting
  manager (all accounts), or none. Two were exposed before.

### Changed

- **Catalogue forms open in a dialog** instead of expanding in place. The
  form used to push the table down by its own height, so on longer lists
  the row being edited scrolled out of view.
- **A colour picker with swatches** replaces the raw `<input type=color>`,
  which the browser renders as an oversized box that does not line up with
  the rest of the form.
- Catalogue tables show readable labels instead of raw keys, and drop
  columns that do not apply to the tag type being viewed.

---

## [1.6.1]

### Fixed

- **The app could connect to another project's database.** Compose service
  names become DNS names on *every* network the container joins, and
  deployment tools attach the app to a shared proxy network as well. On a
  host running more than one stack, the generic name `db` resolved to a
  different project's Postgres — which reported
  `password authentication failed for user "kabarza"`, pointing at
  credentials when the real problem was the destination.

  It failed *intermittently*: each connection resolves the name on its
  own, so the setup wizard could succeed while the dashboard behind it
  failed on the very next request.

  Services now answer to unique network aliases — `kabarzaos-db`,
  `kabarzaos-storage`, `kabarzaos-app` — which no other stack can claim.
  Service names are unchanged, so volumes and habits are untouched.

  ⚠️ Redeploy is required for the fix to take effect; the aliases only
  exist once the new compose file is applied.

---

## [1.6.0]

### Added

- **Telegram bot credentials are configurable from the admin panel**
  (Settings → System). Previously they could only come from environment
  variables, which meant editing `.env` and restarting a container to
  change a setting.

  ⚠️ The token is a secret and is kept apart from `SystemConfig`, which is
  deliberately readable **without any permission** — half the app needs it,
  and gating it would show ordinary users a blank page. The token never
  reaches the browser and never enters the audit trail; the page only
  learns whether one is set.

  ⚠️ An environment variable always wins. Existing deployments keep
  working, and when the environment supplies a token the form locks rather
  than silently storing a value the resolver would ignore.

  ⚠️ An empty token field means "leave it alone", not "delete it" — the
  form never renders the current token, so an empty box is the normal
  state on every visit. Clearing is a separate button.

### Fixed

- **The app could believe Telegram was configured when it was not.**
  `Boolean(botToken())` on a promise is always true. Type checking caught
  two of the seven call sites; the rest were silent.

---

## [1.5.1]

### Fixed

- **A fresh install had no currencies, which left the finance module dead
  on arrival.** `accounts.currency_id` is NOT NULL with a foreign key to
  `currencies`, so with an empty table the dropdown had nothing in it and
  no financial account could be created at all. Base currencies (EUR, USD,
  IRR) now ship as a migration, guarded on the table being empty so an
  operator who already configured their own is never touched.

  Base status tags already shipped this way; currencies had been left to
  the development seed script, which never runs in production.

---

## [1.5.0]

### Changed

- **The app now publishes on all interfaces by default** (`0.0.0.0`)
  instead of `127.0.0.1`. Deployment tools run their proxy in another
  container, which cannot reach the host loopback — so the old default
  made a perfectly healthy app look dead. Set `BIND=127.0.0.1` to keep
  the port closed to everything but a proxy you run yourself.

---

## [1.4.1]

### Fixed

- **`.env.example` was a development template** — it carried `localhost`
  values and, more importantly, did not mention `APP_PORT` or `BIND` at
  all. Those are the two variables anyone hits first: a port collision
  with another container, and needing to expose the app without a reverse
  proxy. It is now a production template, in English, with every value
  marked optional (the stack starts with no `.env` at all).

---

## [1.4.0]

### Changed

- **Repository documentation is now in English.** README, `docs/` and this
  changelog were rewritten; `docs/ARCHITECTURE.md` and
  `docs/DATA-MODEL.md` were also brought in line with the code, which had
  drifted (the architecture diagram described directories that no longer
  exist, and the data model predated the current 51 tables).
- Internal working notes (`docs/rules/`, `docs/REQUIREMENTS.md`) and
  one-time migration scripts are no longer tracked.

### Fixed

- **Five translation keys described a login flow this app does not have**,
  in all nine languages. They were dead entries, but they were wrong on
  their face — the app has its own login page.

---

## [1.3.0]

### Changed

- **`docker-compose.yml` is now the production file**, and development
  services moved to `docker-compose.dev.yml`. Deployment tools (Coolify,
  Portainer, Dokploy) and `docker compose` itself pick up the default
  name with no flag:

  ```bash
  docker compose up -d --build
  ```

  ⚠️ If you already deployed under the old name, drop the
  `-f docker-compose.prod.yml` flag. Development is now
  `docker compose -f docker-compose.dev.yml up -d`.

### Security

- **The app no longer runs as root** — it runs as `node` (uid 1000). The
  scheduler service uses the same uid, so no container in the stack is
  root and the secret file's permissions did not have to be loosened.

  ⚠️ Ownership of `/app/data` and `/app/.next/cache` is set **before**
  `VOLUME`: Docker initializes a named volume with the ownership the path
  has in the image. Get the order wrong and secret generation fails with
  permission denied, and the app never starts.

---

## [1.2.1]

### Fixed

- **`.gitattributes`: shell scripts are always LF.** On Windows with
  `core.autocrlf=true` (the Git for Windows default) scripts were checked
  out with CRLF and `docker-entrypoint.sh` failed inside the Linux
  container with `bad interpreter: /bin/sh^M`. The blob in Git was fine —
  the problem was the checkout, which is why it never appeared on the
  machine that wrote the file.

---

## [1.2.0]

### Fixed

- **The compose file had four required variables** and failed before
  starting under GUI deployment tools:

  ```
  required variable DB_PASSWORD is missing a value
  ```

  `install.sh` generated them, but a GUI tool never runs `install.sh` —
  it only reads the compose file. **No variable is required now**; a bare
  `docker compose up -d` works.

### Added

- **`docker-entrypoint.sh`** generates `SESSION_SECRET` and `CRON_SECRET`
  on first boot and keeps them in the `app_data` volume.

  ⚠️ Why the container and not the compose file: the session secret must
  be both random and stable across restarts. A fixed default would make
  the signing key guessable; generating it per boot would sign everyone
  out on every deploy. A file on a volume satisfies both. An
  operator-supplied variable always wins.
- The `cron` service mounts the same volume read-only so it sends the
  same secret the app expects.

---

## [1.1.0]

### Added

- **`install.sh`** — one-command install and update. Asks only for the
  domain; generates secrets, builds the image, brings up every service and
  waits until the app is healthy. Picks a free port if 3000 is taken.
- **A production compose file** covering the app, Postgres, object storage
  and the scheduler.

### Fixed

- **`.gitignore` had a gap** — the pattern listed names individually
  (`.env.production`) and did not catch `.env.prod`. It is now a
  whitelist: `.env.*` is ignored, `!.env.example` is the only exception.
  No secret had been committed; this is prevention.
- **The scheduler was dead for five minutes on every start** — the first
  tick hit an app that had not come up yet, failed, and slept until the
  next round. It now waits for the app to report healthy.
- The MinIO console no longer publishes a port. It was never needed —
  the bucket is created automatically — and it collided with port 9001.

---

## [1.0.0]

First complete release.

### Modules

- **Projects** — cards and detail view, tasks with role and priority,
  comments and reviews, QA, attachments and links, tenders and bids,
  archiving and multi-stage deletion
- **People and clients** — roles, tags, offices, live presence,
  three-state off-boarding
- **Finance** — multi-currency ledger, accounts, transfers, recurring
  costs, payment requests, piecework, invoices, fiscal period open/close
- **Reports** — ten tabs, CSV export, per-member and per-client detail
- **Time tracking** — server-side timer, manual entry, abandoned-timer
  nudge
- **Meetings and reminders** — invitations, multi-stage reminders, ICS
  export
- **Messaging** — conversations, one-way announcements, messages to
  management, live refresh
- **Leave** — for yourself or, with permission, for a member, merging
  adjacent ranges
- **Notifications** — in-app, email and Telegram, with per-user and bulk
  opt-out
- **Scheduler** — reminders, upcoming meetings, abandoned timers, time
  nudges, daily digest to Discord/Telegram, automatic cleanup

### Access control

- Five roles: owner, staff admin (section by section), finance, team
  member, client
- **Membership-based visibility** for members and clients — their own
  projects, not a global permission
- Project-scoped "project manager": full control of one project with no
  global access
- Office-manager scope, and accountant scope limited to assigned accounts

### Localization

Nine languages (Persian, English, Arabic, Kurdish, German, Spanish,
French, Portuguese, Turkish) with full RTL. Language and calendar are
per-user; the sidebar flips with text direction. Tag names are
translatable.

### Deployment

- **Setup wizard**: the first visit creates the owner account and signs in
- Sign in with **email or username**
- Three-stage Docker image with migrations applied at boot
- `POST /api/setup` for scripted installs, `/api/cron/tick` for the
  scheduler

### Infrastructure

Next.js 16 · PostgreSQL 17 · Drizzle · S3-compatible storage ·
1123 tests (758 unit + 365 integration) · zero type errors
