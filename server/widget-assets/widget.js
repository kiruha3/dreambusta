(function () {
  "use strict";
  const config = JSON.parse(
    document.getElementById("widget-config").textContent,
  );
  const $ = (id) => document.getElementById(id);
  $("title").textContent = config.title;
  document.documentElement.style.setProperty("--accent", config.accentColor);
  let token = "",
    tokenUntil = 0,
    parentOrigin = "",
    connecting = null,
    controller = null,
    focusRequested = false;
  function status(text) {
    $("status").textContent = text;
  }
  function message(role, text, sources) {
    const node = document.createElement("article");
    node.className = "message " + role;
    const label = document.createElement("strong");
    label.textContent = role === "user" ? "Вы" : "Помощник";
    const content = document.createElement("div");
    content.className = "message-text";
    content.textContent = text;
    node.append(label, content);
    if (sources && sources.length) {
      const list = document.createElement("ul");
      list.className = "sources";
      for (const source of sources) {
        let url;
        try {
          url = new URL(source.url);
        } catch (_) {
          continue;
        }
        if (
          url.origin !== location.origin ||
          !url.pathname.startsWith(
            config.basePath ? config.basePath + "/materials/" : "/library/",
          )
        )
          continue;
        const li = document.createElement("li"),
          link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "[" + source.number + "] " + source.title;
        li.append(link);
        list.append(li);
      }
      node.append(list);
    }
    $("messages").append(node);
    node.scrollIntoView({ block: "end" });
  }
  async function api(path, payload, signal) {
    const response = await fetch(
      (config.basePath || "") +
        "/api/public/widgets/" +
        encodeURIComponent(config.id) +
        path,
      {
        method: "POST",
        credentials: "omit",
        headers: {
          "content-type": "application/json",
          ...(token && path ? { Authorization: "Widget " + token } : {}),
        },
        body: JSON.stringify(payload),
        signal,
      },
    );
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        token = "";
        tokenUntil = 0;
      }
      throw Error(result.error || "Помощник временно недоступен");
    }
    return result;
  }
  async function connect() {
    if (token && tokenUntil > Date.now()) return;
    if (connecting) return connecting;
    connecting = api("", { origin: parentOrigin }).then((result) => {
      token = result.token;
      tokenUntil = Date.now() + (result.expiresIn - 10) * 1000;
      $("query").disabled = false;
      $("ask").disabled = false;
      status("");
      if (focusRequested) $("query").focus();
    });
    try {
      await connecting;
    } finally {
      connecting = null;
    }
  }
  const close = () => {
    focusRequested = false;
    controller?.abort();
    if (parent !== window && parentOrigin)
      parent.postMessage(
        { type: "dreambusta:close", widget: config.id },
        parentOrigin,
      );
  };
  $("close").onclick = close;
  if (parent === window) {
    $("close").hidden = true;
    parentOrigin = location.origin;
    connect().catch((e) => status(e.message));
  } else {
    window.addEventListener("message", (event) => {
      if (
        event.source !== window.parent ||
        !event.data ||
        !["dreambusta:context", "dreambusta:focus"].includes(event.data.type) ||
        event.data.widget !== config.id ||
        !(
          event.origin === location.origin ||
          config.allowedOrigins.includes(event.origin)
        )
      )
        return;
      // The parent cannot change identities after the first accepted handshake.
      if (parentOrigin && parentOrigin !== event.origin) return;
      if (event.data.type === "dreambusta:focus") {
        if (!parentOrigin) return;
        focusRequested = true;
        if (!$("query").disabled) $("query").focus();
        else $("close").focus();
        return;
      }
      parentOrigin = event.origin;
      connect().catch((e) => status(e.message));
    });
    parent.postMessage({ type: "dreambusta:ready", widget: config.id }, "*");
    setTimeout(() => {
      if (!parentOrigin)
        status(
          "Этот сайт не подключён к помощнику. Проверьте разрешённые адреса.",
        );
    }, 8000);
  }
  message("assistant", config.greeting);
  $("question").onsubmit = async (event) => {
    event.preventDefault();
    if (controller || !parentOrigin) return;
    const query = $("query").value.trim();
    if (!query) return;
    controller = new AbortController();
    const signal = controller.signal;
    $("ask").disabled = true;
    $("query").disabled = true;
    $("cancel").hidden = false;
    status("Готовлю ответ…");
    message("user", query);
    $("query").value = "";
    try {
      await connect();
      $("ask").disabled = true;
      $("query").disabled = true;
      const result = await api("/answer", { query }, signal);
      message(
        "assistant",
        result.answer || result.message || "Ответ не найден.",
        result.sources,
      );
      status("");
    } catch (e) {
      status(signal.aborted ? "Запрос отменён." : e.message);
    } finally {
      controller = null;
      $("ask").disabled = false;
      $("query").disabled = false;
      $("cancel").hidden = true;
      $("query").focus();
    }
  };
  $("cancel").onclick = () => controller?.abort();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  window.addEventListener("pagehide", () => controller?.abort());
})();
