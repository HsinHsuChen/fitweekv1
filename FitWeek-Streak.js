// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: fire;
// Name this script exactly: FitWeek-Streak
// FitWeek v2.7.0 — 本機通知；不需要伺服器。
/* Shared by the website and the standalone Scriptable widget. */
(function(root){
 'use strict';
 const DAY_MS=24*60*60*1000;
 const OFFSET_MS=8*60*60*1000,CUTOFF_MS=3*60*60*1000;
 const RULE='daily-0300-sunday-rest-unique-training-record';
 function windowStart(time){return Math.floor((time+OFFSET_MS-CUTOFF_MS)/DAY_MS)*DAY_MS-OFFSET_MS+CUTOFF_MS}
 function windowDate(time){return taipeiDay(windowStart(time))}
 function isRestWindow(time){return new Date(windowStart(time)+OFFSET_MS).getUTCDay()===0}
 function deadline(start){
  let next=windowStart(start)+DAY_MS;
  while(isRestWindow(next))next+=DAY_MS;
  return next+DAY_MS;
 }
 function legacySundayDeadline(start){
  let cursor=start,remaining=DAY_MS;
  for(let i=0;i<5;i++){
   const shifted=new Date(cursor+8*3600000),nextMidnight=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate()+1)-8*3600000;
   if(shifted.getUTCDay()===0){cursor=nextMidnight;continue}
   if(remaining<nextMidnight-cursor)return cursor+remaining;
   if(remaining===0)return cursor;
   remaining-=nextMidnight-cursor;cursor=nextMidnight;
  }
  return cursor;
 }
 function timestamp(value){
  if(value==null||value==='')return 0;
  const n=typeof value==='number'?value:typeof value==='string'&&/^\d+(\.\d+)?$/.test(value)?Number(value):Date.parse(value);
  return Number.isFinite(n)&&n>0&&n<=8640000000000000-DAY_MS?n:0;
 }
 function taipeiDay(time){return new Date(time+8*60*60*1000).toISOString().slice(0,10)}
 function validDay(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
 function eventsFromWorkouts(workouts){
  if(!Array.isArray(workouts))return [];
  return workouts.flatMap(workout=>{
   if(!workout||!Array.isArray(workout.exercises)||!workout.exercises.some(ex=>ex&&Array.isArray(ex.sets)&&ex.sets.some(s=>s&&Number.isFinite(Number(s.reps))&&Number(s.reps)>0)))return [];
   const startedAt=timestamp(workout.startedAt)||timestamp(workout.endedAt);
   if(!startedAt)return [];
   return [{startedAt,trainingDate:validDay(workout.trainingDate)?workout.trainingDate:taipeiDay(startedAt),sessionKey:`${workout.day||''}|${startedAt}`}];
  });
 }
 function calculate(events,now=Date.now()){
  const sorted=(Array.isArray(events)?events:[]).filter(e=>e&&timestamp(e.startedAt)&&e.startedAt<=now&&validDay(e.trainingDate)).slice().sort((a,b)=>a.startedAt-b.startedAt);
  let lastStartedAt=0,lastTrainingDate='',chainCount=0;
  const seen=new Set();
  for(const event of sorted){
   const key=event.sessionKey||`${event.day||''}|${event.startedAt}`;
   if(seen.has(key))continue;
   seen.add(key);
   if(lastStartedAt&&event.startedAt>=deadline(lastStartedAt))chainCount=0;
   chainCount++;lastStartedAt=event.startedAt;lastTrainingDate=event.trainingDate;
  }
  const expiresAt=lastStartedAt?deadline(lastStartedAt):0,expired=Boolean(expiresAt&&now>=expiresAt);
  return {count:expired?0:chainCount,chainCount,lastStartedAt,lastTrainingDate,expiresAt,expired};
 }
 function safeUrl(value){
  if(typeof value!=='string'||value.length>2048||!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value)||/[\r\n]/.test(value))return '';
  return value;
 }
 function snapshot(state,websiteUrl,now=Date.now()){
  return {schemaVersion:4,rule:RULE,chainCount:state.chainCount,lastStartedAt:state.lastStartedAt,lastTrainingDate:state.lastTrainingDate,expiresAt:state.expiresAt,generatedAt:now,websiteUrl:safeUrl(websiteUrl)};
 }
 function validateSnapshot(value){
  const legacy=value&&value.schemaVersion===1&&value.rule==='24h-unique-training-day';
  const legacySunday=value&&value.schemaVersion===2&&value.rule==='24h-sunday-rest-unique-training-day';
  const legacyRecord=value&&value.schemaVersion===3&&value.rule==='24h-sunday-rest-unique-training-record';
  const current=value&&value.schemaVersion===4&&value.rule===RULE;
  if(!value||(!legacy&&!legacySunday&&!legacyRecord&&!current)||!Number.isInteger(value.chainCount)||value.chainCount<0||value.chainCount>100000)throw new Error('小工具資料格式不正確');
  const start=timestamp(value.lastStartedAt),generated=timestamp(value.generatedAt);
  const expected=start?(current?deadline(start):legacy?start+DAY_MS:legacySundayDeadline(start)):0;
  if(!generated||(value.lastStartedAt!==0&&!start)||(start&&(!validDay(value.lastTrainingDate)||value.expiresAt!==expected||generated<start||value.chainCount===0))||(!start&&(value.chainCount!==0||value.expiresAt!==0||value.lastTrainingDate!=='')))throw new Error('小工具時間資料不正確');
  return {schemaVersion:value.schemaVersion,rule:value.rule,chainCount:value.chainCount,lastStartedAt:value.lastStartedAt,lastTrainingDate:value.lastTrainingDate,expiresAt:expected,generatedAt:generated,websiteUrl:safeUrl(value.websiteUrl)};
 }
 function display(snapshotValue,now=Date.now()){
  const value=validateSnapshot(snapshotValue),requiresSync=value.rule!==RULE,expired=Boolean(value.expiresAt&&(requiresSync?now>value.expiresAt:now>=value.expiresAt));
  return {count:requiresSync?null:expired?0:value.chainCount,requiresSync,expired,expiresAt:value.expiresAt,lastStartedAt:value.lastStartedAt,lastTrainingDate:value.lastTrainingDate,websiteUrl:value.websiteUrl};
 }
 const api={DAY_MS,taipeiDay,windowStart,windowDate,isRestWindow,deadline,eventsFromWorkouts,calculate,snapshot,validateSnapshot,display};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.FitWeekStreak=api;
})(typeof globalThis==='object'?globalThis:this);

