import { t } from '../../i18n'
import { CatalogManager } from '../../components/admin/CatalogManager'
import {
  PRICE_FIELDS, POLICY_FIELDS, PAYMENT_METHOD_FIELDS, DISCOUNT_FIELDS,
} from '../../components/admin/catalog'
import { formatMoney } from '../../lib/money'
import { eventKindLabel } from '../../lib/labels'
import { clubConfig } from '../../config/club'

// What the club charges, the terms it charges on, and how it is paid.
//
// An event points at one price tier; the tier's price and deposit are frozen
// onto each booking when it is made, so editing a tier here never changes what
// somebody already agreed to pay. An event with no tier is free.

export function AdminPricesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.prices}</h1>

      <CatalogManager
        title="Price tiers"
        subtitle="Pick one on an event. Leave the event without one and it is free."
        table="prices" noun="price" fields={PRICE_FIELDS} orderBy="sort_order" inactiveKey="active"
        defaults={{ unit: 'session', active: true, currency: clubConfig.locale.currency }}
        rowLabel={p => (
          <>
            {String(p.label)}
            <span className="ml-2 font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">
              per {String(p.unit)}
            </span>
          </>
        )}
        rowDetail={p => [
          formatMoney(p.amount as number),
          p.deposit_amount ? `deposit ${formatMoney(p.deposit_amount as number)}` : 'no deposit',
          (p.applies_to as string[] | null)?.map(eventKindLabel).join(', '),
        ].filter(Boolean).join(' · ')}
      />

      <CatalogManager
        title="Cancellation policies"
        subtitle="What a member agrees to when they register, and whether the deposit comes back."
        table="cancellation_policies" noun="policy" fields={POLICY_FIELDS} orderBy="title"
        inactiveKey="active" defaults={{ deposit_refundable: true, active: true }}
        rowLabel={p => String(p.title)}
        rowDetail={p => (p.deposit_refundable ? 'Deposit refundable' : 'Deposit kept on cancellation')}
      />

      <CatalogManager
        title="Payment methods"
        subtitle="How members can pay. The instructions show on every booking that still owes."
        table="payment_methods" noun="payment method" fields={PAYMENT_METHOD_FIELDS} orderBy="sort_order"
        inactiveKey="active" defaults={{ active: true }}
        rowLabel={m => String(m.label)}
        rowDetail={m => (m.instructions ? String(m.instructions) : 'No instructions yet')}
      />

      <CatalogManager
        title="Discounts"
        subtitle="Granted on a booking as an adjustment, from the event's registrations."
        table="discounts" noun="discount" fields={DISCOUNT_FIELDS} orderBy="label"
        inactiveKey="active" defaults={{ kind: 'percent', active: true }}
        rowLabel={d => String(d.label)}
        rowDetail={d => [
          d.kind === 'percent' ? `${String(d.value)}% off` : `${formatMoney(d.value as number)} off`,
          d.eligibility ? String(d.eligibility) : null,
        ].filter(Boolean).join(' · ')}
      />
    </div>
  )
}
