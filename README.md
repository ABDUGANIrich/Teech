# Teech

**Think you understand it? Teach it.** A working study MVP built with Next.js App Router, TypeScript, Tailwind CSS, a shadcn-style Radix Button, Supabase Auth/Postgres, Zod, and server-only OpenRouter calls. Pip is an original SVG student; the water-cycle sample is original bundled material.

## Run locally

Use Node 22.12+ (Node 26 was used for this implementation) and npm. The lockfile pins the installed dependencies.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Development uses Webpack because Turbopack repeatedly reloaded the live sample on the verified Windows setup. Production builds still use Next.js's default bundler.

PowerShell: `Copy-Item .env.example .env.local`. Open http://127.0.0.1:3000. If using that origin, set `APP_URL=http://127.0.0.1:3000`; if using localhost, use `APP_URL=http://localhost:3000`. The mutation origin must match exactly.

With no credentials, `/sample` is an explicitly labeled, browser-local **fixture preview**. Its fixed questions and example statuses do not evaluate the visitor's writing. It supports draft recovery, notes, three questions, unsure answers, early finish, review, retry, and status comparison. Personal routes require a real Supabase account; they do not silently use browser storage as a database.

## Supabase setup

1. Create a Supabase project. Run `supabase/migrations/001_teech.sql`, then `supabase/migrations/002_anonymous_daily_pool.sql`, then `supabase/migrations/003_personal_minute_limit.sql` in its SQL editor, or link the project and apply the migrations with `supabase db push`. For an existing installation, run only the new migration.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the project's publishable key or legacy anon key), and **server-only** `SUPABASE_SERVICE_ROLE_KEY`. Never prefix the service key with `NEXT_PUBLIC_`.
3. In Authentication → Providers, enable email/password. Keep email confirmation enabled. Set the Site URL to your exact `APP_URL`, and allow `APP_URL/auth/confirm` in Redirect URLs, plus your explicit local-development equivalent. Avoid broad production wildcards.
4. In the **Confirm signup** email template, use the server verification endpoint:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
     >Confirm your email</a
   >
   ```

   For local testing, temporarily set Site URL to your local origin, or use a separate development project. The callback also accepts PKCE `code` callbacks. It does not accept arbitrary redirect destinations.

5. Configure custom SMTP for delivery to your intended users. Supabase's default mail service has delivery restrictions and rate limits; consult its dashboard for current limits. Signup confirmation can intentionally conceal whether an email is already registered.
6. Restart the dev server after changing configuration. Create an account, confirm the email, and sign in. The proxy refreshes session cookies, and server handlers verify identity using `getUser()`.

The browser has SELECT-only access to owned topics, owned checklist versions, and owned attempts through RLS. It has no direct write access or access to usage/operation tables. Server mutations verify ownership and commit through service-role-only functions. Attempt transcript messages and evaluation are stored together in `sessions.data` JSONB, with immutable source/checklist snapshots; separate message/evaluation tables would add no value at this scale. Deleting a topic cascades its checklist versions and attempts.

## OpenRouter setup

Set `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `OPENROUTER_ALLOWED_MODELS`. The default is `nvidia/nemotron-3-super-120b-a12b:free`, confirmed in the live official `/api/v1/models` catalog on **2026-10-13** with zero prompt/completion prices and `structured_outputs` support. Indexed web model pages disagreed with the live catalog, so the catalog was used. This is availability metadata, **not a successful inference test**.

The server checks the live model catalog (cached for five minutes), zero prices, and structured-output support before calls. Both the explicit allowlist and `:free` suffix are required. It sends `json_schema`, requires supporting provider parameters, caps prices at zero, and disables provider fallback and optional reasoning. The reasoning setting keeps the response budget available for structured feedback; see [OpenRouter reasoning controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). There is no paid-model fallback, no tools, and no model selection in the UI. If the default disappears, choose a currently available free structured-output model in the official catalog and explicitly update both model variables.

