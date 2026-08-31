# Accounts and access — practical guide

## 1) The owner account — setup wizard

The first time you open the address, instead of a login page you get the
**setup wizard**: first name · surname · email · username · password (and
its confirmation). One button, and you land straight in the dashboard —
no intermediate login screen.

After that the wizard is **closed permanently**: any visit to `/setup`
redirects to the login page.

**Sign in with email or username.** Both work, and neither is
case-sensitive — `OWNER` is the same as `owner`.

⚠️ **The install window.** Until an account exists, anyone who knows the
address can claim ownership — the same behaviour as the previous system and Gitea.
Complete the wizard **immediately after the first deployment**. To avoid
the window entirely, use the scripted route below, which requires a
header secret.

### Scripted install (optional — for deployment scripts)

```bash
curl -X POST -H "x-setup-secret: $CRON_SECRET" -H 'content-type: application/json' \
  -d '{"firstName":"Name","email":"you@example.com","username":"you","password":"a long password"}' \
  https://team.example.com/api/setup
```

`GET /api/setup` reports status: `{"installed":true|false}`.
Both routes share the same logic; this one additionally requires the
header secret.

> If you lose the password and have no way into the app, the only way back
> is the database: delete the user row so the table is empty, and the
> wizard opens again.

---

## 2) Creating everyone else — from inside the app

Once you are in, everything happens through the interface. **You never
need to touch the database.**

| Who | Where | What they see |
|---|---|---|
| **Team member** | People → "New person" | Their own projects, tasks, time, meetings, messages |
| **Client** | Clients → "New person" | Only the projects they are the client of |
| **Staff admin** | People → person → "Permissions" | Whichever sections you tick |

⚠️ **Finance manager is not a separate role.** In the same "Permissions"
panel, set the **Finance** section to "manage". That person then runs
finance, reports and the catalogs (currencies, tags, offices,
counterparties).

### Staff admin — section by section

The "Permissions" button is visible to the owner only. Each section has
three states — **none / view / manage**:

Projects · People and clients · Meetings · Messages · Finance · Reports ·
Activity

Under Reports you can also hide individual tabs (for example, keep member
pay out of view).

**Always owner-only**, and not grantable by any tick: opening and closing
fiscal periods · the daily digest and bot token · staff permissions ·
recalculating euro equivalents.

---

## 3) Roles at a glance

| Role | Logs time? | Project visibility |
|---|---|---|
| Owner | ❌ | All |
| Staff admin (with finance) | ❌ | Depends on ticks |
| **Team member** | ✅ | Projects they are assigned to |
| Client | ❌ | Projects they are the client of |

⚠️ **Only members log time.** The owner does not, so the "Time" menu is
not built for them; team hours are visible under "My team" and in reports.
If you also work on projects yourself, give your own account the team
member role as well — then you have both.

### Project manager without global access

Want someone to fully run **their own project** and nothing else? Settings
→ Tags → create a member role tag and set "access for this tag" to
**project manager**. Anyone assigned to a project with that role manages
that one project and touches nothing else.

---

## 4) Cutting off access for someone who left

People → person → the three-dot menu:

- **Finance only** — cannot sign in, but still sees their own statement
- **Disabled** — sign-in is blocked
- **Removed** — their history (time, tasks, payments) stays intact

None of these delete data; past reports stay exactly as they were.

---

## 5) Passwords

**When creating a person** there is an optional password field. Fill it and
they can sign in immediately. Leave it empty and the account is created
but **cannot sign in until a password is set** — their card says so.

**Setting or changing it later:** People → the person's three-dot menu →
"Set password" (or "Change password" if they already have one).

**Everyone changes their own** under My profile → Password, which asks for
the current password.

⚠️ A few deliberate rules:

- An admin does **not** change their own password from the people menu —
  it must go through the profile, with the current password. Otherwise a
  stolen session could lock the account out.
- Passwords shorter than 8 characters and common passwords are rejected.
- No default password is ever generated; an account without one simply
  stays without one.
- Every password set is recorded in Activity (never the password itself —
  only who set it for whom).

Email-based self-service reset ("I forgot my password") does not exist
yet; for now an admin sets a new one.
