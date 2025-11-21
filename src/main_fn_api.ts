import { Attribute, AttributeController } from "./attribute";
import { AttributesDefinitions, EventsDefinitions, MethodsDefinitions } from "./custom_element";
import { MethodsApi } from "./methods_api";
import { nodeHasClassName } from "./utils";

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

  constructor(
    thisElement: HTMLElement,
    cleanups: Array<() => void>,
    attributeController: AttributeController,
    public readonly context: Ctx,
    public readonly method: Methods,
    root: HTMLElement | ShadowRoot,
    public readonly childrenPortal: HTMLDivElement,
    protected readonly eventsRecord: Evnts,
    attributes: Attr,
  ) {
    super(thisElement, cleanups, context, attributeController, root, eventsRecord, attributes);
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

  protected triggerChildrenChange(skipIfZero = false) {
    const children = this.getChildren();
    if (skipIfZero && children.length === 0) {
      return;
    }
    for (const cb of this.childrenChangeCallbacks) {
      cb(children);
    }
  }

  onChildrenChange(cb: (children: Array<Element | Text>) => void): void {
    this.childrenChangeCallbacks.push(cb);
    this.cleanups.push(() => {
      const index = this.childrenChangeCallbacks.indexOf(cb);
      if (index !== -1) {
        this.childrenChangeCallbacks.splice(index, 1);
      }
    });
  }

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

      this.cleanups.push(unbind);
    }
  }

  /**
   * Adds a cleanup function that will be called when the element is
   * disconnected from the document.
   */
  cleanup(cb: () => void): void {
    this.cleanups.push(cb);
  }
}

export function registerDependencyHandler<T>(handler: DependencyHandler<T>) {
  ConnectedCallbackApi.addDependencyHandler(handler);
}
