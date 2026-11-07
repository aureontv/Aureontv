const STORAGE_KEY="controlhub.devices.v1";
const icons={tv:"▣",ac:"❄",light:"☼",speaker:"♫",computer:"▤",other:"◇"};
const labels={tv:"Televisor",ac:"Aire acondicionado",light:"Luz inteligente",speaker:"Altavoz",computer:"Computadora",other:"Otro dispositivo"};
const $=s=>document.querySelector(s);
let devices=loadDevices();
function loadDevices(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return []}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(devices));render()}
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(){
 $("#total-count").textContent=devices.length;$("#online-count").textContent="—";
 $("#room-count").textContent=new Set(devices.map(d=>d.room).filter(Boolean)).size;
 $("#empty-state").hidden=devices.length>0;
 $("#device-grid").innerHTML=devices.map(d=>'<article class="device-card"><div class="device-icon">'+(icons[d.type]||"◇")+'</div><h3>'+escapeHTML(d.name)+'</h3><p>'+(labels[d.type]||"Dispositivo")+' · '+escapeHTML(d.model||"Modelo por configurar")+(d.room?" · "+escapeHTML(d.room):"")+'</p><span class="pending">Pendiente de conexión</span></article>').join("");
}
const dialog=$("#device-dialog");function openDialog(){dialog.showModal()}
$("#add-device").addEventListener("click",openDialog);$("#empty-add").addEventListener("click",openDialog);
$("#close-dialog").addEventListener("click",()=>dialog.close());$("#cancel-dialog").addEventListener("click",()=>dialog.close());
$("#device-form").addEventListener("submit",event=>{event.preventDefault();const data=new FormData(event.currentTarget);devices.unshift({id:crypto.randomUUID(),name:data.get("name").trim(),type:data.get("type"),model:data.get("model").trim(),room:data.get("room").trim(),createdAt:new Date().toISOString()});save();event.currentTarget.reset();dialog.close()});
document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".nav-item").forEach(item=>item.classList.remove("active"));button.classList.add("active");const views={devices:"Mis dispositivos",rooms:"Habitaciones",activity:"Actividad"};$("#page-title").textContent=views[button.dataset.view]||"Mis dispositivos";if(button.dataset.view!=="devices")alert("Esta sección se habilitará en una próxima etapa.")}));

// Búsqueda limitada a Bluetooth: el navegador no permite escanear toda la red Wi-Fi local.
const discoverButton=$("#discover-devices");
const discoveryStatus=$("#discovery-status");
const discoveryResults=$("#discovery-results");
if(discoverButton){
 discoverButton.addEventListener("click",async()=>{
  discoveryResults.hidden=false;
  discoveryResults.innerHTML="";
  if(!window.isSecureContext){
   discoveryStatus.textContent="Abre Control Hub mediante HTTPS para comprobar Bluetooth.";
   return;
  }
  if(!navigator.bluetooth || typeof navigator.bluetooth.requestDevice!=="function"){
   discoveryStatus.textContent="Este navegador no ofrece búsqueda Bluetooth web. Prueba Chrome en un dispositivo compatible.";
   discoveryResults.innerHTML='<p class="discovery-empty">No se inició ninguna búsqueda. La detección de televisores por Wi-Fi requiere un puente local o una app nativa.</p>';
   return;
  }
  discoveryStatus.textContent="Elige un dispositivo Bluetooth cercano en la ventana del navegador…";
  try{
   const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true});
   const name=device.name||"Dispositivo Bluetooth sin nombre";
   discoveryStatus.textContent="Dispositivo Bluetooth detectado. Aún no está conectado ni controlable.";
   const card=document.createElement("article");
   card.className="discovered-device";
   const title=document.createElement("strong");title.textContent=name;
   const detail=document.createElement("span");detail.textContent="Detectado mediante el selector Bluetooth del navegador · sin conexión establecida";
   card.append(title,detail);
   discoveryResults.append(card);
  }catch(error){
   if(error && error.name==="NotFoundError") discoveryStatus.textContent="No seleccionaste ningún dispositivo.";
   else if(error && error.name==="SecurityError") discoveryStatus.textContent="El navegador bloqueó el acceso Bluetooth. Revisa permisos y HTTPS.";
   else discoveryStatus.textContent="No se pudo completar la búsqueda Bluetooth en este navegador.";
  }
 });
}
render();