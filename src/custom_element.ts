import type { Attribute } from "./attribute";
import { AttributeController } from "./attribute";
import { CleanupController } from "./cleanup_controller";
import { FunctionAttributeParser } from "./function-parser";
import type { ConnectedCallbackApi } from "./main_fn_api";
import { GetMethodsApi, MethodsApi } from "./methods_api";
import {
  AttributeAccessors,
  AttributeApi,
  AttributeDefToNames,
  AttributeParser,
  EvenListenerFunctions,
  EventAttributeAcessors,
  PublicMethods,
} from "./type.utils";
import { ALL_BROWSER_EVENTS_SET, mirroredNode, nodeHasClassName, toAttributeName } from "./utils";

export type CustomElementOptions = {
  /**
   * Whether the element's children should be mirrored into a portal container
   * that the component's rendered content can place wherever it needs them.
   * When enabled, the container is available via the `childrenPortal` property
   * of the connected api.
   *
   * @default false
   */
  childrenPortal?: boolean;
  /**
   * Whether the component's rendered content should be placed in a shadow
   * root instead of a light-DOM container div.
   *
   * @default false
   */
  shadowRoot?: boolean;
  /**
   * Options passed to `attachShadow` when `shadowRoot` is enabled.
   *
   * @default { mode: "open" }
   */
  shadowRootInit?: ShadowRootInit;
  /**
   * Whether the element should not manage its rendered content. When enabled,
   * no content container is created or appended and children of the element
   * are left as direct light-DOM children. Note that the `attach` and
   * `replace` api methods still write into a detached container div that is
   * never appended to the element.
   *
   * @default false
   */
  noContent?: boolean;
  /**
   * Whether mutations of the element's descendants (their childList and
   * characterData) should additionally be observed. Only direct childList
   * mutations of the element are always observed.
   *
   * @default false
   */
  observeSubtree?: boolean;
  /**
   * Whether children of the element should be observed, firing the
   * `onChildrenChange` callbacks of the connected api. When disabled, no
   * children-change callbacks are invoked; the children portal (when enabled)
   * keeps syncing regardless.
   *
   * @default true
   */
  observeChildren?: boolean;
};

export type LiteralType =
  | "string"
  | "number"
  | "boolean"
  | "string[]"
  | "number[]"
  | AttributeParser<any>;

export type AttributesDefinitions = {
  [k: string]: LiteralType;
};

export type EventConstructor<Args extends any[], Ev extends Event> = {
  new(eventType: string, ...args: Args): Ev;
};

export type EventsDefinitions = Record<string, EventConstructor<any[], Event>>;

export type EventNames<E extends EventsDefinitions> = E extends Record<infer Names extends string, any> ? Names
  : never;

export type MethodsDefinitions = {
  [k: string]: (...args: any[]) => any;
};

type ExtendBaseHtmlElem<Custom> = Custom & Omit<HTMLElement, keyof Custom>;

type Rewrap<T> = T extends infer O extends object ? {
    [K in keyof O]: O[K];
  }
  : never;

export type CustomElement<
  Attr extends AttributesDefinitions,
  Evnts extends EventsDefinitions,
  Methods extends MethodsDefinitions,
> = {
  readonly observedAttributes: readonly AttributeDefToNames<Attr>[];

  new(): Rewrap<
    ExtendBaseHtmlElem<
      & PublicMethods<Methods>
      & AttributeAccessors<Attr>
      & EventAttributeAcessors<Evnts>
      & EvenListenerFunctions<Evnts>
      & {
        readonly attributeNames: readonly AttributeDefToNames<Attr>[];
      }
    >
  >;
};

/**
 * Per-instance home for the event wiring: the event proxy slots are filled
 * inside the constructor's event loop, where the proxies are created.
 */
type ElementInstanceState = {
  eventProxies: Array<Attribute<string, any> | undefined>;
  eventOverride: Array<((event: Event) => void) | null>;
  eventHandler: Array<((event: Event) => void) | null>;
};

const INSTANCE_STATE = Symbol("wc_toolkit:instance_state");

