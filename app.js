
const $=(s,el=document)=>el.querySelector(s), $$=(s,el=document)=>[...el.querySelectorAll(s)];
let curriculum=null,currentDay='A',metroTimer=null,audioCtx=null,workoutStartedAt=null;

const DB_NAME='TrainingSystemV2', DB_VERSION=1;
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);
 req.onupgradeneeded=e=>{const db=e.target.result;
  if(!db.objectStoreNames.contains('workouts')){const s=db.createObjectStore('workouts',{keyPath:'id'});s.createIndex('date','date');s.createIndex('day','day')}
  if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});
  if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
 };
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
})}
async function dbPut(store,val){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(val);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function dbGet(store,key){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbAll(store){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbClear(store){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}

async function loadCurriculum(){
 try{const r=await fetch('./curriculum.json',{cache:'no-store'});curriculum=await r.json()}
 catch(e){$('#fatal').classList.remove('hidden');throw e}
 $('#version').textContent=`Curriculum v${curriculum.curriculumVersion}`;
 $('#target').textContent=`目標 ${curriculum.global.targetMinutes} 分鐘｜上限 ${curriculum.global.maximumMinutes} 分鐘`;
 renderCurriculum(); await chooseDay(localStorage.getItem('currentDay')||'A');
}
function setView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===id));localStorage.setItem('activeView',id);if(id==='history')renderHistory()}
function renderCurriculum(){
 const box=$('#curriculumDays');box.innerHTML='';
 Object.entries(curriculum.days).forEach(([key,d])=>{
  const sec=document.createElement('section');sec.className='card';
  sec.innerHTML=`<div class="row"><div class="badge req">DAY ${key}</div><div><b>${d.name}</b><div class="small muted">${d.focus}</div></div></div>
  ${d.exercises.map(ex=>`<div class="hist-item"><div class="row"><div class="grow"><b>${ex.name}</b><div class="small muted">${ex.sets} 組 × ${ex.perSide?'每側 ':''}${ex.minReps}–${ex.maxReps} 下｜${ex.weight?ex.weight+' kg':'徒手／彈力帶'}</div></div><span class="badge ${ex.priority==='required'?'req':'opt'}">${ex.priority==='required'?'必做':'選做'}</span></div><div class="small">${ex.cue}</div></div>`).join('')}`;
  box.appendChild(sec);
 });
 $('#changelog').innerHTML=curriculum.changelog.map(c=>`<div class="card"><b>v${c.version}｜${c.date}</b>${c.changes.map(x=>`<div class="small muted">• ${x}</div>`).join('')}</div>`).join('');
}
async function chooseDay(day){
 currentDay=day;localStorage.setItem('currentDay',day);$$('.day-pill').forEach(b=>b.classList.toggle('active',b.dataset.day===day));
 $('#dayTitle').textContent=`Day ${day}｜${curriculum.days[day].name}`; workoutStartedAt=workoutStartedAt||Date.now();
 await renderExercises();
}
async function renderExercises(){
 const draft=await dbGet('drafts',todayId())||{id:todayId(),day:currentDay,values:{}};
 if(draft.day!==currentDay){draft.day=currentDay;draft.values={}}
 const box=$('#exerciseList');box.innerHTML='';
 curriculum.days[currentDay].exercises.forEach((ex,idx)=>{
  const val=draft.values[ex.id]||{};const c=document.createElement('article');c.className=`card exercise ${ex.priority}`;
  const setRows=Array.from({length:ex.sets},(_,i)=>{const s=(val.sets||[])[i]||{};
   return `<div class="set-grid"><div class="set-no">${i+1}</div><input inputmode="decimal" aria-label="重量" placeholder="kg" value="${s.weight??ex.weight??''}" data-ex="${ex.id}" data-set="${i}" data-f="weight"><input inputmode="numeric" aria-label="次數" placeholder="次數" value="${s.reps??''}" data-ex="${ex.id}" data-set="${i}" data-f="reps"><select aria-label="RPE" data-ex="${ex.id}" data-set="${i}" data-f="rpe"><option value="">RPE</option>${[5,6,7,8,9,10].map(n=>`<option ${String(s.rpe)===String(n)?'selected':''}>${n}</option>`).join('')}</select></div>`}).join('');
  c.innerHTML=`<div class="ex-head"><div><div class="ex-name">${idx+1}. ${ex.name}</div><div class="small muted">${ex.sets} 組 × ${ex.perSide?'每側 ':''}${ex.minReps}–${ex.maxReps} 下｜休息 ${ex.restSeconds} 秒</div></div><span class="badge ${ex.priority==='required'?'req':'opt'}">${ex.priority==='required'?'必做':'選做'}</span></div><div class="cue">${ex.cue}</div>${setRows}<label>動作備註</label><textarea rows="2" data-note="${ex.id}" placeholder="疼痛、動作感受、太輕或太重">${val.note||''}</textarea>`;
  box.appendChild(c);
 });
 $$('[data-ex], [data-note]').forEach(el=>el.addEventListener('input',saveDraft));
 updateCompletion();
}
function today(){return new Date().toISOString().slice(0,10)}
function todayId(){return `draft-${today()}`}
async function saveDraft(){
 const values={};
 curriculum.days[currentDay].exercises.forEach(ex=>{values[ex.id]={sets:[],note:$(`[data-note="${ex.id}"]`)?.value||''};
  for(let i=0;i<ex.sets;i++){values[ex.id].sets.push({weight:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="weight"]`)?.value||'',reps:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value||'',rpe:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="rpe"]`)?.value||''})}
 });
 await dbPut('drafts',{id:todayId(),date:today(),day:currentDay,startedAt:workoutStartedAt,values});updateCompletion();
}
function updateCompletion(){
 const req=curriculum.days[currentDay].exercises.filter(x=>x.priority==='required');let done=0,total=0;
 req.forEach(ex=>{for(let i=0;i<ex.sets;i++){total++;if($(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value)done++}});
 const p=total?Math.round(done/total*100):0;$('#progressBar').style.width=p+'%';$('#progressText').textContent=`必做組完成 ${done}/${total}（${p}%）`;
}
async function finishWorkout(){
 await saveDraft();const draft=await dbGet('drafts',todayId());const health={wrist:+$('#wrist').value,knee:+$('#knee').value,gerd:$('#gerd').value,sleep:$('#sleep').value,nutrition:$('#nutrition').value};
 const exercises=curriculum.days[currentDay].exercises.map(ex=>({id:ex.id,name:ex.name,priority:ex.priority,target:{sets:ex.sets,minReps:ex.minReps,maxReps:ex.maxReps},sets:draft.values[ex.id]?.sets||[],note:draft.values[ex.id]?.note||''}));
 const end=Date.now(),duration=Math.max(1,Math.round((end-(draft.startedAt||workoutStartedAt||end))/60000));
 const id=`${today()}-${currentDay}`;const workout={id,date:today(),day:currentDay,curriculumVersion:curriculum.curriculumVersion,startedAt:draft.startedAt||workoutStartedAt,endedAt:end,durationMinutes:duration,health,exercises};
 await dbPut('workouts',workout);renderReport(workout);await renderHistory();alert('訓練已存入 IndexedDB');
}
function renderReport(w){
 const ex=w.exercises.map(e=>{const sets=e.sets.filter(s=>s.reps).map(s=>`${s.weight?`${s.weight}kg `:''}× ${s.reps}下${s.rpe?` RPE${s.rpe}`:''}`).join('／');return `・${e.name}${e.priority==='optional'?'（選做）':''}：${sets||'未完成'}${e.note?`\n  備註：${e.note}`:''}`}).join('\n');
 const h=w.health;const text=`【今日訓練報告】${w.date}\n課表版本：v${w.curriculumVersion}\n訓練：Day ${w.day}\n時間：${w.durationMinutes} 分鐘\n\n【身體狀況】\n・睡眠：${h.sleep||'未填'} 小時\n・左手腕痛：${h.wrist}/10\n・膝蓋痛：${h.knee}/10\n・胃食道逆流：${h.gerd}\n\n【訓練內容】\n${ex}\n\n【飲食／恢復備註】\n${h.nutrition||'無'}\n\n請依本次資料分析訓練品質、恢復與疼痛風險，判斷下次重量／次數是否調整；若累積證據顯示課表應改版，先提出原因與方案和我討論，不要直接改課表。`;
 $('#report').textContent=text;$('#reportCard').classList.remove('hidden');$('#reportCard').scrollIntoView({behavior:'smooth'});
}
async function copyReport(){await navigator.clipboard.writeText($('#report').textContent);alert('已複製今日報告')}
async function renderHistory(){const list=(await dbAll('workouts')).sort((a,b)=>b.endedAt-a.endedAt);$('#historyList').innerHTML=list.length?list.map(w=>`<div class="hist-item"><div class="row"><b>${w.date}｜Day ${w.day}</b><span class="grow"></span><span class="badge req">${w.durationMinutes} 分</span></div><div class="small muted">Curriculum v${w.curriculumVersion}｜手腕 ${w.health.wrist}/10｜膝蓋 ${w.health.knee}/10</div></div>`).join(''):'<div class="empty">尚無 IndexedDB 訓練紀錄</div>'}
async function exportData(){const payload={schemaVersion:1,exportedAt:new Date().toISOString(),workouts:await dbAll('workouts'),drafts:await dbAll('drafts'),settings:await dbAll('settings')};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`training-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href)}
async function importData(file){const data=JSON.parse(await file.text());for(const x of data.workouts||[])await dbPut('workouts',x);for(const x of data.drafts||[])await dbPut('drafts',x);for(const x of data.settings||[])await dbPut('settings',x);await renderHistory();alert('匯入完成')}
async function resetAll(){if(!confirm('確定清除本裝置全部訓練紀錄？此動作無法復原。'))return;await dbClear('workouts');await dbClear('drafts');await dbClear('settings');await renderHistory()}
function metroClick(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.12,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.08);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.08)}
function toggleMetro(){if(metroTimer){clearInterval(metroTimer);metroTimer=null;$('#metro').classList.remove('running');$('#metroBtn').textContent='開始'}else{metroClick();metroTimer=setInterval(metroClick,1000);$('#metro').classList.add('running');$('#metroBtn').textContent='停止'}}
document.addEventListener('click',e=>{if(e.target.matches('.tab'))setView(e.target.dataset.view);if(e.target.matches('.day-pill'))chooseDay(e.target.dataset.day)});
$('#metroBtn').addEventListener('click',toggleMetro);$('#finishBtn').addEventListener('click',finishWorkout);$('#copyBtn').addEventListener('click',copyReport);$('#exportBtn').addEventListener('click',exportData);$('#importFile').addEventListener('change',e=>e.target.files[0]&&importData(e.target.files[0]));$('#resetBtn').addEventListener('click',resetAll);
window.addEventListener('load',async()=>{await openDB();await loadCurriculum();setView(localStorage.getItem('activeView')||'todayView');if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{})});
