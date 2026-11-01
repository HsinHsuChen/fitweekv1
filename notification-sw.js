/* 一般 Web Push；不以靜默推播模擬即時動態。 */
const FW_REMINDER_TAG='fitweek-training-reminder';
const FW_STATE_DB='FitWeekReminderState';
function fwStateDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(FW_STATE_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function fwWriteEvents(events){const db=await fwStateDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(events,'events');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
async function fwReadEvents(){const db=await fwStateDB();try{return await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('events');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}}
async function fwCloseReminders(){const list=await self.registration.getNotifications({tag:FW_REMINDER_TAG});list.forEach(n=>n.close())}
self.addEventListener('message',event=>{
 if(event.data?.type!=='FITWEEK_REMINDER_STATE')return;
 event.waitUntil((async()=>{
  try{
   const events=event.data.events;
   if(!Array.isArray(events)||events.length>10000)throw new Error('Invalid events');
   await fwWriteEvents(events);
   const p=FitWeekThemes.presentation(events);
   if(!p.pending||event.data.clear)await fwCloseReminders();
   event.ports?.[0]?.postMessage({ok:true});
  }catch(error){event.ports?.[0]?.postMessage({ok:false})}
 })());
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload={};try{payload=event.data?.json()||{}}catch(error){}
  let events;try{events=await fwReadEvents()}catch(error){}
  const now=Date.now(),sameWindow=payload.windowDate===FitWeekStreak.windowDate(now);
  const local=Array.isArray(events)?FitWeekThemes.presentation(events,now):null;
  // 延遲抵達的推播仍須顯示；若本機已完成，改成完成訊息，避免錯誤催促。
  const message=local&&(!local.pending||!sameWindow)?FitWeekThemes.notification(events,now,Boolean(payload.test)):sameWindow&&typeof payload.title==='string'&&typeof payload.body==='string'?payload:{title:'FitWeek｜查看今日訓練',body:'開啟查看最新連續訓練次數與今日安排。'};
  await self.registration.showNotification(message.title.slice(0,180),{body:message.body.slice(0,500),lang:'zh-TW',tag:FW_REMINDER_TAG,renotify:false,icon:new URL('./icon-192.png',self.registration.scope).href,badge:new URL('./icon-192.png',self.registration.scope).href,data:{url:self.registration.scope}});
 })());
});
self.addEventListener('notificationclick',event=>{
 if(event.notification.tag!==FW_REMINDER_TAG)return;
 event.notification.close();
 event.waitUntil((async()=>{const scope=self.registration.scope;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(client.url.startsWith(scope)){await client.focus();return}}await self.clients.openWindow(scope)})());
});
