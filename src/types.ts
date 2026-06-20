export type StageId = 'prospect' | 'contacted' | 'qualified' | 'meeting' | 'followup'
export type Priority = 'hot' | 'warm' | 'medium' | 'low'

export type Lead = {
  id: string
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
  created_at?: string
  updated_at?: string
}

export type LeadDraft = Omit<Lead, 'id' | 'user_id' | 'created_at' | 'updated_at'> & { id?: string }

export const stages: Array<{ id: StageId; name: string; hint: string }> = [
  { id: 'prospect', name: 'Prospects', hint: 'Raw fit — verify buyer and need.' },
  { id: 'contacted', name: 'Contacted', hint: 'Email, call, or DM sent.' },
  { id: 'qualified', name: 'Qualified', hint: 'Real fit + decision path.' },
  { id: 'meeting', name: 'Meeting / Sample', hint: 'Booked meeting or sample drop.' },
  { id: 'followup', name: 'Follow-up / Won', hint: 'Next step, quote, order, or close.' },
]

export const emptyLead = (): LeadDraft => ({
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
})
