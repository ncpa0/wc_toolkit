import { LiteralType } from "./custom_element";
import { TypeForLiteral } from "./type.utils";

export type AttrChangeEvDetail = { attributeName: string; previousValue: string; newValue: string };

export class Attribute<K extends string, T extends TypeForLiteral<LiteralType>> {
  constructor(
    private readonly controller: AttributeController,
    private readonly attrType: LiteralType,
    public readonly key: K,
  ) {
    this.controller.registerProxy(this);
  }

  private stringToAttrType(value: string | null): T | null {
    let result: any = value;

    if (value == null) {
      if (this.attrType === "boolean") {
        return false as any;
      }
      return null;
    }

    switch (this.attrType) {
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
    }

    return result;
  }

  private attrTypeToString(value: T): string | null {
    let result: string | null = value as any;

    switch (this.attrType) {
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
    }

    return result;
  }

  get(): T | null {
    return this.stringToAttrType(this.controller.get(this.key)!);
  }

  set(value: T): void {
    const stringified = this.attrTypeToString(value);
    if (stringified != null) {
      this.controller.set(this.key, stringified);
    } else {
      this.unset();
    }
  }

  unset(): void {
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
}

export class AttributeController {
  private readonly emitter = new EventTarget();
  private readonly attrProxies = new Map<string, Attribute<string, any>>();

  constructor(
    private readonly element: HTMLElement,
  ) {}

  registerProxy(attrProxy: Attribute<string, any>) {
    this.attrProxies.set(attrProxy.key, attrProxy);
  }

  getProxy(attrName: string) {
    return this.attrProxies.get(attrName);
  }

  attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string,
  ) {
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
    this.element.setAttribute(attributeName, value);
  }

  unset(attributeName: string) {
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
