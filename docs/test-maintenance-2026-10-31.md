# Test audit follow-up — 2026-10-31

The audit covered 225 distinct cases: 144 unit/database cases and 81 browser scenarios. It recommended keeping 204 cases, strengthening 15, and merging six overlapping cases. The six were merged into stronger existing checks; their distinct assertions were retained.

## What changed

| Finding                                                                  | Action                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service checkpoint test passed when the service returned an empty object | Assert model invocation, returned review state, submitted writing and the persisted final state, while retaining the assertions made before each model call.                                            |
| Successful password update checked only its return value                 | Assert exactly one update with the submitted password.                                                                                                                                                  |
| PGlite tests claimed to prove connection concurrency                     | Rename the serialized checks and add three separate real-Postgres races using independent connections. The harness holds the production lock until multiple database sessions are demonstrably waiting. |
| Search allowance relied on finishing within one wall-clock second        | Substitute a fixed SQL clock only in the test database. Production SQL remains unchanged.                                                                                                               |
| Mocked grading test implied alternative reasoning was actually accepted  | Describe its wire-contract coverage honestly and add opt-in real-model grading cases with complete paraphrased, incomplete and wrong-half answers.                                                      |
| Research truncation fixtures never exceeded their limits                 | Exercise 30,000 characters against the 18,000-character cap and a smaller requested cap; return five search results and verify only three snippets reach the model.                                     |
| Contrast test could check zero elements                                  | Require expected elements and check text against backgrounds with alpha compositing.                                                                                                                    |
| Legacy lesson test promised code coverage without code                   | Add a long indented code sample, exact text, keyboard scrolling, overflow containment and text contrast in both themes.                                                                                 |
| Colored lesson/review cards could pass with unreadable content           | Assert lesson and feedback bodies, foreground contrast, visible status labels and exact quotations. Screenshots remain review aids, not image comparisons.                                              |
| Reload test checked only a request counter                               | Await the reloaded review and assert saved dispute details, all feedback fields and excluded-result status, with no extra grading calls.                                                                |
| Outline revision never returned a different plan                         | Verify submitted topic/level and adoption of a visibly different interpretation.                                                                                                                        |

## Overlap removed

- Fold malformed review-shape cases into review validation, with a valid control and independently invalid fields.
- Use the existing failed-preparation/reload/retry flow for the durable interrupted-unit marker.
- Check feedback labels and bodies inside the main Sage practice flow.
- Check Pip question-card presentation and answer-draft reload inside the full Pip flow.
- Check the unsubmitted help draft before the existing successful/lost-response custom-question flows.
- Check mobile notes-button sizing and notes visibility inside the keyboard/reduced-motion flow.

## Coverage and routine work

| Checks                                   | Before | After |
| ---------------------------------------- | -----: | ----: |
| Unit/database cases in `npm test`        |    144 |   161 |
| Separate real-Postgres concurrency cases |      0 |     3 |
| Distinct browser scenarios               |     81 |    76 |
| Routine desktop executions               |     81 |    76 |
| Routine mobile executions                |     81 |    21 |
| Routine automated executions in CI       |    306 |   261 |
| Complete browser matrix                  |    162 |   152 |

The 18 new API cases exercise both POST handlers: foreign/missing origins, wrong content type, oversized declared/actual bodies, malformed JSON, valid dispatch, authorization errors and unexpected-error redaction. Service doubles isolate the request boundary; these are not hosted authentication tests.

All desktop scenarios still run routinely. The 21 mobile cases are explicitly tagged `@mobile`. The complete mobile matrix runs weekly and on manual GitHub workflow runs, and remains available locally with `npm run test:e2e:full`. CI no longer builds twice: Playwright owns the production build. The stale manual smoke-script click on the removed “Prepare this unit” button was removed.

## Verification and limits

Local verification passed: lint, typecheck, all 161 unit/API cases, all three real-Postgres races and all 152 complete desktop/mobile executions (zero skipped or retried cases in the final browser run). Isolated deliberate-breakage probes also confirmed that an empty service result, deleted contrast targets, deleted feedback prose and transparent lesson text now fail for their intended assertion failures. Probe files and generated reports stay under ignored `artifacts/test-audit/`. The GitHub workflow configuration has been updated; it has not been run on GitHub as part of this local work.

The new `npm run eval:ai` command validates its fixtures without network requests. Explicit `--live` mode runs three grading cases and one lesson case through production prompts, with at most eight completion attempts including repairs. It uses synthetic material, disables search and hosted database access, and saves output for human review. It is excluded from CI. No live model-quality result is claimed: automated word limits and a few expected verdicts cannot establish general correctness, clarity or question answerability.

This maintenance does not apply hosted migrations, push commits or deploy the app. GitHub remains the only release path.
