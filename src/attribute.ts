import { AttributeOptionsMap, AttributesDefinitions, AttrOptions, LiteralType } from "./custom_element";
import { AttributeApi, TypeForLiteral } from "./type.utils";
import { ListSerializer, toAttributeName } from "./utils";

/**
 * Attribute change listener invoked directly with the attribute value —
 * the freshly parsed value from the attribute proxy, or the raw attribute
 * string when no proxy is registered for the name.
 */
export type AttrChangeListener = (value: any) => void;

type AttrListenerEntry = {
  listener: AttrChangeListener;
  once: boolean;
};

const NEVER_CALLED = Symbol("CALLBACK_NEVER_CALLED");

export class Attribute<K extends string, T> {
  public static new = <K extends string, T>(
    controller: AttributeController,
    attrType: LiteralType,
    key: K,
    options?: AttrOptions,
  ) => {
    return new Attribute(controller, attrType, key, options);
  };

  static extend(getExtended: (constructor: typeof Attribute) => typeof Attribute) {
    const NewConstructor = getExtended(Attribute as any);
    Attribute.new = <K extends string, T>(
      controller: AttributeController,
      attrType: LiteralType,
      key: K,
      options?: AttrOptions,
    ) => {
      return new NewConstructor(controller, attrType, key, options);
    };
  }

  private memoHasValue = false;
  private valueMemo: T | null = null;
  public readonly attrKey: string;

  constructor(
    private readonly controller: AttributeController,
    protected readonly attrType: LiteralType,
    public readonly propName: K,
    protected readonly options?: AttrOptions,
  ) {
    this.attrKey = options?.htmlName ?? toAttributeName(this.propName);
    this.onCreatedCallback();

    this.controller.registerProxy(this);
  }

  private clearMemo() {
    this.memoHasValue = false;
    this.valueMemo = null;
  }

  protected stringToAttrType(value: string | null): T | null {
    let result: any;

    if (value == null) {
      if (this.attrType === "boolean") {
        return false as any;
      }
      if (typeof this.attrType === "object") {
        return this.attrType.fromString(value);
      }
      return null;
    }

    switch (this.attrType) {
      case "string":
        result = value;
        break;
      case "boolean":
        result = value === "false" ? false : true;
        break;
      case "number":
        result = Number(value);
        break;
      case "string[]":
        result = ListSerializer.fromString(value);
        break;
      case "number[]":
        result = ListSerializer.fromString(value)
          .map(Number)
          .filter(v => !Number.isNaN(v));
        break;
      default:
        result = this.attrType.fromString(value);
        break;
    }

    return result;
  }

  protected attrTypeToString(value: T | null): string | null {
    let result: string | null = null;

    switch (this.attrType) {
      case "string":
        result = value as any;
        break;
      case "boolean":
        result = value ? this.attrKey : null;
        break;
      case "number":
        if (value != null) {
          result = String(value);
        }
        break;
      case "string[]":
        if (value != null) {
          result = ListSerializer.intoString(value as any[]);
        }
        break;
      case "number[]":
        if (value != null) {
          result = ListSerializer.intoString(value as any[]);
        }
        break;
      default:
        result = this.attrType.intoString(value);
        break;
    }

    return result;
  }

  /** Wether this attribute is currently set or not. */
  has(): boolean {
    return this.controller.has(this.attrKey);
  }

  get(): T | null {
    // memoized values go stale for `observe: false` attributes after an
    // external `setAttribute` — nothing clears the memo; deliberate
    if (this.memoHasValue) return this.valueMemo;
    const result = this.stringToAttrType(this.controller.get(this.attrKey)!);
    this.valueMemo = result;
    this.memoHasValue = true;
    return result;
  }

  set(value: T | null): void {
    const stringified = this.attrTypeToString(value);
    this.valueMemo = value;
    this.memoHasValue = true;
    if (stringified != null) {
      this.controller.set(this.attrKey, stringified);
    } else {
      this.unset();
    }
  }

  unset(): void {
    this.valueMemo = null;
    this.memoHasValue = false;
    this.controller.unset(this.attrKey);
  }

  onChange(cb: (value: T | null) => void): () => void {
    let lastValue: T | null | typeof NEVER_CALLED = NEVER_CALLED;
    const listenerHandler = (value: T | null) => {
      if (value === lastValue) return;
      lastValue = value;
      cb(value);
    };
    this.controller.addEventListener(this.attrKey, listenerHandler);
    return () => {
      this.controller.removeEventListener(this.attrKey, listenerHandler);
    };
  }

  protected onCreatedCallback() {}
}

export class AttributeController {
  private readonly attrProxies = new Map<string, Attribute<string, any>>();
  private attributesApiCache: Record<string, Attribute<string, any>> | null = null;
  /**
   * Listener-name → slot index. Seeded with the definition-time indexes
   * (see `attrListenerNameIndexes` in `customElement().connected()`);
   * read-only, no per-instance copy is taken.
   */
  private readonly listenerNameIndexes: ReadonlyMap<string, number>;
  /**
   * Names outside the definition get appended slots here; the map and its
   * starting index are only computed when such a name first registers.
   */
  private ownNameIndexes: Map<string, number> | null = null;
  private nextFreeIndex: number | null = null;
  /**
   * Listener arrays indexed by the definition-time attribute index;
   * slots are created on first use.
   */
  private readonly listenerSlots: Array<Array<AttrListenerEntry> | undefined> = [];

