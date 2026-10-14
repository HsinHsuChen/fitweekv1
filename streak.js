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
