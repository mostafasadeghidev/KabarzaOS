import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TokenSession } from './tokens';
import { makeKit } from './kit';
import { registerCore } from './tools/core';
import { registerRead } from './tools/read';
import { registerWork } from './tools/work';
import { registerSensitive } from './tools/sensitive';

/**
 * سرورِ MCP ِ Kabarza (۲.۷.۰؛ چندفایلی از ۲.۱۳.۰) — ابزارهایی که هوشِ مصنوعی
 * با آن‌ها روی برنامه کار می‌کند. قاعده‌ها در `kit.ts`؛ ابزارها در `tools/*`.
 */
export function buildMcpServer(session: TokenSession): McpServer {
  const server = new McpServer(
    { name: 'kabarza', version: '2.13.0' },
    {
      instructions: [
        'Kabarza is an agency workspace: projects, tasks, work hours, meetings, messages, files, QA, reviews, finance and team.',
        'Every tool acts as the signed-in user and sees and does only what that user can in the app.',
        'Use search or list_projects to find ids before id-based tools.',
        'Data is often in Persian; answer the user in their language.',
        'To message a person use list_message_recipients then send_message; to reach the managers use message_management. A project comment (add_comment) is not a message.',
        'Meetings: list_my_meetings. Personal reminders: list_my_reminders, create_reminder, delete_reminder (times are in the user timezone).',
      ].join(' '),
    },
  );
  const kit = makeKit(server, session);
  registerCore(kit);
  registerRead(kit);
  registerWork(kit);
  // ⚠️ فقط با اجازهٔ صریحِ «حساس»؛ بی آن هیچ ابزاری ثبت نمی‌شود.
  registerSensitive(kit);
  return server;
}