/**
 * Structural view of the per-instance `_api` field as seen from the
 * prototype accessor closures; they are defined outside the class body,
 * where the generic class type isn't available.
 */
type ElementApiCarrier = {
  _api: {
    method: Record<string, (...args: any[]) => any>;
    attribute: Record<string, Attribute<string, any>>;
  };
};

type InstanceStateCarrier = { [INSTANCE_STATE]: ElementInstanceState } & ElementApiCarrier;

/**
 * Plain element used as the collision-check surface. The `in` operator must
 * be evaluated against an element instance (not `HTMLElement.prototype`):
 * browsers put the `on*` handlers on the prototype, happy-dom assigns them
 * as own properties on every element. Environments may provide HTMLElement
 * without a `document`; in that case the probe stays null and collision
 * checks fall back to the prototype-only surface.
 */
let collisionProbe: HTMLElement | null = null;

/**
 * Names that the element class itself puts on its instances; an attribute
 * or event accessor key matching one of them cannot be defined.
 */
const ELEMENT_OWN_NAMES = new Set([
  "isMounted",
  "attributeNames",
  "observedAttributes",
  "NAME",
  "root",
  "_root",
  "attributeController",
  "cleanups",
  "_api",
  "childrenContainer",
  "_childrenContainer",
  "_portalMirrors",
  "mutationObserver",
  "connectedCallback",
  "disconnectedCallback",
  "attributeChangedCallback",
  "_cloneChildrenIntoPortal",
]);

export type AttrOptions = {
  /**
   * Override the attribute name as used in the HTML. By default the
   * property name provided is stripped of special characters and all
   * upper case characters are changed to lower case.
   */
  htmlName?: string;
  /**
   * Whether the attribute value changes should be observed. When enabled,
   * changes to the attribute value can be detected by adding a listener
   * via a `onChange` api method.
   *
   * @default true
   */
  observe?: boolean;
};

export type AttributeOptionsMap<AttrKeys extends string | number | symbol> = {
  [K in AttrKeys]?: AttrOptions;
};

