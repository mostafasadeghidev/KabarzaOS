# Changelog

Versioning follows [SemVer](https://semver.org/).

## [1.24.0]

### Fixed

- **Clicking a message notification opened a 404.** Message notifications link
  to `/messages/{threadId}`, and that route had never been built — the messages
  page is a single view at `/messages`. Every such click landed on the raw
  Next.js 404: no app shell, no menu, no way back. The route exists now and
  opens the conversation directly, so the notifications already stored in the
  database work without a data migration, and so do the same links sent by
  email and Telegram.

- **A client could read every member's real name off the project cards.** The
  project page masks a member to their role for a client viewer ("Designer"),
  but the card grid printed the real name — the mask was applied on the detail
  page only. The original plugin never had this hole because its project cards
  live in the admin area, which a client cannot open; this rebuild shows the
  same grid to everyone, so the mask has to travel with it. Names are now
  masked in the list service, on the server, so the real name never reaches the
  page payload.

- **A read-only viewer could create tasks and post comments.** `createTask`,
  `addComment` and `getTaskFormOptions` were guarded by the *view* gate, which
  has a branch the original does not: a global view capability. The plugin's
  `user_can_access()` is manage ∨ member ∨ client ∨ office-manager, with no
  view branch at all. So a staff admin granted "view projects" — and nothing
  else — could write to every project in the system, which defeats the whole
  point of separating view from manage in the staff RBAC. There is now a
  separate interaction gate that ports the plugin's rule exactly.

- **The payment-request notification opened the wrong tab.** It links to
  `/finance?tab=…`, but the finance page kept the tab in local state and
  ignored the URL, so an accountant clicking the notification always landed on
  the ledger. The tab now comes from the URL, and the link — which still named
  `requests`, a key that stopped existing when the finance tabs were split in
  1.23.0 — points at the right tab again.

### Changed

- **Notifications open in a modal instead of navigating.** The body was
  truncated in the dropdown, so reading a notification in full meant leaving
  the page; and when its destination was broken there was nothing to read at
  all. The modal shows the whole message and makes going to the destination
  optional, which is also why a broken link can no longer strand anyone.

---

## [1.23.0]

### Changed

- **Feedback lives in the toast now.** Every inline status message is gone:
  seven duplicated local `Notice` components with nineteen usages, about
  twenty-five `state.error` / `state.message` paragraphs, and every local
  `notice` state. An inline message inside a form that closes on save
  disappears with the form — the worst possible place to say "it worked".

  Messages that said more than "done" kept their wording rather than being
  flattened: the member save still reports "2 added, 1 updated, 0 removed",
  the QA apply still counts the items, sending to several people still names
  the number, and "your message was sent to management" still names the
  recipient.

### Kept deliberately

- **Field-level errors stay under their own input.** A toast in the corner
  cannot say *which* field is wrong. The same goes for the per-row errors in
  the members dialog — they are row-scoped validation, not feedback.
- **Persistent state stays inline**: the "no mailer configured" warning, the
  closed-period banner, the scheduler health panel, empty states, and the
  hints under fields. None of them is the result of an action.
- **The login and setup errors stay inline.** That card is the page's whole
  content, and its message carries `role="alert"`; moving it to a polite
  toast in the corner would be an accessibility downgrade.

### Fixed

- **Saving a project reported nothing.** `updateProjectAction` returned only
  `savedId`, which no toast can observe, so a successful save was silent once
  the inline line was removed.

---

## [1.22.0]

### Fixed

- **Four buttons had been dead since 1.16.0.** The automated edit that added
  translators in that release put `const tr = useT()` as the first statement
  *inside* `startTransition(async () => {` in four files. A hook called
  outside render throws immediately, so the callback died on its first line:
  approve/reject a tender bid, pay or delete a recurring cost, delete a
  meeting or reminder, and — worst — picking a message recipient.

  The guard written in 1.17.0 missed them twice. First it judged scope by
  indentation, and the inserted lines carried the wrong indentation. Then it
  counted braces but looked for the nearest *named* function, and an
  anonymous callback has no name, so it walked past the boundary to the
  component outside. The rule is simply **any** function boundary. It is now
  a test (`src/domain/__tests__/hook-placement.test.ts`) that also asserts the
  detector catches the exact shape that escaped four times, so a green run
  means something.

- **The expense kind filter had a dead option.** It offered `one_off` where
  the type is `once`, so choosing "one-off" always matched zero rows.

### Changed

- **"Payments and expenses" is now two tabs.** Members' money — payment
  requests and their bank details — and the company's own recurring costs are
  different work for different people and were never looked at together. The
  previous system agrees: member finance is its own screen there, and
  recurring costs live under the finance hub.

- **The bank-accounts tab is hidden from view-only finance users** instead of
  rendering an empty panel, matching the previous system's capability gating.

### Added

- **Pagination on the project and people grids.** Neither query has a `LIMIT`
  — the whole table loads and the whole table renders. Harmless at a hundred
  rows, quietly slow after that.

- **More toasts**, on the forms where the surface disappears on success:
  quick-add member and client, bank account, pay request, expense, task edit.

---

## [1.21.0]

### Fixed

- **A dialog closed on the first save and never again.** The close handler was
  a `useEffect` keyed on `[state.ok, state.error]` — constants. The first save
  flips `undefined → true` and the effect runs; the second returns `true`
  again, both dependencies are unchanged, and React skips the effect. So the
  dialog closed exactly once per mount, which is why it read as intermittent
  (switching tabs remounts and resets the latch). The QA library was where it
  was noticed, but the same latch was in **thirteen** places: the six settings
  catalogues, ledger entry and transfer, payout and expense, meetings, both
  message composers, the reply-reload, add-task, task edit, and the person
  dialog.

- **Typing in the ledger's rate field silently zeroed the amount.**
  `amountFromSettled` guarded `rate <= 0` but not `settled <= 0`, and an empty
  field is `Number('') === 0`, so the product was a *valid* zero. Enter an
  amount, then touch the rate, and the amount became "0". From outside this
  looked like "the amount field will not accept input".

- **The company logo 403'd for anyone but the owner or finance.**
  `canViewFile` had no branch for it, so the logo was already broken on the
  invoice — a page a client is allowed to open.

### Added

- **Toasts.** Success and failure were shown inline, inside the form — which
  vanishes with the form when a dialog closes. There is now a toast, built
  with no new dependency, mounted at the root so it also covers login, setup
  and the off-boarded shell.

- **The company logo and name in the sidebar**, for every role.

- **Staff admins can be created from the UI.** The role was not reachable at
  all: the person form whitelists `member|client`, and Settings → staff access
  only configures people who already hold it — so the only way in was the seed
  script or manual SQL. Settings → staff access now has an add control and a
  remove button, and removing also clears the per-user permissions.

- **The owner co-owns every message thread they did not send.** "Manager"
  includes staff admins, so the existing co-ownership rule exempted them and a
  staff admin's thread held exactly two people. The owner could not see it.

### Changed

- **The tag colour picker is just a colour picker.** Twenty preset swatches
  took more room than the field and hid the control that actually gets used.

- **Telegram connects with one button.** It used to mint a link, then render
  an unstyled anchor you had to click as well.

- **Every world time zone**, with the browser's own live filtering. The list
  was seven entries; anyone outside them had to type the name from memory.

- **The ledger dialog shows which account the row lands on.** It always
  followed the page's account, but the modal covered the table that said so.

---

## [1.20.0]

### Added

- **A project's members and clients can create tasks**, matching
  `handle_add_task()`, whose only gate is `user_can_access()` — project
  participation, not a management capability. A client assigns to a
  **role**; the person picker is not offered to them and the private
  checkbox is not shown.

- **Assignment by role in the create form.** `roleTagIds` existed in the
  domain and in the database but no dialog ever sent it, and the action's
  schema dropped it — so a client-authored task would have had no assignee
  and no role, reached nobody, and been unclaimable.

- **Role holders are notified** for a role-assigned task. The notification
  only ever fired for a direct assignee, which a client never sets.

- **The creator can edit and delete their own task**, as `may_edit` allows.
  Without it a client could file a task and never correct it. A creator who
  is not a manager cannot change the assignee or the private flag.

### Security

Opening that gate turned three pieces of sloppiness into exploitable holes,
all closed server-side — the UI restriction is not the control:

- **`assignedTo` was written unvalidated.** A client sees only roles in the
  form, but a hand-built request could name a specific member — revealing
  who that id is, and sending them a notification with attacker-chosen text.
  The assignee must now be someone actually on the project, and a client
  cannot set one at all.

- **`isPrivate` was accepted from anyone.** Private visibility falls back to
  the *global* manage capability, so a task a client marked private would
  have been invisible to the project's own manager — and, before the change
  above, undeletable by its author. It is ignored for non-managers.

- **`priorityTagId` had no type check** where `statusTagId` had one, so any
  tag — an office, a member role, a project status — could be planted in the
  priority slot and shown to the whole team as the task's priority.

- **`getTaskDetail` was the one read path with no name masking**, so a
  client opening any task saw the real names of the assignee, the last
  editor and every note author. This was live before this release.

### Fixed

- **`updateTask` and `setTaskStatus` had no frozen-project guard**, unlike
  every neighbouring write. Status changes are deliberately open to anyone
  who can see the task, so this was a writable path on an archived project.

- **A frozen project now says so** when a task is submitted, instead of the
  generic "not saved", and the Add-task button is hidden there.

---

## [1.19.0]

### Security

- **Everyone could see a project's price.** The amount was rendered with no
  guard at all — on the project card and on the project page — so any team
  member saw the client's contract value. The previous system has three
  separate audiences and only one of them is "can manage the project":

  | Who | Sees |
  |---|---|
  | Owner / global project manager / finance manager | the project price |
  | The project's client | the project price — it is their bill |
  | A plain team member | only their own agreed pay |
  | A project or office manager without a global capability | nothing; no finance tab |

  `domain/access/project-money.ts` now holds that rule with tests, and the
  price is **removed from the payload** rather than hidden in the UI —
  hiding it client-side left the number readable in the page source.

- **Members' agreed pay was shown to everyone** in the project members
  table. It is money, and the previous system limits it to the same two
  global capabilities (`$hide_amounts`) — not even the client sees it.

- **A client could see team members' real names, and a member could see the
  client's.** The previous system masks both (`name_for_viewer`): a client
  sees a member's *role*, a member sees only "Client". The masking is
  applied on the server, across members, tasks, comments and QA, and a
  client composing a task is offered roles only — never people.

### Added

- **Cut a person's access to a single project** without removing them.
  Removal is blocked when there is money owed or the person is a former
  member — both correct, and both left no way to actually revoke access.
  A per-membership flag now does it: the row and its money stay, the
  project disappears from their list, and opening it by URL returns 404
  rather than "forbidden".

- **A dashboard for members and clients.** `getDashboard` opens with a
  global capability check, so both roles landed on "you do not have
  access". They now get the cards the previous system gives them —
  projects, open tasks, comments needing review, unread messages — and a
  project table with their role, their hours and progress. **No price**,
  matching the note in the original: "minimal columns, no price".

- **Local file upload and a featured image in the create-project form.**
  Only external links were possible; a file meant creating the project,
  reopening it and uploading from the files tab.

- **A profile image when creating a person.** The picker existed only in
  edit mode, so the same two-step dance applied.

- **The counters on a project card now open the tab they count** — tasks,
  comments, and the review counter lands on the "needs review" sub-tab.

---

## [1.18.0]

### Fixed

- **A member could open their project from the list, then got an error page.**
  The detail page fetched task-status options through a function that asserts
  the *global* `projects.view` capability — but a member reaches the page
  through project membership and holds no global capability, so every load
  threw. The options are now read only for someone who can manage the
  project, which is also the only person the picker is interactive for; a
  member sees the read-only chip, exactly as the previous system did.

- **Removing a project member did nothing and said nothing.** Two rules keep
  a row even after it is taken off the list — a former member, and a member
  with an unsettled balance — and neither was reported. The dialog said
  "0 removed" and the person reappeared. Both now name the person and the
  reason.

- **The role next to each name in the meeting invitee list** was printed raw.
  It is a translation key — either a tag name or one of three fixed words —
  so it stayed in the source language everywhere.

- **The comment status chip** ("Needs review", "Done") was printed raw for
  the same reason.

- **A username could not be changed, or even seen, after the person was
  created.** The field was shown only on the create form, and the update path
  never wrote the column. Someone created without one stayed without one
  permanently — and could not sign in by username. The field is now on the
  edit form, filled in, with the same validation and clash check as create.

### Changed

- **The piecework tab only appears on piecework projects.** Logging a
  quantity has no meaning without a per-unit rate; the tab is now named
  "Payment" on an agreed-amount project and keeps its payment-request
  section, matching `Projects::is_unit_based()`.

- **Adding a member from a project card offers only that person's own roles**,
  the way the full members form already did. The list previously offered
  every role in the system, so a person could be signed onto a project under
  a role they do not hold.

---

## [1.17.0]

### Fixed

- **The status menu did nothing when clicked.** A translator hook had been
  inserted inside the `pick` callback rather than in the component body, so
  the first click threw an invalid-hook-call and the status change never
  reached the server. The same edit had landed in three places: project
  status, task status, and the amount field of the finance entry form.

  The check that was supposed to catch this used indentation to decide which
  function a hook belonged to — and the inserted lines carried the wrong
  indentation, so they looked top-level. It now counts braces.

- **The same status appeared twice in the menu.** Migration 0016 wrote tag
  translations by matching `status_group`, but a group is a bucket, not a
  name: `in_progress` holds both "In progress" and "In review". Both were
  given the English of the group, so every language except the source one
  showed one option twice. Migration 0020 repairs the three affected rows,
  and only while they still carry 0016's exact blob — a tag a manager has
  since translated is left alone.

- **Two sets of pipeline-group labels had drifted apart.** `status-picker`
  kept a private copy that said "متوقف" and "لغوشده" where the tag form said
  "نگه‌داشته‌شده" and "کنسل‌شده", so one group answered to two names — and
  since those were also the tag names, two more groups read as duplicates.
  Both menus now take their labels from `domain/tags/groups.ts`.

### Added

- **A colour dot on every status option, and a tick on the current one** —
  `kteam-dot` and `kteam-status-cur` in the previous system, both missing
  here. Without them a group header and its only option are the same text at
  the same size, which is what made the list read as repeated.

---

## [1.16.1]

### Fixed

- **The last shape of untranslated message: `{notice.text}`.** 1.16.0 wrapped
  every render site of a server-produced message that matched `{error}`,
  `{notice}` or `{state.error}` — but the people pages hold theirs in an
  object, and `{notice.text}` did not match. Deleting a member and
  reactivating one both printed their result in the source language.

  The check no longer enumerates known shapes. It reads every JSX expression
  whose final property name looks like a message (`error`, `message`,
  `notice`, `text`, `reason`, `summary`) at any depth, and reports the ones
  that do not pass through the translator. That found eleven more:
  `{state.fieldErrors.*}` on five forms, `{notice.text}` in the staff-access
  section, and the per-row errors in the project-members dialog.

- **The former-member badge** ("Former · cut off", "Former · finance only")
  was rendered raw. `stateLabel()` returns a translation key, and the badge
  printed it as-is.

---

## [1.16.0]

### Fixed

- **The interface is fully translated.** Earlier sweeps searched the source
  for Persian text, and each one missed a different way of writing it. This
  release stops guessing from the source: every page, tab, dialog and menu
  was loaded in English and every Persian text node still on screen was
  collected from the rendered DOM. Whatever the code looks like, the reader
  is the judge.

  What that turned up, by shape:

  - **Submit buttons.** `{pending ? 'Saving…' : 'Save'}` inside tiny
    `useFormStatus` components. Twenty-six of them, in almost every form in
    the app. They are small components with no translator in scope, so the
    string had nowhere to go.
  - **Labels passed as props.** A constant such as `editLabel: 'Edit member'`
    is a *translation key*, not final text — the receiving component is
    supposed to translate it. Two receivers did not: the member card's
    menu and the profile page's tab bar. The identical arrays elsewhere
    were fine, which is why source-level search kept clearing them.
  - **Strings built with a value in them.** `` `${daysLeft} days left` ``
    can never be a key, so no amount of wrapping at the display site would
    help. These are now parameterised keys — `'{n} days left'` — resolved
    where the value is known.
  - **Server-side messages.** Every action's error text was already
    translatable, but sixteen render sites printed it raw. One wrapper each
    fixed several hundred messages at once.

- **Tag names follow the language in reports and the team page.** Two
  queries selected `tags.name` directly instead of going through
  `tagName(locale)`, so project statuses stayed in the source language on
  those two screens while the same statuses were translated everywhere
  else.

- **The command palette (Ctrl+K) lists pages in the reader's language.**
  The sidebar translates the navigation labels it is given; the palette,
  fed the same array, printed them as-is. Search now matches the
  translated label too, so what you type matches what you see.

- **Dashboard badges and the project-status chart** are translated. They
  are built during data fetching, where the layout's translation container
  is not filled yet — the badges now resolve the locale directly rather
  than depending on render order.

### Changed

- **Display helpers in `domain/` take an optional translator.**
  `deadlineLabel`, `humanSize`, `leadLabel`, `formatSlots` and
  `assigneeOptions` return text meant for a reader, so they now accept the
  translator instead of hard-coding one language. The parameter is
  optional and defaults to the source language, so existing callers and
  tests are unaffected.

  ⚠️ They take a translator rather than calling one. These are pure
  functions; reaching for a per-request container or a React context from
  inside them would tie the domain layer to a rendering environment.

### Added

- 30 new translation keys across all nine languages.

---

## [1.11.0]

### Added

- **Private-project access can now be granted.** The `private_access`
  column existed and the whole visibility rule read it, but no form could
  set it — so in practice only the owner ever saw a private project. It is
  a checkbox on the member form now.

  ⚠️ Only someone who has private access can grant it. Without that guard
  a staff admin holding `members.manage` could grant it to others — or to
  themselves by editing their own record — which is a privilege
  escalation through the people form.

  ⚠️ An absent value means "leave it alone", not "switch it off", so a
  form that does not render the field cannot silently revoke an existing
  grant.

### Changed

- **The project dialog has one tab bar**, matching the previous system:
  Info | Tasks | Files | QA, with the project's team under Info. 1.10.0
  had nested two bars.

---

## [1.10.0]

### Changed

- **Dialogs no longer close on an outside click or Escape.** A stray click
  discarded a half-filled form without warning; on "add project", with
  dozens of fields, that meant starting over. Dismissal is explicit now —
  the ✕ or Cancel. Display-only dialogs can opt back in.
- **Roles and offices are fields, not rows of checkboxes.** Chips show
  what is selected; the list opens on click. Office membership and office
  management are now two separate fields — they were two checkboxes on one
  row, which read as one setting with a modifier rather than two
  independent facts.
- **Creating a project is tabbed** — Team, Tasks, QA, Files — the way the
  previous system grouped it. Reaching "Files" used to mean scrolling past
  tasks and QA.
- **The ledger's project filter is a live search.** It listed every
  project, which on a long-running agency is hundreds of rows — slower to
  scan than typing the name.

### Fixed

- **A project member could be assigned a role they do not hold.** The
  dropdown listed every role in the system, and the per-role effort report
  would then report something that was never true. It lists only the roles
  tagged on that person now.

---

## [1.9.1]

### Fixed

- **Pages fell back to Persian on client-side navigation.** On such a
  navigation Next re-renders only the changed page segment and reuses the
  layout from the cached tree — so `primeTranslations()`, which lived only
  in the root layout, never ran for that request and `t()` returned the
  source string. A full reload was correct, navigating there was not,
  which is why it looked like a caching bug.

  All nineteen server pages now prime translations themselves rather than
  relying on the layout. `cache()` keeps it to one call per request.

- Sidebar links no longer prefetch. Every page here is per-user — language,
  permissions, visible scope — so a prefetched copy is a copy of somebody's
  state at some earlier moment.

- Changing the language reloads the page. The router cache holds RSC
  payloads for routes already visited, and neither `revalidatePath` nor
  `router.refresh()` clears them all; the previous language kept coming
  back on the pages you had already opened.

- The theme label ("System", "Light", "Dark") was never translated.

---

## [1.9.0]

### Changed

- **The Persian locale now uses the Gregorian calendar.** The BCP-47 tag
  is `fa-IR-u-ca-gregory`: Gregorian dates with Persian text and digits.
  The whole system stores and reasons in Gregorian dates — deadlines,
  fiscal periods, meetings — so showing Jalali beside them meant
  converting between two calendars in your head.

### Fixed

- **Members and Clients rendered entirely in Persian** whatever the
  chosen language. Both pages were synchronous, and layouts and pages
  render in parallel in the App Router — so `t()` ran before the
  translator container was primed and always returned the source string.
  Every other page happens to be fine because it awaits data first.
- **The coverage check was blind to two whole classes of string.** Table
  headers (`header: '…'`) and add buttons (`addLabel="…"`) reach the
  component as props and never appear inside `t()`, so the extractor never
  saw them and reported zero missing while they stayed Persian in all nine
  languages. Both forms are now extracted and translated where they render.
- Six strings whose translation existed but was never used, because the
  literal in the code and the key in the message file differed by a
  hamza or a zero-width space.

---

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
