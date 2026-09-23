// ─────────────────────────────────────────────────────────────────────────────
// CLUB CONFIGURATION — the one file a fork edits.
//
// Piste is the open-source club app; this file holds everything that makes a
// clone *this* club. It is intentionally PURE DATA — no imports, no React, no
// import.meta.env — so every runtime that needs it can read it: the browser
// bundle, vite.config.ts, the service worker, the Cloudflare workers, and the
// Deno edge functions.
//
// The shape is validated against `ClubConfig` (src/config/club.ts) at build
// time and by src/config/club.test.ts. See piste.config.example.ts for a blank
// template and docs/forking.md for the update workflow.
//
// `configVersion` pairs with CONFIG_CONTRACT_VERSION in src/config/contract.ts:
// when core changes the contract in a breaking way it bumps that constant and
// the build fails here until this file is migrated.
// ─────────────────────────────────────────────────────────────────────────────

export const clubConfig = {
  configVersion: 1,

  identity: {
    // The open-source app name, shared by every club that runs it.
    appName: 'Piste',
    tagline: 'Physical training. Mental training. Data-driven.',
    clubName: 'Kuou Fencing Club',
    // Short brand name for tight UI (push titles, badges).
    shortName: 'Kuou',
    // The club's name in its own script, shown under the Latin one on the
    // login and contact pages. Blank omits the line entirely.
    nativeName: '古歐擊劍會',
    description: 'Attendance, bouts and competition results for Kuou Fencing Club',
    logoAlt: 'Kuou Fencing Club',
  },

  // No trailing slashes. `urls.app` is what share links are built from, so it
  // has to match the custom domain in wrangler.toml.
  urls: {
    site: 'https://www.kuou.dev',
    app: 'https://app.kuou.dev',
    eventPage: 'https://www.kuou.dev/#calendar',
  },

  locale: {
    timezone: 'Asia/Taipei',
    currency: 'NTD',
    // The one language the whole app renders in. 'en' | 'zh-TW'.
    // `as const` narrows the literal to the SupportedLanguage union.
    language: 'en' as const,
    // Which side of the height / reach toggle opens first. Storage is metric
    // either way; this club is in Taiwan, so metric.
    units: 'metric' as const,
  },

  // Used by the PWA manifest (vite.config.ts) and the index.html theme-color.
  // The component palette lives in src/index.css as @theme tokens — keep the
  // two in sync by hand, they are read by different layers.
  theme: {
    themeColor: '#d4af37',
    backgroundColor: '#0a0a0b',
  },

  assets: {
    // The emblem, rendered from the marketing site's trace (its tools/icons.py).
    logo: '/logo.webp',
    favicon: '/favicon.png',
    icon192: '/icons/icon-192.png',
    icon512: '/icons/icon-512.png',
    appleTouchIcon: '/apple-touch-icon.png',
    og: '/imgs/og.png',
  },

  features: {
    push: true,
    broadcast: true,
    eventSharing: true,
    // Ask the roster who is coming, per session. Drives the meetup planner.
    attendancePolls: true,
    // Suggest where to meet from who actually said yes. Needs attendancePolls.
    meetupPlanner: true,
    // Bout-by-bout scoring at practice.
    boutLog: true,
    // Competition placements, pool sheets and DE records.
    competitionResults: true,
    // The athletic benchmark log (sprint, 5k, lunge, jump, …).
    fitnessTests: true,
    // Who is driving whom to a pop-up venue.
    carpool: true,
  },

  club: {
    // The weapons this club actually fences. Order is the order they appear in
    // every picker. A club that never fences foil drops it here and it vanishes
    // from the profile, the bout form, and the competition form.
    weapons: ['epee', 'saber'] as const,

    // The national rating scale the club records. 'usfa' is the A–E letter
    // classification; 'none' hides the rating fields entirely.
    ratingSystem: 'usfa' as const,

    // Every item a fencer can say they own. An item the club also loans is
    // priced under `loanPrices`; anything left out of that map is owned-only.
    equipmentItems: [
      'Mask', 'Jacket', 'Plastron (underarm protector)', 'Glove', 'Breeches',
      'Chest protector', 'Lamé', 'Fencing shoes',
      'Épée', 'Saber', 'Body cord', 'Mask cord', 'Glove (saber, conductive)',
      'Bag',
    ],
    // What the club loans from the rack, and what it charges per session. The
    // rack is beginner kit: a fencer who owns their own blade pays nothing.
    loanPrices: {
      Mask: 100, Jacket: 100, 'Plastron (underarm protector)': 50, Glove: 50,
      Breeches: 100, 'Chest protector': 50, Lamé: 100, 'Fencing shoes': 100,
      'Épée': 150, Saber: 150, 'Body cord': 50, 'Mask cord': 50,
    },
    // Full kit for a beginner's first term, as a single line item.
    loanKitPrice: 400,

    // Fallback full-payment deadline when an event sets none: N days before.
    paymentDeadlineFallbackDays: 7,
    // How long a session runs, in hours, for the "Add to Google Calendar" link
    // on an event that stores a start time but no end time.
    eventDurationHours: 2,

    // Where the club is based. Seeds the meetup planner's map view and is the
    // fallback origin for a fencer who has set no home area.
    home: { latitude: 25.0478, longitude: 121.5638, label: 'Bade Road venue, Taipei' },
  },

  // The meetup planner: given everyone who said yes to a session, where should
  // they meet? See src/lib/meetup.ts — these are the knobs, the math is there.
  meetup: {
    // How a fencer without a car is assumed to travel, for the time estimates
    // shown next to each candidate. Straight-line km/h, deliberately slow:
    // Taipei's MRT averages ~30 km/h door to door once walking and waiting are
    // counted, and a straight line understates the real path.
    travelSpeedKmh: { walk: 4.5, bike: 13, transit: 18, drive: 24 },
    // Candidate venues further than this from the group's optimum are dropped
    // from the ranking rather than shown as a bad option.
    maxVenueDetourKm: 8,
    // A poll needs at least this many "yes" answers before the planner will
    // name a point. Below it the answer is noise, and the club meets at the
    // regular venue.
    minRespondents: 3,
    // How the default suggestion is chosen:
    //   'total'   — minimize the sum of everyone's travel (geometric median)
    //   'fairest' — minimize the worst single journey (minimax / 1-center)
    // Both are always computed and shown; this picks which one is highlighted.
    objective: 'total' as const,
  },
}
