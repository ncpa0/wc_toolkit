import { AttributeOptionsMap, AttributesDefinitions, AttrOptions, LiteralType } from "./custom_element";
import { AttributeApi, TypeForLiteral } from "./type.utils";
import { ListSerializer, toAttributeName } from "./utils";

export type AttrChangeEvDetail = { attributeName: string; previousValue: string; newValue: string };

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
        result = true;
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

  get(): T | null {
    if (this.valueMemo) {
      return this.valueMemo;
    }
    const result = this.stringToAttrType(this.controller.get(this.attrKey)!);
    this.valueMemo = result;
    return result;
  }

  set(value: T | null): void {
    const stringified = this.attrTypeToString(value);
    this.valueMemo = value;
    if (stringified != null) {
      this.controller.set(this.attrKey, stringified);
    } else {
      this.unset();
    }
  }

  unset(): void {
    this.valueMemo = null;
    this.controller.unset(this.attrKey);
  }

  onChange(cb: (value: T | null) => void): () => void {
    const listenerHandler = (_: CustomEvent<AttrChangeEvDetail>) => {
      cb(this.get());
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

  constructor(
    public readonly element: HTMLElement,
  ) {}

  getAttributesApi<Attr extends AttributesDefinitions>(
    attributes: Attr,
    attributeOptions?: AttributeOptionsMap<keyof Attr>,
  ) {
    const api = Object.fromEntries(
      Object.entries(attributes).map(([k, def]) => {
        return [k, this.getOrCreateProxy(k, def, attributeOptions)];
      }),
    ) as AttributeApi<Attr>;
    return api;
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
    this.getProxy(name)?.["clearMemo"]();
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
    this.emitter.addEventListener(attributeName, listener as any, options);
  }

  removeEventListener(
    attributeName: string,
    listener: (ev: CustomEvent<AttrChangeEvDetail>) => void,
  ) {
    this.emitter.removeEventListener(attributeName, listener as any);
  }
}
