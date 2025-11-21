# wc_toolkit

_A toolkit for building web-components with ease._

## Installation

```sh
npm i wc_toolkit
```

For the custom elements created with wc_toolkit to appear correctly it's best to include the small css
snippet which you can find in the `wc_toolkit/styles.css` file. If your bundler supports it you might
be able to just simply import it from a js/ts file:

```ts
import "wc_toolkit/styles.css";
```

## Example

```ts
import { customElement } from "wc_toolkit";

customElement("my-video-element")
  .attributes({
    src: "string",
    poster: "string",
    autoplay: "boolean"
  })
  .events({ "progressbar-hover": Event })
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

## Events

Every event that a custom element can emit should be defined in the events method. Each event defeinition must specify the event constructor.

### Example

```ts
customElement("my-video-element")
  .attributes({})
  .events({ "my-custom-event": Event })
```

or a custom event class:

```ts
class MyEvent extends Event {
  constructor(type: string) { //event class must always accept a event type as it's first argument
    super(type);
  }
}

customElement("my-video-element")
  .attributes({})
  .events({ "my-custom-event": MyEvent })
```

events can be then emitted via the `emitEvent` api helper:

```ts
methods(api => {
  return {
    triggerCustomEvent() {
      api.emitEvent("my-custom-event", { cancellable: true })
        .onCommit(() => {
          // do something after emitting the event if it was not canceled
        }) 
        .onCancel(() => {
          // do something if the event was canceled via `event.preventDefault()`
        })
    }
  }
})
```

`api.emitEvent()` cen be either called with the event type name followed by the rest of that Event class arguments or with that Event instance object.
