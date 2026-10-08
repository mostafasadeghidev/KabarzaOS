/**
 * دسته‌بندیِ ابزارهای ربات (۲.۱۳.۰).
 *
 * ⚠️ چرا: با ابزارهای کامل، ربات بیش از ۸۰ (و با کارهای حساس بیش از ۱۲۰) ابزار
 * دارد. فرستادنِ همه در هر پیام برای مدل‌های رایگان سنگین است و بعضی ارائه‌دهنده‌ها
 * حداکثر ۱۲۸ ابزار می‌پذیرند. پس ربات فقط ابزارهای پرکاربرد را همیشه دارد و بقیه را
 * مدل با `load_tools` و فقط وقتِ نیاز بارگذاری می‌کند.
 *
 * ابزاری که اینجا نامش نیست به دستهٔ `other` می‌رود (هیچ ابزاری گم نمی‌شود).
 */

export const CORE_TOOLS = new Set([
  'whoami', 'list_my_tasks', 'search', 'list_projects', 'get_project', 'list_task_statuses',
  'my_hours', 'log_hours', 'start_timer', 'stop_timer',
  'create_task', 'set_task_status', 'add_comment', 'get_task', 'update_task', 'add_task_note',
  'list_my_meetings', 'list_my_reminders', 'create_reminder', 'delete_reminder',
  'list_message_recipients', 'send_message', 'message_management', 'list_inbox', 'read_thread', 'reply_message',
  'list_notifications',
]);

export const TOOL_GROUPS: Record<string, readonly string[]> = {
  projects: [
    'get_project_full', 'task_form_options', 'refer_task', 'claim_task', 'toggle_comment_done',
    'get_qa', 'apply_qa', 'toggle_qa_item', 'list_reviews', 'get_review', 'create_review', 'update_review',
    'add_review_item', 'add_project_link', 'pin_file',
  ],
  team: [
    'team_overview', 'team_tasks', 'team_members', 'team_member', 'team_availability', 'list_people',
    'leave_targets', 'list_leave', 'record_leave', 'set_weekly_schedule', 'my_schedule',
    'onboarding_board', 'onboarding_detail', 'onboarding_toggle', 'onboarding_start', 'onboarding_add_task', 'access_board',
  ],
  meetings_messages: [
    'meeting_form_options', 'meeting_candidates', 'create_meeting', 'update_meeting',
    'mute_conversation', 'create_channel', 'create_project_group', 'mark_notification_read',
  ],
  hours: ['list_time_logs', 'loggable_projects', 'update_time_log', 'resolve_long_timer'],
  finance_reports: [
    'get_dashboard', 'get_report', 'finance_accounts', 'finance_ledger', 'payment_requests',
    'recurring_payments', 'my_money', 'list_activity',
  ],
  profile: ['update_my_profile', 'set_my_timezone', 'set_notification_prefs'],
};

/** دستهٔ یک ابزار؛ ابزارِ حساس همیشه `sensitive`، ناشناخته `other`. */
export function groupOf(name: string, destructive = false): string | null {
  if (CORE_TOOLS.has(name)) return null;
  if (destructive) return 'sensitive';
  for (const [group, names] of Object.entries(TOOL_GROUPS)) if (names.includes(name)) return group;
  return 'other';
}

export const GROUP_HINTS: Record<string, string> = {
  projects: 'full project tabs, task options, refer/claim tasks, comments done, QA, reviews, project links and pins',
  team: 'team overview/tasks/members, people lists, leave, weekly schedule, onboarding, access register',
  meetings_messages: 'create/edit meetings and invitees, channels, project group chats, mute, mark notifications read',
  hours: 'list/edit my time entries, loggable projects, long-timer decisions',
  finance_reports: 'dashboard, reports, finance accounts/ledger, payment requests, recurring payments, my money, activity log',
  profile: 'my profile, timezone, notification preferences',
  sensitive: 'money, payments, deleting, people and access, project settings, system settings (needs the user\'s sensitive permission)',
  other: 'anything else',
};
