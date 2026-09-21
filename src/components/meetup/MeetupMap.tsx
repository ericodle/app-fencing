import { useMemo } from 'react'
import { projectionFor, project, type LatLng } from '../../lib/geo'
import type { Attendee, MeetupCandidate } from '../../lib/meetup'
import { t } from '../../i18n'

// A drawn map, not a tiled one.
//
// There are no map tiles here and no third-party request: the club's site is
// built on inline SVG for exactly this reason, and a planner that phones a tile
// server is a planner that leaks where every member lives to whoever runs it.
// What this draws is the only thing the decision actually needs — the relative
// positions of everyone's origins, the candidate points, and the venues — on a
// scale bar, so "2 km" is legible without a street behind it.
//
// Everything is projected with the same tangent plane the optimizer used, so
// what is shown is what was computed. A separate projection here would be a
// picture of a different problem.

const PAD = 28

export function MeetupMap({
  attendees, ideal, venues, highlight,
}: {
  attendees: Attendee[]
  ideal: { total: LatLng; fairest: LatLng; centroid: LatLng }
  venues: MeetupCandidate[]
  highlight: MeetupCandidate
}) {
  const view = useMemo(() => {
    const located = attendees.filter(a => Number.isFinite(a.origin.lat) && Number.isFinite(a.origin.lng))
    const points = [
      ...located.map(a => a.origin),
      ideal.total, ideal.fairest, ideal.centroid,
      ...venues.map(v => v.point),
    ]
    if (points.length === 0) return null

    const proj = projectionFor(points)
    const planar = points.map(p => project(p, proj))
    const xs = planar.map(p => p.x)
    const ys = planar.map(p => p.y)
    // A floor on the extent, so three people on one street do not get a map
    // scaled to 200 m and covered in overlapping pins.
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1)
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1)
    const span = Math.max(spanX, spanY) * 1.25
    const midX = (Math.max(...xs) + Math.min(...xs)) / 2
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2

    const size = 100 - PAD * 2 / 4
    // Plane km → viewBox units. y is negated: the plane's y grows north, SVG's
    // grows down.
    const toView = (p: LatLng) => {
      const { x, y } = project(p, proj)
      return {
        x: PAD + ((x - midX) / span + 0.5) * (400 - PAD * 2),
        y: PAD + (0.5 - (y - midY) / span) * (400 - PAD * 2),
      }
    }
    // How many viewBox units one kilometer is, for the scale bar.
    const unitsPerKm = (400 - PAD * 2) / span
    return { toView, unitsPerKm, span, located, size }
  }, [attendees, ideal, venues])

  if (!view) return null

  const { toView, unitsPerKm, span } = view
  // A round number of km that fits in about a quarter of the frame.
  const scaleKm = [0.5, 1, 2, 5, 10, 20, 50].find(k => k * unitsPerKm > 60) ?? 50

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 400 400"
        className="w-full border border-rule-faint bg-ink-900"
        role="img"
        aria-label={`A drawn map of ${view.located.length} members' starting points, the suggested meeting points and ${venues.length} nearby venues, spanning about ${span.toFixed(0)} kilometers.`}
      >
        {/* A ruled grid, one line per kilometer, so distance is readable off
            the drawing rather than only off the numbers. Faint: it is a
            reference, not the subject. */}
        <defs>
          <pattern id="meetup-grid" width={unitsPerKm} height={unitsPerKm} patternUnits="userSpaceOnUse">
            <path d={`M ${unitsPerKm} 0 L 0 0 0 ${unitsPerKm}`} fill="none"
                  stroke="var(--color-rule-faint)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="400" height="400" fill="url(#meetup-grid)" />

        {/* Spokes from the highlighted point to every origin: the picture of
            what is being minimized. */}
        {view.located.map(a => {
          const from = toView(a.origin)
          const to = toView(highlight.point)
          return (
            <line
              key={`spoke-${a.memberId}`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke="var(--color-rule)" strokeWidth="0.75" strokeDasharray="2 3"
            />
          )
        })}

        {/* Venues: hollow squares. Not the answer, the options. */}
        {venues.map(v => {
          const p = toView(v.point)
          const isHighlight = highlight.venue?.id === v.venue?.id
          return (
            <g key={v.venue!.id}>
              <rect
                x={p.x - 4} y={p.y - 4} width="8" height="8"
                fill="none"
                stroke={isHighlight ? 'var(--color-gold)' : 'var(--color-silver-deep)'}
                strokeWidth={isHighlight ? 2 : 1}
              />
              {isHighlight && (
                <text x={p.x + 8} y={p.y + 4} fontSize="9"
                      fill="var(--color-gold)" fontFamily="var(--font-display)">
                  {v.venue!.name}
                </text>
              )}
            </g>
          )
        })}

        {/* The two ideal points, always both drawn. Seeing them apart is the
            argument for showing two objectives at all. */}
        <IdealMark at={toView(ideal.total)}   color="var(--color-gold)"        label="total" />
        <IdealMark at={toView(ideal.fairest)} color="var(--color-signal-blue)" label="fairest" />

        {/* Members: filled dots, silver. Labelled, because a pin nobody can
            attribute is not worth drawing. */}
        {view.located.map(a => {
          const p = toView(a.origin)
          return (
            <g key={a.memberId}>
              <circle cx={p.x} cy={p.y} r="3"
                      fill={a.originSource === 'response' ? 'var(--color-signal-green)' : 'var(--color-silver)'} />
              <text x={p.x + 6} y={p.y + 3} fontSize="8" fill="var(--color-muted)">
                {a.name}
              </text>
            </g>
          )
        })}

        {/* Scale bar, bottom left. */}
        <g transform={`translate(${PAD}, 385)`}>
          <line x1="0" y1="0" x2={scaleKm * unitsPerKm} y2="0"
                stroke="var(--color-silver-deep)" strokeWidth="1" />
          <line x1="0" y1="-3" x2="0" y2="3" stroke="var(--color-silver-deep)" strokeWidth="1" />
          <line x1={scaleKm * unitsPerKm} y1="-3" x2={scaleKm * unitsPerKm} y2="3"
                stroke="var(--color-silver-deep)" strokeWidth="1" />
          <text x={scaleKm * unitsPerKm / 2} y="-6" fontSize="8" textAnchor="middle"
                fill="var(--color-muted-dim)">
            {scaleKm} km
          </text>
        </g>
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-dim">
        <Key color="var(--color-silver)" shape="dot">{t.meetup.fromHome}</Key>
        <Key color="var(--color-signal-green)" shape="dot">{t.meetup.fromElsewhere}</Key>
        <Key color="var(--color-gold)" shape="cross">{t.meetup.leastTravel}</Key>
        <Key color="var(--color-signal-blue)" shape="cross">{t.meetup.fairest}</Key>
        <Key color="var(--color-silver-deep)" shape="square">{t.admin.venues}</Key>
      </figcaption>
    </figure>
  )
}

/** A drawn cross rather than a dot, so an ideal point never reads as a person. */
function IdealMark({ at, color, label }: { at: { x: number; y: number }; color: string; label: string }) {
  return (
    <g aria-label={label}>
      <line x1={at.x - 6} y1={at.y} x2={at.x + 6} y2={at.y} stroke={color} strokeWidth="1.5" />
      <line x1={at.x} y1={at.y - 6} x2={at.x} y2={at.y + 6} stroke={color} strokeWidth="1.5" />
      <circle cx={at.x} cy={at.y} r="7" fill="none" stroke={color} strokeWidth="0.75" strokeOpacity="0.6" />
    </g>
  )
}

function Key({ color, shape, children }: { color: string; shape: 'dot' | 'cross' | 'square'; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        {shape === 'dot' && <circle cx="6" cy="6" r="3" fill={color} />}
        {shape === 'square' && <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke={color} />}
        {shape === 'cross' && (
          <>
            <line x1="2" y1="6" x2="10" y2="6" stroke={color} strokeWidth="1.5" />
            <line x1="6" y1="2" x2="6" y2="10" stroke={color} strokeWidth="1.5" />
          </>
        )}
      </svg>
      {children}
    </span>
  )
}
