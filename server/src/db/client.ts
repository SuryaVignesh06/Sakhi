import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper over Prisma.
 *
 * Every method degrades to a safe default if the database is unavailable, so a
 * missing migration cannot take the assistant offline — you lose history, not
 * the ability to answer. Failures are logged once, not per call.
 */

const prisma = new PrismaClient();

let warned = false;
function degrade(op: string, e: unknown) {
  if (!warned) {
    console.warn(
      `[db] ${op} failed — continuing without persistence. ` +
        `Run "npm run db:push" in server/. (${(e as Error).message})`
    );
    warned = true;
  }
}

export const db = {
  raw: prisma,

  async newConversation(title?: string) {
    try {
      return await prisma.conversation.create({ data: { title } });
    } catch (e) {
      degrade('newConversation', e);
      return { id: crypto.randomUUID(), title: title ?? null } as { id: string; title: string | null };
    }
  },

  async addMessage(
    conversationId: string,
    role: 'system' | 'user' | 'assistant',
    content: string,
    meta?: { provider?: string; model?: string; tokens?: number }
  ) {
    try {
      return await prisma.message.create({
        data: { conversationId, role, content, ...meta },
      });
    } catch (e) {
      degrade('addMessage', e);
      return null;
    }
  },

  /** Oldest-first, so it can be appended straight into a prompt. */
  async recentMessages(conversationId: string, take = 10) {
    try {
      const rows = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return rows.reverse();
    } catch (e) {
      degrade('recentMessages', e);
      return [];
    }
  },

  async listConversations(take = 30) {
    try {
      return await prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' }, take });
    } catch (e) {
      degrade('listConversations', e);
      return [];
    }
  },

  async logAgent(
    conversationId: string | null,
    agent: string,
    provider?: string,
    model?: string,
    durationMs?: number,
    error?: string
  ) {
    try {
      return await prisma.agentLog.create({
        data: {
          conversationId,
          agent,
          provider,
          model,
          durationMs,
          status: error ? 'failed' : 'completed',
          error,
        },
      });
    } catch (e) {
      degrade('logAgent', e);
      return null;
    }
  },

  async getSetting(key: string) {
    try {
      return (await prisma.setting.findUnique({ where: { key } }))?.value ?? null;
    } catch (e) {
      degrade('getSetting', e);
      return null;
    }
  },

  async setSetting(key: string, value: string) {
    try {
      return await prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    } catch (e) {
      degrade('setSetting', e);
      return null;
    }
  },

  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async disconnect() {
    await prisma.$disconnect().catch(() => {});
  },
};