/* 共用於網頁、推播與 Scriptable；以同一訓練日選色，避免各自隨機。 */
(function(root){
 'use strict';
 const S=root.FitWeekStreak||(typeof module==='object'&&module.exports?require('./streak.js'):null);
 const themes=[
 {id:'ember',name:'暖橘',emoji:'🟠',bg:['1b1713','3a1d12'],flame:['ec4a1f','ffb02e','fff1a8'],glow:'ff8a1f',active:'每次累積，都算進步',rest:'休息充電，下次再出發',idle:'新的開始，一樣值得',title:'e8cdb4',num:'fff8ee',msg:'f6e6d4',sub:'c9a98f',sync:'a98c76'},
 {id:'purple',name:'紫色',emoji:'🟣',bg:['170a2a','3b1566'],flame:['8b3df0','c27bff','f6eaff'],glow:'a855f7',active:'一步一步，靠近目標',rest:'留點餘力，走得更遠',idle:'從這一次，重新出發',title:'d9c2f2',num:'fbf5ff',msg:'eddcfa',sub:'bfa3dc',sync:'a78bc4'},
 {id:'blue',name:'藍色',emoji:'🔵',bg:['0a1624','0f3252'],flame:['1f6fe5','4fc3ff','e8fbff'],glow:'38b6ff',active:'照著自己的節奏前進',rest:'放慢腳步，好好恢復',idle:'找回節奏，再次開始',title:'b8d9f0',num:'f4fbff',msg:'dcefff',sub:'93b9d6',sync:'7ea3c0'},
 {id:'green',name:'青綠',emoji:'🟢',bg:['0a1a14','10402f'],flame:['16a35c','5eea8f','ebfff2'],glow:'3ddc84',active:'穩穩練習，慢慢變強',rest:'恢復，也是進步的一部分',idle:'重新扎根，慢慢累積',title:'b5dcc7',num:'f3fff8',msg:'d9f5e5',sub:'8fbfa5',sync:'79a58e'},
 {id:'rose',name:'暖紅',emoji:'🔴',bg:['1f0a14','4a1330'],flame:['e0356b','ff7ca8','fff0f5'],glow:'ff5c8a',active:'願意開始，就很棒了',rest:'照顧自己，也算努力',idle:'給自己一個新的開始',title:'efc0d1',num:'fff5f8',msg:'fadce7',sub:'cc9bb0',sync:'b3869a'}
 ];
 function themeAt(now=Date.now()){const index=Math.floor((S.windowStart(now)+8*3600000)/S.DAY_MS);return themes[((index%themes.length)+themes.length)%themes.length]}
 function presentation(events,now=Date.now()){
  const state=S.calculate(events,now),start=S.windowStart(now),theme=themeAt(now);
  const completed=(Array.isArray(events)?events:[]).some(e=>e&&Number.isFinite(e.startedAt)&&e.startedAt>=start&&e.startedAt<=now&&S.calculate([e],now).lastStartedAt===e.startedAt);
  const rest=S.isRestWindow(now),pending=!rest&&!completed;
  const message=rest?theme.rest:state.count?theme.active:theme.idle;
  return {state,theme,completed,rest,pending,windowStart:start,windowDate:S.windowDate(now),message};
 }
 function notification(events,now=Date.now(),test=false){
  const p=presentation(events,now);
  const status=p.completed?'今日已完成':p.rest?'今天是休息日':'今天還沒運動';
  return {title:`${p.theme.emoji} 連續訓練 ${p.state.count} 次｜${status}`,body:(test?'測試通知・':'')+p.message+(p.pending?'。有空時開始，依身體狀態調整。':''),windowDate:p.windowDate,createdAt:now,test};
 }
 const api={themes,themeAt,presentation,notification};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.FitWeekThemes=api;
})(typeof globalThis==='object'?globalThis:this);

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

