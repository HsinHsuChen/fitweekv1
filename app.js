const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
let curriculum=null,currentDay='A',metroTimer=null,audioCtx=null,workoutStartedAt=null,currentReport='',currentSummaryWorkout=null,restTimer=null,restButton=null;
const MEAL_LABELS={breakfast:'早餐',lunch:'午餐',dinner:'晚餐',snack:'加餐／宵夜'};
const MAX_PHOTOS_PER_MEAL=2;
let mealPhotos={breakfast:[],lunch:[],dinner:[],snack:[]};

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
function scheduledDay(){const day=new Date().getDay();if(day===2||day===5)return'B';if(day===3||day===6)return'C';return'A'}
function activeExercises(day=currentDay){const list=curriculum?.days?.[day]?.exercises||[],isSaturday=new Date().getDay()===6;return list.filter(ex=>!ex.saturdayOnly||isSaturday)}
function exerciseGuide(ex){return `<div class="cue"><b>一句要領：</b>${escapeHtml(ex.cue)}</div><details class="form-guide"><summary>查看完整動作要領</summary><div class="guide-flow"><div class="guide-step"><b>1｜起始</b>${escapeHtml(ex.setup)}</div><div class="guide-step"><b>2｜動作</b>${escapeHtml(ex.execution)}</div><div class="guide-step"><b>3｜回位</b>${escapeHtml(ex.return)}</div></div><div class="guide-alerts"><div class="guide-error"><b>常見錯誤</b>${escapeHtml(ex.mistake)}</div><div class="guide-stop"><b>立即停止</b>${escapeHtml(ex.stop)}</div></div></details>`}

