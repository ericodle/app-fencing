import { describe, it, expect } from 'vitest'
import { buildGrid } from './month-grid'

// The grid is pure arithmetic and an off-by-one in it shifts every event in the
// month by a day — silently, and in a way that looks like a data problem. So it
// is tested on its own, against months whose shape is known.

describe('buildGrid', () => {
  it('pads so the 1st lands under its real weekday, Monday first', () => {
    // 1 September 2026 is a Tuesday: one blank cell before it.
    const cells = buildGrid(2026, 9)
    expect(cells[0].day).toBeNull()
    expect(cells[1].day).toBe('2026-09-01')
  })

  it('needs no padding when the month starts on a Monday', () => {
    // 1 June 2026 is a Monday.
    expect(buildGrid(2026, 6)[0].day).toBe('2026-06-01')
  })

  it('pads six cells when the month starts on a Sunday', () => {
    // 1 November 2026 is a Sunday — the worst case for a Monday-first grid.
    const cells = buildGrid(2026, 11)
    expect(cells.slice(0, 6).every(c => c.day === null)).toBe(true)
    expect(cells[6].day).toBe('2026-11-01')
  })

  it('holds every day of the month, once', () => {
    for (const [year, month, length] of [[2026, 1, 31], [2026, 2, 28], [2026, 4, 30], [2028, 2, 29]]) {
      const days = buildGrid(year, month).filter(c => c.day !== null)
      expect(days).toHaveLength(length)
      expect(new Set(days.map(c => c.day)).size).toBe(length)
    }
  })

  it('gets a leap February right', () => {
    const days = buildGrid(2028, 2).filter(c => c.day !== null)
    expect(days[days.length - 1].day).toBe('2028-02-29')
  })

  it('always fills whole weeks, so the grid never ends ragged', () => {
    for (let month = 1; month <= 12; month++) {
      expect(buildGrid(2026, month).length % 7).toBe(0)
    }
  })

  it('zero-pads the date strings so they sort and compare as text', () => {
    const cells = buildGrid(2026, 3).filter(c => c.day !== null)
    expect(cells[0].day).toBe('2026-03-01')
    expect(cells.map(c => c.day!)).toEqual([...cells.map(c => c.day!)].sort())
  })
})
