import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { supabase, supabaseConfigured, supabaseUrl } from './supabase'
import { emptyActivity, emptyLead, stages } from './types'
import type { Activity, ActivityDraft, ActivityType, Lead, LeadDraft, MemberRole, Priority, StageId, Workspace, WorkspaceMember } from './types'

const LOCAL_KEY = 'crm-lite-local-leads-v2'
const LOCAL_WORKSPACE_KEY = 'crm-lite-local-workspace-v1'

const defaultPipelineNames = ['Counter Culture Coffee Sales', 'Clearpath', 'Triangle Money Guide']

const demoWorkspace: Workspace = {
  id: 'local-counter-culture',
  name: 'Counter Culture Coffee Sales',
  slug: 'counter-culture-coffee-sales',
}

const demoLeads: Lead[] = [
  {
    id: crypto.randomUUID(),
    workspace_id: demoWorkspace.id,
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
    source: 'manual',
  },
  {
    id: crypto.randomUUID(),
    workspace_id: demoWorkspace.id,
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
    source: 'manual',
  },
  {
    id: crypto.randomUUID(),
    workspace_id: demoWorkspace.id,
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
    source: 'manual',
  },
]

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pipeline'
}

function localLoad(): Lead[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : demoLeads
  } catch {
    return demoLeads
  }
}

function localLoadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(LOCAL_WORKSPACE_KEY)
    return raw ? JSON.parse(raw) : demoWorkspace
  } catch {
    return demoWorkspace
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

function formatActivityType(type: ActivityType) {
  return type.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [memberEmail, setMemberEmail] = useState('gustavbotty@gmail.com')
  const [memberRole, setMemberRole] = useState<MemberRole>('automation')
  const [showMembers, setShowMembers] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<LeadDraft | null>(null)
  const [newActivity, setNewActivity] = useState<ActivityDraft>(emptyActivity())
  const [toast, setToast] = useState('')

  const usingCloud = Boolean(supabase && session)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null

  useEffect(() => {
    if (!supabase) {
      const workspace = localLoadWorkspace()
      setWorkspaces([workspace])
      setActiveWorkspaceId(workspace.id)
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
      setWorkspaces([])
      setMembers([])
      setLeads([])
      setActivities([])
      setLoading(false)
      return
    }
    fetchWorkspaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  useEffect(() => {
    if (!activeWorkspaceId) return
    if (supabase && session) {
      fetchLeads(activeWorkspaceId)
      fetchActivities(activeWorkspaceId)
      fetchMembers(activeWorkspaceId)
    } else {
      setLeads(localLoad().filter((lead) => (lead.workspace_id ?? demoWorkspace.id) === activeWorkspaceId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function fetchWorkspaces() {
    if (!supabase || !session) return
    setLoading(true)
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      setToast(error.message)
      setLoading(false)
      return
    }

    let nextWorkspaces = (data ?? []) as Workspace[]
    if (nextWorkspaces.length === 0) {
      nextWorkspaces = await createDefaultWorkspaces()
    }
    setWorkspaces(nextWorkspaces)
    setActiveWorkspaceId((current) => current || nextWorkspaces[0]?.id || '')
    setLoading(false)
  }

  async function createDefaultWorkspaces() {
    if (!supabase || !session?.user.email) return []
    const created: Workspace[] = []
    for (const name of defaultPipelineNames) {
      const { data, error } = await supabase
        .from('workspaces')
        .insert({ name, slug: slugify(name), created_by: session.user.id })
        .select()
        .single()
      if (error || !data) continue
      await supabase.from('workspace_members').insert({
        workspace_id: data.id,
        user_id: session.user.id,
        email: session.user.email,
        role: 'owner',
      })
      created.push(data as Workspace)
    }
    return created
  }

  async function fetchLeads(workspaceId = activeWorkspaceId) {
    if (!supabase || !session || !workspaceId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })

    if (error) {
      setToast(error.message)
      setLeads([])
    } else {
      setLeads((data ?? []) as Lead[])
    }
    setLoading(false)
  }

  async function fetchActivities(workspaceId = activeWorkspaceId) {
    if (!supabase || !session || !workspaceId) return
    const { data, error } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error) setActivities((data ?? []) as Activity[])
  }

  async function fetchMembers(workspaceId = activeWorkspaceId) {
    if (!supabase || !session || !workspaceId) return
    const { data, error } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })

    if (error) {
      setToast(error.message)
      setMembers([])
    } else {
      setMembers((data ?? []) as WorkspaceMember[])
    }
  }

  async function sendMemberLoginLink(targetEmail: string) {
    if (!supabase || !targetEmail.trim()) return false
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    })
    if (error) {
      setToast(`Member added, but login email failed: ${error.message}`)
      return false
    }
    return true
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !session || !activeWorkspaceId || !memberEmail.trim()) return
    const targetEmail = memberEmail.trim().toLowerCase()
    setSaving(true)
    const { error } = await supabase.from('workspace_members').insert({
      workspace_id: activeWorkspaceId,
      user_id: null,
      email: targetEmail,
      role: memberRole,
    })
    if (error) {
      setSaving(false)
      setToast(error.message)
      return
    }
    const sent = await sendMemberLoginLink(targetEmail)
    setSaving(false)
    setToast(sent ? 'Member added and login email sent' : 'Member added')
    setMemberEmail('')
    setMemberRole('member')
    await fetchMembers(activeWorkspaceId)
  }

  async function removeMember(memberId: string) {
    if (!supabase || !session || !confirm('Remove this member from the pipeline?')) return
    setSaving(true)
    const { error } = await supabase.from('workspace_members').delete().eq('id', memberId)
    setSaving(false)
    if (error) {
      setToast(error.message)
      return
    }
    setToast('Member removed')
    await fetchMembers(activeWorkspaceId)
  }

  async function updateMemberRole(memberId: string, role: MemberRole) {
    if (!supabase || !session) return
    setSaving(true)
    const { error } = await supabase.from('workspace_members').update({ role }).eq('id', memberId)
    setSaving(false)
    if (error) {
      setToast(error.message)
      return
    }
    await fetchMembers(activeWorkspaceId)
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !email) return
    setSaving(true)
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })
    setSaving(false)
    setAuthMessage(error ? error.message : 'Check your email for a login link.')
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault()
    const name = workspaceName.trim()
    if (!name) return
    setSaving(true)
    if (supabase && session?.user.email) {
      const { data, error } = await supabase
        .from('workspaces')
        .insert({ name, slug: slugify(name), created_by: session.user.id })
        .select()
        .single()
      if (error || !data) {
        setToast(error?.message ?? 'Could not create pipeline')
        setSaving(false)
        return
      }
      await supabase.from('workspace_members').insert({
        workspace_id: data.id,
        user_id: session.user.id,
        email: session.user.email,
        role: 'owner',
      })
      setWorkspaces((current) => [...current, data as Workspace])
      setActiveWorkspaceId(data.id)
    } else {
      const workspace = { id: crypto.randomUUID(), name, slug: slugify(name) }
      localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(workspace))
      setWorkspaces([workspace])
      setActiveWorkspaceId(workspace.id)
    }
    setWorkspaceName('')
    setSaving(false)
    setToast('Pipeline created')
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
      lead.source,
      ...(lead.tags ?? []),
    ].join(' ')).includes(q))
  }, [leads, query])

  const stats = useMemo(() => ({
    total: leads.length,
    hot: leads.filter((lead) => lead.priority === 'hot').length,
    active: leads.filter((lead) => ['meeting', 'followup'].includes(lead.stage)).length,
    notes: activities.length,
  }), [leads, activities])

  async function persistLead(draft: LeadDraft) {
    const workspaceId = draft.workspace_id || activeWorkspaceId
    const cleaned: LeadDraft = {
      ...draft,
      workspace_id: workspaceId,
      company: draft.company.trim(),
      contact: draft.contact?.trim() || null,
      phone: draft.phone?.trim() || null,
      email: draft.email?.trim() || null,
      website: draft.website?.trim() || null,
      next_action_date: draft.next_action_date || null,
      notes: draft.notes?.trim() || null,
      source: draft.source?.trim() || 'manual',
      tags: draft.tags ?? [],
    }
    if (!cleaned.company || !workspaceId) return

    setSaving(true)
    if (supabase && session) {
      const payload = { ...cleaned, user_id: session.user.id, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('leads').upsert(payload).select().single()
      setSaving(false)
      if (error) {
        setToast(error.message)
        return
      }
      await fetchLeads(workspaceId)
    } else {
      const id = draft.id || crypto.randomUUID()
      const nextLead = { ...cleaned, id, updated_at: new Date().toISOString() } as Lead
      const all = localLoad()
      const nextAll = all.some((lead) => lead.id === id)
        ? all.map((lead) => lead.id === id ? nextLead : lead)
        : [nextLead, ...all]
      localSave(nextAll)
      setLeads(nextAll.filter((lead) => lead.workspace_id === workspaceId))
      setSaving(false)
    }
    setEditing(null)
    setNewActivity(emptyActivity())
    setToast('Lead saved')
  }

  async function deleteLead(id?: string) {
    if (!id) return
    if (!confirm('Delete this lead and its activities?')) return
    setSaving(true)
    if (supabase && session) {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      setSaving(false)
      if (error) {
        setToast(error.message)
        return
      }
      await fetchLeads()
      await fetchActivities()
    } else {
      const next = localLoad().filter((lead) => lead.id !== id)
      localSave(next)
      setLeads(next.filter((lead) => lead.workspace_id === activeWorkspaceId))
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
      await addActivity({
        leadId: id,
        workspaceId: lead.workspace_id || activeWorkspaceId,
        activity: {
          activity_type: 'note',
          body: `Moved to ${stages.find((item) => item.id === stage)?.name}.`,
          next_action: '',
          next_action_date: '',
          source: 'pipeline',
        },
        silent: true,
      })
    } else {
      localSave(nextLeads)
    }
    setToast(`Moved to ${stages.find((item) => item.id === stage)?.name}`)
  }

  async function addActivity({ leadId, workspaceId, activity, silent = false }: { leadId: string | null; workspaceId: string; activity: ActivityDraft; silent?: boolean }) {
    if (!supabase || !session || !workspaceId || !activity.body.trim()) return
    const { error } = await supabase.from('lead_activities').insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      user_id: session.user.id,
      activity_type: activity.activity_type,
      body: activity.body.trim(),
      next_action: activity.next_action.trim() || null,
      next_action_date: activity.next_action_date || null,
      source: activity.source.trim() || 'manual',
    })
    if (error) {
      setToast(error.message)
      return
    }
    await fetchActivities(workspaceId)
    if (!silent) setToast('Activity logged')
  }

  async function saveActivityFromModal() {
    if (!editing?.id || !editing.workspace_id) return
    await addActivity({ leadId: editing.id, workspaceId: editing.workspace_id, activity: newActivity })
    setNewActivity(emptyActivity())
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ workspace: activeWorkspace, leads, activities }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `crm-lite-${activeWorkspace?.slug ?? 'pipeline'}-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const activeLeadActivities = editing?.id ? activities.filter((activity) => activity.lead_id === editing.id) : []

  if (supabaseConfigured && !session) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">CRM Lite</p>
          <h1>Sign in to your sales pipeline</h1>
          <p className="muted">Use a magic link to open your CRM from laptop or mobile. Leads are stored in Supabase and scoped to pipelines you can access.</p>
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
          <p className="muted">Switch pipelines for different businesses, move leads through the funnel, and keep meeting/voice-note activity tied to each account.</p>
        </div>
        <div className="top-actions">
          {!supabaseConfigured && <span className="status-pill warn">Supabase env missing</span>}
          {session?.user.email && <span className="status-pill">{session.user.email}</span>}
          <button onClick={exportJson}>Export JSON</button>
          {session && <button onClick={signOut}>Sign out</button>}
          <button className="primary" onClick={() => setEditing(emptyLead(activeWorkspaceId))} disabled={!activeWorkspaceId}>+ Add lead</button>
        </div>
      </header>

      <section className="pipeline-bar">
        <label>
          <span>Pipeline</span>
          <select value={activeWorkspaceId} onChange={(event) => setActiveWorkspaceId(event.target.value)}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <form onSubmit={createWorkspace} className="new-pipeline">
          <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="New pipeline name" />
          <button disabled={saving}>Create pipeline</button>
        </form>
        {usingCloud && <button className="manage-members-button" onClick={() => setShowMembers((value) => !value)}>{showMembers ? 'Hide members' : 'Manage members'}</button>}
      </section>

      {showMembers && activeWorkspace && (
        <section className="members-panel">
          <div className="members-head">
            <div>
              <p className="eyebrow">Pipeline access</p>
              <h2>{activeWorkspace.name}</h2>
              <p>Invite Gustav or another teammate by email. Their records stay tied to this pipeline, not a separate CRM.</p>
            </div>
          </div>
          <form className="member-invite" onSubmit={inviteMember}>
            <input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="gustavbotty@gmail.com" required />
            <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as MemberRole)}>
              <option value="automation">Automation</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <button className="primary" disabled={saving}>Add member</button>
          </form>
          <div className="members-list">
            {members.length === 0 && <div className="empty">No members found yet.</div>}
            {members.map((member) => (
              <article className="member-row" key={member.id}>
                <div>
                  <strong>{member.email}</strong>
                  <span>{member.user_id ? 'Linked login' : 'Email invite / pending login'}</span>
                </div>
                <select value={member.role} onChange={(event) => updateMemberRole(member.id, event.target.value as MemberRole)} disabled={saving || member.user_id === session?.user.id}>
                  <option value="automation">Automation</option>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button type="button" onClick={() => sendMemberLoginLink(member.email).then((sent) => sent && setToast('Login email sent'))} disabled={saving}>Send login email</button>
                <button className="danger" onClick={() => removeMember(member.id)} disabled={saving || member.user_id === session?.user.id}>Remove</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="toolbar">
        <label className="search">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Company, contact, tag, note…" />
        </label>
        <div className="stat"><strong>{stats.total}</strong><span>Total leads</span></div>
        <div className="stat"><strong>{stats.hot}</strong><span>Hot priority</span></div>
        <div className="stat"><strong>{stats.active}</strong><span>Meetings / follow-up</span></div>
        <div className="stat"><strong>{stats.notes}</strong><span>Logged activities</span></div>
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
                      onClick={() => { setEditing({ ...lead }); setNewActivity(emptyActivity()) }}
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
                        <span>{activities.filter((activity) => activity.lead_id === lead.id).length} activities</span>
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
          activities={activeLeadActivities}
          activity={newActivity}
          onActivityChange={setNewActivity}
          onActivitySave={saveActivityFromModal}
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

function LeadModal({ draft, saving, activities, activity, onActivityChange, onActivitySave, onChange, onClose, onDelete, onSave }: {
  draft: LeadDraft
  saving: boolean
  activities: Activity[]
  activity: ActivityDraft
  onActivityChange: (draft: ActivityDraft) => void
  onActivitySave: () => void
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
          <label>Source<input value={draft.source ?? ''} onChange={(event) => onChange({ ...draft, source: event.target.value })} placeholder="manual, voice note, meeting transcript" /></label>
          <label className="wide">Tags<input value={tagsText} onChange={(event) => onChange({ ...draft, tags: parseTags(event.target.value) })} placeholder="cafe, Charlotte, decision-maker" /></label>
          <label className="wide">Notes<textarea value={draft.notes ?? ''} onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder="Buyer clues, objections, sample notes, promised follow-up…" /></label>
        </div>

        {draft.id && (
          <section className="activity-panel">
            <div className="activity-head">
              <div>
                <p className="eyebrow">Activity log</p>
                <h3>Meeting notes, voice notes, transcripts</h3>
              </div>
            </div>
            <div className="activity-compose">
              <select value={activity.activity_type} onChange={(event) => onActivityChange({ ...activity, activity_type: event.target.value as ActivityType })}>
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="voice_note">Voice note</option>
                <option value="transcript">Transcript</option>
                <option value="email">Email</option>
                <option value="task">Task</option>
              </select>
              <input value={activity.source} onChange={(event) => onActivityChange({ ...activity, source: event.target.value })} placeholder="source" />
              <input type="date" value={activity.next_action_date} onChange={(event) => onActivityChange({ ...activity, next_action_date: event.target.value })} />
              <input className="wide" value={activity.next_action} onChange={(event) => onActivityChange({ ...activity, next_action: event.target.value })} placeholder="Next action" />
              <textarea className="wide" value={activity.body} onChange={(event) => onActivityChange({ ...activity, body: event.target.value })} placeholder="Paste meeting transcript summary, voice note outcome, follow-up detail…" />
              <button type="button" className="primary" onClick={onActivitySave} disabled={saving || !activity.body.trim()}>Log activity</button>
            </div>
            <div className="activity-list">
              {activities.length === 0 && <div className="empty">No activity yet.</div>}
              {activities.map((item) => (
                <article className="activity-item" key={item.id}>
                  <header>
                    <b>{formatActivityType(item.activity_type)}</b>
                    <span>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</span>
                  </header>
                  <p>{item.body}</p>
                  {(item.next_action || item.next_action_date) && <footer>Next: {item.next_action || 'Follow up'} {item.next_action_date ? `· ${item.next_action_date}` : ''}</footer>}
                </article>
              ))}
            </div>
          </section>
        )}

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
