import { Window } from "happy-dom";

const window = new Window();
for (const k of Object.getOwnPropertyNames(window)) {
  if (!(k in globalThis)) globalThis[k] = window[k];
}

let distIndex;
try {
  distIndex = await import("../dist/esm/index.mjs");
} catch (err) {
  console.error(
    "Could not import '../dist/esm/index.mjs'. Make sure the library is built first: run `yarn build`.",
  );
  console.error(err);
  process.exit(1);
}

const { customElement, registerDependencyHandler } = distIndex;

// A bench component with 5 attributes, 2 custom events, a context,
// a couple of methods and one api.onChange — mirroring the
// "adw-selector" shape at small scale.
class AttrObject {
  static fromString(str) {
    return JSON.parse(str);
  }
  static intoString(value) {
    return JSON.stringify(value);
  }
}

const { CustomElement: BenchElem } = customElement("bench-elem", {
  childrenPortal: false,
})
  .attributes({
    str: "string",
    bool: "boolean",
    num: "number",
    list: "string[]",
    obj: AttrObject,
  })
  .events({
    customThing: Event,
    otherThing: Event,
  })
  .context(() => ({ counter: 0 }))
  .methods(api => ({
    doThing() {
      api.context.counter++;
    },
    getBool() {
      return api.attribute.bool.get();
    },
  }))
  .connected(api => {
    api.onChange([api.attribute.str], () => {
      api.context.counter++;
    });
  });

const { CustomElement: PortalElem } = customElement("bench-portal-elem", {
  childrenPortal: true,
})
  .attributes({})
  .events()
  .context(() => ({}))
  .methods(() => ({}))
  .connected(api => {
    api.replace(api.childrenPortal);
  });

customElements.define("bench-elem", BenchElem);
customElements.define("bench-portal-elem", PortalElem);

const container = document.createElement("div");
document.body.appendChild(container);

function bench(name, { setup = () => {}, fn, ops = 1000, warmup = 100 }) {
  const instances = [];
  setup(instances);

  for (let i = 0; i < warmup; i++) fn(instances, i);
  for (const inst of [...instances]) {
    inst.remove?.();
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < ops; i++) fn(instances, i);
  const end = process.hrtime.bigint();

  const totalNs = Number(end - start);
  const usPerOp = totalNs / ops / 1000;
  console.log(`${name.padEnd(50)} ${usPerOp.toFixed(3)} µs/op  (${ops} ops)`);
}

// variant for scenarios that need mutation-observer delivery (which is
// scheduled as a task/microtask and never runs inside a tight sync loop)
async function benchAsync(name, { fn, ops = 200, warmup = 20 }) {
  for (let i = 0; i < warmup; i++) await fn(i);

  const start = process.hrtime.bigint();
  for (let i = 0; i < ops; i++) await fn(i);
  const end = process.hrtime.bigint();

  const totalNs = Number(end - start);
  const usPerOp = totalNs / ops / 1000;
  console.log(`${name.padEnd(50)} ${usPerOp.toFixed(3)} µs/op  (${ops} ops)`);
}

// 1. createElement + append + remove (construction cost)
bench(
  "1. create + connect + disconnect",
  {
    fn: instances => {
      const elem = document.createElement("bench-elem");
      container.appendChild(elem);
      instances.push(elem);
      elem.remove();
    },
    ops: 500,
    warmup: 50,
  },
);

// 2. re-connect cycle of one instance (observer/cleanup cost)
{
  const elem = document.createElement("bench-elem");
  container.appendChild(elem);
  elem.remove();
  bench(
    "2. re-connect cycle (same instance)",
    {
      setup: () => {},
      fn: () => {
        container.appendChild(elem);
        elem.remove();
      },
      ops: 2000,
      warmup: 200,
    },
  );
}

// 3. setAttribute churn, no listener (event-alloc skip target)
{
  const elem = document.createElement("bench-elem");
  container.appendChild(elem);
  elem.remove();
  bench(
    "3. setAttribute churn, no listener",
    {
      fn: (_, i) => {
        elem.setAttribute("num", String(i));
      },
      ops: 5000,
      warmup: 500,
    },
  );
}

// 4. setAttribute churn, with one onChange (dispatch cost, must not regress)
{
  const elem = document.createElement("bench-elem");
  container.appendChild(elem);
  elem.remove();
  bench(
    "4. setAttribute churn, with onChange",
    {
      fn: (_, i) => {
        elem.setAttribute("str", `v${i}`);
      },
      ops: 5000,
      warmup: 500,
    },
  );
}

// 5. boolean .get() churn on unset attr (falsy memo target)
{
  const elem = document.createElement("bench-elem");
  container.appendChild(elem);
  elem.remove();
  bench(
    "5. boolean .get() churn (unset attr)",
    {
      fn: () => {
        elem.getBool();
      },
      ops: 10000,
      warmup: 1000,
    },
  );
}

// 6. childrenPortal component, append-child churn (mirroredNode target).
// The element stays mounted for the whole scenario: the element-level
// MutationObserver is disconnected while unmounted and its delivery is
// scheduled asynchronously, so the portal sync never runs in a tight
// sync loop. Each op appends a churn child among 5 static children and
// waits for the observer delivery (portal re-sync), then removes it.
{
  const elem = document.createElement("bench-portal-elem");
  container.appendChild(elem);
  for (let i = 0; i < 30; i++) {
    const staticChild = document.createElement("div");
    staticChild.innerHTML = `<span class="a"><b>static ${i}</b><i>x</i></span>`;
    elem.appendChild(staticChild);
  }
  await new Promise(resolve => setTimeout(resolve, 0)); // initial portal sync

  await benchAsync(
    "6. portal: churn one child among 30 statics",
    {
      fn: async (_, i) => {
        const child = document.createElement("div");
        child.textContent = `churn ${i}`;
        elem.appendChild(child);
        await new Promise(resolve => setTimeout(resolve, 0));
        child.remove();
        await new Promise(resolve => setTimeout(resolve, 0));
      },
      ops: 200,
      warmup: 20,
    },
  );

  elem.remove();
}

// 7. property get churn on string attr (memo hit path)
{
  const elem = document.createElement("bench-elem");
  elem.str = "stable value";
  container.appendChild(elem);
  elem.remove();
  bench(
    "7. string attr property get churn",
    {
      fn: () => {
        for (let i = 0; i < 100; i++) elem.str;
      },
      ops: 100,
      warmup: 10,
    },
  );
}
