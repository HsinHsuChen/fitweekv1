// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: fire;
// Name this script exactly: FitWeek-Streak
/* Shared by the website and the standalone Scriptable widget. */
(function(root){
 'use strict';
 const DAY_MS=24*60*60*1000;
 const RULE='24h-sunday-rest-unique-training-record';
 const LEGACY_RULE='24h-sunday-rest-unique-training-day';
 function deadline(start){
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
   if(lastStartedAt&&event.startedAt>deadline(lastStartedAt))chainCount=0;
   chainCount++;lastStartedAt=event.startedAt;lastTrainingDate=event.trainingDate;
  }
  const expiresAt=lastStartedAt?deadline(lastStartedAt):0,expired=Boolean(expiresAt&&now>expiresAt);
  return {count:expired?0:chainCount,chainCount,lastStartedAt,lastTrainingDate,expiresAt,expired};
 }
 function safeUrl(value){
  if(typeof value!=='string'||value.length>2048||!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value)||/[\r\n]/.test(value))return '';
  return value;
 }
 function snapshot(state,websiteUrl,now=Date.now()){
  return {schemaVersion:3,rule:RULE,chainCount:state.chainCount,lastStartedAt:state.lastStartedAt,lastTrainingDate:state.lastTrainingDate,expiresAt:state.expiresAt,generatedAt:now,websiteUrl:safeUrl(websiteUrl)};
 }
 function validateSnapshot(value){
  const legacy=value&&value.schemaVersion===1&&value.rule==='24h-unique-training-day';
  const legacySunday=value&&value.schemaVersion===2&&value.rule===LEGACY_RULE;
  const current=value&&value.schemaVersion===3&&value.rule===RULE;
  if(!value||(!legacy&&!legacySunday&&!current)||!Number.isInteger(value.chainCount)||value.chainCount<0||value.chainCount>100000)throw new Error('小工具資料格式不正確');
  const start=timestamp(value.lastStartedAt),generated=timestamp(value.generatedAt);
  if(!generated||(value.lastStartedAt!==0&&!start)||(start&&(!validDay(value.lastTrainingDate)||value.expiresAt!==(legacy?start+DAY_MS:deadline(start))||generated<start||value.chainCount===0))||(!start&&(value.chainCount!==0||value.expiresAt!==0||value.lastTrainingDate!=='')))throw new Error('小工具時間資料不正確');
  return {schemaVersion:current?3:2,rule:current?RULE:LEGACY_RULE,chainCount:value.chainCount,lastStartedAt:value.lastStartedAt,lastTrainingDate:value.lastTrainingDate,expiresAt:start?deadline(start):0,generatedAt:generated,websiteUrl:safeUrl(value.websiteUrl)};
 }
 function display(snapshotValue,now=Date.now()){
  const value=validateSnapshot(snapshotValue),requiresSync=value.rule!==RULE,expired=Boolean(value.expiresAt&&now>value.expiresAt);
  return {count:requiresSync?null:expired?0:value.chainCount,requiresSync,expired,expiresAt:value.expiresAt,lastStartedAt:value.lastStartedAt,lastTrainingDate:value.lastTrainingDate,websiteUrl:value.websiteUrl};
 }
 const api={DAY_MS,taipeiDay,deadline,eventsFromWorkouts,calculate,snapshot,validateSnapshot,display};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.FitWeekStreak=api;
})(typeof globalThis==='object'?globalThis:this);