function blankMealPhotos(){return{breakfast:[],lunch:[],dinner:[],snack:[]}}
function normalizeMealPhotos(value){
 const result=blankMealPhotos();
 Object.keys(result).forEach(meal=>{result[meal]=Array.isArray(value?.[meal])?value[meal].filter(p=>p&&p.dataUrl).slice(0,MAX_PHOTOS_PER_MEAL):[]});
 return result;
}
function allMealPhotos(diet={}){const photos=normalizeMealPhotos(diet.photos);return Object.entries(photos).flatMap(([meal,items])=>items.map((photo,index)=>({meal,index,photo})))}
function totalPhotoCount(diet={}){return allMealPhotos(diet).length}
function makeId(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function safeFilename(value='file'){return String(value).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'-').slice(0,80)}
function photoFileName(workout,meal,index){return `${safeFilename(workout.date)}_${safeFilename(MEAL_LABELS[meal]||meal)}_${index+1}.jpg`}
function dataUrlToBlob(dataUrl){const [meta,data]=dataUrl.split(',');const type=(meta.match(/data:([^;]+)/)||[])[1]||'image/jpeg';const bytes=atob(data);const out=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)out[i]=bytes.charCodeAt(i);return new Blob([out],{type})}
function loadImageFile(file){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片格式無法讀取'))};
  img.src=url;
 });
}
async function compressMealPhoto(file){
 if(!file.type.startsWith('image/'))throw new Error('僅支援圖片檔');
 if(file.size>25*1024*1024)throw new Error('單張照片不可超過 25 MB');
 const img=await loadImageFile(file),maxSide=1280,scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
 const width=Math.max(1,Math.round(img.naturalWidth*scale)),height=Math.max(1,Math.round(img.naturalHeight*scale));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);
 let quality=.76;
 let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
 if(!blob)throw new Error('照片壓縮失敗');
 if(blob.size>550*1024){quality=.62;blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality))}
 if(!blob)throw new Error('照片壓縮失敗');
 const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)});
 return{id:makeId(),name:file.name||'meal-photo.jpg',type:'image/jpeg',size:blob.size,width,height,createdAt:Date.now(),dataUrl};
}
function renderMealPhotoPreviews(){
 Object.keys(MEAL_LABELS).forEach(meal=>{
  const items=mealPhotos[meal]||[],count=$(`[data-photo-count="${meal}"]`),box=$(`[data-photo-preview="${meal}"]`);
  if(count)count.textContent=`${items.length}/${MAX_PHOTOS_PER_MEAL}`;
  if(box)box.innerHTML=items.map((p,i)=>`<figure class="photo-thumb"><img src="${p.dataUrl}" alt="${escapeHtml(MEAL_LABELS[meal])}照片 ${i+1}"><button type="button" class="photo-delete" aria-label="刪除照片" data-delete-photo="${escapeHtml(p.id)}" data-photo-meal="${meal}">×</button><figcaption>${Math.round((p.size||0)/1024)} KB</figcaption></figure>`).join('');
 });
}
async function handleMealPhotoInput(input){
 const meal=input.dataset.photoInput,files=[...(input.files||[])],status=$(`[data-photo-status="${meal}"]`);
 if(!MEAL_LABELS[meal]||!files.length)return;
 const available=MAX_PHOTOS_PER_MEAL-(mealPhotos[meal]?.length||0);
 if(available<=0){alert(`${MEAL_LABELS[meal]}最多 ${MAX_PHOTOS_PER_MEAL} 張照片。`);input.value='';return}
 if(status)status.textContent='正在壓縮並儲存照片…';
 try{
  navigator.storage?.persist?.().catch(()=>{});
  const selected=files.slice(0,available);
  for(const file of selected)mealPhotos[meal].push(await compressMealPhoto(file));
  renderMealPhotoPreviews();
  await saveDraft();
  if(files.length>available)alert(`只加入前 ${available} 張；每餐最多 ${MAX_PHOTOS_PER_MEAL} 張。`);
  if(status)status.textContent=`已儲存 ${mealPhotos[meal].length} 張`;
 }catch(error){
  console.error(error);alert(`照片處理失敗：${error.message||'請改用 JPG／PNG 再試一次'}`);
  if(status)status.textContent='照片處理失敗';
 }finally{input.value=''}
}
function renderSummaryPhotos(workout){
 const entries=allMealPhotos(workout.diet||{}),card=$('#summaryMealPhotos'),grid=$('#summaryPhotoGrid');
 if(!entries.length){card.classList.add('hidden');grid.innerHTML='';return}
 card.classList.remove('hidden');
 grid.innerHTML=entries.map(({meal,index,photo})=>`<figure class="summary-photo"><img src="${photo.dataUrl}" alt="${escapeHtml(MEAL_LABELS[meal])}照片 ${index+1}"><figcaption>${escapeHtml(MEAL_LABELS[meal])} ${index+1}</figcaption></figure>`).join('');
}
function photoAttachmentLines(workout){
 const entries=allMealPhotos(workout.diet||{});
 if(!entries.length)return '- 無餐點照片';
 return entries.map(({meal,index})=>`- ${MEAL_LABELS[meal]}照片 ${index+1}：${photoFileName(workout,meal,index)}`).join('\n');
}
function reportPhotoFiles(workout){
 return allMealPhotos(workout.diet||{}).map(({meal,index,photo})=>new File([dataUrlToBlob(photo.dataUrl)],photoFileName(workout,meal,index),{type:'image/jpeg',lastModified:photo.createdAt||Date.now()}));
}
function buildHtmlReport(workout){
 const photoHtml=allMealPhotos(workout.diet||{}).map(({meal,index})=>`<figure><img src="photos/${encodeURIComponent(photoFileName(workout,meal,index))}"><figcaption>${escapeHtml(MEAL_LABELS[meal])}照片 ${index+1}</figcaption></figure>`).join('');
 return `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(workout.date)} 訓練與飲食報告</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:auto;padding:24px;line-height:1.65;color:#1b1713}pre{white-space:pre-wrap;background:#f5f2ed;padding:18px;border-radius:12px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}figure{margin:0;border:1px solid #ddd4ca;border-radius:12px;overflow:hidden;background:#fff}img{display:block;width:100%;height:auto}figcaption{padding:8px 10px;font-weight:700}</style></head><body><h1>訓練與飲食報告</h1><section>${photoHtml||'<p>無餐點照片</p>'}</section><h2>文字紀錄</h2><pre>${escapeHtml(buildMarkdownReport(workout))}</pre></body></html>`;
}
async function downloadReportPackage(workout=currentSummaryWorkout){
 if(!workout)return alert('目前沒有可匯出的訓練報告。');
 if(typeof JSZip==='undefined')return alert('ZIP 元件尚未載入，請重新整理頁面後再試。');
 const button=$('#downloadReportBtn'),old=button.textContent;button.disabled=true;button.textContent='正在產生…';
 try{
  const zip=new JSZip(),folder=zip.folder('photos');
  zip.file('今日訓練與飲食報告.md',buildMarkdownReport(workout));
  zip.file('今日訓練與飲食報告.html',buildHtmlReport(workout));
  allMealPhotos(workout.diet||{}).forEach(({meal,index,photo})=>folder.file(photoFileName(workout,meal,index),photo.dataUrl.split(',')[1],{base64:true}));
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ChatGPT-訓練飲食報告-${workout.date}-Day${workout.day}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
 }catch(error){console.error(error);alert('報告包產生失敗，請保留資料後重試。')}
 finally{button.disabled=false;button.textContent=old}
}
async function shareReportWithPhotos(workout=currentSummaryWorkout){
 if(!workout)return alert('目前沒有可分享的訓練報告。');
 const button=$('#shareReportBtn'),old=button.textContent;button.disabled=true;button.textContent='準備分享…';
 try{
  const reportFile=new File([buildMarkdownReport(workout)],`訓練飲食報告-${workout.date}-Day${workout.day}.md`,{type:'text/markdown;charset=utf-8'});
  const files=[reportFile,...reportPhotoFiles(workout)];
  if(navigator.share&&navigator.canShare?.({files})){
   await navigator.share({title:`${workout.date} 訓練與飲食報告`,text:'請依報告及餐點照片估算每餐與全天熱量、蛋白質，並分析訓練恢復。',files});
  }else{
   await downloadReportPackage(workout);
   alert('此瀏覽器不支援多檔分享，已改下載 ZIP。請將 ZIP 上傳到 ChatGPT。');
  }
 }catch(error){
  if(error?.name!=='AbortError'){console.error(error);await downloadReportPackage(workout);alert('分享未完成，已改下載 ZIP 報告包。')}
 }finally{button.disabled=false;button.textContent=old}
}

