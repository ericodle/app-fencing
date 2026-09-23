// The field descriptions and the two pure helpers behind CatalogManager, in
// their own module so the component file exports only components.

import { clubConfig } from '../../config/club'

export type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'kinds'

export interface CatalogField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  help?: string
  options?: readonly { value: string; label: string }[]
  /** Numeric inputs: allow decimals (coordinates) rather than whole numbers. */
  decimal?: boolean
}

export type CatalogRow = Record<string, unknown> & { id: string }
export type CatalogTable = 'prices' | 'cancellation_policies' | 'payment_methods' | 'venues' | 'discounts'

/** Empty text is null and an empty number is null, so a cleared field clears
 *  the column rather than writing '' into it. Booleans are always sent. */
export function formToPayload(fields: readonly CatalogField[], values: Record<string, unknown>) {
  const payload: Record<string, unknown> = {}
  for (const f of fields) {
    const v = values[f.key]
    if (f.type === 'boolean') payload[f.key] = !!v
    else if (f.type === 'kinds') payload[f.key] = Array.isArray(v) ? v : []
    else if (f.type === 'number') payload[f.key] = v === '' || v === null || v === undefined ? null : Number(v)
    else payload[f.key] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }
  return payload
}

/** A friendly reason for the two refusals an admin actually meets here. */
export function catalogError(error: { code?: string; message: string }, noun: string): string {
  if (error.code === '23503') return `This ${noun} is still in use, so it cannot be deleted. Deactivate or archive it instead.`
  if (error.code === '23505') return `There is already a ${noun} like that.`
  if (error.code === '23514') return `That does not fit the rules for a ${noun}: ${error.message}`
  return error.message
}

const CURRENCY = clubConfig.locale.currency

export const PRICE_FIELDS: readonly CatalogField[] = [
  { key: 'label', label: 'Name', type: 'text', required: true },
  { key: 'unit', label: 'Charged per', type: 'select', options: [
    { value: 'session', label: 'Session' }, { value: 'term', label: 'Term' },
    { value: 'pass', label: 'Pass' }, { value: 'membership', label: 'Membership' },
    { value: 'loan', label: 'Kit loan' }, { value: 'other', label: 'Other' },
  ] },
  { key: 'amount', label: `Price (${CURRENCY})`, type: 'number', required: true },
  { key: 'deposit_amount', label: `Deposit (${CURRENCY})`, type: 'number',
    help: 'Paid to hold the place; the booking is confirmed once it is in. Leave blank to need the full price.' },
  { key: 'applies_to', label: 'Offered for', type: 'kinds',
    help: 'Which kinds of event this price is suggested for. Any event can still use it.' },
  { key: 'sort_order', label: 'Order', type: 'number' },
  { key: 'active', label: 'Active', type: 'boolean', help: 'Inactive prices are kept for old events but not offered for new ones.' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export const POLICY_FIELDS: readonly CatalogField[] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'body', label: 'What members agree to', type: 'textarea', required: true,
    help: 'Shown on the registration form, with a box to tick.' },
  { key: 'deposit_refundable', label: 'Deposit is refundable', type: 'boolean',
    help: 'Untick to keep the deposit when a member cancels, even in time. Cancelling the whole event always refunds it.' },
  { key: 'active', label: 'Active', type: 'boolean' },
]

export const PAYMENT_METHOD_FIELDS: readonly CatalogField[] = [
  { key: 'label', label: 'Name', type: 'text', required: true },
  { key: 'key', label: 'Short code', type: 'text', required: true,
    help: 'Lowercase letters, digits and underscores, e.g. bank_transfer. Recorded on each payment.' },
  { key: 'instructions', label: 'How to pay', type: 'textarea',
    help: 'Account number, LINE Pay ID, where to hand cash over. Members see this on their booking.' },
  { key: 'sort_order', label: 'Order', type: 'number' },
  { key: 'active', label: 'Active', type: 'boolean' },
]

export const DISCOUNT_FIELDS: readonly CatalogField[] = [
  { key: 'label', label: 'Name', type: 'text', required: true },
  { key: 'kind', label: 'Kind', type: 'select', options: [
    { value: 'percent', label: 'Percent off' }, { value: 'amount', label: `Fixed ${CURRENCY} off` },
  ] },
  { key: 'value', label: 'Value', type: 'number', required: true },
  { key: 'eligibility', label: 'Who it is for', type: 'text' },
  { key: 'active', label: 'Active', type: 'boolean' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export const VENUE_KINDS = ['salle', 'gym', 'school', 'park', 'community', 'competition', 'other'] as const

export const VENUE_FIELDS: readonly CatalogField[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'native_name', label: 'Name in Chinese', type: 'text' },
  { key: 'kind', label: 'Kind', type: 'select',
    options: VENUE_KINDS.map(k => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })) },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'district', label: 'District', type: 'text' },
  { key: 'map_query', label: 'Map search', type: 'text',
    help: 'What to search for in a maps app when the address does not find it.' },
  { key: 'lat', label: 'Latitude', type: 'number', decimal: true, required: true,
    help: 'From a maps app: long-press the spot and copy the numbers. The meetup planner cannot rank a venue without them.' },
  { key: 'lng', label: 'Longitude', type: 'number', decimal: true, required: true },
  { key: 'pistes', label: 'Strips', type: 'number' },
  { key: 'capacity', label: 'Capacity', type: 'number' },
  { key: 'indoor', label: 'Indoor', type: 'boolean' },
  { key: 'has_scoring', label: 'Boxes and reels on site', type: 'boolean' },
  { key: 'status', label: 'Status', type: 'select',
    options: [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }] },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]
