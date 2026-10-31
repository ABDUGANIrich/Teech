// Public, deterministic demonstration. These keys are intentionally public.
import { AppError } from "./domain";
import {
  event,
  SIMPLIFY_LESSON_QUESTION,
  studied,
  sourceForHandoff,
  type LearningSession,
  type Plan,
  type UnitPackage,
} from "./learning";
export const samplePlan: Plan = {
  title: "Binary search: choose the next half",
  interpretation:
    "An introductory slice of binary search on a sorted list of distinct numbers.",
  prerequisites: ["Compare whole numbers and read zero-based list positions."],
  objectives: [
    { id: "sorted", text: "Explain why the list must be sorted." },
    {
      id: "middle",
      text: "Choose the middle position of an inclusive search interval.",
    },
    { id: "discard", text: "Choose which half to discard after a comparison." },
    {
      id: "stop",
      text: "Recognize found and empty-interval stopping conditions.",
    },
  ],
  units: [
    {
      id: "halves",
      title: "One comparison, a smaller search",
      objectiveIds: ["sorted", "middle", "discard", "stop"],
    },
  ],
  covers: "A short hand trace with inclusive bounds and distinct values.",
  excludes: "Duplicate values, implementation details and complexity proofs.",
  estimatedMinutes: 8,
  sourceExcerpts: [],
};
export const sampleUnit: UnitPackage = {
  unit: {
    id: "halves",
    outcome: "Choose which half to search next and trace a small example.",
    essentials: {
      idea: "Find a value in a sorted list by checking the middle and ruling out half of the remaining positions.",
      points: [
        "The list must be sorted (in increasing order), so one comparison tells you which side can contain your target.",
        "Track the first and last possible positions, called low and high. Positions start at 0. Check the middle position: floor((low + high) / 2), meaning round down.",
        "Target smaller than the middle value? Move high to middle − 1. Larger? Move low to middle + 1. The checked middle position is no longer a candidate.",
        "Equal means found. If low becomes greater than high, no candidates remain: the target is absent.",
      ],
    },
    explanation: [
      {
        kind: "paragraph",
        text: "Binary search needs a sorted list. Sorted order lets one comparison rule out a whole region: if the target is smaller than the middle value, it cannot be anywhere to the right of that value. On an unsorted list, this reasoning would fail.",
      },
      {
        kind: "paragraph",
        text: "Keep an inclusive interval from low to high. Choose the middle position by rounding (low + high) / 2 down. Compare the value at that position with the target. If they match, the search is finished. If the target is smaller, set high to middle − 1; if larger, set low to middle + 1. Exclude the middle value because it has already been checked.",
      },
      {
        kind: "paragraph",
        text: "Repeat with the remaining interval. If low becomes greater than high, the interval is empty and the target is absent. Every update removes checked positions, so a search cannot get stuck on the same middle value. The positions are zero-based: position 0 means the first value.",
      },
      { kind: "equation", text: "middle = floor((low + high) / 2)" },
    ],
    definitions: [
      "Sorted: values appear in increasing order.",
      "Inclusive bounds: both endpoint positions are still candidates.",
    ],
    workedExample: [
      {
        kind: "paragraph",
        text: "Find **11** in the sorted list `[2, 5, 8, 11, 14]`.",
      },
      {
        kind: "list",
        text: "1. Start with positions low = 0 and high = 4. The middle position is 2, holding 8.\n2. 11 is larger than 8, so keep the right half: low = 3, high = 4.\n3. The new middle is floor((3 + 4) / 2) = 3. It holds 11. Found at position 3.",
      },
    ],
    misunderstanding:
      "Do not keep the checked middle position in the next interval. Use middle − 1 or middle + 1.",
    sourceExcerpts: [],
    questions: [
      {
        id: "halves_check",
        objectiveId: "discard",
        kind: "mcq",
        prompt:
          "In a sorted list, the target is smaller than the middle value. Which positions can remain?",
        choices: [
          { id: "left", text: "Only positions before the middle" },
          { id: "right", text: "Only positions after the middle" },
          { id: "all", text: "Every position, including the middle" },
        ],
      },
      {
        id: "halves_apply",
        objectiveId: "middle",
        kind: "application",
        prompt:
          "Trace a search for 4 in [1, 4, 7, 10, 13]. Give the first middle position and the bounds after the first comparison, then show how 4 is found.",
      },
    ],
  },
  keys: [
    {
      itemId: "halves_check",
      correctChoiceId: "left",
      choiceFeedback: [
        {
          choiceId: "left",
          explanation:
            "Sorted order places every smaller candidate before the checked middle value.",
        },
        {
          choiceId: "right",
          explanation:
            "Values after the middle are larger, so they cannot equal a smaller target.",
        },
        {
          choiceId: "all",
          explanation:
            "The checked middle and every larger value can already be ruled out.",
        },
      ],
      expectedAnswer: "Only positions before the middle",
      rubric: [
        "Use sorted order to discard the middle and every greater value.",
      ],
      hints: [
        "Compare the target with values to the right of the middle.",
        "Those values are all at least as large as the middle value.",
      ],
      solution: "Keep only positions before the middle. Set high = middle − 1.",
    },
    {
      itemId: "halves_apply",
      correctChoiceId: null,
      choiceFeedback: [],
      expectedAnswer:
        "Middle 2, value 7; high=1, low=0. Middle 0, value 1; low=1. Middle 1, value 4: found.",
      rubric: [
        "State inclusive bounds and zero-based positions.",
        "Use the correct half after each comparison; alternative valid descriptions are acceptable.",
      ],
      hints: [
        "Start with low = 0 and high = 4. Round the average down.",
        "At position 2 the value is 7, so the target must lie in positions 0–1.",
      ],
      solution:
        "First middle = 2 (value 7). Since 4 < 7, set high = 1, low = 0. Next middle = 0 (value 1); set low = 1. Next middle = 1 (value 4), found.",
    },
  ],
};
export function newTeacherSample(): LearningSession {
  return {
    schemaVersion: 1,
    id: "99999999-9999-4999-8999-999999999999",
    input: {
      topic: "Binary search",
      level: "new",
      goal: "Trace it by hand",
      notes: "",
    },
    policy: "general",
    phase: "plan",
    plan: samplePlan,
    planHistory: [samplePlan],
    issue: null,
    accepted: false,
    active: 0,
    units: [],
    targeted: null,
    completed: [],
    helpUsed: 0,
    targetedUsed: false,
    targetedObjective: null,
    handoff: null,
    events: [],
    createdAt: "2026-10-16T00:00:00.000Z",
    version: 0,
    providerAttempts: 0,
    topicId: null,
    teachingId: null,
  };
}
export function sampleTeacherAction(
  current: LearningSession,
  a: Record<string, unknown>,
): LearningSession {
  const s = structuredClone(current);
  const u = s.units[0];
  const at = u?.attempts.find((at) => at.itemId === a.itemId);
  const key = sampleUnit.keys.find((k) => k.itemId === a.itemId);
  switch (a.action) {
    case "accept":
      s.accepted = true;
      s.phase = "learning";
      break;
    case "generate":
      if (!u) {
        s.units.push(studied(sampleUnit.unit));
        event(s, "viewed", "halves");
      }
      break;
    case "practice":
      s.phase = "practice";
      break;
    case "help":
      if (s.helpUsed >= 2)
        throw new AppError("Both sample help requests have been used.");
      s.helpUsed++;
      u.clarifications.push({
        question: String(a.question),
        blocks:
          String(a.question) === SIMPLIFY_LESSON_QUESTION
            ? [
                { kind: "paragraph", text: sampleUnit.unit.essentials!.idea },
                {
                  kind: "list",
                  text: sampleUnit.unit.essentials!.points.join("\n"),
                },
              ]
            : [
                {
                  kind: "paragraph",
                  text: "Fixed sample explanation: imagine looking for a page in a sorted index. A middle entry tells you which half can still contain your target. This fixed response does not assess your question.",
                },
              ],
        sourceExcerpts: [],
      });
      break;
    case "hint":
      if (at && key && at.hints.length < 2 && at.state === "open")
        at.hints.push(key.hints[at.hints.length]);
      break;
    case "solution":
      if (at && key) {
        at.solution = key.solution;
        at.state = "finished";
      }
      break;
    case "dispute":
      if (at) {
        at.dispute = String(a.reason || "");
        at.state = "finished";
      }
      break;
    case "submit":
      if (!at || !key || at.state !== "open" || at.solution)
        throw new AppError("This sample response is frozen.");
      at.answer = String(a.answer);
      at.unsure = Boolean(a.unsure);
      at.state = "finished";
      at.feedback = {
        itemId: key.itemId,
        status: a.unsure
          ? "Not attempted"
          : key.correctChoiceId
            ? a.answer === key.correctChoiceId
              ? "Correct"
              : "Needs another try"
            : "Could not assess reliably",
        well: key.correctChoiceId
          ? "Your choice was compared with the fixed sample key."
          : "Illustrative feedback only: a clear trace states each middle position and comparison. Your text has not been assessed.",
        gap: key.correctChoiceId
          ? "This checks agreement with a fixed key."
          : "A common omission is failing to update the inclusive bounds after a comparison. This is an example, not a judgment of your answer.",
        next: "Revisit the worked example and compare your reasoning with the solution.",
      };
      event(s, "assessed", key.itemId);
      break;
    case "next":
      s.completed = ["halves"];
      s.phase = "summary";
      break;
    case "resume":
      s.phase = "learning";
      break;
    case "summary":
      s.phase = "summary";
      break;
    case "revisit":
      s.active = 0;
      s.phase = "learning";
      break;
    case "handoff_prepare":
      s.handoff = s.handoff || {
        source: sourceForHandoff(s),
        concepts: null,
        extractionCalls: 0,
        done: false,
      };
      break;
    case "handoff_extract": {
      const source = s.handoff!.source;
      const passages = sampleUnit.unit.explanation
        .filter((b) => b.kind === "paragraph")
        .map((b) => b.text);
      passages.push(sampleUnit.unit.misunderstanding);
      s.handoff!.concepts = [
        "Sorted order",
        "Inclusive bounds",
        "Stopping conditions",
        "Exclude the middle",
      ].map((title, i) => ({
        id: `concept-${i}`,
        title,
        description: title,
        excerpt: passages[i],
      }));
      if (s.handoff!.concepts.some((c) => !source.includes(c.excerpt)))
        throw new Error("Sample source mismatch");
      break;
    }
    default:
      throw new AppError(
        "This action needs a saved course. Sign in to try the complete flow.",
      );
  }
  s.version++;
  return s;
}
