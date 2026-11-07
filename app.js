const STORAGE_KEY="controlhub.devices.v1";
const PAIRED_KEY="controlhub.paired-tv.v1";
const icons={tv:"▣",ac:"❄",light:"☼",speaker:"♫",computer:"▤",other:"◇"};
const labels={tv:"Televisor",ac:"Aire acondicionado",light:"Luz inteligente",speaker:"Altavoz",computer:"Computadora",other:"Otro dispositivo"};
const $=s=>document.querySelector(s);
let devices=load(STORAGE_KEY,[]);
let pairedTv=load(PAIRED_KEY,null);
let discovered=[];
let haClient=null;
let haTvDevices=[];
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch{return fallback}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(devices));render()}
function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(){
 $("#total-count").textContent=devices.length+ (pairedTv?1:0);
 $("#online-count").textContent=haClient?String(haTvDevices.filter(d=>d.state!=="unavailable"&&d.state!=="unknown").length):"—";
 $("#room-count").textContent=new Set(devices.map(d=>d.room).filter(Boolean)).size;
 $("#empty-state").hidden=devices.length>0||!!pairedTv;
 $("#device-grid").innerHTML=devices.map(d=>'<article class="device-card"><div class="device-icon">'+(icons[d.type]||"◇")+'</div><h3>'+escapeHTML(d.name)+'</h3><p>'+(labels[d.type]||"Dispositivo")+' · '+escapeHTML(d.model||"Modelo por configurar")+(d.room?" · "+escapeHTML(d.room):"")+'</p><span class="pending">Pendiente de conexión</span></article>').join("");
 if(pairedTv){$("#tv-remote").hidden=false;$("#remote-device-name").textContent=pairedTv.name||"Televisor";$("#remote-device-model").textContent=[pairedTv.manufacturer,pairedTv.model].filter(Boolean).join(" · ");if(pairedTv.source==="home_assistant"&&!haClient)$("#remote-status").textContent="Vuelve a conectar Home Assistant para enviar órdenes a este televisor."; }else{$("#tv-remote").hidden=true;}
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
 try{if(plugin?.unpair&&pairedTv?.source!=="home_assistant"&&pairedTv)await plugin.unpair({connectionId:pairedTv.connectionId});}catch{}
 pairedTv=null;localStorage.removeItem(PAIRED_KEY);render();discoveryStatus.textContent="Televisor desvinculado.";
});
render();


