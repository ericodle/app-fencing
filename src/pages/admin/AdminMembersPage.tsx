import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { formatDate } from '../../lib/dates'
import { handednessLabel, weaponListLabel } from '../../lib/labels'
import { yearsSince } from '../../lib/ratings'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import { Button } from '../../components/ui/Button'
import type { Profile, MemberStatus } from '../../types/db'

// The member list, with the applications queue on top.
//
// Applications first and unfiltered: an account waiting on a decision is the
// only thing on this page that is urgent, and burying it in a list sorted by
// name is how somebody waits a fortnight to be let into a club.

const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: 'Waiting', active: 'Active', rejected: 'Declined',
  on_hold: 'On hold', closed: 'Closed',
}

export function AdminMembersPage() {
  const { profile } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const isAdmin = profile?.role === 'admin'

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    setMembers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function setStatus(id: string, status: MemberStatus) {
    setBusyId(id)
    await supabase.from('profiles').update({ status }).eq('id', id)
    await load()
    setBusyId(null)
  }

  async function setRole(id: string, role: string) {
    setBusyId(id)
    await supabase.from('profiles').update({ role }).eq('id', id)
    await load()
    setBusyId(null)
  }

  if (loading) return <PageLoading />

  const waiting = members.filter(m => m.status === 'pending' || m.status === 'on_hold')
  const active = members.filter(m => m.status === 'active')
  const gone = members.filter(m => m.status === 'rejected' || m.status === 'closed')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.members}</h1>

      {waiting.length > 0 && (
        <Plate title={t.admin.applications} edge="gold">
          <ul className="flex flex-col">
            {waiting.map(m => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-faint py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-paper">{m.name ?? m.email}</p>
                  <p className="text-sm text-muted">
                    {m.email}
                    {m.application_submitted_at && ` · applied ${formatDate(m.application_submitted_at.slice(0, 10))}`}
                  </p>
                  {m.emergency_contact_phone && (
                    <p className="text-sm text-muted-dim">
                      Emergency contact: {m.emergency_contact_name} {m.emergency_contact_phone}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button busy={busyId === m.id} onClick={() => void setStatus(m.id, 'active')}>
                      {t.admin.approve}
                    </Button>
                    <Button variant="danger" busy={busyId === m.id}
                            onClick={() => void setStatus(m.id, 'rejected')}>
                      {t.admin.reject}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Plate>
      )}

      <Plate title={`${t.roster.title} — ${active.length}`}>
        <ul className="flex flex-col">
          {active.map(m => (
            <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-faint py-2.5 last:border-b-0">
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-paper">{m.name ?? m.email}</span>
                  {m.role !== 'fencer' && (
                    <span className="border border-gold-deep px-1.5 font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">
                      {m.role}
                    </span>
                  )}
                  {m.parent_account && <span className="text-xs text-silver-deep">junior</span>}
                </p>
                <p className="text-sm text-muted">
                  {weaponListLabel(m.weapons)}
                  {m.handedness && ` · ${handednessLabel(m.handedness)}`}
                  {m.started_fencing_on && ` · ${t.roster.yearsFencing(yearsSince(m.started_fencing_on) ?? 0)}`}
                  {m.home_label && ` · ${m.home_label}`}
                  {!m.home_lat && <span className="text-signal-amber"> · no home area set</span>}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Role for ${m.name ?? m.email}`}
                    className="border border-rule bg-ink-900 px-2 py-1 text-sm text-paper"
                    value={m.role}
                    disabled={busyId === m.id}
                    onChange={e => void setRole(m.id, e.target.value)}
                  >
                    <option value="fencer">Fencer</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    className="text-sm text-muted-dim hover:text-signal-amber"
                    disabled={busyId === m.id}
                    onClick={() => void setStatus(m.id, 'on_hold')}
                  >
                    Hold
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Plate>

      {gone.length > 0 && (
        <Plate title="Closed and declined">
          <ul className="flex flex-col">
            {gone.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-3 border-b border-rule-faint py-2 text-sm last:border-b-0">
                <span className="text-muted-dim">
                  {m.name ?? m.email} · {STATUS_LABEL[m.status as MemberStatus]}
                </span>
                {/* Reinstating is why closed accounts are listed at all — a
                    member who left and came back should not need a new account
                    and lose every bout they ever fenced. */}
                {isAdmin && (
                  <Button variant="ghost" busy={busyId === m.id}
                          onClick={() => void setStatus(m.id, 'active')}>
                    {t.admin.reinstate}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Plate>
      )}
    </div>
  )
}
