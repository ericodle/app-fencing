import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { t } from '../i18n'
import { fetchBouts, withClubOpponentHandedness } from '../lib/bouts'
import { boutProfile, type BoutSide, type BoutRecord } from '../lib/bout-stats'
import { formatDate } from '../lib/dates'
import { weaponLabel } from '../lib/labels'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'
import { Button } from '../components/ui/Button'
import { BoutForm } from '../components/metrics/BoutForm'

export function BoutsPage() {
  const { profile } = useAuth()
  const [bouts, setBouts] = useState<BoutSide[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    // The handedness of a club-mate lives on their profile, not on the bout row
    // — the bouts table refuses a second copy of it, because a second copy
    // rots. So it is joined back in here, and the split below is only as good
    // as that join.
    setBouts(await withClubOpponentHandedness(await fetchBouts(profile.id)))
    setLoading(false)
  }, [profile])

  useEffect(() => { void load() }, [load])

  if (loading) return <PageLoading />

  const stats = boutProfile(bouts)

  return (
    <div className="flex flex-col gap-6">
      {adding && profile && (
        <BoutForm
          memberId={profile.id}
          onDone={async saved => { setAdding(false); if (saved) await load() }}
        />
      )}

      <Plate
        title={t.bouts.title}
        actions={!adding && <Button onClick={() => setAdding(true)}>{t.bouts.add}</Button>}
      >
        {stats.overall.bouts === 0 ? (
          <p className="text-muted">{t.bouts.noBouts}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Record" value={t.bouts.record(stats.overall.wins, stats.overall.losses, stats.overall.ties)} />
              <Stat label="Win rate" value={t.bouts.winRate(stats.overall.winRate)} />
              <Stat label="Indicator" value={t.bouts.indicator(stats.overall.indicator)} />
              <Stat label="Streak" value={t.bouts.currentStreak(stats.streaks.current)} />
              <Stat label="Last 20" value={t.bouts.winRate(stats.recent.winRate)} />
            </div>
            <p className="figures mt-3 text-sm text-muted">
              {stats.overall.touchesScoredPerBout} scored and{' '}
              {stats.overall.touchesReceivedPerBout} received per bout
            </p>
          </>
        )}
      </Plate>

      {stats.overall.bouts > 0 && (
        <>
          {/* The split that is worth the whole page. */}
          <Plate title="Against left and right" edge="gold">
            <div className="grid gap-4 sm:grid-cols-2">
              <RecordCard label={t.bouts.vsRight} record={stats.handedness.vsRight} />
              <RecordCard label={t.bouts.vsLeft} record={stats.handedness.vsLeft} />
            </div>
            {stats.handedness.unknown > 0 && (
              <p className="mt-3 text-sm text-muted-dim">
                {t.bouts.handednessUnknown(stats.handedness.unknown)}
              </p>
            )}
            {stats.handedness.vsLeft.bouts >= 5 && stats.handedness.vsRight.bouts >= 5 && (
              <HandednessNote
                left={stats.handedness.vsLeft.winRate}
                right={stats.handedness.vsRight.winRate}
              />
            )}
          </Plate>

          {stats.byWeapon.length > 1 && (
            <Plate title="By weapon">
              <div className="grid gap-4 sm:grid-cols-3">
                {stats.byWeapon.map(w => (
                  <RecordCard key={w.key} label={weaponLabel(w.key)} record={w.record} />
                ))}
              </div>
            </Plate>
          )}

          <Plate title={t.bouts.headToHead}>
            <ul className="flex flex-col">
              {stats.headToHead.slice(0, 20).map(h => (
                <li key={h.opponentId ?? h.opponentName}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-faint py-2 last:border-b-0">
                  <span className="text-paper">{h.opponentName}</span>
                  <span className="figures flex gap-4 text-sm text-muted">
                    <span className={h.record.winRate > 0.5 ? 'text-signal-green' : h.record.winRate < 0.5 ? 'text-signal-amber' : ''}>
                      {t.bouts.record(h.record.wins, h.record.losses, h.record.ties)}
                    </span>
                    <span>{t.bouts.indicator(h.record.indicator)}</span>
                    {h.lastMetOn && <span className="text-muted-dim">{t.bouts.lastMet(formatDate(h.lastMetOn))}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Plate>

          <Plate title="Every bout">
            <ul className="flex flex-col">
              {[...bouts].slice(0, 60).map(b => (
                <li key={`${b.boutId}-${b.opponentId ?? ''}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-faint py-1.5 text-sm last:border-b-0">
                  <span className="flex items-baseline gap-2">
                    <span className={
                      b.result === 'win' ? 'text-signal-green'
                      : b.result === 'loss' ? 'text-signal-amber' : 'text-muted'
                    }>
                      {b.result === 'win' ? 'W' : b.result === 'loss' ? 'L' : 'T'}
                    </span>
                    <span className="figures text-paper">{b.touchesScored}–{b.touchesReceived}</span>
                    <span className="text-muted">{b.opponentName ?? 'A club-mate'}</span>
                    {b.opponentHandedness === 'left' && (
                      <span className="text-xs text-signal-blue">LH</span>
                    )}
                  </span>
                  <span className="figures text-muted-dim">
                    {weaponLabel(b.weapon)} · {b.boutType} · {formatDate(b.boutedOn)}
                  </span>
                </li>
              ))}
            </ul>
          </Plate>
        </>
      )}
    </div>
  )
}

/** The sentence a fencer cannot get from the two cards on their own. */
function HandednessNote({ left, right }: { left: number; right: number }) {
  const gap = Math.round((right - left) * 100)
  if (Math.abs(gap) < 12) return null
  return (
    <p className="mt-3 border-l-2 border-gold-deep pl-3 text-sm text-muted">
      {gap > 0
        ? `You win ${gap} points more often against right-handers. That is a training gap, not bad luck — about one fencer in seven is left-handed, so it takes deliberate drilling to meet enough of them.`
        : `You win ${-gap} points more often against left-handers, which is unusual and worth knowing before you plan a season.`}
    </p>
  )
}

function RecordCard({ label, record }: { label: string; record: BoutRecord }) {
  return (
    <div className="border border-rule-faint p-3">
      <p className="font-display text-xs uppercase tracking-widest text-silver">{label}</p>
      {record.bouts === 0 ? (
        <p className="mt-1 text-sm text-muted-dim">No bouts recorded</p>
      ) : (
        <>
          <p className="figures mt-1 text-lg text-paper">{t.bouts.winRate(record.winRate)}</p>
          <p className="figures text-sm text-muted">
            {t.bouts.record(record.wins, record.losses, record.ties)} · {t.bouts.indicator(record.indicator)}
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-xs uppercase tracking-widest text-silver">{label}</p>
      <p className="figures text-lg text-paper">{value}</p>
    </div>
  )
}
