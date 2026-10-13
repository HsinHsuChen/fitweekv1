// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: fire;
// Name this script exactly: FitWeek-Streak
/* Shared by the website and the standalone Scriptable widget. */
(function(root){
 'use strict';
 const DAY_MS=24*60*60*1000;
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
   return [{startedAt,trainingDate:validDay(workout.trainingDate)?workout.trainingDate:taipeiDay(startedAt)}];
  });
 }
 function calculate(events,now=Date.now()){
  const sorted=(Array.isArray(events)?events:[]).filter(e=>e&&timestamp(e.startedAt)&&e.startedAt<=now&&validDay(e.trainingDate)).slice().sort((a,b)=>a.startedAt-b.startedAt);
  let lastStartedAt=0,lastTrainingDate='',days=new Set();
  for(const event of sorted){
   if(lastStartedAt&&event.startedAt-lastStartedAt>DAY_MS)days=new Set();
   days.add(event.trainingDate);lastStartedAt=event.startedAt;lastTrainingDate=event.trainingDate;
  }
  const expiresAt=lastStartedAt?lastStartedAt+DAY_MS:0,expired=Boolean(expiresAt&&now>expiresAt);
  return {count:expired?0:days.size,chainCount:days.size,lastStartedAt,lastTrainingDate,expiresAt,expired};
 }
 function safeUrl(value){
  if(typeof value!=='string'||value.length>2048||!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value)||/[\r\n]/.test(value))return '';
  return value;
 }
 function snapshot(state,websiteUrl,now=Date.now()){
  return {schemaVersion:1,rule:'24h-unique-training-day',chainCount:state.chainCount,lastStartedAt:state.lastStartedAt,lastTrainingDate:state.lastTrainingDate,expiresAt:state.expiresAt,generatedAt:now,websiteUrl:safeUrl(websiteUrl)};
 }
 function validateSnapshot(value){
  if(!value||value.schemaVersion!==1||value.rule!=='24h-unique-training-day'||!Number.isInteger(value.chainCount)||value.chainCount<0||value.chainCount>100000)throw new Error('小工具資料格式不正確');
  const start=timestamp(value.lastStartedAt),generated=timestamp(value.generatedAt);
  if(!generated||(value.lastStartedAt!==0&&!start)||(start&&(!validDay(value.lastTrainingDate)||value.expiresAt!==start+DAY_MS||generated<start||value.chainCount===0))||(!start&&(value.chainCount!==0||value.expiresAt!==0||value.lastTrainingDate!=='')))throw new Error('小工具時間資料不正確');
  return {schemaVersion:1,rule:value.rule,chainCount:value.chainCount,lastStartedAt:value.lastStartedAt,lastTrainingDate:value.lastTrainingDate,expiresAt:value.expiresAt,generatedAt:generated,websiteUrl:safeUrl(value.websiteUrl)};
 }
 function display(snapshotValue,now=Date.now()){
  const value=validateSnapshot(snapshotValue),expired=Boolean(value.expiresAt&&now>value.expiresAt);
  return {count:expired?0:value.chainCount,expired,expiresAt:value.expiresAt,lastStartedAt:value.lastStartedAt,lastTrainingDate:value.lastTrainingDate,websiteUrl:value.websiteUrl};
 }
 const api={DAY_MS,taipeiDay,eventsFromWorkouts,calculate,snapshot,validateSnapshot,display};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.FitWeekStreak=api;
})(typeof globalThis==='object'?globalThis:this);


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
 const widget=new ListWidget(),gradient=new LinearGradient();
 gradient.colors=[new Color('21082f'),new Color('4a176d')];gradient.locations=[0,1];widget.backgroundGradient=gradient;
 widget.setPadding(14,16,14,16);
 const title=widget.addText('連續運動');title.font=Font.semiboldSystemFont(12);title.textColor=new Color('d7b8ee');
 widget.addSpacer(5);
 const row=widget.addStack();row.centerAlignContent();row.spacing=7;
 const flame=SFSymbol.named('flame.fill');
 if(flame){flame.applyFont(Font.boldSystemFont(35));const icon=row.addImage(flame.image);icon.imageSize=new Size(30,39);icon.tintColor=new Color('d6a4ff')}
 const number=row.addText(String(state.count));number.font=Font.boldSystemFont(53);number.textColor=new Color('faf2ff');number.minimumScaleFactor=.35;number.lineLimit=1;
 const unit=row.addText('天');unit.font=Font.semiboldSystemFont(14);unit.textColor=new Color('ddc7ee');
 widget.addSpacer();
 const message=widget.addText(problem||(!value?'先從網頁同步':state.count?'保持你的節奏':'下一次，重新開始'));
 message.font=Font.semiboldSystemFont(12);message.textColor=new Color('efe1fa');message.lineLimit=1;message.minimumScaleFactor=.7;
 if(state.count&&state.expiresAt){
  const deadline=widget.addText('期限 '+formatTaipei(state.expiresAt));deadline.font=Font.systemFont(10);deadline.textColor=new Color('cdb1df');
 }else{
  const note=widget.addText(value?'24小時規則・每訓練日1次':'FitWeek・24小時規則');note.font=Font.systemFont(10);note.textColor=new Color('cdb1df');
 }
 const lastSync=widget.addText(value?'同步 '+formatTaipei(value.generatedAt):'尚未同步');lastSync.font=Font.systemFont(9);lastSync.textColor=new Color('b99dce');
 widget.url=value&&value.websiteUrl?value.websiteUrl:URLScheme.forRunningScript();
 // iOS decides when to actually refresh. The expiry is also printed in the widget.
 widget.refreshAfterDate=new Date(state.count&&state.expiresAt?Math.min(now+15*60*1000,state.expiresAt+1):now+30*60*1000);
 Script.setWidget(widget);
 if(!config.runsInWidget)await widget.presentSmall();
 Script.complete();
}
function formatTaipei(time){
 const date=new Date(time+8*60*60*1000),pad=value=>String(value).padStart(2,'0');
 return `${pad(date.getUTCMonth()+1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
await main();
