// A real browser walk through the app, against the live local stack.
//
// Not a test suite and not trying to be: it signs in as each role, visits every
// page, and fails if the console produced an error. That catches the one class
// of break nothing else here does — a page that type-checks, passes its unit
// tests, and renders blank because a query came back in a shape the component
// did not expect.
//
//   npm run db:start && npm run dev    (in another terminal)
//   npm run smoke
//
// Screenshots land in ./screenshots, which is gitignored: they are for looking
// at, not for diffing.
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const OUT = process.argv[2] ?? 'screenshots'
await mkdir(OUT, { recursive: true })
const errors = []
// Playwright's own download is often absent on a dev machine; the system
// browser is there and is what the club will actually use.
const browser = await chromium.launch(
  process.env.CHROME_PATH || process.platform === 'linux'
    ? { executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' }
    : {},
)
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } })

page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))

// Wait for the page to have finished its own work, not just the network's.
//
// `networkidle` fires when requests stop, which on a page that queries in two
// rounds is while the first spinner is still on screen — so a screenshot taken
// then shows a spinner and looks like a broken page to whoever reads it later.
// Every page here drops its spinner once it has something to draw, so waiting
// for the spinner to go is the honest signal.
async function settled() {
  await page.waitForLoadState('networkidle')
  await page.locator('[role="status"]').first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {})   // pages with no spinner at all never had one to lose
  await page.waitForTimeout(250)
}

async function shot(name) {
  await settled()
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`  shot ${name}`)
}

console.log('login page')
await page.goto('http://localhost:5373/login', { waitUntil: 'networkidle' })
await shot('01-login')

console.log('sign in as admin')
await page.getByRole('button', { name: 'Admin' }).click()
await page.waitForURL('**/dashboard', { timeout: 15000 })
await page.waitForLoadState('networkidle')
await shot('02-dashboard')

console.log('calendar')
await page.goto('http://localhost:5373/calendar', { waitUntil: 'networkidle' })
await shot('03-calendar')

console.log('the cross-training session, with poll + planner')
// Find the park conditioning event by its title in the month list.
await page.getByRole('link', { name: /Park conditioning/ }).first().click()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1200)
await shot('04-event-poll-meetup')

console.log('roster')
await page.goto('http://localhost:5373/roster', { waitUntil: 'networkidle' })
await shot('05-roster')

console.log('manage → attendance')
await page.goto('http://localhost:5373/manage', { waitUntil: 'networkidle' })
await shot('06-manage')
await page.goto('http://localhost:5373/manage/attendance', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await shot('07-manage-attendance')

console.log('sign in as the fencer, for bouts and profile')
await page.goto('http://localhost:5373/login')
await page.evaluate(() => { localStorage.clear() })
await page.goto('http://localhost:5373/login', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Fencer' }).click()
await page.waitForURL('**/dashboard', { timeout: 15000 })
await page.goto('http://localhost:5373/records/bouts', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await shot('08-bouts')
await page.goto('http://localhost:5373/records/results', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await shot('09-results')
await page.goto('http://localhost:5373/profile', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await shot('10-profile')

await browser.close()

if (errors.length) {
  console.log('\nBROWSER ERRORS:')
  for (const e of [...new Set(errors)]) console.log('  ' + e)
  process.exit(1)
}
console.log('\nno browser errors')
