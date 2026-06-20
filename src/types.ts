export type StageId = 'prospect' | 'contacted' | 'qualified' | 'meeting' | 'followup'
export type Priority = 'hot' | 'warm' | 'medium' | 'low'
export type MemberRole = 'owner' | 'admin' | 'member' | 'automation'
export type ActivityType = 'note' | 'call' | 'meeting' | 'voice_note' | 'transcript' | 'email' | 'task'

export type Workspace = {
  id: string
  name: string
  slug: string
  created_by?: string
  created_at?: string
  updated_at?: string
}

export type WorkspaceMember = {
  id: string
  workspace_id: string
  user_id: string | null
  email: string
  role: MemberRole
  created_at?: string
}

export type Lead = {
  id: string
  workspace_id?: string | null
  user_id?: string
  company: string
  contact: string | null
  stage: StageId
  priority: Priority
  phone: string | null
  email: string | null
  website: string | null
  next_action_date: string | null
  tags: string[]
  notes: string | null
  source?: string | null
  created_at?: string
  updated_at?: string
}

export type LeadDraft = Omit<Lead, 'id' | 'user_id' | 'created_at' | 'updated_at'> & { id?: string }

export type Activity = {
  id: string
  workspace_id: string
  lead_id: string | null
  user_id?: string | null
  activity_type: ActivityType
  body: string
  next_action: string | null
  next_action_date: string | null
  source: string | null
  created_at?: string
}

export type ActivityDraft = {
  activity_type: ActivityType
  body: string
  next_action: string
  next_action_date: string
  source: string
}

export const stages: Array<{ id: StageId; name: string; hint: string }> = [
  { id: 'prospect', name: 'Prospects', hint: 'Raw fit — verify buyer and need.' },
  { id: 'contacted', name: 'Contacted', hint: 'Email, call, or DM sent.' },
  { id: 'qualified', name: 'Qualified', hint: 'Real fit + decision path.' },
  { id: 'meeting', name: 'Meeting / Sample', hint: 'Booked meeting or sample drop.' },
  { id: 'followup', name: 'Follow-up / Won', hint: 'Next step, quote, order, or close.' },
]

export const emptyLead = (workspaceId?: string | null): LeadDraft => ({
  workspace_id: workspaceId ?? null,
  company: '',
  contact: '',
  stage: 'prospect',
  priority: 'warm',
  phone: '',
  email: '',
  website: '',
  next_action_date: '',
  tags: [],
  notes: '',
  source: 'manual',
})

export const emptyActivity = (): ActivityDraft => ({
  activity_type: 'note',
  body: '',
  next_action: '',
  next_action_date: '',
  source: 'manual',
})
