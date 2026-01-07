import { Attribute, AttributeController } from "./attribute";
import { CleanupController } from "./cleanup_controller";
import { AttributesDefinitions, EventsDefinitions, MethodsDefinitions } from "./custom_element";
import { MethodsApi } from "./methods_api";
import { nodeHasClassName, nofail } from "./utils";

declare global {
  interface WcToolkitDependencies {
    attribute: Attribute<string, any>;
  }
}

export type Dependency = WcToolkitDependencies[keyof WcToolkitDependencies];

export interface DependencyHandler<T> {
  detect(v: unknown): v is T;
  onChange(v: T, cb: () => void): () => void;
}

const ATTR_DEP_HANDLER = class {
  static detect(v: unknown): v is Attribute<string, any> {
    return v instanceof Attribute;
  }
  static onChange(attr: Attribute<string, any>, cb: () => void): () => void {
    return attr.onChange(cb);
  }
};

export class ConnectedCallbackApi<
  Attr extends AttributesDefinitions,
  Evnts extends EventsDefinitions,
  Ctx extends object,
  Methods extends MethodsDefinitions,
> extends MethodsApi<Attr, Evnts, Ctx> {
  private static dependencyHandlers: Array<DependencyHandler<any>> = [ATTR_DEP_HANDLER];

  static addDependencyHandler(handler: DependencyHandler<any>) {
    this.dependencyHandlers.push(handler);
  }

  private readonly childrenChangeCallbacks: Array<(children: Array<Element | Text>) => void> = [];
  private readonly readyCallbacks: Array<() => any> = [];

  constructor(
    thisElement: HTMLElement,
    cleanups: CleanupController,
    attributeController: AttributeController,
    public readonly context: Ctx,
    public readonly method: Methods,
    root: HTMLElement | ShadowRoot,
    public readonly childrenPortal: HTMLDivElement,
    protected readonly eventsRecord: Evnts,
    attributes: Attr,
  ) {
    super(thisElement, cleanups, context, attributeController, root, eventsRecord, attributes);
    cleanups.add(() => {
      this.childrenChangeCallbacks.splice(0, this.childrenChangeCallbacks.length);
      this.readyCallbacks.splice(0, this.readyCallbacks.length);
    });
  }

  private getHandler(v: unknown): DependencyHandler<any> {
    for (const handler of ConnectedCallbackApi.dependencyHandlers) {
      if (handler.detect(v)) {
        return handler;
      }
    }
    throw new Error(
      "Invalid dependency, make sure the dependency is of supported type or add a new dependency handler",
    );
  }

  private isMutCbQueued = false;
  protected mutationObservedCallback(mutationRecords: MutationRecord[]) {
    if (this.isMutCbQueued) {
      return;
    }

    if (
      mutationRecords.every(mut =>
        mut.type !== "characterData"
        && Array.from(mut.addedNodes).every(n => nodeHasClassName(n, "_wc_toolkit_content_container"))
        && Array.from(mut.removedNodes).every(n => nodeHasClassName(n, "_wc_toolkit_content_container"))
      )
    ) {
      return;
    }

    this.isMutCbQueued = true;
    setTimeout(() => {
      this.isMutCbQueued = false;
      this.triggerChildrenChange();
    });
  }

  protected triggerReadyCallbacks() {
    for (let cb = this.readyCallbacks.shift(); cb != null; cb = this.readyCallbacks.shift()) {
      nofail(cb);
    }
  }

  protected triggerChildrenChange(skipIfZero = false) {
    const children = this.getChildren();
    if (skipIfZero && children.length === 0) {
      return;
    }
    for (const cb of this.childrenChangeCallbacks) {
      nofail(() => cb(children));
    }
  }

  /**
   * Registers a callback that will be invoked whenever a direct children of
   * this Web Component is changed, added or removed. This only includes childrens
   * passed to it from outside, and doesn't include children added by this web component.
   *
   * These callbacks are only guaranteed to run while the component is mounted in the page.
   */
  onChildrenChange(cb: (children: Array<Element | Text>) => void): void {
    this.childrenChangeCallbacks.push(cb);
  }

  /**
   * Registers a callback that will be invoked once the Web Component is initialized and
   * all it's initial children are accounted for.
   *
   * These callbacks are only guaranteed to run while the component is mounted in the page.
   */
  onReady(cb: () => any) {
    this.readyCallbacks.push(cb);
  }

  /**
   * Registers a callback that will be invoked every time any of it's dependencies changes.
   * Only the attributes can be dependencies by default, but through the `registerDependencyHandler()`
   * other dependencies can be added.
   *
   * These callbacks are only guaranteed to run while the component is mounted in the page.
   */
  onChange(deps: Dependency[], cb: () => void | (() => void)): void {
    let willRunOnNextMicroevent = false;

    for (const dep of deps) {
      const depHandler = this.getHandler(dep);

      const unbind = depHandler.onChange(dep, () => {
        if (willRunOnNextMicroevent) {
          return;
        }

        willRunOnNextMicroevent = true;
        queueMicrotask(() => {
          willRunOnNextMicroevent = false;
          cb();
        });
      });

      this.cleanups.once(unbind);
    }
  }

  /**
   * Adds a cleanup function that will be called when the element is
   * disconnected from the document.
   */
  cleanup(cb: () => void, opts?: {
    /** By default a cleanup will be only ever called once on the next element `disconnect` event. Set this to true to keep it forever and run it on every `disconnect`. Usually this is not needed as every `connect` event would add a new cleanup. */
    keep?: true;
  }): void {
    if (opts?.keep) {
      this.cleanups.add(cb);
      return;
    }
    this.cleanups.once(cb);
  }
}

export function registerDependencyHandler<T>(handler: DependencyHandler<T>) {
  ConnectedCallbackApi.addDependencyHandler(handler);
}
