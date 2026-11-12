export function initializeAureonIRRemote() {
  const section = document.querySelector("#ir-remote");
  const status = document.querySelector("#ir-status");
  const brand = document.querySelector("#ir-brand");
  const buttons = [...document.querySelectorAll("[data-ir-command]")];

  if (!section || !status || !brand || buttons.length === 0) return;
  if (!window.__AUREON_NATIVE__ || !window.AureonIR) return;

  let ready = false;
  let busy = false;

  function setStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function setButtonsDisabled(disabled) {
    buttons.forEach(button => { button.disabled = disabled; });
  }

  section.hidden = false;
  setButtonsDisabled(true);
  setStatus("Comprobando el emisor infrarrojo del teléfono…");

  window.AureonIR.getStatus()
    .then(result => {
      if (!result?.available) {
        setStatus("Android no detectó un emisor infrarrojo disponible. Revisa el servicio IR del teléfono.", "warning");
        return;
      }

      const ranges = Array.isArray(result.frequencyRanges) ? result.frequencyRanges : [];
      const supports38k = ranges.some(range =>
        Number(range.minHz) <= 38000 && Number(range.maxHz) >= 38000
      );

      if (ranges.length > 0 && !supports38k) {
        setStatus("El emisor IR está presente, pero Android no informa compatibilidad con 38 kHz para este perfil LG.", "warning");
        return;
      }

      ready = true;
      setButtonsDisabled(false);
      setStatus(
        supports38k
          ? "Emisor IR detectado · 38 kHz compatible · perfil LG listo para probar."
          : "Emisor IR detectado. Android no informó sus rangos; se comprobará al transmitir.",
        "success"
      );
    })
    .catch(error => {
      setStatus(error?.message || "No se pudo comprobar el emisor infrarrojo.", "warning");
    });

  buttons.forEach(button => button.addEventListener("click", async () => {
    if (!ready || busy) return;

    busy = true;
    setButtonsDisabled(true);
    setStatus("Transmitiendo señal infrarroja…");

    try {
      const result = await window.AureonIR.transmit({
        manufacturer: brand.value,
        command: button.dataset.irCommand
      });
      setStatus(
        result?.accepted
          ? "Android transmitió la señal. Apunta la parte superior del Redmi al televisor; el envío no confirma por sí solo que el TV la haya recibido."
          : "Android no confirmó la transmisión.",
        result?.accepted ? "success" : "warning"
      );
    } catch (error) {
      setStatus(error?.message || "No se pudo transmitir la señal infrarroja.", "warning");
    } finally {
      busy = false;
      setButtonsDisabled(!ready);
    }
  }));
}
