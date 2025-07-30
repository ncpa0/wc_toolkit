import { AttributeController } from "./attribute";
import { FunctionAttributeParser } from "./function-parser";
import { ConnectedCallbackApi } from "./main_fn_api";
import { MethodsApi } from "./methods_api";
import {
  AttributeAccessors,
  AttributeApi,
  AttributeDefToNames,
  AttributeParser,
  EvenListenerFunctions,
  EventAttributeAcessors,
  PublicMethods,
} from "./type.utils";
import { ALL_BROWSER_EVENTS, mirroredNode, toAttributeName } from "./utils";

export type CustomElementOptions = {
  childrenPortal?: boolean;
  shadowRoot?: boolean;
  shadowRootInit?: ShadowRootInit;
  noContent?: boolean;
  observeSubtree?: boolean;
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

export type EventsDefinitions = string[];

export type MethodsDefinitions = {
  [k: string]: (...args: any[]) => any;
};

export type CustomElement<
  Attr extends AttributesDefinitions,
  Evnts extends EventsDefinitions,
  Methods extends MethodsDefinitions,
> = {
  readonly observedAttributes: readonly AttributeDefToNames<Attr>[];

  new():
    & HTMLElement
    & PublicMethods<Methods>
    & AttributeAccessors<Attr>
    & EventAttributeAcessors<Evnts>
    & EvenListenerFunctions<Evnts>
    & {
      readonly attributeNames: readonly AttributeDefToNames<Attr>[];
    };
};

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
        events<const Evnts extends EventsDefinitions = []>(events: Evnts = [] as any) {
          events = events.map(e => e.toLowerCase()) as any;
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
                    customElementApi: MethodsApi<Attr, Evnts, Ctx>,
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
                      const observedAttributes = Object.keys(attributes).flatMap(attr => {
                        const options = attributeOptions?.[attr];
                        if (options?.observe === false) return [];
                        return options?.htmlName ?? toAttributeName(attr);
                      });

                      for (const eventType of events) {
                        // only custom events need additional handling
                        if (!ALL_BROWSER_EVENTS.includes(eventType)) {
                          observedAttributes.push(`on${eventType}`);
                        }
                      }

                      Object.freeze(observedAttributes);

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

                      const initiateMethods = (methodsApi: MethodsApi<Attr, EventsDefinitions, Ctx>) => {
                        const methods = getMethods(methodsApi);
                        for (const key in methods) {
                          const method = methods[key]!;
                          // @ts-expect-error
                          methods[key] = method.bind(methods);
                        }
                        return methods;
                      };

                      const elementConstructor = class WcToolkitCustomElement extends HTMLElement {
                        static readonly NAME = tagName;
                        static readonly observedAttributes = observedAttributes;
                        readonly attributeNames = observedAttributes;

                        private readonly childrenContainer = document.createElement("div");
                        private readonly root: HTMLElement | ShadowRoot = getRoot(this);

                        private readonly attributeController = new AttributeController(this);
                        private readonly cleanups: Array<() => void> = [];
                        private readonly _context = getContext(
                          this.attributeController.getAttributesApi(attributes, attributeOptions),
                        );
                        private readonly _methodsApi = new MethodsApi(
                          this,
                          this.cleanups,
                          this._context,
                          this.attributeController,
                          this.root,
                          attributes,
                        );
                        private readonly _methods = initiateMethods(this._methodsApi);
                        private readonly _mainFuncApi = new ConnectedCallbackApi(
                          this,
                          this.cleanups,
                          this.attributeController,
                          this._context,
                          this._methods,
                          this.root,
                          this.childrenContainer,
                          attributes,
                        );

                        public isMounted = false;

                        constructor() {
                          super();

                          this.childrenContainer.className = "_wc_toolkit_children_container";

                          for (const key in this._methods) {
                            Object.defineProperty(this, key, {
                              enumerable: false,
                              configurable: false,
                              writable: false,
                              value: this._methods[key]!,
                            });
                          }

                          for (const [key, value] of Object.entries(attributes)) {
                            if (key in this) {
                              console.warn(
                                `Property '${key}' already exists on the HTMLElement, cannot assign attribute accessor. [${tagName}]`,
                              );
                              continue;
                            }

                            const attrProxy = this.attributeController.getOrCreateProxy(key, value, attributeOptions);
                            Object.defineProperty(this, key, {
                              enumerable: false,
                              configurable: false,
                              get: () => {
                                return attrProxy.get();
                              },
                              set: (value: any) => {
                                attrProxy.set(value);
                              },
                            });
                          }

                          for (const eventType of events) {
                            // only custom events need additional handling
                            if (ALL_BROWSER_EVENTS.includes(eventType)) {
                              continue;
                            }

                            const attrProxy = this.attributeController.getOrCreateProxy(
                              `on${eventType}`,
                              FunctionAttributeParser,
                              attributeOptions,
                            );

                            let attributeHandlerOverride: ((event: Event) => void) | null = null;
                            let attributeHandler: ((event: Event) => void) | null = null;
                            this.addEventListener(eventType, (event) => {
                              if (attributeHandlerOverride) {
                                return attributeHandlerOverride(event);
                              }

                              if (attributeHandler) {
                                return attributeHandler(event);
                              }
                            });

                            attrProxy.onChange(() => {
                              attributeHandler = attrProxy.get();
                            });

                            const accessorKey = `on${eventType}`;

                            if (accessorKey in this) {
                              console.warn(
                                `Property '${accessorKey}' already exists on the HTMLElement, cannot assign event callback accessor. [${tagName}]`,
                              );
                              continue;
                            }

                            Object.defineProperty(this, accessorKey, {
                              enumerable: false,
                              configurable: false,
                              get: () => {
                                return attributeHandlerOverride ?? attrProxy.get();
                              },
                              set: (value: any) => {
                                if (value == null) {
                                  attributeHandlerOverride = null;
                                  return;
                                }

                                if (typeof value !== "function") {
                                  throw new TypeError(`'on${eventType}' must be a Function`);
                                }

                                attributeHandlerOverride = value;
                              },
                            });
                          }
                        }

                        private _portalCleanups: Array<() => void> = [];
                        private _cloneChildrenIntoPortal() {
                          this._portalCleanups
                            .splice(0, this._portalCleanups.length)
                            .forEach((cleanup) => cleanup());

                          if (childrenPortal) {
                            this.childrenContainer.innerHTML = "";
                            for (const child of this.childNodes as any as Array<Element>) {
                              if ("classList" in child && child.classList.contains("_wc_toolkit_content_container")) {
                                continue;
                              }
                              const mirrored = mirroredNode(child);
                              this.childrenContainer.appendChild(mirrored.current());
                              this._portalCleanups.push(mirrored.remove);
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

                          const cleanup = onConnectedCallback(this._mainFuncApi);
                          if (cleanup) {
                            this.cleanups.push(cleanup);
                          }

                          this.mutationObserver = new MutationObserver((mutationRecords) => {
                            if (!noContent) {
                              const childLenghtCahnged = mutationRecords.some(r =>
                                r.addedNodes.length > 0 || r.removedNodes.length > 0
                              );
                              if (childLenghtCahnged) {
                                this._cloneChildrenIntoPortal();
                              }
                            }
                            this._mainFuncApi["mutationObservedCallback"](mutationRecords);
                          });
                          this.mutationObserver.observe(this, {
                            childList: true,
                            characterData: true,
                            subtree: observeSubtree,
                          });
                          this.cleanups.push(() => {
                            this.mutationObserver!.disconnect();
                            this.mutationObserver = undefined;
                          });
                          setTimeout(() => {
                            this._mainFuncApi["triggerChildrenChange"](true);
                          });
                        }

                        disconnectedCallback() {
                          this.isMounted = false;

                          if (!noContent) {
                            if (!(this.root instanceof ShadowRoot)) {
                              this.root.remove();
                            }
                          }

                          for (const cleanup of this.cleanups) {
                            cleanup();
                          }
                        }

                        attributeChangedCallback(name: string, oldValue: string, newValue: string) {
                          this.attributeController.attributeChangedCallback(name, oldValue, newValue);
                        }
                      };

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
