export const mirroredNode = (node: Element) => {
  let clone = node.cloneNode(true);
  const observer = new MutationObserver((mutations) => {
    const newClone = node.cloneNode(true);
    clone.parentNode?.replaceChild(newClone, clone);
    clone = newClone;
  });
  observer.observe(node, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  return {
    current: () => clone,
    remove: () => observer.disconnect(),
  };
};

export function toCamelCase(str: string): string {
  return str.replace(/(-[a-z])/g, (_, part) => part[1].toUpperCase()).replaceAll("-", "");
}

const attrNameCache = new Map<string, string>();
export function toAttributeName(str: string): string {
  let cached = attrNameCache.get(str);
  if (cached === undefined) {
    cached = str.replace(/([a-z][A-Z])/g, (_, g) => `${g[0]}${g[1].toLowerCase()}`).toLowerCase();
    attrNameCache.set(str, cached);
  }
  return cached;
}

export function nodeHasClassName(node: Node, className: string): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).classList.contains(className);
}

export class ListSerializer {
  static intoString(list: any[]): string {
    return list.map(elem => {
      return String(elem).replaceAll(",", "\\,");
    }).join(",");
  }

  static fromString(value: string): string[] {
    const result: string[] = [];

    let escaped = false;
    let current = "";
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      switch (char) {
        case "\\": {
          escaped = !escaped;
          continue;
        }
        case ",": {
          if (!escaped) {
            result.push(current);
            current = "";
            continue;
          }
        }
      }
      current += char;
      escaped = false;
    }

    if (current.length > 0) {
      result.push(current);
    }

    return result;
  }
}

export class ListenerController<Ev extends Event> {
  private active = false;
  private destroyed = false;

  constructor(
    private readonly element: EventTarget,
    private readonly eventNames: string,
    private readonly callback: (event: Ev) => void,
    private readonly options?: boolean | AddEventListenerOptions,
  ) {
    this.enable = this.enable.bind(this);
    this.disable = this.disable.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  enable() {
    if (!this.active && !this.destroyed) {
      this.element.addEventListener(this.eventNames, this.callback as any, this.options);
      this.active = true;
    }
    return this;
  }

  disable() {
    if (this.active) {
      this.element.removeEventListener(this.eventNames, this.callback as any, this.options);
      this.active = false;
    }
    return this;
  }

  destroy() {
    this.disable();
    this.destroyed = true;
    return this;
  }
}

export const ALL_BROWSER_EVENTS = [
  "abort",
  "afterprint",
  "animationcancel",
  "animationend",
  "animationiteration",
  "animationstart",
  "appinstalled",
  "auxclick",
  "beforeinput",
  "beforeinstallprompt",
  "beforematch",
  "beforeprint",
  "beforetoggle",
  "beforeunload",
  "blur",
  "cancel",
  "canplay",
  "canplaythrough",
  "change",
  "click",
  "close",
  "command",
  "compositionend",
  "compositionstart",
  "compositionupdate",
  "contextlost",
  "contextmenu",
  "contextrestored",
  "copy",
  "cuechange",
  "cut",
  "dblclick",
  "devicemotion",
  "deviceorientation",
  "deviceorientationabsolute",
  "domcontentloaded",
  "drag",
  "dragend",
  "dragenter",
  "dragleave",
  "dragover",
  "dragstart",
  "drop",
  "durationchange",
  "emptied",
  "encrypted",
  "ended",
  "enterpictureinpicture",
  "error",
  "focus",
  "focusin",
  "focusout",
  "formdata",
  "freeze",
  "fullscreenchange",
  "fullscreenerror",
  "gamepadconnected",
  "gamepaddisconnected",
  "gotpointercapture",
  "hashchange",
  "input",
  "invalid",
  "keydown",
  "keypress",
  "keystatuseschange",
  "keyup",
  "languagechange",
  "leavepictureinpicture",
  "load",
  "loadeddata",
  "loadedmetadata",
  "loadstart",
  "lostpointercapture",
  "message",
  "messageerror",
  "mousedown",
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "mousewheel",
  "offline",
  "online",
  "open",
  "orientationchange",
  "pagehide",
  "pageshow",
  "paste",
  "pause",
  "play",
  "playing",
  "pointercancel",
  "pointerdown",
  "pointerenter",
  "pointerleave",
  "pointerlockchange",
  "pointerlockerror",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerrawupdate",
  "pointerup",
  "popstate",
  "progress",
  "ratechange",
  "rejectionhandled",
  "reset",
  "resize",
  "resume",
  "scroll",
  "scrollend",
  "scrollsnapchange",
  "scrollsnapchanging",
  "search",
  "securitypolicyviolation",
  "seeked",
  "seeking",
  "select",
  "selectionchange",
  "selectstart",
  "show",
  "slotchange",
  "stalled",
  "storage",
  "submit",
  "suspend",
  "timeupdate",
  "toggle",
  "touchcancel",
  "touchend",
  "touchmove",
  "touchstart",
  "transitioncancel",
  "transitionend",
  "transitionrun",
  "transitionstart",
  "unhandledrejection",
  "unload",
  "visibilitychange",
  "volumechange",
  "waiting",
  "waitingforkey",
  "wheel",
];

export const ALL_BROWSER_EVENTS_SET = new Set(ALL_BROWSER_EVENTS);

export function nofail(fn: () => any) {
  try {
    fn();
  } catch (err) {
    console.error(err);
  }
}

const pendingMicrotaskCallbacks: Array<() => void> = [];
let microtaskBatchScheduled = false;

/**
 * Batches every callback added before the flush into a single microtask,
 * executed in registration order.
 */
export function addNextMicrotaskCallback(cb: () => void) {
  pendingMicrotaskCallbacks.push(cb);
  if (microtaskBatchScheduled) return;
  microtaskBatchScheduled = true;
  queueMicrotask(() => {
    microtaskBatchScheduled = false;
    for (const pending of pendingMicrotaskCallbacks.splice(0)) {
      nofail(pending);
    }
  });
}
