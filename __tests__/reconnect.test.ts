import { describe, expect, it } from "vitest";
import { customElement } from "../src/index";

const sleep = (ms: number = 0) => new Promise(resolve => setTimeout(resolve, ms));

describe("reconnect with mutation observer reuse", () => {
  it("portal children re-sync on the second mount of a childrenPortal component", async () => {
    const { CustomElement } = customElement("reconnect-elem-1", { childrenPortal: true })
      .attributes()
      .events()
      .context()
      .methods(() => ({}))
      .connected(api => {
        api.replace(api.childrenPortal);
      })
      .register();

    const elem = document.createElement("reconnect-elem-1") as any as InstanceType<typeof CustomElement>;
    const getPortal = () => elem.querySelector("._wc_toolkit_children_container") as HTMLDivElement | null;

    // first mount
    document.body.appendChild(elem);
    expect(getPortal()).toBeInstanceOf(HTMLDivElement);

    const child1 = document.createElement("div");
    child1.textContent = "first mount child";
    elem.appendChild(child1);
    await sleep(0);

    expect(getPortal()!.children).toHaveLength(1);
    expect(getPortal()!.children[0]!.textContent).toBe("first mount child");
    expect(getPortal()!.children[0]).not.toBe(child1);

    // unmount
    elem.remove();
    await sleep(0);

    // second mount — the portal is re-created by the connected callback and
    // the (reused) mutation observer must re-sync children again
    document.body.appendChild(elem);
    expect(getPortal()).toBeInstanceOf(HTMLDivElement);

    const child2 = document.createElement("div");
    child2.textContent = "second mount child";
    elem.appendChild(child2);
    await sleep(0);

    const portalChildren = getPortal()!.children;
    expect(portalChildren).toHaveLength(2);
    expect(portalChildren[0]!.textContent).toBe("first mount child");
    expect(portalChildren[1]!.textContent).toBe("second mount child");
  });
});
