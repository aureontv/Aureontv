import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function allowed(c:unknown): c is Record<string,unknown> {
 if(!c||typeof c!=="object"||Array.isArray(c)) return false;
 const x=c as Record<string,unknown>;
 if(["power_on","power_off","mute","play_pause","next","previous"].includes(String(x.type))) return Object.keys(x).length===1;
 if(["volume_set","brightness_set"].includes(String(x.type))) return Object.keys(x).length===2&&typeof x.value==="number"&&Number.isFinite(x.value)&&x.value>=0&&x.value<=100;
 if(x.type==="temperature_set") return Object.keys(x).length===2&&typeof x.value==="number"&&Number.isFinite(x.value)&&x.value>=10&&x.value<=35;
 if(x.type==="input_select") return Object.keys(x).length===2&&typeof x.input==="string"&&x.input.length>0&&x.input.length<=40;
 return false;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({error:"method_not_allowed"},405);
 const auth=req.headers.get("Authorization");
 if(!auth?.startsWith("Bearer ")) return json({error:"unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL");
 const key=Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
 if(!url||!key) return json({error:"server_not_configured"},500);
 const db=createClient(url,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:session,error:authError}=await db.auth.getUser(auth.slice(7));
 if(authError||!session.user) return json({error:"unauthorized"},401);
 let body:unknown;try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
 if(!body||typeof body!=="object"||Array.isArray(body)) return json({error:"invalid_body"},400);
 const input=body as Record<string,unknown>;
 if(typeof input.device_id!=="string"||input.device_id.length>80||!allowed(input.command)) return json({error:"invalid_device_or_command"},400);
 const {data:device,error:lookupError}=await db.from("devices").select("id").eq("id",input.device_id).maybeSingle();
 if(lookupError) return json({error:"device_lookup_failed"},500);
 if(!device) return json({error:"device_not_found_or_not_owned"},404);
 const {data:queued,error:insertError}=await db.from("device_commands").insert({owner_id:session.user.id,device_id:device.id,command:input.command,status:"queued"}).select("id,status,created_at").single();
 if(insertError) return json({error:"command_queue_failed"},500);
 return json({accepted:true,delivery:"queued",command:queued},202);
});