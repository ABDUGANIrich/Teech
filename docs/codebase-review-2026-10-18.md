Codebase review — 18 October 2026

**Resolution status:** All eight findings below are fixed in this checkout and locally verified. No new migration is required. These changes have not been deployed. See [the verification record](C:/Users/Abdug'ani/Projects/Teech/docs/verification.md:3) and the [fixed mobile header](C:/Users/Abdug'ani/Projects/Teech/artifacts/codebase-review-2026-10-18-fixed-header.png).

Reviewed Student and Teacher flows, API validation, authentication, database operations and permissions, quotas, AI transport and web tools, local drafts, recovery, library navigation, and desktop/mobile presentation. The findings below record the original audit before the fixes: one high priority, five medium priority, and two low priority. The audit itself performed no application fixes, hosted mutations, deployments, email sends, or live AI/search requests.

1. **High — A stale Student tab can attach an answer to the wrong question.**

   Student `answer` requests identify the session but do not identify the question or expected transcript version. If two tabs show question 1, tab A can answer it and advance the saved session to question 2. Tab B's later answer to question 1 is then appended as an answer to question 2. The resource lock prevents simultaneous operations, but does not detect this sequential stale submission. `finish` with a typed answer has the same problem. This can corrupt the transcript used for review and spend AI allowance on the unintended question.

   Evidence: a temporary service reproduction confirmed that an old evaporation answer was accepted immediately after the saved condensation question, then passed to evaluation without a conflict. Teacher mode already checks versions; Student mode does not. See [request schemas](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/service.ts:48), [answer application](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/service.ts:319), and [client submission](C:/Users/Abdug'ani/Projects/Teech/src/components/teaching-room.tsx:183).

   Suggested fix: send a question identifier or expected transcript revision and check it under the session operation lock before accepting either an answer or a finish request containing text. Preserve the local draft and return current state on conflict. Add a two-tab regression.

2. **Medium — Reloading after failed unit preparation silently requests AI again.**

   `UnitPreparation` remembers its automatic attempt and failure only in a component ref/state. After a definite provider failure the page correctly offers an explicit Retry button. A browser refresh or leaving and reopening the lesson resets that memory and automatically requests generation again. Repeated refreshes can therefore consume provider allowance and the 22-attempt lesson budget while the learner is trying to recover saved work. The existing test covers the in-page Reload saved lesson button, which does not unmount this component, and refresh after successful generation; it misses refresh after failure.

   Evidence: desktop and mobile reproductions each counted one automatic failed generation, then a second automatic generation after `page.reload()`, without clicking Retry. See [preparation state/effect](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-room.tsx:72).

   Suggested fix: persist unit preparation status, distinguish an untouched unit from a failed/interrupted attempt, and require an explicit retry for the latter after refresh or re-entry.

3. **Medium — A deleted lesson checkpoint can block creating a new course.**

   After initial planning fails, setup retains the saved lesson ID to support recovery. If that lesson is then deleted from its room, the setup checkpoint survives because it uses a different local-storage prefix. Returning to the same setup entry repeatedly fetches the deleted lesson instead of creating a new one. Changing the topic does not help, and the form offers no way to discard the stale checkpoint. Signing out/clearing browser storage is a workaround; the source-topic-specific setup may also be affected.

   Evidence: desktop/mobile tests restored a checkpoint pointing to an unavailable lesson and confirmed that both the original and an edited topic failed with 404; zero create requests were sent. See [checkpoint restoration](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-setup.tsx:94), [create/recover branch](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-setup.tsx:147), and [deletion cleanup](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-room.tsx:227).

   Suggested fix: remove matching setup checkpoints during lesson deletion, and offer an explicit Start a new course action after a definitive not-found response while retaining the entered fields. Do not discard the checkpoint on transient network/authentication failures.

4. **Medium — Successful fresh practice still leaves the objective labeled Needs another attempt.**

   The objective summary combines original and targeted attempts. Any original wrong/partial answer keeps `unresolved` true forever, even when both fresh questions receive independent Correct results. The display can therefore show two independent correct answers and Needs another attempt together, while the session's one extra practice pair is already used. Keeping original results is appropriate; collapsing them into one permanent unresolved label makes the fresh result hard to interpret.

   Evidence: reproduced through the actual Teacher service and migrations in embedded PostgreSQL. An original wrong MCQ followed by two correct fresh answers produced `independent: 2`, `label: Needs another attempt`, and `targetedUsed: true`. See [objective aggregation](C:/Users/Abdug'ani/Projects/Teech/src/lib/learning.ts:427) and [summary/practice UI](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-summary.tsx:128).

   Suggested fix: present initial and fresh outcomes separately in the objective summary, for example Initial attempt: needs review; Fresh practice: two correct. Preserve both records without implying measured improvement or mastery.

5. **Medium — Saved signed-in sample attempts disappear from library navigation.**

   A signed-in live Student sample is saved to the account with `topic_id: null`. The library receives these attempts, but only renders attempt links inside topic rows after filtering by the topic ID. Such sample attempts have no row and no link, even when returned by the API. An account with only sample attempts instead gets the empty-topic state. The sample pointer/comparison history can still provide limited access, so the records are hidden rather than deleted.

   Evidence: desktop/mobile reproductions supplied a saved sample attempt and confirmed there was no link to it in the library. See [library attempt grouping](C:/Users/Abdug'ani/Projects/Teech/src/components/library.tsx:214) and [sample session topic assignment](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/service.ts:276).

   Suggested fix: add a sample/ungrouped attempts section and include those records in normal history pagination/navigation.

6. **Medium — Topic deletion misses drafts for attempts outside the loaded history page.**

   Local cleanup derives attempt IDs only from the library's loaded `sessions`. The API initially returns 50 attempts across the account. Deleting a topic removes all its server attempts, but browser drafts for older/unloaded attempts are not recognized and remain in local storage. Those drafts may contain private writing, despite the deletion confirmation saying all attempts are permanently removed. Sign-out clears the remaining drafts, but deletion alone does not.

   Evidence: desktop/mobile tests seeded an older attempt draft outside the loaded page, deleted its topic, and confirmed that the draft still existed. This reproduction tests local cleanup; server cascade behavior is separately exercised by the existing database suite. See [cleanup loop](C:/Users/Abdug'ani/Projects/Teech/src/components/library.tsx:93) and [history page limit](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/service.ts:123).

   Suggested fix: associate drafts with their topic when storing them, or obtain all deleted attempt IDs through the authenticated delete operation. Do not make complete cleanup depend on which history pages the learner happened to load.

7. **Low — Explain another way deletes an unsent custom help question.**

   If the learner types a question into Ask about this step, then chooses Explain another way, the app submits its canned question but clears the custom draft after success. Both buttons use the `help` action and the success/recovery handlers unconditionally clear the current question draft. The learner's unsent wording is lost.

   Evidence: reproduced on desktop/mobile; the outgoing request contained the canned question and the typed custom question became empty. See [success cleanup](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-room.tsx:238), [recovery cleanup](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-room.tsx:260), and [help controls](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-room.tsx:529).

   Suggested fix: clear only the draft that was actually submitted, comparing against `values.question` or tracking which help control initiated the action.

8. **Low UI/UX — Mobile header is cramped just above the stacking breakpoint.**

   At 390 pixels the logo and navigation share one row; Teacher sample, Try a sample, and Sign in each wrap onto two lines, and the first navigation label crowds the logo. The improved stacking rule only starts at 380 pixels. There is no horizontal page overflow, so existing overflow tests pass. The Teacher banner and practice controls themselves were readable in this inspection.

   Evidence: inspected a fresh 390-pixel browser screenshot. See [screenshot](C:/Users/Abdug'ani/Projects/Teech/artifacts/codebase-review-2026-10-18-mobile-header.png), [header/nav styles](C:/Users/Abdug'ani/Projects/Teech/src/app/globals.css:1694), and [stacking breakpoint](C:/Users/Abdug'ani/Projects/Teech/src/app/globals.css:2126).

   Suggested fix: move the stacking breakpoint upward or give mobile navigation its own row with sufficient spacing. Check intermediate widths as well as 320/360-pixel screens.

Verification completed:

- ESLint and TypeScript: passed on the original checkout.
- Existing Vitest suite: 103/103 passed, including embedded-PostgreSQL migration/permission checks and deterministic provider/tool tests.
- Production Next.js build and existing Playwright suite: passed; 74/74 desktop/mobile tests.
- Additional temporary reproductions: two service tests and ten desktop/mobile behavioral checks reproduced findings 1–7. Two additional browser checks captured visual evidence. These tests asserted the faulty current behavior to confirm the findings; they were removed after review.
- Production dependency audit: zero reported vulnerabilities from `npm audit --omit=dev`.
- Reviewed the search API shape and model tool-call exchange against current primary provider documentation. The public OpenRouter catalog lists the default free model with zero prompt/completion prices and support for structured outputs, tools, and tool choice. This is catalog metadata, not a successful inference or search test. References: [official Keenable SDK](https://pypi.org/project/keenable/), [OpenRouter tool-calling documentation](https://openrouter.ai/docs/guides/features/tool-calling), and [public model catalog](https://openrouter.ai/api/v1/models).

No additional definite tool protocol defect was established. The reviewed integration keeps keys server-side, validates tool names/arguments, bounds retrievals, checkpoints search attempts, and reserves AI usage for model continuations. Prompt adherence, real provider availability/latency, generated lesson accuracy, hosted configuration, and email delivery were not validated by this local audit. The earlier 17 October findings were checked against their current fixes rather than reported again as unresolved.

Recommended order: protect Student question identity, stop implicit AI retries, recover stale setup checkpoints, then address summary interpretation, saved-attempt navigation, draft cleanup and mobile spacing.

Resolution verification:

- Student answer/typed-finish requests carry an expected transcript position and stale requests cannot append writing or invoke AI. Conflicts retain the unsent writing separately from the current question, including lost-response recovery and refresh.
- Unit generation saves a retry marker before inference. Failed/interrupted preparation remains an explicit retry across refresh/reopening; successful generation clears the marker. Untouched units still prepare automatically.
- Lesson deletion clears matching setup pointers for the current account while preserving inputs and unrelated pointers. A legacy missing checkpoint has an explicit start-new path; 401/503 failures retain it.
- Objective summaries show original and fresh outcomes separately. Signed-in sample attempts are accessible through library links and pagination. Topic deletion returns all owned attempt IDs in bounded query pages for cleanup of unloaded drafts. Canned help preserves unsent custom questions on both success and recovered responses.
- Header navigation has its own row through 520px, checked at 320, 360, 390, 414, 480 and 520 pixels and visually inspected at 390px.
- All **107 Vitest tests** passed, as did ESLint, TypeScript and the production build. All **104 desktop/mobile browser checks** passed across the full run (102 checks) and a focused rerun of the two deletion checks after correcting their storage-seeding fixture. The fixture had repopulated deleted keys on navigation; the application cleanup required no further change. Permanent regressions are in the existing service/domain suites and [october18-fixes.spec.ts](C:/Users/Abdug'ani/Projects/Teech/tests/browser/october18-fixes.spec.ts).
- No hosted mutation, deployment, real email or model/search call was performed for these fixes. Browser account/provider flows use isolated deterministic API fixtures; embedded PostgreSQL tests exercise the existing migrations and durable Teacher checkpoints.
