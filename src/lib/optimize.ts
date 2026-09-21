// The two optimizers behind the meetup planner, on a plane.
//
// Separated from meetup.ts because they are geometry, not club logic: they take
// points and return a point, know nothing about fencers, polls or venues, and
// are tested against hand-computed answers rather than against fixtures.
//
// Both answer "where is the middle?", and they disagree, which is the entire
// reason the planner offers a choice:
//
//   geometricMedian  minimizes the SUM of distances. The fair-in-aggregate
//                    answer: it is where total travel is least, and it is
//                    robust — one member living an hour out barely moves it.
//
//   smallestCircle   minimizes the MAXIMUM distance. The fair-to-the-worst-off
//                    answer: it is where the longest single journey is as short
//                    as it can be, and it is the opposite of robust — that same
//                    outlier drags it most of the way to their door.
//
// The arithmetic mean is a third answer and a bad one — it is neither of the
// above, it is merely easy — so it is computed for comparison only.

import type { PlanePoint } from './geo'

export interface WeightedPoint extends PlanePoint {
  /** Defaults to 1. A member who brings two others counts as three journeys. */
  weight?: number
}

const weightOf = (p: WeightedPoint) => p.weight ?? 1

/** The arithmetic mean. Offered for comparison, never as the recommendation. */
export function centroid(points: readonly WeightedPoint[]): PlanePoint {
  const total = points.reduce((s, p) => s + weightOf(p), 0)
  if (total === 0) return { x: 0, y: 0 }
  return {
    x: points.reduce((s, p) => s + p.x * weightOf(p), 0) / total,
    y: points.reduce((s, p) => s + p.y * weightOf(p), 0) / total,
  }
}

/** Total weighted distance from `at` to every point. The objective the
 *  geometric median minimizes, exposed so callers can score any candidate. */
export function totalDistance(at: PlanePoint, points: readonly WeightedPoint[]): number {
  return points.reduce((s, p) => s + weightOf(p) * Math.hypot(at.x - p.x, at.y - p.y), 0)
}

export interface GeometricMedianOptions {
  /** Stop once a step moves the estimate less than this, in the plane's units
   *  (km). 1 m is far below the resolution of "where shall we meet". */
  tolerance?: number
  maxIterations?: number
}

/**
 * Weiszfeld's algorithm for the geometric median (the Fermat–Weber point).
 *
 * Iteratively re-weights each point by the reciprocal of its distance from the
 * current estimate, which converges to the point minimizing total distance.
 *
 * Two things make a naive implementation wrong, and both are handled:
 *
 *  1. **The estimate landing exactly on a data point.** The reciprocal of zero
 *     is the end of the run. The classical fix is the Vardi–Zhang correction:
 *     at such a point, take the step the other points ask for, but limit it by
 *     the weight sitting at the current position. If that weight dominates, the
 *     point IS the median and we stop — which is the correct answer, not a
 *     degenerate case. This happens constantly in practice, because clubs have
 *     odd numbers of members living in a line along a metro route.
 *
 *  2. **Two points, or all points collinear.** With two points every point on
 *     the segment between them is an equally good median, and the iteration can
 *     wander along it forever. Handled by the explicit n <= 2 cases.
 */
