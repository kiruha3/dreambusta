import React from "react";
import ReactDOM from "react-dom/client";
import { createApp } from "vue";
import App from "./App";
import VueApp from "./VueApp.vue";
import "./style.css";

const reactRootElement = document.getElementById("react-root");
const vueRootElement = document.getElementById("vue-root");

if (reactRootElement) {
  const reactRoot = ReactDOM.createRoot(reactRootElement);
  reactRoot.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (vueRootElement) {
  createApp(VueApp).mount(vueRootElement);
}

