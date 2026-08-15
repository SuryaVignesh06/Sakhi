import { db } from '../db/client.js';
import { hub } from '../events/emitter.js';
import type { ToolContext } from './registry.js';

/**
 * Long-term facts, stored in the Memory table.
 *
 * Retrieval is keyword scoring in process, not embeddings. SQLite has no vector
 * type and the corpus here is tens of rows, so a similarity index would be
 * slower to build and no more accurate. `Memory.embedding` stays unused until
 * the corpus justifies sqlite-vec — at which point only this file changes.
 */

const MAX_CONTENT = 2_000;
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'my', 'me', 'i', 'you', 'your',
  'what', 'when', 'where', 'who', 'how', 'do', 'does', 'did', 'it', 'that', 'this',
]);

const terms = (q: string) =>
  q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));

export interface MemoryArgs {
  action: 'store' | 'search' | 'list';
  text?: string;
  kind?: string;
}

/**
 * The project a turn belongs to.
 *
 * Set by the planner before tools run. A module-level value rather than a
 * parameter because ToolContext is shared by every tool and only this one
 * cares — threading it through all of them would be noise.
 */
let currentProject: string | undefined;
export const setActiveProject = (id?: string) => { currentProject = id; };
const activeProjectId = () => currentProject;

export async function runMemory(args: MemoryArgs, ctx: ToolContext): Promise<string> {
  if (args.action === 'store') {
    const text = String(args.text ?? '').trim().slice(0, MAX_CONTENT);
    if (!text) return JSON.stringify({ success: false, error: 'A non-empty "text" is required to store a memory.' });

    ctx.progress(50, 'Saving…');
    try {
      const row = await db.raw.memory.create({
        data: {
          content: text,
          kind: String(args.kind ?? 'fact'),
          source: 'assistant',
          // Null when no project is active, which makes the memory global.
          projectId: activeProjectId() ?? null,
        },
      });
      // Lets any open client refresh without polling.
      hub.emit('memory.updated', { memoryId: row.id });
      ctx.progress(100, 'Saved.');
      return JSON.stringify({ success: true, id: row.id, message: `Remembered: "${text}"` });
    } catch (e) {
      return JSON.stringify({ success: false, error: `Could not save the memory: ${(e as Error).message}` });
    }
  }

  if (args.action === 'search' || args.action === 'list') {
    ctx.progress(50, 'Searching memories…');
    let rows: { id: string; content: string; kind: string; createdAt: Date }[];
    try {
      rows = await db.raw.memory.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    } catch (e) {
      return JSON.stringify({ success: false, error: `Could not read memories: ${(e as Error).message}` });
    }

    if (args.action === 'list' || !String(args.text ?? '').trim()) {
      ctx.progress(100, 'Done.');
      return JSON.stringify({
        success: true,
        count: rows.length,
        memories: rows.slice(0, 20).map((r) => ({ id: r.id, kind: r.kind, content: r.content })),
      });
    }

    const q = terms(String(args.text));
    const scored = rows
      .map((r) => {
        const hay = r.content.toLowerCase();
        // Whole-word hits count double, so "cat" does not score on "category".
        const score = q.reduce(
          (n, t) => n + (new RegExp(`\\b${t}\\b`).test(hay) ? 2 : hay.includes(t) ? 1 : 0),
          0
        );
        return { r, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    ctx.progress(100, 'Done.');
    return JSON.stringify({
      success: true,
      query: String(args.text),
      matches: scored.length,
      memories: scored.map(({ r, score }) => ({ id: r.id, kind: r.kind, content: r.content, score })),
      ...(scored.length ? {} : { note: 'Nothing stored matches that. Say so rather than guessing.' }),
    });
  }

  return JSON.stringify({
    success: false,
    error: `Unsupported action "${args.action}".`,
    actions: ['store', 'search', 'list'],
  });
}

export const MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['store', 'search', 'list'],
      description:
        'store saves something worth remembering across conversations — ' +
        'preferences, likes, dislikes, habits, durable facts. search finds ' +
        'stored memories by keyword. list returns recent ones.',
    },
    text: { type: 'string', description: 'The fact to store, or the words to search for.' },
    kind: {
      type: 'string',
      enum: ['like', 'dislike', 'preference', 'fact', 'project', 'reference'],
      description:
        'For store. like = something the user enjoys or wants more of. ' +
        'dislike = something to avoid. preference = how they want things done ' +
        '(tone, format, defaults). fact = a durable truth about them. ' +
        'project = ongoing work. reference = a link or resource. Defaults to fact.',
    },
  },
  required: ['action'],
} as const;
