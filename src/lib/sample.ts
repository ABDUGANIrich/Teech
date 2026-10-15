import type { Concept, Session } from "./domain";
import { verifyEvaluation } from "./domain";

export const sampleNotes = `A tiny guide to the water cycle

The water cycle is the ongoing movement of water between Earth's surface and the atmosphere. Water changes location and state, but is not created by the cycle.

Evaporation happens when liquid water gains enough energy to become water vapor. Sunlight supplies much of this energy. Water can evaporate from lakes, oceans, and wet soil.

Transpiration is the release of water vapor from plants through their leaves. Evaporation and transpiration both move water into the atmosphere.

Condensation happens when water vapor cools and becomes tiny liquid droplets. These droplets can gather into clouds. Clouds contain droplets or ice crystals, not just invisible water vapor.

Precipitation occurs when water droplets or ice crystals grow heavy enough to fall from clouds. Rain, snow, sleet, and hail are forms of precipitation.

Some water flows over the ground as runoff into streams and rivers. Some soaks into the soil through infiltration and can replenish groundwater. Eventually, water may return to larger bodies of water and continue cycling.

The Sun provides energy for evaporation, while gravity pulls precipitation down and moves water downhill. The cycle has no single starting point, and water can follow different routes. A drop may spend a long time underground before returning to the atmosphere. Water does not always pass through every step in a fixed order.`;
const entries = [
  [
    "evaporation",
    "Evaporation",
    "Connect the change from liquid to vapor with energy from sunlight.",
    "Evaporation happens when liquid water gains enough energy to become water vapor.",
  ],
  [
    "transpiration",
    "Transpiration",
    "Explain how plants release water into the atmosphere.",
    "Transpiration is the release of water vapor from plants through their leaves.",
  ],
  [
    "condensation",
    "Condensation",
    "Explain cooling and distinguish cloud droplets from invisible vapor.",
    "Condensation happens when water vapor cools and becomes tiny liquid droplets.",
  ],
  [
    "precipitation",
    "Precipitation",
    "Explain why water falls from clouds and give an example.",
    "Precipitation occurs when water droplets or ice crystals grow heavy enough to fall from clouds.",
  ],
  [
    "collection",
    "Runoff & infiltration",
    "Distinguish movement over land from movement into the soil.",
    "Some water flows over the ground as runoff into streams and rivers.",
  ],
  [
    "drivers",
    "Energy & different routes",
    "Connect sunlight and gravity to the cycle, without implying a fixed order.",
    "The cycle has no single starting point, and water can follow different routes.",
  ],
];
export const sampleConcepts: Concept[] = entries.map(
  ([id, title, description, excerpt]) => ({ id, title, description, excerpt }),
);
export const sampleTopic = {
  id: "sample",
  title: "The water cycle",
  notes: sampleNotes,
  concepts: sampleConcepts,
  version: 1,
  created_at: "2026-10-13T00:00:00Z",
};
export const previewQuestions = [
  "You described water rising into the air. How do plants contribute to that movement?",
  "What changes when water vapor becomes the droplets in a cloud?",
  "After rain reaches the ground, does all of it take the same route back to the ocean?",
];
export function newPreview(short = false): Session {
  return {
    id: crypto.randomUUID(),
    topic_id: null,
    owner: "preview",
    title: sampleTopic.title,
    notes: sampleNotes,
    concepts: sampleConcepts,
    checklist_version: 1,
    phase: "explain",
    messages: [],
    question_calls: 0,
    notes_revealed: false,
    short_retry: short,
    evaluation: null,
    created_at: new Date().toISOString(),
    preview: true,
  };
}
// Deliberately fixed demonstration, not an assessment of the visitor's writing.
export function fixtureReview(session: Session) {
  return verifyEvaluation(
    {
      results: session.concepts.map((c, i) => ({
        conceptId: c.id,
        status:
          i < 3
            ? "Explained clearly"
            : i < 5
              ? "Partially explained"
              : "Not demonstrated",
        reason:
          i < 3
            ? "Example feedback: an explanation would connect this process to the movement of water."
            : "Example feedback: this idea needs a little more detail.",
        userExcerpt: null,
        sourceExcerpt: c.excerpt,
        suggestion: `In your next explanation, try to ${c.description.charAt(0).toLowerCase()}${c.description.slice(1)}`,
        claimType: i === 5 ? "omitted" : "supported",
      })),
      strengths: [
        "Example: connecting changes of state to everyday observations.",
      ],
      revisit: [
        "How plants release water",
        "The routes water takes underground",
        "The roles of sunlight and gravity",
      ],
    },
    session,
  );
}
