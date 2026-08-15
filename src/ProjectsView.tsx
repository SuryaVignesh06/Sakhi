import { useEffect, useState } from 'react';
import { BookOpen, Brain, FileText, FolderGit2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  addKnowledge, createProject, deleteKnowledge, deleteProject, fetchKnowledge,
  fetchProjectMemories, fetchProjects, updateProject,
  type KnowledgeDoc, type Project, type ProjectMemory,
} from './api';
import './ProjectsView.css';

/**
 * Projects — workspaces, each with its own memory.
 *
 * This replaces the standalone Chat page. Chat already lives on the home
 * screen, so a second identical thread was two doors into one room; what was
 * actually missing was somewhere to keep separate pieces of work apart.
 *
 * The memory scoping is the substance, not the folder metaphor: a preference
 * Sakhi learns while working on one project is recalled only while that
 * project is open, so advice for a Rust service does not bleed into a
 * cooking-notes workspace. Global memories still apply everywhere.
 */

export default function ProjectsView({
  activeId, onOpen,
}: {
  activeId?: string;
  /** Opening a project switches the chat into its context. */
  onOpen: (p: Project | null) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rootPath, setRootPath] = useState('');

  /** Which project's memory is expanded, and what it holds. */
  const [peek, setPeek] = useState<string | null>(null);
  const [memories, setMemories] = useState<ProjectMemory[]>([]);

  /* The project whose brief is open. Instructions and knowledge are the two
     things that make a project more than a memory scope — the same shape as
     Claude Projects, where both apply to every conversation inside it. */
  const [briefFor, setBriefFor] = useState<Project | null>(null);
  const [instructions, setInstructions] = useState('');
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [docTitle, setDocTitle] = useState('');
  const [docBody, setDocBody] = useState('');
  const [saved, setSaved] = useState(false);

  const openBrief = async (p: Project) => {
    setBriefFor(p);
    setInstructions(p.instructions ?? '');
    setDocs(await fetchKnowledge(p.id));
    setDocTitle(''); setDocBody(''); setSaved(false);
  };

  const saveInstructions = async () => {
    if (!briefFor) return;
    await updateProject(briefFor.id, { instructions });
    setSaved(true);
    // The tick is an acknowledgement, not a state — it should fade.
    setTimeout(() => setSaved(false), 1800);
    await load();
  };

  const addDoc = async () => {
    if (!briefFor || !docBody.trim()) return;
    const made = await addKnowledge(briefFor.id, docTitle.trim() || 'Untitled', docBody);
    if (made) { setDocs((d) => [made, ...d]); setDocTitle(''); setDocBody(''); }
  };

  const load = async () => {
    setLoading(true);
    setProjects(await fetchProjects());
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!peek) return setMemories([]);
    void fetchProjectMemories(peek).then(setMemories);
  }, [peek]);

  const submit = async () => {
    if (!name.trim()) return;
    const made = await createProject({
      name: name.trim(),
      description: description.trim() || undefined,
      rootPath: rootPath.trim() || undefined,
    });
    if (made) {
      setName(''); setDescription(''); setRootPath('');
      setCreating(false);
      await load();
      onOpen(made);
    }
  };

  const remove = async (p: Project) => {
    /* Deleting takes its memories with it — say so, because that is the part
       the user cannot get back. */
    const ok = window.confirm(
      `Delete "${p.name}"?\n\nIts ${p.memoryCount} remembered ${
        p.memoryCount === 1 ? 'item' : 'items'
      } will be deleted too. This cannot be undone.`
    );
    if (!ok) return;
    await deleteProject(p.id);
    if (activeId === p.id) onOpen(null);
    await load();
  };

  return (
    <div className="pv-root">
      <header className="pv-head">
        <div>
          <h2>Projects</h2>
          <p>Each project keeps its own memory. Sakhi recalls what it learned here only while you are here.</p>
        </div>
        <button className="pv-new" onClick={() => setCreating((c) => !c)}>
          {creating ? <X size={16} /> : <Plus size={16} />}
          {creating ? 'Cancel' : 'New project'}
        </button>
      </header>

      {creating && (
        <div className="pv-form">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Project name"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is it about? (optional)"
          />
          <input
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="Folder this project lives in, e.g. Documents/thesis (optional)"
          />
          <button className="pv-create" onClick={submit} disabled={!name.trim()}>Create</button>
        </div>
      )}

      {loading && <p className="pv-empty">Loading…</p>}

      {!loading && projects.length === 0 && (
        <p className="pv-empty">
          No projects yet. Create one to give a piece of work its own memory.
        </p>
      )}

      <div className="pv-grid">
        {projects.map((p) => (
          <div key={p.id} className={`pv-card ${activeId === p.id ? 'is-active' : ''}`}>
            <button className="pv-card-main" onClick={() => onOpen(p)}>
              <span className="pv-card-title">
                <FolderGit2 size={16} />
                {p.name}
                {activeId === p.id && <span className="pv-badge">Active</span>}
              </span>
              {p.description && <span className="pv-card-desc">{p.description}</span>}
              {p.rootPath && <span className="pv-card-path">{p.rootPath}</span>}
            </button>

            <div className="pv-card-foot">
              <button
                className="pv-mem"
                onClick={() => setPeek(peek === p.id ? null : p.id)}
                title="What Sakhi remembers here"
              >
                <Brain size={13} />
                {p.memoryCount} remembered
              </button>
              <button className="pv-mem" onClick={() => void openBrief(p)} title="Instructions and knowledge">
                <BookOpen size={13} />
                Brief
              </button>
              <button className="pv-del" onClick={() => remove(p)} title="Delete project">
                <Trash2 size={13} />
              </button>
            </div>

            {peek === p.id && (
              <ul className="pv-memories">
                {memories.length === 0 && <li className="pv-mem-empty">Nothing learned here yet.</li>}
                {memories.map((m) => (
                  <li key={m.id}>
                    <span className={`pv-kind pv-kind--${m.kind}`}>{m.kind}</span>
                    {m.content}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* ── Project brief ─────────────────────────────────────────────
          Instructions and knowledge both ride in the system prompt for every
          turn inside this project, so this panel is the project's standing
          context rather than a settings screen. */}
      {briefFor && (
        <div className="pv-modal" onClick={() => setBriefFor(null)}>
          <div className="pv-sheet" onClick={(e) => e.stopPropagation()}>
            <header className="pv-sheet-head">
              <FolderGit2 size={17} />
              <div>
                <strong>{briefFor.name}</strong>
                <span>Project brief</span>
              </div>
              <button onClick={() => setBriefFor(null)} aria-label="Close"><X size={17} /></button>
            </header>

            <section className="pv-sect">
              <h4><Sparkles size={13} /> Custom instructions</h4>
              <p className="pv-hint">
                Applied to every conversation in this project — tone, conventions,
                what to assume, what to avoid.
              </p>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. This is a TypeScript codebase. Prefer small pure functions and never add a dependency without saying why."
              />
              <button className="pv-save" onClick={saveInstructions}>
                {saved ? 'Saved' : 'Save instructions'}
              </button>
            </section>

            <section className="pv-sect">
              <h4><FileText size={13} /> Project knowledge</h4>
              <p className="pv-hint">
                Reference material Sakhi treats as known here. Keep it short —
                it is sent with every turn; put anything long on disk instead.
              </p>

              <ul className="pv-docs">
                {docs.length === 0 && <li className="pv-none">Nothing added yet.</li>}
                {docs.map((d) => (
                  <li key={d.id}>
                    <span className="pv-doctitle">{d.title}</span>
                    <span className="pv-docsize">{d.content.length} chars</span>
                    <button
                      onClick={async () => {
                        await deleteKnowledge(briefFor.id, d.id);
                        setDocs((x) => x.filter((y) => y.id !== d.id));
                      }}
                      aria-label={`Remove ${d.title}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>

              <input
                className="pv-doctitleinput"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Title, e.g. API conventions"
              />
              <textarea
                value={docBody}
                onChange={(e) => setDocBody(e.target.value)}
                placeholder="Paste the reference material…"
              />
              <button className="pv-save" onClick={addDoc} disabled={!docBody.trim()}>
                Add to knowledge
              </button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
