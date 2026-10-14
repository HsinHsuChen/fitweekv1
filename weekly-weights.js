(function(root){
 'use strict';
 const DAY=86400000,OFFSET=8*3600000;
 function dateKey(time){return new Date(time+OFFSET).toISOString().slice(0,10)}
 function monday(time){const d=new Date(time+OFFSET);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-(d.getUTCDay()+6)%7)-OFFSET}
 function week(now=Date.now()){const targetStart=monday(now),sourceStart=targetStart-7*DAY;return {sourceStart,sourceEnd:targetStart,sourceWeek:dateKey(sourceStart),sourceLastDay:dateKey(targetStart-DAY),targetWeek:dateKey(targetStart),targetStart}}
 function entryKey(day,focus,id){return [day,focus||'',id].join('|')}
 function normalize(history){
  const unique=new Map();
  for(const w of Array.isArray(history)?history:[]){
   if(!w||!Array.isArray(w.exercises))continue;
   const time=[w.startedAt,w.endedAt].map(v=>v==null?NaN:Number(v)||Date.parse(v)).find(n=>Number.isFinite(n)&&n>0)||Date.parse((w.trainingDate||w.date||'')+'T12:00:00+08:00');
   if(!Number.isFinite(time)||time<=0)continue;
   const trainingDate=w.trainingDate||dateKey(time),key=[w.day,w.sessionFocus||'',time].join('|');
   const item={...w,time,trainingDate};if(!unique.has(key)||Number(item.endedAt)>Number(unique.get(key).endedAt))unique.set(key,item);
  }
  return [...unique.values()].sort((a,b)=>a.time-b.time);
 }
 function facts(workout,ex){
  const record=workout.exercises.find(e=>e&&e.id===ex.id);if(!record)return null;
  const sets=(Array.isArray(record.sets)?record.sets:[]).filter(s=>s&&!s.warmup&&Number(s.reps)>0&&Number.isFinite(Number(s.weight))&&Number(s.weight)>0);
  if(!sets.length)return null;
  const weight=Number(sets[sets.length-1].weight),uniform=sets.every(s=>Number(s.weight)===weight);
  const rpes=sets.map(s=>s.rpe==null||s.rpe===''?null:Number(s.rpe));
  const completeRpe=rpes.every(n=>Number.isFinite(n)&&n>=5&&n<=10),maxRpe=Math.max(0,...rpes.filter(n=>Number.isFinite(n)&&n>=5&&n<=10));
  const standardTarget=!record.target||(Number(record.target.sets)===ex.sets&&Number(record.target.maxReps)===ex.maxReps);
  const qualified=sets.length===ex.sets&&uniform&&standardTarget&&sets.every(s=>Number(s.reps)>=ex.maxReps)&&completeRpe&&maxRpe<=8&&record.formQuality==='stable';
  return {workout,record,sets,weight,uniform,completeRpe,maxRpe,qualified,reps:sets.map(s=>s.reps).join('／')};
 }
 function review(curriculum,history,now=Date.now()){
  const period=week(now),records=normalize(history).filter(w=>w.time<=now);
  const previous=records.filter(w=>w.trainingDate>=period.sourceWeek&&w.trainingDate<=period.sourceLastDay);
  const available=(curriculum.global.dumbbellWeights||[]).filter(n=>Number.isFinite(n)&&n>0).slice().sort((a,b)=>a-b);
  const rows=[];
  for(const day of ['A','B','C']){
   for(const ex of curriculum.days[day]?.exercises||[]){
    if(ex.weightType!=='dumbbell')continue;
    for(const focus of day==='A'?['肩優先','胸優先']:['']){
     const matches=records.filter(w=>w.day===day&&(!focus||w.sessionFocus===focus)&&w.trainingDate<=period.sourceLastDay&&w.time>=period.sourceStart-28*DAY).map(w=>facts(w,ex)).filter(Boolean);
     const inWeek=matches.filter(f=>f.workout.trainingDate>=period.sourceWeek),last=inWeek[inWeek.length-1];
     const row={key:entryKey(day,focus,ex.id),day,focus,exerciseId:ex.id,name:ex.name,weight:null,suggestedWeight:null,status:'insufficient',label:'資料不足',reason:'上週沒有這個動作與順序的有效紀錄',sessions:inWeek.length,reps:'',rpe:''};
     if(last){
      row.weight=last.weight;row.suggestedWeight=last.weight;row.reps=last.reps;row.rpe=last.completeRpe?String(last.maxRpe):'未完整填寫';
      const latest=matches.slice(-2),sameWeight=latest.length===2&&latest.every(f=>f.weight===last.weight&&f.uniform);
      const pain=inWeek.some(f=>['wrist','shoulder','knee'].some(k=>Number(f.workout.health?.[k])>0));
      const poorSleep=inWeek.some(f=>f.workout.health?.sleep!==''&&Number(f.workout.health?.sleep)>0&&Number(f.workout.health.sleep)<6);
      if(!available.includes(last.weight)){row.status='check';row.label='核對器材重量';row.suggestedWeight=null;row.reason='紀錄重量不在目前器材清單，先確認實際重量'}
      else if(pain){row.status='check';row.label='先評估不適';row.suggestedWeight=null;row.reason='上週有關節疼痛紀錄；先確認原因，不自動加重'}
      else if(last.record.formQuality==='breakdown'||last.maxRpe>=10||(sameWeight&&latest.every(f=>f.maxRpe>=9))){
       const lower=available.filter(n=>n<last.weight).pop();row.status='decrease';row.label='建議降重';row.suggestedWeight=lower??null;row.reason=lower?'最近紀錄有動作變形、力竭或反覆接近力竭，先降低一個可用重量':'已是最小重量，先減少次數並回報，不勉強完成';
      }else if(poorSleep){row.status='hold';row.label='先恢復';row.reason='上週有睡眠不足6小時的紀錄，先維持強度'}
      else if(!last.completeRpe||last.record.formQuality!=='stable'){row.status='insufficient';row.label='先補資料';row.reason='需要每組RPE及動作品質，才能判斷加重；先沿用實際重量'}
      else if(sameWeight&&latest.every(f=>f.qualified)){
       const next=available.find(n=>n>last.weight);
       if(!next){row.status='hold';row.label='維持／人工檢視';row.reason='已達最大可用重量，下一步由回報評估'}
       else if((next-last.weight)/last.weight>.1+1e-9){row.status='hold';row.label='增幅過大';row.reason=`最小下一檔是${next} kg（＋${Math.round((next-last.weight)/last.weight*100)}%），先維持並評估單組試重，不直接整套加重`}
       else{row.status='increase';row.label='可加一檔';row.suggestedWeight=next;row.reason='相同順序與重量連續兩次所有組達上限、RPE≤8且動作標準；增幅≤10%'}
      }else{row.status='hold';row.label='維持／加次數';row.reason=last.uniform?'尚未連續兩次同重量達標；先保留2～3下餘力，逐組加次數':'含混合重量，可能有暖身或降重組，先核對正式組'}
     }
     const current=records.filter(w=>w.day===day&&(!focus||w.sessionFocus===focus)&&w.trainingDate>=period.targetWeek).map(w=>facts(w,ex)).filter(Boolean).pop();
     if(current&&(current.record.formQuality==='breakdown'||current.maxRpe>=10||['wrist','shoulder','knee'].some(k=>Number(current.workout.health?.[k])>0))){row.status='check';row.label='本週先調整';row.suggestedWeight=null;row.safetyBlocked=true;row.reason='本週最近已有疼痛、力竭或動作變形，先回報與調整，不等下週也不套用加重建議'}
     rows.push(row);
    }
   }
  }
  const active=previous.filter(w=>w.exercises.some(e=>(e?.sets||[]).some(s=>Number(s?.reps)>0)));
  const days=new Set(active.map(w=>w.trainingDate));
  const highEffort=active.filter(w=>w.exercises.some(e=>(e?.sets||[]).some(s=>Number(s?.rpe)>=9))).length;
  return {...period,rows,summary:{trainingDays:days.size,sessions:active.length,minutes:active.reduce((sum,w)=>sum+(Number(w.durationMinutes)||0),0),highEffort,cindySessions:active.filter(w=>w.day==='D').length}};
 }
 const api={DAY,dateKey,monday,week,entryKey,normalize,review};if(typeof module==='object'&&module.exports)module.exports=api;root.WeeklyWeights=api;
})(typeof globalThis==='object'?globalThis:this);