export function customElement(tagName: string, options?: CustomElementOptions) {
  const {
    childrenPortal = false,
    noContent = false,
    observeSubtree = false,
    shadowRoot = false,
    shadowRootInit,
    observeChildren = true,
  } = options ?? {};
  return {
    /**
     * Define the attributes of the custom element and the type of their values.
     */
    attributes<Attr extends AttributesDefinitions = {}>(
      attributes: Attr = {} as Attr,
      attributeOptions?: AttributeOptionsMap<keyof Attr>,
    ) {
      return {
        /**
         * Define what events can be emitted by the custom element. For every event, an attribute is
         * added to the custom element that can be set in html. `on${eventType}` properties are also added
         * to element instances that can be manipulated in JavaScript.
         */
        events<const Evnts extends EventsDefinitions = {}>(eventRecords: Evnts = ({} as any)) {
          return {
            /**
             * Context can be used to store the internal state of the custom element. `getContext` param should
             * return the initial context value, it will be called once for every instance of the custom element.
             */
            context<Ctx extends object = {}>(getContext: (attributes: AttributeApi<Attr>) => Ctx = () => ({} as any)) {
              return {
                /**
                 * Define the methods of the custom element. These methods can be later called via the api
                 * object given to the main function or on the instance of the custom element.
                 *
                 * `getMethods` argument will be called in the constructor of the custom element.
                 */
                methods<Methods extends MethodsDefinitions = {}>(
                  getMethods: (
                    // `method` is not exposed here: it is still undefined
                    // while this callback computes it
                    customElementApi: GetMethodsApi<Attr, Evnts, Ctx>,
                  ) => Methods = () => ({} as any),
                ) {
                  return {
                    /**
                     * The main function of the custom element.
                     *
                     * `onConnectedCallback` argument will be called every time the custom element is
                     * mounted in the document, (same as `connectedCallback` in standard web components).
                     */
                    connected(
                      onConnectedCallback: (
                        api: ConnectedCallbackApi<Attr, Evnts, Ctx, Methods>,
                      ) => void | (() => void),
                    ) {
                      // definition-time precomputation: everything below is
                      // derived once per definition instead of per instance
                      const attributeTable = Object.keys(attributes).map((key, index) => {
                        const options = attributeOptions?.[key];
                        return {
                          key,
                          index,
                          htmlName: options?.htmlName ?? toAttributeName(key),
                          observed: options?.observe !== false,
                        };
                      });

                      const observedAttributes: string[] = [];
                      for (const attr of attributeTable) {
                        if (attr.observed) {
                          observedAttributes.push(attr.htmlName);
                        }
                      }

                      let eventStateCount = 0;
                      const eventsTable = Object.keys(eventRecords).map(eventType => {
                        const lowercaseType = eventType.toLowerCase();
                        // only custom events need additional handling
                        const isBrowserEvent = ALL_BROWSER_EVENTS_SET.has(lowercaseType);
                        const stateIndex = isBrowserEvent ? -1 : eventStateCount++;
                        return { eventType, accessorKey: `on${lowercaseType}`, isBrowserEvent, stateIndex };
                      });

                      for (const event of eventsTable) {
                        if (!event.isBrowserEvent) {
                          observedAttributes.push(event.accessorKey);
                        }
                      }

                      Object.freeze(observedAttributes);

                      // collision checks run once per definition; colliding
                      // attribute / event accessor keys get no accessor but
                      // keep their attribute proxies for the attribute machinery
                      const attributeKeySet = new Set(attributeTable.map(attr => attr.key));
                      const eventAccessorKeySet = new Set(
                        eventsTable.filter(event => !event.isBrowserEvent).map(event => event.accessorKey),
                      );
                      if (typeof document !== "undefined") {
                        collisionProbe ??= document.createElement("div");
                      }
                      // the probe is the accurate collision surface (native
                      // on* handlers live as own props in happy-dom), but it
                      // requires a document; the prototype-only fallback is
                      // the best available check without one
                      const collides = (key: string) =>
                        collisionProbe !== null ? key in collisionProbe : key in HTMLElement.prototype;
                      const collidingAttributeKeys = new Set<string>();
                      for (const attr of attributeTable) {
                        const key = attr.key;
                        if (collides(key) || ELEMENT_OWN_NAMES.has(key)) {
                          console.warn(
                            `Property '${key}' already exists on the HTMLElement, cannot assign attribute accessor. [${tagName}]`,
                          );
                          collidingAttributeKeys.add(key);
                        }
                      }
                      const collidingEventAccessorKeys = new Set<string>();
                      for (const event of eventsTable) {
                        if (event.isBrowserEvent) continue;
                        const key = event.accessorKey;
                        if (collides(key) || ELEMENT_OWN_NAMES.has(key) || attributeKeySet.has(key)) {
                          console.warn(
                            `Property '${key}' already exists on the HTMLElement, cannot assign event callback accessor. [${tagName}]`,
                          );
                          collidingEventAccessorKeys.add(key);
                        }
                      }

                      const getRoot = (elem: HTMLElement) => {
                        let root: HTMLElement | ShadowRoot;

                        if (shadowRoot) {
                          const sroot = elem.attachShadow(shadowRootInit ?? { mode: "open" });
                          root = sroot;
                        } else {
                          root = document.createElement("div");
                          root.className = "_wc_toolkit_content_container";
                          root.style.display = "contents";
                        }

                        return root;
                      };

                      // definition-time slot indexes for the attribute
                      // controller's listener arrays: attribute change
                      // listeners are stored in arrays addressed by these
                      // indexes instead of per-name maps
                      const attrListenerNameIndexes = new Map<string, number>();
                      for (const attr of attributeTable) {
                        attrListenerNameIndexes.set(attr.htmlName, attr.index);
                      }
                      let nextListenerIndex = attributeTable.length;
                      for (const event of eventsTable) {
                        if (!event.isBrowserEvent) {
                          attrListenerNameIndexes.set(event.accessorKey, nextListenerIndex++);
                        }
                      }

                      const customEvents = eventsTable.filter(e => !e.isBrowserEvent);

                      const MUTATION_INIT: MutationObserverInit = {
                        childList: true,
                        characterData: true,
                        subtree: observeSubtree,
                      };

                      let methodStateCount = 0;
                      let methodAccessorsDefined = false;
                      const methodStateIndexes = new Map<string, number>();
                      const methodOwnPropKeys = new Set<string>();

                      const elementConstructor = class WcToolkitCustomElement extends HTMLElement {
                        // must be the first initialized field: the shared
                        // prototype event accessors read this state, and they
                        // can be reached while the remaining fields initialize
                        [INSTANCE_STATE]: ElementInstanceState = {
                          eventProxies: [],
                          eventOverride: [],
                          eventHandler: [],
                        };

                        static readonly NAME = tagName;
                        static readonly observedAttributes = observedAttributes;
                        readonly attributeNames = observedAttributes;

                        private _childrenContainer: HTMLDivElement | null = null;
                        private get childrenContainer(): HTMLDivElement {
                          if (this._childrenContainer === null) {
                            const container = document.createElement("div");
                            container.className = "_wc_toolkit_children_container";
                            this._childrenContainer = container;
                          }
                          return this._childrenContainer;
                        }

                        // shadow roots must be observable on the host element
                        // immediately after `createElement` (contract), so
                        // shadow mode allocates here; the non-shadow content
                        // container div is allocated on first use instead
                        private _root: HTMLElement | ShadowRoot | null = shadowRoot ? getRoot(this) : null;
                        private get root(): HTMLElement | ShadowRoot {
                          return this._root ??= getRoot(this);
                        }

                        private readonly attributeController = new AttributeController(
                          this,
                          attrListenerNameIndexes,
                        );
                        private readonly cleanups = new CleanupController();
                        private readonly _api: MethodsApi<Attr, Evnts, Ctx, Methods> = new MethodsApi(
                          this,
                          this.cleanups,
                          this.attributeController,
                          () => this.root,
                          eventRecords,
                          attributes,
                          getContext(
                            this.attributeController.getAttributesApi(attributes, attributeOptions),
                          ),
                          () => this.childrenContainer,
                          getMethods,
                        );

                        public isMounted = false;

                        constructor() {
                          super();

                          // must not be enumerable, or `{...elem}` copies
                          // the whole internal state out of the instance
                          Object.defineProperty(this, INSTANCE_STATE, {
                            value: this[INSTANCE_STATE],
                            writable: false,
                            enumerable: false,
                            configurable: false,
                          });

                          const state = this[INSTANCE_STATE];
                          const boundMethods = this._api.method as Record<string, (...args: any[]) => any>;

                          if (!methodAccessorsDefined) {
                            // method accessors are defined on the prototype
                            // the first time the method keys are known; later
                            // instances skip straight to the own-prop loop
                            for (const key in boundMethods) {
                              if (methodStateIndexes.has(key) || methodOwnPropKeys.has(key)) continue;

                              if (
                                collides(key) || ELEMENT_OWN_NAMES.has(key)
                                || attributeKeySet.has(key) || eventAccessorKeySet.has(key)
                              ) {
                                // the method keeps the name (methods were defined
                                // first); the displaced attribute / event accessor
                                // gets an own method property on every instance
                                // instead and warns once
                                methodOwnPropKeys.add(key);
                                if (attributeKeySet.has(key) && !collidingAttributeKeys.has(key)) {
                                  console.warn(
                                    `Property '${key}' already exists on the HTMLElement, cannot assign attribute accessor. [${tagName}]`,
                                  );
                                }
                                if (eventAccessorKeySet.has(key) && !collidingEventAccessorKeys.has(key)) {
                                  console.warn(
                                    `Property '${key}' already exists on the HTMLElement, cannot assign event callback accessor. [${tagName}]`,
                                  );
                                }
                                continue;
                              }

                              const stateIndex = methodStateCount++;
                              methodStateIndexes.set(key, stateIndex);
                              Object.defineProperty(elementConstructor.prototype, key, {
                                enumerable: false,
                                configurable: false,
                                get: function(this: ElementApiCarrier) {
                                  return this._api.method[key];
                                },
                              });
                            }
                            methodAccessorsDefined = true;
                          }

                          if (methodOwnPropKeys.size > 0) {
                            for (const key in boundMethods) {
                              if (methodOwnPropKeys.has(key)) {
                                Object.defineProperty(this, key, {
                                  enumerable: false,
                                  configurable: false,
                                  writable: false,
                                  value: boundMethods[key]!,
                                });
                              }
                            }
                          }

                          let event: typeof customEvents[0];
                          for (let i = 0; i < customEvents.length; i++) {
                            event = customEvents[i]!;

                            const stateIndex = event.stateIndex;
                            const attrProxy = this.attributeController.getOrCreateProxy(
                              event.accessorKey,
                              FunctionAttributeParser,
                              attributeOptions,
                            );
                            state.eventProxies[stateIndex] = attrProxy;

                            this.addEventListener(event.eventType, (event) => {
                              const override = state.eventOverride[stateIndex];
                              if (override) {
                                return override(event);
                              }

                              const handler = state.eventHandler[stateIndex];
                              if (handler) {
                                return handler(event);
                              }
                            });

                            attrProxy.onChange(() => {
                              state.eventHandler[stateIndex] = attrProxy.get();
                            });
                          }
                        }

                        private _portalMirrors: Map<Node, ReturnType<typeof mirroredNode>> | null = null;
                        private _cloneChildrenIntoPortal() {
                          if (!childrenPortal) {
                            return;
                          }

                          const portalMirrors = this._portalMirrors ??= new Map();

                          for (const [child, mirror] of portalMirrors) {
                            if (child.parentNode !== this) {
                              portalMirrors.delete(child);
                              mirror.remove();
                              const mirrorNode = mirror.current();
                              // only ever touch the mirror node while it
                              // lives in the portal container; if a consumer
                              // moved it out, leave their DOM alone
                              if (mirrorNode.parentNode === this.childrenContainer) {
                                this.childrenContainer.removeChild(mirrorNode);
                              }
                            }
                          }

                          for (
                            let child = this.firstChild;
                            child !== null;
                            child = child.nextSibling
                          ) {
                            if (nodeHasClassName(child, "_wc_toolkit_content_container")) {
                              continue;
                            }
                            if (!portalMirrors.has(child)) {
                              portalMirrors.set(child, mirroredNode(child as Element));
                            }
                          }

                          const desired: Node[] = [];
                          for (
                            let child = this.firstChild;
                            child !== null;
                            child = child.nextSibling
                          ) {
                            if (nodeHasClassName(child, "_wc_toolkit_content_container")) {
                              continue;
                            }
                            desired.push(portalMirrors.get(child)!.current());
                          }

                          const current = this.childrenContainer.childNodes;
                          let matches = current.length === desired.length;
                          if (matches) {
                            for (let i = 0; i < desired.length; i++) {
                              if (current[i] !== desired[i]) {
                                matches = false;
                                break;
                              }
                            }
                          }
                          if (!matches) {
                            const desiredSet = new Set<Node>(desired);
                            for (const node of Array.from(current)) {
                              if (!desiredSet.has(node)) {
                                node.remove();
                              }
                            }
                            for (const node of desired) {
                              this.childrenContainer.appendChild(node);
                            }
                          }
                        }

                        private mutationObserver?: MutationObserver;
                        connectedCallback() {
                          this.classList.add("_wc_toolkit_custom_element");
                          this.isMounted = true;

                          if (!noContent) {
                            if (!(this.root instanceof ShadowRoot)) {
                              this.append(this.root);
                            }

                            this._cloneChildrenIntoPortal();
                          }

                          const cleanup = onConnectedCallback(this._api);
                          if (cleanup) {
                            this.cleanups.once(cleanup);
                          }

                          if (observeChildren || (!noContent && childrenPortal)) {
                            if (!this.mutationObserver) {
                              this.mutationObserver = new MutationObserver((mutationRecords) => {
                                if (!noContent) {
                                  const childLenghtCahnged = mutationRecords.some(r =>
                                    r.addedNodes.length > 0 || r.removedNodes.length > 0
                                  );
                                  if (childLenghtCahnged) {
                                    this._cloneChildrenIntoPortal();
                                  }
                                }

                                if (observeChildren) {
                                  this._api["mutationObservedCallback"](mutationRecords);
                                }
                              });
                            }
                            this.mutationObserver!.observe(this, MUTATION_INIT);
                            this.cleanups.once(() => {
                              this.mutationObserver!.disconnect();
                            });
                          }

                          if (observeChildren || this._api.hasReadyCallbacks()) {
                            setTimeout(() => {
                              this._api["triggerChildrenChange"](true);
                              this._api["triggerReadyCallbacks"]();
                            });
                          }
                        }

                        disconnectedCallback() {
                          this.isMounted = false;

                          if (!noContent) {
                            // don't force-allocate the lazy root just to remove it
                            if (!(this._root instanceof ShadowRoot)) {
                              this._root?.remove();
                            }
                          }

                          this.cleanups.runCleanups();
                        }

                        attributeChangedCallback(name: string, oldValue: string, newValue: string) {
                          this.attributeController.attributeChangedCallback(name, oldValue, newValue);
                        }
                      };

                      // the attribute / method accessors throw when touched
                      // inside getContext()/methods() — those callbacks run
                      // before the per-instance api object exists; mutate
                      // in connected() instead
                      for (const attr of attributeTable) {
                        if (collidingAttributeKeys.has(attr.key)) continue;
                        Object.defineProperty(elementConstructor.prototype, attr.key, {
                          enumerable: false,
                          configurable: false,
                          get: function(this: ElementApiCarrier) {
                            const proxy = this._api.attribute[attr.key];
                            return proxy?.get();
                          },
                          set: function(this: ElementApiCarrier, value: any) {
                            const proxy = this._api.attribute[attr.key];
                            proxy?.set(value);
                          },
                        });
                      }

                      const definedEventAccessorKeys = new Set<string>();
                      for (const event of customEvents) {
                        if (collidingEventAccessorKeys.has(event.accessorKey)) continue;
                        // event names differing only in case share an
                        // accessor key; redefining the non-configurable
                        // property would throw, so the second entry only
                        // warns and both keep their listener machinery
                        if (definedEventAccessorKeys.has(event.accessorKey)) {
                          console.warn(
                            `Property '${event.accessorKey}' already exists on the HTMLElement, cannot assign event callback accessor. [${tagName}]`,
                          );
                          continue;
                        }
                        definedEventAccessorKeys.add(event.accessorKey);
                        const stateIndex = event.stateIndex;
                        const lowercaseType = event.accessorKey.slice(2);
                        Object.defineProperty(elementConstructor.prototype, event.accessorKey, {
                          enumerable: false,
                          configurable: false,
                          get: function(this: InstanceStateCarrier) {
                            const state = this[INSTANCE_STATE];
                            return state.eventOverride[stateIndex] ?? state.eventProxies[stateIndex]?.get();
                          },
                          set: function(this: InstanceStateCarrier, value: any) {
                            const state = this[INSTANCE_STATE];
                            if (value == null) {
                              state.eventOverride[stateIndex] = null;
                              return;
                            }

                            if (typeof value !== "function") {
                              throw new TypeError(`'on${lowercaseType}' must be a Function`);
                            }

                            state.eventOverride[stateIndex] = value;
                          },
                        });
                      }

                      return {
                        CustomElement: elementConstructor as any as CustomElement<Attr, Evnts, Methods>,
                        /**
                         * Register the custom element in the current window's CustomElementRegistry.
                         */
                        register(): { CustomElement: CustomElement<Attr, Evnts, Methods> } {
                          customElements.define(elementConstructor.NAME, elementConstructor);
                          return this;
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}
