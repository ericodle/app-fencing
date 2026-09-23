import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { EVENT_KINDS } from '../../lib/event-kinds'
import { eventKindLabel } from '../../lib/labels'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import { PageLoading } from '../ui/Spinner'
import { formToPayload, catalogError, type CatalogField, type CatalogTable, type CatalogRow as Row } from './catalog'

// A list of rows an admin can add to, edit and delete: prices, cancellation
// policies, payment methods, venues. The same shape each time, so it is one
// component described by its fields rather than four pages that drift.
//
// Delete is offered, and the database decides. A row still in use — a price
// tier events point at, a venue something is held at — is refused by its
// foreign key, and the message says to deactivate or archive it instead.

export function CatalogForm({
  table, noun, fields, initial, defaults = {}, onSaved, onCancel, nested = false,
}: {
  table: CatalogTable
  noun: string
  fields: readonly CatalogField[]
  initial?: Row | null
  defaults?: Record<string, unknown>
  onSaved: (row: Row) => void | Promise<void>
  onCancel: () => void
  /** Rendered inside another form (the event form's "New venue"): a form
   *  cannot hold a form, and a submit button in the inner one would submit the
   *  outer. So it becomes a plain block that saves on click. */
  nested?: boolean
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const start: Record<string, unknown> = { ...defaults }
    for (const f of fields) {
      const v = initial?.[f.key]
      if (v !== undefined && v !== null) start[f.key] = f.type === 'number' ? String(v) : v
      else if (start[f.key] === undefined) start[f.key] = f.type === 'boolean' ? false : f.type === 'kinds' ? [] : ''
    }
    return start
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(key: string, value: unknown) {
    setValues(prev => ({ ...prev, [key]: value }))
    setError(null)
  }

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault()
    const missing = fields.find(f => f.required && (values[f.key] === '' || values[f.key] === undefined))
    if (missing) { setError(`${missing.label} is required.`); return }
    setBusy(true)
    const payload = formToPayload(fields, values)
    const query = initial
      ? supabase.from(table as 'prices').update(payload as never).eq('id', initial.id).select().single()
      : supabase.from(table as 'prices').insert(payload as never).select().single()
    const { data, error } = await query
    setBusy(false)
    if (error) { setError(catalogError(error, noun)); return }
    await onSaved(data as unknown as Row)
  }

  const prefix = `${table}-${initial?.id ?? 'new'}`

  const Wrapper = nested ? 'div' : 'form'

  return (
    <Wrapper
      onSubmit={nested ? undefined : onSubmit}
      // Enter in a nested field would otherwise submit the outer form.
      onKeyDown={nested ? e => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault()
          void onSubmit()
        }
      } : undefined}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(f => {
          const id = `${prefix}-${f.key}`
          if (f.type === 'boolean') {
            return (
              <label key={f.key} className="flex items-start gap-2 self-end pb-2 text-sm text-paper">
                <input id={id} type="checkbox" className="mt-0.5 size-4" checked={!!values[f.key]}
                       onChange={e => set(f.key, e.target.checked)} />
                <span>
                  {f.label}
                  {f.help && <span className="block text-muted-dim">{f.help}</span>}
                </span>
              </label>
            )
          }
          if (f.type === 'kinds') {
            const chosen = (values[f.key] as string[]) ?? []
            return (
              <fieldset key={f.key} className="sm:col-span-2">
                <legend className="font-display text-xs uppercase tracking-widest text-silver">{f.label}</legend>
                {f.help && <p className="mt-1 text-sm text-muted-dim">{f.help}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {EVENT_KINDS.map(k => (
                    <button key={k} type="button" aria-pressed={chosen.includes(k)}
                            onClick={() => set(f.key, chosen.includes(k) ? chosen.filter(x => x !== k) : [...chosen, k])}
                            className={`min-h-9 border px-3 py-1 text-sm transition-colors ${
                              chosen.includes(k) ? 'border-gold bg-gold text-onyx' : 'border-rule text-silver hover:border-silver'
                            }`}>
                      {eventKindLabel(k)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )
          }
          return (
            <Field key={f.key} label={f.label} htmlFor={id} help={f.help}
                   className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              {f.type === 'textarea' ? (
                <textarea id={id} rows={4} className={inputClass} value={String(values[f.key] ?? '')}
                          onChange={e => set(f.key, e.target.value)} />
              ) : f.type === 'select' ? (
                <select id={id} className={inputClass} value={String(values[f.key] ?? '')}
                        onChange={e => set(f.key, e.target.value)}>
                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input id={id} className={inputClass}
                       type={f.type === 'number' ? 'number' : 'text'}
                       step={f.type === 'number' ? (f.decimal ? 'any' : 1) : undefined}
                       min={f.type === 'number' && !f.decimal ? 0 : undefined}
                       value={String(values[f.key] ?? '')}
                       onChange={e => set(f.key, e.target.value)} />
              )}
            </Field>
          )
        })}
      </div>
      {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
      <div className="flex gap-2">
        <Button type={nested ? 'button' : 'submit'} busy={busy}
                onClick={nested ? () => void onSubmit() : undefined}>
          {initial ? t.common.save : `Add ${noun}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t.common.cancel}</Button>
      </div>
    </Wrapper>
  )
}

export function CatalogManager({
  title, subtitle, table, noun, fields, orderBy, rowLabel, rowDetail, defaults, inactiveKey,
}: {
  title: string
  subtitle?: string
  table: CatalogTable
  noun: string
  fields: readonly CatalogField[]
  orderBy: string
  rowLabel: (row: Row) => ReactNode
  rowDetail?: (row: Row) => ReactNode
  defaults?: Record<string, unknown>
  /** A row is shown dimmed when this column is false (or 'archived'). */
  inactiveKey?: string
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from(table as 'prices').select('*').order(orderBy)
    setRows((data ?? []) as unknown as Row[])
    setLoading(false)
  }, [table, orderBy])

  useEffect(() => { void load() }, [load])

  async function remove(row: Row) {
    if (!window.confirm(`Delete this ${noun}? This cannot be undone.`)) return
    setError(null)
    const { error } = await supabase.from(table as 'prices').delete().eq('id', row.id)
    if (error) { setError(catalogError(error, noun)); return }
    await load()
  }

  const inactive = (row: Row) =>
    inactiveKey !== undefined && (row[inactiveKey] === false || row[inactiveKey] === 'archived')

  return (
    <Plate
      title={title}
      subtitle={subtitle}
      actions={editing === null && <Button variant="ghost" onClick={() => setEditing('new')}>Add {noun}</Button>}
    >
      {editing === 'new' && (
        <div className="mb-4 border-b border-rule-faint pb-4">
          <CatalogForm table={table} noun={noun} fields={fields} defaults={defaults}
                       onSaved={async () => { setEditing(null); await load() }}
                       onCancel={() => setEditing(null)} />
        </div>
      )}
      {error && <p role="alert" className="mb-3 text-sm text-signal-red">{error}</p>}
      {loading ? <PageLoading /> : rows.length === 0 ? (
        <p className="text-muted">Nothing here yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map(row => (
            <li key={row.id} className="border-b border-rule-faint py-2.5 last:border-b-0">
              {editing !== null && editing !== 'new' && editing.id === row.id ? (
                <CatalogForm table={table} noun={noun} fields={fields} initial={row}
                             onSaved={async () => { setEditing(null); await load() }}
                             onCancel={() => setEditing(null)} />
              ) : (
                <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${inactive(row) ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-paper">{rowLabel(row)}</div>
                    {rowDetail && <div className="text-sm text-muted">{rowDetail(row)}</div>}
                  </div>
                  <div className="flex gap-3 text-sm">
                    <button type="button" className="text-gold hover:text-gold-soft" onClick={() => setEditing(row)}>
                      {t.common.edit}
                    </button>
                    <button type="button" className="text-muted-dim hover:text-signal-red" onClick={() => void remove(row)}>
                      {t.common.delete}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Plate>
  )
}
