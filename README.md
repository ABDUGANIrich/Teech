# Teech

## Teacher mode — Learn it. Practice it. Teach it.

Two entry points share the existing account and AI allowance:

- **Learn with a teacher** (`/learn/new`): start with a topic or pasted notes, review the interpretation, prerequisites and exclusions, explicitly generate/revise a plan, then accept it. The accepted plan is frozen. Existing library topics can prefill notes.
- **Teach Pip** (`/new`): the existing source-required checklist and Student experience remain available. Saved attempts and comparison rules are unchanged.

A lesson has 1–3 on-demand units, usually targeting about 15 minutes (an estimate). Each has structured instruction, definitions, a worked example, a concept check and an application problem. Saved units do not regenerate on refresh. Learners may use two clarification requests across the session, two cached hints per item, solution reveal, an unsure response, or a dispute. Answers are frozen after submission; revealing a solution permanently labels the item as worked review. Questions need not be answered correctly, or at all, to continue. Early-ended sessions can resume their next unfinished unit.

The stored summary separates independent correct, assisted, unattempted, uncertain and disputed results by objective. First and fresh practice attempts remain separate. One additional practice pair can target an unresolved objective; failed generation can be explicitly retried for that same objective, subject to the session cap. There is no mastery percentage or improvement claim across uncalibrated questions.

Try `/teacher-sample` without credentials for a **fixed demonstration** of instruction, help, hints, local MCQ checking, illustrative open-answer feedback, summary and handoff preview. Open visitor text is **not assessed** in that sample. `/sample` remains the existing Student sample. Personal routes require sign-in, declare noindex/nofollow, and are absent from the sitemap.

### Storage, migration and deployment

Apply `supabase/migrations/004_teacher_mode.sql` **after 001–003**, using the Supabase SQL editor or the project's normal migration process. It adds:

- `learning_sessions`: owned, versioned public lesson state, immutable accepted/input snapshots, submitted answers, released assistance, results, recent events, handoff links and a lifetime provider-attempt counter.
- `learning_assessments`: unreleased keys, choice feedback, expected answers, rubrics, hints and solutions. Browser roles have **no SELECT or write grants**, including for the owner. RLS alone is not the security boundary. These fields never enter personal page props, API DTOs, local drafts or operation responses before authorized release.
- Three service-role-only RPCs for version-checked checkpoints/final commits, transactional teacher/shared quota reservation, and deletion. Topics gain nullable lesson/provenance fields. Existing applied migrations are unchanged.

All mutations use actor-bound operation keys, input hashes, the existing resource lock, and expected state versions. Application answers are committed as pending before network grading; final feedback and the operation result commit atomically. An interrupted operation is terminalized by the existing 150-second recovery rule, never automatically reissued to the provider. The learner may explicitly retry assessment of the saved original answer. On uncertain commits the UI reloads authoritative state; no unpersisted success is claimed. The recent event trail is bounded to 180 entries; durable snapshots retain the full learning/answer/assistance state.

After every unit is completed, **Teach this to Pip** previews a bounded frozen source assembled from studied instruction (including saved clarifications), excluding quiz prompts/keys, rubrics, solutions and learner answers. Extraction supports an explicit insufficient-material result instead of manufacturing four concepts. The learner reviews/edits a compatible 4–8-concept checklist with exact excerpts, then one transaction creates a topic and a normal notes-hidden teaching attempt and records the links. Replays and fresh keys cannot create another handoff. A generated or notes-adapted source keeps its provenance in the topic and teaching review; teaching comparisons still use compatible source/checklist snapshots, never quiz scores.

Deleting a learning session removes its public/private state and associated operation snapshots while retaining derived teaching records and their immutable study source; navigation links to the deleted lesson are cleared. Deleting a derived teaching topic follows existing topic/attempt deletion behavior and clears the learning session's foreign-key links; it does not delete the lesson or permit another handoff. Local answer/request drafts are scoped by account/session/item and cleared through sign-out and lesson deletion. Operation caches contain sensitive user output: keep the existing suggested 30-day completed-cache retention and explicitly remove actor caches during account administration. Account deletion cascades lesson and assessment rows. Active operations must not be purged. No background retention worker is installed.

No new environment variables or model allowances are introduced. Each teacher primary/repair attempt reserves the existing personal rolling-minute and daily actor/app budgets. The normal three-unit path is 7 primary calls (plan + 3 units + 3 application assessments); two clarifications and targeted generation/assessment bring it to 11, or up to 22 with one schema repair per logical call. A **22-attempt lifetime lesson cap** includes failed calls, revisions and explicit retries; it is not a completion guarantee. Shared daily capacity may run out sooner. Hints, solutions, MCQ checking, navigation, resume and summary use no model calls. The derived teaching extraction has at most two explicit attempts (each with at most one repair), uses the shared budgets, and is separate from the teacher lifetime cap. Unit output is bounded at 6,500 tokens, plans/help at 2,200, application grading at 1,600; Student budgets and system instructions are preserved. No automatic future-unit generation, paid fallback, or transport retry is used.