const THEMES=[
 {bg:['1b1713','3a1d12'],flame:['ec4a1f','ffb02e','fff1a8'],glow:'ff8a1f',title:'e8cdb4',num:'fff8ee',msg:'f6e6d4',sub:'c9a98f',sync:'a98c76'},
 {bg:['170a2a','3b1566'],flame:['8b3df0','c27bff','f6eaff'],glow:'a855f7',title:'d9c2f2',num:'fbf5ff',msg:'eddcfa',sub:'bfa3dc',sync:'a78bc4'},
 {bg:['0a1624','0f3252'],flame:['1f6fe5','4fc3ff','e8fbff'],glow:'38b6ff',title:'b8d9f0',num:'f4fbff',msg:'dcefff',sub:'93b9d6',sync:'7ea3c0'},
 {bg:['0a1a14','10402f'],flame:['16a35c','5eea8f','ebfff2'],glow:'3ddc84',title:'b5dcc7',num:'f3fff8',msg:'d9f5e5',sub:'8fbfa5',sync:'79a58e'},
 {bg:['1f0a14','4a1330'],flame:['e0356b','ff7ca8','fff0f5'],glow:'ff5c8a',title:'efc0d1',num:'fff5f8',msg:'fadce7',sub:'cc9bb0',sync:'b3869a'}
];
async function main(){
 const fm=FileManager.local(),path=fm.joinPath(fm.documentsDirectory(),'fitweek-streak.json');
 const supplied=args.queryParameters&&args.queryParameters.payload;
 let value=null,problem='';
 if(supplied){
  try{
   if(supplied.length>6000)throw new Error('資料太長');
   value=FitWeekStreak.validateSnapshot(JSON.parse(supplied));
   fm.writeString(path,JSON.stringify(value));
  }catch(error){problem='同步失敗，請回網頁重試';console.error(error)}
 }
 if(!value&&fm.fileExists(path)){
  try{value=FitWeekStreak.validateSnapshot(JSON.parse(fm.readString(path)))}catch(error){problem='請回網頁重新同步';console.error(error)}
 }
 const now=Date.now(),state=value?FitWeekStreak.display(value,now):{count:0,expiresAt:0,expired:false};
 const T=THEMES[Math.floor(Math.random()*THEMES.length)];
 const widget=new ListWidget(),gradient=new LinearGradient();
 gradient.colors=[new Color(T.bg[0]),new Color(T.bg[1])];gradient.locations=[0,1];widget.backgroundGradient=gradient;
 widget.setPadding(14,16,14,16);
 const title=widget.addText('連續訓練');title.font=Font.semiboldSystemFont(12);title.textColor=new Color(T.title);
 widget.addSpacer(5);
 const row=widget.addStack();row.centerAlignContent();row.spacing=7;
 const icon=row.addImage(flameImage(state.count>0,T));icon.imageSize=new Size(32,40);
 const number=row.addText(state.requiresSync?'—':String(state.count));number.font=Font.boldSystemFont(53);number.textColor=new Color(T.num);number.minimumScaleFactor=.35;number.lineLimit=1;
 const unit=row.addText('次');unit.font=Font.semiboldSystemFont(14);unit.textColor=new Color(T.title);
 widget.addSpacer();
 const message=widget.addText(problem||(state.requiresSync?'請回網頁重新同步':!value?'先從網頁同步':state.count?(new Date(now+8*3600000).getUTCDay()===0?'週日休息，紀錄保留':'保持你的節奏'):'下一次，重新開始'));
 message.font=Font.semiboldSystemFont(12);message.textColor=new Color(T.msg);message.lineLimit=1;message.minimumScaleFactor=.7;
 if(state.count&&state.expiresAt){
  const deadline=widget.addText('期限 '+formatTaipei(state.expiresAt));deadline.font=Font.systemFont(10);deadline.textColor=new Color(T.sub);
 }else{
  const note=widget.addText(value?'週日休息保留':'FitWeek・週日休息保留');note.font=Font.systemFont(10);note.textColor=new Color(T.sub);
 }
 const lastSync=widget.addText(value?'同步 '+formatTaipei(value.generatedAt):'尚未同步');lastSync.font=Font.systemFont(9);lastSync.textColor=new Color(T.sync);
 widget.url=value&&value.websiteUrl?value.websiteUrl:URLScheme.forRunningScript();
 // iOS decides when to actually refresh. The expiry is also printed in the widget.
 widget.refreshAfterDate=new Date(state.count&&state.expiresAt?Math.min(now+15*60*1000,state.expiresAt+1):now+30*60*1000);
 Script.setWidget(widget);
 if(!config.runsInWidget)await widget.presentSmall();
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
