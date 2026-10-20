let weeklyWeightPlans={weeks:{}},weeklyReviewData=null,weeklyReviewUnavailable=false,cindyClock={startedAt:0,endedAt:0},cindyInterval=null;
async function loadWeeklyWeightPlans(){
 const saved=await dbGet('settings','weekly-weight-plans');
 const weeks=saved?.weeks;
 weeklyWeightPlans=weeks&&typeof weeks==='object'&&!Array.isArray(weeks)?saved:{weeks:{}};
}
function weeklySuggestedWeight(ex){
 if(weeklyReviewUnavailable)return null;
 const day=Object.keys(curriculum.days).find(d=>curriculum.days[d].exercises.some(e=>e.id===ex.id));
 const focus=day==='A'?sessionFocus('A'):'',key=WeeklyWeights.entryKey(day,focus,ex.id),week=WeeklyWeights.week(Date.now()).targetWeek;
 if(weeklyReviewData?.rows.find(row=>row.key===key)?.safetyBlocked)return null;
 for(const date of Object.keys(weeklyWeightPlans.weeks).filter(d=>d<=week).sort().reverse()){
  const item=weeklyWeightPlans.weeks[date]?.entries?.[key];if(item&&Number.isFinite(item.weight)&&item.weight>0)return item.weight;
 }
 return ex.weight;
}
function suggestionHint(ex){const day=Object.keys(curriculum.days).find(d=>curriculum.days[d].exercises.some(e=>e.id===ex.id)),key=WeeklyWeights.entryKey(day,day==='A'?sessionFocus('A'):'',ex.id);if(weeklyReviewData?.rows.find(row=>row.key===key)?.safetyBlocked)return '本週已有疼痛、力竭或變形紀錄，先調整並回報，暫不套用建議重量。';const weight=weeklySuggestedWeight(ex);return ex.weightType==='dumbbell'?`建議起始重量：${weight==null?'先選輕重量校準':weight+' kg'}；實際使用重量以每組欄位記錄`:''}
async function refreshWeeklyReview(history){
 weeklyReviewData=WeeklyWeights.review(curriculum,history||await getWorkouts(),Date.now());weeklyReviewUnavailable=false;
 const box=$('#weeklyReviewRows');if(!box)return;
 $('#weeklyPeriod').textContent=`檢視 ${weeklyReviewData.sourceWeek}～${weeklyReviewData.sourceLastDay}｜本週 ${weeklyReviewData.targetWeek} 起`;
 const summary=weeklyReviewData.summary;$('#weeklyOverview').textContent=`上週 ${summary.sessions} 次訓練、${summary.minutes} 分鐘；含 ${summary.cindySessions} 次 Cindy。`;
 const important=weeklyReviewData.rows.filter(r=>['increase','decrease','check'].includes(r.status));$('#weeklyActionCount').textContent=important.length?`${important.length} 項值得檢視`:'依紀錄逐項檢視';
 const rows=weeklyReviewData.rows.filter(r=>weeklyShowAll||r.sessions||r.safetyBlocked).sort((a,b)=>Number(['increase','decrease','check'].includes(b.status))-Number(['increase','decrease','check'].includes(a.status)));
 box.innerHTML=rows.length?rows.map(row=>`<div class="weekly-row"><div class="row"><b class="grow">${escapeHtml(row.name)}</b><span class="badge">${row.day}${row.focus?'・'+escapeHtml(row.focus):''}</span></div><div class="weekly-load">${row.weight==null?'上週未記錄':row.weight+' kg'} → ${row.suggestedWeight==null?'待確認':row.suggestedWeight+' kg'}</div><div class="small"><b>${escapeHtml(row.label)}</b>｜${escapeHtml(row.reason)}</div>${row.sessions?`<div class="small muted">最近次數 ${escapeHtml(row.reps)}｜最高 RPE ${escapeHtml(row.rpe)}</div>`:''}<label class="weekly-check"><input type="checkbox" data-weekly-key="${escapeHtml(row.key)}" ${row.suggestedWeight==null?'disabled':''} ${['increase','decrease'].includes(row.status)&&row.suggestedWeight!=null?'checked':''}>套用這項建議</label></div>`).join(''):'<p class="small muted">上週尚無可比較的紀錄；先累積實際重量、每組 RPE 與動作品質。</p>';
 $('#weeklyShowAll').textContent=weeklyShowAll?'收起尚無紀錄的動作':'顯示全部動作';$('#applyWeeklyBtn').disabled=!rows.some(r=>r.suggestedWeight!=null);
}
async function safeWeeklyReview(history){
 try{return await refreshWeeklyReview(history)}catch(error){
  console.error(error);weeklyReviewData=null;weeklyReviewUnavailable=true;
  const box=$('#weeklyReviewRows');if(box)box.innerHTML='<p class="small">每週檢視暫時無法讀取，請稍後重試。今日動作仍可記錄；重量請依實際使用值填寫。</p>';
 }
}
async function applyWeeklyWeights(){
 const button=$('#applyWeeklyBtn'),status=$('#weeklyStatus');button.disabled=true;
 try{
  if(!weeklyReviewData||weeklyReviewData.targetWeek!==WeeklyWeights.week(Date.now()).targetWeek){await refreshWeeklyReview();status.textContent='已進入新的一週，請檢視更新後的建議再勾選。';return}
  const chosen=new Set($$('[data-weekly-key]').filter(input=>input.checked&&!input.disabled).map(input=>input.dataset.weeklyKey));
  if(!chosen.size){status.textContent='先勾選你要採用的項目。';return}
  const fresh=WeeklyWeights.review(curriculum,await getWorkouts(),Date.now());
  const rows=fresh.rows.filter(r=>chosen.has(r.key)&&r.suggestedWeight!=null);
  if(rows.length!==chosen.size||rows.some(r=>weeklyReviewData.rows.find(old=>old.key===r.key)?.suggestedWeight!==r.suggestedWeight)){await refreshWeeklyReview();status.textContent='紀錄已更新，建議有變動；請重新檢視。';return}
  const old=weeklyWeightPlans.weeks[fresh.targetWeek]||{},entries={...(old.entries||{})};
  rows.forEach(r=>entries[r.key]={weight:r.suggestedWeight,sourceWeek:fresh.sourceWeek,reason:r.reason});
  weeklyWeightPlans={key:'weekly-weight-plans',weeks:{...weeklyWeightPlans.weeks,[fresh.targetWeek]:{sourceWeek:fresh.sourceWeek,appliedAt:Date.now(),entries}}};
  await dbPut('settings',weeklyWeightPlans);renderCurriculum();
  $$('[data-suggestion]').forEach(node=>{const ex=activeExercises().find(e=>e.id===node.dataset.suggestion);if(ex)node.textContent=suggestionHint(ex)});
  status.textContent=`已套用${rows.length}項，下次新紀錄會使用建議值；目前輸入與歷史紀錄保留。`;
 }catch(error){console.error(error);status.textContent='無法儲存建議，請保留畫面並重試。'}finally{button.disabled=false}
}
function selectOptions(values,value){return values.map(v=>`<option value="${escapeHtml(v)}"${v===value?' selected':''}>${escapeHtml(v||'未記錄')}</option>`).join('')}
function bindTrainingInputs(){
 $$('[data-ex], [data-note], [data-quality], [data-cindy], #sleep, #wrist, #shoulder, #knee, #gerd').forEach(el=>{const save=event=>{updateCompletion();queueSaveDraft(event)};el.oninput=save;el.onchange=save});
 $$('[data-photo-input]').forEach(input=>input.onchange=()=>handleMealPhotoInput(input));
}
function renderCindyPanel(saved={}){
 clearInterval(cindyInterval);cindyInterval=null;cindyClock={startedAt:Number(saved.clock?.startedAt)||0,endedAt:Number(saved.clock?.endedAt)||0};
 const partial=saved.partial||{},variants=saved.variants||{};
 $('#exerciseList').innerHTML=`<div class="day-note">${escapeHtml(curriculum.days.D.sessionNote)}</div><article class="card cindy-card"><div class="row"><b class="grow">20分鐘 Cindy</b><span class="badge req">5／10／15</span></div><div id="cindyClockText" class="cindy-clock">20:00</div><div class="row"><button id="cindyStart" type="button">開始20分鐘</button><button id="cindyStop" type="button" class="secondary">停止計時</button></div><p class="small muted">休息時間也包含在20分鐘內；可提前停止並按實際時間紀錄。先使用輔助動作配速，保持標準姿勢。</p><div class="row"><div class="field"><label>實際分鐘</label><input id="cindyMinutes" type="number" min="0" max="20" step="0.01" data-cindy></div><div class="field"><label>完整輪數</label><input id="cindyRounds" type="number" min="0" max="1000" step="1" data-cindy></div></div><p class="small muted">最後一輪沒做完，依順序填零星次數：</p><div class="row">${CindyWorkout.KEYS.map((key,i)=>`<div class="field"><label>${CindyWorkout.LABELS[key]}（0～${CindyWorkout.TARGET[i]}）</label><input id="cindyPartial-${key}" type="number" min="0" max="${CindyWorkout.TARGET[i]}" step="1" data-cindy></div>`).join('')}</div><div id="cindyScore" class="cindy-score"></div><div id="cindyError" class="small cindy-error" role="status"></div><div class="row"><div class="field"><label>引體版本</label><select id="cindyPullVariant" data-cindy>${selectOptions(['彈力帶輔助引體','徒手嚴格引體'],variants.pullUps||'彈力帶輔助引體')}</select></div><div class="field"><label>伏地版本</label><select id="cindyPushVariant" data-cindy>${selectOptions(['上斜伏地挺身','標準伏地挺身','跪姿伏地挺身'],variants.pushUps||'上斜伏地挺身')}</select></div><div class="field"><label>深蹲版本</label><select id="cindySquatVariant" data-cindy>${selectOptions(['徒手深蹲','箱式徒手深蹲'],variants.squats||'徒手深蹲')}</select></div></div><label>彈力帶顏色與掛法（使用輔助引體時填）</label><input id="cindyBand" placeholder="例如：紅色、膝蓋套帶" data-cindy><div class="row"><div class="field"><label>模式</label><select id="cindyEffort" data-cindy>${selectOptions(['配速練習','輪數挑戰'],saved.effort||'配速練習')}</select></div><div class="field"><label>整體RPE</label><select id="cindyRpe" data-cindy>${rpeOptions(saved.rpe)}</select></div></div><label>動作／恢復備註</label><textarea id="cindyNote" rows="2" data-cindy></textarea><p class="small muted">PR只比較20分鐘、相同動作版本、模式與彈力帶掛法。不同縮階版本的輪數不能直接相比。</p></article>${curriculum.days.D.exercises.map(ex=>`<article class="card"><b>${escapeHtml(ex.name)}</b>${exerciseGuide(ex)}</article>`).join('')}`;
 $('#cindyMinutes').value=saved.actualMinutes??20;$('#cindyRounds').value=saved.rounds??0;
 CindyWorkout.KEYS.forEach(k=>$('#cindyPartial-'+k).value=partial[k]??0);
 $('#cindyPullVariant').value=variants.pullUps||'彈力帶輔助引體';$('#cindyPushVariant').value=variants.pushUps||'上斜伏地挺身';$('#cindySquatVariant').value=variants.squats||'徒手深蹲';
 $('#cindyBand').value=saved.band||'';$('#cindyRpe').value=saved.rpe??'';$('#cindyNote').value=saved.note||'';$('#cindyEffort').value=saved.effort||'配速練習';
 $('#cindyStart').addEventListener('click',startCindyClock);$('#cindyStop').addEventListener('click',stopCindyClock);
 if(cindyClock.startedAt&&!cindyClock.endedAt)cindyInterval=setInterval(tickCindyClock,1000);
 tickCindyClock();
}
function readCindyForm(){return {rounds:$('#cindyRounds').value,partial:Object.fromEntries(CindyWorkout.KEYS.map(k=>[k,$('#cindyPartial-'+k).value])),actualMinutes:$('#cindyMinutes').value,variants:{pullUps:$('#cindyPullVariant').value,pushUps:$('#cindyPushVariant').value,squats:$('#cindySquatVariant').value},band:$('#cindyBand').value,effort:$('#cindyEffort').value,rpe:$('#cindyRpe').value,note:$('#cindyNote').value,clock:{...cindyClock}}}
function tickCindyClock(){
 if(currentDay!=='D'){clearInterval(cindyInterval);cindyInterval=null;return}
 let remaining=1200;
 if(cindyClock.startedAt){
  const end=cindyClock.endedAt||Date.now(),elapsed=Math.min(1200000,Math.max(0,end-cindyClock.startedAt));remaining=Math.max(0,Math.ceil((1200000-elapsed)/1000));
  $('#cindyMinutes').value=String(Math.floor(elapsed/600)/100);$('#cindyMinutes').readOnly=true;
  if(!remaining&&!cindyClock.endedAt){cindyClock.endedAt=cindyClock.startedAt+1200000;clearInterval(cindyInterval);cindyInterval=null;queueSaveDraft()}
 }
 $('#cindyClockText').textContent=cindyClock.startedAt&&remaining===0?'20分鐘完成':`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
 $('#cindyStart').disabled=Boolean(cindyClock.startedAt);$('#cindyStop').disabled=!cindyClock.startedAt||Boolean(cindyClock.endedAt);updateCindyStats();
}
async function startCindyClock(){
 if(cindyClock.startedAt)return;
 beginWorkout();workoutStartedAt=Date.now();renderSessionStatus();cindyClock={startedAt:workoutStartedAt,endedAt:0};tickCindyClock();cindyInterval=setInterval(tickCindyClock,1000);await saveDraft();
}
async function stopCindyClock(){if(!cindyClock.startedAt||cindyClock.endedAt)return;cindyClock.endedAt=Date.now();clearInterval(cindyInterval);cindyInterval=null;tickCindyClock();await saveDraft()}
function updateCindyStats(){
 try{const result=CindyWorkout.score(readCindyForm());$('#cindyScore').textContent=`${result.rounds}輪＋${result.partialReps}下，共${result.totalReps}次`;$('#cindyError').textContent='';$('#progressText').textContent=`Cindy ${result.rounds}輪＋${result.partialReps}下`;$('#progressBar').style.width=cindyClock.startedAt?`${Math.min(100,Number($('#cindyMinutes').value)/20*100)}%`:'0%'}catch(error){$('#cindyError').textContent=error.message;$('#cindyScore').textContent='請核對輪數與零星次數'}
}
function finalizeCindy(raw){
 const value={...raw,...CindyWorkout.score(raw)},minutes=Number(raw.actualMinutes);
 if(!Number.isFinite(minutes)||minutes<0||minutes>20)throw new Error('實際分鐘需介於0～20');
 if(value.totalReps>0&&minutes<=0)throw new Error('完成動作時請填實際訓練分鐘');
 value.actualMinutes=minutes;return value;
}
function cindyExercises(value){return CindyWorkout.KEYS.map((key,i)=>({id:curriculum.days.D.exercises[i].id,name:value.variants[key],priority:'required',perSide:false,target:{sets:1,minReps:0,maxReps:0},sets:value.totals[key]>0?[{weight:0,reps:value.totals[key],rpe:value.rpe}]:[],note:key==='pullUps'?value.band:''}))}
function cindyStats(value){return {reqDone:0,reqTotal:0,optDone:0,optTotal:0,totalDone:0,total:0,requiredPercent:0,optionalPercent:0,totalPercent:0,volume:0,highRpe:Number(value.rpe)>=9?1:0,rounds:value.rounds,totalReps:value.totalReps,partialReps:value.partialReps}}
function cindyPRs(workout,history){
 const previous=history.filter(w=>w.day==='D'&&w.endedAt<workout.endedAt&&CindyWorkout.comparable(w.cindy,workout.cindy));
 if(!previous.length)return [];
 const best=Math.max(...previous.map(w=>Number(w.cindy.totalReps)||0));return workout.cindy.totalReps>best?[`Cindy同條件PR：${best} → ${workout.cindy.totalReps}次`]:[];
}
function buildCindyReport(w){
 const c=w.cindy,s=cindyStats(c),base=buildMarkdownReport({...w,cindy:undefined,stats:s});
 const details=`### Cindy｜${c.actualMinutes}分鐘\n- 完整輪數：${c.rounds}\n- 最後一輪：引體${c.partial.pullUps}／伏地${c.partial.pushUps}／深蹲${c.partial.squats}\n- 總次數：${c.totalReps}\n- 模式：${c.effort}\n- 彈力帶與掛法：${c.band||'未填'}\n- 整體RPE：${c.rpe||'未填'}\n- 備註：${c.note||'無'}\n\n${CindyWorkout.KEYS.map(k=>`- ${c.variants[k]}：${c.totals[k]}下`).join('\n')}`;
 return base.replace(/^- 啞鈴紀錄：.*\n/m,'').replace(/^- 完成率：.*$/m,`- Cindy成績：${c.rounds}輪＋${c.partialReps}下`).replace(/^- 估算訓練量：.*$/m,`- 總動作次數：${c.totalReps}（徒手循環不以kg·reps衡量）`).replace(/## 訓練內容\n\n[\s\S]*?\n\n## 今日 PR/,`## 訓練內容\n\n${details}\n\n## 今日 PR`).replace(/- RPE 9–10 共 1 組/,`- Cindy整體RPE ${c.rpe}`);
}
// Feature events run after app.js has installed the common controls.
document.addEventListener('input',event=>{if(event.target.matches('[data-cindy]')){updateCindyStats();queueSaveDraft()}});
document.addEventListener('change',event=>{if(event.target.matches('[data-cindy], [data-quality]'))queueSaveDraft()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(currentDay==='D')tickCindyClock();if(!weeklyReviewData||weeklyReviewData.targetWeek!==WeeklyWeights.week(Date.now()).targetWeek)refreshWeeklyReview().catch(console.error)}});
$('#applyWeeklyBtn')?.addEventListener('click',applyWeeklyWeights);