  constructor(
    public readonly element: HTMLElement,
    listenerNameIndexes?: ReadonlyMap<string, number>,
  ) {
    this.listenerNameIndexes = listenerNameIndexes ?? new Map();
  }

  private getListenerIndex(attributeName: string): number {
    const defined = this.listenerNameIndexes.get(attributeName);
    if (defined !== undefined) {
      return defined;
    }
    const own = (this.ownNameIndexes ??= new Map());
    let index = own.get(attributeName);
    if (index === undefined) {
      let next = this.nextFreeIndex;
      if (next === null) {
        next = 0;
        for (const index_ of this.listenerNameIndexes.values()) {
          if (index_ >= next) next = index_ + 1;
        }
      }
      own.set(attributeName, next);
      this.nextFreeIndex = next + 1;
      index = next;
    }
    return index;
  }

  private peekListenerIndex(attributeName: string): number | undefined {
    const defined = this.listenerNameIndexes.get(attributeName);
    return defined !== undefined ? defined : this.ownNameIndexes?.get(attributeName);
  }

  private getListeners(attributeName: string): Array<AttrListenerEntry> {
    const index = this.getListenerIndex(attributeName);
    let listeners = this.listenerSlots[index];
    if (listeners === undefined) {
      listeners = [];
      this.listenerSlots[index] = listeners;
    }
    return listeners;
  }

  getAttributesApi<Attr extends AttributesDefinitions>(
    attributes: Attr,
    attributeOptions?: AttributeOptionsMap<keyof Attr>,
  ) {
    if (this.attributesApiCache === null) {
      this.attributesApiCache = Object.fromEntries(
        Object.entries(attributes).map(([k, def]) => {
          return [k, this.getOrCreateProxy(k, def, attributeOptions)];
        }),
      ) as any;
    }
    return this.attributesApiCache as AttributeApi<Attr>;
  }

  registerProxy(attrProxy: Attribute<string, any>) {
    this.attrProxies.set(attrProxy.propName, attrProxy);
    this.attrProxies.set(attrProxy.attrKey, attrProxy);
  }

  getOrCreateProxy<L extends LiteralType>(
    attrName: string,
    attrType: L,
    attributeOptions?: AttributeOptionsMap<string>,
  ): Attribute<string, TypeForLiteral<L>> {
    let p = this.attrProxies.get(attrName);
    if (!p) {
      p = Attribute.new(this, attrType, attrName, attributeOptions?.[attrName]);
    }
    return p;
  }

  getProxy(attrName: string) {
    return this.attrProxies.get(attrName);
  }

  attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string,
  ) {
    if (oldValue === newValue) return;

    const proxy = this.getProxy(name);
    proxy?.["clearMemo"]();

    const index = this.peekListenerIndex(name);
    const listeners = index === undefined ? undefined : this.listenerSlots[index];
    if (listeners === undefined || listeners.length === 0) {
      return;
    }

    // iterate a snapshot; membership is re-checked before each invocation
    // so a listener removed by an earlier listener in the same dispatch is
    // skipped (the removed-listener semantics of the old EventTarget
    // emitter), and the value is re-read per invocation so listeners
    // observe writes made mid-dispatch (`get()` is a memo hit after the
    // first read); `once` entries are still dropped before their invocation
    const snapshot = listeners.slice();
    for (const entry of snapshot) {
      if (!listeners.some(current => current.listener === entry.listener)) continue;
      if (entry.once) {
        this.removeEventListener(name, entry.listener);
      }
      entry.listener(proxy !== undefined ? proxy.get() : newValue);
    }
  }

  has(attributeName: string) {
    return this.element.hasAttribute(attributeName);
  }

  get(attributeName: string) {
    return this.element.getAttribute(attributeName);
  }

  set(attributeName: string, value: string) {
    this.getProxy(attributeName)?.["clearMemo"]();
    this.element.setAttribute(attributeName, value);
  }

  unset(attributeName: string) {
    this.getProxy(attributeName)?.["clearMemo"]();
    this.element.removeAttribute(attributeName);
  }

  addEventListener(
    attributeName: string,
    listener: AttrChangeListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    // options are not forwarded to an EventTarget anymore, so `signal` is
    // not supported here and the old emitter's capture-partitioned dedup
    // (the same listener registered with and without `capture` fired twice)
    // is not modeled; only `once` has an effect — callers needing `signal`
    // or capture use the element's `addEventListener`
    const once = typeof options === "object" && options.once === true;

    const listeners = this.getListeners(attributeName);

    // an identical listener only ever gets one entry
    for (const entry of listeners) {
      if (entry.listener === listener) return;
    }

    listeners.push({ listener, once });
  }

  removeEventListener(
    attributeName: string,
    listener: AttrChangeListener,
  ) {
    const index = this.peekListenerIndex(attributeName);
    const listeners = index === undefined ? undefined : this.listenerSlots[index];
    if (listeners === undefined) return;

    for (let i = 0; i < listeners.length; i++) {
      if (listeners[i]!.listener === listener) {
        listeners.splice(i, 1);
        return;
      }
    }
  }
}
