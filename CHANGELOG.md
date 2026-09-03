# Changelog

Versioning follows [SemVer](https://semver.org/).

## [1.50.0]

### Added — dashboard panels (parity with the plugin)

- **Office filter on the hours charts.** A multi-office owner can scope the "team hours trend" and "member hours" charts to one office; counters and risk lists stay global, as in the plugin.
- **Expense dues for finance managers:** an "overdue / due soon" card in the finance group (active recurring expenses past due or due within 7 days) and a risk panel listing them with amount and due date, overdue rows in red, with "+N more" beyond eight.
- **Tasks stuck in review, per project:** a risk panel with the count per project, linking to that project's review tab.
- **Project status chart by status tag.** The chart now shows each status tag by its own (translated) name instead of merging statuses that share a group.
- **"Online now" panel** on the dashboard (active first, then idle), next to the running timers.
- **This week's meetings are the viewer's own:** meetings in the next 7 days where the viewer is an attendee or the organiser, up to 20, instead of every meeting of the calendar week.

---

## [1.49.0]

### Added — ledger details and receipts (parity with the plugin)

- **Ledger row details.** Clicking the row number or the date opens the row: date, direction, signed amount, EUR equivalent, settlement equivalent, payer, receiver, project, tags, description, the receipts as thumbnails, and a who/when history of the row's creation and edits, read from the shared audit log.
- **Receipt thumbnails and zoom.** Image receipts show as thumbnails in the ledger table and in the row details; clicking one opens it full-screen (click, the close button or Escape closes it). PDFs keep their link.
- **Receipt picker.** Newly chosen receipts are previewed before saving, each can be removed again, and an image can be pasted straight from the clipboard (Ctrl+V).
- **Transfer receipt.** The transfer dialog accepts one receipt, attached to both legs as in the plugin. Removing a shared receipt from one leg no longer deletes the file the other leg still references, and both legs now record who made the transfer.
- **Closing preview.** The fiscal-period tab shows the current balance of every account (the figures that closing will freeze), a link to the ledger, and when and by whom the lock was last changed.

---

## [1.48.0]

### Added — remaining parity gaps

- **Owner dashboard "live" panel:** who is working right now (running timers with project and elapsed time) and the latest activity events.
- **Availability page:** office managers can record leave for a member straight from the board, and the office filter accepts several offices at once.
- **Daily report settings:** a "test Discord connection" button posts a test message to the configured webhook and reports whether it was accepted.
- **Company logo** can be removed from the company settings, not only replaced.

---

## [1.47.0]

### Added — report drill-downs and invoice (parity with the plugin)

- **Member report:** avatar and role names, EUR cards (total commitment, paid, debt), operational cards (projects, hours this week from the configured week start, remaining tasks, finished tasks, weekly availability days), this week's work per project, a searchable projects table in each project's own currency with the payout lines (amount with currency and receipt link) under the project, tasks in three buckets grouped by project with priority, and the weekly availability rows.
- **Client report:** EUR cards (total value, received, due), a searchable projects table in each project's own currency with the status pill, a "partner" badge on shared projects the client does not owe for, and the expense lines with note and receipt under each project. Project links are shown only to project managers.
- **Daily report settings** are sanitised on save as in the plugin: an invalid time falls back to 09:00, the day offset is clamped to 0–7, unknown sections are dropped and a webhook that is not an http(s) URL is cleared.
- **Invoice:** expense and payment rows are converted into the project currency at the recorded rate, amounts print with the currency's own decimals, a print / save-as-PDF button, a "project not found" message for an unknown id, and no invented issuer name when neither company nor brand name is set.

---

## [1.46.0]

### Added — "My team" (parity with the plugin)

- **Member cards** instead of a bare table: avatar, name with a leave badge for anyone away today, role names, hours in the selected range and the number of open tasks, with a live name search.
- **Member profile:** role names under the name, four stat cards (projects, in progress, total hours, open tasks — the last one opens the team task board filtered to that member), an in-progress projects table with role, progress bar, the member's hours and open tasks, all-time hours per project with a total, the member's weekly availability matrix, and a leave card where the office manager records or removes leave for that member.

---

## [1.45.0]

### Added — work hours (parity with the plugin)

- **Global timer banner** on every page: a running timer shows a live clock with a stop-and-log field; a parked timer (over five hours) asks to confirm or adjust the amount, or to resume.
- **Hours page filters:** date range and project name (contains, with suggestions from the projects you logged on), a range total shown only while a filter is active, and fifteen-per-page pagination that keeps the filters.
- **Editing a log** can now change its date and project, not only the duration and description.
- The weekly figure is the calendar week from the configured week start, and "this month" replaces the all-time total.

### Changed

- **Who may log hours** now follows the plugin: the owner, project managers and finance users may log general (non-project) hours; an office manager may log on any project of their office without being signed onto it; members log on their own projects. The project picker lists only open, non-frozen projects, and the "no project" option appears only for those allowed to use it.

---

## [1.44.0]

### Added — project management tab (parity with the plugin)

- **Log details:** the management tab lists every hour entry on the project (date, member, duration, description), newest first, fifteen per page, next to the per-member totals.
- **Members' availability matrix** on the management tab: one row per project member with their roles, one column per weekday from the configured week start, compact time spans per day, "today" highlighted, and a leave marker with the end date for anyone on leave today.
- **QA checklist** shows, for each task-spawning item, the task it created and that task's status in the status colour.
- Member roles on the project page are shown as chips in the role's colour, and bid statuses use the plugin's labels (winner / not selected / withdrawn).

---

## [1.43.0]

### Added — project page (parity with the plugin)

- **Threaded comments and reviews.** Replies nest under their parent, a thread's status is the status of its latest message (a new reply reopens a closed thread), the status chip and toggle sit on the latest message only, and deleting a message removes its replies. The dashboard "comments needing review" card now counts threads, not rows.
- **Kanban board from task-status tags:** one column per status tag in tag order and colour, tasks with no status in the first column, drag-and-drop to change status, and a status picker on each card for touch screens.
- **Task cards** show the priority chip in the tag colour, a description excerpt, and the number and last line of the task's discussion notes, in both the list and the board.
- **Client finance tab** follows the plugin's summary: price, billable expenses, total due, paid, remaining and status in the project currency, plus a "counted equivalent" column that expresses each payment in the project currency.

---

## [1.42.0]

### Added — project rules (parity with the plugin)

- **Explicit member removal.** A project manager can remove a single membership row from the project page, even for a member who is still owed money or has left; payments stay on record. Bulk member editing still refuses to drop an owed member.
- **Bid approval signs the winner like the plugin:** an inactive member cannot be signed, an existing (member, role) row keeps the larger amount, and a newly signed winner gets the "signed onto project" notification.
- **Quick-add member** accepts a unit rate and currency; raising an amount rewrites both.
- Bid lists are ordered by role, then the winner first, then the cheapest bid; QA checklists are grouped by role in the library order.
- The over-cap bid error now names the cap in the project currency.

### Fixed

- A project saved without a currency now gets the company default currency instead of null.
- Task status changes stamp the editor, and approving a task from review to done no longer sends the "sent back" notification.
- Deleting a comment removes its whole reply subtree.
- Piecework rows are accepted only on unit-based projects; a malformed date falls back to today instead of failing.
- "Stalled" on the dashboard now means an in-progress project with no hours, tasks, comments or edits in the last 14 days, as in the plugin.

---

## [1.41.0]

### Added — dashboard review queues and daily report details (parity with the plugin)

- **Focused lists behind the "needs action" cards.** Tasks awaiting review are grouped by project in priority order with their assignee; open comment threads show a twelve-word excerpt and the last author; tenders awaiting a decision carry their bid count; deadlines within seven days show "today" or "N days left". Each row opens the project on the matching tab (tasks land on the review sub-tab).
- **Daily report lines match the plugin:** hours list every member's minutes per project, payment lines show the member, the project and the amount in its own currency, and meeting lines carry the time and project. The report day is the system-timezone day, so a payment near midnight lands on the right date.
- **Discord delivery** splits long reports into chunks of at most 1900 characters on line boundaries, posts each with a 15-second timeout and logs any non-2xx response instead of silently truncating.

---

## [1.40.0]

### Added — report filters (parity with the plugin)

- **Office filter** on the overview, members, clients, projects and hours tabs, multi-select. Client and project figures follow the project's office; member figures follow the member's office across all of their projects. The CSV export carries the same filter.
- **Expenses tab:** date range with "this month" / "this year" presets (default: current month), cards for the period total (red when positive), row count and monthly average over months with data, a by-vendor breakdown with a live vendor filter, and a by-month trend with bars. The CSV is now the by-vendor summary with a total row for the selected range.
- **Hours tab** answers the plugin's question: one row per member with project hours, general hours and the total, sorted by total, with "this week" (from the configured week start) / "this month" presets and a manual range. The CSV follows the same columns.
- **Member hours drill-down:** defaults to the current week from the configured week start, "all time" is an explicit preset, the range is shown under the name, the project picker lists every project the member ever logged on, and entries are capped at 500 rows.
- **Per-unit work tab:** rows sorted by total, a totals footer, and entries of a deleted user kept as "#id".
- **Projects tab:** the title links straight to the project's finance tab, and only for users who manage projects.

### Changed

- The closed-periods tab and its CSV need only the reports permission, as in the plugin; finance rights are no longer required to read a closing summary.
- Recomputing EUR equivalents is allowed for the owner and finance managers.
- The accounts report lists active accounts only.

---

## [1.39.0]

### Added — reports (parity with the plugin)

- **Rate banner on the overview:** the rates the totals rest on ("1 EUR = 52000 IRR" for every active currency), a warning when a rate is older than seven days, and a warning when an active currency has no rate at all. Rows without a rate are counted as zero, never at 1:1.
- **Overview cards grouped** into client / members / overall, with a new **estimated profit** card (project value minus commitments to members, red when negative) and its explanatory note.
- **Members tab:** every member-role user (also those without rows), a projects column, a "former" badge, per-currency debt chips, summary cards (agreed / paid / debt), and a debt-by-currency line. A former member with no remaining debt is hidden from the list.
- **Clients tab:** billed = price + billable expenses, both in the project currency, per-currency due chips, summary cards (billed / received / due), a due-by-currency line and a "former" badge.
- **Accounts tab:** EUR-equivalent column and a total-liquidity footer, also in the CSV export.
- **Closed periods:** lock notice ("the period is locked through …"), a "stale" badge on a closing whose period has since been reopened, and the closing balance in EUR.
- **Attendance:** leaves list only members and only upcoming ranges, oldest first.

### Fixed

- **Member debt no longer mixes units.** Agreed amounts and payouts are grouped per currency (payouts in their settlement currency), the debt is floored per currency and only then converted to EUR, so an overpayment in one currency can no longer hide a debt in another. The old figure subtracted a frozen-EUR paid total from a raw multi-currency agreed sum.
- **Client due** is computed the same way; the CSV "total value" column now really is price plus expenses, so it reconciles with the due column.
- Raw-SQL integer columns are coerced before being compared with the base currency id.

---

## [1.38.0]

### Added — project page (parity with the plugin)

- **Frozen projects are read-only everywhere on the page.** Cancelled and on-hold projects, not only archived ones, show a read-only banner, and the task, file, comment and piecework forms, the claim button and status pickers are hidden instead of failing after the fact.
- **Detail meta under the title:** registration date, deadline with a countdown ("N days left" / "today" / "N days ago"), progress as a percentage with done/total tasks, "your hours" for a member or "team hours" for a manager, the parent project link and the sub-project links. The status is a picker for managers and a chip for everyone else.
- **QA checklist per viewer:** a member sees only the items of their own roles, the client only the client items, managers everything; members and clients can tick their own items.
- **Comment and review threads are separate**, each with "needs review" / "done" sub-tabs and its own composer; newest first. Any participant can change a status; the composer is hidden on frozen projects.
- **Members' money tab shows the agreed amount, what has been paid, the balance with its status, the actual payout rows with receipts, the paid total of piecework rows and the request date.**
- **The finance tab carries a computed equivalent** of each payment in the project currency; clients still never see member payouts.
- Members and clients can change a task's status from the task list (sending their own work to review), the assignee of a new task defaults to the member creating it, and the delete button on files is shown only to the uploader or a manager.

---

## [1.37.0]

### Added — member and client dashboards, task inbox (parity with the plugin)

- **The task inbox follows the plugin's visibility rule.** A member sees tasks assigned to them, private tasks they created, and role tasks that nobody has claimed yet (or that they claimed) for a role they hold on the project; a role task claimed by a colleague disappears. Each row shows the private lock, the roles with their claimer, and a "claim" button when the task can be taken; the link opens the project on the right tasks sub-tab.
- **Clients get a review inbox:** the tasks awaiting their review across their non-frozen projects, and a matching "tasks awaiting review" card on the dashboard instead of a count that was always zero.
- **Member dashboard:** "open projects" lists only open, non-frozen projects (with the start date), open-task counts use the visibility rule and exclude tasks awaiting review, tenders the member qualifies for are listed in their own section with the roles and the member's bid state, and no longer inflate the project list or counts.
- **Client dashboard:** the projects table shows the registration date, price, payment status, remaining amount, total task count, progress and the team's logged hours, as in the plugin; a member who is also a client sees both sections.
- **"Meetings this week"** card for every role: the person's meetings (invited or created) in the next seven days.
- **Task dependencies.** A task can depend on another task of the same project; the dependency is shown in the task dialog and is editable in the task forms.
- **The task dialog shows the role assignees with their claimer** and offers the "claim" button.
- **Office managers see their offices' projects** in the projects list without a global permission, and the team's staff list counts only people with the member role. Office managers see private tasks on their offices' projects, as in the plugin.

---

## [1.36.0]

### Added — invitations and password recovery (parity with the plugin)

- **Invitation e-mail on save.** The person form has a "send an invitation by e-mail" checkbox (on by default when adding). A new person receives a link to set their own password, valid for three days, plus the dashboard address; an existing user receives the dashboard address. The message is written in the manager's panel language, and the form reports whether the e-mail went out or e-mail is not configured.
- **"I forgot my password."** The sign-in page links to a self-service reset: the person enters their e-mail or username and receives a one-day link; the response never reveals whether an account exists. The link opens a set-password page, and signing in afterwards shows a confirmation. Locked and deleted accounts never receive a link.
- Only a hash of the token is stored; a token is single-use and any new request invalidates the previous one. Migration 0023 adds the three columns.

---

## [1.35.0]

### Added — people (parity with the plugin)

- **Self-service account tab.** Every user can edit their own name, e-mail and phone on the profile page, see their username, and upload or remove their profile picture. The e-mail must be valid and not belong to another account (compared case-insensitively).
- **Profile pictures can be removed** by the person or by a member manager, falling back to the default monogram; before, a picture could only be replaced.
- **Usernames are shown on person cards** and included in the live search, and clients can be assigned to offices like everyone else.

### Changed — guards

- **Former members are refused server-side.** A member in the "finance only" state can save their bank details, language and theme, and read notifications; every other action is rejected on the server, not just hidden in the interface, as the plugin does.
- **Logging out marks the person offline at once** instead of leaving them "online" until the presence stamp expires.
- **Removing a person keeps history whenever any trace exists:** client assignments, comments, tasks created or assigned, claimed task roles, tender bids, piecework rows, ledger rows as payer or receiver, and QA sign-offs now count as a footprint, so the person is deactivated rather than deleted.

### Fixed

- **A bad profile picture is rejected before the person is created**, with a clear message, instead of creating the person and silently dropping the picture. If storage fails after creation, the form says so.
- **A member's own absence list shows upcoming ranges only**, as in the plugin.

---

## [1.34.0]

### Added — ledger and expense screens (parity with the plugin)

- **The ledger table has the plugin's columns:** row number, date, tag badges (with a "transfer" badge on transfer legs), description, a signed and coloured amount, payer, receiver, project, last editor, the EUR equivalent, and one link per receipt. Rows inside a closed period show a lock instead of the edit and delete buttons.
- **The EUR column follows the plugin's rule:** the settled equivalent when one was entered, else a rate-based conversion of the account amount, else a dash — never a frozen zero or a fake 1:1 figure. The column is shown only when the account currency is not the base currency.
- **Account pickers read "Office · Account (currency)"**, accounts are ordered by office, then sort order, then name, and the transfer dialog defaults its destination to the first other account.
- **Vendors are offered as receivers** of a withdrawal in the entry form, next to members and clients.
- **Expenses:** filters by category, payment account and due-date range, a "clear filters" button, a EUR equivalent per row with a live total of the filtered list, a per-vendor summary of active expenses (click to filter), and category and account shown on each row.
- **Rates in Settings** are displayed without trailing zeros and can be edited with the form pre-filled; the bank accounts page warns when no currency is defined yet.

### Fixed

- **The settlement calculator no longer overwrites the amount.** Typing the equivalent derives the rate, typing the rate derives the equivalent, and typing the amount updates whichever of the two is present — as in the plugin, where the bank amount is never touched. The rate field now shows the currency codes on both sides.

---

## [1.33.0]

### Added — accounting and payout flows (parity with the plugin)

- **Piecework rows can be paid directly from the payouts page.** An "unpaid work" list shows unit rows that have no open request; "Record in accounting" writes the withdrawal to the member, with the row amount as the settled equivalent, and marks the row paid. Rows with an open request are paid through the request, so nothing is paid twice.
- **Project-less payments are listed** on the payouts page: rows left behind when a project was deleted with "detach", with party, type, note and receipt.
- **The requests table shows the member's remaining contract balance, the request date, the member's note and their bank details** (card, IBAN, account), as in the plugin.
- **Paying a request or a unit row accepts the real bank amount** in the account currency; the requested amount is recorded as the settled equivalent of the member's obligation, and the resulting rate is learned for later conversions. Without it, the obligation amount converts through the stored rate, or refuses with a clear message when no rate exists.
- **Recurring expenses:** a new vendor can be typed by name, "pay the first occurrence now" on creation, and paying an expense that has no account advances the schedule after confirmation (as the plugin does) instead of being blocked. Paying puts the vendor and the category on the ledger row.
- **"Also register as a recurring expense"** on a new withdrawal takes a kind (recurring or one-off) and an interval, uses the receiver as the vendor, and is hidden when editing an existing row.

### Fixed

- **The party follows the direction server-side:** a deposit keeps only the payer and a withdrawal only the receiver, moving the existing party when the target is empty; a stale or crafted form can no longer store a payer on a withdrawal.
- **A free-text receiver of a withdrawal becomes a vendor** (created on first use, matched case-insensitively) and the row carries its vendor id, so per-vendor attribution works.
- **Ledger rows carry their account's office**, and the office amount is converted to the office's default currency instead of the account currency; a missing rate for the office currency no longer blocks booking.
- **A settled amount without a currency falls back to the obligation currency** (the member's contract currency, else the project currency) instead of being stored with no currency.

---

## [1.32.0]

### Added — accounting, payouts and finance access (parity with the plugin)

- **Finance access from member-role tags.** A member whose role tag grants "accountant" or "accounting manager" gets the matching finance permissions at login, like the plugin's capability sync; removing the tag removes the access at once. Tag holders are offered as accountant candidates when assigning accounts.
- **Scoped accountants can book.** An accountant limited to assigned accounts can now create, edit and delete rows and transfers on those accounts (they used to be read-only); other accounts stay invisible. Global project managers see every account, as in the plugin. Editing can no longer move a row to another account.
- **The ledger shows the open period only.** After a fiscal close the ledger starts the day after the lock and shows a "balance carried from the previous year" card; a "show rows of the closed period" link reveals everything. Totals stay the whole-account balance.
- **Payout request tabs and levels.** The owner sees pending / approved / paid / rejected / all tabs (plus "archived" after a close), with pending requests first; accountants see only approved and paid. Approving and rejecting is owner-only, rejecting asks for an optional reason that is sent to the member, the owner can pay a pending request in one step (the decision is recorded), and an accountant can pay approved requests only. Member phone numbers in the bank directory are shown to the owner only.
- **Recurring expenses keep their category, note and active flag**; the form pre-fills the currency and vendor when editing (they used to be cleared silently), inactive expenses can be listed through a status filter, and intervals read "every N months" when N > 1. An expense row can be turned into a monthly recurring expense from the entry form.
- **Transfers carry a description** onto both legs, with from/to labels and a EUR equivalent; deleting one leg deletes the whole transfer.
- **The accounts list shows the current balance**; editing an account pre-fills its note, sort order and private scope (they were wiped on every save); deleting asks for confirmation.
- **Currencies can be deactivated** (the default currency always stays active); saving a rate for the same pair and day updates it instead of failing, and the rates list shows the latest rate per pair.

### Changed

- **The finance role matches the plugin's lockdown:** an accountant reaches accounting and payouts only; settings, reports and activity need per-user access.
- A new ledger row defaults to a deposit, as before the rebuild.

---

## [1.31.0]

### Added — project and task rules (parity with the plugin)

- **Clients can be edited on the project page.** A "Clients" card lists the project's clients in assignment order (the first is the primary client) and an "Edit clients" dialog adds and removes them. Saving is a diff, so the primary client never reshuffles because the list was edited; newly added clients are notified. Before, a client could only be added from the card and never removed.
- **Confirmation before destructive actions.** Deleting a task, file, comment, QA item or QA role, lightening a project, withdrawing a winner, deleting a meeting, reminder, time entry, absence or ledger row, and removing a person all ask for confirmation first, through one shared dialog.
- **Default statuses.** A new project starts in "not started" (a new tender in "lead"), and a new task in the first "to do" status, instead of having no status at all — which used to leave projects out of every pipeline tab and tenders closed to bids.
- **The project description is shown on the project page** under the title.
- **A "no category" tab** for projects whose status has no known group; the projects page opens on "in progress" and lists "all" last, like the plugin; projects are listed newest first.

### Changed — guards

- **Frozen projects no longer lock the owner or global project managers** (the plugin's owner "manages from the admin card view"); members, clients, project managers and office managers stay read-only. The lock now also covers deleting an attachment, ticking a comment, and claiming a task.
- **Deleting a project is owner-only**, as in the plugin. Deleting a parent leaves its sub-projects as standalone projects instead of orphans, and deleting or lightening a project removes the attachment files from storage; lightening also clears the tender roles.
- **View-only staff can no longer change a task's status or post task notes**; both now require working access to the project, and the note composer is hidden from them. Members and clients may tick a comment as done, as in the plugin.
- **Project managers and office managers see private tasks on their own projects** (creator, assignee, or a manager of that project).
- **Claiming a task takes every unclaimed role the member holds** and keeps the task role-assigned instead of turning it into a personal task, so holders of the other roles keep seeing it.
- **A manager can withdraw only the approved winner** of a tender, not another member's pending bid.

### Fixed

- **"Overdue" and "deadline soon" follow the plugin:** cancelled and on-hold projects are excluded, completed ones are included until archived (the previous rule was the opposite), on the projects page and the dashboard.
- **The tender ribbon and tab appear only while the tender is open** (status "lead"); the dashboard's "tenders awaiting decision" counts open tenders with a pending bid and no winner, instead of every pending bid.
- **The delete banner on the manage tab could never say "locked"** because it was fed hard-coded balances; it now uses the real open balances.

---

## [1.30.0]

### Added — meetings, messaging and notifications (parity with the plugin)

- **Project managers and office managers can create meetings.** Creating a meeting required the staff-only `meetings.manage` permission, which no member has. A project meeting now needs management of that project (global, project manager by role tag, or manager of its office); a general meeting is open to owners/meeting staff for any office and to office managers for their own offices only, with the invitee pool scoped accordingly. Editing and deleting are allowed to the creator, a manager of the meeting's project, or global staff. The form lists only the projects and offices the person may use, and a creator who did not invite themself still sees their own meeting.
- **Attendee names are masked on meeting cards** the way they are on project pages: a client sees team members by role only, a member sees the client as "client", the owner sees everyone.
- **A meeting keeps its kind and project after creation.** Editing changes title, time, location, description and attendees only; the form shows the locked fields.
- **Manager identities are masked in messaging.** Members and clients see "Management" instead of a manager's real name in the inbox, the conversation header, message authors and notification titles; every manager in a conversation folds into one label. Anyone who can send on behalf of the organisation (owner, admin, staff with the send permission) counts as management.
- **Broadcast conversations are grouped in the sender's inbox** (count, unread total, child rows); recipients still see their own private conversation only.
- **Read receipts** (✓ delivered / ✓✓ read by every other participant) are shown to managers on their own messages, and stay live through the chat poll.
- **Deleting a conversation** is now two things, like the plugin: the creator or a manager deletes it for everyone; a recipient only removes it from their own inbox. Both also remove the bell notification of that conversation.
- **Recipient pickers list active members and clients only**, with their role; owners, admins and former members (including "finance only") are not offered, and broadcasts skip former members.
- **Clients added to a project are notified**, and the card's quick-add sends the same "added to project" notice as the members form. The member notice names the role ("as a member with role (Developer)").
- **Tender announcements are sent per role**, naming the role, so a member holding two opened roles gets two clear notices.
- **The daily report goes to every owner and admin with Telegram on**, chunked at 3,900 characters on line boundaries; long reports no longer fail silently. Telegram and Discord calls time out after 15 seconds.
- **A system time zone setting** (Settings → System) drives the daily report send time and the meeting reminders; it falls back to the `APP_TIMEZONE` environment variable.

### Fixed

- **Reading a conversation now clears its bell notification**; "new message" stayed unread after the conversation had been read.
- **Replies are no longer rate-limited.** The 30-second cooldown applies to new sends only, as in the plugin.
- **The inbox orders by latest activity**, so a conversation with a fresh reply rises to the top.
- **The daily-report gate compared the local hour with UTC minutes**, firing up to 30 minutes early or late in half-hour zones.
- **"Meeting soon" reminders reach the creator too, carry time and location, and tolerate a missed tick** (30-minute grace), instead of never firing once the start slipped past.
- **Personal reminders show the due time and the lead label** and link to the reminders tab; the timer reminder shows hours and minutes.
- **Former members in the "finance only" state receive money notifications only** — no task, comment, meeting or message alerts — and are never nudged to log hours.
- **Reconnecting Telegram turns the channel back on** for a user who had switched it off.

---

## [1.29.0]

### Changed — translations

- **Notifications are rendered in each recipient's language.** A notification used to be written once, in the sender's language, and stored as-is for every recipient. The service now takes a message key plus parameters and renders the title and body per recipient (falling back to the system default language). The scheduler, absence and payout emitters pass keys and parameters instead of pre-built Persian strings.
- **CSV exports carry translated headers.** Report, closing, team and finance exports used Persian column names in every language; the builders take the request's translator now.
- **The daily report is built in the configured default language** — the same text the settings preview shows. Section titles, the empty-section line and the absence rows are translated.
- **Dates and times are shown in the viewer's time zone.** Activity, meetings, messages, comments, tasks and the notification bell printed raw UTC. A shared formatter (`YYYY-MM-DD HH:mm`, Latin digits) renders in the profile's time zone; the meeting form reads and writes `datetime-local` values in that zone, so a 14:00 Tehran meeting is stored and shown as 14:00 Tehran.
- **The viewer-name masks ("member", "client") are translated** instead of always Persian.
- **Small fixed labels that stayed Persian in the English interface** — staff access badges, broadcast audience options, recurring payout units, the file-removal error, the member list joiner — go through the translator. Tag catalogue cells and the QA role picker fall back to the English name before the raw name.
- **The dashboard dates use Latin digits** like the rest of the app, and the document description is translated per request.

### Fixed — build

- **`next build` could die with "Zone Allocation failed"** when its fifteen default workers each reserved a heap. The build runs with four workers now.

---

## [1.28.1]

### Fixed — data correctness

- **The owner's "comments needing review" card was always 0**, and the team page's comments list always empty: both counted status `open`, while comments are written as `needs_review`. Both read the real status now, and the team list is limited to comment threads.
- **The dashboard week started on Saturday regardless of the setting.** It now follows the configured start of week, like the availability views.
- **The team page's "needs review" list came from the current page of the current task filter** — it changed with filters and paging and was never complete. It is its own query now, across every office project.
- **A task's roles could never change after creation.** Editing resolved roles and then updated only the `tasks` row; the edit form had no role picker at all. Edit now replaces the role set the way the plugin does — keeping `claimed_by` on roles that survive — and the form shows the picker with the current roles preselected.
- **Re-submitting a withdrawn tender bid left it withdrawn.** The bidder saw "your bid was recorded" while staying invisible to the manager. Re-submitting returns the bid to pending.
- **A manager could record piecework for someone who is not on the project**, producing a row with amount 0. It is refused with a clear message.
- **Editing logged hours skipped the frozen-project lock** that add, delete and the timer already enforce.
- **A managed office was dropped on save unless the person was also a member of it** — the form promised the opposite, and "team manager" access vanished after an edit. Managed offices are kept independently of membership.
- **The availability page listed locked, finance-only and deleted members** in the matrix, counts, timers and the "no schedule" list; it now shows active members only. Member names linked to a route that does not exist; they link to the member's report page.
- **The presence "offline" threshold could be shorter than "idle"**, making the three states inconsistent; offline is clamped to at least idle.
- **Clients saw real member names in role chips, and members saw the client's real name in the task assignment list.** Both go through the viewer-name mask now.

### Migration 0022

- **"Cancelled" (and "Completed") were seeded as open on databases that predate 0019.** 0019 adopts a pre-existing status row instead of inserting its own, and the adopted row kept `is_closed = false` — so cancelled projects counted as open everywhere `isOpenProject()` is used. 0022 sets `is_closed` for those groups where it is still wrong, and restores the plugin's colours where the seed colour was never changed.
- **Three unique keys the plugin has were missing:** thread participants, meeting attendees and account users. Duplicates meant double inbox rows and unread counts, and double invites. 0022 removes duplicates (keeping the oldest) and adds the indexes; the schema declares them.

---

## [1.28.0]

### Fixed — money

- **A project with unsettled client or member money could be deleted.** The delete guard's "locked" state was unreachable because its caller hard-coded both balances to `false`. Balances now come from the data (`repo.openBalances`): the client's paid-vs-due against price plus billable expenses, and each member's paid-vs-agreed, on the settled amount where one exists. "Open" means some paid and some still due; a price-less project with a deposit is not locked, nor is a fully paid one. Two older tests deleted projects carrying a real deposit and only passed because the guard was off; they use fully-paid fixtures now, and two new tests lock from real data.
- **Paid piecework rows stayed "requested" forever.** Paying a request computed which unit entry it closes and never wrote it, so the row was counted unpaid in reports, the member stayed "payable", and the double-pay guard was moot. The row is marked paid and linked to the ledger entry, with a DB test.
- **The primary client was the lowest user id, not the oldest assignment**, so QA client tasks and invoices could go to the wrong person. `repo.primaryClientId()` orders by the assignment row.
- **Ledger tags were never stored.** The form sent them and the filter queried them; nothing in between wrote a row, so the category filter and categorised expense reporting were dead. Tags are many-to-many now — written on create, replaced on edit, removed on delete, returned on the list row.
- **Editing a ledger row silently changed balances.** The list row never carried the payer/receiver links, the settled amount or the billable flag, so the edit form fell back to blanks and the payment mirror was rebuilt from them. The row carries every field the form needs and the form prefills all of them; a test saves an unchanged absorbed cost and checks the mirror still says absorbed.
- **A missing exchange rate produced rows with an account amount of zero.** The domain reported `missingRates` and the service ignored it. It is an error now with a clear message — unless the user entered the actual amount received, which needs no rate.
- **A second same-day settlement of the same currency pair threw** after the ledger row and mirror were written, because the learned-rate insert ran under a unique index with no conflict handling. It upserts.
- **Reports summed raw amounts across currencies.** Project prices, agreed amounts and unit entries are converted per row into the base currency with the configured rates; rows without a rate count as zero and the overall report says how many were excluded, rather than taking them 1:1.
- **A multi-client project was billed to every client**, doubling receivables; the plugin bills only the primary (oldest-assigned) client and shows the others the project as shared with nothing due. Both the receivables report and the client page follow that now.
- **Member payouts were counted as operating expenses.** Their ledger rows are recognised through the payment mirror and excluded from the expenses report, as the plugin does.

### Corrected from 1.27.4

- The client payment filter and the new delete guard used the mirror's direction names backwards: in this codebase `project_expense` is the *billable* expense and `project_cost` the absorbed one. Both now read the right one.

---

## [1.27.4]

### Fixed — access

- **An office manager or PM-by-tag got the error page on every project they manage.** The project page called two loaders that required the *global* `projects.view` / `projects.manage` whenever project-scoped `canManage` was true. Both loaders now take the project id and use the project-scoped guard, the same one the members and QA forms already used. Reproduced live before, verified live after.
- **A client could see member payouts.** The finance tab loaded every payment row for anyone allowed to see finance — which includes the project's client — and printed the per-member amounts. Rows are now filtered by audience before masking: a client sees incoming payments and billable expenses; a plain member sees only their own payouts; global managers see all. Rule in `domain/access/project-payments`, with tests.
- **Editing a meeting could leak a private project, and accepted any attendee id.** Create derived the meeting's private/company scope from its project; edit did not, so a meeting moved onto a private project stayed company-visible. Both paths now share one scope resolver, and attendee ids are intersected with the candidate pool (as the plugin does) instead of being inserted raw.
- **A staff admin with only members/meetings/messages/finance access was bounced to the login form after signing in.** The root page knew only projects, reports and the member/client roles. It now routes to the first allowed section (`domain/access/first-page`, tested), and never sends a live session back to `/login`.
- **The file gate re-implemented project access and got it wrong twice.** It read membership directly, ignoring `access_blocked` (a member whose access was cut could still download every file) and office/PM scope (an office manager got 403 on their own office's files). It now delegates to the project authority: members and clients unless blocked, otherwise manage-level authority (global, office manager, PM-by-tag) — global *viewers* still do not get files, as before. Two new DB tests pin both cases.

---

## [1.27.3]

### Fixed

- **Success toasts were Persian in every other language.** Ten `success:` strings passed to `useActionToast` — "Saved.", "Recorded.", "Task created.", "Entry recorded.", "Account saved.", "Payment recorded.", "Expense saved.", "Member added.", "Client added.", "Transfer recorded." — existed in no locale, because the key extractor only scanned `t()` calls and a fixed set of prop names that did not include `success`. So the coverage tool and its test both reported "nothing missing" while every save in an English UI said "ذخیره شد.". The extractor now scans `success` too, and the coverage test fails on exactly these the moment one is added without translations.
- **Task priority names showed raw Persian in every language.** `tagName()` always read the base `tags` table's `name_i18n`, so on the priority join — which is an alias — it returned the *status* tag's translation. It now takes the (possibly aliased) table; the two priority sites pass it.
- **Project deletion rendered a raw key in the activity feed.** Deletion writes `project.delete.none|detach|purge`; the label map only knew `soft|hard`, so every real variant showed as its identifier. The map now carries the three values the code writes, and the test that pinned the wrong pair was corrected.
- The work-hours hint rendered literal markdown asterisks (`**merged**`); the Kurdish locale was missing one key.

---

## [1.27.2]

### Security

- **A staff admin with "members → manage" could take over the owner's account.** `updatePerson`, `setMemberState` and `setPersonPassword` checked only the section permission and never looked at who the *target* was, so posting the owner's id renamed, re-emailed, re-usernamed or re-passworded the owner. The removal path already refused system admins; the other three did not. The people page now refuses to touch anyone holding `owner` (the owner edits themself from the profile) and lets only the owner edit a staff admin. Rule in `domain/access/people-edit`, pinned by unit and integration tests.

---

## [1.27.1]

### Changed

- **The app shell is capped at 1920px and centred on wider monitors.** The
  sidebar is `position: fixed` and anchors to the viewport, not the shell, so a
  plain `max-width` would have centred the content while the sidebar stayed
  glued to the screen edge with a gap between them. The shell now exposes
  `--shell-inset` — the same margin that centres it — and the fixed sidebar is
  offset by it. On any window narrower than the cap the inset is `0px` and
  nothing changes.

### Note on signing in with a username

If a member still cannot sign in with a username, the login form is not the
cause. The form has accepted usernames since 1.6.0; what was missing until
1.18.0 was **saving** one: the person-edit path never wrote the `username`
column, so anything typed into that field on a server older than 1.18.0 was
silently discarded and the column stayed `NULL`. There is no username to match.

To check, on the server's database:

```sql
select id, name, username from users where username is null;
```

Every row listed needs the username re-entered and saved once, on 1.18.0 or
later. Usernames are 3–32 characters of lowercase letters, digits, `.`, `_`
and `-`, starting and ending with a letter or digit; anything else — Persian
letters, spaces, `@` — is rejected at save time with "username invalid" rather
than stored.

---

## [1.27.0]

### Added

- **A standalone team availability page.** `/availability` replaces the tab
  buried inside Activity, which could not be linked to, did not appear in the
  command palette, and sat behind a permission its main audience does not hold.
  It carries the whole of the plugin's page: a summary strip (members / with a
  schedule / available now), a matrix and a board view, filters by name, office
  and role plus "available now only", the today column highlighted, presence
  dots and avatars, and four panels — on leave today, running timers, online
  now, and members with no schedule.

- **The matrix reads leave.** Someone on leave was previously shown with their
  normal working hours, which is worse than showing nothing. Leave now replaces
  **today's cell only** — the rest of the week keeps its schedule, because the
  matrix is a recurring weekly pattern while leave is a dated range, and the two
  only intersect on today. Leave also wins over the schedule for the
  "available now" count, and removes the person from today's board column.

- **"Who is working right now."** `work_timers` had only ever been queried for
  the current user, so a manager could not see who was on what. The panel shows
  each running timer with its project and elapsed `H:MM`. A timer with no
  project is kept, not hidden — untracked hours are still work.

- **An "online now" panel**, active before idle, each group newest first, with a
  relative last-seen. Offline people get no row, and with presence switched off
  the panel is empty rather than stale.

- **`isNowWithin()` is finally called.** It was implemented and unit-tested but
  referenced nowhere, so there was no "available now" count and no filter.

- **The office manager can see their team.** The page is gated on
  `members.view` **or** managing an office, and someone who only manages an
  office sees exactly their own offices' members — in the matrix, the filters,
  the timers, and the presence panel. This role holds no section permission at
  all, and previously had no route to any availability or presence view.

### Changed

- The Activity page's availability tab is now only the viewer's own weekly
  editor, matching how the plugin splits it: members record on their own
  dashboard, managers get the standalone page. One matrix in two places is two
  behaviours that drift apart.
- Dropped a `teamMatrix()` query the Activity page still paid for on every
  load after it stopped rendering the matrix.

---

## [1.26.0]

### Fixed

- **Nobody could record their working hours, so the team availability matrix
  was permanently empty.** The activity page called `listActivity()` first and
  returned an "access denied" page on `ForbiddenError` — before rendering the
  weekly schedule editor and the leave form, both of which are the user's *own*
  data and need no permission. Only `owner` and `finance` hold `activity.view`
  (`member: []`, `admin: []`), so no member ever reached the form. The rest of
  that same function already said as much in its comments — "the user's own
  weekly schedule always" — and the early return contradicted it. A missing
  permission now empties the events feed and hides its tab, nothing more.

- **The page was unreachable for the people who need it.** Its sidebar entry
  was gated on `activity.view` alone, but the page serves three audiences: the
  events feed (`activity.view`), the team availability matrix (`members.view`),
  and the viewer's own schedule and leave (any member). It is now shown to any
  of the three, and each sees only their part.

- **The availability view could not be linked to.** The tab lived in local
  state, so `/activity?tab=availability` was impossible and a refresh always
  bounced back to the first tab. The tab now comes from the URL.

### Known gaps (audited, not yet built)

An audit against the original plugin found more missing here. Not fixed yet,
recorded so they are not lost:

- The team matrix does not read `absences`, so someone on leave is still shown
  with their normal hours (`src/server/availability/service.ts` never imports
  the table).
- There is no "who is working right now" panel. `work_timers` is only ever
  queried for the current user; the plugin shows the whole team's running
  timers. The string "Running timers" is already translated into all nine
  locales and used by no component.
- `isNowWithin()` is implemented and unit-tested but called from nowhere, so
  there is no "available now" count or filter.
- No summary bar, board view, office/role filter, today-column highlight, or
  "no schedule" list — all of which the plugin's availability page has.
- An office manager still has no availability or presence view at all.

---

## [1.25.2]

### Changed

- **The Telegram connect button opens in a new tab.** It used to navigate the
  current page away to `t.me`, because `window.open` called after the `await`
  that mints the link is outside the click event and browsers treat it as a
  popup. The tab is now opened synchronously during the click — while it is
  still a user gesture — and pointed at the link once it arrives. If a popup
  blocker refuses it anyway, it falls back to the old same-tab behaviour rather
  than doing nothing, and if no link comes back the blank tab is closed instead
  of being left open.

### Fixed

- **The Telegram reminder banner dropped you on the wrong tab.** It links to
  `/profile?tab=telegram`, but the profile page kept its tab in local state and
  ignored the URL, so the button landed on "Bank account" — the one jump that
  banner exists to make. The profile page reads the tab from the URL now.

---

## [1.25.1]

### Fixed

- **The bell counted new notifications but never showed them.** The badge is
  driven by the live pulse; the list underneath it is server-rendered in the
  layout and only refreshed on a full page load. So the number climbed while
  the menu kept showing the old list, and the new notification appeared only
  after a manual refresh — exactly as reported. When the live count and the
  rendered list disagree, the bell now refreshes the server components, which
  updates the list without disturbing the open menu. Guarded to fire once per
  count, so a pulse that runs ahead of the page cache cannot loop.

---

## [1.25.0]

### Added

- **The app has error boundaries now.** There were none anywhere under
  `src/app` — no `not-found`, no `error`, no `global-error` — so any wrong
  address or server error dropped the user onto Next's bare screen: white
  background, English sentence, no shell, no menu, and no link back. That is
  why a broken link read as "it 404s" rather than "that address is wrong":
  there was no way out of it. All three boundaries exist now, themed and
  translated, each with a way home. The error page also shows the error digest,
  which is the only string that ties what the user saw to a line in the server
  log.

### Fixed

- **Purging old messages left their notifications behind.** The scheduled
  purge deletes the messages, the thread members and the thread, but never the
  `message.received` notifications pointing at them — so the bell kept offering
  conversations that no longer existed. The purge removes them now.

### Note on deployments

A member who cannot see their project, on a database that is behind on
migrations, is not a permissions bug: `0021_project_access_block` adds the
`access_blocked` column that the project queries filter on, and without it the
query fails outright. Migrations run at boot from `src/instrumentation.ts`, but
`register()` runs **once per process** — a server that was not restarted after
the upgrade keeps serving new code against the old schema. Check with:

```sql
select table_name from information_schema.columns where column_name = 'access_blocked';
```

Two rows is correct. Zero means the deployment needs `pnpm db:migrate`, or a
full restart.

---

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
