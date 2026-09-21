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

async function shot(name) {
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

console.log('the pop-up session, with poll + planner')
// Find the park footwork event by its title in the month list.
await page.getByRole('link', { name: /Park footwork/ }).first().click()
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
