import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { EVENT_KINDS } from '../../lib/event-kinds'
import { eventKindLabel } from '../../lib/labels'
import { formatInstant } from '../../lib/dates'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import { Button } from '../../components/ui/Button'
import { Field, inputClass } from '../../components/ui/Field'
import type { Terms, Waiver } from '../../types/db'

// The waivers members sign before they register, and the club's terms of use.
//
// A published text is never edited: changing the words publishes version N+1,
// and every signature of an older version then reads "updated — sign again".
// The database refuses an edit to a published row, so this page does not
// offer one; "New version" starts from the current words.

export function AdminWaiversPage() {
  const { profile } = useAuth()
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [terms, setTerms] = useState<Terms | null>(null)
  const [editing, setEditing] = useState<Waiver | 'new' | null>(null)
  const [editingTerms, setEditingTerms] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [w, s, tm] = await Promise.all([
      supabase.from('waivers').select('*').order('code').order('version', { ascending: false }),
      supabase.from('waiver_signatures').select('waiver_id'),
      supabase.from('terms').select('*').not('published_at', 'is', null)
        .order('version', { ascending: false }).limit(1).maybeSingle(),
    ])
    // The newest version of each code, published or not.
    const latest = new Map<string, Waiver>()
    for (const row of w.data ?? []) if (!latest.has(row.code)) latest.set(row.code, row)
    const n = new Map<string, number>()
    for (const row of s.data ?? []) n.set(row.waiver_id, (n.get(row.waiver_id) ?? 0) + 1)
    setWaivers([...latest.values()])
    setCounts(n)
    setTerms(tm.data ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading || !profile) return <PageLoading />

  async function setActive(code: string, active: boolean) {
    setError(null)
    // Every version of the code, so retiring the newest does not quietly
    // bring the one before it back.
    const { error } = await supabase.from('waivers').update({ active }).eq('code', code)
    if (error) setError(error.message)
    await load()
  }

  async function publish(id: string) {
    setError(null)
    const { error } = await supabase.from('waivers').update({ published_at: new Date().toISOString() }).eq('id', id)
    if (error) setError(error.message)
    await load()
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.waivers}</h1>

      <Plate
        title={t.admin.waivers}
        subtitle="Members sign the ones that apply to an event before they can register for it."
        actions={editing === null && <Button variant="ghost" onClick={() => setEditing('new')}>New waiver</Button>}
      >
        {editing === 'new' && (
          <WaiverForm authorId={profile.id} onDone={async () => { setEditing(null); await load() }} />
        )}
        {error && <p role="alert" className="mb-3 text-sm text-signal-red">{error}</p>}
        <ul className="flex flex-col">
          {waivers.map(w => (
            <li key={w.id} className="border-b border-rule-faint py-3 last:border-b-0">
              {editing !== null && editing !== 'new' && editing.code === w.code ? (
                <WaiverForm from={w} authorId={profile.id} onDone={async () => { setEditing(null); await load() }} />
              ) : (
                <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${w.active ? '' : 'opacity-50'}`}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <span className="text-paper">{w.title}</span>
                      <span className="font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">
                        v{w.version} · {w.cadence === 'annual' ? 'yearly' : 'every event'}
                        {w.requires_guardian && ' · under 18, guardian signs'}
                      </span>
                      {!w.published_at && (
                        <span className="font-display text-[0.55rem] uppercase tracking-widest text-signal-amber">draft</span>
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {w.applies_to.map(eventKindLabel).join(', ') || 'No event kinds — nobody is asked to sign it'}
                      {' · '}{counts.get(w.id) ?? 0} signed this version
                    </p>
                  </div>
                  <div className="flex gap-3 text-sm">
                    {!w.published_at && (
                      <button type="button" className="text-gold hover:text-gold-soft" onClick={() => void publish(w.id)}>
                        Publish
                      </button>
                    )}
                    <button type="button" className="text-gold hover:text-gold-soft" onClick={() => setEditing(w)}>
                      {w.published_at ? 'New version' : t.common.edit}
                    </button>
                    <button type="button" className="text-muted-dim hover:text-signal-amber"
                            onClick={() => void setActive(w.code, !w.active)}>
                      {w.active ? 'Retire' : 'Bring back'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Plate>

      <Plate
        title={t.terms.title}
        subtitle={terms ? `Version ${terms.version}, published ${formatInstant(terms.published_at)}. Members are asked to accept each new version.` : 'None published yet.'}
        actions={!editingTerms && <Button variant="ghost" onClick={() => setEditingTerms(true)}>
          {terms ? 'Publish a new version' : 'Publish terms'}
        </Button>}
      >
        {editingTerms ? (
          <TermsForm current={terms} authorId={profile.id}
                     onDone={async () => { setEditingTerms(false); await load() }} />
        ) : terms && (
          <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm text-muted">{terms.body}</p>
        )}
      </Plate>
    </div>
  )
}

function WaiverForm({ from, authorId, onDone }: {
  from?: Waiver
  authorId: string
  onDone: () => Promise<void>
}) {
  const draft = from && !from.published_at
  const [code, setCode] = useState(from?.code ?? '')
  const [title, setTitle] = useState(from?.title ?? '')
  const [body, setBody] = useState(from?.body ?? '')
  const [cadence, setCadence] = useState(from?.cadence ?? 'annual')
  const [appliesTo, setAppliesTo] = useState<string[]>(from?.applies_to ?? [...EVENT_KINDS])
  const [guardian, setGuardian] = useState(from?.requires_guardian ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(publishNow: boolean) {
    setError(null)
    if (!/^[a-z0-9_]{1,50}$/.test(code)) { setError('The code is lowercase letters, digits and underscores.'); return }
    if (!title.trim() || !body.trim()) { setError('A waiver needs a title and its text.'); return }
    setBusy(true)
    const fields = {
      code, title: title.trim(), body: body.trim(), cadence, applies_to: appliesTo,
      requires_guardian: guardian, published_at: publishNow ? new Date().toISOString() : null,
    }
    let result
    if (draft) {
      result = await supabase.from('waivers').update(fields).eq('id', from.id)
    } else {
      const { data: versions } = await supabase.from('waivers').select('version').eq('code', code)
      const version = Math.max(0, ...(versions ?? []).map(v => v.version)) + 1
      result = await supabase.from('waivers').insert({ ...fields, version, created_by: authorId })
    }
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    await onDone()
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); void save(true) }

  return (
    <form onSubmit={onSubmit} className="mb-4 flex flex-col gap-4 border-b border-rule-faint pb-4">
      {from?.published_at && (
        <p className="text-sm text-signal-amber">
          Saving publishes version {from.version + 1}. Everyone who signed version {from.version} will be asked to sign again.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="wtitle">
          <input id="wtitle" className={inputClass} value={title} onChange={e => setTitle(e.target.value)} />
        </Field>
        <Field label="Code" htmlFor="wcode" help="A short name that stays the same across versions, e.g. liability.">
          <input id="wcode" className={inputClass} value={code} disabled={!!from}
                 onChange={e => setCode(e.target.value.toLowerCase())} />
        </Field>
        <Field label="Signed" htmlFor="wcadence">
          <select id="wcadence" className={inputClass} value={cadence} onChange={e => setCadence(e.target.value)}>
            <option value="annual">Once a year</option>
            <option value="per_event">For every event</option>
          </select>
        </Field>
        <label className="flex items-start gap-2 self-end pb-2 text-sm text-paper">
          <input type="checkbox" className="mt-0.5 size-4" checked={guardian} onChange={e => setGuardian(e.target.checked)} />
          <span>
            For fencers under 18, signed by a parent or guardian
            <span className="block text-muted-dim">Only juniors are asked to sign it.</span>
          </span>
        </label>
      </div>
      <fieldset>
        <legend className="font-display text-xs uppercase tracking-widest text-silver">Asked for at</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {EVENT_KINDS.map(k => (
            <button key={k} type="button" aria-pressed={appliesTo.includes(k)}
                    onClick={() => setAppliesTo(a => a.includes(k) ? a.filter(x => x !== k) : [...a, k])}
                    className={`min-h-9 border px-3 py-1 text-sm transition-colors ${
                      appliesTo.includes(k) ? 'border-gold bg-gold text-onyx' : 'border-rule text-silver hover:border-silver'
                    }`}>
              {eventKindLabel(k)}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Text" htmlFor="wbody" help="Exactly what members read and agree to. Stored with every signature.">
        <textarea id="wbody" rows={12} className={inputClass} value={body} onChange={e => setBody(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy}>Publish</Button>
        <Button type="button" variant="ghost" busy={busy} onClick={() => void save(false)}>Save as draft</Button>
        <Button type="button" variant="ghost" onClick={() => void onDone()}>{t.common.cancel}</Button>
      </div>
    </form>
  )
}

function TermsForm({ current, authorId, onDone }: {
  current: Terms | null
  authorId: string
  onDone: () => Promise<void>
}) {
  const [body, setBody] = useState(current?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    const { data: all } = await supabase.from('terms').select('version')
    const version = Math.max(0, ...(all ?? []).map(v => v.version)) + 1
    const { error } = await supabase.from('terms').insert({
      version, body: body.trim(), published_at: new Date().toISOString(), author_id: authorId,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    await onDone()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Terms of use" htmlFor="terms-body"
             help="Publishing asks every member to read and accept the new version next time they open the app.">
        <textarea id="terms-body" rows={14} className={inputClass} value={body} onChange={e => setBody(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>Publish version {(current?.version ?? 0) + 1}</Button>
        <Button type="button" variant="ghost" onClick={() => void onDone()}>{t.common.cancel}</Button>
      </div>
    </form>
  )
}
