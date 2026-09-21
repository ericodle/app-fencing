import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { formatInstant } from '../../lib/dates'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import type { AuditEntry } from '../../types/db'

// Every privileged write, appended.
//
// Append-only in the strong sense: a trigger on the table rejects UPDATE and
// DELETE, so an admin who can do everything else still cannot edit the record
// of what they did. That property is what makes the page worth reading.

export function AdminAuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void supabase.from('admin_audit_log').select('*')
      .order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        if (cancelled) return
        setRows(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return <PageLoading />

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.audit}</h1>
      <Plate subtitle="Append-only: a trigger rejects any update or delete, including from an admin.">
        <ul className="flex flex-col">
          {rows.map(row => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-faint py-1.5 text-sm last:border-b-0">
              <span className="flex items-baseline gap-2">
                <span className={
                  row.action === 'delete' ? 'text-signal-red'
                  : row.action === 'insert' ? 'text-signal-green' : 'text-signal-amber'
                }>
                  {row.action}
                </span>
                <span className="text-paper">{row.table_name}</span>
                {row.summary && <span className="text-muted">{row.summary}</span>}
              </span>
              <span className="figures text-muted-dim">
                {row.actor_email ?? 'the server'} · {formatInstant(row.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </Plate>
    </div>
  )
}
