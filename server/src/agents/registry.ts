import { tools } from '../tools/registry.js';
import type { ToolSchema } from '../providers/types.js';
import type { AgentDefinition } from './types.js';
import type { AgentName } from '../events/protocol.js';

/**
 * The specialists.
 *
 * Each one is a scope, not a personality. What makes the Browser agent a
 * browser agent is that it can drive a browser and cannot delete files —
 * narrowing the tool list is what makes its behaviour predictable and its
 * failures diagnosable.
 *
 * `planner` is the generalist fallback and deliberately holds everything: a
 * request that does not sort cleanly into a specialism must still be doable.
 */

const AGENTS: AgentDefinition[] = [
  {
    name: 'browser',
    title: 'Browser',
    purpose:
      'Anything on the web: opening sites, searching, reading pages, filling forms, ' +
      'clicking through flows, playing videos or music.',
    tools: ['browser', 'research'],
    brief:
      'You drive a real browser the user can watch. Prefer acting in the page over ' +
      'describing what the user should click. To play a song or video use action ' +
      '"play_youtube" with the name as `query`.',
  },
  {
    name: 'desktop',
    title: 'Desktop',
    purpose:
      'The machine itself: launching applications, the clipboard, and read-only ' +
      'system checks such as battery, disk and running apps.',
    tools: ['desktop', 'clipboard', 'terminal', 'apps'],
    brief:
      'You act on the local machine. Use "list_apps" when unsure what is installed ' +
      'rather than guessing at a name.',
  },
  {
    name: 'coding',
    title: 'Coding',
    purpose:
      'Reading and changing code, inspecting repositories, running read-only git ' +
      'commands, and opening projects in an editor.',
    tools: ['filesystem', 'files', 'apps', 'terminal'],
    brief:
      'You work on the user\'s real code. Read a file before you change it, and ' +
      'make the smallest change that does the job.',
  },
  {
    name: 'research',
    title: 'Research',
    purpose:
      'Questions whose answer depends on current information, or on the contents ' +
      'of specific pages. Searches, reads and synthesises.',
    tools: ['research', 'browser'],
    brief:
      'Use action "deep" to research a question end to end. Say what you found and ' +
      'where it came from; do not present a guess as a finding.',
  },
  {
    name: 'memory',
    title: 'Memory',
    purpose:
      'Recalling or recording durable facts and preferences about the user.',
    tools: ['memory'],
    brief:
      'Store only what will still be true next week. Never store credentials.',
  },
  {
    name: 'automation',
    title: 'Connected Apps',
    purpose:
      'Work inside an app the user has connected — GitHub, Notion, a shared folder ' +
      'and so on. Use this whenever the user names a connected app.',
    tools: [],
    connectionTools: true,
    brief:
      'You act inside the user\'s connected apps. Their actions are namespaced by ' +
      'app, e.g. `github__create_issue`. Read the result of each action before the next.',
  },
  {
    name: 'planner',
    title: 'General',
    purpose:
      'Anything that does not sort cleanly into another specialism, or that needs ' +
      'several kinds of capability at once.',
    /* Empty means "everything" — see toolsFor. The generalist must never be the
       agent that cannot do the thing. */
    tools: [],
    connectionTools: true,
    brief: '',
  },
];

const BY_NAME = new Map<AgentName, AgentDefinition>(AGENTS.map((a) => [a.name, a]));

export const listAgents = (): AgentDefinition[] => AGENTS;

export const getAgent = (name: AgentName): AgentDefinition | undefined => BY_NAME.get(name);

/**
 * The tool schemas one agent is allowed to use.
 *
 * Filtered from the live registry rather than stored, so an app connected
 * five seconds ago is already available to the agents entitled to it, and a
 * disconnected one disappears from them.
 */
export function toolsFor(agent: AgentDefinition): ToolSchema[] {
  const all = tools.schemas();
  const fromConnections = new Set(
    tools
      .list()
      .filter((t) => t.source.kind === 'connection')
      .map((t) => t.name)
  );

  // The generalist: everything, including connected apps.
  if (!agent.tools.length && agent.connectionTools) return all;

  const allowed = new Set<string>(agent.tools as string[]);
  return all.filter((s) => {
    const name = s.function.name;
    if (fromConnections.has(name)) return agent.connectionTools === true;
    return allowed.has(name);
  });
}

/** A compact roster for the Supervisor's routing decision. */
export function roster(): string {
  return AGENTS.filter((a) => a.name !== 'planner')
    .map((a) => `- ${a.name}: ${a.purpose}`)
    .join('\n');
}
