(function(root){
 'use strict';
 const TARGET=[5,10,15],KEYS=['pullUps','pushUps','squats'];
 const LABELS={pullUps:'引體向上',pushUps:'伏地挺身',squats:'徒手深蹲'};
 function score(value={}){
  const rounds=Number(value.rounds||0),partial=KEYS.map(k=>Number(value.partial?.[k]||0));
  if(!Number.isInteger(rounds)||rounds<0||rounds>1000)throw new Error('完整輪數請填0～1000的整數');
  partial.forEach((n,i)=>{if(!Number.isInteger(n)||n<0||n>TARGET[i])throw new Error(`${LABELS[KEYS[i]]}零星次數需介於0～${TARGET[i]}`)});
  if((partial[1]>0&&partial[0]!==5)||(partial[2]>0&&(partial[0]!==5||partial[1]!==10)))throw new Error('零星次數請依引體→伏地→深蹲順序填寫，完成前項後才計下一項');
  const extra=partial.reduce((sum,n)=>sum+n,0),whole=extra===30?rounds+1:rounds,remainder=extra===30?[0,0,0]:partial;
  return {rounds:whole,partial:Object.fromEntries(KEYS.map((k,i)=>[k,remainder[i]])),partialReps:extra===30?0:extra,totalReps:whole*30+(extra===30?0:extra),totals:Object.fromEntries(KEYS.map((k,i)=>[k,whole*TARGET[i]+remainder[i]]))};
 }
 function comparable(a,b){return Boolean(a&&b&&Number(a.actualMinutes)===20&&Number(b.actualMinutes)===20&&a.effort&&a.effort===b.effort&&KEYS.every(k=>typeof a.variants?.[k]==='string'&&a.variants[k]&&a.variants[k]===b.variants?.[k])&&(!String(a.variants?.pullUps).includes('彈力帶')||(a.band&&b.band))&&(a.band||'')===(b.band||''))}
 const api={TARGET,KEYS,LABELS,score,comparable};if(typeof module==='object'&&module.exports)module.exports=api;root.CindyWorkout=api;
})(typeof globalThis==='object'?globalThis:this);
