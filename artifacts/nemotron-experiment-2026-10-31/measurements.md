# Nemotron experiment measurements

2026-10-31T09:16:44.367Z

16 synthetic case runs, 17 live OpenRouter inference requests. Reported provider cost: $0.

## Screening

| Setting | Cases | Valid | First pass | Rubric checks | Median service time | Mean output tokens | Mean reasoning tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| t0.7-off | 1 | 1/1 | 1/1 | 100.0% | 4.17s | 612 | 0 |
| t0.1-off | 1 | 1/1 | 1/1 | 100.0% | 5.69s | 624 | 0 |
| t0.7-medium | 1 | 1/1 | 1/1 | 100.0% | 8.76s | 1569 | 949 |
| t0.7-low | 1 | 1/1 | 1/1 | 100.0% | 9.38s | 1680 | 1059 |
| t0.3-medium | 1 | 1/1 | 1/1 | 100.0% | 11.14s | 2040 | 1371 |
| t0.1-high | 1 | 1/1 | 1/1 | 100.0% | 11.58s | 2129 | 1462 |
| t0.3-off | 1 | 1/1 | 1/1 | 100.0% | 13.30s | 631 | 0 |
| t0.3-high | 1 | 1/1 | 1/1 | 100.0% | 14.03s | 1833 | 1182 |
| t0.3-low | 1 | 1/1 | 1/1 | 100.0% | 17.16s | 2200 | 1515 |
| t0.1-medium | 1 | 1/1 | 1/1 | 100.0% | 34.77s | 1924 | 1269 |
| t0.1-low | 1 | 1/1 | 1/1 | 83.3% | 12.63s | 2200 | 1781 |
| t0.7-high | 1 | 0/1 | 0/1 | 0.0% | 26.88s | 4010 | 2873 |

## Confirmation

| Setting | Cases | Valid | First pass | Rubric checks | Median service time | Mean output tokens | Mean reasoning tokens |
|---|---:|---:|---:|---:|---:|---:|---:|

## Interpretation limits

- These are small, deliberately chosen synthetic cases, not a population accuracy benchmark.
- Rubric checks are predefined deterministic proxies, macro-averaged per case; failed actions score zero. Schema acceptance alone is not factual correctness.
- Service time sums actual OpenRouter network/body durations per action, including repairs and model tool turns. It excludes harness admission waits, real database work and real Keenable latency.
- Search responses are fixed synthetic official-documentation excerpts; this experiment measures tool selection and use, not search quality.
- Reasoning tokens share the existing production output caps. No larger token budget was given to reasoning configurations.
- Effort settings are accepted by the API, but the catalog does not advertise selectable effort levels. Acceptance and nonzero reasoning tokens do not prove low/medium/high map to distinct underlying modes.
- Raw provider hidden reasoning and credentials are not saved.
