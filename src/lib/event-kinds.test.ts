import { describe, expect, it } from 'vitest'
import {
  EVENT_KINDS, MOVABLE_KINDS, hasBouting, heldAtHomeVenue, pollsAttendance,
  producesCompetitionResults, requiresKit, usesDateEnvelope, venueIsNegotiable,
  isEventKind, type EventKind,
} from './event-kinds'

// Every kind's answer to every question, written out as a table. Adding a kind
// fails here until somebody decides its row, which is the point of asking
// questions rather than comparing against 'practice'.
const ANSWERS: Record<EventKind, {
  envelope: boolean; home: boolean; negotiable: boolean; bouting: boolean
  results: boolean; kit: boolean; polls: boolean
}> = {
  practice:       { envelope: true,  home: true,  negotiable: false, bouting: true,  results: false, kit: true,  polls: true  },
  course:         { envelope: false, home: true,  negotiable: false, bouting: true,  results: false, kit: true,  polls: false },
  cross_training: { envelope: true,  home: false, negotiable: true,  bouting: false, results: false, kit: false, polls: true  },
  tournament:     { envelope: true,  home: false, negotiable: false, bouting: true,  results: true,  kit: true,  polls: true  },
  interclub:      { envelope: true,  home: false, negotiable: false, bouting: true,  results: false, kit: true,  polls: true  },
  social:         { envelope: true,  home: false, negotiable: false, bouting: false, results: false, kit: false, polls: true  },
}

describe('event kinds', () => {
  it('has a row in the answer table for exactly the kinds that exist', () => {
    expect(Object.keys(ANSWERS).sort()).toEqual([...EVENT_KINDS].sort())
  })

  it.each(EVENT_KINDS)('%s answers every question as decided', kind => {
    expect({
      envelope: usesDateEnvelope(kind),
      home: heldAtHomeVenue(kind),
      negotiable: venueIsNegotiable(kind),
      bouting: hasBouting(kind),
      results: producesCompetitionResults(kind),
      kit: requiresKit(kind),
      polls: pollsAttendance(kind),
    }).toEqual(ANSWERS[kind])
  })

  it('gives the meetup planner cross-training and nothing else', () => {
    expect(MOVABLE_KINDS).toEqual(['cross_training'])
  })

  it('no longer recognizes popup', () => {
    expect(isEventKind('popup')).toBe(false)
    expect(isEventKind('cross_training')).toBe(true)
  })
})
