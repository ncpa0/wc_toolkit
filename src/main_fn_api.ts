import { Attribute, AttributeController } from "./attribute";
import { AttributesDefinitions, EventsDefinitions, MethodsDefinitions } from "./custom_element";
import { MethodsApi } from "./methods_api";

export class ConnectedCallbackApi<
  Attr extends AttributesDefinitions,
  Evnts extends EventsDefinitions,
  Ctx extends object,
  Methods extends MethodsDefinitions,
> extends MethodsApi<Attr, Evnts, Ctx> {
  private readonly childrenChangeCallbacks: Array<(children: Array<Element | Text>) => void> = [];

  constructor(
    thisElement: HTMLElement,
    private readonly cleanups: Array<() => void>,
    attributeController: AttributeController,
    public readonly context: Ctx,
    public readonly method: Methods,
    root: HTMLElement | ShadowRoot,
    public readonly childrenPortal: HTMLDivElement,
    attributes: Attr,
  ) {
    super(thisElement, context, attributeController, root, attributes);
  }

  protected mutationObservedCallback(mutationRecords: MutationRecord[]) {
    const children = this.getChildren();
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

  onChange(deps: Attribute<any, any>[], cb: () => void | (() => void)): void {
    let willRunOnNextMicroevent = false;

    for (const dep of deps) {
      const unbind = dep.onChange(() => {
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

  deferCleanup(cb: () => void): void {
    this.cleanups.push(cb);
  }
}