/* Scriptable 通知介接；只操作目前網站的 FitWeek 通知。 */
async function applyFitWeekLocalReminders(value,prefs,action='sync',now=Date.now()){
 const plan=FitWeekLocalReminders.plan(value,prefs,now),pending=await Notification.allPending(),delivered=await Notification.allDelivered();
 const currentIds=new Set(plan.items.map(item=>item.id));
 const completed=value.lastStartedAt>=FitWeekStreak.windowStart(now)&&value.lastStartedAt<=now;
 const toRemove=pending.filter(n=>FitWeekLocalReminders.owned(n,plan.prefix)&&!currentIds.has(n.identifier)).map(n=>n.identifier);
 // 停用／今天已完成時，優先清除，排程失敗也不留下舊的當日催促。
 if(toRemove.length)await Notification.removePending(toRemove);
 if(!plan.settings.enabled||completed){const ids=delivered.filter(n=>FitWeekLocalReminders.owned(n,plan.prefix)).map(n=>n.identifier);if(ids.length)await Notification.removeDelivered(ids)}
 let count=0;
 for(const item of plan.items){const n=new Notification();n.identifier=item.id;n.title=item.title;n.body=item.body;n.threadIdentifier=plan.prefix;n.sound='default';n.openURL=item.websiteUrl;n.userInfo={fitweek:true,windowDate:item.windowDate};n.setTriggerDate(new Date(item.triggerAt));await n.schedule();count++}
 if(action==='test'){
  const n=new Notification(),theme=FitWeekThemes.themeAt(now),state=FitWeekStreak.display(value,now);n.identifier=plan.prefix+'test';n.title=theme.emoji+' FitWeek｜測試通知';n.body=`連續訓練 ${state.count} 次。${state.count?theme.active:theme.idle}。這是測試，不影響訓練紀錄。`;n.threadIdentifier=plan.prefix;n.sound='default';n.openURL=value.websiteUrl;n.setTriggerDate(new Date(now+10000));await n.schedule();
 }
 return {count,until:plan.until,enabled:plan.settings.enabled,time:plan.settings.time,test:action==='test'};
}

