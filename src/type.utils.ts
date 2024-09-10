import { Attribute } from "./attribute";
import { AttributesDefinitions, EventsDefinitions, LiteralType } from "./custom_element";

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : Readonly<T>;

type ToCamelCase<S> = S extends `${infer F}-${infer R}` ? `${F}${Capitalize<R>}` : S;

type AsString<T> = T extends string ? T : never;

export interface AttributeParser<T> {
  fromString(value: string): T | null;
  intoString(value: T | null): string;
}

type LiteralToTypeMap = {
  "string": string;
  "number": number;
  "boolean": boolean;
  "string[]": string[];
  "number[]": number[];
};

export type TypeOfParser<T> = T extends AttributeParser<infer U> ? U : never;

export type TypeForLiteral<T extends LiteralType> = T extends keyof LiteralToTypeMap ? LiteralToTypeMap[T]
  : TypeOfParser<T>;

export type AttributeApi<Attr extends AttributesDefinitions> = {
  [K in keyof Attr]: Attribute<AsString<K>, TypeForLiteral<Attr[K]>>;
};

export type AttributeAccessors<Attr extends AttributesDefinitions> = {
  [K in keyof Attr as ToCamelCase<K>]: DeepReadonly<TypeForLiteral<Attr[K]>> | null;
};

export type EventAttributeAcessors<Evnts extends EventsDefinitions> = {
  [K in Evnts[number] as `on${Lowercase<K>}`]: (event: Event) => void | null;
};

export type EvenListenerFunctions<Evnts extends EventsDefinitions> = {
  addEventListener<K extends keyof HTMLElementEventMap | Lowercase<Evnts[number]>>(
    type: K,
    listener: (this: HTMLElement, ev: K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K] : Event) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof HTMLElementEventMap | Lowercase<Evnts[number]>>(
    type: K,
    listener: (this: HTMLElement, ev: K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K] : Event) => any,
    options?: boolean | EventListenerOptions,
  ): void;
};
