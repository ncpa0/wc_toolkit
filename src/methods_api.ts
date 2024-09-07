import { Attribute, AttributeController } from "./attribute";
import { AttributesDefinitions, EventsDefinitions } from "./custom_element";
import { AttributeApi } from "./type.utils";

export class CustomElementEvent<Details> extends Event {
  cancelable = true;

  constructor(eventName: string, public readonly details?: Details) {
    super(eventName);
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
    protected readonly contentContainer: HTMLDivElement,
    attributes: Attr,
  ) {
    this.attribute = Object.fromEntries(
      Object.entries(attributes).map(([k, def]) => {
        return [k, new Attribute(attributeController, def, k)];
      }),
    ) as AttributeApi<Attr>;
  }

  get thisElement(): HTMLElement {
    return this._thisElement;
  }

  getChildren(): Array<Element | Text> {
    return (Array.from(this._thisElement.childNodes) as Array<Element | Text>).filter(elem => {
      if ("classList" in elem && elem.classList.contains("_wc_toolkit_content_container")) {
        return false;
      }
      return true;
    });
  }

  emitEvent(eventName: Evnts[number], details?: any): EmitEventResult {
    const event = new CustomElementEvent(eventName, details);

    const prevented = this._thisElement.dispatchEvent(event);

    if (prevented) {
      return { then(_: () => void) {} };
    }

    return {
      then(cb: () => void) {
        cb();
      },
    };
  }
}

type EmitEventResult = {
  /**
   * Adds callback that will be called after the event is dispatched, if it was
   * not cancelled. (event can be cancelled by calling `preventDefault()` on it)
   */
  then(cb: () => void): void;
};
