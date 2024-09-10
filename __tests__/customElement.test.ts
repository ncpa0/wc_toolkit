import { describe, expect, it, vi } from "vitest";
import { customElement } from "../src/index.ts";

const sleep = (ms: number = 0) => new Promise(resolve => setTimeout(resolve, ms));

describe("customElement", () => {
  it("calls callbacks on attribute change", async () => {
    const { CustomElement } = customElement("custom-elem-test1")
      .attributes({ foo: "string", bar: "number[]", "user-name": "string" })
      .events([])
      .context(() => ({}))
      .methods(({ attribute }) => {
        return {
          doThing(newFoo: string, newBar: number[]): boolean {
            attribute.foo.set(newFoo);
            attribute.bar.set(newBar);

            return true;
          },
        };
      })
      .main(api => {
        const template = () => {
          const div = document.createElement("div");
          div.innerHTML = `
              <span>${api.attribute.foo.get() ?? "not set"}</span>
              <span>${api.attribute.bar.get()?.join(", ") ?? "not set"}</span>
              <span>${api.attribute["user-name"].get() ?? "not set"}</span>
            `;
          return div;
        };

        api.render(template());

        api.onChange([
          api.attribute.foo,
          api.attribute.bar,
          api.attribute["user-name"],
        ], () => {
          api.render(template());
        });
      })
      .register();

    // @ts-expect-error
    expect(CustomElement.observedAttributes).toEqual(["foo", "bar", "user-name"]);

    const elem = document.createElement("custom-elem-test1") as any as InstanceType<typeof CustomElement>;

    document.body.appendChild(elem);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test1 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div>
                    <span>not set</span>
                    <span>not set</span>
                    <span>not set</span>
                  </div></div></custom-elem-test1>"
    `);

    elem.foo = "foo";
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test1 class="_wc_toolkit_custom_element" foo="foo"><div class="_wc_toolkit_content_container"><div>
                    <span>foo</span>
                    <span>not set</span>
                    <span>not set</span>
                  </div></div></custom-elem-test1>"
    `);

    elem.bar = [4, 20];
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test1 class="_wc_toolkit_custom_element" foo="foo" bar="4,20"><div class="_wc_toolkit_content_container"><div>
                    <span>foo</span>
                    <span>4, 20</span>
                    <span>not set</span>
                  </div></div></custom-elem-test1>"
    `);

    elem.userName = "John Doe";
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test1 class="_wc_toolkit_custom_element" foo="foo" bar="4,20" user-name="John Doe"><div class="_wc_toolkit_content_container"><div>
                    <span>foo</span>
                    <span>4, 20</span>
                    <span>John Doe</span>
                  </div></div></custom-elem-test1>"
    `);

    elem.setAttribute("foo", "BOOBARBAZ");
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test1 class="_wc_toolkit_custom_element" foo="BOOBARBAZ" bar="4,20" user-name="John Doe"><div class="_wc_toolkit_content_container"><div>
                    <span>BOOBARBAZ</span>
                    <span>4, 20</span>
                    <span>John Doe</span>
                  </div></div></custom-elem-test1>"
    `);

    elem.setAttribute("bar", "6,9,6,9");
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test1 class="_wc_toolkit_custom_element" foo="BOOBARBAZ" bar="6,9,6,9" user-name="John Doe"><div class="_wc_toolkit_content_container"><div>
                    <span>BOOBARBAZ</span>
                    <span>6, 9, 6, 9</span>
                    <span>John Doe</span>
                  </div></div></custom-elem-test1>"
    `);

    elem.setAttribute("user-name", "Billy Smith");
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test1 class="_wc_toolkit_custom_element" foo="BOOBARBAZ" bar="6,9,6,9" user-name="Billy Smith"><div class="_wc_toolkit_content_container"><div>
                    <span>BOOBARBAZ</span>
                    <span>6, 9, 6, 9</span>
                    <span>Billy Smith</span>
                  </div></div></custom-elem-test1>"
    `);

    elem.doThing("hello world!", [0, 0, 0, 1, 0, 0, 0]);
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test1 class="_wc_toolkit_custom_element" foo="hello world!" bar="0,0,0,1,0,0,0" user-name="Billy Smith"><div class="_wc_toolkit_content_container"><div>
                    <span>hello world!</span>
                    <span>0, 0, 0, 1, 0, 0, 0</span>
                    <span>Billy Smith</span>
                  </div></div></custom-elem-test1>"
    `);
  });

  it("when children are changed callback is called", async () => {
    const { CustomElement } = customElement("custom-elem-test2")
      .attributes({})
      .events([])
      .context(() => ({ options: [] as string[] }))
      .methods(() => {
        return {};
      })
      .main(api => {
        const template = () => {
          const div = document.createElement("div");
          div.innerHTML = `
              <span>Options: ${api.context.options.join(", ")}</span>
            `;
          return div;
        };

        api.render(template());

        api.onChildrenChange(children => {
          api.context.options = children.map(child => child.textContent ?? "");
          api.render(template());
        });
      })
      .register();

    const elem = document.createElement("custom-elem-test2") as any as InstanceType<typeof CustomElement>;

    document.body.appendChild(elem);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test2 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div>
                    <span>Options: </span>
                  </div></div></custom-elem-test2>"
    `);

    const option1 = document.createElement("option");
    option1.textContent = "option1";
    elem.appendChild(option1);
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test2 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div>
                    <span>Options: option1</span>
                  </div></div><option>option1</option></custom-elem-test2>"
    `);

    const option2 = document.createElement("option");
    option2.textContent = "option2";
    elem.appendChild(option2);
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test2 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div>
                    <span>Options: option1, option2</span>
                  </div></div><option>option1</option><option>option2</option></custom-elem-test2>"
    `);

    const option3 = document.createElement("option");
    option3.textContent = "option3";
    elem.appendChild(option3);
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test2 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div>
                    <span>Options: option1, option2, option3</span>
                  </div></div><option>option1</option><option>option2</option><option>option3</option></custom-elem-test2>"
    `);

    option2.remove();
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test2 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div>
                    <span>Options: option1, option3</span>
                  </div></div><option>option1</option><option>option3</option></custom-elem-test2>"
    `);
  });

  it("when children are changed they are copied into the portal", async () => {
    const { CustomElement } = customElement("custom-elem-test3", { childrenPortal: true })
      .attributes({})
      .events([])
      .context(() => ({ options: [] as string[] }))
      .methods(() => {
        return {};
      })
      .main(api => {
        const template = () => {
          const div = document.createElement("div");
          div.className = "portal-wrapper";
          div.append(api.childrenPortal);
          return div;
        };

        api.render(template());
      })
      .register();

    const elem = document.createElement("custom-elem-test3") as any as InstanceType<typeof CustomElement>;

    document.body.appendChild(elem);
    expect(elem.outerHTML).toMatchInlineSnapshot(
      `"<custom-elem-test3 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div class="portal-wrapper"><div class="_wc_toolkit_children_container"></div></div></div></custom-elem-test3>"`,
    );

    const child1 = document.createElement("div");
    child1.textContent = "this is child1";

    elem.appendChild(child1);
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(
      `"<custom-elem-test3 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div class="portal-wrapper"><div class="_wc_toolkit_children_container"><div>this is child1</div></div></div></div><div>this is child1</div></custom-elem-test3>"`,
    );

    const child2 = document.createElement("div");
    child2.textContent = "this is child2";
    elem.appendChild(child2);
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(
      `"<custom-elem-test3 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div class="portal-wrapper"><div class="_wc_toolkit_children_container"><div>this is child1</div><div>this is child2</div></div></div></div><div>this is child1</div><div>this is child2</div></custom-elem-test3>"`,
    );

    child1.innerHTML = "<div><div class='abc'>abc</div></div>";
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(
      `"<custom-elem-test3 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div class="portal-wrapper"><div class="_wc_toolkit_children_container"><div><div><div class="abc">abc</div></div></div><div>this is child2</div></div></div></div><div><div><div class="abc">abc</div></div></div><div>this is child2</div></custom-elem-test3>"`,
    );

    const abc = child1.querySelector(".abc")!;
    abc.textContent = "def";
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(
      `"<custom-elem-test3 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div class="portal-wrapper"><div class="_wc_toolkit_children_container"><div><div><div class="abc">def</div></div></div><div>this is child2</div></div></div></div><div><div><div class="abc">def</div></div></div><div>this is child2</div></custom-elem-test3>"`,
    );
  });

  it("custom attribute parser", async () => {
    type JsonAttr = {
      foo: string;
      bar: number[];
    };
    const customParser = {
      fromString(attr: string): JsonAttr {
        return JSON.parse(attr);
      },
      intoString(attr: JsonAttr): string {
        return JSON.stringify(attr);
      },
    };

    const { CustomElement } = customElement("custom-elem-test4")
      .attributes({ state: customParser })
      .events([])
      .context(() => ({}))
      .methods(({ attribute }) => {
        return {
          doThing(newFoo: string, newBar: number[]): boolean {
            attribute.state.set({
              foo: newFoo,
              bar: newBar,
            });

            return true;
          },
        };
      })
      .main(api => {
        const template = () => {
          const div = document.createElement("div");
          div.innerHTML = `
              <span>${api.attribute.state.get()?.foo ?? "not set"}</span>
              <span>${api.attribute.state.get()?.bar.join(", ") ?? "not set"}</span>
            `;
          return div;
        };

        api.render(template());

        api.attribute.state.onChange(() => {
          api.render(template());
        });
      })
      .register();

    const elem = document.createElement("custom-elem-test4") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);

    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test4 class="_wc_toolkit_custom_element"><div class="_wc_toolkit_content_container"><div>
                    <span>not set</span>
                    <span>not set</span>
                  </div></div></custom-elem-test4>"
    `);

    elem.state = {
      foo: "hello",
      bar: [1, 2, 3],
    };
    expect(elem.state).toEqual({
      foo: "hello",
      bar: [1, 2, 3],
    });
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test4 class="_wc_toolkit_custom_element" state="{&quot;foo&quot;:&quot;hello&quot;,&quot;bar&quot;:[1,2,3]}"><div class="_wc_toolkit_content_container"><div>
                    <span>hello</span>
                    <span>1, 2, 3</span>
                  </div></div></custom-elem-test4>"
    `);

    elem.doThing("world", []);
    expect(elem.state).toEqual({
      foo: "world",
      bar: [],
    });
    await sleep(0);
    expect(elem.outerHTML).toMatchInlineSnapshot(`
      "<custom-elem-test4 class="_wc_toolkit_custom_element" state="{&quot;foo&quot;:&quot;world&quot;,&quot;bar&quot;:[]}"><div class="_wc_toolkit_content_container"><div>
                    <span>world</span>
                    <span></span>
                  </div></div></custom-elem-test4>"
    `);
  });

  it("api.onChange prevents too many callback calls on attr change", async () => {
    const onchange = vi.fn();

    const { CustomElement } = customElement("custom-elem-test5")
      .attributes({ foo: "string", bar: "string", baz: "string" })
      .events()
      .context()
      .methods()
      .main((api) => {
        const { attribute } = api;
        api.onChange([attribute.foo, attribute.bar, attribute.baz], () => {
          onchange();
        });
      })
      .register();

    const elem = document.createElement("custom-elem-test5") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);

    expect(onchange).toHaveBeenCalledTimes(0);

    elem.foo = "foo";
    elem.bar = "bar";
    elem.baz = "baz";

    await sleep(0);
    expect(onchange).toHaveBeenCalledTimes(1);

    elem.foo = "FOO";

    await sleep(0);
    expect(onchange).toHaveBeenCalledTimes(2);

    elem.bar = "1";
    elem.baz = "2";

    await sleep(0);
    expect(onchange).toHaveBeenCalledTimes(3);
  });

  it("emit events", () => {
    class MyCustomEvent extends Event {
      declare readonly type: "didthecustomthing";

      constructor() {
        super("didthecustomthing", { cancelable: true });
      }
    }

    const { CustomElement } = customElement("custom-elem-test6")
      .attributes({ state: "string" })
      .events(["didthething", "didthecustomthing"])
      .context()
      .methods(api => ({
        doThing() {
          api.emitEvent("didthething")
            .onCommit(() => {
              api.attribute.state.set("event emitted!");
            })
            .onCancel(() => {
              api.attribute.state.set("event cancelled!");
            });
        },
        doCustomEvent() {
          api.emitEvent(new MyCustomEvent())
            .onCommit(() => {
              api.attribute.state.set("custom event emitted!");
            })
            .onCancel(() => {
              api.attribute.state.set("custom event cancelled!");
            });
        },
      }))
      .main((api) => {})
      .register();

    const elem = document.createElement("custom-elem-test6") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);

    expect.assertions(11);

    expect(elem.state).toBeNull();

    const onEvent = vi.fn();
    elem.addEventListener("didthething", (e) => {
      onEvent();
    });

    elem.doThing();
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(elem.state).toBe("event emitted!");

    elem.addEventListener("didthething", (e) => {
      e.preventDefault();
    });

    elem.doThing();
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(elem.state).toBe("event cancelled!");

    // custom event
    const onCustomEvent = vi.fn();
    elem.addEventListener("didthecustomthing", (e) => {
      expect(e).toBeInstanceOf(MyCustomEvent);
      onCustomEvent();
    });

    elem.doCustomEvent();
    expect(onCustomEvent).toHaveBeenCalledTimes(1);
    expect(elem.state).toBe("custom event emitted!");

    elem.addEventListener("didthecustomthing", (e) => {
      e.preventDefault();
    });

    elem.doCustomEvent();
    expect(onCustomEvent).toHaveBeenCalledTimes(2);
    expect(elem.state).toBe("custom event cancelled!");
  });

  it("custom event handlers in html", () => {
    const onLoopbackEvent = vi.fn(ev => {
    });

    const { CustomElement } = customElement("custom-elem-test7")
      .attributes()
      .events(["customevent"])
      .context()
      .methods(api => {
        return {
          loopback(event: CustomEvent) {
            onLoopbackEvent(event);
          },
          triggerViewed() {
            api.emitEvent("customevent");
          },
        };
      })
      .main(api => {})
      .register();

    const html = `<custom-elem-test7 oncustomevent="event.target.loopback(event)"></custom-elem-test7>`;

    const elem = new DOMParser().parseFromString(html, "text/html").body.firstElementChild! as any as InstanceType<
      typeof CustomElement
    >;

    expect(elem.outerHTML).toMatchInlineSnapshot(
      `"<custom-elem-test7 class="_wc_toolkit_custom_element" oncustomevent="event.target.loopback(event)"><div class="_wc_toolkit_content_container"></div></custom-elem-test7>"`,
    );

    expect(elem).toBeInstanceOf(CustomElement);
    expect(typeof elem.oncustomevent).toBe("function");
    expect(onLoopbackEvent).toHaveBeenCalledTimes(0);

    elem.triggerViewed();

    expect(onLoopbackEvent).toHaveBeenCalledTimes(1);
    expect(onLoopbackEvent).toHaveBeenCalledWith(expect.any(Event));

    elem.oncustomevent = (ev: any) => {
      ev.target.loopback("hello");
    };

    expect(elem.outerHTML).toMatchInlineSnapshot(
      `"<custom-elem-test7 class="_wc_toolkit_custom_element" oncustomevent="event.target.loopback(event)"><div class="_wc_toolkit_content_container"></div></custom-elem-test7>"`,
    );

    elem.triggerViewed();

    expect(onLoopbackEvent).toHaveBeenCalledTimes(2);
    expect(onLoopbackEvent).toHaveBeenCalledWith("hello");

    const outsideScope = { value: 0 };
    elem.oncustomevent = (ev: any) => {
      ev.target.loopback(`value: ${outsideScope.value}`);
    };

    outsideScope.value = 420;
    elem.triggerViewed();

    expect(onLoopbackEvent).toHaveBeenCalledTimes(3);
    expect(onLoopbackEvent).toHaveBeenCalledWith("value: 420");
  });
});