async function main(){
 const fm=FileManager.local(),path=fm.joinPath(fm.documentsDirectory(),'fitweek-streak.json'),prefsPath=fm.joinPath(fm.documentsDirectory(),'fitweek-local-reminders.json');
 const supplied=args.queryParameters&&args.queryParameters.payload;
 let value=null,problem='',prefs={schemaVersion:1,enabled:false,time:'19:30'},prefsSite='',action='sync',validInput=false,result=null;
 if(fm.fileExists(prefsPath)){try{const saved=JSON.parse(fm.readString(prefsPath));prefs=FitWeekLocalReminders.settings(saved.settings);prefsSite=saved.websiteUrl||''}catch(error){problem='請回網頁重新同步提醒設定'}}
 if(supplied){
  try{
   if(supplied.length>6000)throw new Error('資料太長');
   const input=JSON.parse(supplied),snapshot=FitWeekStreak.validateSnapshot(input);
   if(input.localReminder!==undefined)prefs=FitWeekLocalReminders.settings(input.localReminder);
   else if(prefsSite!==snapshot.websiteUrl)prefs={schemaVersion:1,enabled:false,time:'19:30'};
   action=input.localReminderAction==='test'?'test':'sync';
   // 驗證排程所需資料後才覆寫舊檔，錯誤輸入不會改動手機通知。
   FitWeekLocalReminders.plan(snapshot,prefs,Date.now());
   value=snapshot;validInput=true;problem='';
   fm.writeString(path,JSON.stringify(value));fm.writeString(prefsPath,JSON.stringify({settings:prefs,websiteUrl:value.websiteUrl}));
  }catch(error){problem='同步失敗：'+error.message;console.error(error)}
 }
 if(!value&&fm.fileExists(path)){try{value=FitWeekStreak.validateSnapshot(JSON.parse(fm.readString(path)))}catch(error){problem='請回網頁重新同步';console.error(error)}}
 if(validInput&&!config.runsInWidget&&!config.runsInNotification){
  try{result=await applyFitWeekLocalReminders(value,prefs,action)}catch(error){problem='通知設定未完成：'+error.message+'。部分排程可能已送出，重新同步會覆寫相同通知，不會累加。';console.error(error)}
 }
 const now=Date.now(),state=value?FitWeekStreak.display(value,now):{count:0,expiresAt:0,expired:false},T=FitWeekThemes.themeAt(now);
 const widget=new ListWidget(),gradient=new LinearGradient();gradient.colors=[new Color(T.bg[0]),new Color(T.bg[1])];gradient.locations=[0,1];widget.backgroundGradient=gradient;widget.setPadding(14,16,14,16);
 const title=widget.addText('連續訓練');title.font=Font.semiboldSystemFont(12);title.textColor=new Color(T.title);widget.addSpacer(5);
 const row=widget.addStack();row.centerAlignContent();row.spacing=7;
 const icon=row.addImage(flameImage(state.count>0,T));icon.imageSize=new Size(32,40);
 const number=row.addText(state.requiresSync?'—':String(state.count));number.font=Font.boldSystemFont(53);number.textColor=new Color(T.num);number.minimumScaleFactor=.35;number.lineLimit=1;
 const unit=row.addText('次');unit.font=Font.semiboldSystemFont(14);unit.textColor=new Color(T.title);widget.addSpacer();
 const message=widget.addText(problem||(state.requiresSync?'請回網頁重新同步':!value?'先從網頁同步':FitWeekStreak.isRestWindow(now)?T.rest:state.count?T.active:T.idle));message.font=Font.semiboldSystemFont(12);message.textColor=new Color(T.msg);message.lineLimit=1;message.minimumScaleFactor=.7;
 if(state.count&&state.expiresAt){const deadline=widget.addText('期限 '+formatTaipei(state.expiresAt));deadline.font=Font.systemFont(10);deadline.textColor=new Color(T.sub)}else{const note=widget.addText(value?'每日03:00檢查':'FitWeek・每日03:00檢查');note.font=Font.systemFont(10);note.textColor=new Color(T.sub)}
 const lastSync=widget.addText(value?'同步 '+formatTaipei(value.generatedAt):'尚未同步');lastSync.font=Font.systemFont(9);lastSync.textColor=new Color(T.sync);
 widget.url=value&&value.websiteUrl?value.websiteUrl:URLScheme.forRunningScript();widget.refreshAfterDate=new Date(state.count&&state.expiresAt?Math.min(now+15*60*1000,state.expiresAt,FitWeekStreak.windowStart(now)+FitWeekStreak.DAY_MS):now+30*60*1000);Script.setWidget(widget);
 if(!config.runsInWidget&&!config.runsInNotification){
  if(supplied){const alert=new Alert();alert.title=problem?'請確認同步結果':'FitWeek 同步完成';alert.message=problem||(result?`連續訓練：${state.count} 次\n`+(result.enabled?`已提交 ${result.count} 則通知排程，時間 ${result.time}（台灣時間），週日跳過。\n排程涵蓋至 ${formatTaipei(result.until)}，之後需再次同步。`:'已取消本網站的 FitWeek 本機提醒。')+(result.test?'\n測試通知預定於 10 秒後顯示。':'')+'\n請在 iPhone 設定允許 Scriptable 通知；顯示方式由 iOS 決定。':'小工具資料已更新。');alert.addAction('完成');await alert.presentAlert()}
  else await widget.presentSmall();
 }
 Script.complete();
}

