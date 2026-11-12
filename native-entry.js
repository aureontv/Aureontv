import { Capacitor, registerPlugin } from "@capacitor/core";
import { initializeAureonIRRemote } from "./ir-remote.js";

// Register native bridges before initializing features that use them.
window.__AUREON_NATIVE__ = Capacitor.isNativePlatform();
if (window.__AUREON_NATIVE__) {
  window.ControlHubTV = registerPlugin("ControlHubTV");
  window.AureonIR = registerPlugin("AureonIR");
  initializeAureonIRRemote();
}

// Load the same application logic used by the hosted web version.
void import("./app.js");
