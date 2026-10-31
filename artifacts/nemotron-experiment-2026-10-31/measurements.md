# Measurements

130 action runs; 179 live requests; reported cost $0. Accepted means app validation, not factual correctness. Read report.md and manual-audit.json before interpreting the tables.

## Screening

| Requested setting | Accepted actions | Median model service time | Final responses at token limit |
|---|---:|---:|---:|
| t0.7-off | 6/6 | 4.74 seconds | 0 |
| t0.7-medium | 5/6 | 19.59 seconds | 1 |
| t0.1-off | 5/6 | 7.30 seconds | 0 |
| t0.3-high | 5/6 | 26.50 seconds | 0 |
| t0.3-low | 4/6 | 21.55 seconds | 2 |
| t0.3-off | 4/6 | 13.06 seconds | 0 |
| t0.3-medium | 4/6 | 21.59 seconds | 2 |
| t0.1-medium | 4/6 | 33.09 seconds | 1 |
| t0.1-high | 3/6 | 28.30 seconds | 0 |
| t0.1-low | 3/6 | 56.36 seconds | 3 |
| t0.7-low | 3/6 | 29.33 seconds | 0 |
| t0.7-high | 2/6 | 27.73 seconds | 2 |

## Reasoning-off combined

| Requested setting | Accepted actions | Median model service time | Final responses at token limit |
|---|---:|---:|---:|
| t0.7-off | 20/20 | 4.74 seconds | 0 |
| t0.1-off | 19/20 | 5.15 seconds | 0 |
| t0.3-off | 16/20 | 9.58 seconds | 0 |

## Confirmation only

| Requested setting | Accepted actions | Median model service time | Final responses at token limit |
|---|---:|---:|---:|
| t0.1-off | 14/14 | 4.15 seconds | 0 |
| t0.7-off | 14/14 | 4.58 seconds | 0 |
| t0.3-off | 12/14 | 5.96 seconds | 0 |

## Extra token headroom

| Requested setting | Accepted actions | Median model service time | Final responses at token limit |
|---|---:|---:|---:|
| t0.7-medium-roomy | 5/6 | 36.92 seconds | 0 |

## Focused reasoning probe

| Requested setting | Accepted actions | Median model service time | Final responses at token limit |
|---|---:|---:|---:|
| t0.1-low-roomy | 1/2 | 58.54 seconds | 0 |

Durations exclude harness pacing and real database/search overhead. Cases are small and synthetic; repeated cases are not independent subjects. Timeout token usage is unavailable.
