// Browser bench page. Served from bench/browser/ over http, imports the
// built library from dist/esm/index.mjs. Runs ONE scenario per page load
// (selected via the `?scenario=N` query param) and POSTs the result JSON
// back to the server. The runner (run.mjs) launches a fresh Chrome page
// for every run, so each measurement starts from a clean VM/GC state.
//
// Methodology notes (load-bearing):
// - Sync scenarios: the whole timed loop runs synchronously inside one
//   task — no awaits interleave with it, matching the loop structure and
//   per-op counts of bench/bench.mjs so numbers stay comparable.
// - Portal scenario (6): each op ends in an await, so the loop cannot run
//   synchronously. The timed region is the whole loop's wall clock,
//   including the microtask flushes between mutations (in real Chrome
//   MutationObserver delivery is microtask-based, so `await null` flushes
//   it, and that delivery cost is part of what we want to measure).

let distIndex;
try {
  distIndex = await import("../../dist/esm/index.mjs");
} catch (err) {
  await post({
    scenario: scenarioId(),
    error: `Could not import dist/esm/index.mjs (build first: yarn build): ${err}`,
  });
  throw err;
}

const { customElement } = distIndex;

// A bench component with 5 attributes, 2 custom events, a context,
// a couple of methods and one api.onChange — mirroring the
// "adw-selector" shape at small scale (same as bench/bench.mjs).
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

const container = document.getElementById("container");

function scenarioId() {
  return Number(new URLSearchParams(location.search).get("scenario") ?? "0");
}

function makeDetachedBenchElem() {
  const elem = document.createElement("bench-elem");
  container.appendChild(elem);
  elem.remove();
  return elem;
}

// Same shape as bench/bench.mjs `bench()` — numbers stay comparable.
function benchSync({ setup = () => {}, fn, ops, warmup }) {
  const instances = [];
  setup(instances);

  for (let i = 0; i < warmup; i++) fn(instances, i);
  for (const inst of [...instances]) {
    inst.remove?.();
  }

  const start = performance.now();
  for (let i = 0; i < ops; i++) fn(instances, i);
  const end = performance.now();

  return ((end - start) / ops) * 1000;
}

// Same shape as bench/bench.mjs `benchAsync()` — numbers stay comparable.
async function benchAsync({ fn, ops, warmup }) {
  for (let i = 0; i < warmup; i++) await fn(i);

  const start = performance.now();
  for (let i = 0; i < ops; i++) await fn(i);
  const end = performance.now();

  return ((end - start) / ops) * 1000;
}

const SCENARIOS = {
  // 1. createElement + append + remove (construction cost)
  1: () =>
    benchSync({
      fn: instances => {
        const elem = document.createElement("bench-elem");
        container.appendChild(elem);
        instances.push(elem);
        elem.remove();
      },
      ops: 500,
      warmup: 50,
    }),

  // 2. re-connect cycle of one instance (observer/cleanup cost)
  2: () => {
    const elem = makeDetachedBenchElem();
    return benchSync({
      fn: () => {
        container.appendChild(elem);
        elem.remove();
      },
      ops: 2000,
      warmup: 200,
    });
  },

  // 3. setAttribute churn, no listener (event-alloc skip target)
  3: () => {
    const elem = makeDetachedBenchElem();
    return benchSync({
      fn: (_, i) => {
        elem.setAttribute("num", String(i));
      },
      ops: 5000,
      warmup: 500,
    });
  },

  // 4. setAttribute churn, with one onChange (dispatch cost, must not regress)
  4: () => {
    const elem = makeDetachedBenchElem();
    return benchSync({
      fn: (_, i) => {
        elem.setAttribute("str", `v${i}`);
      },
      ops: 5000,
      warmup: 500,
    });
  },

  // 5. boolean .get() churn on unset attr (falsy memo target)
  5: () => {
    const elem = makeDetachedBenchElem();
    return benchSync({
      fn: () => {
        elem.getBool();
      },
      ops: 10000,
      warmup: 1000,
    });
  },

  // 6. childrenPortal component, append-child churn (mirroredNode target).
  // The element stays mounted for the whole scenario: the element-level
  // MutationObserver only runs while connected.
  async 6() {
    const elem = document.createElement("bench-portal-elem");
    container.appendChild(elem);
    for (let i = 0; i < 30; i++) {
      const staticChild = document.createElement("div");
      staticChild.innerHTML = `<span class="a"><b>static ${i}</b><i>x</i></span>`;
      elem.appendChild(staticChild);
    }
    await new Promise(resolve => setTimeout(resolve, 0)); // initial portal sync

    const usPerOp = await benchAsync({
      fn: async (_, i) => {
        const child = document.createElement("div");
        child.textContent = `churn ${i}`;
        elem.appendChild(child);
        await null;
        child.remove();
        await null;
      },
      ops: 200,
      warmup: 20,
    });

    elem.remove();
    return usPerOp;
  },

  // 7. property get churn on string attr (memo hit path)
  7: () => {
    const elem = document.createElement("bench-elem");
    elem.str = "stable value";
    container.appendChild(elem);
    elem.remove();
    return benchSync({
      fn: () => {
        for (let i = 0; i < 100; i++) elem.str;
      },
      ops: 100,
      warmup: 10,
    });
  },
};

async function post(body) {
  await fetch("/results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const scenario = scenarioId();
const run = SCENARIOS[scenario];
if (!run) {
  await post({ scenario, error: `unknown scenario: ${scenario}` });
  throw new Error(`unknown scenario: ${scenario}`);
}

try {
  const usPerOp = await run();
  await post({ scenario, usPerOp, runs: [usPerOp] });
} catch (err) {
  await post({ scenario, error: String(err?.stack ?? err) });
  throw err;
}
