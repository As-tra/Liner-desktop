import { describe, expect, it } from "vitest";
import { applyWindowVisibility } from "@/shared/utils/windowVisibility";
import { useWindowAnimationStore } from "./WindowAnimationContainer";

describe("WindowAnimationContainer close state", () => {
  it("resets the faded-out closing phase when the window is hidden", () => {
    useWindowAnimationStore.setState({ phase: "closing" });
    applyWindowVisibility(false);
    expect(useWindowAnimationStore.getState().phase).toBe("idle");
    applyWindowVisibility(true);
  });

  it("resets the closing phase when the window is shown again", () => {
    applyWindowVisibility(false);
    useWindowAnimationStore.setState({ phase: "closing" });
    applyWindowVisibility(true);
    expect(useWindowAnimationStore.getState().phase).toBe("idle");
  });
});
