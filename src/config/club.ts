import { clubConfig as raw } from '../../piste.config'
import type { SupportedLanguage } from './languages'
import type { Weapon } from './weapons'

export { CONFIG_CONTRACT_VERSION } from './contract'
export { SUPPORTED_LANGUAGES } from './languages'
export type { SupportedLanguage } from './languages'

// Club configuration contract. `piste.config.ts` at the repo root holds the
// values (pure data, no imports, so every runtime can read it — the browser
// bundle, vite.config.ts, the service worker, the Deno edge functions); this
// file is the typed handle the app imports:
//
//   import { clubConfig } from '../config/club'
//
// The `: ClubConfig` annotation at the bottom is what type-checks the fork's
// config: a missing or mistyped field fails the build here. The zod schema
// (club.schema.ts) does the same check at runtime, for the test suite and the
// vite build guard.

export interface ClubIdentity {
  /** The open-source app name, shared by every club, e.g. "Piste". */
  appName: string
  /** Short line printed on the registration PDF. Blank = omit the line. Must
   *  be WinAnsi-encodable (no CJK) — the PDF renders with jsPDF's built-in
   *  helvetica, which has no CJK glyphs. */
  tagline: string
  /** This club's full name, e.g. "Sheshouzuo Fencing Club". */
  clubName: string
  /** Short brand name for tight UI (push titles, badges, the nav lockup). */
  shortName: string
  /** The club's name in its own script, shown beside the Latin one. Blank to
   *  omit — a club with no second script leaves it empty rather than repeating
   *  `clubName`. Never sent to the PDF renderer. */
  nativeName: string
  /** Meta description / PWA description. */
  description: string
  /** Alt text for the logo image. */
  logoAlt: string
}

export interface ClubUrls {
  /** Public marketing site, no trailing slash. */
  site: string
  /** The deployed app origin, no trailing slash. Also the share-link origin. */
  app: string
  /** Where a shared event link points on the public site. `{id}` is replaced
   *  with the event id when the site has per-event pages; a club whose site has
   *  only a calendar anchor leaves the token out and every event shares the
   *  same URL. */
  eventPage: string
}

export interface ClubLocale {
  /** IANA timezone, e.g. "Asia/Taipei". */
  timezone: string
  /** What the club writes on a price, e.g. "NTD". One field, not a code plus a
   *  label: nothing here machine-reads a currency — no Intl currency
   *  formatting, no payment processor — so a second field would only buy the
   *  chance for two screens to name the same money differently. */
  currency: string
  /** The single language the whole app renders in for this deployment. */
  language: SupportedLanguage
  /** Which units the height / reach / distance fields open in. Storage is
   *  always metric (profiles.height_cm, venues in km) — this picks the side of
   *  the toggle a fencer sees first, and they can flip it per browser.
   *  Deliberately separate from `language`: a club can render in English from
   *  a metric country, so the language is no guide to the unit. */
  units: 'metric' | 'imperial'
}

export interface ClubTheme {
  /** PWA manifest + index.html theme-color. */
  themeColor: string
  /** PWA manifest background color (splash). */
  backgroundColor: string
}

export interface ClubAssets {
  logo: string
  favicon: string
  icon192: string
  icon512: string
  appleTouchIcon: string
  og: string
}

export interface ClubFeatures {
  /** Web-push notifications (also gated by VAPID env). */
  push: boolean
  /** Admin broadcast relay (also gated by BROADCAST_WEBHOOK_URL). */
  broadcast: boolean
  /** The share-this-event button on the calendar. */
  eventSharing: boolean
  /** Ask the roster who is coming, per session. */
  attendancePolls: boolean
  /** Suggest where to meet from who said yes. Needs `attendancePolls`: with no
   *  poll there is no set of people to be central to. The config schema
   *  enforces that pairing rather than letting the planner render an empty
   *  state forever. */
  meetupPlanner: boolean
  /** Bout-by-bout scoring at practice. */
  boutLog: boolean
  /** Competition placements, pool sheets and DE records. */
  competitionResults: boolean
  /** The athletic benchmark log. */
  fitnessTests: boolean
  /** Who is driving whom to a venue. */
  carpool: boolean
}

/** A point on the map, with the label a human reads instead of the numbers. */
export interface GeoPoint {
  latitude: number
  longitude: number
  label: string
}

/** How a fencer gets to practice. Sets the speed the planner estimates their
 *  journey with, and whether they can offer seats. */
export const TRAVEL_MODES = ['walk', 'bike', 'transit', 'drive'] as const
export type TravelMode = typeof TRAVEL_MODES[number]

export interface ClubBusiness {
  /** The weapons this club fences, in picker order. */
  weapons: readonly Weapon[]
  /** The national rating scale recorded on a profile. 'none' hides it. */
  ratingSystem: 'usfa' | 'none'
  /** Every equipment item the catalog knows: the profile's "kit I own" list. */
  equipmentItems: string[]
  /** Per-item per-session loan price, in the club currency. Keys are the subset
   *  of `equipmentItems` the club actually loans; an item with no price here
   *  can be owned but never borrowed. */
  loanPrices: Record<string, number>
  /** Flat price for a full loaner kit, rather than item by item. */
  loanKitPrice: number
  /** Fallback full-payment deadline when an event sets none: N days before. */
  paymentDeadlineFallbackDays: number
  /** How long a single-day event runs, in hours, for the "Add to Google
   *  Calendar" link. Events store a start time but not always an end. */
  eventDurationHours: number
  /** Where the club is based. */
  home: GeoPoint
}

export interface ClubMeetup {
  /** Straight-line km/h per travel mode, for the journey estimates shown next
   *  to each candidate point. Deliberately slow: a straight line understates
   *  the real path, so the speed has to absorb the difference. */
  travelSpeedKmh: Record<TravelMode, number>
  /** Candidates further than this from the group's optimum are dropped from
   *  the ranking rather than offered as a bad option. */
  maxVenueDetourKm: number
  /** Below this many "yes" answers the planner declines to name a point. */
  minRespondents: number
  /** Which objective the default suggestion optimizes. Both are computed. */
  objective: 'total' | 'fairest'
}

export interface ClubConfig {
  configVersion: number
  identity: ClubIdentity
  urls: ClubUrls
  locale: ClubLocale
  theme: ClubTheme
  assets: ClubAssets
  features: ClubFeatures
  club: ClubBusiness
  meetup: ClubMeetup
}

// The annotation is the contract check: `piste.config.ts` is plain data, and
// this is where a missing or misspelled field becomes a build error.
export const clubConfig: ClubConfig = raw
