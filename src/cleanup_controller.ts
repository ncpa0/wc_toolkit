import { nofail } from "./utils";

export type CleanupFn = () => void;

type Cleanup = {
  fn: CleanupFn;
  once: boolean;
};

export class CleanupController {
  private readonly _cleanupFns: Array<Cleanup> = [];

  /** Adds a cleanup that will run only once, on the next disconnect. */
  public once(cleanup: CleanupFn) {
    this._cleanupFns.push({ fn: cleanup, once: true });
  }

  /** Adds a cleanup that will run on every disconnect. */
  public add(cleanup: CleanupFn) {
    this._cleanupFns.push({ fn: cleanup, once: false });
  }

  public runCleanups() {
    for (const cleanup of this._cleanupFns) {
      nofail(cleanup.fn);
    }

    for (let i = this._cleanupFns.length - 1; i >= 0; i--) {
      const cleanup = this._cleanupFns[i]!;
      if (cleanup.once) {
        this._cleanupFns.splice(i, 1);
      }
    }
  }
}
