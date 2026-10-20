import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Attribute, AttributeController } from "../src/attribute";
import { CleanupController } from "../src/cleanup_controller";
import { customElement } from "../src/index";
import { registerDependencyHandler } from "../src/main_fn_api";

const sleep = (ms: number = 0) => new Promise(resolve => setTimeout(resolve, ms));

describe("parity lock", () => {
  describe("CleanupController", () => {
    it("visits cleanups pushed during runCleanups and drops the once ones", () => {
      const controller = new CleanupController();
      const calls: string[] = [];

      controller.once(() => {
        calls.push("outer once");
        controller.once(() => {
          calls.push("inner once");
        });
        controller.add(() => {
          calls.push("inner add");
        });
      });

      controller.runCleanups();
      // the run loop visits entries pushed during the run, then drops
      // the once ones
      expect(calls).toEqual(["outer once", "inner once", "inner add"]);

      calls.length = 0;
      controller.runCleanups();
      expect(calls).toEqual(["inner add"]);
    });
  });

  describe("method property descriptors", () => {
    it("methods are prototype get-only accessors returning a lazily-cached bound function", () => {
      const { CustomElement } = customElement("parity-elem-1")
        .attributes()
        .events()
        .context()
        .methods(() => ({
          doThing: () => 1,
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-1") as any as InstanceType<typeof CustomElement>;

      // the descriptor lives on the prototype, there is no own property
      const descriptor = Object.getOwnPropertyDescriptor(elem, "doThing");
      expect(descriptor).toBeUndefined();
      const protoDescriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(elem),
        "doThing",
      );
      expect(protoDescriptor).toBeDefined();
      expect(protoDescriptor!.enumerable).toBe(false);
      expect(protoDescriptor!.configurable).toBe(false);
      expect(typeof protoDescriptor!.get).toBe("function");
      expect(protoDescriptor!.set).toBeUndefined();

      // repeated access returns the same lazily-cached bound function
      const first = elem.doThing;
      expect(typeof first).toBe("function");
      expect(elem.doThing).toBe(first);
      expect(first()).toBe(1);

      // strict-mode assignment throws (accessor without a setter)
      expect(() => {
        (elem as any).doThing = () => 2;
      }).toThrow(TypeError);
      expect(elem.doThing()).toBe(1);

      // sloppy-mode assignment silently no-ops
      new Function("elem", "elem.doThing = () => 2;")(elem);
      expect(elem.doThing()).toBe(1);
    });
  });

  describe("attribute accessor descriptors", () => {
    it("attribute accessors are prototype, non-enumerable, non-configurable get/set properties", () => {
      const { CustomElement } = customElement("parity-elem-2")
        .attributes({ foo: "string" })
        .events()
        .context()
        .methods()
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-2") as any as InstanceType<typeof CustomElement>;

      const descriptor = Object.getOwnPropertyDescriptor(elem, "foo");
      expect(descriptor).toBeUndefined();
      const protoDescriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(elem),
        "foo",
      );
      expect(protoDescriptor).toBeDefined();
      expect(protoDescriptor!.enumerable).toBe(false);
      expect(protoDescriptor!.configurable).toBe(false);
      expect(typeof protoDescriptor!.get).toBe("function");
      expect(typeof protoDescriptor!.set).toBe("function");

      // get/set semantics still work
      expect(elem.foo).toBeNull();
      elem.foo = "x";
      expect(elem.getAttribute("foo")).toBe("x");
      expect(elem.foo).toBe("x");
    });
  });

  describe("event accessor behavior", () => {
    it("rejects non-functions, clears on null, override takes precedence over the html attribute handler", async () => {
      const htmlHandler = vi.fn();
      const override = vi.fn();

      const { CustomElement } = customElement("parity-elem-3")
        .attributes()
        .events({ customevent: CustomEvent })
        .context()
        .methods(api => ({
          emit() {
            api.emitEvent("customevent");
          },
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-3") as any as InstanceType<typeof CustomElement>;
      document.body.appendChild(elem);

      // html attribute handler: the attribute value is the function body,
      // it only has access to globals and the event
      (elem as any)._htmlHandler = htmlHandler;
      elem.setAttribute("oncustomevent", "event.target._htmlHandler(event)");

      // the attribute handler is only picked up once the attribute change
      // notification reaches the attribute proxy
      elem.emit();
      expect(htmlHandler).toHaveBeenCalledTimes(1);

      // non-function assignment throws the exact TypeError
      expect(() => {
        (elem as any).oncustomevent = "nope";
      }).toThrow(new TypeError("'oncustomevent' must be a Function"));

      // override takes precedence over the html attribute handler
      elem.oncustomevent = override;
      expect(elem.oncustomevent).toBe(override);
      elem.emit();
      expect(override).toHaveBeenCalledTimes(1);
      expect(htmlHandler).toHaveBeenCalledTimes(1);

      // assigning null clears the override, html handler resumes
      elem.oncustomevent = null;
      elem.emit();
      expect(htmlHandler).toHaveBeenCalledTimes(2);
      expect(override).toHaveBeenCalledTimes(1);
    });
  });

  describe("collision warnings", () => {
    it("warns for attribute key and event accessor collisions with the exact message, once per definition", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const { CustomElement } = customElement("parity-elem-4")
          .attributes({ title: "string" })
          .events({ compositionend: Event })
          .context()
          .methods()
          .connected(() => {})
          .register();

        expect(CustomElement.observedAttributes).toEqual(["title", "oncompositionend"]);

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledWith(
          "Property 'title' already exists on the HTMLElement, cannot assign attribute accessor. [parity-elem-4]",
        );
        expect(warnSpy).toHaveBeenCalledWith(
          "Property 'oncompositionend' already exists on the HTMLElement, cannot assign event callback accessor. [parity-elem-4]",
        );

        // creating instances adds no further warns
        document.createElement("parity-elem-4");
        document.createElement("parity-elem-4");
        expect(warnSpy).toHaveBeenCalledTimes(2);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe("proxy identity across the three API objects", () => {
    it("the attribute proxies are the same instances in the methods, context and connected api", () => {
      let methodsApiAttr: any;
      let contextAttr: any;
      let connectedAttr: any;

      const { CustomElement } = customElement("parity-elem-5")
        .attributes({ foo: "string", bar: "number" })
        .events()
        .context(attributes => {
          contextAttr = attributes;
          return {};
        })
        .methods(api => {
          methodsApiAttr = api.attribute;
          return {};
        })
        .connected(api => {
          connectedAttr = api.attribute;
        })
        .register();

      const elem = document.createElement("parity-elem-5") as any as InstanceType<typeof CustomElement>;
      document.body.appendChild(elem);

      expect(methodsApiAttr.foo).toBeInstanceOf(Attribute);
      expect(methodsApiAttr.foo).toBe(contextAttr.foo);
      expect(methodsApiAttr.foo).toBe(connectedAttr.foo);
      expect(methodsApiAttr.bar).toBe(contextAttr.bar);
      expect(methodsApiAttr.bar).toBe(connectedAttr.bar);
    });
  });

  describe("observedAttributes / attributeNames identity", () => {
    it("attributeNames is the same frozen array as CustomElement.observedAttributes", () => {
      const { CustomElement } = customElement("parity-elem-6")
        .attributes({ foo: "string", userName: "string" })
        .events()
        .context()
        .methods()
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-6") as any as InstanceType<typeof CustomElement>;

      expect(elem.attributeNames).toBe(CustomElement.observedAttributes);
      expect(Object.isFrozen(CustomElement.observedAttributes)).toBe(true);
      expect([...CustomElement.observedAttributes]).toEqual(["foo", "username"]);
    });
  });

  describe("AttributeController change-event shape", () => {
    const jsonParser = {
      fromString: (attr: string | null): { v: string } | null =>
        attr == null ? null : JSON.parse(attr),
      intoString: (attr: { v: string } | null): string | null =>
        attr == null ? null : JSON.stringify(attr),
    };

    it("listeners receive the freshly parsed attribute value, not an event", () => {
      const elem = document.createElement("div");
      const controller = new AttributeController(elem);
      // a registered proxy means dispatches re-parse the raw value
      Attribute.new(controller, jsonParser, "foo");

      const received: unknown[] = [];
      controller.addEventListener("foo", value => {
        received.push(value);
      });

      // the dispatch re-parses the attribute currently set on the element
      elem.setAttribute("foo", '{"v":"a"}');
      controller.attributeChangedCallback("foo", null, '{"v":"a"}');
      expect(received).toEqual([{ v: "a" }]);
      expect(received[0]).not.toBeInstanceOf(Event);

      // the value was parsed fresh from the raw string on this dispatch...
      const first = received[0];
      elem.setAttribute("foo", '{"v":"b"}');
      controller.attributeChangedCallback("foo", '{"v":"a"}', '{"v":"b"}');
      expect(received[1]).toEqual({ v: "b" });
      // ...and parsing back to the same content yields a new object, so
      // every dispatch re-parses instead of reusing a stale memo
      elem.setAttribute("foo", '{"v":"a"}');
      controller.attributeChangedCallback("foo", '{"v":"b"}', '{"v":"a"}');
      expect(received[2]).toEqual({ v: "a" });
      expect(received[2]).not.toBe(first);
    });

    it("passes the raw attribute string when no proxy is registered for the name", () => {
      const controller = new AttributeController(document.createElement("div"));

      const received: unknown[] = [];
      controller.addEventListener("bar", value => {
        received.push(value);
      });

      controller.attributeChangedCallback("bar", "a", "b");
      expect(received).toEqual(["b"]);
    });

    it("does not invoke listeners when oldValue === newValue", () => {
      const controller = new AttributeController(document.createElement("div"));

      const calls = vi.fn();
      controller.addEventListener("foo", calls);

      controller.attributeChangedCallback("foo", "a", "a");
      expect(calls).not.toHaveBeenCalled();

      controller.attributeChangedCallback("foo", "a", "b");
      expect(calls).toHaveBeenCalledTimes(1);
    });

    it("removes listeners registered with the once option after their first invocation", () => {
      const controller = new AttributeController(document.createElement("div"));

      const onceCalls = vi.fn();
      controller.addEventListener("foo", onceCalls, { once: true });

      controller.attributeChangedCallback("foo", "a", "b");
      expect(onceCalls).toHaveBeenCalledTimes(1);

      controller.attributeChangedCallback("foo", "b", "c");
      expect(onceCalls).toHaveBeenCalledTimes(1);
    });

    it("treats a `true` options argument as a plain registration", () => {
      const controller = new AttributeController(document.createElement("div"));

      const calls = vi.fn();
      controller.addEventListener("foo", calls, true);

      controller.attributeChangedCallback("foo", "a", "b");
      controller.attributeChangedCallback("foo", "b", "c");
      expect(calls).toHaveBeenCalledTimes(2);
    });

    it("dispatches to listeners registered with options and to plain listeners for the same name", () => {
      const elem = document.createElement("div");
      const controller = new AttributeController(elem);

      const plainCalls = vi.fn();
      const optionsCalls = vi.fn();
      controller.addEventListener("foo", plainCalls);
      controller.addEventListener("foo", optionsCalls, { capture: false });

      controller.attributeChangedCallback("foo", "a", "b");
      expect(plainCalls).toHaveBeenCalledTimes(1);
      expect(optionsCalls).toHaveBeenCalledTimes(1);

      // removing the plain listener stops its calls
      controller.removeEventListener("foo", plainCalls);
      controller.attributeChangedCallback("foo", "b", "c");
      expect(plainCalls).toHaveBeenCalledTimes(1);
      expect(optionsCalls).toHaveBeenCalledTimes(2);
    });
  });

  describe("memo identity for custom parsers", () => {
    it("repeated get() returns the same object until the attribute changes", () => {
      const customParser = {
        fromString: (attr: string | null): { v: string } | null => attr == null ? null : JSON.parse(attr),
        intoString: (attr: { v: string } | null): string | null => attr == null ? null : JSON.stringify(attr),
      };

      const { CustomElement } = customElement("parity-elem-7")
        .attributes({ obj: customParser })
        .events()
        .context()
        .methods(api => ({
          getObj(): any {
            return api.attribute.obj.get();
          },
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-7") as any as InstanceType<typeof CustomElement>;
      document.body.appendChild(elem);

      const first = elem.getObj();
      expect(first).toBeNull();

      elem.setAttribute("obj", "{\"v\":\"a\"}");
      const second = elem.getObj();
      expect(second).toEqual({ v: "a" });
      expect(elem.getObj()).toBe(second);

      elem.setAttribute("obj", "{\"v\":\"b\"}");
      const third = elem.getObj();
      expect(third).toEqual({ v: "b" });
      expect(third).not.toBe(second);
    });

    it("falsy values are memoized too (no re-parse on every get)", () => {
      const parseSpy = vi.fn((attr: string | null) =>
        attr == null ? null : attr === "false" ? false : attr === "zero" ? 0 : attr === "empty" ? "" : attr
      );

      const { CustomElement } = customElement("parity-elem-7b")
        .attributes({ val: { fromString: parseSpy, intoString: (v: any) => v } as any })
        .events()
        .context()
        .methods(api => ({
          getVal(): any {
            return api.attribute.val.get();
          },
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-7b") as any as InstanceType<typeof CustomElement>;

      // unset attribute -> null is memoized
      const nullValue = elem.getVal();
      expect(nullValue).toBeNull();
      expect(elem.getVal()).toBe(nullValue);

      elem.setAttribute("val", "false");
      expect(elem.getVal()).toBe(false);
      expect(elem.getVal()).toBe(false);
      expect(parseSpy).toHaveBeenCalledTimes(2); // once for "false", not again

      elem.setAttribute("val", "zero");
      expect(elem.getVal()).toBe(0);
      expect(elem.getVal()).toBe(0);
      expect(parseSpy).toHaveBeenCalledTimes(3);

      elem.setAttribute("val", "empty");
      expect(elem.getVal()).toBe("");
      expect(elem.getVal()).toBe("");
      expect(parseSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe("reconnect cycles", () => {
    it("connected callbacks, listeners and cleanups behave across connect/disconnect cycles", () => {
      const connectedSpy = vi.fn();
      const clickSpy = vi.fn();
      const onceCleanup = vi.fn();
      const keptCleanup = vi.fn();

      const { CustomElement } = customElement("parity-elem-8")
        .attributes()
        .events()
        .context()
        .methods()
        .connected(api => {
          connectedSpy();
          api.listen("click", () => {
            clickSpy();
          });
          api.cleanup(onceCleanup);
          api.cleanup(keptCleanup, { keep: true });
        })
        .register();

      const elem = document.createElement("parity-elem-8") as any as InstanceType<typeof CustomElement>;

      for (let i = 1; i <= 3; i++) {
        document.body.appendChild(elem);
        expect(elem.isMounted).toBe(true);
        expect(connectedSpy).toHaveBeenCalledTimes(i);

        // listener re-added on connect
        elem.dispatchEvent(new Event("click"));
        expect(clickSpy).toHaveBeenCalledTimes(i);

        elem.remove();
        expect(elem.isMounted).toBe(false);

        // listener removed on disconnect
        elem.dispatchEvent(new Event("click"));
        expect(clickSpy).toHaveBeenCalledTimes(i);

        // each connect registers a fresh once cleanup, it runs exactly once
        expect(onceCleanup).toHaveBeenCalledTimes(i);
        // keep cleanups run on every disconnect; one new one is registered
        // per connect, so they accumulate: 1, 3, 6 calls
        expect(keptCleanup).toHaveBeenCalledTimes((i * (i + 1)) / 2);
      }
    });
  });

  describe("Attribute.extend / Attribute.new override", () => {
    const originalNew = Attribute.new;

    beforeEach(() => {
      Attribute.new = originalNew;
    });

    afterEach(() => {
      Attribute.new = originalNew;
    });

    it("Attribute.new is used to construct the attribute proxies", () => {
      class ExtendedAttribute extends Attribute<any, any> {
        marker = true;
        constructor(...args: ConstructorParameters<typeof Attribute>) {
          super(...args);
        }
      }

      Attribute.extend(() => ExtendedAttribute as any);

      const { CustomElement } = customElement("parity-elem-9")
        .attributes({ foo: "string" })
        .events()
        .context()
        .methods(() => ({}))
        .connected(() => {})
        .register();

      let captured: any;
      const elem = document.createElement("parity-elem-9") as any as InstanceType<typeof CustomElement>;
      document.body.appendChild(elem);

      // the proxies are created in the element constructor through Attribute.new
      const controller = (elem as any).attributeController;
      expect(controller.getProxy("foo").marker).toBe(true);
      expect(elem.foo).toBeNull();
    });
  });

  describe("custom dependency handler", () => {
    it("api.onChange fires when the dependency signals and unbinds on disconnect", async () => {
      class FakeDependency {
        static listeners = new Set<() => void>();
        static signal() {
          for (const cb of FakeDependency.listeners) cb();
        }
      }

      registerDependencyHandler({
        detect: (v): v is FakeDependency => v instanceof FakeDependency,
        onChange: (dep, cb) => {
          FakeDependency.listeners.add(cb);
          return () => {
            FakeDependency.listeners.delete(cb);
          };
        },
      });

      const cb = vi.fn();

      const { CustomElement } = customElement("parity-elem-10")
        .attributes()
        .events()
        .context(() => ({}))
        .methods(() => ({}))
        .connected(api => {
          api.onChange([new FakeDependency()], cb);
        })
        .register();

      const elem = document.createElement("parity-elem-10") as any as InstanceType<typeof CustomElement>;
      document.body.appendChild(elem);
      await sleep(0);

      FakeDependency.signal();
      await sleep(0);
      expect(cb).toHaveBeenCalledTimes(1);

      // duplicate signals within the same microtask queue only one call
      FakeDependency.signal();
      FakeDependency.signal();
      await sleep(0);
      expect(cb).toHaveBeenCalledTimes(2);

      // dependency is unbound after disconnect
      elem.remove();
      await sleep(0);
      FakeDependency.signal();
      await sleep(0);
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe("`_`-prefixed methods", () => {
    it("are still defined on the instance", () => {
      const { CustomElement } = customElement("parity-elem-11")
        .attributes()
        .events()
        .context()
        .methods(() => ({
          _privateThing: () => "secret",
          publicThing: () => "public",
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-11") as any as InstanceType<typeof CustomElement>;

      expect(typeof (elem as any)._privateThing).toBe("function");
      expect((elem as any)._privateThing()).toBe("secret");
      expect(elem.publicThing()).toBe("public");
    });
  });

  describe("getChildren()", () => {
    it("returns a fresh array each call, excluding the content container", () => {
      const { CustomElement } = customElement("parity-elem-12")
        .attributes()
        .events()
        .context()
        .methods(api => ({
          getKids(): Array<Element | Text> {
            return api.getChildren();
          },
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-12") as any as InstanceType<typeof CustomElement>;
      document.body.appendChild(elem);

      const child = document.createElement("div");
      child.textContent = "kid";
      elem.appendChild(child);

      const children1 = elem.getKids();
      const children2 = elem.getKids();
      expect(children1).toHaveLength(1);
      expect(children1[0]).toBe(child);
      expect(children1).not.toBe(children2);
      expect(children1).toEqual(children2);

      // mutating the returned array does not affect the element
      children1.pop();
      expect(elem.getKids()).toHaveLength(1);
      expect(child.parentNode).toBe(elem);
    });
  });

  describe("childrenPortal shape", () => {
    it("is an HTMLDivElement with the _wc_toolkit_children_container class", () => {
      let portal: any;

      const { CustomElement } = customElement("parity-elem-13", { childrenPortal: true })
        .attributes()
        .events()
        .context()
        .methods(() => ({}))
        .connected(api => {
          portal = api.childrenPortal;
          api.replace(api.childrenPortal);
        })
        .register();

      const elem = document.createElement("parity-elem-13") as any as InstanceType<typeof CustomElement>;
      document.body.appendChild(elem);

      expect(portal).toBeInstanceOf(HTMLDivElement);
      expect(portal.className).toBe("_wc_toolkit_children_container");
      expect(portal.parentNode).toBe(elem.querySelector("._wc_toolkit_content_container"));
    });
  });

  describe("emitEvent errors", () => {
    it("unknown event name throws the current error", () => {
      const { CustomElement } = customElement("parity-elem-14")
        .attributes()
        .events()
        .context()
        .methods(api => ({
          emitUnknown() {
            api.emitEvent("nope" as any);
          },
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("parity-elem-14") as any as InstanceType<typeof CustomElement>;

      expect(() => elem.emitUnknown()).toThrow(new Error("invalid error type: 'nope'"));
    });
  });

  describe("prototype accessors (plan G2 lock)", () => {
    it("'foo' in elem and elem.foo get/set/assignment semantics (sloppy + strict)", () => {
      const { CustomElement } = customElement("g2-elem-1")
        .attributes({ foo: "string" })
        .events({ customevent: CustomEvent })
        .context()
        .methods(() => ({
          doThing: () => 1,
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("g2-elem-1") as any as InstanceType<typeof CustomElement>;

      // accessors live on the prototype but are visible via `in`
      expect("foo" in elem).toBe(true);
      expect("oncustomevent" in elem).toBe(true);
      expect("doThing" in elem).toBe(true);

      // attribute accessor get/set
      expect(elem.foo).toBeNull();
      elem.foo = "x";
      expect(elem.getAttribute("foo")).toBe("x");
      expect(elem.foo).toBe("x");

      // event accessor: strict-mode non-function assignment throws the
      // exact TypeError, function assignment works
      expect(() => {
        (elem as any).oncustomevent = "nope";
      }).toThrow(new TypeError("'oncustomevent' must be a Function"));
      const override = vi.fn();
      elem.oncustomevent = override;
      expect(elem.oncustomevent).toBe(override);

      // method: strict-mode assignment throws, sloppy-mode silently no-ops
      const doThing = elem.doThing;
      expect(() => {
        (elem as any).doThing = () => 2;
      }).toThrow(TypeError);
      expect(elem.doThing).toBe(doThing);
      new Function("elem", "elem.doThing = () => 2;")(elem);
      expect(elem.doThing).toBe(doThing);

      // sloppy-mode event assignment works (accessor has a setter)
      const sloppyFn = vi.fn();
      new Function("elem", "fn", "elem.oncustomevent = fn;")(elem, sloppyFn);
      expect(elem.oncustomevent).toBe(sloppyFn);
    });

    it("collision with a method name warns once per definition and the method keeps the name", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const { CustomElement } = customElement("g2-elem-2")
          .attributes({ foo: "string", title: "string" })
          .events()
          .context()
          .methods(() => ({
            foo: () => "method foo",
          }))
          .connected(() => {})
          .register();

        // "title" collides at definition time; "foo" is displaced by the
        // method once the method keys become known on first construction
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          "Property 'title' already exists on the HTMLElement, cannot assign attribute accessor. [g2-elem-2]",
        );

        const elem = document.createElement("g2-elem-2") as any as InstanceType<typeof CustomElement>;
        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledWith(
          "Property 'foo' already exists on the HTMLElement, cannot assign attribute accessor. [g2-elem-2]",
        );

        // the method keeps the name, the attribute accessor is displaced
        expect(elem.foo()).toBe("method foo");
        expect(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(elem), "foo")!.get).toBeDefined();

        // further instances add no warns
        document.createElement("g2-elem-2");
        expect(warnSpy).toHaveBeenCalledTimes(2);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("DOM output unchanged: attribute accessor change re-renders through the connected api", async () => {
      const { CustomElement } = customElement("g2-elem-3")
        .attributes({ label: "string" })
        .events()
        .context()
        .methods()
        .connected(api => {
          const template = () => {
            const div = document.createElement("div");
            div.innerHTML = `<span>${api.attribute.label.get() ?? "not set"}</span>`;
            return div;
          };

          api.replace(template());
          api.onChange([api.attribute.label], () => {
            api.replace(template());
          });
        })
        .register();

      const elem = document.createElement("g2-elem-3") as any as InstanceType<typeof CustomElement>;

      document.body.appendChild(elem);
      expect(elem.querySelector("span")!.textContent).toBe("not set");

      elem.label = "hello";
      await sleep(0);
      expect(elem.getAttribute("label")).toBe("hello");
      expect(elem.querySelector("span")!.textContent).toBe("hello");
      expect(elem.querySelector("._wc_toolkit_content_container")).not.toBeNull();
    });

    it("event names differing only in case warn once per definition and both event types still dispatch", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const htmlHandler = vi.fn();

      try {
        const { CustomElement } = customElement("g2-elem-4")
          .attributes()
          .events({ myEvent: CustomEvent, MyEvent: CustomEvent })
          .context()
          .methods(api => ({
            emitLower() {
              api.emitEvent("myEvent");
            },
            emitUpper() {
              api.emitEvent("MyEvent");
            },
          }))
          .connected(() => {})
          .register();

        // the second accessor definition is skipped with the same warning
        // text used for event accessor collisions
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          "Property 'onmyevent' already exists on the HTMLElement, cannot assign event callback accessor. [g2-elem-4]",
        );

        const elem = document.createElement("g2-elem-4") as any as InstanceType<typeof CustomElement>;
        (elem as any)._htmlHandler = htmlHandler;
        elem.setAttribute("onmyevent", "event.target._htmlHandler(event)");

        elem.emitLower();
        expect(htmlHandler).toHaveBeenCalledTimes(1);
        expect(htmlHandler.mock.lastCall![0]!.type).toBe("myEvent");

        elem.emitUpper();
        expect(htmlHandler).toHaveBeenCalledTimes(2);
        expect(htmlHandler.mock.lastCall![0]!.type).toBe("MyEvent");

        // further instances add no warns
        document.createElement("g2-elem-4");
        expect(warnSpy).toHaveBeenCalledTimes(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("the per-instance state symbol is non-enumerable and invisible to spreads", () => {
      const { CustomElement } = customElement("g2-elem-5")
        .attributes({ foo: "string" })
        .events()
        .context()
        .methods(() => ({
          doThing: () => 1,
        }))
        .connected(() => {})
        .register();

      const elem = document.createElement("g2-elem-5") as any as InstanceType<typeof CustomElement>;

      // force the lazily-cached method path so any late state writes happen
      elem.doThing();

      // happy-dom keeps its own internals as enumerable own symbol props,
      // so the state symbol is located by description
      const stateSymbol = Object.getOwnPropertySymbols(elem).find(symbol =>
        symbol.description?.includes("instance_state")
      );
      expect(stateSymbol).toBeDefined();

      const descriptor = Object.getOwnPropertyDescriptor(elem, stateSymbol!);
      expect(descriptor!.enumerable).toBe(false);
      // writable: method fns are cached into the state after construction
      expect(descriptor!.writable).toBe(true);

      const spread = { ...(elem as any) } as Record<symbol, unknown>;
      expect(Object.prototype.hasOwnProperty.call(spread, stateSymbol!)).toBe(false);
    });
  });

  describe("direct-callback attribute dispatch (plan G3 lock)", () => {
    it("element-level onChange receives the parsed value, not an event; consecutive identical values don't re-fire", () => {
      const received: unknown[] = [];

      const { CustomElement } = customElement("g3-elem-1")
        .attributes({ num: "number", active: "boolean" })
        .events()
        .context()
        .methods()
        .connected(api => {
          api.attribute.num.onChange(value => {
            received.push(value);
          });
          api.attribute.active.onChange(value => {
            received.push(value);
          });
        })
        .register();

      const elem = document.createElement("g3-elem-1") as any as InstanceType<typeof CustomElement>;
      document.body.appendChild(elem);

      elem.num = 5;
      expect(received).toEqual([5]);
      expect(received[0]).not.toBeInstanceOf(Event);

      // setting the same raw value again doesn't reach the listeners
      elem.setAttribute("num", "5");
      expect(received).toEqual([5]);

      // different raw values parsing to the same value don't re-fire either
      elem.setAttribute("active", "");
      expect(received).toEqual([5, true]);
      elem.setAttribute("active", "1");
      expect(received).toEqual([5, true]);
    });
  });
});
