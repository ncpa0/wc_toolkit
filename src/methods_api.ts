import { AttributeController } from "./attribute";
import { AttributesDefinitions, EventsDefinitions } from "./custom_element";
import { AttributeApi } from "./type.utils";
import { ListenerController } from "./utils";

export type NamedEvent<Name extends string> = Event & { type: Name };

export type WcAddEventListenerOptions = AddEventListenerOptions & {
  /**
   * Listeners are automatically enabled when added, when this option is set to true,
   * the listener won't be enabled until the `enable` method is called.
   */
  initEnabled?: boolean;
};

const CONFITMED_EMIT = class {
  static onCommit(cb: () => void) {
    cb();
    return CONFITMED_EMIT;
  }
  static onCancel(_: () => void) {
    return CONFITMED_EMIT;
  }
};

const CANCELLED_EMIT = class {
  static onCommit(_: () => void) {
    return CANCELLED_EMIT;
  }
  static onCancel(cb: () => void) {
    cb();
    return CANCELLED_EMIT;
  }
};

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
    protected readonly cleanups: Array<() => void>,
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
   * Appends the given content to the element as a child.
   */
  attach(newContent: Element | string): void {
    if (typeof newContent === "string") {
      const textNode = document.createTextNode(newContent);
      this.root.append(textNode);
    } else {
      this.root.append(newContent);
    }
  }

  /**
   * Replaces the content of the element with the given element.
   */
  replace(newContent: Element | string): void {
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

  /**
   * Adds a listener to this element. This listener will be automatically
   * removed when the element is disconnected.
   */
  listen<Ev extends Event>(
    eventName: string,
    listener: (event: Ev) => void,
    options?: WcAddEventListenerOptions,
  ): ListenerController<Ev> {
    const controller = new ListenerController(this._thisElement, eventName, listener, options);
    if (options?.initEnabled !== false) {
      controller.enable();
    }
    this.cleanups.push(() => {
      controller.destroy();
    });
    return controller;
  }

  /**
   * Adds a listener to the document. This listener will be automatically
   * removed when the element is disconnected.
   */
  listenDocument<Ev extends Event>(
    eventName: string,
    listener: (event: Ev) => void,
    options?: WcAddEventListenerOptions,
  ): ListenerController<Ev> {
    const controller = new ListenerController(document, eventName, listener, options);
    if (options?.initEnabled !== false) {
      controller.enable();
    }
    this.cleanups.push(() => {
      controller.destroy();
    });
    return controller;
  }

  /**
   * Adds a listener to the window. This listener will be automatically
   * removed when the element is disconnected.
   */
  listenWindow<Ev extends Event>(
    eventName: string,
    listener: (event: Ev) => void,
    options?: WcAddEventListenerOptions,
  ): ListenerController<Ev> {
    const controller = new ListenerController(window, eventName, listener, options);
    if (options?.initEnabled !== false) {
      controller.enable();
    }
    this.cleanups.push(() => {
      controller.destroy();
    });
    return controller;
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
      return CONFITMED_EMIT;
    }

    return CANCELLED_EMIT;
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
