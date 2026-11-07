const STORAGE_KEY="controlhub.devices.v1";
const PAIRED_KEY="controlhub.paired-tv.v1";
const icons={tv:"▣",ac:"❄",light:"☼",speaker:"♫",computer:"▤",other:"◇"};
const labels={tv:"Televisor",ac:"Aire acondicionado",light:"Luz inteligente",speaker:"Altavoz",computer:"Computadora",other:"Otro dispositivo"};
const $=s=>document.querySelector(s);
let devices=load(STORAGE_KEY,[]);
let pairedTv=load(PAIRED_KEY,null);
let discovered=[];
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch{return fallback}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(devices));render()}
function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(){
 $("#total-count").textContent=devices.length+ (pairedTv?1:0);
 $("#online-count").textContent="—";
 $("#room-count").textContent=new Set(devices.map(d=>d.room).filter(Boolean)).size;
 $("#empty-state").hidden=devices.length>0||!!pairedTv;
 $("#device-grid").innerHTML=devices.map(d=>'<article class="device-card"><div class="device-icon">'+(icons[d.type]||"◇")+'</div><h3>'+escapeHTML(d.name)+'</h3><p>'+(labels[d.type]||"Dispositivo")+' · '+escapeHTML(d.model||"Modelo por configurar")+(d.room?" · "+escapeHTML(d.room):"")+'</p><span class="pending">Pendiente de conexión</span></article>').join("");
 if(pairedTv){$("#tv-remote").hidden=false;$("#remote-device-name").textContent=pairedTv.name||"Televisor";$("#remote-device-model").textContent=[pairedTv.manufacturer,pairedTv.model].filter(Boolean).join(" · ");}else{$("#tv-remote").hidden=true;}
}
const dialog=$("#device-dialog");function openDialog(){dialog.showModal()}
$("#add-device").addEventListener("click",openDialog);$("#empty-add").addEventListener("click",openDialog);
$("#close-dialog").addEventListener("click",()=>dialog.close());$("#cancel-dialog").addEventListener("click",()=>dialog.close());
$("#device-form").addEventListener("submit",event=>{event.preventDefault();const data=new FormData(event.currentTarget);devices.unshift({id:crypto.randomUUID(),name:data.get("name").trim(),type:data.get("type"),model:data.get("model").trim(),room:data.get("room").trim(),createdAt:new Date().toISOString()});save();event.currentTarget.reset();dialog.close()});
document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".nav-item").forEach(item=>item.classList.remove("active"));button.classList.add("active");const views={devices:"Mis dispositivos",rooms:"Habitaciones",activity:"Actividad"};$("#page-title").textContent=views[button.dataset.view]||"Mis dispositivos";if(button.dataset.view!=="devices")alert("Esta sección se habilitará en una próxima etapa.")}));

