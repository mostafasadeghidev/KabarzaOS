# Data model — PostgreSQL

51 tables across 10 schema modules in `src/db/schema/`. That directory is
the source of truth; this file is an orientation map, not a mirror of it.

Migrations are hand-written SQL in `src/db/migrations/`, applied
automatically when the app boots.

## Global conventions

- **Soft delete.** Rows that carry history use `deleted_at` rather than
  being removed, so past reports stay intact when a person or project
  leaves.
- **`scope`** exists on finance, project and task rows from the start,
  defaulting to `company` (see D-014). Adding it later would have meant
  rewriting every report.
- **Money is stored in minor units** as integers, never floats, alongside
  its currency. A euro equivalent is stored separately so historical
  reports do not shift when rates change.
- **Timestamps are `timestamptz`.** Display calendar and timezone are a
  per-user concern, resolved at render time.
- **Authorization is not enforced by RLS** but in the domain layer, so a
  single set of rules covers the UI, API routes and scheduled jobs.

## Modules

| Module | Tables | What it covers |
|---|---|---|
| `access` | `users`, `user_roles`, `user_permissions`, `user_offices`, `api_keys`, `audit_log` | Identity, roles, per-section permissions, office scope, activity trail |
| `base` | `currencies`, `exchange_rates`, `offices`, `vendors`, `tags`, `tag_relations` | Shared catalogs. `tags` is polymorphic with `type` constrained by a check (D-014) |
| `company` | `company` | Single-row organization settings |
| `projects` | `projects`, `project_members`, `project_clients`, `tasks`, `task_roles`, `comments`, `attachments`, `timelogs`, `unit_entries`, `qa_items`, `project_qa`, `tender_bids` | Projects and everything attached to them, including QA checklists and tender bids |
| `finance` | `accounts`, `account_users`, `ledger`, `fiscal_locks`, `fiscal_closings` | Multi-currency ledger, account assignment, period locking |
| `payments` | `project_payments`, `payment_requests`, `recurring_expenses` | Payments out, member requests, recurring costs |
| `comms` | `threads`, `thread_users`, `messages`, `meetings`, `meeting_attendees`, `reminders`, `notifications`, `absences` | Messaging, meetings, reminders, notifications, leave |
| `timer` | `work_timers`, `availability_slots`, `scheduler_stamps` | Server-side timers, availability, scheduler bookkeeping |
| `files` | `files`, `user_avatars` | Object-store metadata; bytes live in S3, never in the database |
| `kabarza` | `invoices`, `imports`, `deals`, `rules`, `tax_tables` | Invoicing and import/automation |

## Membership, not permission

Members and clients see projects through `project_members` and
`project_clients`, not through a global permission flag. A member's
visible set is the union of their memberships plus open tenders matching
their role tags. This is why granting someone a role does not, by itself,
show them anything.

## Files

`files` stores metadata only — key, mime type, size, owner, relation.
The bytes live in S3-compatible storage. The container filesystem is never
used, because it is wiped on every deploy (D-009).