async function loadCurriculum(){
 try{const r=await fetch('./curriculum.json',{cache:'no-store'});curriculum=await r.json()}catch(e){$('#fatal').classList.remove('hidden');throw e}
 $('#version').textContent=`Curriculum v${curriculum.curriculumVersion}`;
 $('#target').textContent=`目標 ${curriculum.global.targetMinutes} 分鐘｜上限 ${curriculum.global.maximumMinutes} 分鐘`;
 renderCurriculum();
 await chooseDay(localStorage.getItem('currentDay')||scheduledDay());
}

async function setView(id){
 $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));
 $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
 localStorage.setItem('activeView',id);
 if(id==='historyView')await renderHistory();
}

function renderCurriculum(){
 const box=$('#curriculumDays');box.innerHTML='';
 Object.entries(curriculum.days).forEach(([key,d])=>{const sec=document.createElement('section');sec.className='card';sec.innerHTML=`<div class="row"><div class="badge req">DAY ${key}</div><div><b>${escapeHtml(d.name)}</b><div class="small muted">${escapeHtml(d.focus)}</div></div></div>${d.exercises.map(ex=>`<div class="hist-item"><div class="row"><div class="grow"><b>${escapeHtml(ex.name)}</b><div class="small muted">${ex.sets} 組 × ${ex.perSide?'每側 ':''}${ex.minReps}–${ex.maxReps} 下｜${ex.weight?ex.weight+' kg':'徒手'}｜休息 ${ex.restSeconds} 秒</div></div><span class="badge ${ex.saturdayOnly?'opt':'req'}">${ex.saturdayOnly?'週六':'固定'}</span></div>${exerciseGuide(ex)}</div>`).join('')}`;box.appendChild(sec)});
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
 const h=draft.health||{},d=draft.diet||{};
 $('#sleep').value=h.sleep??'';$('#wrist').value=h.wrist??0;$('#shoulder').value=h.shoulder??0;$('#knee').value=h.knee??0;$('#gerd').value=h.gerd||'無';
 $('#dProtein').checked=Boolean(d.proteinMet);$('#dBeer').checked=Boolean(d.beer);$('#dChicken').checked=Boolean(d.chicken);$('#dCookie').checked=Boolean(d.cookie);$('#dLateEat').checked=Boolean(d.lateEat);
 $('#proteinGrams').value=d.proteinGrams??'';$('#waterMl').value=d.waterMl??'';$('#bodyWeight').value=d.bodyWeight??'';
 $('#breakfast').value=d.breakfast||'';$('#lunch').value=d.lunch||'';$('#dinner').value=d.dinner||'';$('#nutrition').value=d.note??h.nutrition??'';
 mealPhotos=normalizeMealPhotos(d.photos);renderMealPhotoPreviews();
 const box=$('#exerciseList');box.innerHTML=currentDay==='C'&&new Date().getDay()!==6?'<div class="day-note">今天是一般 Day C；週六開啟時會自動增加 2 組站姿提踵。</div>':'';
 activeExercises().forEach((ex,idx)=>{
  const val=draft.values?.[ex.id]||{};const c=document.createElement('article');c.className=`card exercise ${ex.priority}`;
  const setRows=Array.from({length:ex.sets},(_,i)=>{const s=(val.sets||[])[i]||{};return `<div class="set-grid"><div class="set-no">${i+1}</div><input inputmode="decimal" aria-label="重量" placeholder="kg" value="${escapeHtml(s.weight??ex.weight??'')}" data-ex="${ex.id}" data-set="${i}" data-f="weight"><input inputmode="numeric" aria-label="次數" placeholder="次數" value="${escapeHtml(s.reps??'')}" data-ex="${ex.id}" data-set="${i}" data-f="reps"><select aria-label="RPE" data-ex="${ex.id}" data-set="${i}" data-f="rpe"><option value="">RPE</option>${[5,6,7,8,9,10].map(n=>`<option ${String(s.rpe)===String(n)?'selected':''}>${n}</option>`).join('')}</select></div>`}).join('');
  c.innerHTML=`<button class="exercise-toggle" type="button" aria-expanded="true"><span><span class="ex-name">${idx+1}. ${escapeHtml(ex.name)}</span><span class="small muted ex-meta">${ex.sets} 組 × ${ex.perSide?'每側 ':''}${ex.minReps}–${ex.maxReps} 下｜休息 ${ex.restSeconds} 秒</span></span><span class="row"><span class="badge req">固定</span><span class="chevron">⌃</span></span></button><div class="exercise-body">${exerciseGuide(ex)}${setRows}<div class="exercise-actions"><button type="button" class="rest-btn" data-rest-seconds="${ex.restSeconds}">休息 ${ex.restSeconds} 秒</button><span class="small muted">節奏：${escapeHtml(ex.tempo)}</span></div><label>動作備註</label><textarea rows="2" data-note="${ex.id}" placeholder="疼痛、動作感受、太輕或太重">${escapeHtml(val.note||'')}</textarea></div>`;
  box.appendChild(c);
 });
 $$('.exercise-toggle').forEach(btn=>btn.addEventListener('click',()=>{const card=btn.closest('.exercise');const collapsed=card.classList.toggle('collapsed');btn.setAttribute('aria-expanded',String(!collapsed));$('.chevron',btn).textContent=collapsed?'⌄':'⌃'}));
 $$('[data-ex], [data-note], #sleep, #wrist, #shoulder, #knee, #gerd, #dProtein, #dBeer, #dChicken, #dCookie, #dLateEat, #proteinGrams, #waterMl, #bodyWeight, #breakfast, #lunch, #dinner, #nutrition').forEach(el=>{el.addEventListener('input',queueSaveDraft);el.addEventListener('change',queueSaveDraft)});
 $$('[data-photo-input]').forEach(input=>{input.onchange=()=>handleMealPhotoInput(input)});
 updateCompletion();
}

