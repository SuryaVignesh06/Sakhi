import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, Box, Check, ChevronDown, Eye, Key, Loader2, RefreshCw,
  Search, Sparkles, Trash2, Wrench, X,
} from 'lucide-react';
import {
  PROVIDERS, fetchBackendKeys, fetchModels, fmtContext, fmtPrice, fmtSize, getKeys, getSelected,
  maskKey, setKey as saveKey, setSelected, testKey,
  type ModelInfo, type ProviderId,
} from './modelStore';
import { preloadModel } from './api';
import './ModelSelector.css';

type Filter = 'all' | 'free' | 'paid' | 'vision' | 'tools' | 'thinking' | 'long';
type Sort = 'default' | 'context' | 'price' | 'name';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'free', label: 'Free' },
  { id: 'paid', label: 'Paid' },
  { id: 'vision', label: 'Vision' },
  { id: 'tools', label: 'Tools' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'long', label: 'Long context' },
];

export default function ModelSelector({
  onChange,
}: {
  onChange?: (m: ModelInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ProviderId>('openrouter');
  const [current, setCurrent] = useState<ModelInfo | null>(() => getSelected());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('default');
  const [keyPanel, setKeyPanel] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  /* Per-provider cache so switching tabs does not refetch every time. */
  const [cache, setCache] = useState<
    Partial<Record<ProviderId, { models: ModelInfo[]; error?: string; blocked?: boolean }>>
  >({});
  const [loading, setLoading] = useState(false);
  const [serverKeys, setServerKeys] = useState<
    Partial<Record<ProviderId, { configured: boolean; masked: string | null; fromEnv: boolean }>>
  >({});

  const localKeys = getKeys();

  /* A key counts as present if EITHER store has it. The server copy is the
     one the agent loop actually uses, so it is the one that decides. */
  const keys: Partial<Record<ProviderId, string>> = { ...localKeys };
  for (const [id, st] of Object.entries(serverKeys) as [ProviderId, any][]) {
    if (st?.configured && !keys[id]) keys[id] = st.masked ?? '••••';
  }

  useEffect(() => {
    if (!open) return;
    void fetchBackendKeys().then(setServerKeys);
  }, [open]);

  const load = async (p: ProviderId, force = false) => {
    if (!force && cache[p]) return;
    setLoading(true);
    const res = await fetchModels(p);
    setCache((c) => ({ ...c, [p]: res }));
    setLoading(false);
  };

  useEffect(() => {
    if (open) load(tab);
  }, [open, tab]);

  /* As a modal the scrim handles dismissal by click, so only Escape needs a
     listener. The page behind is frozen so the dialog is the only thing that
     scrolls. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const entry = cache[tab];
  const models = entry?.models ?? [];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = models.filter((m) => {
      if (q && !(`${m.name} ${m.id}`.toLowerCase().includes(q))) return false;
      if (filter === 'free' && m.pricePer1M !== 0) return false;
      if (filter === 'paid' && !(m.pricePer1M && m.pricePer1M > 0)) return false;
      if (filter === 'vision' && !m.supportsVision) return false;
      if (filter === 'tools' && !m.supportsTools) return false;
      if (filter === 'thinking' && !m.supportsThinking) return false;
      if (filter === 'long' && (m.contextWindow ?? 0) < 128_000) return false;
      return true;
    });
    if (sort === 'context') list = [...list].sort((a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0));
    else if (sort === 'price') list = [...list].sort((a, b) => (a.pricePer1M ?? 1e9) - (b.pricePer1M ?? 1e9));
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else list = [...list].sort((a, b) => Number(b.recommended) - Number(a.recommended));
    return list;
  }, [models, query, filter, sort]);

  const pick = (m: ModelInfo) => {
    setSelected(m);
    setCurrent(m);
    onChange?.(m);
    setOpen(false);

    /* Start reading the weights into memory right away. Local models are the
       only ones this does anything for, and the seconds it saves are the
       seconds the user would otherwise spend staring at an empty reply.
       `description` is what separates the two local runtimes — see
       fetchLocal() in modelStore. */
    if (m.provider === 'local') {
      const backend = m.description?.startsWith('LM Studio') ? 'lmstudio' : 'ollama';
      void preloadModel(backend, m.id);
    }
  };

  const provider = PROVIDERS.find((p) => p.id === tab)!;

  const onSaveKey = async () => {
    setTesting(true);
    const res = await testKey(tab, keyDraft);
    setKeyMsg({ ok: res.ok, text: res.message });
    setTesting(false);
    if (res.ok) {
      saveKey(tab, keyDraft);
      setKeyDraft('');
      await load(tab, true);
    }
  };

  const onRemoveKey = () => {
    saveKey(tab, '');
    setKeyMsg(null);
    setCache((c) => ({ ...c, [tab]: undefined }));
    load(tab, true);
  };

  const dialog = (
    /* Clicking the scrim dismisses; clicks inside the panel must not bubble up
       to it, hence the stopPropagation on the panel itself. */
    <div className="ms-overlay" onClick={() => setOpen(false)}>
      <div
        className="ms-pop"
        role="dialog"
        aria-modal="true"
        aria-label="Model picker"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ms-head">
          <Box size={20} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <div className="ms-head-title">Choose a model</div>
            <div className="ms-head-sub">
              {current ? current.name : 'No model selected'}
            </div>
          </div>
          <button className="ms-head-close" onClick={() => setOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="ms-tabs" role="tablist">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={tab === p.id}
                className={`ms-tab ${tab === p.id ? 'ms-tab--on' : ''}`}
                onClick={() => { setTab(p.id); setKeyPanel(false); setKeyMsg(null); }}
              >
                {p.label}
                {p.needsKey && !keys[p.id] && <span className="ms-nokey" title="No API key" />}
              </button>
            ))}
          </div>

          <div className="ms-bar">
            <div className="ms-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${provider.label} models…`}
                aria-label="Search models"
              />
            </div>
            <select
              className="ms-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort models"
            >
              <option value="default">Recommended</option>
              <option value="context">Context</option>
              <option value="price">Price</option>
              <option value="name">Name</option>
            </select>
            <button className="ms-icon" onClick={() => load(tab, true)} title="Refresh" aria-label="Refresh models">
              <RefreshCw size={14} className={loading ? 'ms-spin' : ''} />
            </button>
            <button
              className={`ms-icon ${keyPanel ? 'ms-icon--on' : ''}`}
              onClick={() => setKeyPanel((k) => !k)}
              title="API key"
              aria-label="Manage API key"
            >
              <Key size={14} />
            </button>
          </div>

          {keyPanel && (
            <div className="ms-keypanel">
              {keys[tab] ? (
                <div className="ms-keyrow">
                  <span className="ms-keymask">
                    {localKeys[tab] ? maskKey(localKeys[tab]!) : keys[tab]}
                  </span>
                  {serverKeys[tab]?.fromEnv ? (
                    <span className="ms-keynote">Set by an environment variable</span>
                  ) : (
                    <button className="ms-keydel" onClick={onRemoveKey}>
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              ) : (
                <div className="ms-keyrow">
                  <input
                    type="password"
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    placeholder={provider.keyHint}
                    aria-label={`${provider.label} API key`}
                  />
                  <button className="ms-keysave" onClick={onSaveKey} disabled={testing}>
                    {testing ? <Loader2 size={13} className="ms-spin" /> : 'Test & save'}
                  </button>
                </div>
              )}
              {keyMsg && (
                <div className={`ms-keymsg ${keyMsg.ok ? 'is-ok' : 'is-bad'}`}>{keyMsg.text}</div>
              )}
              <div className="ms-keynote">
                <AlertTriangle size={12} />
                Stored obfuscated in this browser only — never uploaded. Browser storage
                cannot truly encrypt; real key protection needs the Electron main process.
                {provider.keyUrl && (
                  <>
                    {' '}
                    <a href={provider.keyUrl} target="_blank" rel="noreferrer">Get a key</a>
                  </>
                )}
              </div>
            </div>
          )}

          {tab !== 'local' && (
            <div className="ms-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`ms-chip ${filter === f.id ? 'ms-chip--on' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="ms-list">
            {loading && (
              <div className="ms-state"><Loader2 size={15} className="ms-spin" /> Loading {provider.label} models…</div>
            )}

            {!loading && entry?.error && (
              <div className={`ms-state ${entry.blocked ? 'is-blocked' : 'is-error'}`}>
                <AlertTriangle size={15} />
                <span>{entry.error}</span>
              </div>
            )}

            {!loading && !entry?.error && shown.length === 0 && (
              <div className="ms-state">No models match.</div>
            )}

            {!loading && shown.map((m) => (
              <button
                key={m.id}
                className={`ms-item ${current?.id === m.id ? 'ms-item--on' : ''}`}
                onClick={() => pick(m)}
              >
                <div className="ms-item-main">
                  <span className="ms-item-name">
                    {m.name}
                    {m.recommended && <span className="ms-badge">Recommended</span>}
                  </span>
                  <span className="ms-item-meta">
                    {tab === 'local' ? (
                      <>
                        <span>{fmtSize(m.sizeBytes)}</span>
                        {m.quantization && <span>{m.quantization}</span>}
                        {m.description && <span>{m.description}</span>}
                      </>
                    ) : (
                      <>
                        <span>{fmtContext(m.contextWindow)} ctx</span>
                        <span>{fmtPrice(m.pricePer1M)}</span>
                      </>
                    )}
                  </span>
                </div>
                <span className="ms-caps">
                  {m.supportsVision && <Eye size={12} aria-label="Vision" />}
                  {m.supportsTools && <Wrench size={12} aria-label="Tools" />}
                  {m.supportsThinking && <Sparkles size={12} aria-label="Thinking" />}
                  {current?.id === m.id && <Check size={14} className="ms-tick" />}
                </span>
              </button>
            ))}
          </div>

        <div className="ms-foot">
          <span>{shown.length} of {models.length} models</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="ms-root">
      <button
        className="model-selector selector-a"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Choose model"
      >
        <Box size={18} className="selector-icon" strokeWidth={1.75} aria-hidden="true" />
        <span className="selector-label">{current ? current.name : 'Select a model'}</span>
        <ChevronDown size={16} className={`selector-chevron ${open ? 'ms-flip' : ''}`} aria-hidden="true" />
      </button>

      {/* Portalled to the body so the topbar's stacking and overflow cannot
          clip a dialog that is meant to cover the window. */}
      {open && createPortal(dialog, document.body)}
    </div>
  );
}
