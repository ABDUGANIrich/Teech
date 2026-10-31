# Keenable free-allowance controls — verification

Verified and deployed on 31 October 2026 (Asia/Tashkent).

Production: https://teech-nu.vercel.app

Deployment: `dpl_2PfpKUBZMGdC81rouVM8KHoYkvYR`, READY, production alias assigned. The checked local source was uploaded to the existing `teech` project in `abduganirichs-projects`. This includes the selected OpenRouter temperature 0.1 / reasoning none configuration. No commit was created.

## Provider facts

- Authenticated usage includes 100,000 free requests per organization per month and a 10-request/second organization limit, without an hourly cap.
- Pro is a retrieval mode and can consume the free allowance. Current search usage costs one credit per call.
- The free balance resets on the organization's creation-day anniversary. The account's exact reset date and current remaining balance were not obtained.
- With the free allowance spent and no purchased credits, the provider returns 402. Billing settings and automatic top-ups were not modified.

Sources checked: [rate limits](https://docs.keenable.ai/rate-limits), [credits](https://docs.keenable.ai/credits), [pricing and reset details](https://keenable.ai/pricing).

## Implementation

`20261031111719_keenable_free_limits.sql` was generated with the Supabase CLI and applied to the hosted Teech project `sqdvsglgzzzlrvcnkksq` through the migration connector. It adds private usage/guard tables and service-role-only, security-invoker functions. RLS is enabled; browser roles have no table or function grants.

Every search reserves its own attempt atomically under a shared PostgreSQL lock. Caps are 10 attempts per rolling second and 100,000 attempts per rolling 31 days. The 31-day window is intentionally more conservative than a guessed billing-month reset. Failed, cancelled and interrupted attempts retain reservations. Reservations are separate from OpenRouter usage and cannot reset on process restart or deployment. History older than 32 days is pruned during admission.

Provider 429 responses establish a shared Retry-After pause; 402 establishes a one-hour pause before a later explicit action may try again. Searches are not automatically retried. Paid or unexpected/missing billing metadata establishes a persistent pause requiring administrator review. Missing quota storage prevents a search. The billing guard reads the response after the provider call, so it cannot undo a paid call or independently prohibit purchased-credit spending on the provider's side. Keeping purchased credits and auto top-up disabled remains the provider-side spending boundary.

Requests remain authenticated, in Pro mode, with three results requested and existing per-action/session/source/text/timeout caps. Saved evidence is reused. Billing metadata is not sent to the model or returned to the learner. No keyless fallback, credit purchase or billing-account change was added.

## Verification results

- Full Vitest suite: **14 files / 141 tests passed**.
- ESLint, TypeScript and local production build passed; final production deployment build also reached READY. Focused tests/lint passed after the final null-response safeguard.
- Actual PostgreSQL tests cover the 100,000-attempt boundary, retention across a calendar-month change, rolling-second admission, duplicate reservations, no refunds on failed attempts, provider cooldowns, persistent billing pause and denied browser access.
- Integration tests confirm no search occurs after shared denial or database admission failure, and invalid/missing/paid usage does not reach the model. Retry-After seconds and HTTP dates are covered.
- A hosted transaction admitted exactly ten of twelve synthetic reservations and enforced a billing pause; all synthetic changes were rolled back. Hosted permission checks confirmed browser denial and service-role access, with security-invoker functions.
- One real search through the actual application search function, hosted quota RPCs and configured Keenable key returned HTTP 200, three retained sources and `usage: {"sku":"search.pro","amount":1,"credits":1,"paid":false}`. No OpenRouter inference or learner-state write was needed for this probe.
- The final hosted ledger contained one search marked free, one recorded free credit, and no active pause. This is the newly introduced Teech ledger, **not** a claim that the organization's monthly remaining allowance is 99,999.
- Production `/`, `/teacher-sample` and `/signin` returned 200; unauthenticated `/api/learn` returned 401 after the final deployment.
- The production Keenable key is configured. Deployment input inspection confirmed `.env.local` was excluded; the changed source/docs/test files contained no configured credential values.
- Supabase advisors reported the expected RLS-without-client-policy informational notices on the private tables. The existing Auth leaked-password-protection warning remained unchanged; no additional warning-level database issue was introduced.

The real search check exercised the server function against the hosted database and provider. It did not run a signed-in browser course end to end. Other applications and usage before this ledger was installed remain outside its accounting; the provider's organization balance stays authoritative.