let saveTimer=null;
function queueSaveDraft(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft().catch(console.error),180)}
async function saveDraft(){
 const values={};
 activeExercises().forEach(ex=>{values[ex.id]={sets:[],note:$(`[data-note="${ex.id}"]`)?.value||''};for(let i=0;i<ex.sets;i++)values[ex.id].sets.push({weight:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="weight"]`)?.value||'',reps:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value||'',rpe:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="rpe"]`)?.value||''})});
 const health={sleep:$('#sleep').value,wrist:number($('#wrist').value),shoulder:number($('#shoulder').value),knee:number($('#knee').value),gerd:$('#gerd').value};
 const diet={proteinMet:$('#dProtein').checked,beer:$('#dBeer').checked,chicken:$('#dChicken').checked,cookie:$('#dCookie').checked,lateEat:$('#dLateEat').checked,proteinGrams:$('#proteinGrams').value,waterMl:$('#waterMl').value,bodyWeight:$('#bodyWeight').value,breakfast:$('#breakfast').value,lunch:$('#lunch').value,dinner:$('#dinner').value,note:$('#nutrition').value,photos:normalizeMealPhotos(mealPhotos)};
 await dbPut('drafts',{id:draftId(),date:localDate(),day:currentDay,startedAt:workoutStartedAt||Date.now(),updatedAt:Date.now(),values,health,diet});updateCompletion();
}

