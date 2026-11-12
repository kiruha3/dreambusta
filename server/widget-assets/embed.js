(function () {
  "use strict";
  const script = document.currentScript;
  if (!script || !script.dataset.widget) return;
  function initialize() {
    const id = script.dataset.widget;
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return;
    const origin = new URL(script.src).origin;
    const base = new URL(".", script.src).href.replace(/\/$/, "");
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
      : "position:absolute;right:0;bottom:0;width:min(390px,calc(100vw - 32px));height:min(600px,calc(100dvh - 32px));border-radius:16px;background:#fff;box-shadow:0 10px 45px #0003;overflow:hidden;transform-origin:bottom right;";
    if (!inline) {
      panel.hidden = true;
      panel.style.display = "none";
      panel.inert = true;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Помощник Дримбусты");
    }
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
    let open = false;
    let animation = null;
    function focusFrame() {
      frame.focus();
      frame.contentWindow.postMessage(
        { type: "dreambusta:focus", widget: id },
        origin,
      );
    }
    function morph(opening) {
      const current = getComputedStyle(panel);
      const start = {
        transform: current.transform,
        opacity: current.opacity,
        borderRadius: current.borderRadius,
      };
      animation?.cancel();
      panel.hidden = false;
      panel.style.display = "block";
      const launcher = button.getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      const collapsed = {
        transform: `scale(${launcher.width / bounds.width},${launcher.height / bounds.height})`,
        opacity: 0,
        borderRadius: "24px",
      };
      const finish = () => {
        animation = null;
        if (!open) {
          panel.hidden = true;
          panel.style.display = "none";
          button.style.visibility = "visible";
          button.removeAttribute("aria-hidden");
          button.tabIndex = 0;
          button.focus({ preventScroll: true });
        }
      };
      if (
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        !panel.animate
      ) {
        finish();
        return;
      }
      animation = panel.animate(
        opening
          ? [collapsed, { transform: "none", opacity: 1, borderRadius: "16px" }]
          : [start, collapsed],
        { duration: opening ? 300 : 220, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
      animation.onfinish = finish;
    }
    function close() {
      if (inline || !open) return;
      open = false;
      panel.inert = true;
      button.setAttribute("aria-expanded", "false");
      morph(false);
    }
    button.onclick = function () {
      if (open) return;
      open = true;
      panel.inert = false;
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
      button.style.visibility = "hidden";
      morph(true);
      focusFrame();
    };
    window.addEventListener("message", function (event) {
      if (
        event.source !== frame.contentWindow ||
        event.origin !== origin ||
        !event.data ||
        event.data.widget !== id
      )
        return;
      if (event.data.type === "dreambusta:ready") {
        frame.contentWindow.postMessage(
          { type: "dreambusta:context", widget: id },
          origin,
        );
        if (open) focusFrame();
      }
      if (event.data.type === "dreambusta:close") close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !inline && open) {
        event.preventDefault();
        close();
      }
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
