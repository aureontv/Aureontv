import { Capacitor, registerPlugin } from "@capacitor/core";

// The native plugin is exposed only inside the installed Capacitor app.
window.__AUREON_NATIVE__ = Capacitor.isNativePlatform();
if (window.__AUREON_NATIVE__) {
  window.ControlHubTV = registerPlugin("ControlHubTV");
}

// Load the same application logic used by the hosted web version.
void import("./app.js");