function completionStatsFromDom(){
 let reqDone=0,reqTotal=0,optDone=0,optTotal=0;
 activeExercises().forEach(ex=>{for(let i=0;i<ex.sets;i++){const done=Boolean($(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value);if(ex.priority==='required'){reqTotal++;if(done)reqDone++}else{optTotal++;if(done)optDone++}}});
 return{reqDone,reqTotal,optDone,optTotal,totalDone:reqDone+optDone,total:reqTotal+optTotal,requiredPercent:reqTotal?Math.round(reqDone/reqTotal*100):0,optionalPercent:optTotal?Math.round(optDone/optTotal*100):0,totalPercent:(reqTotal+optTotal)?Math.round((reqDone+optDone)/(reqTotal+optTotal)*100):0};
}
function updateCompletion(){const s=completionStatsFromDom();$('#progressBar').style.width=s.totalPercent+'%';$('#progressText').textContent=`完成 ${s.totalDone}/${s.total} 組（${s.totalPercent}%）`}

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
  const exercises=activeExercises().map(ex=>({id:ex.id,name:ex.name,priority:ex.priority,perSide:ex.perSide,target:{sets:ex.sets,minReps:ex.minReps,maxReps:ex.maxReps},sets:draft.values[ex.id]?.sets||[],note:draft.values[ex.id]?.note||''}));
  const workout={id:`${localDate()}-${currentDay}-${end}`,date:localDate(),day:currentDay,curriculumVersion:curriculum.curriculumVersion,startedAt:draft.startedAt||workoutStartedAt||end,endedAt:end,durationMinutes:Math.max(1,Math.round((end-(draft.startedAt||workoutStartedAt||end))/60000)),health:draft.health||{},diet:draft.diet||{},exercises};
  const history=await dbAll('workouts');workout.stats=workoutStats(workout);workout.prs=await detectPRs(workout,history);await dbPut('workouts',workout);
  renderSummary(workout);await renderHistory();
 }catch(e){console.error(e);alert('儲存失敗，請保留畫面並重試。')}finally{$('#finishBtn').disabled=false;$('#finishBtn').textContent='完成訓練'}
}

