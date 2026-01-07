import { describe, expect, it } from "vitest";
import { CleanupController } from "../src/cleanup_controller";

describe("CleanupController", () => {
  it("executes cleanups in the same order as they were added, and does not execute once cleanups more than once", async () => {
    const controller = new CleanupController();

    const calls: string[] = [];

    controller.add(() => {
      calls.push("add 1");
    });

    controller.once(() => {
      calls.push("once 1");
    });

    controller.add(() => {
      calls.push("add 2");
    });

    controller.once(() => {
      calls.push("once 2");
    });

    controller.runCleanups();
    expect(calls).toHaveLength(4);
    expect(calls).toEqual([
      "add 1",
      "once 1",
      "add 2",
      "once 2",
    ]);

    controller.runCleanups();
    expect(calls).toHaveLength(6);
    expect(calls).toEqual([
      "add 1",
      "once 1",
      "add 2",
      "once 2",
      "add 1",
      "add 2",
    ]);

    controller.once(() => {
      calls.push("once 3");
    });

    controller.runCleanups();
    expect(calls).toHaveLength(9);
    expect(calls).toEqual([
      "add 1",
      "once 1",
      "add 2",
      "once 2",
      "add 1",
      "add 2",
      "add 1",
      "add 2",
      "once 3",
    ]);

    controller.runCleanups();
    expect(calls).toHaveLength(11);
    expect(calls).toEqual([
      "add 1",
      "once 1",
      "add 2",
      "once 2",
      "add 1",
      "add 2",
      "add 1",
      "add 2",
      "once 3",
      "add 1",
      "add 2",
    ]);
  });
});