export function geometricMedian(
  points: readonly WeightedPoint[],
  options: GeometricMedianOptions = {},
): PlanePoint {
  const tolerance = options.tolerance ?? 1e-3
  const maxIterations = options.maxIterations ?? 256

  const pts = points.filter(p => weightOf(p) > 0)
  if (pts.length === 0) return { x: 0, y: 0 }
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y }
  if (pts.length === 2) {
    // Two points is a special case the iteration cannot solve, and the answer
    // is NOT their weighted mean. The objective along the segment is
    // w1·d + w2·(L − d), which is linear in d: it has no interior minimum. So
    // the heavier endpoint wins outright, however slim its majority, and only
    // an exact tie makes every point on the segment equally good. The midpoint
    // is the least surprising member of that tie.
    const [a, b] = pts
    if (weightOf(a) > weightOf(b)) return { x: a.x, y: a.y }
    if (weightOf(b) > weightOf(a)) return { x: b.x, y: b.y }
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  let current = centroid(pts)

  for (let i = 0; i < maxIterations; i++) {
    let sumX = 0
    let sumY = 0
    let sumW = 0
    // Weight sitting exactly at the current estimate, and the unit vectors of
    // everyone else — the two halves of the Vardi–Zhang step.
    let weightHere = 0

    for (const p of pts) {
      const d = Math.hypot(current.x - p.x, current.y - p.y)
      if (d < 1e-12) {
        weightHere += weightOf(p)
        continue
      }
      const w = weightOf(p) / d
      sumX += p.x * w
      sumY += p.y * w
      sumW += w
    }

    if (sumW === 0) {
      // Every point is where we already are.
      return current
    }

    const naive = { x: sumX / sumW, y: sumY / sumW }

    let next: PlanePoint
    if (weightHere === 0) {
      next = naive
    } else {
      // The resultant of the unit vectors pulling away from this point. If its
      // magnitude does not exceed the weight anchored here, no direction
      // improves the objective and we are at the median.
      const rx = sumX - sumW * current.x
      const ry = sumY - sumW * current.y
      const r = Math.hypot(rx, ry)
      if (r <= weightHere) return current
      const scale = Math.max(0, 1 - weightHere / r)
      next = {
        x: (1 - scale) * current.x + scale * naive.x,
        y: (1 - scale) * current.y + scale * naive.y,
      }
    }

    const moved = Math.hypot(next.x - current.x, next.y - current.y)
    current = next
    if (moved < tolerance) break
  }

  return current
}

// ── smallest enclosing circle ────────────────────────────────────────────────

export interface Circle {
  center: PlanePoint
  radius: number
}

const EPS = 1e-9

function circleFromTwo(a: PlanePoint, b: PlanePoint): Circle {
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return { center, radius: Math.max(dist(center, a), dist(center, b)) }
}

function circleFromThree(a: PlanePoint, b: PlanePoint, c: PlanePoint): Circle | null {
  // Circumcenter, via the standard determinant form. A zero determinant means
  // the three are collinear and have no circumcircle — the caller falls back to
  // a two-point circle, which is correct for collinear input.
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < EPS) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  }
  return { center, radius: Math.max(dist(center, a), dist(center, b), dist(center, c)) }
}

function dist(a: PlanePoint, b: PlanePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function inCircle(c: Circle, p: PlanePoint): boolean {
  return dist(c.center, p) <= c.radius * (1 + 1e-12) + EPS
}

// A tiny deterministic PRNG. Welzl's algorithm needs the input shuffled to get
// its expected linear time; using Math.random would make the result
// irreproducible across runs, which is intolerable for something the club is
// going to argue about. Mulberry32, seeded from the point count.
function seededShuffle<T>(items: readonly T[]): T[] {
  let seed = 0x9e3779b9 ^ items.length
  const next = () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The smallest circle enclosing every point (Welzl, incremental form).
 *
 * Its center is the point minimizing the maximum distance to any input — the
 * "nobody has a terrible journey" answer. Exact, not iterative: the answer is
 * determined by at most three of the points, and this finds which three.
 *
 * Weights are deliberately ignored. The objective is about the worst individual
 * journey, and a journey is not worse because the person making it is bringing
 * a friend along the same route.
 */
export function smallestEnclosingCircle(points: readonly PlanePoint[]): Circle {
  if (points.length === 0) return { center: { x: 0, y: 0 }, radius: 0 }
  const pts = seededShuffle(points)

  let circle: Circle = { center: pts[0], radius: 0 }
  for (let i = 1; i < pts.length; i++) {
    if (inCircle(circle, pts[i])) continue
    circle = { center: pts[i], radius: 0 }
    for (let j = 0; j < i; j++) {
      if (inCircle(circle, pts[j])) continue
      circle = circleFromTwo(pts[i], pts[j])
      for (let k = 0; k < j; k++) {
        if (inCircle(circle, pts[k])) continue
        const three = circleFromThree(pts[i], pts[j], pts[k])
        if (three) circle = three
      }
    }
  }
  return circle
}
