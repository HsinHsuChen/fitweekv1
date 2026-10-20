// Interface and record helpers. Database names and existing record keys stay compatible.
let sessionMeta={sessionId:'',workoutId:'',completedAt:null,durationMinutes:null};
let currentDraftKey='',nutritionLoaded=false,nutritionDate='',nutritionOriginal={},weeklyShowAll=false,editingWorkout=null;
let draftSaveChain=Promise.resolve(),sessionClockTimer=null;
const DIET_FIELD_IDS=['proteinGrams','waterMl','bodyWeight','breakfast','lunch','dinner','snack','nutrition','dProtein','dBeer','dChicken','dCookie','dLateEat'];
const DOUBLE_DUMBBELL_IDS=new Set(['neutral-db-shoulder-press','incline-db-press','lateral-raise','chest-supported-row','chest-supported-reverse-fly','hammer-curl','db-rdl','neutral-floor-press','neutral-close-floor-press','close-grip-floor-press','floor-db-press','incline-neutral-db-press']);
const RPE_OPTIONS=[[5,'5｜餘5+'],[6,'6｜餘4下'],[7,'7｜餘3下'],[8,'8｜餘2下'],[9,'9｜餘1下'],[10,'10｜餘0下']];
function rpeOptions(value){return '<option value="">未填</option>'+RPE_OPTIONS.map(([n,label])=>`<option value="${n}"${String(value)===String(n)?' selected':''}>${label}</option>`).join('')}
function nullableNumber(value){return value==null||String(value).trim()===''?null:number(value)}
function yesNoValue(value){return value===true?'yes':value===false?'no':''}
function yesNoRead(id){const value=$('#'+id).value;return value==='yes'?true:value==='no'?false:null}
function yesNoText(value){return value===true?'有':value===false?'無':'未記錄'}
function painText(value){return value==null||value===''?'未記錄':`${value}/10`}
function loadMultiplier(ex){const units=Number(ex.loadUnits);return units>0?units:DOUBLE_DUMBBELL_IDS.has(ex.id)?2:ex.perSide?2:1}
function loadColumnLabel(ex){return ex.weightType==='dumbbell'?(loadMultiplier(ex)===2&&!ex.perSide?'每支 kg':'單支 kg'):'額外 kg'}
function setSaveStatus(message,error=false){const status=$('#saveStatus');if(!status)return;status.textContent=message;status.classList.toggle('error',error);status.classList.toggle('saving',!error&&message.includes('儲存中'))}
function savedTime(){return new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false})}
function showTrainingNotice(message){const box=$('#trainingNotice');box.textContent=message;box.classList.toggle('hidden',!message)}
function readHealthForm(){return {sleep:$('#sleep').value,wrist:nullableNumber($('#wrist').value),shoulder:nullableNumber($('#shoulder').value),knee:nullableNumber($('#knee').value),gerd:$('#gerd').value}}
function readDietForm(){
 const grams=$('#proteinGrams').value;
 return {...nutritionOriginal,schemaVersion:2,proteinMet:grams!==''?number(grams)>=140:yesNoRead('dProtein'),proteinGrams:grams,waterMl:$('#waterMl').value,bodyWeight:$('#bodyWeight').value,breakfast:$('#breakfast').value,lunch:$('#lunch').value,dinner:$('#dinner').value,snack:$('#snack').value,note:$('#nutrition').value,beer:yesNoRead('dBeer'),chicken:yesNoRead('dChicken'),cookie:yesNoRead('dCookie'),lateEat:yesNoRead('dLateEat'),photos:normalizeMealPhotos(mealPhotos)};
}
function updateProteinStatus(){const grams=$('#proteinGrams').value,select=$('#dProtein');select.disabled=grams!=='';if(grams!==''){select.value=number(grams)>=140?'yes':'no';$('#proteinStatus').textContent=`已記錄 ${grams} / 140 g`}else $('#proteinStatus').textContent='不知道克數時，也可以手動選擇；不確定就留白'}
async function saveDailyNutrition(){if(!nutritionLoaded)return;const item={key:'nutrition-'+nutritionDate,date:nutritionDate,diet:readDietForm(),updatedAt:Date.now()};await dbPut('settings',item);nutritionOriginal=item.diet;return item}
async function loadDailyNutrition(date=localDate(),savePrevious=true){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
 if(savePrevious&&nutritionLoaded)await saveDraft();
 const saved=await dbGet('settings','nutrition-'+date);
 let diet=saved?.diet;
 if(!diet){const drafts=(await dbAll('drafts')).filter(d=>d.date===date&&d.diet).sort((a,b)=>(b.updatedAt||b.startedAt||0)-(a.updatedAt||a.startedAt||0));const workouts=(await dbAll('workouts')).filter(w=>w.date===date&&w.diet).sort((a,b)=>(b.updatedAt||b.endedAt||0)-(a.updatedAt||a.endedAt||0));diet=[...drafts.map(d=>({diet:d.diet,time:d.updatedAt||d.startedAt||0})),...workouts.map(w=>({diet:w.diet,time:w.updatedAt||w.endedAt||0}))].sort((a,b)=>b.time-a.time).find(item=>Object.entries(item.diet||{}).some(([key,value])=>key==='photos'?Object.values(value||{}).some(p=>p?.length):value!=null&&value!==''&&value!==false))?.diet||drafts[0]?.diet||workouts[0]?.diet||{}}
 nutritionDate=date;nutritionOriginal=diet;nutritionLoaded=true;$('#nutritionDate').value=date;
 for(const id of ['proteinGrams','waterMl','bodyWeight','breakfast','lunch','dinner','snack'])$('#'+id).value=diet[id]??'';
 $('#nutrition').value=diet.note??'';
 for(const [id,key] of [['dProtein','proteinMet'],['dBeer','beer'],['dChicken','chicken'],['dCookie','cookie'],['dLateEat','lateEat']])$('#'+id).value=yesNoValue(diet[key]);
 mealPhotos=normalizeMealPhotos(diet.photos);renderMealPhotoPreviews();updateProteinStatus();
}
async function dietForDate(date,fallback={}){if(nutritionLoaded&&nutritionDate===date)return readDietForm();const daily=await dbGet('settings','nutrition-'+date);return daily?.diet||fallback}
function deduplicateWorkouts(records){
 const unique=new Map();
 for(const record of records){const key=record.startedAt?[record.day,record.startedAt].join('|'):record.id;const old=unique.get(key),stamp=w=>number(w.updatedAt||w.endedAt);if(!old||stamp(record)>=stamp(old))unique.set(key,record)}
 return [...unique.values()];
}
async function getWorkouts(){
 const [records,settings]=await Promise.all([dbAll('workouts'),dbAll('settings')]);const diets=new Map(settings.filter(s=>s.key?.startsWith('nutrition-')&&s.diet).map(s=>[s.date||s.key.slice(10),s.diet]));
 return deduplicateWorkouts(records).map(w=>({...w,diet:diets.has(w.date)?{...w.diet,...diets.get(w.date)}:w.diet,stats:workoutStats(w)}));
}
function sessionPlanDate(){return new Date(sessionMeta.planAt||workoutStartedAt||Date.now())}
function restoreSessionMeta(draft){currentDraftKey=draft.id;workoutStartedAt=draft.startedAt||null;sessionMeta={sessionId:draft.sessionId||makeId(),planAt:draft.planAt||draft.startedAt||Date.now(),workoutId:draft.workoutId||'',completedAt:draft.completedAt||null,durationMinutes:draft.durationMinutes??null};renderSessionStatus()}
function renderSessionStatus(){
 const finished=Boolean(sessionMeta.completedAt),started=Boolean(workoutStartedAt),isCindy=currentDay==='D';
 const dateSuffix=started&&localDate(new Date(workoutStartedAt))!==localDate()?'・'+localDate(new Date(workoutStartedAt)).slice(5)+' 起始':'';$('#sessionStatus').textContent=(finished?'本筆已儲存':started?'訓練中':'尚未開始')+dateSuffix;
 const button=$('#startWorkoutBtn');button.classList.toggle('hidden',isCindy);button.disabled=started;button.textContent=finished?'已完成':started?'已開始':'開始訓練';
 $('#finishBtn').textContent=finished?'更新這筆紀錄':'完成並儲存訓練';
 const mins=started?finished?(sessionMeta.durationMinutes??Math.max(1,Math.round((sessionMeta.completedAt-workoutStartedAt)/60000))):Math.floor((Date.now()-workoutStartedAt)/60000):0;
 $('#sessionClock').textContent=started?`${mins} 分鐘`:'';
 const metroStatus=$('#metroStatus');if(metroStatus)metroStatus.textContent=metroRunning?(metroAudio?.paused?'正在恢復播放':'播放中・第 1 拍重音'):'5 拍・第 1 拍重音';$('#metroBtn').setAttribute('aria-label',metroRunning?'停止節拍器':'開始節拍器');
 $('#todayDate').textContent=new Date().toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',month:'long',day:'numeric',weekday:'long'});
}
function beginWorkout(){if(workoutStartedAt||sessionMeta.completedAt)return;workoutStartedAt=Date.now();currentDraftKey=`draft-${localDate(new Date(workoutStartedAt))}-${currentDay}`;renderSessionStatus()}
async function startWorkout(){beginWorkout();await saveDraft()}
function validateTrainingInputs(){
 const health=readHealthForm();for(const key of ['wrist','shoulder','knee'])if(health[key]!=null&&(health[key]<0||health[key]>10))throw new Error('疼痛分數請填 0～10，未記錄可留白。');if(health.sleep!==''&&(number(health.sleep)<0||number(health.sleep)>24))throw new Error('睡眠時間請填 0～24 小時。');
 if(currentDay==='D')return;
 for(const ex of activeExercises())for(let i=0;i<ex.sets;i++){
  const field=$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`),raw=field?.value??'',reps=Number(raw);
  if(raw!==''&&(!Number.isFinite(reps)||reps<0||!Number.isInteger(reps)))throw new Error(`${ex.name} 第 ${i+1} 組：次數請填 0 以上整數。`);
  if(reps>0){const weight=$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="weight"]`)?.value;if(ex.weightType==='dumbbell'&&(weight===''||number(weight)<0))throw new Error(`${ex.name} 第 ${i+1} 組：請選擇實際使用的單支重量。`);if(weight!==''&&(!Number.isFinite(Number(weight))||number(weight)<0))throw new Error('重量不可為負數。')}
 }
}
async function lastComparableRecords(){const history=await getWorkouts(),cutoff=workoutStartedAt||Date.now();return history.filter(w=>w.day===currentDay&&w.startedAt<cutoff&&(!sessionFocus()||w.sessionFocus===sessionFocus())).sort((a,b)=>(b.startedAt||b.endedAt)-(a.startedAt||a.endedAt))}
function lastRecordHtml(ex,history){const previous=history.find(w=>w.exercises?.some(e=>e.id===ex.id&&(e.sets||[]).some(s=>number(s.reps)>0)));if(!previous)return '<div class="last-record"><b>上次同條件紀錄</b>首次記錄這個動作與順序，先找穩定的重量。</div>';const record=previous.exercises.find(e=>e.id===ex.id),sets=record.sets.filter(s=>number(s.reps)>0),weights=[...new Set(sets.map(s=>String(s.weight)))],label=ex.weightType==='dumbbell'?'單支 ':'';return `<div class="last-record"><b>上次同條件紀錄・${escapeHtml(previous.date)}</b>${weights.length===1?`${label}${escapeHtml(weights[0]||'0')} kg｜${sets.map(s=>escapeHtml(s.reps)).join('／')} 下`:sets.map(s=>`${escapeHtml(s.weight)} kg × ${escapeHtml(s.reps)}`).join('、')}<br>RPE ${sets.map(s=>escapeHtml(s.rpe||'未填')).join('／')}</div>`}
function updateExerciseProgress(){for(const ex of activeExercises()){const count=Array.from({length:ex.sets},(_,i)=>number($(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value)>0).filter(Boolean).length;const label=$(`[data-ex-progress="${ex.id}"]`);if(label)label.textContent=`${count} / ${ex.sets} 組`}}
function renderReviewOverview(history){const period=WeeklyWeights.week(Date.now()),active=history.filter(w=>(w.startedAt||w.endedAt)>=period.targetStart&&w.exercises?.some(e=>e.sets?.some(s=>number(s.reps)>0)));$('#reviewStats').innerHTML=[['本週訓練',active.length+' 次','每筆不同訓練'],['有效組數',active.filter(w=>!w.cindy).reduce((s,w)=>s+workoutStats(w).totalDone,0)+' 組','Cindy 另記輪數'],['訓練時間',Math.round(active.reduce((s,w)=>s+number(w.durationMinutes),0))+' 分','依已記錄時間']].map(([label,value,detail])=>`<div class="stat-card"><span>${label}</span><b>${value}</b><small>${detail}</small></div>`).join('')}
async function openHistoryEditor(id){
 const history=await getWorkouts(),w=history.find(w=>w.id===id);if(!w)return;editingWorkout=w;
 $('#historyEditorTitle').textContent=`${w.date}｜Day ${w.day}${w.sessionFocus?'｜'+w.sessionFocus:''}`;
 let html=`<div class="field"><label for="editDuration">實際訓練時間（分鐘）</label><input id="editDuration" type="number" min="1" max="1440" value="${escapeHtml(w.durationMinutes)}"></div>`;
 if(w.cindy){const c=w.cindy;html+=`<div class="editor-exercise"><label for="editCindyRounds">完整輪數</label><input id="editCindyRounds" type="number" min="0" step="1" value="${c.rounds}"><div class="health-grid">${CindyWorkout.KEYS.map((key,i)=>`<label>${CindyWorkout.LABELS[key]}零星次數<input id="editCindyPartial-${key}" type="number" min="0" max="${CindyWorkout.TARGET[i]}" value="${c.partial[key]}"></label>`).join('')}</div>${[['pullUps','引體版本',['彈力帶輔助引體','徒手嚴格引體']],['pushUps','伏地版本',['上斜伏地挺身','標準伏地挺身','跪姿伏地挺身']],['squats','深蹲版本',['徒手深蹲','箱式徒手深蹲']]].map(([key,label,values])=>`<label>${label}<select id="editCindyVariant-${key}">${selectOptions([...new Set([...values,c.variants[key]])],c.variants[key])}</select></label>`).join('')}<label>彈力帶與掛法<input id="editCindyBand" value="${escapeHtml(c.band||'')}"></label><label>模式<select id="editCindyEffort">${selectOptions(['配速練習','輪數挑戰'],c.effort)}</select></label><label>整體 RPE<select id="editCindyRpe">${rpeOptions(c.rpe)}</select></label><label for="editCindyNote">訓練備註</label><textarea id="editCindyNote">${escapeHtml(c.note||'')}</textarea></div>`}
 else html+=w.exercises.map((record,index)=>{const template=curriculum.days[w.day]?.exercises.find(e=>e.id===record.id)||{...record,weightType:record.sets?.some(s=>number(s.weight)>0)?'dumbbell':undefined};return `<div class="editor-exercise"><h3>${escapeHtml(record.name)}</h3><div class="set-grid set-grid-head"><span>組</span><span>${loadColumnLabel(template)}</span><span>次數</span><span>RPE／餘力</span></div>${Array.from({length:Math.max(record.target?.sets||0,record.sets?.length||0)},(_,i)=>{const set=record.sets?.[i]||{};return `<div class="set-grid"><span class="set-no">${i+1}</span>${weightField(template,i,set).replace(/data-ex=/g,'data-edit-ex=').replace(/data-set=/g,'data-edit-set=').replace(/data-f=/g,'data-edit-f=')}<input aria-label="修改第${i+1}組次數" inputmode="numeric" value="${escapeHtml(set.reps??'')}" data-edit-ex="${escapeHtml(record.id)}" data-edit-set="${i}" data-edit-f="reps"><select aria-label="修改第${i+1}組RPE" data-edit-ex="${escapeHtml(record.id)}" data-edit-set="${i}" data-edit-f="rpe">${rpeOptions(set.rpe)}</select></div>`}).join('')}<label>動作品質<select data-edit-quality="${escapeHtml(record.id)}"><option value="">未記錄</option><option value="stable" ${record.formQuality==='stable'?'selected':''}>全程標準</option><option value="breakdown" ${record.formQuality==='breakdown'?'selected':''}>最後幾下變形</option></select></label><label>備註<textarea rows="2" data-edit-note="${escapeHtml(record.id)}">${escapeHtml(record.note||'')}</textarea></label></div>`}).join('');
 const health=w.health||{};html+=`<details class="editor-exercise"><summary>身體狀況</summary><div class="health-grid">${[['sleep','睡眠（小時）'],['wrist','左手腕痛 0–10'],['shoulder','左肩痛 0–10'],['knee','膝蓋痛 0–10']].map(([key,label])=>`<label>${label}<input id="editHealth-${key}" type="number" min="0" max="${key==='sleep'?24:10}" step="${key==='sleep'?'.5':'1'}" value="${escapeHtml(health[key]??'')}" placeholder="未記錄"></label>`).join('')}<label>胃食道逆流<select id="editHealth-gerd">${selectOptions(['','無','輕微','明顯'],health.gerd||'')}</select></label></div></details>`;
 html+='<p class="small muted">餐點內容請切到「飲食」，選擇本筆日期修改；報告會帶入更新後的飲食。</p>';
 $('#historyEditorFields').innerHTML=html;$('#historyEditorStatus').textContent='';$('#historyEditor').classList.remove('hidden');$('#historyEditor').scrollIntoView?.({behavior:'smooth',block:'start'});
}
async function saveHistoryEdit(){
 if(!editingWorkout)return;const button=$('#saveHistoryBtn');button.disabled=true;
 try{
  const w=JSON.parse(JSON.stringify(editingWorkout)),minutes=Number($('#editDuration').value);if(!Number.isFinite(minutes)||minutes<=0||minutes>1440||(w.cindy&&minutes>20))throw new Error(w.cindy?'Cindy 時間需大於 0 且不超過 20 分鐘。':'請填入有效的實際訓練時間。');w.durationMinutes=minutes;
  const health={...w.health,sleep:$('#editHealth-sleep').value,gerd:$('#editHealth-gerd').value};for(const key of ['wrist','shoulder','knee']){health[key]=nullableNumber($('#editHealth-'+key).value);if(health[key]!=null&&(health[key]<0||health[key]>10))throw new Error('疼痛分數需介於 0～10。')}if(health.sleep!==''&&(number(health.sleep)<0||number(health.sleep)>24))throw new Error('睡眠時間需介於 0～24 小時。');w.health=health;
  if(w.cindy){w.cindy=finalizeCindy({...w.cindy,actualMinutes:minutes,rounds:$('#editCindyRounds').value,partial:Object.fromEntries(CindyWorkout.KEYS.map(key=>[key,$('#editCindyPartial-'+key).value])),variants:Object.fromEntries(CindyWorkout.KEYS.map(key=>[key,$('#editCindyVariant-'+key).value])),band:$('#editCindyBand').value,effort:$('#editCindyEffort').value,rpe:$('#editCindyRpe').value,note:$('#editCindyNote').value,clock:{startedAt:w.startedAt,endedAt:w.startedAt+minutes*60000}});w.exercises=cindyExercises(w.cindy)}
  else for(const ex of w.exercises){const count=Math.max(ex.target?.sets||0,ex.sets?.length||0),sets=[];for(let i=0;i<count;i++){const read=field=>$(`[data-edit-ex="${ex.id}"][data-edit-set="${i}"][data-edit-f="${field}"]`)?.value??'';const reps=read('reps'),weight=read('weight');if(reps!==''&&(!Number.isInteger(Number(reps))||Number(reps)<0))throw new Error('次數請填 0 以上整數。');const template=curriculum.days[w.day]?.exercises.find(e=>e.id===ex.id);if(number(reps)>0&&template?.weightType==='dumbbell'&&(weight===''||number(weight)<0))throw new Error('已完成的啞鈴動作請填實際單支重量。');if(weight!==''&&(!Number.isFinite(Number(weight))||Number(weight)<0))throw new Error('重量不可為負數。');sets.push({...ex.sets?.[i],weight,reps,rpe:read('rpe')})}ex.sets=sets;ex.formQuality=$(`[data-edit-quality="${ex.id}"]`).value;ex.note=$(`[data-edit-note="${ex.id}"]`).value}
  if(!w.exercises.some(ex=>ex.sets?.some(s=>number(s.reps)>0)))throw new Error('請保留至少一組有效紀錄。');
  w.updatedAt=Date.now();w.stats=workoutStats(w);w.statsVersion=2;w.prs=await detectPRs(w,(await getWorkouts()).filter(old=>old.id!==w.id));await dbPut('workouts',w);
  const drafts=await dbAll('drafts');let changedCurrent=false;for(const draft of drafts){if(draft.workoutId===w.id||(draft.day===w.day&&draft.startedAt===w.startedAt)){draft.values={...draft.values,...Object.fromEntries(w.exercises.map(ex=>[ex.id,{sets:ex.sets,formQuality:ex.formQuality||'',note:ex.note||''}]))};draft.durationMinutes=minutes;draft.health=w.health;draft.workoutId=w.id;draft.completedAt=w.endedAt;draft.updatedAt=w.updatedAt;if(w.cindy)draft.cindy=w.cindy;await dbPut('drafts',draft);if(draft.id===currentDraftKey)changedCurrent=true}}
  if(changedCurrent)await renderExercises();editingWorkout=null;$('#historyEditor').classList.add('hidden');await renderHistory();setSaveStatus('紀錄已更新 '+savedTime());
 }catch(error){$('#historyEditorStatus').textContent=error.message;setSaveStatus('修改尚未儲存',true)}finally{button.disabled=false}
}
async function initializeInterface(){await loadDailyNutrition(localDate(),false);renderSessionStatus();clearInterval(sessionClockTimer);sessionClockTimer=setInterval(renderSessionStatus,15000);setSaveStatus('紀錄已就緒');const backup=await dbGet('settings','last-backup');$('#backupStatus').textContent=backup?.at?'上次備份：'+new Date(backup.at).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'}):'尚未記錄備份時間。'}
$('#startWorkoutBtn').addEventListener('click',()=>startWorkout().catch(error=>{setSaveStatus('開始時間尚未儲存',true);showTrainingNotice(error.message)}));
$('#nutritionDate').addEventListener('change',async event=>{try{await loadDailyNutrition(event.target.value)}catch(error){setSaveStatus('飲食尚未儲存',true);$('#nutritionDate').value=nutritionDate}});
$('#historyDay').addEventListener('change',()=>renderHistory().catch(console.error));
$('#weeklyShowAll').addEventListener('click',()=>{weeklyShowAll=!weeklyShowAll;safeWeeklyReview().catch(console.error)});
$('#saveHistoryBtn').addEventListener('click',saveHistoryEdit);$('#cancelHistoryBtn').addEventListener('click',()=>{editingWorkout=null;$('#historyEditor').classList.add('hidden')});
for(const id of DIET_FIELD_IDS){$('#'+id).addEventListener('input',()=>{updateProteinStatus();queueSaveDraft()});$('#'+id).addEventListener('change',()=>{updateProteinStatus();queueSaveDraft()})}
document.addEventListener('click',async event=>{const reference=event.target.closest('[data-open-curriculum]');if(reference){await setView('reviewView');$('#curriculumView').open=true;$('#curriculumView').scrollIntoView?.({behavior:'smooth',block:'start'})}const edit=event.target.closest('[data-edit-history]');if(edit)await openHistoryEditor(edit.dataset.editHistory)});
window.addEventListener('pagehide',()=>{if(saveTimer)saveDraft().catch(console.error)});
