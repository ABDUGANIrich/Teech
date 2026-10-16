Codebase review — 17 October 2026

**Status:** the findings below record the original review. Their fixes and the user-applied migration 004 are verified in the [17 October verification record](C:/Users/Abdug'ani/Projects/Teech/docs/verification.md:3). The fixes are deployed at https://teech-nu.vercel.app.

Reviewed both Teach Pip and Teacher mode: routes, authentication, ownership, database functions, quotas, AI transport and validation, persistence, recovery, and desktop/mobile components. This was a review; no application fixes, hosted migrations, deployments, or live inference were performed.

The main risks are recovery and data preservation. The existing happy paths are well covered, but several combinations of interruption, assistance, reload, and concurrent editing are missing from the regression suite.

1. **High — Interrupted Teacher assessment can block continuation after solution reveal or dispute.**

   An application answer can remain `pending` after a process interruption. Revealing its solution only changes `open` items to `finished`; disputing it leaves its assessment state unchanged. `next` rejects every pending item, while `retry_grade` rejects items with a solution or dispute. The learner therefore cannot use either the normal Continue action or the assessment retry. Ending early remains a workaround, so this does not destroy the lesson, but the advertised recovery path becomes a dead end.

   Evidence: reproduced both branches through the actual Teacher service and migrations in embedded PostgreSQL. See [continuation guard](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/teacher-service.ts:379), [disputes](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/teacher-service.ts:519), [solution reveal](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/teacher-service.ts:552), and [retry eligibility](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/teacher-service.ts:612).

   Suggested fix: let a revealed or disputed item become navigable while preserving its original answer and excluded/worked-review classification. Test a genuinely interrupted pending item through both actions, refresh, and Continue.

2. **High — Teacher mode is blocked by the currently configured hosted schema.**

   Fresh read-only Supabase GET checks with explicit columns and `limit=0` returned `PGRST205` for both `learning_sessions` and `learning_assessments`, and `42703` for the new topic columns. The current Teacher implementation cannot persist lessons against that database. This is an activation blocker for this checkout, not evidence that the previously deployed Student-only app is broken.

   Suggested fix: apply [migration 004](C:/Users/Abdug'ani/Projects/Teech/supabase/migrations/004_teacher_mode.sql) after its prerequisites before releasing Teacher mode. Then verify real planning, generation, grading, handoff, deletion, and two-account isolation. The feature should show an availability message if its schema is unavailable, rather than exposing generic database failures after sign-in. No schema changes were made during this review.

3. **Medium — Unsaved Teacher edits are lost on reload.**

   Plan revision fields live only in `PlanSetup` state. The edited handoff checklist also lives only in component state. Both returned to their saved values after reload in desktop and mobile reproductions. This is inconsistent with the draft protection in the original topic editor and practice answers. Separately, setup opened from an existing topic prefers `prefill` over its persisted draft, so reloading that entry path can hide a previously saved setup draft.

   Evidence: [plan fields](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-room.tsx:545), [handoff checklist](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-summary.tsx:217), and [setup precedence](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-setup.tsx:87).

   Suggested fix: persist these drafts under account/session/source-topic identities, restore them without silently replacing newer server state, and clear them only after a successful save or explicit discard. Include the clarification question draft in the same policy.

4. **Medium — Two topic editors can silently overwrite each other's work.**

   Topic saving has resource serialization, but it has no expected-version check. Each request reads the latest server version and increments it, even when the submitted content came from an older browser snapshot. Two tabs editing version 1 can both succeed; the second replaces the first tab's title and notes without a conflict warning. Checklist version history does not retain the old topic notes.

   Evidence: reproduced through the service with persistence doubles; both saves succeeded and the second stale edit became version 3. See [save payload](C:/Users/Abdug'ani/Projects/Teech/src/components/topic-editor.tsx:130) and [server version assignment](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/service.ts:190).

   Suggested fix: submit the version loaded by the editor and enforce it atomically in the database transaction. On conflict, retain the local draft and offer reload/merge. Teacher mode already uses this general approach.

5. **Medium — Generated unit IDs can collide with the reserved extra-practice ID.**

   A normal plan unit may legally have the ID `targeted`. Extra practice also uses that fixed ID. Assessment packages are keyed by `(session_id, unit_id)`, so a later focused pair cannot be inserted for a lesson that already has a normal unit with that ID. Retrying can spend additional provider allowance on the same structural failure.

   Evidence: reproduced the duplicate assessment-key failure through the real migrations and Teacher service with deterministic generation fixtures. See [ID validation](C:/Users/Abdug'ani/Projects/Teech/src/lib/learning.ts:4), [extra-practice generation](C:/Users/Abdug'ani/Projects/Teech/src/lib/server/teacher-service.ts:441), and [assessment primary key](C:/Users/Abdug'ani/Projects/Teech/supabase/migrations/004_teacher_mode.sql:16).

   Suggested fix: reserve the namespace when validating plans, or use separate internal identifiers for ordinary units and extra practice. Also validate that unit IDs leave room for the required question-ID prefix within the 60-character question-ID limit.

6. **Medium — Successful Teacher recovery still displays a failure message.**

   If a submission commits and its POST response is lost, the room successfully fetches and displays the saved feedback. However, its catch handler sets a connection error before recovery and never clears it. The learner sees both successful feedback and a message instructing them to reload or retry.

   Evidence: desktop/mobile browser reproduction confirmed visible Correct feedback together with the Connection interrupted alert. See [recovery handler](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-room.tsx:183).

   Suggested fix: distinguish definitive action errors from ambiguous transport failures. When the fetched state proves that the intended action committed, replace the failure with a brief recovered-state notice. Do not hide actual saved action failures just because a GET succeeded.

7. **Medium UI/UX — The Teacher sample banner becomes narrow columns on small phones.**

   At 320 pixels, its title, explanation, reset button, and sample link remain four adjacent flex items. Text wraps into tall, narrow columns, and the header's navigation also becomes cramped. There is no document-level horizontal overflow, so the existing overflow assertion passes despite the poor layout. [Screenshot](C:/Users/Abdug'ani/Projects/Teech/artifacts/audit-header-mobile.png).

   Evidence: visual inspection of the browser reproduction. See [banner markup](C:/Users/Abdug'ani/Projects/Teech/src/components/learning-room.tsx:242) and [shared banner CSS](C:/Users/Abdug'ani/Projects/Teech/src/app/globals.css:739).

   Suggested fix: give the Teacher banner a responsive text-and-actions layout, stacking its content on narrow screens. Add visual checks at 320 and 360 pixels; document scroll width alone does not establish readability.

8. **Low — Homepage sample wording does not reflect configured behavior.**

   The homepage describes both samples as fixed, but `/sample` automatically uses live AI when `liveConfigured()` is true. The room's own provider disclosure is present; the entry-point wording is still inconsistent with the behavior and the always-fixed Teacher demonstration.

   Evidence: [homepage copy](C:/Users/Abdug'ani/Projects/Teech/src/app/page.tsx:76) and [sample selection](C:/Users/Abdug'ani/Projects/Teech/src/app/sample/page.tsx:41).

   Suggested fix: label fixed previews and live samples accurately at their entry points. If a deterministic preview is intended to remain publicly available, provide an explicit route or mode for it.

9. **Low — Default browser-test concurrency is unstable on this checkout.**

   `npm run test:e2e` selected eight workers and produced three desktop timeouts, with 39 checks passing. The documented four-worker command passed all 42 checks. This is test-environment sensitivity, not a demonstrated production failure.

   Suggested fix: encode the validated worker setting in [Playwright configuration](C:/Users/Abdug'ani/Projects/Teech/playwright.config.ts:2), with an appropriate CI override, so the default documented command is reliable. Prefer a production server for release smoke checks to reduce development-compilation timing effects.

Other improvements worth prioritizing after the defects:

- Add password reset and confirmation-email resend paths. The current auth form has no self-service route for forgotten passwords or a missing/expired confirmation email.
- Show actionable quota state: distinguish personal daily, app daily, rolling-minute, and provider-capacity failures, with an applicable retry time. The current combined quota message cannot tell the learner whether a one-minute wait can help.
- Return summary records for library/history lists. The current Student list downloads full session snapshots, and topic loading fetches all historical checklists, though the UI needs only current checklists and compact attempt metadata. This grows unnecessarily with a long-lived library.
- Add targeted regression cases for the findings above. The passing suite tests individual assistance and recovery paths, but misses interrupted-assessment combinations, draft reloads, and reserved-ID collisions.

Validation completed:

- Existing Vitest suite: 67/67 passed.
- ESLint and TypeScript: passed before temporary reproduction files were added.
- Production Next.js build: passed.
- Existing Playwright suite: 42/42 passed with four workers; default eight-worker run had the three timeouts described above.
- Additional reproductions: four service cases and eight browser checks passed while asserting the reported current behavior. These were temporary audit tests, not permanent regression tests.
- Production dependency audit: zero reported vulnerabilities from `npm audit --omit=dev`.
- Hosted schema: fresh read-only explicit-column checks confirmed the missing Teacher schema. No private row data was requested or returned.

The reviewed server code keeps provider credentials on the server, gives the model no execution tools, validates structured responses, reserves quota before inference, and separates unreleased assessment keys from public lesson state. The existing local tests exercise ownership and private-table permissions. Those are useful safeguards; this review does not establish hosted Teacher behavior or model grading accuracy, since migration 004 is absent and no live Teacher inference was performed.

Recommended order: repair pending-assessment navigation and draft preservation, add atomic topic version checks and collision-proof unit identities, complete hosted activation and live smoke verification, then address recovery messaging and responsive polish.