// --- Conexión real con Home Assistant mediante su API WebSocket local ---
// El token permanece únicamente en memoria; no se escribe en localStorage.
class HomeAssistantClient {
 constructor(baseUrl, token) {
  this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0,-1) : baseUrl;
  this.token = token;
  this.socket = null;
  this.nextId = 1;
  this.pending = new Map();
  this.states = [];
  this.onStateChanged = null;
 }
 async connect() {
  const parsed = new URL(this.baseUrl);
  if (!["http:","https:"].includes(parsed.protocol)) throw new Error("Usa una dirección HTTP o HTTPS válida.");
  if (window.location.protocol==="https:"&&parsed.protocol!=="https:") throw new Error("Control Hub está abierto con HTTPS. El navegador bloquea una conexión WebSocket local sin cifrar; configura Home Assistant con HTTPS o usa la futura app móvil nativa para la conexión local.");
  const wsUrl = (parsed.protocol === "https:" ? "wss://" : "ws://") + parsed.host + (parsed.pathname.endsWith("/") ? parsed.pathname.slice(0,-1) : parsed.pathname) + "/api/websocket";
  this.socket = new WebSocket(wsUrl);
  await new Promise((resolve,reject)=>{
   let settled=false;
   const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error("Home Assistant no respondió. Comprueba la dirección y la red Wi‑Fi."));}},12000);
   this.socket.onopen=()=>{};
   this.socket.onerror=()=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error("No se pudo abrir la conexión local con Home Assistant."));}};
   this.socket.onclose=()=>{for(const [,p] of this.pending)p.reject(new Error("La conexión con Home Assistant se cerró."));this.pending.clear();};
   this.socket.onmessage=(event)=>{
    let message;try{message=JSON.parse(event.data)}catch{return}
    if(message.type==="auth_required"){this.socket.send(JSON.stringify({type:"auth",access_token:this.token}));return;}
    if(message.type==="auth_invalid"){if(!settled){settled=true;clearTimeout(timer);reject(new Error("Home Assistant rechazó el token. Revisa que esté vigente."));}return;}
    if(message.type==="auth_ok"){if(!settled){settled=true;clearTimeout(timer);resolve();}return;}
    if(message.type==="event"&&message.event?.event_type==="state_changed"){
     const changed=message.event.data?.new_state;
     if(changed){const index=this.states.findIndex(s=>s.entity_id===changed.entity_id);if(index>=0)this.states[index]=changed;else this.states.push(changed);this.onStateChanged?.(changed);}
     return;
    }
    if(message.id&&this.pending.has(message.id)){const p=this.pending.get(message.id);this.pending.delete(message.id);if(message.success===false)p.reject(new Error(message.error?.message||"Home Assistant rechazó la solicitud."));else p.resolve(message);}
   };
  });
  return this;
 }
 call(payload) {
  if(!this.socket||this.socket.readyState!==WebSocket.OPEN) return Promise.reject(new Error("No hay conexión activa con Home Assistant."));
  const id=this.nextId++;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error("La solicitud tardó demasiado."));},12000);
   this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
   this.socket.send(JSON.stringify({id,...payload}));
  });
 }
 async loadDevices() {
  const response=await this.call({type:"get_states"});
  this.states=response.result||[];
  let entities=[],devices=[];
  try{entities=(await this.call({type:"config/entity_registry/list"})).result||[];}catch{}
  try{devices=(await this.call({type:"config/device_registry/list"})).result||[];}catch{}
  const entityMap=new Map(entities.map(e=>[e.entity_id,e]));
  const deviceMap=new Map(devices.map(d=>[d.id,d]));
  const candidates=this.states.filter(s=>{
   if(!s.entity_id?.startsWith("media_player."))return false;
   const a=s.attributes||{}, reg=entityMap.get(s.entity_id), dev=reg?.device_id?deviceMap.get(reg.device_id):null;
   const hay=[s.entity_id,a.friendly_name,a.device_class,dev?.manufacturer,dev?.model,dev?.name].filter(Boolean).join(" ");
   const lowerHay=hay.toLowerCase();
   return a.device_class==="tv"||Array.isArray(a.source_list)||["tv","televisor","television","webos","samsung","sonic","android tv","google tv"].some(term=>lowerHay.includes(term));
  });
  return candidates.map(s=>{
   const a=s.attributes||{}, reg=entityMap.get(s.entity_id), dev=reg?.device_id?deviceMap.get(reg.device_id):null;
   const remote=entities.find(e=>e.device_id&&e.device_id===reg?.device_id&&e.entity_id?.startsWith("remote."));
   return {entityId:s.entity_id,deviceId:reg?.device_id||null,remoteEntityId:remote?.entity_id||null,name:a.friendly_name||dev?.name||s.entity_id,manufacturer:dev?.manufacturer||"",model:dev?.model||"",state:s.state||"unknown",attributes:a};
  });
 }
 async subscribe() { await this.call({type:"subscribe_events",event_type:"state_changed"}); }
 close(){try{this.socket?.close()}catch{}this.socket=null;this.token="";this.pending.clear();}
}
const haForm=$("#ha-connection-form"), haStatus=$("#ha-connection-status"), haResults=$("#ha-device-results"), haConnectButton=$("#ha-connect-button");
function showHaStatus(message,connected=false){haStatus.textContent=message;haStatus.classList.toggle("connected",connected);}
function renderHaDevices(){
 haResults.innerHTML="";
 if(!haTvDevices.length){haResults.textContent=haClient?"Home Assistant está conectado, pero no devolvió entidades que podamos identificar como televisores. Añade la integración de tu TV en Home Assistant y vuelve a buscar.":"";render();return;}
 haTvDevices.forEach(device=>{
  const card=document.createElement("article");card.className="ha-device";
  const info=document.createElement("div");
  const title=document.createElement("strong");title.textContent=device.name;
  const detail=document.createElement("span");detail.textContent=[device.manufacturer,device.model,device.entityId].filter(Boolean).join(" · ");
  const state=document.createElement("small");state.textContent="Estado informado por Home Assistant: "+device.state;
  const pick=document.createElement("button");pick.type="button";pick.className="primary";pick.textContent=pairedTv?.entityId===device.entityId?"Seleccionado":"Usar control remoto";
  pick.addEventListener("click",()=>{
   pairedTv={source:"home_assistant",entityId:device.entityId,remoteEntityId:device.remoteEntityId,name:device.name,manufacturer:device.manufacturer,model:device.model};
   localStorage.setItem(PAIRED_KEY,JSON.stringify(pairedTv));render();
   $("#remote-status").textContent="Televisor seleccionado mediante Home Assistant. Envía una orden para comprobar las funciones disponibles.";
   $("#tv-remote").scrollIntoView({behavior:"smooth",block:"center"});
   renderHaDevices();
  });
  info.append(title,detail,state);card.append(info,pick);haResults.append(card);
 });
 render();
}
haForm.addEventListener("submit",async event=>{
 event.preventDefault();
 const form=new FormData(haForm), url=String(form.get("url")||"").trim(), token=String(form.get("token")||"").trim();
 if(!url||!token)return;
 haConnectButton.disabled=true;showHaStatus("Conectando…");haResults.textContent="Buscando los televisores detectados por Home Assistant…";
 const nextClient=new HomeAssistantClient(url,token);
 try{
  await nextClient.connect();
  haClient?.close();haClient=nextClient;
  haClient.onStateChanged=(changed)=>{
   const device=haTvDevices.find(d=>d.entityId===changed.entity_id);
   if(device){device.state=changed.state;device.attributes=changed.attributes||{};renderHaDevices();}
  };
  haTvDevices=await haClient.loadDevices();
  await haClient.subscribe().catch(()=>{});
  showHaStatus("Conectado",true);
  $("#ha-disconnect-button").disabled=false;
  form.get("token");
  haForm.elements.token.value="";
  renderHaDevices();
 }catch(error){nextClient.close();showHaStatus("No conectado");haResults.textContent=error?.message||"No se pudo conectar con Home Assistant.";}
 finally{haConnectButton.disabled=false;}
});
$("#ha-disconnect-button").addEventListener("click",()=>{
 haClient?.close();haClient=null;haTvDevices=[];
 if(pairedTv?.source==="home_assistant"){$("#remote-status").textContent="Home Assistant está desconectado. Conéctalo de nuevo para usar el control remoto.";}
 showHaStatus("Desconectado");$("#ha-disconnect-button").disabled=true;haResults.textContent="";render();
});
async function sendHomeAssistantCommand(command){
 if(!haClient){$("#remote-status").textContent="Conecta Home Assistant de nuevo para enviar órdenes.";return;}
 const device=haTvDevices.find(d=>d.entityId===pairedTv.entityId);
 if(!device){$("#remote-status").textContent="El televisor ya no aparece disponible en Home Assistant.";return;}
 const entityId=device.entityId, remoteId=device.remoteEntityId, state=device.state, attrs=device.attributes||{};
 const service=async(domain,name,data={})=>haClient.call({type:"call_service",domain,service:name,service_data:{entity_id:entityId,...data}});
 const manufacturer=(device.manufacturer||"").toLowerCase();
 const lgKeyMap={up:"UP",down:"DOWN",left:"LEFT",right:"RIGHT",select:"ENTER",home:"HOME",back:"BACK",menu:"MENU"};
 const keyMap={up:"DPAD_UP",down:"DPAD_DOWN",left:"DPAD_LEFT",right:"DPAD_RIGHT",select:"DPAD_CENTER",home:"HOME",back:"BACK",menu:"MENU"};
 $("#remote-status").textContent="Enviando orden a Home Assistant…";
 try{
  if(state==="unavailable"||state==="unknown")throw new Error("Home Assistant informa que el televisor no está disponible.");
  if(command==="power"){await service("media_player",state==="off"?"turn_on":"turn_off");}
  else if(command==="mute"){if(typeof attrs.is_volume_muted!=="boolean")throw new Error("Home Assistant no informa el estado de silencio para este televisor.");await service("media_player","volume_mute",{is_volume_muted:!attrs.is_volume_muted});}
  else if(command==="volume_up")await service("media_player","volume_up");
  else if(command==="volume_down")await service("media_player","volume_down");
  else if(command==="play_pause")await service("media_player","media_play_pause");
  else if(keyMap[command]){
   if(manufacturer.includes("lg")){await haClient.call({type:"call_service",domain:"webostv",service:"button",service_data:{entity_id:entityId,button:lgKeyMap[command]}});}
   else {if(!remoteId)throw new Error("Esta integración no expone un control de navegación compatible para este televisor.");await haClient.call({type:"call_service",domain:"remote",service:"send_command",service_data:{entity_id:remoteId,command:keyMap[command]}});}
  }else throw new Error("Orden no compatible.");
  $("#remote-status").textContent="Home Assistant aceptó la orden. El televisor puede tardar un momento en responder.";
 }catch(error){$("#remote-status").textContent=error?.message||"No se pudo enviar la orden."; }
}
