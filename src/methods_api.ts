import { AttributeController } from "./attribute";
import { CleanupController } from "./cleanup_controller";
import { AttributesDefinitions, EventsDefinitions, MethodsDefinitions } from "./custom_element";
import { type Dependency, getDependencyHandler } from "./main_fn_api";
import { AttributeApi, ConstructorArgs, Value } from "./type.utils";
import { ListenerController, nodeHasClassName } from "./utils";

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

const everyNodeHasClassName = (nodes: NodeList, className: string) => {
  for (const n of nodes) {
    if (!nodeHasClassName(n, className)) return false;
  }
  return true;
};

const bindAll = (methods: Record<string, (...args: any[]) => any>) => {
  for (const key in methods) {
    const method = methods[key]!;
    methods[key] = method.bind(methods);
  }
  return methods;
};

/**
 * The api object handed to `getMethods` — identical to `MethodsApi` except
 * `method` is absent: it is the very value this callback computes, so it is
 * still undefined while the callback runs.
 */
export type GetMethodsApi<
  Attr extends AttributesDefinitions,
  Evnts extends EventsDefinitions,
  Ctx extends object,
> = Omit<MethodsApi<Attr, Evnts, Ctx>, "method">;

/**
 * The single per-instance api object handed to `getMethods` and to the
 * connected callback.
 */
export class MethodsApi<
  Attr extends AttributesDefinitions,
  Evnts extends EventsDefinitions,
  Ctx extends object,
  Methods extends MethodsDefinitions = {},
> {
  readonly attribute: AttributeApi<Attr>;

  readonly method: Methods;

  readonly context: Ctx;

  private readonly _thisElement: HTMLElement;
  private readonly cleanups: CleanupController;
  protected readonly attributeController: AttributeController;
  private readonly getRoot: () => HTMLElement | ShadowRoot;
  protected readonly eventsRecord: Evnts;
  private readonly getChildrenPortal: () => HTMLDivElement;
  private readonly childrenChangeCallbacks: Array<(children: Array<Element | Text>) => void> = [];
  private readonly readyCallbacks: Array<() => any> = [];
  private isMutCbQueued = false;

  constructor(
    thisElement: HTMLElement,
    cleanups: CleanupController,
    attributeController: AttributeController,
    getRoot: () => HTMLElement | ShadowRoot,
    eventsRecord: Evnts,
    attributes: Attr,
    context: Ctx,
    getChildrenPortal: () => HTMLDivElement,
    getMethods: (api: GetMethodsApi<Attr, Evnts, Ctx>) => Methods,
  ) {
    this._thisElement = thisElement;
    this.cleanups = cleanups;
    this.attributeController = attributeController;
    this.getRoot = getRoot;
    this.eventsRecord = eventsRecord;
    this.getChildrenPortal = getChildrenPortal;
    this.context = context;
    this.attribute = attributeController.getAttributesApi(attributes);

    const methods = getMethods(this) as Record<string, (...args: any[]) => any>;
    this.method = bindAll(methods) as Methods;

    cleanups.add(() => {
      this.childrenChangeCallbacks.splice(0, this.childrenChangeCallbacks.length);
      this.readyCallbacks.splice(0, this.readyCallbacks.length);
    });
  }

  get thisElement(): HTMLElement {
    return this._thisElement;
  }

  get isMounted(): boolean {
    // @ts-expect-error
    return this._thisElement.isMounted;
  }

  get childrenPortal(): HTMLDivElement {
    return this.getChildrenPortal();
  }

  protected get root(): HTMLElement | ShadowRoot {
    return this.getRoot();
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
    const children: Array<Element | Text> = [];
    for (let node = this._thisElement.firstChild; node !== null; node = node.nextSibling) {
      if (nodeHasClassName(node, "_wc_toolkit_content_container")) continue;
      children.push(node as Element | Text);
    }
    return children;
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
    this.cleanups.once(() => {
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
    this.cleanups.once(() => {
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
    this.cleanups.once(() => {
      controller.destroy();
    });
    return controller;
  }

  emitEvent<E extends Value<Evnts>>(event: InstanceType<E>): EmitEventResult;
  emitEvent<K extends keyof Evnts>(eventName: K, ...args: ConstructorArgs<Evnts[K]>): EmitEventResult;
  emitEvent(arg0: keyof Evnts | Event, ...rest: any[]): EmitEventResult {
    let event: Event;
    if (typeof arg0 === "string") {
      const Constructor = this.eventsRecord[arg0];

      if (!Constructor) {
        throw new Error(`invalid error type: '${arg0}'`);
      }

      event = new Constructor(arg0, ...rest);
    } else {
      event = arg0 as Event;
    }

    const shouldCommit = this._thisElement.dispatchEvent(event);

    if (shouldCommit) {
      return CONFITMED_EMIT;
    }

    return CANCELLED_EMIT;
  }

  protected mutationObservedCallback(mutationRecords: MutationRecord[]) {
    if (this.isMutCbQueued) {
      return;
    }

    if (
      mutationRecords.every(mut =>
        mut.type !== "characterData"
        && everyNodeHasClassName(mut.addedNodes, "_wc_toolkit_content_container")
        && everyNodeHasClassName(mut.removedNodes, "_wc_toolkit_content_container")
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
      try {
        cb();
      } catch (err) {
        console.error(err);
      }
    }
  }

  protected triggerChildrenChange(skipIfZero = false) {
    const children = this.getChildren();
    if (skipIfZero && children.length === 0) {
      return;
    }
    for (const cb of this.childrenChangeCallbacks) {
      try {
        cb(children);
      } catch (err) {
        console.error(err);
      }
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

  hasReadyCallbacks() {
    return this.readyCallbacks.length > 0;
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
      const depHandler = getDependencyHandler(dep);

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
