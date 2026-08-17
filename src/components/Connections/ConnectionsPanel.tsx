import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plug, RefreshCw, Trash2, Unplug } from 'lucide-react';
import {
  addCustomConnection, connectApp, connectFromCatalog, disconnectApp,
  fetchConnections, refreshApp, removeApp,
  type CatalogEntry, type Connection,
} from '../../api';
import './ConnectionsPanel.css';

/**
 * Connected apps.
 *
 * Nothing here knows what GitHub or Notion can do. A card's action list is
 * whatever that app reported when it was asked — which is what makes this
 * panel correct for connectors that did not exist when it was written.
 */

const STATE_LABEL: Record<Connection['state'], string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Not connected',
  error: 'Failed',
};

/** The setup form for one catalogue entry, or the custom-server form. */
interface Draft {
  entry: CatalogEntry | null;
  inputs: Record<string, string>;
  secrets: Record<string, string>;
  /* custom only */
  id: string;
  label: string;
  command: string;
  url: string;
}

const emptyDraft = (entry: CatalogEntry | null): Draft => ({
  entry,
  inputs: {},
  secrets: {},
  id: '',
  label: '',
  command: '',
  url: '',
});

export const ConnectionsPanel: React.FC = () => {
  const [conns, setConns] = useState<Connection[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [offline, setOffline] = useState(false);

  const reload = useCallback(async () => {
    const { connections, catalog: cat, reachable } = await fetchConnections();
    setConns(connections);
    setCatalog(cat);
    setOffline(!reachable);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* Every mutation reloads rather than patching one card: connecting an app
     changes the tool list globally, and a stale sibling card is exactly the
     kind of thing nobody notices until it misleads. */
  const act = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(id);
    setError(null);
    const res = await fn();
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
    await reload();
    setBusy(null);
  };

  const submitDraft = async () => {
    if (!draft) return;
    setBusy('__new');
    setError(null);

    const res = draft.entry
      ? await connectFromCatalog(draft.entry.id, {
          inputs: draft.inputs,
          secrets: draft.secrets,
        })
      : await addCustomConnection({
          id: draft.id.trim(),
          label: draft.label.trim() || draft.id.trim(),
          transport: draft.url.trim() ? 'http' : 'stdio',
          ...(draft.url.trim()
            ? { url: draft.url.trim() }
            : {
                /* Split on whitespace so the user can paste the command line
                   they already have from another MCP client's config. */
                command: draft.command.trim().split(/\s+/)[0] ?? '',
                args: draft.command.trim().split(/\s+/).slice(1),
              }),
        });

    if (!res.ok) setError(res.error);
    else setDraft(null);
    await reload();
    setBusy(null);
  };

  const connectedIds = new Set(conns.map((c) => c.catalogId ?? c.id));

  if (loading) {
    return <p className="conn-help">Loading connections…</p>;
  }

  /* Nothing below can be true while the backend is unreachable — the lists are
     empty because they could not be read, not because they are empty. Saying
     so beats rendering a panel that quietly implies there is nothing to add. */
  if (offline) {
    return (
      <div className="conn-empty">
        Can't reach the Sakhi backend, so your connections can't be loaded.
        <br />
        Start it with <code>npm run dev:server</code>, then reopen this panel.
      </div>
    );
  }

  return (
    <div className="conn-panel">
      {error && <div className="conn-error">{error}</div>}

      {/* ── Connected apps ─────────────────────────────────────── */}
      <section>
        <h4 className="conn-group-title">Your apps</h4>

        {conns.length === 0 ? (
          <div className="conn-empty">
            No apps connected yet.
            <br />
            Connect one below and Sakhi will ask it what it can do — then you can
            just say what you want done.
          </div>
        ) : (
          <div className="conn-list">
            {conns.map((c) => {
              const isBusy = busy === c.id;
              const open = expanded[c.id];
              return (
                <div key={c.id} className="conn-card">
                  <div className="conn-card-head">
                    <span className={`conn-dot ${c.state}`} aria-hidden="true" />
                    <div className="conn-identity">
                      <span className="conn-name">{c.label}</span>
                      <span className="conn-meta">
                        {STATE_LABEL[c.state]}
                        {c.state === 'connected' && (
                          <>
                            {' · '}
                            {c.tools.length} action{c.tools.length === 1 ? '' : 's'}
                            {c.resourceCount > 0 && ` · ${c.resourceCount} resources`}
                            {c.serverName && ` · ${c.serverName}`}
                          </>
                        )}
                      </span>
                    </div>

                    <div className="conn-actions">
                      {c.state === 'connected' ? (
                        <>
                          <button
                            className="conn-btn"
                            disabled={isBusy}
                            onClick={() => act(c.id, () => refreshApp(c.id))}
                            title="Ask the app again what it can do"
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            className="conn-btn"
                            disabled={isBusy}
                            onClick={() => act(c.id, () => disconnectApp(c.id))}
                          >
                            <Unplug size={13} /> Disconnect
                          </button>
                        </>
                      ) : (
                        <button
                          className="conn-btn primary"
                          disabled={isBusy}
                          onClick={() => act(c.id, () => connectApp(c.id))}
                        >
                          <Plug size={13} /> {isBusy ? 'Connecting…' : 'Connect'}
                        </button>
                      )}
                      <button
                        className="conn-btn danger"
                        disabled={isBusy}
                        onClick={() => act(c.id, () => removeApp(c.id))}
                        title="Remove this connection and delete its stored credentials"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {c.error && <div className="conn-error">{c.error}</div>}

                  {c.state === 'connected' && c.tools.length > 0 && (
                    <>
                      <button
                        className="conn-tools-toggle"
                        onClick={() => setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))}
                        aria-expanded={open}
                      >
                        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        What Sakhi can do with {c.label}
                      </button>

                      {open && (
                        <div className="conn-tools">
                          {c.tools.map((t) => (
                            <div key={t.qualifiedName} className="conn-tool">
                              <code>{t.name}</code>
                              {!t.readOnly && <span className="conn-tag ask">asks first</span>}
                              <span>{t.description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Setup form ─────────────────────────────────────────── */}
      {draft && (
        <section>
          <h4 className="conn-group-title">
            {draft.entry ? `Connect ${draft.entry.label}` : 'Connect any MCP server'}
          </h4>

          <div className="conn-form">
            {draft.entry?.setupNote && <p className="conn-note">{draft.entry.setupNote}</p>}

            {draft.entry ? (
              <>
                {(draft.entry.inputs ?? []).map((f) => (
                  <div className="conn-field" key={f.name}>
                    <label htmlFor={`in-${f.name}`}>{f.label}</label>
                    <input
                      id={`in-${f.name}`}
                      value={draft.inputs[f.name] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) =>
                        setDraft({ ...draft, inputs: { ...draft.inputs, [f.name]: e.target.value } })
                      }
                    />
                    {f.help && <p className="conn-help">{f.help}</p>}
                  </div>
                ))}

                {(draft.entry.secrets ?? []).map((s) => (
                  <div className="conn-field" key={s.name}>
                    <label htmlFor={`sec-${s.name}`}>{s.label}</label>
                    <input
                      id={`sec-${s.name}`}
                      type="password"
                      autoComplete="off"
                      value={draft.secrets[s.name] ?? ''}
                      onChange={(e) =>
                        setDraft({ ...draft, secrets: { ...draft.secrets, [s.name]: e.target.value } })
                      }
                    />
                    {s.help && <p className="conn-help">{s.help}</p>}
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="conn-field">
                  <label htmlFor="c-id">Short name</label>
                  <input
                    id="c-id"
                    value={draft.id}
                    placeholder="linear"
                    onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  />
                  <p className="conn-help">
                    Used to prefix this app's actions, e.g. <code>linear__create_issue</code>.
                  </p>
                </div>
                <div className="conn-field">
                  <label htmlFor="c-label">Display name</label>
                  <input
                    id="c-label"
                    value={draft.label}
                    placeholder="Linear"
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  />
                </div>
                <div className="conn-field">
                  <label htmlFor="c-cmd">Command to run</label>
                  <input
                    id="c-cmd"
                    value={draft.command}
                    placeholder="npx -y some-mcp-server"
                    onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                  />
                  <p className="conn-help">
                    Paste the command from the connector's setup instructions.
                  </p>
                </div>
                <div className="conn-field">
                  <label htmlFor="c-url">…or a remote server URL</label>
                  <input
                    id="c-url"
                    value={draft.url}
                    placeholder="https://mcp.example.com/mcp"
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  />
                  <p className="conn-help">Fill in one or the other. A URL takes precedence.</p>
                </div>
              </>
            )}

            <div className="conn-form-actions">
              <button className="conn-btn" onClick={() => setDraft(null)} disabled={busy === '__new'}>
                Cancel
              </button>
              <button
                className="conn-btn primary"
                onClick={submitDraft}
                disabled={busy === '__new' || (!draft.entry && !draft.id.trim())}
              >
                {busy === '__new' ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Catalogue ──────────────────────────────────────────── */}
      {!draft && (
        <section>
          <h4 className="conn-group-title">Add an app</h4>
          <div className="conn-catalog">
            {catalog.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="conn-tile"
                disabled={connectedIds.has(entry.id)}
                onClick={() => setDraft(emptyDraft(entry))}
              >
                <span className="conn-tile-name">
                  {entry.label}
                  {connectedIds.has(entry.id) && ' ✓'}
                </span>
                <span className="conn-tile-blurb">{entry.blurb}</span>
              </button>
            ))}

            <button type="button" className="conn-tile" onClick={() => setDraft(emptyDraft(null))}>
              <span className="conn-tile-name">Something else…</span>
              <span className="conn-tile-blurb">
                Connect any MCP server by command or URL.
              </span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
