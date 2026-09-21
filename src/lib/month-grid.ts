// The calendar's month grid, as arithmetic.
//
// Its own module rather than an export from CalendarPage for two reasons: an
// off-by-one here shifts every event in the month by a day — silently, and in a
// way that looks like a data problem — so it wants its own tests; and exporting
// a non-component from a component file breaks React Fast Refresh for the whole
// file.

export interface GridCell {
  /** The club-local date, or null for a padding cell. */
  day: string | null
  index: number
}

/**
 * A Monday-first grid of the month, padded at the front so the 1st lands under
 * its real weekday and at the back so the grid ends on a whole week.
 */
export function buildGrid(year: number, month: number): GridCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  // getUTCDay is 0 for Sunday; this grid starts on Monday.
  const lead = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const cells: GridCell[] = []
  for (let i = 0; i < lead; i++) cells.push({ day: null, index: i })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      // Zero-padded, so the strings sort and compare as text — which is how
      // every date in this app is compared.
      day: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      index: lead + d - 1,
    })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, index: cells.length })
  return cells
}
