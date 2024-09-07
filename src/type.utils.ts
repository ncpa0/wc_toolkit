import { Attribute } from "./attribute";
import { AttributesDefinitions, LiteralType } from "./custom_element";

type ToCamelCase<S> = S extends `${infer F}-${infer R}` ? `${F}${Capitalize<R>}` : S;

type AsString<T> = T extends string ? T : never;

export type TypeForLiteral<T extends LiteralType> = {
  "string": string;
  "number": number;
  "boolean": boolean;
  "string[]": string[];
  "number[]": number[];
}[T];

export type AttributeApi<Attr extends AttributesDefinitions> = {
  [K in keyof Attr]: Attribute<AsString<K>, TypeForLiteral<Attr[K]>>;
};

export type AttributeAccessors<Attr extends AttributesDefinitions> = {
  [K in keyof Attr as ToCamelCase<K>]: TypeForLiteral<Attr[K]> | null;
};
