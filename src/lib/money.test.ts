import { describe, expect, it } from 'vitest'
import {
  formatMoney, paymentState, canSelfCancel, canRequestRefund, fullPaymentDeadline, refundInTime,
  type BalanceRow,
} from './money'

const row = (over: Partial<BalanceRow>): BalanceRow => ({
  status: 'pending', owed: 3000, paid: 0, deposit: 1000, deposit_due: 1000, balance: 3000, unsettled: 0,
  ...over,
})

describe('formatMoney', () => {
  it('writes the club currency and groups thousands', () => {
    expect(formatMoney(6000)).toBe('NTD 6,000')
    expect(formatMoney(0)).toBe('NTD 0')
    expect(formatMoney(12.5)).toBe('NTD 12.50')
    expect(formatMoney(null)).toBe('NTD 0')
  })
})

describe('paymentState', () => {
  it('reads each state from the view row', () => {
    expect(paymentState(row({ owed: 0, balance: 0, deposit: 0, deposit_due: 0 }))).toBe('free')
    expect(paymentState(row({}))).toBe('unpaid')
    expect(paymentState(row({ paid: 500, deposit_due: 500, balance: 2500 }))).toBe('deposit_due')
    expect(paymentState(row({ paid: 1000, deposit_due: 0, balance: 2000 }))).toBe('partial')
    expect(paymentState(row({ paid: 3000, deposit_due: 0, balance: 0 }))).toBe('paid')
    expect(paymentState(row({ paid: 3500, deposit_due: 0, balance: -500 }))).toBe('credit')
    expect(paymentState(row({ status: 'cancelled', balance: 0 }))).toBe('cancelled')
  })

  it('calls a booking with no deposit and part paid "partial"', () => {
    expect(paymentState(row({ deposit: 0, deposit_due: 0, paid: 100, balance: 2900 }))).toBe('partial')
  })
})

describe('who may cancel', () => {
  it('lets a member cancel only while nothing is paid', () => {
    expect(canSelfCancel({ status: 'pending', paid: 0 })).toBe(true)
    expect(canSelfCancel({ status: 'waitlisted', paid: 0 })).toBe(true)
    expect(canSelfCancel({ status: 'confirmed', paid: 400 })).toBe(false)
    expect(canSelfCancel({ status: 'cancelled', paid: 0 })).toBe(false)
  })

  it('offers a refund request once, and only when something is paid', () => {
    expect(canRequestRefund({ status: 'confirmed', paid: 400 })).toBe(true)
    expect(canRequestRefund({ status: 'confirmed', paid: 0 })).toBe(false)
    expect(canRequestRefund({ status: 'confirmed', paid: 400, refund_requested_at: '2026-09-01T00:00:00Z' })).toBe(false)
    expect(canRequestRefund({ status: 'cancelled', paid: 400 })).toBe(false)
  })
})

describe('fullPaymentDeadline', () => {
  it('uses the event’s own deadline when it has one', () => {
    expect(fullPaymentDeadline({ full_payment_deadline: '2026-10-01' }, '2026-10-20')).toBe('2026-10-01')
  })

  it('falls back to seven days before the first day', () => {
    expect(fullPaymentDeadline({ full_payment_deadline: null }, '2026-10-20')).toBe('2026-10-13')
    expect(fullPaymentDeadline({ full_payment_deadline: null }, '2026-03-03')).toBe('2026-02-24')
  })

  it('has nothing to say about an undated event', () => {
    expect(fullPaymentDeadline({ full_payment_deadline: null }, null)).toBeNull()
  })
})

describe('refundInTime', () => {
  it('is in time on the cancel-by date itself, and not the day after', () => {
    expect(refundInTime('2026-10-01', '2026-10-01')).toBe(true)
    expect(refundInTime('2026-10-01', '2026-10-02')).toBe(false)
    expect(refundInTime(null, '2030-01-01')).toBe(true)
  })
})
