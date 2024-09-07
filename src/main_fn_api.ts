import { Attribute, AttributeController } from "./attribute";
import { AttributesDefinitions, EventsDefinitions, MethodsDefinitions } from "./custom_element";
import { MethodsApi } from "./methods_api";

export class MainFuncApi<
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
    contentContainer: HTMLDivElement,
    public readonly childrenPortal: HTMLDivElement,
    attributes: Attr,
  ) {
    super(thisElement, context, attributeController, contentContainer, attributes);
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

  /**
   * Replaces the content of the element with the given value.
   */
  render(newContent: Element | string): void {
    this.contentContainer.innerHTML = "";
    if (typeof newContent === "string") {
      const textNode = document.createTextNode(newContent);
      this.contentContainer.append(textNode);
    } else {
      this.contentContainer.append(newContent);
    }
  }
}