function flameImage(lit,T){
 const w=64,h=80,dc=new DrawContext();dc.size=new Size(w*4,h*4);dc.opaque=false;dc.respectScreenScale=false;
 const k=4,pt=(x,y)=>new Point(x*k,y*k);
 const shape=(start,curves,color)=>{
  const p=new Path();p.move(pt(start[0],start[1]));
  for(const c of curves)p.addCurve(pt(c[4],c[5]),pt(c[0],c[1]),pt(c[2],c[3]));
  p.closeSubpath();dc.addPath(p);dc.setFillColor(color);dc.fillPath();
 };
 if(lit){for(const r of [[31,.05],[26,.07],[21,.09]]){dc.setFillColor(new Color(T.glow,r[1]));dc.fillEllipse(new Rect((32-r[0])*k,(54-r[0])*k,r[0]*2*k,r[0]*2*k))}}
 const c=lit?T.flame:['6b625b','8a8078','a89e95'];
 shape([32,2],[[34,18,56,28,56,52],[56,68,45,78,32,78],[19,78,8,68,8,52],[8,41,14,34,19,28],[20,36,24,40,28,41],[24,28,27,14,32,2]],new Color(c[0]));
 shape([32,26],[[34,36,47,42,47,56],[47,66,40,73,32,73],[24,73,17,66,17,56],[17,49,21,44,25,40],[26,45,29,47,31,47],[29,40,30,32,32,26]],new Color(c[1]));
 shape([32,50],[[33,55,39,58,39,64],[39,69,36,71,32,71],[28,71,25,69,25,64],[25,60,28,56,29,53],[30,55,31,56,32,56],[32,54,32,52,32,50]],new Color(c[2]));
 return dc.getImage();
}
function formatTaipei(time){
 const date=new Date(time+8*60*60*1000),pad=value=>String(value).padStart(2,'0');
 return `${pad(date.getUTCMonth()+1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

await main();
