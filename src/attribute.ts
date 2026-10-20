import { AttributeOptionsMap, AttributesDefinitions, AttrOptions, LiteralType } from "./custom_element";
import { AttributeApi, TypeForLiteral } from "./type.utils";
import { ListSerializer, toAttributeName } from "./utils";

export type AttrChangeEvDetail = { attributeName: string; previousValue: string; newValue: string };

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
    const listenerHandler = (_: CustomEvent<AttrChangeEvDetail>) => {
      const value = this.get();
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
  private readonly emitter = new EventTarget();
  private readonly attrProxies = new Map<string, Attribute<string, any>>();
  private attributesApiCache: Record<string, Attribute<string, any>> | null = null;
  private readonly listenersByAttr = new Map<string, Set<unknown>>();
  private readonly alwaysDispatch = new Set<string>();

  constructor(
    public readonly element: HTMLElement,
  ) {}

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

    this.getProxy(name)?.["clearMemo"]();
    // names registered with options can't be modeled by the listener
    // sets (capture variants), so they always dispatch
    if (!this.alwaysDispatch.has(name) && (this.listenersByAttr.get(name)?.size ?? 0) === 0) {
      return;
    }
    this.emitter.dispatchEvent(
      new CustomEvent<AttrChangeEvDetail>(name, {
        detail: {
          attributeName: name,
          previousValue: oldValue,
          newValue,
        },
      }),
    );
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
    listener: (ev: CustomEvent<AttrChangeEvDetail>) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (options != null) {
      this.alwaysDispatch.add(attributeName);
    } else {
      let set = this.listenersByAttr.get(attributeName);
      if (!set) {
        set = new Set();
        this.listenersByAttr.set(attributeName, set);
      }
      set.add(listener);
    }
    this.emitter.addEventListener(attributeName, listener as any, options);
  }

  removeEventListener(
    attributeName: string,
    listener: (ev: CustomEvent<AttrChangeEvDetail>) => void,
  ) {
    this.listenersByAttr.get(attributeName)?.delete(listener);
    this.emitter.removeEventListener(attributeName, listener as any);
  }
}