function buildMarkdownReport(w){
 const s=w.stats||workoutStats(w),h=w.health||{},d=w.diet||{};
 const exercises=w.exercises.map(e=>{const done=(e.sets||[]).filter(x=>number(x.reps)>0);const lines=done.length?done.map((x,i)=>`- 第 ${i+1} 組：${number(x.weight)>0?`${x.weight} kg × `:''}${x.reps} 下${x.rpe?`，RPE ${x.rpe}`:''}`).join('\n'):'- 未完成';return `### ${e.name}${e.priority==='optional'?'（選做）':''}\n${lines}${e.note?`\n- 備註：${e.note}`:''}`}).join('\n\n');
 const prs=(w.prs||[]).length?(w.prs||[]).map(x=>`- ${x}`).join('\n'):'- 本次未判定新 PR（首次紀錄不列入 PR）';
 const warnings=[];if(s.highRpe)warnings.push(`RPE 9–10 共 ${s.highRpe} 組`);if(number(h.wrist)>=3)warnings.push(`左手腕疼痛 ${h.wrist}/10`);if(number(h.shoulder)>=3)warnings.push(`左肩疼痛 ${h.shoulder}/10`);if(number(h.knee)>=3)warnings.push(`膝蓋疼痛 ${h.knee}/10`);if(h.gerd&&h.gerd!=='無')warnings.push(`胃食道逆流：${h.gerd}`);
 return `# 今日訓練報告\n\n- 日期：${w.date}\n- 課表：Day ${w.day}\n- 課表版本：v${w.curriculumVersion}\n- 訓練時間：${w.durationMinutes} 分鐘\n- 完成率：${s.totalDone}/${s.total}（${s.totalPercent}%）\n- 估算訓練量：${s.volume} kg·reps（單側動作按兩側計）\n\n## 身體狀況\n\n- 睡眠：${h.sleep||'未填'} 小時\n- 左手腕痛：${number(h.wrist)}/10\n- 左肩痛：${number(h.shoulder)}/10\n- 膝蓋痛：${number(h.knee)}/10\n- 胃食道逆流：${h.gerd||'無'}\n\n## 訓練內容\n\n${exercises}\n\n## 今日 PR\n\n${prs}\n\n## 風險提示\n\n${warnings.length?warnings.map(x=>`- ${x}`).join('\n'):'- 無明顯警示'}\n\n## 今日飲食紀錄

- 蛋白質達標（140g+）：${d.proteinMet?'是':'否'}
- 蛋白質估計：${d.proteinGrams||'未填'}${d.proteinGrams?' g':''}
- 飲水量：${d.waterMl||'未填'}${d.waterMl?' ml':''}
- 今日體重：${d.bodyWeight||'未填'}${d.bodyWeight?' kg':''}
- 啤酒：${d.beer?'有':'無'}
- 鹹酥雞：${d.chicken?'有':'無'}
- 餅乾：${d.cookie?'有':'無'}
- 晚上飲食失控：${d.lateEat?'有':'無'}

### 三餐

- 早餐：${d.breakfast||'未記錄'}
- 午餐：${d.lunch||'未記錄'}
- 晚餐：${d.dinner||'未記錄'}
- 加餐／恢復／腸胃備註：${d.note||'無'}\n\n## 餐點照片附件\n\n${photoAttachmentLines(w)}\n\n## 請 ChatGPT 分析\n\n請依據本次紀錄：\n\n1. 評估本次訓練品質、疲勞與恢復狀況。\n2. 檢查左手腕、左肩、膝蓋及胃食道逆流風險。\n3. 逐動作判斷下次重量或次數是否需要調整。\n4. 檢查是否出現需降載、減量或停止動作的訊號。\n5. 依餐點照片與文字，分餐估算熱量、蛋白質、碳水與脂肪，提供合理區間並列出份量、用油及醬料假設。\n6. 加總全天攝取量，說明照片看不出的不確定因素及需要我補充的資訊。\n7. 評估蛋白質、飲水、酒精、炸物、零食及晚間飲食是否影響增肌減脂與恢復。\n8. 只有在累積證據足夠時才提出課表改版建議；先說明理由，不要直接修改課表。`;
}

