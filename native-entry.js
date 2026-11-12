import { Capacitor, registerPlugin } from "@capacitor/core";

// Register native bridges before initializing features that use them.
window.__AUREON_NATIVE__ = Capacitor.isNativePlatform();
if (window.__AUREON_NATIVE__) {
  window.ControlHubTV = registerPlugin("ControlHubTV");
  window.AureonIR = registerPlugin("AureonIR");
}

// Load the same application logic used by the hosted web version.
void import("./app.js");
