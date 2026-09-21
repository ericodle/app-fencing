# Roadmap

What is not built, what is deliberately not going to be, and what a second pass
should pick up first.

## Not built yet

**Edge functions.** `supabase/functions/` is empty. The app writes everything
through PostgREST under RLS, which covers every flow it currently has. The two
that will eventually want a server-side function are public registration
(creating an account and a booking atomically, with an emailed confirmation) and
a database export for the shutdown path.

**Email.** Nothing sends mail except Supabase Auth's own confirmation and
recovery messages. Booking confirmations and the "your application was approved"
note are currently a coach sending a LINE message.

**Carpool UI.** `vehicles`, `event_rides` and `ride_seats` exist, with their
constraints and the seat-waitlist trigger, and RSVP answers already carry
"I can drive, N seats" and "I need a lift" — the tally surfaces both. What is
missing is the screen that turns those intentions into assignments.

**Bookings UI.** The `bookings` table, its capacity trigger, the waitlist
behavior and the money guard are all in place and tested; the member-facing
register-for-a-course flow is not. Term courses are currently taken by message.

**Payments and passes UI.** Same: the ledger, the pass balance view and the
punch guard are built and tested. The admin screen to take a payment is not.

**Push subscription UI.** The service worker handles `push` and
`notificationclick`, the worker sends, the de-duplication table works. Nothing
in the app yet asks for notification permission or writes a row to
`push_subscriptions`.

**Component tests.** The pure layer is well covered; the React components are
covered by `npm run smoke` rather than by render tests. `BoutForm` and
`MeetupPanel` are the two worth doing first — both carry real logic.

**zh-TW in anger.** The catalog is complete and type-checked, but the app has
only been run in English. Switching `locale.language` will find layout problems.

## Deliberately not planned

**Online card payments.** A club of thirty people taking cash and transfers does
not need a processor, and adding one means PCI scope, refund flows and a
dependency on somebody else's uptime.

**Routing for the meetup planner.** See [meetup.md](meetup.md). Straight lines
and honest labels beat a confident number from a service that has to be paid for
and told where every member lives.

**Realtime.** Poll counts refresh on page load. Thirty people do not need a
websocket to find out that a seventh person said yes.

**A native app.** It is an installable PWA. The things a native wrapper would
add — push, home screen, offline shell — it already has.

## Worth doing next, in order

1. **Push subscription UI.** The whole cron exists and currently sends to
   nobody. This is the largest gap between what is built and what is usable.
2. **The carpool screen.** The data is there and the intentions are being
   collected every week; they just cannot be acted on in the app.
3. **Bookings for courses.** The term intake is the one flow that is still
   entirely manual.
4. **Component tests for `BoutForm` and `MeetupPanel`.**
5. **A club-ladder page** — `eloHistory` is written and tested, and nothing
   renders it.
