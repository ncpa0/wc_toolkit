import { AttributeController } from "./attribute";
import { AttributesDefinitions, EventsDefinitions } from "./custom_element";
import { AttributeApi } from "./type.utils";

export type NamedEvent<Name extends string> = Event & { type: Name };

export class CustomElementEvent<Details> extends Event {
  constructor(eventName: string, public readonly details?: Details) {
    super(eventName, { cancelable: true });
  }
}

export class MethodsApi<
  Attr extends AttributesDefinitions,
  Evnts extends EventsDefinitions,
  Ctx extends object,
> {
  readonly attribute: AttributeApi<Attr>;

  constructor(
    protected readonly _thisElement: HTMLElement,
    public readonly context: Ctx,
    protected readonly attributeController: AttributeController,
    protected readonly root: HTMLElement | ShadowRoot,
    attributes: Attr,
  ) {
    this.attribute = attributeController.getAttributesApi(attributes);
  }

  get thisElement(): HTMLElement {
    return this._thisElement;
  }

  get isMounted(): boolean {
    // @ts-expect-error
    return this._thisElement.isMounted;
  }

  /**
   * Replaces the content of the element with the given value.
   */
  render(newContent: Element | string): void {
    this.root.innerHTML = "";
    if (typeof newContent === "string") {
      const textNode = document.createTextNode(newContent);
      this.root.append(textNode);
    } else {
      this.root.append(newContent);
    }
  }

  getChildren(): Array<Element | Text> {
    return (Array.from(this._thisElement.childNodes) as Array<Element | Text>).filter(elem => {
      if ("classList" in elem && elem.classList.contains("_wc_toolkit_content_container")) {
        return false;
      }
      return true;
    });
  }

  emitEvent(event: NamedEvent<Lowercase<Evnts[number]>>): EmitEventResult;
  emitEvent(eventName: Lowercase<Evnts[number]>, details?: any): EmitEventResult;
  emitEvent(arg0: string | Event, arg1?: any): EmitEventResult {
    let event: Event;
    if (typeof arg0 === "string") {
      event = new CustomElementEvent(arg0, arg1);
    } else {
      event = arg0;
    }

    const shouldCommit = this._thisElement.dispatchEvent(event);

    if (shouldCommit) {
      return {
        onCommit(cb: () => void) {
          cb();
          return this;
        },
        onCancel(cb: () => void) {
          return this;
        },
      };
    }

    return {
      onCommit(cb: () => void) {
        return this;
      },
      onCancel(cb: () => void) {
        cb();
        return this;
      },
    };
  }
}

type EmitEventResult = {
  /**
   * Adds callback that will be called after the event is dispatched, if it was
   * NOT cancelled. (event can be cancelled by calling `preventDefault()` on it)
   */
  onCommit(cb: () => void): EmitEventResult;
  /**
   * Adds callback that will be called after the event is dispatched if that event was cancelled.
   * (event can be cancelled by calling `preventDefault()` on it)
   */
  onCancel(cb: () => void): EmitEventResult;
};
