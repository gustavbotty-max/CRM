import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { supabase, supabaseConfigured, supabaseUrl } from './supabase'
import { emptyLead, stages } from './types'
import type { Lead, LeadDraft, Priority, StageId } from './types'

const LOCAL_KEY = 'crm-lite-local-leads-v2'

const demoLeads: Lead[] = [
  {
    id: crypto.randomUUID(),
    company: 'Stable Hand',
    contact: 'GM / beverage buyer',
    stage: 'prospect',
    priority: 'hot',
    phone: '',
    email: '',
    website: '',
    next_action_date: '2026-07-09',
    tags: ['cafe', 'South End', 'Charlotte'],
    notes: 'Strong coffee-forward fit. Find direct contact and ask about July 9 sample window.',
  },
  {
    id: crypto.randomUUID(),
    company: 'Giddy Goat Coffee Roasters',
    contact: 'Owner / manager',
    stage: 'qualified',
    priority: 'hot',
    phone: '',
    email: '',
    website: 'https://giddygoat.com/',
    next_action_date: '2026-06-24',
    tags: ['roaster', 'Plaza Midwood'],
    notes: 'High-fit independent. Learn whether they would carry outside RTD or only house products.',
  },
  {
    id: crypto.randomUUID(),
    company: 'Coco and the Director',
    contact: 'Cafe manager',
    stage: 'contacted',
    priority: 'warm',
    phone: '+1-704-353-6003',
    email: '',
    website: '',
    next_action_date: '2026-06-25',
    tags: ['Uptown', 'coffee shop'],
    notes: 'Good Uptown route stop. Verify whether buying is local or hotel/corporate controlled.',
  },
]

function localLoad(): Lead[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : demoLeads
  } catch {
    return demoLeads
  }
}

function localSave(leads: Lead[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(leads, null, 2))
}

function normalize(text: unknown) {
  return String(text ?? '').toLowerCase()
}

