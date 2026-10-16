import { describe, expect, it } from "vitest";
import { quotaMessage } from "../src/lib/server/quota";
const limits = {
  p_actor: "user:a",
  p_slot: "test",
  p_actor_limit: 100,
  p_app_limit: 900,
  p_minute_limit: 10,
};
describe("actionable quota messages", () => {
  it("does not promise a minute retry for exhausted daily allowances", () => {
    expect(quotaMessage(100, 200, limits, 5)).toContain("Your daily allowance");
    expect(quotaMessage(100, 200, limits, 5)).toContain("00:00 UTC");
    expect(quotaMessage(10, 900, limits, 5)).toContain(
      "shared daily allowance",
    );
    expect(quotaMessage(10, 200, limits, 27)).toContain("27 seconds");
    expect(quotaMessage(10, 200, limits, -1)).toContain("1 seconds");
  });
});
