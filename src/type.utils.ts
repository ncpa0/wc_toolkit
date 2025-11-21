import { Attribute } from "./attribute";
import {
  AttributesDefinitions,
  CustomElement,
  EventNames,
  EventsDefinitions,
  LiteralType,
  MethodsDefinitions,
} from "./custom_element";

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : Readonly<T>;

type AsString<T> = T extends string ? T : never;

export interface AttributeParser<T> {
  fromString(value: string | null): T | null;
  intoString(value: T | null): string | null;
}

type LiteralToTypeMap = {
  "string": string;
  "number": number;
  "boolean": boolean;
  "string[]": string[];
  "number[]": number[];
};

export type Decapitalize<S extends string> = S extends `${infer F}${infer R}` ? `${Lowercase<F>}${R}` : S;

export type PropNameToAttrName<T extends string> = T extends `${infer Letter}${infer Rest}`
  ? Letter extends UppercaseChar ? `-${Lowercase<Letter>}${PropNameToAttrName<Rest>}`
  : `${Letter}${PropNameToAttrName<Rest>}`
  : T;

export type TypeOfParser<T> = T extends AttributeParser<infer U> ? U : never;

export type TypeForLiteral<T extends LiteralType> = T extends keyof LiteralToTypeMap ? LiteralToTypeMap[T]
  : TypeOfParser<T>;

export type AttributeApi<Attr extends AttributesDefinitions> = {
  [K in keyof Attr]: Attribute<AsString<K>, TypeForLiteral<Attr[K]>>;
};

export type AttributeAccessors<Attr extends AttributesDefinitions> = {
  [K in keyof Attr]: DeepReadonly<TypeForLiteral<Attr[K]>> | null;
};

export type AttributeDefToNames<Attr extends AttributesDefinitions> = PropNameToAttrName<
  Decapitalize<AsString<keyof Attr>>
>;

export type EventAttributeAcessors<Evnts extends EventsDefinitions> = {
  [K in EventNames<Evnts> as `on${Lowercase<K>}`]: ((event: InstanceType<Evnts[K]>) => void) | null;
};

export type PublicMethods<Methods extends MethodsDefinitions> = {
  [K in keyof Methods as K extends `_${string}` ? never : K]: Methods[K];
};

export type EvenListenerFunctions<Evnts extends EventsDefinitions> = {
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
} & {
  addEventListener<K extends EventNames<Evnts>>(
    type: K,
    listener: (this: HTMLElement, ev: InstanceType<Evnts[K]>) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends EventNames<Evnts>>(
    type: K,
    listener: (this: HTMLElement, ev: InstanceType<Evnts[K]>) => any,
    options?: boolean | EventListenerOptions,
  ): void;
};

type UppercaseChar =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

export type AttributeNamesOf<E extends CustomElement<any, any, any>> = E extends CustomElement<infer Attr, any, any>
  ? keyof Attr
  : never;

export type EventsOf<E extends CustomElement<any, any, any>> = E extends CustomElement<any, infer Evnts, any> ? Evnts
  : {};

export type EventNamesOf<E extends CustomElement<any, any, any>> = E extends CustomElement<any, infer Evnts, any>
  ? EventNames<Evnts>
  : never;

export type AttributesOf<E extends CustomElement<any, any, any>> = E extends CustomElement<infer Attr, any, any>
  ? { [K in keyof Attr]: TypeForLiteral<Attr[K]> | null }
  : never;

export type Value<O extends object> = O extends Record<any, infer Values> ? Values : never;

export type ConstructorArgs<C> = C extends {
  new(type: string, ...args: infer Args): any;
} ? Args
  : [];
