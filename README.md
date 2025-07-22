# wc_toolkit

_A toolkit for building web-components with ease._

## Example

```ts
import { customElement } from "wc_toolkit";

customElement("my-video-element")
  .attributes({
    src: "string",
    poster: "string",
    autoplay: "boolean"
  })
  .events(["progressbar-hover"]) // list of events this component is allowed to emit
  .context(() => {
    const internalState = {
      isPlaying: false;
    }
    return internalState;
  })
  .methods(() => {
    return {
      play() {
        /** implementation... */
      },

      pause() {
        /** implementation... */
      },

      _showPreview() { // methods wich name starts with _ will be treated as private
        /** implementation... */
      }
    }
  })
  .connected(api => {
    const videoElem = document.createElement("video");
    const myWrapper = document.createElement("div");
    myWrapper.append(videoElem);

    api.attach(myWrapper);

    api.onChange([api.attribute.src], () => {
      videoElem.src = api.attribute.src.get();
    });
  })
  .register();
```

## Extending Attributes

wc_toolkit does not provide a rendering or state managements solutions, it's expected you will bring your own. therefore it may be useful to adapt the attributes provided to your framework and state management.

Here's how you can add signals to the attributes:

```ts
import { Attribute } from "wc_toolkit";

Attribute.extend(Constructor => {
  return class AttrWithSignals extends Constructor {
    sig = createSignal();

    onCreatedCallback() {
      this.onChange(() => {
        this.sig.set(this.get());
      });
    }
  };
});

// extend the TypeScript declaration as well
declare module "wc_toolkit" {
  class Attribute<K extends string, T> {
    public signal: Signal<T | undefined>;
  }
}
```

with the code above it's now possible to access a `sig` property on every attribute within the `.connected()`, `.methods()` and `.context()` callbacks.

## Extending reactive dependency support

The `.onChange()` method of the ConnectedCallbackApi provides a safe way to add listeners to the component attributes. The added listener will be detached once the component is unmounted.

It's possible to extend the dependency handler so that other things than attributes can be passed to the `onChange()` as dependencies.

Here's how you can add some signal implementation as a supported dependency:

```ts
import { registerDependencyHandler } from "wc_toolkit";

registerDependencyHandler<Signal<any>>({
  detect(v): v is Signal<any> {
    return v instanceof Signal;
  },
  onChange(sig: Signal<any>, cb) {
    const removeListener = sig.addListener(() => cb());
    return removeListener;
  },
});

// extend the TypeScript declaration as well
declare global {
  interface WcToolkitDependencies {
    signal: Signal<any>;
  }
}
```
