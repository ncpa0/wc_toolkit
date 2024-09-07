import { addStyles } from "./add-styles";
import { AttributeController } from "./attribute";
import { MainFuncApi } from "./main_fn_api";
import { MethodsApi } from "./methods_api";
import { AttributeAccessors } from "./type.utils";
import { toCamelCase } from "./utils";

export type LiteralType =
  | "string"
  | "number"
  | "boolean"
  | "string[]"
  | "number[]";

export type AttributesDefinitions = {
  [k: string]: LiteralType;
};

export type EventsDefinitions = string[];

export type MethodsDefinitions = {
  [k: string]: (...args: any[]) => any;
};

export type CustomElement<Attr extends AttributesDefinitions, Methods extends MethodsDefinitions> = {
  new():
    & HTMLElement
    & Methods
    & AttributeAccessors<Attr>;
};

export function customElement(tagName: string, options?: { childrenPortal?: boolean }) {
  const { childrenPortal = false } = options ?? {};
  return {
    /**
     * Define the attributes of the custom element and the type of their values.
     */
    attributes<Attr extends AttributesDefinitions>(attributes: Attr) {
      return {
        /**
         * Define what events can be emitted by the custom element.
         */
        events<const Evnts extends EventsDefinitions>(events: Evnts) {
          return {
            /**
             * Context can be used to store the internal state of the custom element. `getContext` param should
             * return the initial context value, it will be called once for every instance of the custom element.
             */
            context<Ctx extends object>(getContext: () => Ctx) {
              return {
                /**
                 * Define the methods of the custom element. These methods can be later called via the api
                 * object given to the main function or on the instance of the custom element.
                 */
                methods<Methods extends MethodsDefinitions>(
                  getMethods: (
                    customElementApi: MethodsApi<Attr, Evnts, Ctx>,
                  ) => Methods,
                ) {
                  return {
                    /**
                     * The main function of the custom element. This function will be called every time
                     * a custom element is mounted.
                     */
                    main(
                      mainFn: (
                        api: MainFuncApi<Attr, Evnts, Ctx, Methods>,
                      ) => void | (() => void),
                    ) {
                      const observedAttributes = Object.keys(attributes);

                      const elementConstructor = class CustomElement extends HTMLElement {
                        static observedAttributes = observedAttributes;

                        private readonly childrenContainer = document.createElement("div");
                        private readonly contentContainer = document.createElement("div");

                        private readonly attributeController = new AttributeController(this);
                        private readonly cleanups: Array<() => void> = [];
                        private readonly _context = getContext();
                        private readonly _methodsApi = new MethodsApi(
                          this,
                          this._context,
                          this.attributeController,
                          this.contentContainer,
                          attributes,
                        );
                        private readonly _methods = getMethods(this._methodsApi);
                        private readonly _mainFuncApi = new MainFuncApi(
                          this,
                          this.cleanups,
                          this.attributeController,
                          this._context,
                          this._methods,
                          this.contentContainer,
                          this.childrenContainer,
                          attributes,
                        );

                        constructor() {
                          super();

                          this.classList.add("_wc_toolkit_custom_element");
                          this.childrenContainer.className = "_wc_toolkit_children_container";
                          this.contentContainer.className = "_wc_toolkit_content_container";

                          for (const key in this._methods) {
                            Object.defineProperty(this, key, {
                              enumerable: false,
                              configurable: false,
                              writable: false,
                              value: (...args: any[]) => this._methods[key]!(...args),
                            });
                          }

                          for (const key in attributes) {
                            const attrProxy = this.attributeController.getProxy(key);
                            if (attrProxy) {
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

                          this.append(this.contentContainer);

                          this._cloneChildrenIntoPortal();

                          const cleanup = mainFn(this._mainFuncApi);
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
                          this.contentContainer.remove();

                          for (const cleanup of this.cleanups) {
                            cleanup();
                          }
                        }

                        attributeChangedCallback(name: string, oldValue: string, newValue: string) {
                          this.attributeController.attributeChangedCallback(name, oldValue, newValue);
                        }
                      };

                      return {
                        CustomeElement: elementConstructor as any as CustomElement<Attr, Methods>,
                        /**
                         * Register the custom element in the current window's CustomElementRegistry.
                         */
                        register(): { CustomeElement: CustomElement<Attr, Methods> } {
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
