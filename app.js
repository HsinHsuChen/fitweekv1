const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
let curriculum=null,currentDay='A',metroTimer=null,audioCtx=null,workoutStartedAt=null,currentReport='';

const DB_NAME='TrainingSystemV2',DB_VERSION=1;
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('workouts')){const s=db.createObjectStore('workouts',{keyPath:'id'});s.createIndex('date','date');s.createIndex('day','day')}if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbPut(store,val){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(val);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function dbGet(store,key){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbAll(store){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbClear(store){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}

function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function draftId(day=currentDay){return `draft-${localDate()}-${day}`}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

async function loadCurriculum(){
 try{const r=await fetch('./curriculum.json',{cache:'no-store'});curriculum=await r.json()}catch(e){$('#fatal').classList.remove('hidden');throw e}
 $('#version').textContent=`Curriculum v${curriculum.curriculumVersion}`;
 $('#target').textContent=`目標 ${curriculum.global.targetMinutes} 分鐘｜上限 ${curriculum.global.maximumMinutes} 分鐘`;
 renderCurriculum();
 await chooseDay(localStorage.getItem('currentDay')||'A');
}

async function setView(id){
 $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));
 $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
 localStorage.setItem('activeView',id);
 if(id==='historyView')await renderHistory();
}

function renderCurriculum(){
 const box=$('#curriculumDays');box.innerHTML='';
 Object.entries(curriculum.days).forEach(([key,d])=>{const sec=document.createElement('section');sec.className='card';sec.innerHTML=`<div class="row"><div class="badge req">DAY ${key}</div><div><b>${escapeHtml(d.name)}</b><div class="small muted">${escapeHtml(d.focus)}</div></div></div>${d.exercises.map(ex=>`<div class="hist-item"><div class="row"><div class="grow"><b>${escapeHtml(ex.name)}</b><div class="small muted">${ex.sets} 組 × ${ex.perSide?'每側 ':''}${ex.minReps}–${ex.maxReps} 下｜${ex.weight?ex.weight+' kg':'徒手／彈力帶'}</div></div><span class="badge ${ex.priority==='required'?'req':'opt'}">${ex.priority==='required'?'必做':'選做'}</span></div><div class="small">${escapeHtml(ex.cue)}</div></div>`).join('')}`;box.appendChild(sec)});
 $('#changelog').innerHTML=curriculum.changelog.map(c=>`<div class="card"><b>v${escapeHtml(c.version)}｜${escapeHtml(c.date)}</b>${c.changes.map(x=>`<div class="small muted">• ${escapeHtml(x)}</div>`).join('')}</div>`).join('');
}

async function chooseDay(day){
 if(curriculum&&!curriculum.days[day])day='A';
 currentDay=day;localStorage.setItem('currentDay',day);
 $$('.day-pill').forEach(b=>b.classList.toggle('active',b.dataset.day===day));
 $('#dayTitle').textContent=`Day ${day}｜${curriculum.days[day].name}`;
 $('#summaryPanel').classList.add('hidden');$('#workoutPanel').classList.remove('hidden');
 await renderExercises();
}

async function renderExercises(){
 let draft=await dbGet('drafts',draftId())||{id:draftId(),date:localDate(),day:currentDay,startedAt:Date.now(),values:{},health:{}};
 workoutStartedAt=draft.startedAt||Date.now();
 const h=draft.health||{};$('#sleep').value=h.sleep??'';$('#wrist').value=h.wrist??0;$('#knee').value=h.knee??0;$('#gerd').value=h.gerd||'無';$('#nutrition').value=h.nutrition||'';
 const box=$('#exerciseList');box.innerHTML='';
 curriculum.days[currentDay].exercises.forEach((ex,idx)=>{
  const val=draft.values?.[ex.id]||{};const c=document.createElement('article');c.className=`card exercise ${ex.priority}`;
  const setRows=Array.from({length:ex.sets},(_,i)=>{const s=(val.sets||[])[i]||{};return `<div class="set-grid"><div class="set-no">${i+1}</div><input inputmode="decimal" aria-label="重量" placeholder="kg" value="${escapeHtml(s.weight??ex.weight??'')}" data-ex="${ex.id}" data-set="${i}" data-f="weight"><input inputmode="numeric" aria-label="次數" placeholder="次數" value="${escapeHtml(s.reps??'')}" data-ex="${ex.id}" data-set="${i}" data-f="reps"><select aria-label="RPE" data-ex="${ex.id}" data-set="${i}" data-f="rpe"><option value="">RPE</option>${[5,6,7,8,9,10].map(n=>`<option ${String(s.rpe)===String(n)?'selected':''}>${n}</option>`).join('')}</select></div>`}).join('');
  c.innerHTML=`<button class="exercise-toggle" type="button" aria-expanded="true"><span><span class="ex-name">${idx+1}. ${escapeHtml(ex.name)}</span><span class="small muted ex-meta">${ex.sets} 組 × ${ex.perSide?'每側 ':''}${ex.minReps}–${ex.maxReps} 下｜休息 ${ex.restSeconds} 秒</span></span><span class="row"><span class="badge ${ex.priority==='required'?'req':'opt'}">${ex.priority==='required'?'必做':'選做'}</span><span class="chevron">⌃</span></span></button><div class="exercise-body"><div class="cue">${escapeHtml(ex.cue)}</div>${setRows}<label>動作備註</label><textarea rows="2" data-note="${ex.id}" placeholder="疼痛、動作感受、太輕或太重">${escapeHtml(val.note||'')}</textarea></div>`;
  box.appendChild(c);
 });
 $$('.exercise-toggle').forEach(btn=>btn.addEventListener('click',()=>{const card=btn.closest('.exercise');const collapsed=card.classList.toggle('collapsed');btn.setAttribute('aria-expanded',String(!collapsed));$('.chevron',btn).textContent=collapsed?'⌄':'⌃'}));
 $$('[data-ex], [data-note], #sleep, #wrist, #knee, #gerd, #nutrition').forEach(el=>{el.addEventListener('input',queueSaveDraft);el.addEventListener('change',queueSaveDraft)});
 updateCompletion();
}

let saveTimer=null;
function queueSaveDraft(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft().catch(console.error),180)}
async function saveDraft(){
 const values={};
 curriculum.days[currentDay].exercises.forEach(ex=>{values[ex.id]={sets:[],note:$(`[data-note="${ex.id}"]`)?.value||''};for(let i=0;i<ex.sets;i++)values[ex.id].sets.push({weight:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="weight"]`)?.value||'',reps:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value||'',rpe:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="rpe"]`)?.value||''})});
 const health={sleep:$('#sleep').value,wrist:number($('#wrist').value),knee:number($('#knee').value),gerd:$('#gerd').value,nutrition:$('#nutrition').value};
 await dbPut('drafts',{id:draftId(),date:localDate(),day:currentDay,startedAt:workoutStartedAt||Date.now(),updatedAt:Date.now(),values,health});updateCompletion();
}

