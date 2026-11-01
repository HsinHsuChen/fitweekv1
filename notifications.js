/* 本機提醒：不自動連線任何推播伺服器。 */
(function(root){
 'use strict';
 const KEY='fitweek-local-reminders',LEGACY='fitweek-push-v1',$=id=>document.getElementById(id);
 let events=[],ready=false,prefs={...FitWeekLocalReminders.DEFAULT},saveQueue=Promise.resolve(),timer=null,lastHandoff=null,legacy={};
 function status(text,error=false){$('localReminderStatus').textContent=text;$('localReminderStatus').classList.toggle('danger-text',error)}
 function fingerprint(){return JSON.stringify({windowDate:FitWeekStreak.windowDate(Date.now()),snapshot:FitWeekStreak.snapshot(FitWeekStreak.calculate(events),new URL('./',location.href).href,1),prefs})}
 function save(){const item={key:KEY,settings:{...prefs},lastHandoff};saveQueue=saveQueue.catch(()=>{}).then(()=>dbPut('settings',item));return saveQueue}
 function paint(){if(!ready)return;const p=FitWeekThemes.presentation(events),card=$('trainingReminder');card.hidden=!p.pending;for(const [key,value]of Object.entries({'start':p.theme.bg[0],'end':p.theme.bg[1],'title':p.theme.title,'text':p.theme.msg,'accent':p.theme.glow}))card.style.setProperty('--reminder-'+key,'#'+value);$('reminderCount').textContent=String(p.state.count);$('reminderMessage').textContent=p.message;$('reminderTheme').textContent=p.theme.emoji+' '+p.theme.name;$('reminderWindow').textContent='本訓練日尚未完成紀錄・每日 03:00 換日';$('localReminderPreview').textContent=FitWeekThemes.notification(events).title+'\n'+p.message;$('localReminderState').textContent=prefs.enabled?'本機提醒已選啟用・同步後生效':'本機提醒已選停用・同步後取消';
  $('legacyPushBox').hidden=!(legacy.service&&legacy.token);
  $('localReminderHandoff').textContent=lastHandoff?'上次開啟同步：'+new Date(lastHandoff.at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+'；請以 Scriptable 確認畫面為準。':'尚未開啟本機提醒同步。';
  const needs=lastHandoff&&lastHandoff.fingerprint!==fingerprint();$('localReminderNeedsSync').textContent=needs?'紀錄、設定或訓練日已變更，請再次同步。':'';
  clearTimeout(timer);timer=setTimeout(paint,Math.max(1000,Math.min(60000,FitWeekStreak.windowStart(Date.now())+FitWeekStreak.DAY_MS-Date.now())));
 }
 function refresh(value){events=Array.isArray(value)?value:[];paint();if(ready&&!FitWeekThemes.presentation(events).pending)closeWebNotifications().catch(()=>{})}
 async function closeWebNotifications(){if(!('serviceWorker'in navigator))return;const r=await navigator.serviceWorker.getRegistration('./');if(r?.getNotifications)(await r.getNotifications({tag:'fitweek-training-reminder'})).forEach(n=>n.close());r?.active?.postMessage({type:'FITWEEK_REMINDER_STATE',events,clear:true})}
 function readForm(){prefs=FitWeekLocalReminders.settings({schemaVersion:1,enabled:$('localReminderEnabled').checked,time:$('localReminderTime').value});paint();return save()}
 function run(fn){return async()=>{try{await fn()}catch(error){status(error.message,true)}}}
 async function disconnect(){if(!legacy.service||!legacy.token)return;const u=new URL(legacy.service);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw new Error('舊推播服務網址不正確');const response=await fetch(legacy.service.replace(/\/$/,'')+'/disconnect',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+legacy.token},body:'{}',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok&&![401,410].includes(response.status))throw new Error('無法停用舊服務，請稍後再試，或直接到主機平台停止舊服務。');
  const r=await navigator.serviceWorker?.getRegistration('./');const sub=await r?.pushManager?.getSubscription();if(sub)await sub.unsubscribe().catch(()=>{});localStorage.removeItem(LEGACY);legacy={};paint();status('舊遠端推播已停用。本機通知仍需同步至 Scriptable。');await closeWebNotifications();
 }
 async function forgetLegacy(){if(!confirm('這只會移除本機連線，不會關閉遠端主機。確認你已在平台停用或刪除舊服務？'))return;const r=await navigator.serviceWorker?.getRegistration('./');const sub=await r?.pushManager?.getSubscription();if(sub)await sub.unsubscribe().catch(()=>{});localStorage.removeItem(LEGACY);legacy={};paint();status('舊連線已移除，現在可同步本機提醒。');await closeWebNotifications()}
 async function init(){const stored=await dbGet('settings',KEY);try{legacy=JSON.parse(localStorage.getItem(LEGACY)||'{}')||{}}catch(error){legacy={}}try{prefs=FitWeekLocalReminders.settings(stored?.settings||{...FitWeekLocalReminders.DEFAULT,time:legacy.reminderTime||'19:30'})}catch(error){prefs={...FitWeekLocalReminders.DEFAULT}}lastHandoff=stored?.lastHandoff||null;ready=true;$('localReminderEnabled').checked=prefs.enabled;$('localReminderTime').value=prefs.time;
  $('reminderOpen').addEventListener('click',()=>{setView('todayView');$('workoutPanel').scrollIntoView({behavior:'smooth',block:'start'})});
  $('localReminderEnabled').addEventListener('change',run(async()=>{await readForm();status('設定已儲存在網頁，請按同步才會套用到手機通知。')}));$('localReminderTime').addEventListener('change',run(async()=>{await readForm();status('時間已儲存，請按同步以更新手機排程。')}));
  $('localReminderSync').addEventListener('click',run(async()=>{await readForm();await syncStreakToWidget()}));$('localReminderTest').addEventListener('click',run(async()=>{await readForm();await syncStreakToWidget({action:'test'})}));$('localReminderStop').addEventListener('click',run(async()=>{$('localReminderEnabled').checked=false;await readForm();await syncStreakToWidget()}));$('legacyPushStop').addEventListener('click',run(disconnect));$('legacyPushForget').addEventListener('click',run(forgetLegacy));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')paint()});paint();status('不需伺服器。請更新 Scriptable 程式，再同步以建立本機通知。');
 }
 async function beforeSync(){await saveQueue;if(legacy.service&&legacy.token)throw new Error('請先在設定停用舊遠端推播，避免兩套通知重複。')}
 async function noteHandoff(){lastHandoff={at:Date.now(),fingerprint:fingerprint()};await save();paint();status('已開啟同步要求，請查看 Scriptable 是否完成排程。')}
 function payload(){return FitWeekLocalReminders.settings(prefs)}
 function resetWarning(){return 'Scriptable 的已排程通知不會隨網頁資料一起刪除。若曾啟用，請先按「停用並同步」並確認 Scriptable 已取消，再清除。'}
 root.FitWeekNotifications={init,refresh,beforeSync,noteHandoff,payload,disconnect,resetWarning,syncError:message=>status('無法同步：'+message,true)};
})(window);
