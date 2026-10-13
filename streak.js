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
