import { describe, expect, it } from "vitest";
import { customElement } from "../src/index";

const sleep = (ms: number = 0) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Locks the differential portal sync behavior (perf plan item 5.1):
 * - per-child mirrors are reused across children mutations,
 * - portal node identity is stable for unchanged siblings
 *   (accepted divergence vs. the old full re-clone),
 * - removed children get their mirror node removed and their
 *   observer disconnected.
 */
describe("childrenPortal differential sync", () => {
  it("internal mutation of a child still refreshes its mirror", async () => {
    let portal: HTMLDivElement;

    const { CustomElement } = customElement("portal-test-1", { childrenPortal: true })
      .attributes()
      .events()
      .context()
      .methods()
      .connected(api => {
        portal = api.childrenPortal;
      })
      .register();

    const elem = document.createElement("portal-test-1") as any as InstanceType<
      typeof CustomElement
    >;
    document.body.appendChild(elem);

    const child = document.createElement("div");
    child.textContent = "before";
    elem.appendChild(child);
    await sleep(0);

    expect(portal!.childNodes.length).toBe(1);
    expect(portal!.textContent).toBe("before");

    child.textContent = "after";
    await sleep(0);

    expect(portal!.childNodes.length).toBe(1);
    expect(portal!.textContent).toBe("after");

    child.innerHTML = "<span>deep</span>";
    await sleep(0);

    expect(portal!.querySelector("span")?.textContent).toBe("deep");
  });

  it("adding a sibling does not change other mirrors' portal node identity", async () => {
    let portal: HTMLDivElement;

    const { CustomElement } = customElement("portal-test-2", { childrenPortal: true })
      .attributes()
      .events()
      .context()
      .methods()
      .connected(api => {
        portal = api.childrenPortal;
      })
      .register();

    const elem = document.createElement("portal-test-2") as any as InstanceType<
      typeof CustomElement
    >;
    document.body.appendChild(elem);

    const child1 = document.createElement("div");
    child1.textContent = "child1";
    const child2 = document.createElement("div");
    child2.textContent = "child2";
    elem.append(child1, child2);
    await sleep(0);

    expect(portal!.childNodes.length).toBe(2);
    const mirror1 = portal!.childNodes[0]!;
    const mirror2 = portal!.childNodes[1]!;
    expect(mirror1.textContent).toBe("child1");
    expect(mirror2.textContent).toBe("child2");

    const child3 = document.createElement("div");
    child3.textContent = "child3";
    elem.appendChild(child3);
    await sleep(0);

    // unchanged siblings keep the exact same portal node objects
    expect(portal!.childNodes.length).toBe(3);
    expect(portal!.childNodes[0]).toBe(mirror1);
    expect(portal!.childNodes[1]).toBe(mirror2);
    expect(portal!.childNodes[2]!.textContent).toBe("child3");

    // removing a sibling also keeps the remaining identities stable
    child3.remove();
    await sleep(0);

    expect(portal!.childNodes.length).toBe(2);
    expect(portal!.childNodes[0]).toBe(mirror1);
    expect(portal!.childNodes[1]).toBe(mirror2);
  });

  it("removing a child removes its mirror node and its later mutations trigger nothing", async () => {
    let portal: HTMLDivElement;

    const { CustomElement } = customElement("portal-test-3", { childrenPortal: true })
      .attributes()
      .events()
      .context()
      .methods()
      .connected(api => {
        portal = api.childrenPortal;
      })
      .register();

    const elem = document.createElement("portal-test-3") as any as InstanceType<
      typeof CustomElement
    >;
    document.body.appendChild(elem);

    const child1 = document.createElement("div");
    child1.textContent = "child1";
    const child2 = document.createElement("div");
    child2.textContent = "child2";
    elem.append(child1, child2);
    await sleep(0);

    const mirror2 = portal!.childNodes[1]!;

    elem.removeChild(child1);
    await sleep(0);

    // mirror node removed from the portal DOM
    expect(portal!.childNodes.length).toBe(1);
    expect(portal!.childNodes[0]).toBe(mirror2);

    // a later mutation of the removed child triggers nothing in the portal
    child1.textContent = "mutated after removal";
    await sleep(0);

    expect(portal!.childNodes.length).toBe(1);
    expect(portal!.childNodes[0]).toBe(mirror2);
    expect(portal!.textContent).toBe("child2");
  });

  it("reordering children and text-node children are reconciled", async () => {
    let portal: HTMLDivElement;

    const { CustomElement } = customElement("portal-test-4", { childrenPortal: true })
      .attributes()
      .events()
      .context()
      .methods()
      .connected(api => {
        portal = api.childrenPortal;
      })
      .register();

    const elem = document.createElement("portal-test-4") as any as InstanceType<
      typeof CustomElement
    >;
    document.body.appendChild(elem);

    const child1 = document.createElement("div");
    child1.textContent = "child1";
    const text = document.createTextNode("text");
    const child2 = document.createElement("div");
    child2.textContent = "child2";
    elem.append(child1, text, child2);
    await sleep(0);

    expect(portal!.childNodes.length).toBe(3);
    expect(portal!.childNodes[0]!.textContent).toBe("child1");
    expect(portal!.childNodes[1]!.textContent).toBe("text");
    expect(portal!.childNodes[2]!.textContent).toBe("child2");

    const mirror1 = portal!.childNodes[0]!;
    const textMirror = portal!.childNodes[1]!;
    const mirror2 = portal!.childNodes[2]!;

    // reorder: child2 moves in front of child1 → [child2, child1, text]
    elem.insertBefore(child2, child1);
    await sleep(0);

    expect(portal!.childNodes.length).toBe(3);
    expect(portal!.childNodes[0]).toBe(mirror2);
    expect(portal!.childNodes[1]).toBe(mirror1);
    expect(portal!.childNodes[2]).toBe(textMirror);
  });

  it("a mirror node stolen out of the portal is left alone when its child is removed", async () => {
    let portal: HTMLDivElement;

    const { CustomElement } = customElement("portal-test-5", { childrenPortal: true })
      .attributes()
      .events()
      .context()
      .methods()
      .connected(api => {
        portal = api.childrenPortal;
      })
      .register();

    const elem = document.createElement("portal-test-5") as any as InstanceType<
      typeof CustomElement
    >;
    document.body.appendChild(elem);

    const child = document.createElement("div");
    child.textContent = "child";
    elem.appendChild(child);
    await sleep(0);

    const thiefContainer = document.createElement("div");
    document.body.appendChild(thiefContainer);

    const mirror = portal!.childNodes[0]!;
    // move the mirror node out of the portal into foreign DOM
    thiefContainer.appendChild(mirror);
    expect(portal!.childNodes.length).toBe(0);

    elem.removeChild(child);
    await sleep(0);

    // the stolen node stays in the consumer's DOM untouched
    expect(thiefContainer.childNodes).toHaveLength(1);
    expect(thiefContainer.childNodes[0]).toBe(mirror);
    expect(portal!.childNodes.length).toBe(0);
  });
});
