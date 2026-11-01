'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const S=require('../streak.js'),T=require('../streak-themes.js');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function constantEqual(a,b){const x=crypto.createHash('sha256').update(String(a)).digest(),y=crypto.createHash('sha256').update(String(b)).digest();return crypto.timingSafeEqual(x,y)}
function validTime(value){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)}
function normalizeEvents(input,now){if(!Array.isArray(input)||input.length>10000)throw fail(400,'訓練事件格式不正確。');const out=[];for(const e of input){if(!e||!Number.isSafeInteger(e.startedAt)||e.startedAt<=0||e.startedAt>now+300000||typeof e.trainingDate!=='string'||typeof e.sessionKey!=='string'||e.sessionKey.length>160||S.calculate([e],Math.max(now,e.startedAt)).lastStartedAt!==e.startedAt)throw fail(400,'訓練事件格式不正確。');out.push({startedAt:e.startedAt,trainingDate:e.trainingDate,sessionKey:e.sessionKey})}return out}
function validSubscription(sub){if(!sub||typeof sub.endpoint!=='string'||sub.endpoint.length>4096)throw fail(400,'推播訂閱格式不正確。');let u;try{u=new URL(sub.endpoint)}catch(error){throw fail(400,'推播端點格式不正確。')}const host=u.hostname;const allowed=host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='updates-autopush.stage.mozaws.net';if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!allowed)throw fail(400,'推播服務端點不在允許清單。');for(const [key,len] of [['p256dh',65],['auth',16]]){const value=sub.keys?.[key];if(typeof value!=='string'||!/^[\w-]+={0,2}$/.test(value)||Buffer.from(value,'base64url').length!==len)throw fail(400,'推播加密金鑰格式不正確。')}return {endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}}}
function scheduledAt(now,time){const [h,m]=time.split(':').map(Number);return S.windowStart(now)+((h*60+m-180+1440)%1440)*60000}
function createService(options){
 const {siteUrl,pairingCode,publicKey,send,storageFile,clock=Date.now}=options;
 const site=new URL(siteUrl);if(site.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(site.hostname))throw new Error('SITE_URL 必須使用 HTTPS。');if(site.search||site.hash||!site.pathname.endsWith('/'))throw new Error('SITE_URL 必須是以 / 結尾的網站根網址。');if(!pairingCode||pairingCode.length<24||pairingCode.startsWith('REPLACE_'))throw new Error('請設定至少 24 字元的隨機配對碼。');
 let data={devices:{}};
 if(storageFile&&fs.existsSync(storageFile)){data=JSON.parse(fs.readFileSync(storageFile,'utf8'));if(!data||!data.devices||Array.isArray(data.devices)||typeof data.devices!=='object')throw new Error('通知資料庫損毀，請先還原備份。')}
 let chain=Promise.resolve();const limits=new Map();
 function serial(work){const p=chain.then(work);chain=p.catch(()=>{});return p}
 function persist(){if(!storageFile)return;fs.mkdirSync(path.dirname(storageFile),{recursive:true,mode:0o700});const tmp=storageFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,storageFile)}
 function authenticate(req){const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw fail(401,'配對已失效，請重新連接。');const id=crypto.createHash('sha256').update(token).digest('hex');const d=data.devices[id];if(!d)throw fail(401,'配對已失效，請重新連接。');return {id,d}}
 function rate(req){const now=clock(),key=req.socket.remoteAddress||'unknown';for(const [k,v] of limits)if(now-v.start>60000)limits.delete(k);const v=limits.get(key)||{start:now,count:0};if(++v.count>120)throw fail(429,'請稍後再試。');limits.set(key,v)}
 function read(req){return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){reject(fail(413,'資料量過大。'));req.resume();chunks=[]}else chunks.push(chunk)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch(error){reject(fail(400,'資料格式不正確。'))}});req.on('error',reject)})}
 function reply(res,status,body,origin){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})});res.end(JSON.stringify(body))}
 async function notify(d,now,test=false){const payload=T.notification(d.events,now,test);await send(d.subscription,JSON.stringify(payload),{TTL:300,urgency:'normal',topic:'fitweek-reminder',timeout:10000})}
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  try{
   if(origin&&origin!==site.origin)throw fail(403,'此網站未被允許。');rate(req);
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':site.origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'});res.end();return}
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&url.pathname==='/health'){reply(res,200,{ok:true},origin);return}
   if(req.method==='GET'&&url.pathname==='/config'){reply(res,200,{publicKey},origin);return}
   if(req.method!=='POST')throw fail(404,'找不到此操作。');
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'請使用 JSON 格式。');
   const body=await read(req);
   const result=await serial(async()=>{
    const now=clock();
    if(url.pathname==='/pair-check'){if(!constantEqual(body.code,pairingCode))throw fail(401,'配對碼不正確。');return {ok:true}}
    if(url.pathname==='/devices'){
     if(!constantEqual(body.code,pairingCode))throw fail(401,'配對碼不正確。');if(body.websiteUrl!==site.href)throw fail(400,'網站網址與服務設定不一致。');if(Object.keys(data.devices).length>=20)throw fail(409,'裝置數已達上限。');if(!validTime(body.reminderTime))throw fail(400,'提醒時間格式不正確。');
     const subscription=validSubscription(body.subscription),events=normalizeEvents(body.events,now);
     // 同一訂閱重新配對時，撤銷舊權杖，避免重複通知。
     for(const [id,d] of Object.entries(data.devices))if(d.subscription.endpoint===subscription.endpoint)delete data.devices[id];
     const token=crypto.randomBytes(32).toString('base64url'),id=crypto.createHash('sha256').update(token).digest('hex');data.devices[id]={subscription,events,reminderTime:body.reminderTime,syncedAt:now,lastSentWindow:'',lastAttemptAt:0,lastTestAt:0};persist();return {token,syncedAt:now};
    }
    const {id,d}=authenticate(req);
    if(url.pathname==='/state'){if(!validTime(body.reminderTime))throw fail(400,'提醒時間格式不正確。');d.events=normalizeEvents(body.events,now);d.reminderTime=body.reminderTime;d.syncedAt=now;persist();return {syncedAt:now}}
    if(url.pathname==='/disconnect'){delete data.devices[id];persist();return {ok:true}}
    if(url.pathname==='/test'){if(now-d.lastTestAt<30000)throw fail(429,'測試通知請間隔 30 秒。');d.lastTestAt=now;persist();try{await notify(d,now,true)}catch(error){if(error.statusCode===404||error.statusCode===410){delete data.devices[id];persist();throw fail(410,'通知訂閱已失效，請重新配對。')}throw fail(502,'推播發送失敗，請稍後再試。')}return {ok:true}}
    throw fail(404,'找不到此操作。');
   });reply(res,200,result,origin);
  }catch(error){reply(res,error.status||500,{error:error.status?error.message:'提醒服務暫時無法處理，請稍後再試。'},origin===site.origin?origin:null)}
 });
 async function tick(){return serial(async()=>{const now=clock();for(const [id,d] of Object.entries(data.devices)){
   const p=T.presentation(d.events,now),target=scheduledAt(now,d.reminderTime);
   if(!p.pending||d.lastSentWindow===p.windowDate||now<target||now>=target+10*60000||now-d.lastAttemptAt<60000)continue;
   d.lastAttemptAt=now;persist();try{await notify(d,now);d.lastSentWindow=p.windowDate;persist()}catch(error){if(error.statusCode===404||error.statusCode===410){delete data.devices[id];persist()}}
  }})}
 return {server,tick};
}
if(require.main===module){
 try{
  const webpush=require('web-push');webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  const service=createService({siteUrl:process.env.SITE_URL,pairingCode:process.env.PAIRING_CODE,publicKey:process.env.VAPID_PUBLIC_KEY,send:(...args)=>webpush.sendNotification(...args),storageFile:path.resolve(process.env.DATA_DIR||'./data','devices.json')});
  const timer=setInterval(()=>service.tick().catch(()=>console.error('提醒排程執行失敗。')),30000);service.tick().catch(()=>{});
  service.server.listen(Number(process.env.PORT)||3000,()=>console.log('FitWeek 提醒服務已啟動。'));
  const close=()=>{clearInterval(timer);service.server.close(()=>process.exit(0))};process.on('SIGTERM',close);process.on('SIGINT',close);
 }catch(error){console.error('啟動失敗：'+error.message);process.exitCode=1}
}
module.exports={createService,scheduledAt,normalizeEvents,validSubscription,validTime};