function parseTags(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

function priorityLabel(priority: Priority) {
  return priority === 'hot' ? 'Hot' : priority === 'warm' ? 'Warm' : priority === 'medium' ? 'Medium' : 'Low'
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<LeadDraft | null>(null)
  const [toast, setToast] = useState('')

  const usingCloud = Boolean(supabase && session)

  useEffect(() => {
    if (!supabase) {
      setLeads(localLoad())
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase) return
    if (!session) {
      setLeads([])
      setLoading(false)
      return
    }
    fetchLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function fetchLeads() {
    if (!supabase || !session) return
    setLoading(true)
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      setToast(error.message)
      setLeads([])
    } else {
      setLeads((data ?? []) as Lead[])
    }
    setLoading(false)
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !email) return
    setSaving(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setSaving(false)
    setAuthMessage(error ? error.message : 'Check your email for a login link.')
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
  }

  const filtered = useMemo(() => {
    const q = normalize(query).trim()
    if (!q) return leads
    return leads.filter((lead) => normalize([
      lead.company,
      lead.contact,
      lead.phone,
      lead.email,
      lead.website,
      lead.notes,
      lead.priority,
      ...(lead.tags ?? []),
    ].join(' ')).includes(q))
  }, [leads, query])

  const stats = useMemo(() => ({
    total: leads.length,
    hot: leads.filter((lead) => lead.priority === 'hot').length,
    active: leads.filter((lead) => ['meeting', 'followup'].includes(lead.stage)).length,
  }), [leads])

  async function persistLead(draft: LeadDraft) {
    const cleaned: LeadDraft = {
      ...draft,
      company: draft.company.trim(),
      contact: draft.contact?.trim() || null,
      phone: draft.phone?.trim() || null,
      email: draft.email?.trim() || null,
      website: draft.website?.trim() || null,
      next_action_date: draft.next_action_date || null,
      notes: draft.notes?.trim() || null,
      tags: draft.tags ?? [],
    }
    if (!cleaned.company) return

    setSaving(true)
    if (supabase && session) {
      const payload = { ...cleaned, user_id: session.user.id, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('leads').upsert(payload).select().single()
      setSaving(false)
      if (error) {
        setToast(error.message)
        return
      }
      await fetchLeads()
    } else {
      const id = draft.id || crypto.randomUUID()
      const nextLead = { ...cleaned, id, updated_at: new Date().toISOString() } as Lead
      const next = leads.some((lead) => lead.id === id)
        ? leads.map((lead) => lead.id === id ? nextLead : lead)
        : [nextLead, ...leads]
      setLeads(next)
      localSave(next)
      setSaving(false)
    }
    setEditing(null)
    setToast('Lead saved')
  }

  async function deleteLead(id?: string) {
    if (!id) return
    if (!confirm('Delete this lead?')) return
    setSaving(true)
    if (supabase && session) {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      setSaving(false)
      if (error) {
        setToast(error.message)
        return
      }
      await fetchLeads()
    } else {
      const next = leads.filter((lead) => lead.id !== id)
      setLeads(next)
      localSave(next)
      setSaving(false)
    }
    setEditing(null)
    setToast('Lead deleted')
  }

  async function moveLead(id: string, stage: StageId) {
    const lead = leads.find((item) => item.id === id)
    if (!lead || lead.stage === stage) return
    const nextLeads = leads.map((item) => item.id === id ? { ...item, stage, updated_at: new Date().toISOString() } : item)
    setLeads(nextLeads)
    if (supabase && session) {
      const { error } = await supabase.from('leads').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) {
        setToast(error.message)
        await fetchLeads()
        return
      }
    } else {
      localSave(nextLeads)
    }
    setToast(`Moved to ${stages.find((item) => item.id === stage)?.name}`)
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(leads, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `crm-lite-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (supabaseConfigured && !session) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">CRM Lite</p>
          <h1>Sign in to your sales pipeline</h1>
          <p className="muted">Use a magic link to open your CRM from laptop or mobile. Leads are stored in Supabase and scoped to your login.</p>
          <form onSubmit={sendMagicLink} className="auth-form">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
            <button className="primary" disabled={saving}>{saving ? 'Sending…' : 'Send magic link'}</button>
          </form>
          {authMessage && <p className="notice">{authMessage}</p>}
          <p className="tiny">Project: {supabaseUrl}</p>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CRM Lite {usingCloud ? '· Cloud sync' : '· Local mode'}</p>
          <h1>Lead funnel</h1>
          <p className="muted">Move prospects through the pipeline, keep notes close, and make the next action obvious.</p>
        </div>
        <div className="top-actions">
          {!supabaseConfigured && <span className="status-pill warn">Supabase env missing</span>}
          {session?.user.email && <span className="status-pill">{session.user.email}</span>}
          <button onClick={exportJson}>Export JSON</button>
          {session && <button onClick={signOut}>Sign out</button>}
          <button className="primary" onClick={() => setEditing(emptyLead())}>+ Add lead</button>
        </div>
      </header>

      <section className="toolbar">
        <label className="search">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Company, contact, tag, note…" />
        </label>
        <div className="stat"><strong>{stats.total}</strong><span>Total leads</span></div>
        <div className="stat"><strong>{stats.hot}</strong><span>Hot priority</span></div>
        <div className="stat"><strong>{stats.active}</strong><span>Meetings / follow-up</span></div>
      </section>

      {loading ? <div className="loading">Loading pipeline…</div> : (
        <main className="board" aria-label="Lead funnel board">
          {stages.map((stage) => {
            const stageLeads = filtered.filter((lead) => lead.stage === stage.id)
            return (
              <section
                key={stage.id}
                className="column"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const id = event.dataTransfer.getData('text/plain') || draggingId
                  if (id) moveLead(id, stage.id)
                  setDraggingId(null)
                }}
              >
                <div className="column-head">
                  <div>
                    <h2>{stage.name}</h2>
                    <p>{stage.hint}</p>
                  </div>
                  <span>{stageLeads.length}</span>
                </div>
                <div className="cards">
                  {stageLeads.length === 0 && <div className="empty">Drop a lead here</div>}
                  {stageLeads.map((lead) => (
                    <article
                      className="lead-card"
                      key={lead.id}
                      draggable
                      onDragStart={(event) => {
                        setDraggingId(lead.id)
                        event.dataTransfer.setData('text/plain', lead.id)
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => setEditing({ ...lead })}
                    >
                      <div className="card-top">
                        <div>
                          <h3>{lead.company}</h3>
                          <p>{lead.contact || 'No contact yet'}</p>
                        </div>
                        <b className={`priority ${lead.priority}`}>{priorityLabel(lead.priority)}</b>
                      </div>
                      <div className="tags">{(lead.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}</div>
                      <p className="note">{lead.notes || 'Click to add notes.'}</p>
                      <footer>
                        <span>{lead.next_action_date ? `Next: ${lead.next_action_date}` : 'No next date'}</span>
                        <span>{lead.email || lead.phone || lead.website || ''}</span>
                      </footer>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </main>
      )}

      {editing && (
        <LeadModal
          draft={editing}
          saving={saving}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onDelete={() => deleteLead(editing.id)}
          onSave={persistLead}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function LeadModal({ draft, saving, onChange, onClose, onDelete, onSave }: {
  draft: LeadDraft
  saving: boolean
  onChange: (draft: LeadDraft) => void
  onClose: () => void
  onDelete: () => void
  onSave: (draft: LeadDraft) => void
}) {
  const tagsText = (draft.tags ?? []).join(', ')
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(draft) }}>
        <header>
          <div>
            <p className="eyebrow">{draft.id ? 'Edit lead' : 'New prospect'}</p>
            <h2>{draft.id ? draft.company : 'Add prospect'}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="form-grid">
          <label>Company<input value={draft.company} onChange={(event) => onChange({ ...draft, company: event.target.value })} required /></label>
          <label>Contact<input value={draft.contact ?? ''} onChange={(event) => onChange({ ...draft, contact: event.target.value })} /></label>
          <label>Stage<select value={draft.stage} onChange={(event) => onChange({ ...draft, stage: event.target.value as StageId })}>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label>
          <label>Priority<select value={draft.priority} onChange={(event) => onChange({ ...draft, priority: event.target.value as Priority })}><option value="hot">Hot</option><option value="warm">Warm</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
          <label>Phone<input value={draft.phone ?? ''} onChange={(event) => onChange({ ...draft, phone: event.target.value })} /></label>
          <label>Email<input type="email" value={draft.email ?? ''} onChange={(event) => onChange({ ...draft, email: event.target.value })} /></label>
          <label>Website<input value={draft.website ?? ''} onChange={(event) => onChange({ ...draft, website: event.target.value })} /></label>
          <label>Next action<input type="date" value={draft.next_action_date ?? ''} onChange={(event) => onChange({ ...draft, next_action_date: event.target.value })} /></label>
          <label className="wide">Tags<input value={tagsText} onChange={(event) => onChange({ ...draft, tags: parseTags(event.target.value) })} placeholder="cafe, Charlotte, decision-maker" /></label>
          <label className="wide">Notes<textarea value={draft.notes ?? ''} onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder="Buyer clues, objections, sample notes, promised follow-up…" /></label>
        </div>

        <footer className="modal-actions">
          <button type="button" className="danger" onClick={onDelete} disabled={!draft.id || saving}>Delete</button>
          <div>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save lead'}</button>
          </div>
        </footer>
      </form>
    </div>
  )
}

export default App
