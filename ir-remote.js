export function initializeAureonIRRemote() {
  const section = document.querySelector("#ir-remote");
  const status = document.querySelector("#ir-status");
  const brand = document.querySelector("#ir-brand");
  const buttons = [...document.querySelectorAll("[data-ir-command]")];
  if (!section || !status || !brand || !buttons.length || section.dataset.initialized === "true") return;
  section.dataset.initialized = "true";
  section.hidden = false;

  const native = Boolean(window.__AUREON_NATIVE__ && window.AureonIR);
  const setStatus = (message, state = "") => {
    status.textContent = message;
    status.dataset.state = state;
  };
  const setDisabled = disabled => buttons.forEach(button => { button.disabled = disabled; });

  if (!native) {
    setDisabled(false);
    setStatus(
      "Modo PWA: al pulsar un botón, AUREON TV abrirá el módulo Android del Redmi para transmitir la señal infrarroja. Necesitas tener instalada la versión Android actualizada.",
      "warning"
    );
    buttons.forEach(button => button.addEventListener("click", () => {
      const command = button.dataset.irCommand;
      if (!command) return;
      setStatus("Abriendo el emisor infrarrojo de AUREON TV en Android…");
      // Android handles this explicit user gesture through its registered
      // aureontv://ir deep link. Browsers cannot call the IR hardware directly.
      window.location.href = "aureontv://ir?command=" + encodeURIComponent(command);
      window.setTimeout(() => {
        setStatus("Si no se abrió AUREON TV, instala/actualiza el APK con soporte de enlace infrarrojo.", "warning");
      }, 1800);
    }));
    return;
  }

  let ready = false, busy = false;
  setDisabled(true);
  setStatus("Comprobando el emisor infrarrojo del teléfono…");
  window.AureonIR.getStatus().then(result => {
    if (!result?.available) {
      const service = result?.serviceAvailable ? "servicio Android disponible" : "servicio Android no disponible";
      const emitter = result?.emitterAvailable ? "emisor detectado" : "emisor no confirmado";
      const feature = result?.systemFeatureReported ? "característica IR declarada" : "característica IR no declarada por el fabricante";
      setStatus(`No se pudo confirmar el emisor IR: ${service}; ${emitter}; ${feature}. La app no enviará señales hasta detectar el hardware.`, "warning");
      return;
    }
    const ranges = Array.isArray(result.frequencyRanges) ? result.frequencyRanges : [];
    const supports38k = ranges.some(range => Number(range.minHz) <= 38000 && Number(range.maxHz) >= 38000);
    if (ranges.length && !supports38k) {
      setStatus("El emisor IR no informa compatibilidad con 38 kHz para este perfil LG.", "warning");
      return;
    }
    ready = true;
    setDisabled(false);
    setStatus(supports38k ? "Emisor IR detectado · 38 kHz compatible · perfil LG listo." : "Emisor IR detectado; se comprobará la frecuencia al transmitir.", "success");
  }).catch(error => setStatus(error?.message || "No se pudo comprobar el emisor infrarrojo.", "warning"));

  buttons.forEach(button => button.addEventListener("click", async () => {
    if (!ready || busy) return;
    busy = true;
    setDisabled(true);
    setStatus("Transmitiendo señal infrarroja…");
    try {
      const result = await window.AureonIR.transmit({manufacturer: brand.value, command: button.dataset.irCommand});
      setStatus(result?.accepted
        ? "Android transmitió la señal. Esto no confirma que el televisor la haya recibido."
        : "Android no confirmó la transmisión.", result?.accepted ? "success" : "warning");
    } catch (error) {
      setStatus(error?.message || "No se pudo transmitir la señal infrarroja.", "warning");
    } finally {
      busy = false;
      setDisabled(!ready);
    }
  }));
}
