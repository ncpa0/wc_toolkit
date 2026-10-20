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

    let write = 0;
    for (let i = 0; i < this._cleanupFns.length; i++) {
      const cleanup = this._cleanupFns[i]!;
      this._cleanupFns[write] = cleanup;
      if (!cleanup.once) write++;
    }
    this._cleanupFns.length = write;
  }
}
