import { describe, it, expect } from 'vitest'
import {
  geometricMedian, smallestEnclosingCircle, centroid, totalDistance,
  type WeightedPoint,
} from './optimize'
import type { PlanePoint } from './geo'

const at = (x: number, y: number, weight?: number): WeightedPoint => ({ x, y, weight })
const near = (a: PlanePoint, b: PlanePoint, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
}

describe('centroid', () => {
  it('is the arithmetic mean', () => {
    near(centroid([at(0, 0), at(4, 0), at(0, 4), at(4, 4)]), { x: 2, y: 2 })
  })

  it('weights a point by how many people it stands for', () => {
    near(centroid([at(0, 0, 3), at(4, 0, 1)]), { x: 1, y: 0 })
  })

  it('returns the origin rather than NaN for no points', () => {
    expect(centroid([])).toEqual({ x: 0, y: 0 })
  })
})

describe('geometricMedian', () => {
  it('is the center of a symmetric square', () => {
    near(geometricMedian([at(0, 0), at(4, 0), at(0, 4), at(4, 4)]), { x: 2, y: 2 }, 3)
  })

  it('is the middle point of three in a line — not their mean', () => {
    // This is the whole difference between the median and the mean. The mean of
    // 0, 1 and 30 is 10.33; the point minimizing total distance is 1.
    const pts = [at(0, 0), at(1, 0), at(30, 0)]
    const median = geometricMedian(pts)
    near(median, { x: 1, y: 0 }, 3)
    expect(centroid(pts).x).toBeCloseTo(31 / 3, 6)
  })

  it('lands exactly on a point when that point is the answer', () => {
    // A cross: four arms and a heavy center. The Vardi–Zhang correction is what
    // stops the iteration dividing by a zero distance here.
    const pts = [at(0, 0, 5), at(10, 0), at(-10, 0), at(0, 10), at(0, -10)]
    near(geometricMedian(pts), { x: 0, y: 0 }, 6)
  })

  it('is not dragged away by one distant outlier', () => {
    const cluster = [at(0, 0), at(1, 0), at(0, 1), at(1, 1)]
    const withOutlier = geometricMedian([...cluster, at(500, 500)])
    // The mean would be pulled a hundred km out. The median barely moves.
    expect(Math.hypot(withOutlier.x - 0.5, withOutlier.y - 0.5)).toBeLessThan(1.5)
    expect(centroid([...cluster, at(500, 500)]).x).toBeGreaterThan(90)
  })

  it('beats the centroid at its own objective, which is the point of it', () => {
    const pts = [at(0, 0), at(1, 0), at(0, 1), at(1, 1), at(40, 40)]
    const median = geometricMedian(pts)
    expect(totalDistance(median, pts)).toBeLessThan(totalDistance(centroid(pts), pts))
  })

  it('is no worse than any nearby point', () => {
    // A direct check of the optimality claim: nudge the answer in sixteen
    // directions and confirm every one is worse.
    const pts = [at(0, 0), at(3, 1), at(1, 5), at(-2, 2), at(4, -3)]
    const median = geometricMedian(pts)
    const best = totalDistance(median, pts)
    for (let i = 0; i < 16; i++) {
      const theta = (i / 16) * 2 * Math.PI
      const nudged = { x: median.x + 0.05 * Math.cos(theta), y: median.y + 0.05 * Math.sin(theta) }
      expect(totalDistance(nudged, pts)).toBeGreaterThanOrEqual(best - 1e-9)
    }
  })

  it('handles a weighted point as several people at one address', () => {
    // Three people at the origin outweigh one at (10, 0), so the answer is the
    // origin — not the weighted mean at 2.5. Along a segment the objective is
    // linear, so even a one-vote majority takes the whole thing.
    near(geometricMedian([at(0, 0, 3), at(10, 0, 1)]), { x: 0, y: 0 }, 6)
    near(geometricMedian([at(0, 0, 2), at(10, 0, 1)]), { x: 0, y: 0 }, 6)
    near(geometricMedian([at(0, 0, 1), at(10, 0, 2)]), { x: 10, y: 0 }, 6)
    // Only an exact tie leaves the segment undecided; the midpoint represents it.
    near(geometricMedian([at(0, 0, 2), at(10, 0, 2)]), { x: 5, y: 0 }, 6)
  })

  it('degrades gracefully', () => {
    expect(geometricMedian([])).toEqual({ x: 0, y: 0 })
    near(geometricMedian([at(7, 9)]), { x: 7, y: 9 })
    // Every point on the segment ties for two points; the midpoint is the
    // least surprising member of that tie.
    near(geometricMedian([at(0, 0), at(10, 0)]), { x: 5, y: 0 })
  })

  it('ignores a point nobody is travelling from', () => {
    near(geometricMedian([at(0, 0), at(1, 0), at(2, 0), at(900, 900, 0)]), { x: 1, y: 0 }, 3)
  })
})

