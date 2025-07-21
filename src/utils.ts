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

export function toAttributeName(str: string): string {
  return str.replace(/([a-z][A-Z])/g, (_, g) => `${g[0]}${g[1].toLowerCase()}`).toLowerCase();
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
  "animationend",
  "animationiteration",
  "animationstart",
  "beforeprint",
  "beforeunload",
  "blur",
  "canplay",
  "canplaythrough",
  "change",
  "click",
  "contextmenu",
  "copy",
  "cut",
  "dblclick",
  "drag",
  "dragend",
  "dragenter",
  "dragleave",
  "dragover",
  "dragstart",
  "drop",
  "durationchange",
  "ended",
  "error",
  "focus",
  "focusin",
  "focusout",
  "fullscreenchange",
  "fullscreenerror",
  "hashchange",
  "input",
  "invalid",
  "keydown",
  "keypress",
  "keyup",
  "load",
  "loadeddata",
  "loadedmetadata",
  "loadstart",
  "message",
  "mousedown",
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseover",
  "mouseout",
  "mouseup",
  "mousewheel",
  "offline",
  "online",
  "open",
  "pagehide",
  "pageshow",
  "paste",
  "pause",
  "play",
  "playing",
  "popstate",
  "progress",
  "ratechange",
  "resize",
  "reset",
  "scroll",
  "search",
  "seeked",
  "seeking",
  "select",
  "show",
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
  "transitionend",
  "unload",
  "volumechange",
  "waiting",
  "wheel",
];
