import { AttributesDefinitions, LiteralType } from "./custom_element";
import { AttributeApi, TypeForLiteral } from "./type.utils";

export type AttrChangeEvDetail = { attributeName: string; previousValue: string; newValue: string };

export class Attribute<K extends string, T> {
  public static new = <K extends string, T>(controller: AttributeController, attrType: LiteralType, key: K) => {
    return new Attribute(controller, attrType, key);
  };

  static extend(getExtended: (constructor: typeof Attribute) => typeof Attribute) {
    const NewConstructor = getExtended(Attribute as any);
    Attribute.new = <K extends string, T>(controller: AttributeController, attrType: LiteralType, key: K) => {
      return new NewConstructor(controller, attrType, key);
    };
  }

  private valueMemo: T | null = null;

  constructor(
    private readonly controller: AttributeController,
    protected readonly attrType: LiteralType,
    public readonly key: K,
  ) {
    this.controller.registerProxy(this);
    this.onCreatedCallback();
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
        result = value.split(",");
        break;
      case "number[]":
        result = value.split(",").map(Number);
        break;
      default:
        result = this.attrType.fromString(value);
        break;
    }

    return result;
  }

  protected attrTypeToString(value: T): string | null {
    let result: string | null;

    switch (this.attrType) {
      case "string":
        result = value as any;
        break;
      case "boolean":
        result = value ? this.key : null;
        break;
      case "number":
        result = String(value);
        break;
      case "string[]":
        result = (value as any[]).join(",");
        break;
      case "number[]":
        result = (value as any[]).map(String).join(",");
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
    const result = this.stringToAttrType(this.controller.get(this.key)!);
    this.valueMemo = result;
    return result;
  }

  set(value: T): void {
    const stringified = this.attrTypeToString(value);
    this.valueMemo = value;
    if (stringified != null) {
      this.controller.set(this.key, stringified);
    } else {
      this.unset();
    }
  }

  unset(): void {
    this.valueMemo = null;
    this.controller.unset(this.key);
  }

  onChange(cb: (value: T | null) => void): () => void {
    const listenerHandler = (_: CustomEvent<AttrChangeEvDetail>) => {
      cb(this.get());
    };
    this.controller.addEventListener(this.key, listenerHandler);
    return () => {
      this.controller.removeEventListener(this.key, listenerHandler);
    };
  }

  protected onCreatedCallback() {}
}

export class AttributeController {
  private readonly emitter = new EventTarget();
  private readonly attrProxies = new Map<string, Attribute<string, any>>();

  constructor(
    private readonly element: HTMLElement,
  ) {}

  getAttributesApi<Attr extends AttributesDefinitions>(attributes: Attr) {
    const api = Object.fromEntries(
      Object.entries(attributes).map(([k, def]) => {
        return [k, this.getOrCreateProxy(k, def)];
      }),
    ) as AttributeApi<Attr>;
    return api;
  }

  registerProxy(attrProxy: Attribute<string, any>) {
    this.attrProxies.set(attrProxy.key, attrProxy);
  }

  getOrCreateProxy<L extends LiteralType>(attrName: string, attrType: L): Attribute<string, TypeForLiteral<L>> {
    let p = this.attrProxies.get(attrName);
    if (!p) {
      p = Attribute.new(this, attrType, attrName);
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