function renderSummary(w){
 currentSummaryWorkout=w;
 const s=w.stats||workoutStats(w);currentReport=buildMarkdownReport(w);$('#report').textContent=currentReport;renderSummaryPhotos(w);
 $('#summaryHeadline').textContent=`Day ${w.day}｜${w.durationMinutes} 分鐘｜完成 ${s.totalDone}/${s.total} 組`;
 $('#summaryStats').innerHTML=[['完成率',`${s.totalPercent}%`,`${s.totalDone}/${s.total} 組`],['訓練日',`Day ${w.day}`,'六日分化'],['訓練時間',`${w.durationMinutes} 分`,'上限 60 分'],['估算總量',`${s.volume}`,'kg·reps']].map(x=>`<div class="stat-card"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
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
 $('#historyList').innerHTML=list.length?list.map(w=>{const s=w.stats||workoutStats(w);return `<button class="history-entry" data-history-id="${escapeHtml(w.id)}"><span><b>${escapeHtml(w.date)}｜Day ${escapeHtml(w.day)}</b><small>完成 ${s.totalPercent}%｜總組數 ${s.totalDone}/${s.total}｜蛋白質 ${w.diet?.proteinMet?'達標':'未達標'}｜照片 ${totalPhotoCount(w.diet||{})} 張｜手腕 ${number(w.health?.wrist)}/10｜左肩 ${number(w.health?.shoulder)}/10｜膝蓋 ${number(w.health?.knee)}/10</small></span><span class="badge req">${w.durationMinutes} 分</span></button>`}).join(''):'<div class="empty">尚無 IndexedDB 訓練紀錄</div>';
 $$('.history-entry').forEach(b=>b.addEventListener('click',async()=>{const w=await dbGet('workouts',b.dataset.historyId);if(w){await setView('todayView');renderSummary(w)}}));
}

async function exportData(){const payload={schemaVersion:2,exportedAt:new Date().toISOString(),workouts:await dbAll('workouts'),drafts:await dbAll('drafts'),settings:await dbAll('settings')};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`training-backup-${localDate()}.json`;a.click();URL.revokeObjectURL(a.href)}
async function importData(file){try{const data=JSON.parse(await file.text());for(const x of data.workouts||[])await dbPut('workouts',x);for(const x of data.drafts||[])await dbPut('drafts',x);for(const x of data.settings||[])await dbPut('settings',x);await renderHistory();alert('匯入完成')}catch(e){alert('匯入失敗：檔案格式不正確')}}
async function resetAll(){if(!confirm('確定清除本裝置全部訓練紀錄？此動作無法復原。'))return;await dbClear('workouts');await dbClear('drafts');await dbClear('settings');await renderHistory();await renderExercises()}

function metroClick(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.12,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.08);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.08)}
function toggleMetro(){if(metroTimer){clearInterval(metroTimer);metroTimer=null;$('#metro').classList.remove('running');$('#metroBtn').textContent='開始'}else{metroClick();metroTimer=setInterval(metroClick,1000);$('#metro').classList.add('running');$('#metroBtn').textContent='停止'}}
function resetRestButton(button){if(!button)return;button.classList.remove('running','done');button.textContent=`休息 ${button.dataset.restSeconds} 秒`}
function startRestTimer(seconds,button){
 if(restTimer){clearInterval(restTimer);restTimer=null;if(restButton===button){resetRestButton(button);restButton=null;return}resetRestButton(restButton)}
 restButton=button;let remaining=seconds;button.classList.remove('done');button.classList.add('running');button.textContent=`休息中 ${remaining} 秒（取消）`;
 restTimer=setInterval(()=>{remaining--;if(remaining>0){button.textContent=`休息中 ${remaining} 秒（取消）`;return}clearInterval(restTimer);restTimer=null;button.classList.remove('running');button.classList.add('done');button.textContent='下一組開始 ✓';restButton=null;metroClick();setTimeout(()=>resetRestButton(button),3000)},1000);
}

function updateVisualViewportOffset(){const vv=window.visualViewport;if(!vv){document.documentElement.style.setProperty('--visual-bottom-offset','0px');return}const layoutHeight=document.documentElement.clientHeight,visualBottom=vv.offsetTop+vv.height,offset=Math.max(0,Math.round(layoutHeight-visualBottom));document.documentElement.style.setProperty('--visual-bottom-offset',`${offset}px`)}
if(window.visualViewport){window.visualViewport.addEventListener('resize',updateVisualViewportOffset);window.visualViewport.addEventListener('scroll',updateVisualViewportOffset)}
window.addEventListener('resize',updateVisualViewportOffset);window.addEventListener('orientationchange',()=>setTimeout(updateVisualViewportOffset,150));

document.addEventListener('click',e=>{
 if(e.target.matches('.tab'))setView(e.target.dataset.view);
 if(e.target.matches('.day-pill'))chooseDay(e.target.dataset.day);
 const rest=e.target.closest('[data-rest-seconds]');if(rest){startRestTimer(number(rest.dataset.restSeconds),rest);return}
 const deleteButton=e.target.closest('[data-delete-photo]');
 if(deleteButton){
  const meal=deleteButton.dataset.photoMeal,id=deleteButton.dataset.deletePhoto;
  mealPhotos[meal]=(mealPhotos[meal]||[]).filter(photo=>photo.id!==id);
  renderMealPhotoPreviews();saveDraft().catch(console.error);
 }
});
$('#metroBtn').addEventListener('click',toggleMetro);$('#finishBtn').addEventListener('click',finishWorkout);$('#copyBtn').addEventListener('click',copyReport);$('#copyBtnBottom').addEventListener('click',copyReport);$('#shareReportBtn').addEventListener('click',()=>shareReportWithPhotos());$('#downloadReportBtn').addEventListener('click',()=>downloadReportPackage());$('#backWorkoutBtn').addEventListener('click',backToWorkout);$('#exportBtn').addEventListener('click',exportData);$('#importFile').addEventListener('change',e=>e.target.files[0]&&importData(e.target.files[0]));$('#resetBtn').addEventListener('click',resetAll);
window.addEventListener('load',async()=>{updateVisualViewportOffset();await openDB();await loadCurriculum();await setView(localStorage.getItem('activeView')||'todayView');if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{})});
