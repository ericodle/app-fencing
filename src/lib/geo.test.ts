import { describe, it, expect } from 'vitest'
import {
  haversineKm, projectionFor, project, unproject, planeIsSafe,
  MAX_SAFE_PLANE_SPAN_KM, EARTH_RADIUS_KM,
} from './geo'

// Reference points around Taipei, where this club actually is.
const TAIPEI_101      = { lat: 25.0339, lng: 121.5645 }
const TAIPEI_MAIN     = { lat: 25.0478, lng: 121.5170 }
const TAMSUI          = { lat: 25.1677, lng: 121.4406 }

describe('haversineKm', () => {
  it('is zero for a point against itself', () => {
    expect(haversineKm(TAIPEI_101, TAIPEI_101)).toBe(0)
  })

  it('measures a degree of latitude as a degree of latitude', () => {
    // One degree of latitude is 2πR/360 anywhere on the sphere.
    const expected = (2 * Math.PI * EARTH_RADIUS_KM) / 360
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(expected, 6)
    expect(haversineKm({ lat: 50, lng: 30 }, { lat: 51, lng: 30 })).toBeCloseTo(expected, 6)
  })

  it('shrinks a degree of longitude by cos(latitude)', () => {
    const atEquator = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    const atTaipei  = haversineKm({ lat: 25, lng: 0 }, { lat: 25, lng: 1 })
    expect(atTaipei / atEquator).toBeCloseTo(Math.cos((25 * Math.PI) / 180), 4)
  })

  it('agrees with the known distance across Taipei', () => {
    // Taipei 101 to Taipei Main Station is a little under 5 km as the crow flies.
    expect(haversineKm(TAIPEI_101, TAIPEI_MAIN)).toBeGreaterThan(4.5)
    expect(haversineKm(TAIPEI_101, TAIPEI_MAIN)).toBeLessThan(5.2)
    // Taipei 101 to Tamsui is about 20 km.
    expect(haversineKm(TAIPEI_101, TAMSUI)).toBeGreaterThan(19)
    expect(haversineKm(TAIPEI_101, TAMSUI)).toBeLessThan(21)
  })

  it('is symmetric', () => {
    expect(haversineKm(TAIPEI_101, TAMSUI)).toBeCloseTo(haversineKm(TAMSUI, TAIPEI_101), 12)
  })

  it('keeps its precision at short range, where the law of cosines would not', () => {
    // Ten meters. The spherical law of cosines loses most of its significant
    // figures here; haversine does not, which is why it is the one used.
    const a = { lat: 25.0339, lng: 121.5645 }
    const b = { lat: 25.03399, lng: 121.5645 }
    expect(haversineKm(a, b)).toBeCloseTo(0.01001, 4)
  })

  it('takes the short way around the antimeridian', () => {
    const km = haversineKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })
    expect(km).toBeLessThan(25)
  })
})

describe('the tangent plane', () => {
  const cluster = [TAIPEI_101, TAIPEI_MAIN, TAMSUI]

  it('round-trips a point through projection unchanged', () => {
    const proj = projectionFor(cluster)
    for (const p of cluster) {
      const back = unproject(project(p, proj), proj)
      expect(back.lat).toBeCloseTo(p.lat, 9)
      expect(back.lng).toBeCloseTo(p.lng, 9)
    }
  })

  it('preserves distances across a city to a couple of meters', () => {
    // 20 km across Taipei comes back about 1.2 m long — 0.006% — which is a
    // rounding error next to "meet at the north exit".
    const proj = projectionFor(cluster)
    const a = project(TAIPEI_101, proj)
    const b = project(TAMSUI, proj)
    const planar = Math.hypot(a.x - b.x, a.y - b.y)
    const great  = haversineKm(TAIPEI_101, TAMSUI)
    expect(Math.abs(planar - great)).toBeLessThan(0.005)
    expect(Math.abs(planar - great) / great).toBeLessThan(1e-4)
  })

  it('centers itself on the points it was built for', () => {
    const proj = projectionFor([{ lat: 10, lng: 20 }, { lat: 12, lng: 22 }])
    expect(proj.lat0).toBeCloseTo(11, 9)
    expect(proj.lng0).toBeCloseTo(21, 9)
    expect(project({ lat: 11, lng: 21 }, proj)).toEqual({ x: 0, y: 0 })
  })

  it('averages longitude as a direction, not as a number', () => {
    // Straddling the antimeridian. A naive mean of 179 and -179 is 0, which is
    // in Africa; the right answer is 180.
    const proj = projectionFor([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }])
    expect(Math.abs(proj.lng0)).toBeCloseTo(180, 6)
    expect(proj.spanKm).toBeLessThan(120)
  })

  it('reports a span that a caller can refuse', () => {
    const local = projectionFor(cluster)
    expect(local.spanKm).toBeLessThan(15)
    expect(planeIsSafe(local)).toBe(true)

    const global = projectionFor([{ lat: 25, lng: 121 }, { lat: 51, lng: 0 }])
    expect(global.spanKm).toBeGreaterThan(MAX_SAFE_PLANE_SPAN_KM)
    expect(planeIsSafe(global)).toBe(false)
  })

  it('has no span and no center when given nothing', () => {
    const proj = projectionFor([])
    expect(proj.spanKm).toBe(0)
    expect(planeIsSafe(proj)).toBe(true)
  })
})
