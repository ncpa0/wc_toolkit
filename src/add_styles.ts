const style = document.createElement("style");
style.textContent = /* css */ `
._wc_toolkit_custom_element > *:not(._wc_toolkit_content_container) {
  display: none !important;
}
`.trim();

export function addStyles(): void {
  if (typeof document !== "undefined") {
    if (style.parentNode !== document.head) {
      document.head.append(style);
    }
  }
}