The feature is **not deployed by this implementation task**. Apply migration 004 (and any pending predecessor) to hosted Supabase, deploy the reviewed Next.js changes with the existing environment, and run the live two-account smoke described below before treating it as operational. A local build or deterministic test is not a live deployment.

### Content and grading limits

Notes-based plans, units and clarifications are instructed to stay within the supplied material and require exact supporting excerpts. Missing coverage is reported; switching to general knowledge requires an explicit notes-free plan request before acceptance. Topic-only lessons use model knowledge, are labeled AI-generated and not independently source-verified, and must not invent citations or claim browsing. Current facts or unavailable documents require material from the learner. Exact quotation checks establish text provenance, **not factual or semantic correctness**. Generation can still contain mistakes, poorly scoped questions or faulty answer keys. MCQ feedback means agreement with the generated key; open grading can be wrong or uncertain and allows alternative reasoning. Disputes are excluded, not automatically decided for the learner. No mandatory model self-verification call or accuracy benchmark is claimed.

V1 excludes voice, uploads/OCR, browsing, code execution, integrations, classroom roles, payments, notifications, leaderboards and full courses. Code is illustrative; math is bounded plain notation. All content is rendered as text/structured blocks without raw generated HTML.

### Teacher verification

Use the existing commands below. Teacher domain/provider tests use deterministic fixtures; teacher service tests execute **all four real migrations in embedded PostgreSQL** with deterministic AI doubles. They cover the complete notes-free path, durable pending answers, failed grading recovery, concurrent clicks, stale versions, key conflicts, bounded help/adaptation, assistance/reveal replay, private-table permissions, account isolation, shared/lifetime quotas, handoff atomicity and deletion. Provider tests exercise the real shared transport against mocked catalog/completion responses, including invalid quotations, schema repair, unknown item IDs, uncertainty, timeouts and narrow-source rejection.

Playwright runs the actual public fixed sample and personal components in the existing isolated Vite harness with intercepted APIs. These are **not live Auth/database/provider proof**. Use `npm run test:e2e -- --workers=4` on this Windows checkout. The installed Next development metadata loader has an apostrophe-path compilation issue when requesting `sitemap.xml`; crawler checks should use the production build (`npm run build`, then `npm start`) rather than that development endpoint. The production build is not affected in the verified run.

After hosted migration/deployment, use two temporary confirmed accounts for a small live smoke: topic-only planning/acceptance, unit generation, one application assessment, refresh/reopen and version conflict; confirm the second account cannot read/mutate the lesson and **both** authenticated database clients are denied `learning_assessments` SELECT. Check persisted provider reservations against the session counter, exercise notes provenance and handoff, then delete the test lesson/accounts and their operation caches (usage reservations remain counted). This is a smoke test, not an accuracy benchmark. Do not use fixture content as a live fallback.

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

Postgres advisory transaction locks serialize quota reservations before every provider attempt. The initial call and the one permitted schema-repair call consume separate reservations. Failures consume reservations conservatively. Topic extraction is one logical call per exact title/material pair; editing checklist entries needs no AI. Sessions permit at most three question-generation steps. Each review request allows at most one repair for malformed/invalid output. A failed review can be retried manually on the same transcript using a new operation key, with every provider call charged against the existing quotas. Replaying an operation key returns its cached result, concurrent actions are serialized, and finishing an already reviewed session returns its saved review without another provider call. HTTP errors/timeouts are not automatically retried.

Operations have actor-bound idempotency keys and input hashes, a unique active resource lock, and transactionally committed state/results. Reusing a key with changed content is rejected. A lost browser response can replay the cached result without another provider call; the room also checks for a saved review after an interrupted submission. An invocation that crashes is marked terminal after 150 seconds; its key never gets a new lease to reissue AI. A provider response lost before commit cannot be recovered, but the user can explicitly request a new review on the same attempt. Local drafts remain available. If a question fails, submitted writing is retained and the question slot is counted; users can finish directly. If evaluation fails, Finish and review can retry without repeating the explanation or answers.

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

Deploy as a **Node Next.js application**, for example on Vercel or a Node host. Static export is unsuitable. Install with `npm ci`, build with `npm run build`, start with `npm start`. Supply the same environment variables at build/runtime. Set `APP_URL` to the exact final HTTPS origin, update Supabase Site URL/redirects/email configuration, then redeploy. The AI route requests a 120-second execution window; verify your host supports it (review calls have an 80-second cap, other model calls have a 40-second cap, and all AI work in a handler shares a 105-second deadline, including early review and repairs). HTTPS is required for secure anonymous cookies in production.

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
