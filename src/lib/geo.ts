// Geography, kept apart from the planner that uses it.
//
// Everything here is pure and coordinate-only: no config, no database, no React.
// The meetup planner (meetup.ts) is the only caller that matters, but the venue
// list and the map view both need distances too, and none of them should be
// re-deriving the earth's radius.

/** Volumetric mean radius of the earth, in kilometers (IUGG). */
export const EARTH_RADIUS_KM = 6371.0088

export interface LatLng {
  lat: number
  lng: number
}

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/**
 * Great-circle distance in kilometers.
 *
 * The haversine formulation rather than the spherical law of cosines: the
 * latter loses precision catastrophically for short distances — which is every
 * distance this app deals with — because `acos` of a number very close to 1
 * has almost no significant figures left.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ── the local plane ──────────────────────────────────────────────────────────
//
// Both optimizers below are Euclidean: they assume that the straight line
// between two points is a straight line. On a sphere that is false, but over a
// city it is false by an amount nobody can measure with a metro card.
//
// So we project onto a tangent plane centered on the group — an equirectangular
// projection with the longitude axis scaled by cos(lat0) — solve the geometry
// there, and project back. Across Taipei (about 30 km corner to corner) the
// distortion is under 0.01%; the projection is chosen fresh for each group, so
// it stays centered on the points that are actually being optimized.
//
// This does NOT hold for a group spread across a continent. `projectionFor`
// returns the span it was built for so a caller can check, and `planeIsSafe`
// below is the check the planner runs before trusting the answer.

export interface Projection {
  lat0: number
  lng0: number
  /** Longitude scaling at the reference latitude. */
  cosLat0: number
  /** Greatest distance from the reference point to any input, in km. */
  spanKm: number
}

export interface PlanePoint {
  x: number
  y: number
}

/** Build a tangent-plane projection centered on the mean of `points`. */
export function projectionFor(points: readonly LatLng[]): Projection {
  if (points.length === 0) {
    return { lat0: 0, lng0: 0, cosLat0: 1, spanKm: 0 }
  }
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length
  // Longitude is averaged as a unit vector, so a group straddling the
  // antimeridian does not average to the middle of the wrong ocean. Nobody's
  // fencing club does, but the failure would be silent and absurd.
  const sx = points.reduce((s, p) => s + Math.cos(toRad(p.lng)), 0)
  const sy = points.reduce((s, p) => s + Math.sin(toRad(p.lng)), 0)
  const lng0 = toDeg(Math.atan2(sy, sx))

  const origin = { lat: lat0, lng: lng0 }
  const spanKm = points.reduce((m, p) => Math.max(m, haversineKm(origin, p)), 0)
  return { lat0, lng0, cosLat0: Math.cos(toRad(lat0)), spanKm }
}

/** Beyond this span the plane approximation stops being honest. */
export const MAX_SAFE_PLANE_SPAN_KM = 400

export function planeIsSafe(projection: Projection): boolean {
  return projection.spanKm <= MAX_SAFE_PLANE_SPAN_KM
}

export function project(p: LatLng, proj: Projection): PlanePoint {
  // Longitude difference, wrapped into (-180, 180] so a pair straddling the
  // antimeridian comes out as a short hop rather than a trip around the world.
  let dLng = p.lng - proj.lng0
  if (dLng > 180) dLng -= 360
  if (dLng < -180) dLng += 360
  return {
    x: EARTH_RADIUS_KM * toRad(dLng) * proj.cosLat0,
    y: EARTH_RADIUS_KM * toRad(p.lat - proj.lat0),
  }
}

export function unproject(p: PlanePoint, proj: Projection): LatLng {
  const lat = proj.lat0 + toDeg(p.y / EARTH_RADIUS_KM)
  const lng = proj.lng0 + toDeg(p.x / (EARTH_RADIUS_KM * proj.cosLat0))
  return { lat, lng: ((lng + 540) % 360) - 180 }
}

export function planeDistance(a: PlanePoint, b: PlanePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Round to a sane number of decimals for display and storage. */
export function roundKm(km: number): number {
  return Math.round(km * 1000) / 1000
}
