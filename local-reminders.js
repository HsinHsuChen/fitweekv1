/* 純排程邏輯：網頁與 Scriptable 共用，僅使用台灣時間。 */
(function(root){
 'use strict';
 const S=root.FitWeekStreak||(typeof module==='object'&&module.exports?require('./streak.js'):null);
 const T=root.FitWeekThemes||(typeof module==='object'&&module.exports?require('./streak-themes.js'):null);
 const DEFAULT={schemaVersion:1,enabled:true,time:'19:30'};
 function settings(value=DEFAULT){if(!value||value.schemaVersion!==1||typeof value.enabled!=='boolean'||typeof value.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))throw new Error('本機提醒設定格式不正確');return {schemaVersion:1,enabled:value.enabled,time:value.time}}
 function scope(value){if(typeof value!=='string'||value.length>2048||!/^https?:\/\/[^/?#\s@]+(?:\/[^?#\s]*)?$/.test(value))throw new Error('網站網址不正確');let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return 'fitweek-local-'+(hash>>>0).toString(16)+'-'}
 function plan(snapshotValue,options,now=Date.now()){
  const value=S.validateSnapshot(snapshotValue),prefs=settings(options),prefix=scope(value.websiteUrl);
  if(S.display(value,now).requiresSync)throw new Error('請先從新版網頁同步');
  if(value.generatedAt>now+300000)throw new Error('同步時間超前，請檢查手機日期');
  if(!prefs.enabled)return {prefix,items:[],until:0,settings:prefs};
  const start=S.windowStart(now),[h,m]=prefs.time.split(':').map(Number),offset=((h*60+m-180+1440)%1440)*60000,items=[];
  // 共七個訓練日區間，週日不排；不追補已經過去的提醒。
  for(let i=0;i<7;i++){
   const dayStart=start+i*S.DAY_MS,triggerAt=dayStart+offset;
   if(S.isRestWindow(dayStart)||triggerAt<=now+1000)continue;
   if(value.lastStartedAt>=dayStart&&value.lastStartedAt<dayStart+S.DAY_MS&&value.lastStartedAt<=now)continue;
   const state=S.display(value,triggerAt),theme=T.themeAt(triggerAt);
   items.push({id:prefix+S.windowDate(dayStart),triggerAt,windowDate:S.windowDate(dayStart),title:`${theme.emoji} FitWeek｜連續訓練 ${state.count} 次`,body:`${state.count?theme.active:theme.idle}。記得今天的訓練；已完成請同步取消提醒。次數依上次同步資料推算。`,websiteUrl:value.websiteUrl});
  }
  return {prefix,items,until:start+7*S.DAY_MS,settings:prefs};
 }
 function owned(item,prefix){return Boolean(item&&typeof item.identifier==='string'&&item.identifier.startsWith(prefix))}
 const api={DEFAULT,settings,scope,plan,owned};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.FitWeekLocalReminders=api;
})(typeof globalThis==='object'?globalThis:this);
