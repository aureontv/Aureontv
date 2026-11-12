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
      "Modo web/PWA: el navegador no puede emitir infrarrojos. Conecta Home Assistant por HTTPS y selecciona tu televisor para enviar órdenes por Wi‑Fi. Para usar el infrarrojo del Redmi, abre la app Android.",
      "warning"
    );
    buttons.forEach(button => button.addEventListener("click", async () => {
      const command = button.dataset.irCommand;
      if (typeof window.AureonWebRemoteCommand !== "function") {
        setStatus("Primero conecta Home Assistant y selecciona un televisor compatible en esta página.", "warning");
        return;
      }
      setDisabled(true);
      setStatus("Enviando orden por Wi‑Fi…");
      try {
        await window.AureonWebRemoteCommand(command);
        setStatus("Solicitud enviada a Home Assistant. Comprueba la respuesta del televisor en el estado de conexión.", "success");
      } catch (error) {
        setStatus(error?.message || "No se pudo enviar la orden por Wi‑Fi.", "warning");
      } finally {
        setDisabled(false);
      }
    }));
    return;
  }

  let ready = false, busy = false;
  setDisabled(true);
  setStatus("Comprobando el emisor infrarrojo del teléfono…");
  window.AureonIR.getStatus().then(result => {
    if (!result?.available) {
      setStatus("Android no detectó un emisor infrarrojo disponible.", "warning");
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
