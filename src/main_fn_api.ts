import { Attribute } from "./attribute";
import { AttributesDefinitions, EventsDefinitions, MethodsDefinitions } from "./custom_element";
import type { MethodsApi } from "./methods_api";

declare global {
  interface WcToolkitDependencies {
    attribute: Attribute<string, any>;
  }
}

export type Dependency = WcToolkitDependencies[keyof WcToolkitDependencies];

export interface DependencyHandler<T> {
  detect(v: unknown): v is T;
  onChange(v: T, cb: () => void): () => void;
}

const ATTR_DEP_HANDLER = class {
  static detect(v: unknown): v is Attribute<string, any> {
    return v instanceof Attribute;
  }
  static onChange(attr: Attribute<string, any>, cb: () => void): () => void {
    return attr.onChange(cb);
  }
};

// the dependency handlers are global, not per instance
const dependencyHandlers: Array<DependencyHandler<any>> = [ATTR_DEP_HANDLER];

export function addDependencyHandler(handler: DependencyHandler<any>) {
  dependencyHandlers.push(handler);
}

export function getDependencyHandler(v: unknown): DependencyHandler<any> {
  for (const handler of dependencyHandlers) {
    if (handler.detect(v)) {
      return handler;
    }
  }
  throw new Error(
    "Invalid dependency, make sure the dependency is of supported type or add a new dependency handler",
  );
}

export function registerDependencyHandler<T>(handler: DependencyHandler<T>) {
  addDependencyHandler(handler);
}

/**
 * The api object given to the connected callback — the same flat
 * per-instance api object that is given to `getMethods`.
 */
export type ConnectedCallbackApi<
  Attr extends AttributesDefinitions,
  Evnts extends EventsDefinitions,
  Ctx extends object,
  Methods extends MethodsDefinitions,
> = MethodsApi<Attr, Evnts, Ctx, Methods>;
