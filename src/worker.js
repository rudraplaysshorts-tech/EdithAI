const json=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store",...h}});
const enc=new TextEncoder();
async function hmac(secret,data){return crypto.subtle.sign("HMAC",{name:"HMAC",hash:"SHA-256"},await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]),enc.encode(data))}
function hex(buf){return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("")}
// Constant-time-ish string compare. Both inputs are first hashed to a fixed 32-byte
// digest (so comparison time never depends on the original string's length or content),
// then the digests are XOR-compared without any early exit.
async function timingSafeEqual(a,b){
  const [ha,hb]=await Promise.all([crypto.subtle.digest("SHA-256",enc.encode(String(a??""))),crypto.subtle.digest("SHA-256",enc.encode(String(b??"")))]);
  const ua=new Uint8Array(ha),ub=new Uint8Array(hb);
  let diff=0;for(let i=0;i<ua.length;i++)diff|=ua[i]^ub[i];
  return diff===0;
}
async function sameHmac(secret,data,sig){return timingSafeEqual(hex(await hmac(secret,data)),sig)}
async function razor(env,path,opts={}){const token=btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);const r=await fetch(`https://api.razorpay.com/v1${path}`,{...opts,headers:{Authorization:`Basic ${token}`,"content-type":"application/json",...(opts.headers||{})}});const d=await r.json();if(!r.ok)throw Error(d.error?.description||"Razorpay API error");return d}
function license(){return `EDITH-${crypto.randomUUID().replaceAll("-","").slice(0,24).toUpperCase()}`}
async function admin(req,env){if(!env.ADMIN_TOKEN)return false;return timingSafeEqual(req.headers.get("x-admin-token")||"",env.ADMIN_TOKEN)}
function genOtp(){return String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0")}
async function sha256Hex(s){return hex(await crypto.subtle.digest("SHA-256",enc.encode(s)))}
async function sendOtpEmail(env,to,otp){
  if(!env.RESEND_API_KEY)return {sent:false};
  try{
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"content-type":"application/json"},body:JSON.stringify({from:env.OTP_FROM_EMAIL||"E.D.I.T.H. <noreply@edithai.app>",to:[to],subject:"Your E.D.I.T.H. login code",text:`Your login code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`})});
    return {sent:r.ok}
  }catch(e){return {sent:false}}
}
async function getSettings(env){const {results}=await env.DB.prepare("SELECT key,value FROM settings").all();const o={};for(const r of results)o[r.key]=r.value;return o}
async function setSetting(env,key,value){await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value).run()}
function freeActive(s){if(s.free_mode!=="1")return false;if(s.free_until){const t=Date.parse(s.free_until);if(!isNaN(t)&&Date.now()>t)return false}return true}
function getCookie(req,name){const c=req.headers.get("cookie")||"";for(const part of c.split(";")){const [k,...v]=part.trim().split("=");if(k===name)return decodeURIComponent(v.join("="))}return null}
function sessionCookie(token){return `edith_session=${token}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`}
async function currentUser(req,env){const t=getCookie(req,"edith_session");if(!t)return null;return await env.DB.prepare("SELECT id,email,phone,name FROM users WHERE token=?").bind(t).first()}
async function notifyAdmin(env,text){if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return;try{await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text})})}catch(e){}}
async function routes(req,env){const u=new URL(req.url),p=u.pathname;
 if(p==="/api/auth/login-request"&&req.method==="POST"){const b=await req.json().catch(()=>({}));const email=String(b.email||"").trim().toLowerCase(),name=String(b.name||"").trim(),phone=String(b.phone||"").trim();if(!email||!email.includes("@")||!name)return json({error:"Naam aur email zaroori hai"},400);if(!phone||phone.replace(/\D/g,"").length<10)return json({error:"Sahi phone number daalo"},400);const otp=genOtp(),otpHash=await sha256Hex(otp),expiresAt=Date.now()+10*60*1000;await env.DB.prepare("INSERT INTO login_otps(email,otp_hash,name,phone,attempts,expires_at,created_at) VALUES(?,?,?,?,0,?,?) ON CONFLICT(email) DO UPDATE SET otp_hash=excluded.otp_hash,name=excluded.name,phone=excluded.phone,attempts=0,expires_at=excluded.expires_at,created_at=excluded.created_at").bind(email,otpHash,name,phone,expiresAt,Date.now()).run();const mail=await sendOtpEmail(env,email,otp);const resp={ok:true,emailed:mail.sent};if(!mail.sent)resp.dev_otp=otp;return json(resp)}
 if(p==="/api/auth/login-verify"&&req.method==="POST"){const b=await req.json().catch(()=>({}));const email=String(b.email||"").trim().toLowerCase(),otp=String(b.otp||"").trim();if(!email||!otp)return json({error:"Email aur code zaroori hai"},400);const rec=await env.DB.prepare("SELECT * FROM login_otps WHERE email=?").bind(email).first();if(!rec)return json({error:"Pehle login code maango"},400);if(Date.now()>rec.expires_at)return json({error:"Code expire ho gaya, dobara maango"},400);if(rec.attempts>=5)return json({error:"Bahut zyada galat attempts, dobara code maango"},429);const otpHash=await sha256Hex(otp);if(!(await timingSafeEqual(otpHash,rec.otp_hash))){await env.DB.prepare("UPDATE login_otps SET attempts=attempts+1 WHERE email=?").bind(email).run();return json({error:"Galat code"},400)}await env.DB.prepare("DELETE FROM login_otps WHERE email=?").bind(email).run();let user=await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();const token=crypto.randomUUID()+crypto.randomUUID();if(user){await env.DB.prepare("UPDATE users SET name=?,phone=?,token=? WHERE id=?").bind(rec.name,rec.phone,token,user.id).run()}else{const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO users(id,email,phone,name,token,created_at) VALUES(?,?,?,?,?,?)").bind(id,email,rec.phone,rec.name,token,new Date().toISOString()).run()}return json({ok:true,user:{name:rec.name,email,phone:rec.phone}},200,{"set-cookie":sessionCookie(token)})}
 if(p==="/api/auth/me"){const cu=await currentUser(req,env);return json({user:cu||null})}
 if(p==="/api/auth/logout"&&req.method==="POST"){return json({ok:true},200,{"set-cookie":"edith_session=; Path=/; Max-Age=0"})}
 if(p==="/api/plans"){const {results}=await env.DB.prepare("SELECT * FROM plans WHERE active=1 ORDER BY amount").all();return json({plans:results.map(x=>({...x,features:JSON.parse(x.features_json)}))})}
 if(p==="/api/releases/latest"){const r=await env.DB.prepare("SELECT version,version_code,price,notes,file_name,published_at FROM releases WHERE status='live' ORDER BY published_at DESC LIMIT 1").first();return json({release:r||null})}
 if(p==="/api/orders"&&req.method==="POST"){const b=await req.json();const plan=await env.DB.prepare("SELECT * FROM plans WHERE id=? AND active=1").bind(b.plan).first();const phone=String(b.phone||"").trim();if(!plan||!b.email||!b.email.includes("@")||!phone)return json({error:"Plan, email aur phone number zaroori hai"},400);const id=crypto.randomUUID();const ro=await razor(env,"/orders",{method:"POST",body:JSON.stringify({amount:plan.amount*100,currency:"INR",receipt:id,payment_capture:1,notes:{local_order_id:id,plan_id:plan.id,phone}})});await env.DB.prepare("INSERT INTO orders(id,plan_id,email,phone,amount,razorpay_order_id,status,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,plan.id,b.email,phone,plan.amount,ro.id,"created",new Date().toISOString()).run();await notifyAdmin(env,`🛒 New order started\nPlan: ${plan.name}\nEmail: ${b.email}\nPhone: ${phone}\nAmount: ₹${plan.amount}`);return json({key_id:env.RAZORPAY_KEY_ID,order_id:ro.id,amount:plan.amount*100,description:plan.name})}
 if(p==="/api/payment/verify"&&req.method==="POST"){const b=await req.json();const o=await env.DB.prepare("SELECT * FROM orders WHERE razorpay_order_id=?").bind(b.razorpay_order_id).first();if(!o)return json({error:"Order not found"},404);if(!(await sameHmac(env.RAZORPAY_KEY_SECRET,`${b.razorpay_order_id}|${b.razorpay_payment_id}`,b.razorpay_signature)))return json({error:"Signature verification failed"},400);const key=o.license_key||license();await env.DB.prepare("UPDATE orders SET status='paid',razorpay_payment_id=?,license_key=?,paid_at=? WHERE id=?").bind(b.razorpay_payment_id,key,new Date().toISOString(),o.id).run();await notifyAdmin(env,`✅ Payment confirmed\nEmail: ${o.email}\nPhone: ${o.phone||"—"}\nAmount: ₹${o.amount}\nLicense: ${key}`);return json({ok:true,license_key:key})}
 if(p==="/api/webhooks/razorpay"&&req.method==="POST"){const raw=await req.text(),sig=req.headers.get("x-razorpay-signature")||"";if(!env.RAZORPAY_WEBHOOK_SECRET||!(await sameHmac(env.RAZORPAY_WEBHOOK_SECRET,raw,sig)))return new Response("bad signature",{status:400});const ev=JSON.parse(raw),eid=ev.id||crypto.randomUUID();if(await env.DB.prepare("SELECT id FROM webhook_events WHERE id=?").bind(eid).first())return new Response("ok");await env.DB.prepare("INSERT INTO webhook_events(id,created_at) VALUES(?,?)").bind(eid,Date.now()).run();if(["payment.captured","order.paid"].includes(ev.event)){const payment=ev.payload?.payment?.entity,oid=payment?.order_id||ev.payload?.order?.entity?.id;if(oid){const o=await env.DB.prepare("SELECT * FROM orders WHERE razorpay_order_id=?").bind(oid).first();if(o&&o.status!=="paid")await env.DB.prepare("UPDATE orders SET status='paid',razorpay_payment_id=?,license_key=?,paid_at=? WHERE id=?").bind(payment?.id||null,license(),new Date().toISOString(),o.id).run()}}return new Response("ok")}
 if(p==="/api/admin/releases"&&req.method==="GET"){if(!(await admin(req,env)))return json({error:"Unauthorized"},401);const {results}=await env.DB.prepare("SELECT * FROM releases ORDER BY published_at DESC LIMIT 50").all();return json({releases:results})}
 if(p==="/api/admin/releases"&&req.method==="POST"){if(!(await admin(req,env)))return json({error:"Unauthorized"},401);const body=await req.json().catch(()=>({}));const apkUrl=String(body.apk_url||"").trim(),version=String(body.version||"").trim(),notes=String(body.notes||"").trim(),price=Number(body.price||59),fileName=String(body.file_name||`edith-${version}.apk`);if(!apkUrl||!version)return json({error:"Version and APK URL are required"},400);const code=Date.now();await env.DB.prepare("UPDATE releases SET status='archived' WHERE status='live'").run();const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO releases(id,version,version_code,price,notes,file_key,file_name,file_size,status,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,version,code,price,notes,apkUrl,fileName,0,"live",new Date().toISOString()).run();if(price>0)await env.DB.prepare("UPDATE plans SET amount=? WHERE active=1").bind(price).run();return json({ok:true,id})}
 if(p==="/api/admin/plan-price"&&req.method==="POST"){if(!(await admin(req,env)))return json({error:"Unauthorized"},401);const body=await req.json().catch(()=>({}));const price=Number(body.price||0);if(!price||price<1)return json({error:"Valid price required"},400);await env.DB.prepare("UPDATE plans SET amount=? WHERE active=1").bind(price).run();return json({ok:true,price})}
 if(p==="/api/free/status"){const s=await getSettings(env);return json({active:freeActive(s),until:s.free_until||null})}
 if(p==="/api/download/free"){const s=await getSettings(env);if(!freeActive(s))return json({error:"Free download is not active right now"},403);const r=await env.DB.prepare("SELECT * FROM releases WHERE status='live' ORDER BY published_at DESC LIMIT 1").first();if(!r)return json({error:"No release published"},404);return Response.redirect(r.file_key,302)}
 if(p==="/api/admin/settings"&&req.method==="GET"){if(!(await admin(req,env)))return json({error:"Unauthorized"},401);return json({settings:await getSettings(env)})}
 if(p==="/api/admin/settings"&&req.method==="POST"){if(!(await admin(req,env)))return json({error:"Unauthorized"},401);const b=await req.json().catch(()=>({}));if(typeof b.free_mode!=="undefined")await setSetting(env,"free_mode",b.free_mode?"1":"0");if(typeof b.free_until!=="undefined")await setSetting(env,"free_until",String(b.free_until||""));return json({ok:true,settings:await getSettings(env)})}
 if(p.startsWith("/api/download/latest")){const key=u.searchParams.get("license");if(!key)return json({error:"License required"},401);const o=await env.DB.prepare("SELECT * FROM orders WHERE license_key=? AND status='paid' LIMIT 1").bind(key).first();if(!o)return json({error:"Invalid license"},403);const r=await env.DB.prepare("SELECT * FROM releases WHERE status='live' ORDER BY published_at DESC LIMIT 1").first();if(!r)return json({error:"No release published"},404);return Response.redirect(r.file_key,302)}
 if(p==="/api/admin/orders"&&req.method==="GET"){if(!(await admin(req,env)))return json({error:"Unauthorized"},401);const {results}=await env.DB.prepare(`SELECT o.*, a.device_key_hash, a.activated_at, a.revoked_at FROM orders o LEFT JOIN activations a ON a.license_key=o.license_key ORDER BY o.created_at DESC LIMIT 100`).all();return json({orders:results})}
 // Called by the Android app on first run with a valid license. Binds the license to one
 // device; a second, different device is rejected until the admin revokes the activation.
 if(p==="/api/activate"&&req.method==="POST"){
  const b=await req.json().catch(()=>({}));
  const licenseKey=String(b.license_key||"").trim(),deviceKeyHash=String(b.device_key_hash||"").trim();
  if(!licenseKey||!deviceKeyHash)return json({error:"license_key and device_key_hash are required"},400);
  const order=await env.DB.prepare("SELECT * FROM orders WHERE license_key=? AND status='paid' LIMIT 1").bind(licenseKey).first();
  if(!order)return json({error:"Invalid license"},403);
  const existing=await env.DB.prepare("SELECT * FROM activations WHERE license_key=?").bind(licenseKey).first();
  if(!existing){
   await env.DB.prepare("INSERT INTO activations(license_key,device_key_hash,activated_at,revoked_at) VALUES(?,?,?,NULL)").bind(licenseKey,deviceKeyHash,new Date().toISOString()).run();
   await notifyAdmin(env,`🔑 License activated\nLicense: ${licenseKey}\nEmail: ${order.email}`);
   return json({ok:true,status:"activated"})
  }
  if(existing.revoked_at){
   await env.DB.prepare("UPDATE activations SET device_key_hash=?,activated_at=?,revoked_at=NULL WHERE license_key=?").bind(deviceKeyHash,new Date().toISOString(),licenseKey).run();
   return json({ok:true,status:"reactivated"})
  }
  if(await timingSafeEqual(existing.device_key_hash||"",deviceKeyHash))return json({ok:true,status:"already-active"});
  return json({error:"This license is already activated on another device. Ask support to reset it."},409)
 }
 if(p==="/api/admin/revoke"&&req.method==="POST"){
  if(!(await admin(req,env)))return json({error:"Unauthorized"},401);
  const b=await req.json().catch(()=>({}));const licenseKey=String(b.license_key||"").trim();
  if(!licenseKey)return json({error:"license_key required"},400);
  await env.DB.prepare("UPDATE activations SET revoked_at=? WHERE license_key=?").bind(new Date().toISOString(),licenseKey).run();
  return json({ok:true})
 }
 return null}
export default {async fetch(req,env){try{const r=await routes(req,env);return r||env.ASSETS.fetch(req)}catch(e){return json({error:e.message||"Server error"},500)}}};