// La app móvil nativa expone este puente tras implementar NSD/mDNS y los adaptadores de cada fabricante.
const tvPlugin=()=>window.Capacitor?.Plugins?.ControlHubTV||window.ControlHubTV||null;
const discoverButton=$("#discover-devices"), discoveryStatus=$("#discovery-status"), discoveryResults=$("#discovery-results");
function showDiscoveryMessage(message){discoveryStatus.textContent="Búsqueda no disponible";discoveryResults.hidden=false;discoveryResults.innerHTML='<p class="discovery-empty">'+escapeHTML(message)+'</p>'}
discoverButton.addEventListener("click",async()=>{
 const plugin=tvPlugin();
 discoveryResults.hidden=false;discoveryResults.innerHTML="";
 if(!plugin||typeof plugin.discover!=="function"){
  showDiscoveryMessage("La búsqueda Wi‑Fi todavía no está disponible en esta versión web. Para detectar televisores reales hace falta instalar la app móvil nativa de Control Hub y conceder permiso de red local.");
  return;
 }
 discoverButton.disabled=true;discoveryStatus.textContent="Buscando dispositivos compatibles en tu red Wi‑Fi…";
 try{
  const response=await plugin.discover();
  discovered=Array.isArray(response?.devices)?response.devices:[];
  if(!discovered.length){showDiscoveryMessage("No se encontraron televisores compatibles. Comprueba que el celular y el televisor estén en la misma red Wi‑Fi y que el televisor esté encendido.");return;}
  discoveryResults.innerHTML="";
  for(const device of discovered){
   if(!device?.id)continue;
   const card=document.createElement("article");card.className="discovered-device";
   const title=document.createElement("strong");title.textContent=[device.manufacturer||"Marca no identificada",device.model||device.name||"Modelo no identificado"].filter(Boolean).join(" · ");
   const detail=document.createElement("span");detail.textContent=[device.platform||device.protocol||"Dispositivo compatible",device.address||""].filter(Boolean).join(" · ");
   const pair=document.createElement("button");pair.className="primary";pair.type="button";pair.textContent="Vincular televisor";
   pair.addEventListener("click",()=>pairTv(device,pair));
   card.append(title,detail,pair);discoveryResults.append(card);
  }
  discoveryStatus.textContent=discoveryResults.children.length+" dispositivo(s) detectado(s) por la app.";
 }catch(error){showDiscoveryMessage(error?.message||"No se pudo buscar dispositivos. Revisa el permiso de red local.");}
 finally{discoverButton.disabled=false;}
});
async function pairTv(device,button){
 const plugin=tvPlugin();if(!plugin||typeof plugin.pair!=="function")return;
 button.disabled=true;button.textContent="Esperando confirmación…";
 try{
  const result=await plugin.pair({deviceId:device.id});
  if(!result?.paired||!result.connectionId)throw new Error("El televisor no confirmó la vinculación. Acepta la solicitud o introduce el código que aparece en la pantalla del TV.");
  pairedTv={id:device.id,connectionId:result.connectionId,name:device.name||device.model||"Televisor",manufacturer:device.manufacturer||"",model:device.model||"",capabilities:Array.isArray(result.capabilities)?result.capabilities:[]};
  localStorage.setItem(PAIRED_KEY,JSON.stringify(pairedTv));render();
  $("#remote-status").textContent="Televisor vinculado. Los botones enviarán órdenes al dispositivo.";
  $("#tv-remote").scrollIntoView({behavior:"smooth",block:"center"});
 }catch(error){discoveryStatus.textContent=error?.message||"No se pudo vincular el televisor.";button.disabled=false;button.textContent="Volver a intentar";}
}
async function sendTvCommand(command){
 const plugin=tvPlugin();
 if(!pairedTv||!plugin||typeof plugin.sendCommand!=="function"){ $("#remote-status").textContent="No hay una conexión nativa activa con el televisor.";return;}
 if(pairedTv.capabilities.length&&!pairedTv.capabilities.includes(command)){ $("#remote-status").textContent="Este modelo no ofrece esa función.";return;}
 document.querySelectorAll("[data-tv-command]").forEach(b=>b.disabled=true);
 $("#remote-status").textContent="Enviando orden…";
 try{
  const result=await plugin.sendCommand({connectionId:pairedTv.connectionId,command});
  $("#remote-status").textContent=result?.accepted?"Orden enviada al televisor.":"El televisor no confirmó la orden.";
 }catch(error){$("#remote-status").textContent=error?.message||"No se pudo enviar la orden.";}
 finally{document.querySelectorAll("[data-tv-command]").forEach(b=>b.disabled=false);}
}
document.querySelectorAll("[data-tv-command]").forEach(button=>button.addEventListener("click",()=>sendTvCommand(button.dataset.tvCommand)));
$("#disconnect-tv").addEventListener("click",async()=>{
 const plugin=tvPlugin();
 try{if(plugin?.unpair&&pairedTv)await plugin.unpair({connectionId:pairedTv.connectionId});}catch{}
 pairedTv=null;localStorage.removeItem(PAIRED_KEY);render();discoveryStatus.textContent="Televisor desvinculado.";
});
render();
