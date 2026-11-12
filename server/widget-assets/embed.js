(function () {
  "use strict";
  const script = document.currentScript;
  if (!script || !script.dataset.widget) return;
  function initialize() {
    const id = script.dataset.widget;
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return;
    const base = new URL(script.src).origin;
    const inline = script.dataset.mode === "inline";
    const mount = document.createElement("div");
    mount.setAttribute("data-dreambusta-widget", id);
    const frame = document.createElement("iframe");
    frame.src = base + "/embed/" + encodeURIComponent(id);
    frame.title = "Помощник Дримбусты";
    frame.referrerPolicy = "no-referrer";
    frame.setAttribute("allow", "");
    frame.style.cssText =
      "display:block;width:100%;height:100%;border:0;border-radius:inherit;background:#fff;color-scheme:light;";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Помощник";
    button.setAttribute("aria-label", "Открыть помощника Дримбусты");
    button.setAttribute("aria-expanded", "false");
    button.style.cssText =
      "font:600 15px/1.4 system-ui,sans-serif;cursor:pointer;border:0;background:#5556d9;color:white;border-radius:24px;padding:13px 19px;box-shadow:0 6px 24px #0003;";
    const panel = document.createElement("div");
    panel.style.cssText = inline
      ? "height:560px;max-height:80vh;width:100%;border:1px solid #ddd;border-radius:16px;overflow:hidden;"
      : "position:absolute;right:0;bottom:64px;width:min(390px,calc(100vw - 32px));height:min(600px,calc(100dvh - 110px));border-radius:16px;box-shadow:0 10px 45px #0003;overflow:hidden;display:none;";
    panel.append(frame);
    mount.append(panel);
    if (inline) {
      const target = script.dataset.target
        ? document.getElementById(script.dataset.target)
        : null;
      if (target) target.append(mount);
      else script.insertAdjacentElement("afterend", mount);
    } else {
      mount.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:2147483000;";
      mount.append(button);
      document.body.append(mount);
    }
    function close() {
      if (inline) return;
      panel.style.display = "none";
      button.setAttribute("aria-expanded", "false");
      button.focus();
    }
    button.onclick = function () {
      const open = panel.style.display === "none";
      panel.style.display = open ? "block" : "none";
      button.setAttribute("aria-expanded", String(open));
      if (open) frame.focus();
    };
    window.addEventListener("message", function (event) {
      if (
        event.source !== frame.contentWindow ||
        event.origin !== base ||
        !event.data ||
        event.data.widget !== id
      )
        return;
      if (event.data.type === "dreambusta:ready")
        frame.contentWindow.postMessage(
          { type: "dreambusta:context", widget: id },
          base,
        );
      if (event.data.type === "dreambusta:close") close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !inline && panel.style.display !== "none")
        close();
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
