import { describe, expect, it } from "vitest";
import { customElement } from "../src/index";

const sleep = (ms: number = 0) => new Promise(resolve => setTimeout(resolve, ms));

type JsonAttr = {
  foo: string;
  bar: number[];
};

const jsonParser = {
  fromString(attr: string): JsonAttr {
    return JSON.parse(attr);
  },
  intoString(attr: JsonAttr): string {
    return JSON.stringify(attr);
  },
};

describe("attribute default values", () => {
  it("returns the default for every attribute type when unset", async () => {
    const { CustomElement } = customElement("attr-default-test1")
      .attributes({
        str: "string",
        num: "number",
        bool: "boolean",
        strArr: "string[]",
        numArr: "number[]",
        parsed: jsonParser,
      }, {
        str: { default: "fallback" },
        num: { default: 42 },
        bool: { default: true },
        strArr: { default: ["a", "b"] },
        numArr: { default: [1, 2] },
        parsed: { default: { foo: "hello", bar: [3] } },
      })
      .events()
      .context(() => ({}))
      .methods(({ attribute }) => {
        return {
          getValues() {
            return {
              str: attribute.str.get(),
              num: attribute.num.get(),
              bool: attribute.bool.get(),
              strArr: attribute.strArr.get(),
              numArr: attribute.numArr.get(),
              parsed: attribute.parsed.get(),
            };
          },
        };
      })
      .connected(() => {})
      .register();

    const elem = document.createElement("attr-default-test1") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);
    await sleep(0);

    expect(elem.getValues()).toEqual({
      str: "fallback",
      num: 42,
      bool: true,
      strArr: ["a", "b"],
      numArr: [1, 2],
      parsed: { foo: "hello", bar: [3] },
    });

    expect(elem.str).toBe("fallback");
    expect(elem.num).toBe(42);
    expect(elem.bool).toBe(true);
    expect(elem.strArr).toEqual(["a", "b"]);
    expect(elem.numArr).toEqual([1, 2]);
    expect(elem.parsed).toEqual({ foo: "hello", bar: [3] });
  });

  it("attribute is not physically set while the default is returned", async () => {
    const { CustomElement } = customElement("attr-default-test2")
      .attributes({ str: "string" }, { str: { default: "fallback" } })
      .events()
      .context(() => ({}))
      .methods(() => ({}))
      .connected(() => {})
      .register();

    const elem = document.createElement("attr-default-test2") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);
    await sleep(0);

    expect(elem.str).toBe("fallback");
    expect(elem.hasAttribute("str")).toBe(false);
    expect(elem.outerHTML).not.toContain("str=");
  });

  it("set values override the default and unset restores it", async () => {
    const { CustomElement } = customElement("attr-default-test3")
      .attributes({
        str: "string",
        num: "number",
        bool: "boolean",
        strArr: "string[]",
        numArr: "number[]",
        parsed: jsonParser,
      }, {
        str: { default: "fallback" },
        num: { default: 42 },
        bool: { default: true },
        strArr: { default: ["a", "b"] },
        numArr: { default: [1, 2] },
        parsed: { default: { foo: "hello", bar: [3] } },
      })
      .events()
      .context(() => ({}))
      .methods(({ attribute }) => {
        return {
          setAll() {
            attribute.str.set("set-value");
            attribute.num.set(0);
            attribute.bool.set(false);
            attribute.strArr.set(["x"]);
            attribute.numArr.set([9]);
            attribute.parsed.set({ foo: "world", bar: [7] });
          },
          unsetAll() {
            attribute.str.unset();
            attribute.num.unset();
            attribute.bool.unset();
            attribute.strArr.unset();
            attribute.numArr.unset();
            attribute.parsed.unset();
          },
        };
      })
      .connected(() => {})
      .register();

    const elem = document.createElement("attr-default-test3") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);
    await sleep(0);

    elem.setAll();
    await sleep(0);
    expect(elem.str).toBe("set-value");
    expect(elem.num).toBe(0);
    expect(elem.bool).toBe(false);
    expect(elem.getAttribute("bool")).toBe("false");
    expect(elem.strArr).toEqual(["x"]);
    expect(elem.numArr).toEqual([9]);
    expect(elem.parsed).toEqual({ foo: "world", bar: [7] });

    elem.unsetAll();
    await sleep(0);
    expect(elem.str).toBe("fallback");
    expect(elem.num).toBe(42);
    expect(elem.bool).toBe(true);
    expect(elem.strArr).toEqual(["a", "b"]);
    expect(elem.numArr).toEqual([1, 2]);
    expect(elem.parsed).toEqual({ foo: "hello", bar: [3] });
  });

  it("external attribute changes override the default and removal restores it", async () => {
    const { CustomElement } = customElement("attr-default-test4")
      .attributes({ str: "string", num: "number" }, { str: { default: "fallback" }, num: { default: 42 } })
      .events()
      .context(() => ({}))
      .methods(() => ({}))
      .connected(() => {})
      .register();

    const elem = document.createElement("attr-default-test4") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);
    await sleep(0);

    expect(elem.str).toBe("fallback");

    elem.setAttribute("str", "external");
    expect(elem.str).toBe("external");

    elem.removeAttribute("str");
    expect(elem.str).toBe("fallback");

    elem.setAttribute("num", "7");
    expect(elem.num).toBe(7);
    elem.removeAttribute("num");
    expect(elem.num).toBe(42);
  });

  it("falsy defaults are honored", async () => {
    const { CustomElement } = customElement("attr-default-test5")
      .attributes({
        str: "string",
        num: "number",
        bool: "boolean",
        strArr: "string[]",
      }, {
        str: { default: "" },
        num: { default: 0 },
        bool: { default: false },
        strArr: { default: [] },
      })
      .events()
      .context(() => ({}))
      .methods(() => ({}))
      .connected(() => {})
      .register();

    const elem = document.createElement("attr-default-test5") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);
    await sleep(0);

    expect(elem.str).toBe("");
    expect(elem.num).toBe(0);
    expect(elem.bool).toBe(false);
    expect(elem.strArr).toEqual([]);
  });

  it("boolean attributes without a default keep the false-when-absent behavior", async () => {
    const { CustomElement } = customElement("attr-default-test6")
      .attributes({ bool: "boolean" })
      .events()
      .context(() => ({}))
      .methods(() => ({}))
      .connected(() => {})
      .register();

    const elem = document.createElement("attr-default-test6") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);
    await sleep(0);

    expect(elem.bool).toBe(false);

    elem.setAttribute("bool", "");
    expect(elem.bool).toBe(true);

    elem.setAttribute("bool", "false");
    expect(elem.bool).toBe(false);

    elem.removeAttribute("bool");
    expect(elem.bool).toBe(false);
  });

  it("boolean attributes with a default can be set to false via an explicit false value", async () => {
    const { CustomElement } = customElement("attr-default-test7")
      .attributes({ bool: "boolean" }, { bool: { default: true } })
      .events()
      .context(() => ({}))
      .methods(({ attribute }) => {
        return {
          setFalse() {
            attribute.bool.set(false);
          },
          unset() {
            attribute.bool.unset();
          },
        };
      })
      .connected(() => {})
      .register();

    const elem = document.createElement("attr-default-test7") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);
    await sleep(0);

    expect(elem.bool).toBe(true);
    expect(elem.hasAttribute("bool")).toBe(false);

    // set(false) persists "false" so the value doesn't collapse into the default
    elem.setFalse();
    await sleep(0);
    expect(elem.bool).toBe(false);
    expect(elem.getAttribute("bool")).toBe("false");
    expect(elem.hasAttribute("bool")).toBe(true);

    elem.unset();
    await sleep(0);
    expect(elem.bool).toBe(true);
    expect(elem.hasAttribute("bool")).toBe(false);
  });

  it("attributes without a default keep returning null when unset", async () => {
    const { CustomElement } = customElement("attr-default-test8")
      .attributes({ str: "string", num: "number" })
      .events()
      .context(() => ({}))
      .methods(() => ({}))
      .connected(() => {})
      .register();

    const elem = document.createElement("attr-default-test8") as any as InstanceType<typeof CustomElement>;
    document.body.appendChild(elem);
    await sleep(0);

    expect(elem.str).toBe(null);
    expect(elem.num).toBe(null);
  });
});
