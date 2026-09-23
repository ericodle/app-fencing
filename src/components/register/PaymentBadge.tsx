import { t } from '../../i18n'
import { paymentState, formatMoney, type BalanceRow, type PaymentState } from '../../lib/money'

// The one badge for "where is the money on this booking", shared by the
// member's own view and the admin's registrations list so the two cannot
// describe the same booking differently.

const TONE: Record<PaymentState, string> = {
  free:        'border-rule text-silver',
  unpaid:      'border-signal-red text-signal-red',
  deposit_due: 'border-signal-amber text-signal-amber',
  partial:     'border-signal-amber text-signal-amber',
  paid:        'border-signal-green text-signal-green',
  credit:      'border-signal-blue text-signal-blue',
  cancelled:   'border-rule text-muted-dim',
}

export function PaymentBadge({ row }: { row: BalanceRow }) {
  const state = paymentState(row)
  const detail = state === 'partial' || state === 'deposit_due'
    ? ` · ${formatMoney(state === 'deposit_due' ? row.deposit_due : row.balance)}`
    : ''
  return (
    <span className={`border px-1.5 font-display text-[0.6rem] uppercase tracking-widest ${TONE[state]}`}>
      {t.booking.payment[state]}{detail}
    </span>
  )
}
