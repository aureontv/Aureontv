const section = document.querySelector("#ir-remote");
const status = document.querySelector("#ir-status");
const brand = document.querySelector("#ir-brand");
const buttons = [...document.querySelectorAll("[data-ir-command]")];

function setStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

async function initializeInfraredRemote() {
  if (!section || !window.__AUREON_NATIVE__ || !window.AureonIR) return;
  section.hidden = false;
  setStatus("Comprobando el emisor infrarrojo del teléfono…");
  try {
    const result = await window.AureonIR.getStatus();
    if (!result?.available) {
      setStatus("Android no detectó un emisor infrarrojo integrado. El mando IR no puede transmitir desde este teléfono.", "warning");
      buttons.forEach(button => button.disabled = true);
      return;
    }
    setStatus("Emisor infrarrojo detectado · 38 kHz · listo para probar con LG.", "success");
  } catch (error) {
    setStatus(error?.message || "No se pudo comprobar el emisor infrarrojo.", "warning");
    buttons.forEach(button => button.disabled = true);
  }
}

buttons.forEach(button => button.addEventListener("click", async () => {
  const command = button.dataset.irCommand;
  buttons.forEach(item => item.disabled = true);
  setStatus("Transmitiendo señal infrarroja…");
  try {
    const result = await window.AureonIR.transmit({
      manufacturer: brand.value,
      command
    });
    setStatus(result?.accepted
      ? "Señal IR enviada. Apunta la parte superior del teléfono hacia el televisor."
      : "Android no confirmó el envío de la señal.", result?.accepted ? "success" : "warning");
  } catch (error) {
    setStatus(error?.message || "No se pudo enviar la señal infrarroja.", "warning");
  } finally {
    buttons.forEach(item => item.disabled = false);
  }
}));

void initializeInfraredRemote();
