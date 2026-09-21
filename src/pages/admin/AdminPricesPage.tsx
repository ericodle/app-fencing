import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { clubConfig } from '../../config/club'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import type { Price, Discount } from '../../types/db'

export function AdminPricesPage() {
  const [prices, setPrices] = useState<Price[]>([])
  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [p, d] = await Promise.all([
        supabase.from('prices').select('*').order('sort_order'),
        supabase.from('discounts').select('*').order('label'),
      ])
      if (cancelled) return
      setPrices(p.data ?? [])
      setDiscounts(d.data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) return <PageLoading />

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.prices}</h1>

      <Plate title="Price list">
        <ul className="flex flex-col">
          {prices.map(p => (
            <li key={p.id} className="flex items-baseline justify-between gap-4 border-b border-rule-faint py-2 last:border-b-0">
              <span className={p.active ? 'text-paper' : 'text-muted-dim line-through'}>
                {p.label}
                <span className="ml-2 font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">
                  per {p.unit}
                </span>
              </span>
              <span className="figures text-muted">
                {p.amount} {p.currency ?? clubConfig.locale.currency}
              </span>
            </li>
          ))}
        </ul>
      </Plate>

      <Plate title="Discounts">
        <ul className="flex flex-col">
          {discounts.map(d => (
            <li key={d.id} className="flex items-baseline justify-between gap-4 border-b border-rule-faint py-2 last:border-b-0">
              <span className="text-paper">
                {d.label}
                {d.eligibility && <span className="block text-sm text-muted-dim">{d.eligibility}</span>}
              </span>
              <span className="figures text-muted">
                {d.kind === 'percent' ? `${d.value}%` : `${d.value} ${clubConfig.locale.currency}`}
              </span>
            </li>
          ))}
        </ul>
      </Plate>
    </div>
  )
}