function completionStatsFromDom(){
 let reqDone=0,reqTotal=0,optDone=0,optTotal=0;
 curriculum.days[currentDay].exercises.forEach(ex=>{for(let i=0;i<ex.sets;i++){const done=Boolean($(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value);if(ex.priority==='required'){reqTotal++;if(done)reqDone++}else{optTotal++;if(done)optDone++}}});
 return{reqDone,reqTotal,optDone,optTotal,totalDone:reqDone+optDone,total:reqTotal+optTotal,requiredPercent:reqTotal?Math.round(reqDone/reqTotal*100):0,optionalPercent:optTotal?Math.round(optDone/optTotal*100):0,totalPercent:(reqTotal+optTotal)?Math.round((reqDone+optDone)/(reqTotal+optTotal)*100):0};
}
function updateCompletion(){const s=completionStatsFromDom();$('#progressBar').style.width=s.requiredPercent+'%';$('#progressText').textContent=`必做組完成 ${s.reqDone}/${s.reqTotal}（${s.requiredPercent}%）｜選做 ${s.optDone}/${s.optTotal}`}

function summarizeExercise(ex){
 const completed=(ex.sets||[]).filter(s=>number(s.reps)>0);
 const volume=completed.reduce((sum,s)=>sum+number(s.weight)*number(s.reps)*(ex.perSide?2:1),0);
 return{completedSets:completed.length,volume,maxWeight:Math.max(0,...completed.map(s=>number(s.weight))),maxReps:Math.max(0,...completed.map(s=>number(s.reps))),maxRpe:Math.max(0,...completed.map(s=>number(s.rpe)))};
}
function workoutStats(w){
 let reqDone=0,reqTotal=0,optDone=0,optTotal=0,volume=0,highRpe=0;
 w.exercises.forEach(ex=>{const s=summarizeExercise(ex);volume+=s.volume;highRpe+=(ex.sets||[]).filter(x=>number(x.reps)>0&&number(x.rpe)>=9).length;if(ex.priority==='required'){reqDone+=s.completedSets;reqTotal+=ex.target.sets}else{optDone+=s.completedSets;optTotal+=ex.target.sets}});
 return{reqDone,reqTotal,optDone,optTotal,totalDone:reqDone+optDone,total:reqTotal+optTotal,requiredPercent:reqTotal?Math.round(reqDone/reqTotal*100):0,optionalPercent:optTotal?Math.round(optDone/optTotal*100):0,totalPercent:(reqTotal+optTotal)?Math.round((reqDone+optDone)/(reqTotal+optTotal)*100):0,volume:Math.round(volume*10)/10,highRpe};
}

async function detectPRs(workout,history){
 const prior=history.filter(w=>w.day===workout.day&&w.endedAt<workout.endedAt);const prs=[];
 for(const ex of workout.exercises){const now=summarizeExercise(ex);if(!now.completedSets)continue;let oldWeight=0,oldReps=0,oldVolume=0;prior.forEach(w=>{const p=w.exercises?.find(x=>x.id===ex.id||x.name===ex.name);if(p){const s=summarizeExercise({...p,perSide:ex.perSide});oldWeight=Math.max(oldWeight,s.maxWeight);oldReps=Math.max(oldReps,s.maxReps);oldVolume=Math.max(oldVolume,s.volume)}});if(prior.length&&now.maxWeight>oldWeight)prs.push(`${ex.name}：重量 PR ${oldWeight || 0} → ${now.maxWeight} kg`);if(prior.length&&now.maxReps>oldReps)prs.push(`${ex.name}：次數 PR ${oldReps || 0} → ${now.maxReps} 下`);if(prior.length&&now.volume>oldVolume&&oldVolume>0)prs.push(`${ex.name}：總量 PR ${Math.round(oldVolume)} → ${Math.round(now.volume)}`)}
 return prs;
}

async function finishWorkout(){
 $('#finishBtn').disabled=true;$('#finishBtn').textContent='儲存中…';
 try{
  await saveDraft();const draft=await dbGet('drafts',draftId());const end=Date.now();
  const exercises=curriculum.days[currentDay].exercises.map(ex=>({id:ex.id,name:ex.name,priority:ex.priority,perSide:ex.perSide,target:{sets:ex.sets,minReps:ex.minReps,maxReps:ex.maxReps},sets:draft.values[ex.id]?.sets||[],note:draft.values[ex.id]?.note||''}));
  const workout={id:`${localDate()}-${currentDay}-${end}`,date:localDate(),day:currentDay,curriculumVersion:curriculum.curriculumVersion,startedAt:draft.startedAt||workoutStartedAt||end,endedAt:end,durationMinutes:Math.max(1,Math.round((end-(draft.startedAt||workoutStartedAt||end))/60000)),health:draft.health||{},exercises};
  const history=await dbAll('workouts');workout.stats=workoutStats(workout);workout.prs=await detectPRs(workout,history);await dbPut('workouts',workout);
  renderSummary(workout);await renderHistory();
 }catch(e){console.error(e);alert('儲存失敗，請保留畫面並重試。')}finally{$('#finishBtn').disabled=false;$('#finishBtn').textContent='完成訓練'}
}

function buildMarkdownReport(w){
 const s=w.stats||workoutStats(w),h=w.health||{};
 const exercises=w.exercises.map(e=>{const done=(e.sets||[]).filter(x=>number(x.reps)>0);const lines=done.length?done.map((x,i)=>`- 第 ${i+1} 組：${number(x.weight)>0?`${x.weight} kg × `:''}${x.reps} 下${x.rpe?`，RPE ${x.rpe}`:''}`).join('\n'):'- 未完成';return `### ${e.name}${e.priority==='optional'?'（選做）':''}\n${lines}${e.note?`\n- 備註：${e.note}`:''}`}).join('\n\n');
 const prs=(w.prs||[]).length?(w.prs||[]).map(x=>`- ${x}`).join('\n'):'- 本次未判定新 PR（首次紀錄不列入 PR）';
 const warnings=[];if(s.highRpe)warnings.push(`RPE 9–10 共 ${s.highRpe} 組`);if(number(h.wrist)>=3)warnings.push(`左手腕疼痛 ${h.wrist}/10`);if(number(h.knee)>=3)warnings.push(`膝蓋疼痛 ${h.knee}/10`);if(h.gerd&&h.gerd!=='無')warnings.push(`胃食道逆流：${h.gerd}`);
 return `# 今日訓練報告\n\n- 日期：${w.date}\n- 課表：Day ${w.day}\n- 課表版本：v${w.curriculumVersion}\n- 訓練時間：${w.durationMinutes} 分鐘\n- 必做完成率：${s.reqDone}/${s.reqTotal}（${s.requiredPercent}%）\n- 選做完成率：${s.optDone}/${s.optTotal}（${s.optionalPercent}%）\n- 總完成組數：${s.totalDone}/${s.total}\n- 估算訓練量：${s.volume} kg·reps（單側動作按兩側計）\n\n## 身體狀況\n\n- 睡眠：${h.sleep||'未填'} 小時\n- 左手腕痛：${number(h.wrist)}/10\n- 膝蓋痛：${number(h.knee)}/10\n- 胃食道逆流：${h.gerd||'無'}\n\n## 訓練內容\n\n${exercises}\n\n## 今日 PR\n\n${prs}\n\n## 風險提示\n\n${warnings.length?warnings.map(x=>`- ${x}`).join('\n'):'- 無明顯警示'}\n\n## 飲食／恢復備註\n\n${h.nutrition||'無'}\n\n## 請 ChatGPT 分析\n\n請依據本次紀錄：\n\n1. 評估本次訓練品質、疲勞與恢復狀況。\n2. 檢查手腕、膝蓋及胃食道逆流風險。\n3. 逐動作判斷下次重量或次數是否需要調整。\n4. 檢查是否出現需降載、減量或停止動作的訊號。\n5. 只有在累積證據足夠時才提出課表改版建議；先說明理由，不要直接修改課表。`;
}

function renderSummary(w){
 const s=w.stats||workoutStats(w);currentReport=buildMarkdownReport(w);$('#report').textContent=currentReport;
 $('#summaryHeadline').textContent=`Day ${w.day}｜${w.durationMinutes} 分鐘｜完成 ${s.totalDone}/${s.total} 組`;
 $('#summaryStats').innerHTML=[['必做完成',`${s.requiredPercent}%`,`${s.reqDone}/${s.reqTotal} 組`],['選做完成',`${s.optionalPercent}%`,`${s.optDone}/${s.optTotal} 組`],['訓練時間',`${w.durationMinutes} 分`,'上限 60 分'],['估算總量',`${s.volume}`,'kg·reps']].map(x=>`<div class="stat-card"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
 const pr=$('#prCard');if((w.prs||[]).length){pr.classList.remove('hidden');pr.innerHTML=`<b>今日 PR</b>${w.prs.map(x=>`<div class="pr-line">🏆 ${escapeHtml(x)}</div>`).join('')}`}else pr.classList.add('hidden');
 $('#workoutPanel').classList.add('hidden');$('#summaryPanel').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
}

async function copyReport(){
 if(!currentReport)return;
 try{await navigator.clipboard.writeText(currentReport)}catch(e){const t=document.createElement('textarea');t.value=currentReport;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}
 const buttons=[$('#copyBtn'),$('#copyBtnBottom')];buttons.forEach(b=>{const old=b.textContent;b.textContent='已複製';setTimeout(()=>b.textContent=old,1300)});
}
function backToWorkout(){$('#summaryPanel').classList.add('hidden');$('#workoutPanel').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}

async function renderHistory(){
 const list=(await dbAll('workouts')).sort((a,b)=>(b.endedAt||0)-(a.endedAt||0));
 $('#historyList').innerHTML=list.length?list.map(w=>{const s=w.stats||workoutStats(w);return `<button class="history-entry" data-history-id="${escapeHtml(w.id)}"><span><b>${escapeHtml(w.date)}｜Day ${escapeHtml(w.day)}</b><small>必做 ${s.requiredPercent}%｜總組數 ${s.totalDone}/${s.total}｜手腕 ${number(w.health?.wrist)}/10｜膝蓋 ${number(w.health?.knee)}/10</small></span><span class="badge req">${w.durationMinutes} 分</span></button>`}).join(''):'<div class="empty">尚無 IndexedDB 訓練紀錄</div>';
 $$('.history-entry').forEach(b=>b.addEventListener('click',async()=>{const w=await dbGet('workouts',b.dataset.historyId);if(w){await setView('todayView');renderSummary(w)}}));
}

async function exportData(){const payload={schemaVersion:2,exportedAt:new Date().toISOString(),workouts:await dbAll('workouts'),drafts:await dbAll('drafts'),settings:await dbAll('settings')};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`training-backup-${localDate()}.json`;a.click();URL.revokeObjectURL(a.href)}
async function importData(file){try{const data=JSON.parse(await file.text());for(const x of data.workouts||[])await dbPut('workouts',x);for(const x of data.drafts||[])await dbPut('drafts',x);for(const x of data.settings||[])await dbPut('settings',x);await renderHistory();alert('匯入完成')}catch(e){alert('匯入失敗：檔案格式不正確')}}
async function resetAll(){if(!confirm('確定清除本裝置全部訓練紀錄？此動作無法復原。'))return;await dbClear('workouts');await dbClear('drafts');await dbClear('settings');await renderHistory();await renderExercises()}

function metroClick(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.12,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.08);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.08)}
function toggleMetro(){if(metroTimer){clearInterval(metroTimer);metroTimer=null;$('#metro').classList.remove('running');$('#metroBtn').textContent='開始'}else{metroClick();metroTimer=setInterval(metroClick,1000);$('#metro').classList.add('running');$('#metroBtn').textContent='停止'}}

function updateVisualViewportOffset(){const vv=window.visualViewport;if(!vv){document.documentElement.style.setProperty('--visual-bottom-offset','0px');return}const layoutHeight=document.documentElement.clientHeight,visualBottom=vv.offsetTop+vv.height,offset=Math.max(0,Math.round(layoutHeight-visualBottom));document.documentElement.style.setProperty('--visual-bottom-offset',`${offset}px`)}
if(window.visualViewport){window.visualViewport.addEventListener('resize',updateVisualViewportOffset);window.visualViewport.addEventListener('scroll',updateVisualViewportOffset)}
window.addEventListener('resize',updateVisualViewportOffset);window.addEventListener('orientationchange',()=>setTimeout(updateVisualViewportOffset,150));

document.addEventListener('click',e=>{if(e.target.matches('.tab'))setView(e.target.dataset.view);if(e.target.matches('.day-pill'))chooseDay(e.target.dataset.day)});
$('#metroBtn').addEventListener('click',toggleMetro);$('#finishBtn').addEventListener('click',finishWorkout);$('#copyBtn').addEventListener('click',copyReport);$('#copyBtnBottom').addEventListener('click',copyReport);$('#backWorkoutBtn').addEventListener('click',backToWorkout);$('#exportBtn').addEventListener('click',exportData);$('#importFile').addEventListener('change',e=>e.target.files[0]&&importData(e.target.files[0]));$('#resetBtn').addEventListener('click',resetAll);
window.addEventListener('load',async()=>{updateVisualViewportOffset();await openDB();await loadCurriculum();await setView(localStorage.getItem('activeView')||'todayView');if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{})});