Live integration checks on **2026-10-14** completed a real browser teaching/review session and Supabase sign-in, persistence, and two-account isolation checks. See [the verification record](docs/verification.md) for evidence and remaining email/deployment checks. Current Supabase publishable/secret keys are supported in the existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` variables respectively.

Generate `ANONYMOUS_HASH_SECRET` with at least 32 random characters, for example locally using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it secret. A live sample requires Supabase, OpenRouter, and this secret together. An OpenRouter key alone cannot safely run the live anonymous flow because quotas and session state must be durable.

Official references used:

- [OpenRouter model catalog](https://openrouter.ai/api/v1/models)
- [Structured outputs and supporting endpoints](https://openrouter.ai/docs/guides/features/structured-outputs)
- [Current account and free-model limits](https://openrouter.ai/docs/api_reference/limits)
- [Supabase server-side authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
- Installed Next.js documentation under `node_modules/next/dist/docs` for route handlers, cookies, and proxy.

## Quotas, concurrency, and failures

Defaults: **100 requests per user/day**, **10 requests per anonymous visitor/day**, **100 anonymous requests/day shared across all visitors**, **40 app requests/day**, **10 requests per person in a rolling minute** (`PERSONAL_MINUTE_LIMIT`; signed-in account or anonymous visitor cookie). Daily windows use UTC. If your OpenRouter account actually has the stated 1,000/day allowance, set `APP_DAILY_LIMIT=900` (validated maximum 950). Otherwise leave the safer 40/day setting. Check `GET https://openrouter.ai/api/v1/key` privately using your key; provider usage and limits remain authoritative, including usage outside this app. The AI minute limit is personal; provider-wide rate limits can still apply.

Postgres advisory transaction locks serialize quota reservations before every provider attempt. The initial call and the one permitted schema-repair call consume separate reservations. Failures consume reservations conservatively. A stable logical call slot prevents duplicate provider calls even if the browser sends a new request ID. Topic extraction is one logical call per exact title/material pair; editing checklist entries needs no AI. Sessions permit at most three question-generation steps and one evaluation step, each with at most one repair for malformed/invalid output. HTTP errors/timeouts are not automatically retried.

Operations have actor-bound idempotency keys and input hashes, a unique active resource lock, and transactionally committed state/results. Reusing a key with changed content is rejected. A lost browser response can replay the cached result without another provider call. An invocation that crashes is marked terminal after 150 seconds; it never gets a new lease to reissue AI. A provider response lost before commit cannot be recovered, so start a new attempt. Local drafts remain available, and the UI provides a fresh-attempt action. If a question fails, submitted writing is retained and the question slot is counted; users can finish directly. If evaluation fails after its bounded attempts, start a fresh attempt.

Anonymous ownership and daily quotas use the same signed HttpOnly visitor cookie, retained for 30 days. Each browser visitor receives a separate 10-request daily allowance, including visitors on the same network. Daily counters reset at midnight UTC; the cookie itself does not rotate daily. Clearing cookies, using another browser, or private browsing creates a new visitor and can bypass the per-visitor limit. The shared anonymous pool still caps all anonymous visitors at 100 AI requests per UTC day even when cookies are cleared. It includes failed calls, repair calls, and legacy anonymous usage. Signed-in calls do not consume that pool; all AI calls still count toward the global daily and minute budgets. No client IP header is used for quota identity. New attempts are separately limited to 25 per actor/day, 120 app/minute, and 5,000 app/day; they do not consume the AI budget.

## Product behavior and data handling

