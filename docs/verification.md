# Verification record

Implementation date: 2026-10-13. Environment: Windows, Node 26, Next.js 16.4, React 19.3. External services were connected and checked on 2026-10-14.

## Automated evidence

- TypeScript, ESLint, and production build: run locally.
- 33 deterministic Vitest checks: input constraints, exact excerpts, malformed evaluations, unsupported versus contradictory claims, checklist coverage, ownership, session transitions, question limit, early review, failed-call accounting, retry snapshots, provider allowlist, bounded repair, rate-limit handling, no retry after a provider response-body timeout, stable/separate visitor quota identities, rejection of modified cookies, signed-in quota identity, the shared anonymous daily pool, and independent rolling-minute quotas.
- SQL tests execute the migration in PGlite with test auth roles. They check RLS visibility, forbidden writes and RPC calls, transaction rollback, simultaneous reservation requests, actor/app/minute caps, duplicate call slots, cached results, resource contention, and stale operation handling. PGlite queues local queries; deployed multi-connection behavior still needs a hosted check.
- 10 Playwright checks across desktop and mobile Chromium: the actual Next.js fixture sample plus isolated personal-workspace components with intercepted API responses. Includes refresh recovery, all three questions, unsure, notes, review, retry comparison, responsive overflow, keyboard skip link/focus, reduced motion, concept extraction failure, editing/add/remove/source validation, deletion confirmation, interrupted network requests, and idempotency-key reuse.
- Production dependencies: `npm audit --omit=dev` clean. Full audit reports five entries from one unresolved development-only `braces` advisory propagated through the Next ESLint glob dependency chain. The current registry release has no compatible patch.
- Browser screenshots: `artifacts/teaching-room-desktop.png` and `artifacts/teaching-room-mobile.png`.

## Boundaries

The original personal workspace harness is test-only and does not bypass production auth. Its intercepted tests are separate from the live checks below. The generated CI workflow has not run on a remote CI host.

## Live service checks — 2026-10-14

- Supabase project is reachable; all five migration tables exist. The configured publishable and secret keys authenticate successfully. Anonymous direct reads of session data are denied.
- Two temporary, preconfirmed test users signed in through the app's password endpoint. Saving a topic and attempt, reloading the library, and deleting the topic succeeded. Deletion cascaded to the attempt. The second account could neither read the topic through RLS nor start it through the app. Temporary users and their test data were removed. See `artifacts/live-auth-smoke.json`.
- A production-build browser test completed the real anonymous Explain → Question → Review flow with the configured OpenRouter model. All six concepts were reviewed with zero quotation warnings. Reload restored the review; an unrelated visitor received HTTP 404 for the attempt. No browser page errors occurred. See `artifacts/live-smoke.json` and `artifacts/live-review-desktop.png`.
- Initial live reviews exceeded the body-read deadline or failed semantic validation. Optional model reasoning is now disabled, review status/claim-type instructions are explicit, and body timeouts no longer trigger schema-repair retries. A diagnostic response with reasoning disabled reported zero provider cost. The final end-to-end browser check passed after these changes.
- The OpenRouter key endpoint confirmed a 1,000-request free daily allowance; the local app cap is 900. Every live application model attempt reserves database quota before the call.
- Keys are stored only in ignored `.env.local`; the server secret is not exposed through a `NEXT_PUBLIC_` variable.
- The live sample repeatedly reloaded under the Turbopack development server on this Windows setup. The same page remained usable under Webpack development mode and the production build, with no browser page errors. `npm run dev` now selects Webpack; production build settings are unchanged.

The configured signed-in daily limit is now 100 AI calls; each anonymous browser visitor has a separate 10-call daily limit. Anonymous quotas use the signed visitor cookie instead of an IP or shared bucket. Migration `002_anonymous_daily_pool.sql` adds a shared 100-call daily pool for all anonymous AI calls. SQL tests confirm a new visitor cookie cannot bypass the shared cap, signed-in calls and session starts do not consume it, legacy anonymous usage counts, and the pool resets at midnight UTC. The user confirmed successful execution of migration 002 in Supabase on 2026-10-15. The hosted pool was not deliberately exhausted during verification.

Still unverified: signup email delivery and verification callback settings, expired-token refresh, deployed multi-connection quota contention, and deployment-host timeout behavior. The temporary confirmed-user checks do not prove email delivery. Follow README.md for email and deployment configuration.

Migration 003 changes the AI rolling-minute quota to each actor, configured by PERSONAL_MINUTE_LIMIT=10, retaining daily caps and shared session-start protection. Hosted application of migration 003 is pending.

## Production sharing and SEO - 2026-10-15

Deployed to https://teech-nu.vercel.app (deployment dpl_4q5Q28uxHoLNwN2zyFgeB1bpyudF). Local ESLint, TypeScript, and production build passed; the Vercel production build passed. Live checks using a TelegramBot user agent confirmed homepage/sample canonical URLs, Open Graph URLs, large Twitter cards, and publicly reachable 1200x630 PNG images. robots.txt and the two-page sitemap return 200 with the production origin. Sign-in returns noindex/nofollow; library, topic creation, and teaching layouts also declare noindex/nofollow. Private routes are excluded from the sitemap. The sharing card was visually inspected. Evidence: artifacts/vercel-seo-verification.json and artifacts/social-card.png. Existing messaging previews may remain cached; an actual Telegram preview refresh was not tested.
