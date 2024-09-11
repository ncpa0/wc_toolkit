import { addStyles } from "./add_styles";
import { AttributeController } from "./attribute";
import { FunctionAttributeParser } from "./function-parser";
import { ConnectedCallbackApi } from "./main_fn_api";
import { MethodsApi } from "./methods_api";
import {
  AttributeAccessors,
  AttributeApi,
  AttributeParser,
  EvenListenerFunctions,
  EventAttributeAcessors,
  PublicMethods,
} from "./type.utils";
import { toCamelCase } from "./utils";

export type CustomElementOptions = {
  childrenPortal?: boolean;
  shadowRoot?: boolean;
  shadowRootInit?: ShadowRootInit;
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
  new():
    & HTMLElement
    & PublicMethods<Methods>
    & AttributeAccessors<Attr>
    & EventAttributeAcessors<Evnts>
    & EvenListenerFunctions<Evnts>;
};

export function customElement(tagName: string, options?: CustomElementOptions) {
  const { childrenPortal = false, shadowRoot = false, shadowRootInit } = options ?? {};
  return {
    /**
     * Define the attributes of the custom element and the type of their values.
     */
    attributes<Attr extends AttributesDefinitions = {}>(attributes: Attr = {} as Attr) {
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
                      const observedAttributes = Object.keys(attributes);

                      for (const eventType of events) {
                        observedAttributes.push(`on${eventType}`);
                      }

                      const getRoot = (elem: HTMLElement) => {
                        let root: HTMLElement | ShadowRoot;

                        if (shadowRoot) {
                          const sroot = elem.attachShadow(shadowRootInit ?? { mode: "open" });
                          root = sroot;
                        } else {
                          root = document.createElement("div");
                          root.className = "_wc_toolkit_content_container";
                        }

                        return root;
                      };

                      const elementConstructor = class CustomElement extends HTMLElement {
                        static observedAttributes = observedAttributes;

                        private readonly childrenContainer = document.createElement("div");
                        private readonly root: HTMLElement | ShadowRoot = getRoot(this);

                        private readonly attributeController = new AttributeController(this);
                        private readonly cleanups: Array<() => void> = [];
                        private readonly _context = getContext(
                          this.attributeController.getAttributesApi(attributes),
                        );
                        private readonly _methodsApi = new MethodsApi(
                          this,
                          this._context,
                          this.attributeController,
                          this.root,
                          attributes,
                        );
                        private readonly _methods = getMethods(this._methodsApi);
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

                          this.classList.add("_wc_toolkit_custom_element");
                          this.childrenContainer.className = "_wc_toolkit_children_container";

                          for (const key in this._methods) {
                            Object.defineProperty(this, key, {
                              enumerable: false,
                              configurable: false,
                              writable: false,
                              value: this._methods[key]!.bind(this._methods),
                            });
                          }

                          for (const [key, value] of Object.entries(attributes)) {
                            const attrProxy = this.attributeController.getOrCreateProxy(key, value);
                            Object.defineProperty(this, toCamelCase(key), {
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
                            const attrProxy = this.attributeController.getOrCreateProxy(
                              `on${eventType}`,
                              FunctionAttributeParser,
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

                            Object.defineProperty(this, `on${eventType}`, {
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

                        private _cloneChildrenIntoPortal() {
                          if (childrenPortal) {
                            this.childrenContainer.innerHTML = "";
                            for (const child of this.childNodes as any as Array<Element>) {
                              if ("classList" in child && child.classList.contains("_wc_toolkit_content_container")) {
                                continue;
                              }
                              const clone = child.cloneNode(true);
                              this.childrenContainer.appendChild(clone);
                            }
                          }
                        }

                        private mutationObserver?: MutationObserver;
                        connectedCallback() {
                          addStyles();
                          this.isMounted = true;

                          if (!(this.root instanceof ShadowRoot)) {
                            this.append(this.root);
                          }

                          this._cloneChildrenIntoPortal();

                          const cleanup = onConnectedCallback(this._mainFuncApi);
                          if (cleanup) {
                            this.cleanups.push(cleanup);
                          }

                          this.mutationObserver = new MutationObserver((mutationRecords) => {
                            this._cloneChildrenIntoPortal();
                            this._mainFuncApi["mutationObservedCallback"](mutationRecords);
                          });
                          this.mutationObserver.observe(this, { subtree: true, childList: true });
                          this.cleanups.push(() => {
                            this.mutationObserver!.disconnect();
                            this.mutationObserver = undefined;
                          });
                        }

                        disconnectedCallback() {
                          this.isMounted = false;

                          if (!(this.root instanceof ShadowRoot)) {
                            this.root.remove();
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
                          customElements.define(tagName, elementConstructor);
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