- Notes: 80–18,000 characters. Title: 1–100. Initial explanation: 20–6,000. Answers: 1–3,000. Concepts: 4–8, each with an exact 8–1,200-character source passage.
- Concepts are editable before saving. Later edits create a new checklist version. Retries use the previous attempt's snapshot even if the current topic has since changed. Comparisons require matching source checklist snapshots.
- Notes begin hidden. Revealing notes during practice permanently marks that attempt “Practiced with notes.” Opening notes after review does not change that label.
- Initial explanation and follow-up answers are assessed together. “Finish and review” includes a typed answer if one is present. “I'm not sure” is recorded explicitly. A retry goes directly to evaluation.
- Source excerpts must exactly occur in notes. Review quotations must occur in the source or within a single user message. Invalid quotes are omitted with a warning. Model semantic judgments, non-quotation prose, and semantic repetition cannot be guaranteed; source grounding instructions and runtime checks reduce but do not eliminate errors.
- Notes and conversation are encoded as untrusted JSON under a separate system prompt. Models receive no tools or secrets. Source material may itself be incomplete or wrong. No numerical mastery score is invented.
- Drafts persist in local storage, scoped to the user and attempt. On shared devices, sign out using “Sign out & clear local drafts.” Blocked/full local storage produces a notice; the app cannot promise recovery when browser storage is unavailable or cleared. Anonymous preview history retains the last 20 attempts on that device only.
- The app does not log raw notes, transcripts, keys, or raw provider error bodies. Your hosting and provider logging policies still apply. Do not enable request-body logging in production.
- Anonymous live attempts are accessible with the original signed cookie. Signing in does not import them into personal topics.

## Deploy

Deploy as a **Node Next.js application**, for example on Vercel or a Node host. Static export is unsuitable. Install with `npm ci`, build with `npm run build`, start with `npm start`. Supply the same environment variables at build/runtime. Set `APP_URL` to the exact final HTTPS origin, update Supabase Site URL/redirects/email configuration, then redeploy. The AI route requests a 120-second execution window; verify your host supports it (individual model calls have a 40-second cap, and all AI work in a handler shares a 105-second deadline, including early review and repairs). HTTPS is required for secure anonymous cookies in production.

Do not deploy `tests/harness` as a separate public app. It is an isolated local Vite harness with mocked endpoints, not an authentication bypass or production route.

For a small deployment, periodically remove stale anonymous sessions, operation caches, and usage events using the Supabase SQL editor. Retain usage events at least through the current UTC day and all active operations. Operations contain cached user output; do not retain them indefinitely. A suggested retention policy is 7 days for anonymous sessions, 30 days for completed operation results, and 7 days for usage events. No background worker is required by the MVP. Account deletion cascades personal topics and signed-in sessions. Remove completed operation caches for that `user:<id>` actor as part of account administration. Topic deletion also purges its completed session/topic request snapshots; unlinked extraction caches expire under the retention policy.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Run browser tests with the Supabase/OpenRouter variables unset: they deliberately test the missing-configuration path. Playwright starts/reuses Next on port 3000 and a separate test-only Vite component harness on port 4174. Both desktop and mobile Chromium projects cover sample flow, refresh recovery, notes, three questions, unsure answers, review, retry comparison, keyboard focus, reduced motion, wrapping, unconfigured auth, concept editing, deletion confirmation, and interrupted-request recovery. Personal UI checks intercept API calls with deterministic fixtures; they do **not** establish successful Supabase authentication or persistence.

Vitest executes the actual migration in PGlite (embedded PostgreSQL) with test Auth roles. It checks RLS isolation, forbidden browser writes/RPCs, ownership checks, transaction rollback, concurrent quotas, duplicate reservations, and operation crash recovery. This verifies SQL behavior locally; it does not verify a deployed Supabase project or remote connection concurrency. AI tests mock catalog/provider responses and check free-only routing, runtime validation, bounded repair, and quota reservation.

After configuring a real deployment, perform a separate small smoke test: sign up/verify/sign in, create a topic, edit its passages, teach with one question then finish, refresh and reopen, retry, compare, and confirm deletion. Test a second user cannot read the first user's topic through the Data API. Check the provider dashboard against local usage events. **No live inference, email delivery, hosted Auth, or deployed RLS checks were possible without credentials.**

The production dependency audit is clean at implementation time. `npm audit` reports a development-only `braces` advisory propagated through Next's ESLint plugin (`fast-glob`/`micromatch`); the registry has no patched compatible `braces` release. The affected glob input is repository-controlled. Do not downgrade Next just to suppress the report; update the lint dependency chain when a fix is available.
