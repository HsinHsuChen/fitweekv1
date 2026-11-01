'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const S=require('../streak.js'),T=require('../streak-themes.js'),{createService,scheduledAt}=require('../push-server/server.cjs');
const at=s=>Date.parse(s+'+08:00');
function event(s,key='A'){const startedAt=at(s);return {startedAt,trainingDate:S.taipeiDay(startedAt),sessionKey:key+'|'+startedAt}}
const now=at('2026-11-02T19:30:00');
test('03:00 邊界、週日、每筆計數、重複紀錄與色彩共用',()=>{
 const a=event('2026-11-02T10:00:00'),b=event('2026-11-02T18:00:00','B');
 assert.equal(T.presentation([],now).pending,true);assert.equal(T.presentation([a],now).completed,true);
 assert.equal(T.presentation([a,a,b],now).state.count,2);
 assert.equal(T.presentation([event('2026-11-02T02:59:00')],now).pending,true);
 assert.equal(T.presentation([event('2026-11-02T03:00:00')],now).pending,false);
 assert.equal(T.presentation([],at('2026-11-01T19:30:00')).rest,true);
 assert.equal(T.presentation([],at('2026-11-01T02:59:00')).rest,false);
 assert.equal(T.themeAt(at('2026-11-03T02:59:00')).id,T.themeAt(now).id);
 assert.notEqual(T.themeAt(at('2026-11-03T03:00:00')).id,T.themeAt(now).id);
 assert.equal(S.calculate([event('2026-10-31T10:00:00')],now).count,1);
 assert.equal(S.calculate([event('2026-10-31T10:00:00')],at('2026-11-03T03:00:00')).count,0);
 assert.equal(scheduledAt(at('2026-11-03T00:00:00'),'00:30'),at('2026-11-03T00:30:00'));
});
const validSub=()=>({endpoint:'https://web.push.apple.com/QTEST',keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}});
async function fixture(t){let time=now,sends=[],sendError=null;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fitweek-notify-'));const storageFile=path.join(dir,'data.json');const settings={siteUrl:'https://example.github.io/fitweek/',pairingCode:'testing-pairing-code-at-least-24',publicKey:'TEST_PUBLIC_KEY',send:async(...args)=>{if(sendError)throw sendError;sends.push(args)},storageFile,clock:()=>time};const service=createService(settings);await new Promise(r=>service.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>service.server.close(r));fs.rmSync(dir,{recursive:true,force:true})});const base='http://127.0.0.1:'+service.server.address().port;
 const request=async(route,body,token='',origin='https://example.github.io')=>{const r=await fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 const pair=async(extra={})=>request('/devices',{code:settings.pairingCode,websiteUrl:settings.siteUrl,subscription:validSub(),events:[],reminderTime:'19:30',...extra});
 return {service,request,pair,sends,settings,storageFile,setTime:n=>time=n,setError:e=>sendError=e};
}
test('真實 HTTP：配對、同步後停止催促、測試、停用、資料持久化',async t=>{const f=await fixture(t);assert.equal((await f.request('/pair-check',{code:'wrong'})).status,401);assert.equal((await f.request('/devices',{},'','https://evil.example')).status,403);const p=await f.pair();assert.equal(p.status,200);const token=p.body.token;assert.equal((await f.request('/state',{events:[],reminderTime:'99:99'},token)).status,400);assert.equal((await f.request('/state',{events:[],reminderTime:'19:30'},'wrong')).status,401);
 await f.service.tick();await f.service.tick();assert.equal(f.sends.length,1);const msg=JSON.parse(f.sends[0][1]);assert.match(msg.title,/今天還沒運動/);assert.equal(f.sends[0][2].TTL,300);
 const events=[event('2026-11-02T18:00:00')];assert.equal((await f.request('/state',{events,reminderTime:'19:30'},token)).status,200);assert.equal(JSON.parse(fs.readFileSync(f.storageFile)).devices[require('node:crypto').createHash('sha256').update(token).digest('hex')].events.length,1);
 assert.equal((await f.request('/test',{},token)).status,200);assert.match(JSON.parse(f.sends[1][1]).title,/今日已完成/);assert.equal((await f.request('/test',{},token)).status,429);
 f.setTime(at('2026-11-03T19:30:00'));await f.service.tick();assert.equal(f.sends.length,3);
 assert.equal((await f.request('/disconnect',{},token)).status,200);f.setTime(at('2026-11-04T19:30:00'));await f.service.tick();assert.equal(f.sends.length,3);assert.equal((await f.request('/state',{events:[],reminderTime:'19:30'},token)).status,401);
});
test('排程：已完成與週日不發、過時不補轟炸、隔天恢復、重啟不重發',async t=>{const f=await fixture(t);await f.pair({events:[event('2026-11-02T10:00:00')]});await f.service.tick();assert.equal(f.sends.length,0);f.setTime(at('2026-11-08T19:30:00'));await f.service.tick();assert.equal(f.sends.length,0);f.setTime(at('2026-11-09T22:00:00'));await f.service.tick();assert.equal(f.sends.length,0);f.setTime(at('2026-11-10T19:30:00'));await f.service.tick();assert.equal(f.sends.length,1);const restart=createService(f.settings);await restart.tick();assert.equal(f.sends.length,1)});
test('訂閱端點防護、過期訂閱移除、重新配對撤銷舊權杖',async t=>{const f=await fixture(t);assert.equal((await f.pair({subscription:{...validSub(),endpoint:'https://127.0.0.1/private'}})).status,400);assert.equal((await f.pair({events:[{startedAt:now,trainingDate:'wrong',sessionKey:'x'}]})).status,400);const first=await f.pair(),second=await f.pair();assert.equal((await f.request('/state',{events:[],reminderTime:'19:30'},first.body.token)).status,401);f.setError({statusCode:410});await f.service.tick();assert.deepEqual(JSON.parse(fs.readFileSync(f.storageFile)).devices,{})});
function swFixture(){const handlers={},shown=[],closed=[],opened=[],messages=[],local=new Map();const fakeDB={close(){},transaction(){const tx={objectStore(){return {put(value,key){local.set(key,value);queueMicrotask(()=>tx.oncomplete())},get(key){const r={};queueMicrotask(()=>{r.result=local.get(key);r.onsuccess()});return r}}}};return tx}};class FakeDate extends Date{static now(){return now}}
 const ctx={FitWeekStreak:S,FitWeekThemes:T,Date:FakeDate,URL,console,indexedDB:{open(){const r={};queueMicrotask(()=>{r.result=fakeDB;r.onsuccess()});return r}},self:{registration:{scope:'https://example.github.io/fitweek/',async getNotifications(){return[{close:()=>closed.push(true)}]},async showNotification(title,options){shown.push({title,options})}},addEventListener:(type,fn)=>handlers[type]=fn,clients:{async matchAll(){return[]},async openWindow(url){opened.push(url)}}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../notification-sw.js'),'utf8'),ctx);
 async function fire(type,extra={}){let pending;handlers[type]({...extra,waitUntil(p){pending=p}});await pending}
 return {fire,shown,closed,opened,messages};
}
test('Service Worker：儲存後關閉通知、過期推播、完成後延遲通知、點擊路徑',async()=>{const f=swFixture();await f.fire('message',{data:{type:'FITWEEK_REMINDER_STATE',events:[event('2026-11-02T10:00:00')]},ports:[{postMessage:v=>f.messages.push(v)}]});assert.equal(f.closed.length,1);assert.equal(f.messages[0].ok,true);await f.fire('push',{data:{json:()=>({title:'今天還沒運動',body:'錯誤舊提醒',windowDate:'2026-11-02'})}});assert.match(f.shown[0].title,/今日已完成/);assert.equal(f.shown[0].options.tag,'fitweek-training-reminder');await f.fire('push',{data:{json:()=>{throw new Error('invalid')}}});assert.match(f.shown[1].title,/今日已完成/);await f.fire('notificationclick',{notification:{tag:'fitweek-training-reminder',close(){}},});assert.deepEqual(f.opened,['https://example.github.io/fitweek/'])});
test('Scriptable：獨立執行不需外部模組，與網頁取相同配色',async()=>{const source=fs.readFileSync(path.join(__dirname,'../FitWeek-Streak.js'),'utf8');let colors=[];class FakeDate extends Date{static now(){return now}}const text=()=>({});const stack=()=>({centerAlignContent(){},addImage(){return {imageSize:null}},addText:text,addStack:stack,addSpacer(){}});const w=()=>({...stack(),setPadding(){},async presentSmall(){}});const c={Date:FakeDate,console,module:{exports:{}},FileManager:{local:()=>({documentsDirectory:()=>'/x',joinPath:(a,b)=>a+'/'+b,fileExists:()=>false})},args:{queryParameters:{}},ListWidget:function(){return w()},LinearGradient:function(){},Color:function(v){colors.push(v)},Font:{semiboldSystemFont:()=>'',boldSystemFont:()=>'',systemFont:()=>'',heavySystemFont:()=>''},URLScheme:{forRunningScript:()=>''},config:{runsInWidget:true},Script:{setWidget(){},complete(){}},Size:function(){},DrawContext:function(){this.setFillColor=()=>{};this.fillEllipse=()=>{};this.addPath=()=>{};this.fillPath=()=>{};this.getImage=()=>({})},Path:function(){this.move=()=>{};this.addCurve=()=>{};this.closeSubpath=()=>{}},Point:function(){},Rect:function(){}};
 // 完整語法另檢查；配色層在 Scriptable 有 module 但沒有 require 的環境中也必須能載入。
 const pre=source.slice(0,source.indexOf('async function main()'));vm.runInNewContext(pre,c);assert.equal(c.FitWeekThemes.themeAt(now).id,T.themeAt(now).id);assert.equal(c.FitWeekThemes.themes.length,5);
});
test('正式 web-push 相依套件能產生加密請求，沒有發送實際通知',()=>{
 const crypto=require('node:crypto'),wp=require('../push-server/node_modules/web-push');const client=crypto.createECDH('prime256v1');client.generateKeys();const keys=wp.generateVAPIDKeys();
 const subscription={endpoint:'https://web.push.apple.com/QTEST',keys:{p256dh:client.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
 const request=wp.generateRequestDetails(subscription,JSON.stringify(T.notification([],now)),{TTL:300,vapidDetails:{subject:'mailto:notifications@example.com',publicKey:keys.publicKey,privateKey:keys.privateKey}});
 assert.equal(request.endpoint,subscription.endpoint);assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert.equal(request.headers.TTL,300);assert.ok(request.body.length>100);
});