describe('smallestEnclosingCircle', () => {
  it('spans two points on their midpoint', () => {
    const c = smallestEnclosingCircle([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    near(c.center, { x: 5, y: 0 })
    expect(c.radius).toBeCloseTo(5, 9)
  })

  it('circumscribes a triangle', () => {
    // Right triangle with legs 3 and 4: the hypotenuse is a diameter, so the
    // center is its midpoint and the radius is 2.5.
    const c = smallestEnclosingCircle([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }])
    near(c.center, { x: 1.5, y: 2 })
    expect(c.radius).toBeCloseTo(2.5, 9)
  })

  it('finds the center of a square at half its diagonal', () => {
    const c = smallestEnclosingCircle([
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }, { x: 4, y: 4 },
    ])
    near(c.center, { x: 2, y: 2 })
    expect(c.radius).toBeCloseTo(Math.SQRT2 * 2, 9)
  })

  it('ignores points already inside', () => {
    const hull = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]
    const bare = smallestEnclosingCircle(hull)
    const stuffed = smallestEnclosingCircle([...hull, { x: 5, y: 3 }, { x: 4, y: 2 }, { x: 6, y: 4 }])
    near(stuffed.center, bare.center, 6)
    expect(stuffed.radius).toBeCloseTo(bare.radius, 6)
  })

  it('encloses everything it was given', () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({
      x: Math.cos(i * 2.399963) * (10 + (i % 7)),
      y: Math.sin(i * 2.399963) * (10 + (i % 7)),
    }))
    const c = smallestEnclosingCircle(pts)
    for (const p of pts) {
      expect(Math.hypot(p.x - c.center.x, p.y - c.center.y)).toBeLessThanOrEqual(c.radius + 1e-9)
    }
  })

  it('handles collinear points, which have no circumcircle', () => {
    const c = smallestEnclosingCircle([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }])
    near(c.center, { x: 5, y: 0 })
    expect(c.radius).toBeCloseTo(5, 9)
  })

  it('gives the same answer every run, whatever the input order', () => {
    const pts = [{ x: 1, y: 7 }, { x: -3, y: 2 }, { x: 8, y: 0 }, { x: 4, y: -6 }, { x: 0, y: 0 }]
    const a = smallestEnclosingCircle(pts)
    const b = smallestEnclosingCircle([...pts].reverse())
    near(a.center, b.center, 6)
    expect(a.radius).toBeCloseTo(b.radius, 6)
  })

  it('minimizes the worst distance, which the median does not', () => {
    // Four points clustered and one far out. The circle center sits between
    // them; the median sits in the cluster and leaves the outlier stranded.
    const pts = [at(0, 0), at(1, 0), at(0, 1), at(1, 1), at(40, 0)]
    const circle = smallestEnclosingCircle(pts)
    const median = geometricMedian(pts)
    const worst = (c: PlanePoint) => Math.max(...pts.map(p => Math.hypot(p.x - c.x, p.y - c.y)))
    expect(worst(circle.center)).toBeLessThan(worst(median))
    // And the trade runs the other way on total distance, as it must.
    expect(totalDistance(median, pts)).toBeLessThan(totalDistance(circle.center, pts))
  })

  it('is a point for no points and for one', () => {
    expect(smallestEnclosingCircle([])).toEqual({ center: { x: 0, y: 0 }, radius: 0 })
    const one = smallestEnclosingCircle([{ x: 3, y: 4 }])
    near(one.center, { x: 3, y: 4 })
    expect(one.radius).toBe(0)
  })
})
