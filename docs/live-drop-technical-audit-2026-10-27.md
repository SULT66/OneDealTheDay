# Live Drop technical audit — 27 October 2026

Scope: current repository implementation, local build and automated tests. No production database was modified and no live subscriber email was triggered during this audit.

## Changes

- Previous published drops can be removed from the admin schedule and public selection. Their internal attribution records are retained with `deleted_at`; `published=0` prevents subsequent scheduled announcements. Deleted records cannot be republished. A running drop must be ended first. Never-published drafts are deleted as before.
- Amazon picks removed from admin, homepages, its editor and presentation components, API writes, individual outbound routes and nightly link checks. Existing data is retained. The independent Amazon store-directory link remains.
- Live page polling now uses the latest API response instead of the first render's state. A functional regression test changes API state from upcoming to waiting to live to ended and checks the timer intervals.
- Reminder registration rejects a show that already started, instead of promising an email that will never be scheduled.
- Live-now notices skip sold-out drops.
- Ten-minute reminders now include the same product photo and retailer information as the other pre-start emails.
- Email send requests have a 15-second timeout so a stalled provider connection cannot block the minute sweep indefinitely.
- Test-email address validation corrected.
- Admin rows show actual email windows and distinct provider-acceptance counters.
- Added read-only production readiness audit workflow using the repository's existing admin secret. It reads configuration and aggregate counters, prints no credentials or subscriber addresses, and does not send emails or start paid video sessions.

## Actual email schedule in the code

The server runs its mail sweep once a minute while the Node process is running.

| Message | Audience | Eligible window |
| --- | --- | --- |
| Subscription acknowledgement | Address submitted to the general signup form | Attempted immediately, no double-opt-in confirmation |
| Upcoming-show announcement | Active subscribers in the show's market with drop opt-in | More than 1 hour and at most 72 hours before start |
| Day-before reminder | Addresses that pressed Remind me for this show | More than 12 hours and at most 36 hours before start |
| Hour-before reminder | Addresses that pressed Remind me for this show | More than 20 minutes and at most 90 minutes before start |
| Final reminder | Addresses that pressed Remind me for this show | More than 0 minutes and at most 10 minutes before start |
| Live now | General subscribers and show-specific reminders, deduplicated by address | First 4 minutes, only before the show's end and while not sold out |
| Welcome series | Active drop subscribers | Days 1, 3 and 7 after signup |
| After-show email | Nobody | No such implementation |

These are eligibility windows, not exact T−24h/T−1h appointments. Publishing a show inside one hour means the general announcement is skipped. General signup does not itself create show-specific reminders.

## Page and broadcast behavior

- State is derived on the server from start/end time and stock: upcoming, waiting (five minutes before start), live, sold out, ended.
- Drop price and affiliate link are withheld before opening. The affiliate link is only returned while live. A website countdown does not change or reserve the retailer's price or inventory.
- The browser polls every five seconds in waiting/live states, every thirty seconds well before start, and every sixty seconds after end. It ticks displayed seconds between polls.
- Shared Chloe requires Tavus configuration. The admin host console must remain open for scripted presentation and question dispatch; the frontend supplies that control loop.
- Buying through the Live page currently requires an account. A signed-out viewer is sent to signup before the retailer redirect.
- Broadcast cleanup is attempted by the minute scheduler after the event (with a grace period). Actual provider availability and audio/video performance require a live rehearsal.

## Verification limits and remaining operational risks

- Provider acceptance is not confirmed inbox delivery. There is no SendGrid delivery-event webhook or per-message delivery ledger in this implementation. Spam placement cannot be established from source or mocked tests.
- The production readiness workflow cannot run on the new default-branch code until publication is authorized. Current production secrets, DNS checks, admin counters and real mailbox receipt remain unverified in this session.
- Subscription acknowledgement failures are logged; signup remains saved. The acknowledgement has no durable retry queue.
- Welcome-sequence steps are stamped before sending; failed sends are not retried. This is existing behavior, not an assertion of successful delivery.
- Minute scheduling is in-process, not an independent durable scheduler. A stopped/restarting app can miss short mail windows; the overlap guard is process-local.
- Historical show removal preserves its events in analytics; it removes the row from the working schedule rather than rewriting historical totals.
