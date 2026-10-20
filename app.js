const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const APP_VERSION='2.5.0';
let curriculum=null,currentDay='A',metroTimer=null,metroWatchdog=null,metroRecoveryTimer=null,metroAudio=null,metroAudioUrl='',metroRunning=false,metroRecovering=false,metroLastTime=-1,metroStallChecks=0,audioCtx=null,workoutStartedAt=null,currentReport='',currentSummaryWorkout=null,restTimer=null,restButton=null;
const MEAL_LABELS={breakfast:'早餐',lunch:'午餐',dinner:'晚餐',snack:'加餐／宵夜'};
const MAX_PHOTOS_PER_MEAL=6;
let mealPhotos={breakfast:[],lunch:[],dinner:[],snack:[]};
let streakEvents=[],streakExpiryTimer=null,widgetSourceText='',streakReady=false;

const DB_NAME='TrainingSystemV2',DB_VERSION=1;
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('workouts')){const s=db.createObjectStore('workouts',{keyPath:'id'});s.createIndex('date','date');s.createIndex('day','day')}if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbPut(store,val){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(val);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function dbGet(store,key){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbAll(store){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbClear(store){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}

function localDate(d=new Date()){return FitWeekStreak.taipeiDay(d.getTime())}
function sessionCalendarDate(){return workoutStartedAt?new Date(workoutStartedAt):new Date()}
function trainingWeekday(date=new Date()){return new Date(date.getTime()+8*3600000).getUTCDay()}
function draftId(day=currentDay){return day===currentDay&&currentDraftKey?currentDraftKey:`draft-${localDate(day===currentDay?sessionCalendarDate():new Date())}-${day}`}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function scheduledDay(){const day=trainingWeekday();if(day===2||day===5)return'B';if(day===3||day===6)return'C';return'A'}
function activeExercises(day=currentDay,date=sessionPlanDate()){
 const d=curriculum?.days?.[day],weekday=trainingWeekday(date);
 const list=(d?.exercises||[]).filter(ex=>!ex.saturdayOnly||weekday===6);
 const order=d?.exerciseOrderByWeekday?.[weekday];
 if(!order)return list;
 const ranks=new Map(order.map((id,index)=>[id,index]));
 return list.sort((a,b)=>(ranks.get(a.id)??order.length)-(ranks.get(b.id)??order.length));
}
function sessionFocus(day=currentDay,date=sessionPlanDate()){const d=curriculum?.days?.[day];return d?.sessionFocusByWeekday?.[trainingWeekday(date)]||d?.defaultSessionFocus||''}
function sessionNote(day=currentDay,date=sessionPlanDate()){
 const d=curriculum?.days?.[day];
 if(day==='D')return d?.sessionNote||'';
 if(trainingWeekday(date)===0)return `今天週日，原定休息。下方顯示你選擇的 ${day} 日課表。`;
 if(day==='A')return `本次 A 日：${sessionFocus(day,date)}。${d?.scheduleNote||''}`;
 if(day==='C')return trainingWeekday(date)===6?'週六 C 日：核心、腿臀與提踵，共 13 組。Dead Bug 先做核心啟動，不做到力竭。':'一般 C 日：核心與腿臀，共 11 組；週六自動加入 2 組站姿提踵。Dead Bug 不做到力竭。';
 return d?.sessionNote||'';
}
function exerciseLoadLabel(ex){const weight=ex.weightType==='dumbbell'?weeklySuggestedWeight(ex):ex.weight;return ex.loadDescription||(weight==null?'自行選擇起始重量':weight?`${weight} kg`:'徒手')}
function exerciseGuide(ex){return `<div class="cue">${escapeHtml(ex.cue)}</div><details class="form-guide"><summary>動作示意與完整要領</summary>${movementIllustration(ex.id)}${ex.effort?`<p class="small muted">${escapeHtml(ex.effort)}</p>`:''}${ex.loadDescription?`<p class="small muted">${escapeHtml(ex.loadDescription)}</p>`:''}<div class="guide-flow"><div class="guide-step"><b>1｜起始</b>${escapeHtml(ex.setup)}</div><div class="guide-step"><b>2｜動作</b>${escapeHtml(ex.execution)}</div><div class="guide-step"><b>3｜回位</b>${escapeHtml(ex.return)}</div></div><div class="guide-alerts"><div class="guide-error"><b>常見錯誤</b>${escapeHtml(ex.mistake)}</div><div class="guide-stop"><b>停止訊號</b>${escapeHtml(ex.stop)}</div></div></details>`}
function weightField(ex,index,set={}){
 const attrs=`aria-label="重量" data-ex="${escapeHtml(ex.id)}" data-set="${index}" data-f="weight"`;
 if(ex.weightType!=='dumbbell')return `<input inputmode="decimal" placeholder="kg" value="${escapeHtml(set.weight??ex.weight??'')}" ${attrs}>`;
 const weights=curriculum.global.dumbbellWeights||[],hasSaved=set.weight!=null;
 const suggested=weeklySuggestedWeight(ex),raw=hasSaved?String(set.weight):suggested==null?'':String(suggested);
 const match=raw.trim()!==''?weights.find(w=>Number(raw)===w):undefined;
 const value=match!==undefined?String(match):hasSaved?raw:'';
 const choices=[['','選重量'],...weights.map(w=>[String(w),`${w} kg`])];
 if(value!==''&&!choices.some(([v])=>v===value))choices.splice(1,0,[value,`${value} kg（原紀錄）`]);
 return `<select ${attrs}>${choices.map(([v,label])=>`<option value="${escapeHtml(v)}"${v===value?' selected':''}>${escapeHtml(label)}</option>`).join('')}</select>`;
}

function blankMealPhotos(){return{breakfast:[],lunch:[],dinner:[],snack:[]}}
function normalizeMealPhotos(value){
 const result=blankMealPhotos();
 Object.keys(result).forEach(meal=>{result[meal]=Array.isArray(value?.[meal])?value[meal].filter(p=>p&&typeof p.dataUrl==='string'&&/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(p.dataUrl)).slice(0,MAX_PHOTOS_PER_MEAL):[]});
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
  if(box)box.innerHTML=items.map((p,i)=>`<figure class="photo-thumb"><img src="${escapeHtml(p.dataUrl)}" alt="${escapeHtml(MEAL_LABELS[meal])}照片 ${i+1}"><button type="button" class="photo-delete" aria-label="刪除照片" data-delete-photo="${escapeHtml(p.id)}" data-photo-meal="${meal}">×</button><figcaption>${Math.round((p.size||0)/1024)} KB</figcaption></figure>`).join('');
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
 grid.innerHTML=entries.map(({meal,index,photo})=>`<figure class="summary-photo"><img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(MEAL_LABELS[meal])}照片 ${index+1}"><figcaption>${escapeHtml(MEAL_LABELS[meal])} ${index+1}</figcaption></figure>`).join('');
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
 try{const r=await fetch(`./curriculum.json?v=${APP_VERSION}`,{cache:'no-store'});if(r.ok===false)throw new Error('課表檔案尚未完整發布');curriculum=await r.json()}catch(e){$('#fatal').classList.remove('hidden');throw e}
 $('#version').textContent=`v${APP_VERSION}`;
 $('#target').textContent=`目標 ${curriculum.global.targetMinutes} 分鐘｜上限 ${curriculum.global.maximumMinutes} 分鐘`;
 await loadWeeklyWeightPlans();
 await safeWeeklyReview();
 renderCurriculum();
 const savedDay=localStorage.getItem('currentDayDate')===localDate()?localStorage.getItem('currentDay'):null;
 await chooseDay(savedDay||scheduledDay());
 await refreshStreak();
 await initializeInterface();
}

function formatStreakTime(time){return new Date(time).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
function paintStreak(){
 const state=FitWeekStreak.calculate(streakEvents,Date.now()),card=$('#streakCard');
 if(!card)return state;
 $('#streakCount').textContent=String(state.count);
 card.classList.toggle('idle',!state.count);
 $('#streakMessage').textContent=state.count?(FitWeekStreak.isRestWindow(Date.now())?'週日休息，紀錄保留':'保持你的節奏'):state.expired?'已中斷，下一筆從1開始':'從下一次完成訓練開始';
 $('#streakDeadline').textContent=state.count?`接續期限 ${formatStreakTime(state.expiresAt)}`:state.lastStartedAt?`上次起始 ${formatStreakTime(state.lastStartedAt)}`:'至少完成1組，再按「完成訓練」';
 clearTimeout(streakExpiryTimer);streakExpiryTimer=null;
 if(state.count)streakExpiryTimer=setTimeout(paintStreak,Math.max(1,Math.min(state.expiresAt,FitWeekStreak.windowStart(Date.now())+FitWeekStreak.DAY_MS)-Date.now()));
 return state;
}
function renderStreakFromHistory(history){streakEvents=FitWeekStreak.eventsFromWorkouts(history);streakReady=true;$$('[data-sync-streak]').forEach(button=>button.disabled=false);return paintStreak()}
async function refreshStreak(){return renderStreakFromHistory(await getWorkouts())}
function widgetPayload(){
 const now=Date.now(),state=FitWeekStreak.calculate(streakEvents,now),url=new URL(window.location.href);url.search='';url.hash='';
 return FitWeekStreak.snapshot(state,url.href,now);
}
function syncStreakToWidget(){
 const status=$('#streakSyncStatus');
 if(!streakReady){if(status)status.textContent='紀錄正在讀取，完成後再同步。';return}
 try{
  const payload=JSON.stringify(widgetPayload());
  if(status)status.textContent='正在開啟 Scriptable；請確認預覽的次數與期限。';
  window.location.href=`scriptable:///run/FitWeek-Streak?payload=${encodeURIComponent(payload)}`;
 }catch(error){console.error(error);if(status)status.textContent='無法開啟同步，請從設定頁確認 Scriptable 已安裝。'}
}
async function preloadWidgetSource(){const response=await fetch('./FitWeek-Streak.js',{cache:'no-store'});if(!response.ok)throw new Error('小工具程式載入失敗');widgetSourceText=await response.text()}
async function copyWidgetProgram(){
 const status=$('#widgetCopyStatus');
 try{
  if(!widgetSourceText)await preloadWidgetSource();
  try{await navigator.clipboard.writeText(widgetSourceText);status.textContent='已複製。到 Scriptable 貼上，名稱設為 FitWeek-Streak。'}catch(error){
   const box=$('#widgetSource');box.value=widgetSourceText;box.classList.remove('hidden');box.focus();box.select();
   const copied=document.execCommand&&document.execCommand('copy');
   status.textContent=copied?'已複製。到 Scriptable 貼上，名稱設為 FitWeek-Streak。':'請長按下方程式碼，選取全部並複製。';
  }
 }catch(error){console.error(error);status.textContent='程式尚未載入，請重新整理後重試，或使用「下載程式」。'}
}

async function setView(id){
 const legacy=id==='curriculumView'||id==='historyView';if(legacy)id='reviewView';
 if(!['todayView','nutritionView','reviewView','settingsView'].includes(id))id='todayView';
 if(saveTimer)await saveDraft();
 $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));
 $$('.tab').forEach(b=>{const active=b.dataset.view===id;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
 localStorage.setItem('activeView',id);
 if(id==='reviewView')await renderHistory();
 if(id==='nutritionView'&&!nutritionLoaded)await loadDailyNutrition(localDate(),false);
 if(legacy&&arguments[0]==='curriculumView')$('#curriculumView').open=true;
}
function renderCurriculum(){
 const box=$('#curriculumDays');box.innerHTML='';
 const principle=$('#trainingPrinciple'),progression=$('#progressionRule');
 if(principle)principle.textContent=curriculum.global.principle||'';
 if(progression)progression.textContent=curriculum.global.progressionRule||'';
 $('#equipmentSummary').textContent=(curriculum.global.equipment||[]).join('、');
 $('#equipmentSafety').textContent=curriculum.global.equipmentSafety||'';
 Object.entries(curriculum.days).forEach(([key,d])=>{const sec=document.createElement('section');sec.className='card';sec.innerHTML=`<div class="row"><div class="badge req">DAY ${key}</div><div><b>${escapeHtml(d.name)}</b><div class="small muted">${escapeHtml(d.focus)}</div></div></div>${d.scheduleNote||d.sessionNote?`<div class="day-note">${escapeHtml(d.scheduleNote||d.sessionNote)}</div>`:''}${d.exercises.map((ex,index)=>`<div class="hist-item"><div class="row"><div class="grow"><b>${escapeHtml(ex.name)}</b><div class="small muted">${d.mode==='cindy'?`每輪${CindyWorkout.TARGET[index]}下｜20分鐘依能力循環`:`${ex.sets} 組 × ${ex.perSide?'每側 ':''}${ex.minReps}–${ex.maxReps} 下｜${escapeHtml(exerciseLoadLabel(ex))}｜休息 ${ex.restSeconds} 秒`}</div></div><span class="badge ${ex.saturdayOnly?'opt':'req'}">${d.mode==='cindy'?'循環':ex.saturdayOnly?'週六':'固定'}</span></div>${exerciseGuide(ex)}</div>`).join('')}`;box.appendChild(sec)});
 $('#changelog').innerHTML=curriculum.changelog.map(c=>`<div class="card"><b>v${escapeHtml(c.version)}｜${escapeHtml(c.date)}</b>${c.changes.map(x=>`<div class="small muted">• ${escapeHtml(x)}</div>`).join('')}</div>`).join('');
}

async function chooseDay(day,skipSave=false){
 if(curriculum&&!curriculum.days[day])day='A';
 if(currentDraftKey&&!skipSave)await saveDraft();
 clearTimeout(saveTimer);saveTimer=null;
 currentDay=day;workoutStartedAt=null;currentDraftKey='';sessionMeta={sessionId:'',workoutId:'',completedAt:null,durationMinutes:null};localStorage.setItem('currentDay',day);localStorage.setItem('currentDayDate',localDate());
 $$('.day-pill').forEach(b=>{b.classList.toggle('active',b.dataset.day===day);b.setAttribute('aria-pressed',String(b.dataset.day===day))});
 $('#summaryPanel').classList.add('hidden');$('#workoutPanel').classList.remove('hidden');showTrainingNotice('');
 await renderExercises();
 const focus=sessionFocus(day);$('#dayTitle').textContent=`Day ${day}｜${curriculum.days[day].name}`;
 $('#target').textContent=day==='D'?'20 分鐘・5／10／15 循環':`${focus?focus+'・':''}目標 ${curriculum.global.targetMinutes} 分鐘`;
 renderSessionStatus();
}
async function renderExercises(){
 const draft=await dbGet('drafts',draftId())||{id:draftId(),date:localDate(),day:currentDay,startedAt:null,values:{},health:{}};
 if(draft.startedAt&&!draft.workoutId){const old=(await getWorkouts()).find(w=>w.day===currentDay&&w.startedAt===draft.startedAt);if(old){draft.workoutId=old.id;draft.completedAt=old.endedAt;draft.durationMinutes=old.durationMinutes}}
 restoreSessionMeta(draft);
 const h=draft.health||{};$('#sleep').value=h.sleep??'';$('#wrist').value=h.wrist??'';$('#shoulder').value=h.shoulder??'';$('#knee').value=h.knee??'';$('#gerd').value=h.gerd??'';
 if(currentDay==='D'){renderCindyPanel(draft.cindy||{});bindTrainingInputs();return}
 clearInterval(cindyInterval);cindyInterval=null;
 const history=await lastComparableRecords(),exercises=activeExercises(),firstIncomplete=exercises.findIndex(ex=>Array.from({length:ex.sets},(_,i)=>number(draft.values?.[ex.id]?.sets?.[i]?.reps)>0).filter(Boolean).length<ex.sets),expanded=firstIncomplete<0?exercises.length-1:firstIncomplete;
 const box=$('#exerciseList'),note=sessionNote();box.innerHTML=note?`<div class="day-note">${escapeHtml(note)}</div>`:'';
 exercises.forEach((ex,idx)=>{
  const val=draft.values?.[ex.id]||{},c=document.createElement('article'),collapsed=idx!==expanded;c.className=`card exercise${collapsed?' collapsed':''}`;
  const setRows=Array.from({length:ex.sets},(_,i)=>{const set=(val.sets||[])[i]||{};return `<div class="set-grid"><div class="set-no">${i+1}</div>${weightField(ex,i,set)}<input inputmode="numeric" aria-label="第${i+1}組次數" placeholder="下" value="${escapeHtml(set.reps??'')}" data-ex="${ex.id}" data-set="${i}" data-f="reps"><select aria-label="第${i+1}組RPE與剩餘次數" data-ex="${ex.id}" data-set="${i}" data-f="rpe">${rpeOptions(set.rpe)}</select></div>`}).join('');
  c.innerHTML=`<button class="exercise-toggle" type="button" aria-expanded="${!collapsed}"><span class="exercise-heading"><span class="ex-index">${idx+1}</span><span><span class="ex-name">${escapeHtml(ex.name)}</span><span class="small muted ex-meta">${ex.sets} 組 × ${ex.perSide?'每側 ':''}${ex.minReps}–${ex.maxReps} 下</span></span></span><span class="row"><span class="ex-progress" data-ex-progress="${ex.id}"></span><span class="chevron">${collapsed?'⌄':'⌃'}</span></span></button><div class="exercise-body">${lastRecordHtml(ex,history)}${exerciseGuide(ex)}<div class="suggestion-hint" data-suggestion="${ex.id}">${escapeHtml(suggestionHint(ex))}</div><div class="set-grid set-grid-head"><span>組</span><span>${loadColumnLabel(ex)}</span><span>次數</span><span>RPE／餘力</span></div>${setRows}<div class="exercise-actions"><button type="button" class="rest-btn" data-rest-seconds="${ex.restSeconds}">休息 ${ex.restSeconds} 秒</button><span class="small muted">${escapeHtml(ex.tempo)}</span></div><label>動作品質（供每週檢視）<select data-quality="${ex.id}"><option value="">未記錄</option><option value="stable" ${val.formQuality==='stable'?'selected':''}>全程標準</option><option value="breakdown" ${val.formQuality==='breakdown'?'selected':''}>最後幾下變形</option></select></label><details class="exercise-notes"><summary>動作備註</summary><textarea rows="2" data-note="${ex.id}" aria-label="${escapeHtml(ex.name)}備註" placeholder="疼痛、太輕或太重等">${escapeHtml(val.note||'')}</textarea></details></div>`;
  box.appendChild(c);
 });
 $$('.exercise-toggle').forEach(btn=>btn.addEventListener('click',()=>{const card=btn.closest('.exercise'),collapsed=card.classList.toggle('collapsed');btn.setAttribute('aria-expanded',String(!collapsed));$('.chevron',btn).textContent=collapsed?'⌄':'⌃'}));
 bindTrainingInputs();updateCompletion();
}
let saveTimer=null;
function queueSaveDraft(event){
 if(event?.target?.dataset.f==='reps'&&number(event.target.value)>0)beginWorkout();
 setSaveStatus('儲存中…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft().catch(error=>{console.error(error);setSaveStatus('儲存失敗・請保留畫面',true)}),180);
}
async function saveDraft(){
 clearTimeout(saveTimer);saveTimer=null;
 const startedAt=workoutStartedAt||null,id=draftId(),date=startedAt?localDate(new Date(startedAt)):localDate(),day=currentDay,focus=sessionFocus(),meta={...sessionMeta};
 const values={};if(day!=='D')activeExercises().forEach(ex=>{values[ex.id]={sets:[],formQuality:$(`[data-quality="${ex.id}"]`)?.value||'',note:$(`[data-note="${ex.id}"]`)?.value||''};for(let i=0;i<ex.sets;i++)values[ex.id].sets.push({weight:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="weight"]`)?.value||'',reps:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value||'',rpe:$(`[data-ex="${ex.id}"][data-set="${i}"][data-f="rpe"]`)?.value||''})});
 const health=readHealthForm(),daily=nutritionLoaded?{key:'nutrition-'+nutritionDate,date:nutritionDate,diet:readDietForm(),updatedAt:Date.now()}:null,cindy=day==='D'?readCindyForm():null;
 setSaveStatus('儲存中…');
 const operation=draftSaveChain.catch(()=>{}).then(async()=>{
  if(daily)await dbPut('settings',daily);
  const previous=await dbGet('drafts',id),diet=daily?.date===date?daily.diet:await dietForDate(date,previous?.diet||{});
  Object.entries(values).forEach(([key,value])=>value.sets.push(...(previous?.values?.[key]?.sets||[]).slice(value.sets.length)));
  const draft={id,date,day,sessionFocus:focus,sessionId:meta.sessionId||makeId(),planAt:meta.planAt,workoutId:meta.workoutId||'',completedAt:meta.completedAt,durationMinutes:meta.durationMinutes,startedAt,updatedAt:Date.now(),values:{...(previous?.values||{}),...values},health,diet,...(cindy?{cindy}: {})};await dbPut('drafts',draft);return draft;
 });draftSaveChain=operation;
 try{const draft=await operation;setSaveStatus(meta.completedAt?'修改已暫存・按更新紀錄':'已自動儲存 '+savedTime());return draft}catch(error){setSaveStatus('儲存失敗・請保留畫面',true);throw error}
}
function completionStatsFromDom(){
 let reqDone=0,reqTotal=0,optDone=0,optTotal=0;
 activeExercises().forEach(ex=>{for(let i=0;i<ex.sets;i++){const done=number($(`[data-ex="${ex.id}"][data-set="${i}"][data-f="reps"]`)?.value)>0;if(ex.priority==='required'){reqTotal++;if(done)reqDone++}else{optTotal++;if(done)optDone++}}});
 return{reqDone,reqTotal,optDone,optTotal,totalDone:reqDone+optDone,total:reqTotal+optTotal,requiredPercent:reqTotal?Math.round(reqDone/reqTotal*100):0,optionalPercent:optTotal?Math.round(optDone/optTotal*100):0,totalPercent:(reqTotal+optTotal)?Math.round((reqDone+optDone)/(reqTotal+optTotal)*100):0};
}
function updateCompletion(){if(currentDay==='D'){updateCindyStats();return}const s=completionStatsFromDom();$('#progressBar').style.width=s.totalPercent+'%';$('#progressText').textContent=`完成 ${s.totalDone}/${s.total} 組（${s.totalPercent}%）`;updateExerciseProgress()}

function summarizeExercise(ex){
 const completed=(ex.sets||[]).filter(s=>number(s.reps)>0);
 const volume=completed.reduce((sum,s)=>sum+number(s.weight)*number(s.reps)*loadMultiplier(ex),0);
 return{completedSets:completed.length,volume,maxWeight:Math.max(0,...completed.map(s=>number(s.weight))),maxReps:Math.max(0,...completed.map(s=>number(s.reps))),maxRpe:Math.max(0,...completed.map(s=>number(s.rpe)))};
}
function workoutStats(w){
 if(w.cindy)return cindyStats(w.cindy);
 let reqDone=0,reqTotal=0,optDone=0,optTotal=0,volume=0,highRpe=0;
 (w.exercises||[]).forEach(ex=>{const s=summarizeExercise(ex);volume+=s.volume;highRpe+=(ex.sets||[]).filter(x=>number(x.reps)>0&&number(x.rpe)>=9).length;if(ex.priority==='required'){reqDone+=s.completedSets;reqTotal+=ex.target?.sets||ex.sets?.length||0}else{optDone+=s.completedSets;optTotal+=ex.target?.sets||ex.sets?.length||0}});
 return{reqDone,reqTotal,optDone,optTotal,totalDone:reqDone+optDone,total:reqTotal+optTotal,requiredPercent:reqTotal?Math.round(reqDone/reqTotal*100):0,optionalPercent:optTotal?Math.round(optDone/optTotal*100):0,totalPercent:(reqTotal+optTotal)?Math.round((reqDone+optDone)/(reqTotal+optTotal)*100):0,volume:Math.round(volume*10)/10,highRpe};
}

async function detectPRs(workout,history){
 if(workout.cindy)return cindyPRs(workout,history);
 const prior=history.filter(w=>w.day===workout.day&&w.endedAt<workout.endedAt&&(!workout.sessionFocus||w.sessionFocus===workout.sessionFocus));const prs=[];
 for(const ex of workout.exercises){
  const now=summarizeExercise(ex);if(!now.completedSets)continue;
  const previous=prior.map(w=>w.exercises?.find(x=>x.id===ex.id||x.name===ex.name)).filter(p=>p&&summarizeExercise(p).completedSets);
  if(!previous.length)continue;
  let oldWeight=0,oldReps=0,oldVolume=0;
  previous.forEach(p=>{const s=summarizeExercise(p);oldWeight=Math.max(oldWeight,s.maxWeight);oldReps=Math.max(oldReps,s.maxReps);oldVolume=Math.max(oldVolume,s.volume)});
  if(now.maxWeight>oldWeight)prs.push(`${ex.name}：重量 PR ${oldWeight} → ${now.maxWeight} kg`);
  if(now.maxReps>oldReps)prs.push(`${ex.name}：次數 PR ${oldReps} → ${now.maxReps} 下`);
  if(now.volume>oldVolume&&oldVolume>0)prs.push(`${ex.name}：總量 PR ${Math.round(oldVolume)} → ${Math.round(now.volume)}`);
 }
 return prs;
}

async function finishWorkout(){
 const button=$('#finishBtn');if(button.disabled)return;let savedThisAttempt=false;
 try{
  validateTrainingInputs();
  if(currentDay==='D'){tickCindyClock();const value=finalizeCindy(readCindyForm());if(!value.totalReps)throw new Error('至少記錄一組有效動作，再完成訓練。');if(cindyClock.startedAt&&!cindyClock.endedAt){cindyClock.endedAt=Date.now();clearInterval(cindyInterval);cindyInterval=null;tickCindyClock()}if(!workoutStartedAt){workoutStartedAt=Date.now()-value.actualMinutes*60000;currentDraftKey=`draft-${localDate(new Date(workoutStartedAt))}-D`}}
  else {if(!completionStatsFromDom().totalDone)throw new Error('至少記錄一組有效動作，再完成訓練。');if(!workoutStartedAt)throw new Error('尚未記錄開始時間，請先按「開始訓練」。')}
  button.disabled=true;button.textContent='儲存中…';showTrainingNotice('');
  const draft=await saveDraft(),now=Date.now(),end=sessionMeta.completedAt||now,cindy=currentDay==='D'?finalizeCindy(draft.cindy):null;
  const exercises=cindy?cindyExercises(cindy):activeExercises().map(ex=>({id:ex.id,name:ex.name,priority:ex.priority,perSide:ex.perSide,loadUnits:loadMultiplier(ex),target:{sets:ex.sets,minReps:ex.minReps,maxReps:ex.maxReps},sets:(draft.values[ex.id]?.sets||[]).slice(0,ex.sets),formQuality:draft.values[ex.id]?.formQuality||'',note:draft.values[ex.id]?.note||''}));
  const start=draft.startedAt||workoutStartedAt,history=await getWorkouts(),existing=history.find(w=>w.day===currentDay&&w.startedAt===start);
  const id=sessionMeta.workoutId||existing?.id||`training-${sessionMeta.sessionId||makeId()}`;
  const workout={id,date:localDate(new Date(start)),trainingDate:FitWeekStreak.taipeiDay(start),day:currentDay,sessionFocus:draft.sessionFocus||'',curriculumVersion:curriculum.curriculumVersion,planAt:sessionMeta.planAt,startedAt:start,endedAt:end,updatedAt:now,durationMinutes:sessionMeta.durationMinutes??Math.max(1,Math.round((end-start)/60000)),health:draft.health||{},diet:await dietForDate(localDate(new Date(start)),draft.diet||{}),exercises,statsVersion:2};
  if(cindy){workout.cindy=cindy;workout.durationMinutes=cindy.actualMinutes}
  workout.stats=workoutStats(workout);workout.prs=await detectPRs(workout,history.filter(w=>w.id!==id&&!(w.day===workout.day&&w.startedAt===start)));await dbPut('workouts',workout);savedThisAttempt=true;
  sessionMeta.workoutId=id;sessionMeta.completedAt=end;sessionMeta.durationMinutes=workout.durationMinutes;await saveDraft();renderSessionStatus();renderSummary(workout);await renderHistory();setSaveStatus('訓練已儲存 '+savedTime());
 }catch(error){console.error(error);showTrainingNotice(savedThisAttempt?'訓練已儲存，但畫面尚未更新完成；請重新整理查看歷史紀錄。':error.message||'儲存失敗，請保留畫面並重試。');setSaveStatus(savedThisAttempt?'訓練已儲存・請重新整理':'本筆尚未完成儲存',true)}finally{button.disabled=false;button.textContent=sessionMeta.completedAt?'更新這筆紀錄':'完成並儲存訓練'}
}
function buildMarkdownReport(w){
 if(w.cindy)return buildCindyReport(w);
 const s=workoutStats(w),h=w.health||{},d=w.diet||{};
 const exercises=w.exercises.map(e=>{const done=(e.sets||[]).filter(x=>number(x.reps)>0);const lines=done.length?done.map((x,i)=>`- 第 ${i+1} 組：${number(x.weight)>0?`${x.weight} kg × `:''}${x.reps} 下${x.rpe?`，RPE ${x.rpe}`:''}`).join('\n'):'- 未完成';return `### ${e.name}${e.priority==='optional'?'（選做）':''}\n${lines}${e.formQuality?`\n- 動作品質：${e.formQuality==='stable'?'全程標準':'最後幾下變形'}`:''}${e.note?`\n- 備註：${e.note}`:''}`}).join('\n\n');
 const prs=(w.prs||[]).length?(w.prs||[]).map(x=>`- ${x}`).join('\n'):'- 本次未判定新 PR（首次紀錄不列入 PR）';
 const warnings=[];if(['wrist','shoulder','knee'].some(k=>h[k]==null||h[k]===''))warnings.push('關節疼痛有未記錄欄位，以下僅依已填資料檢視');if(s.highRpe)warnings.push(`RPE 9–10 共 ${s.highRpe} 組`);if(number(h.wrist)>=3)warnings.push(`左手腕疼痛 ${h.wrist}/10`);if(number(h.shoulder)>=3)warnings.push(`左肩疼痛 ${h.shoulder}/10`);if(number(h.knee)>=3)warnings.push(`膝蓋疼痛 ${h.knee}/10`);if(h.gerd&&h.gerd!=='無')warnings.push(`胃食道逆流：${h.gerd}`);
 return `# 今日訓練報告\n\n- 日期：${w.date}\n- 課表：Day ${w.day}${w.sessionFocus?`\n- 訓練重點：${w.sessionFocus}`:''}\n- 課表版本：v${w.curriculumVersion}\n- 訓練時間：${w.durationMinutes} 分鐘\n- 完成率：${s.totalDone}/${s.total}（${s.totalPercent}%）\n- 啞鈴紀錄：每支重量\n- 估算訓練量：${s.volume} kg·reps（依動作計入使用的啞鈴支數；單側按兩側計）\n\n## 身體狀況\n\n- 睡眠：${h.sleep||'未填'} 小時\n- 左手腕痛：${painText(h.wrist)}\n- 左肩痛：${painText(h.shoulder)}\n- 膝蓋痛：${painText(h.knee)}\n- 胃食道逆流：${h.gerd||'未記錄'}\n\n## 訓練內容\n\n${exercises}\n\n## 今日 PR\n\n${prs}\n\n## 風險提示\n\n${warnings.length?warnings.map(x=>`- ${x}`).join('\n'):'- 無明顯警示'}\n\n## 今日飲食紀錄

- 蛋白質達標（140g+）：${d.proteinMet===true?'是':d.proteinMet===false?'否':'未確認'}
- 蛋白質估計：${d.proteinGrams||'未填'}${d.proteinGrams?' g':''}
- 飲水量：${d.waterMl||'未填'}${d.waterMl?' ml':''}
- 今日體重：${d.bodyWeight||'未填'}${d.bodyWeight?' kg':''}
- 啤酒：${yesNoText(d.beer)}
- 鹹酥雞：${yesNoText(d.chicken)}
- 餅乾：${yesNoText(d.cookie)}
- 晚間飲食超出原定份量：${yesNoText(d.lateEat)}

### 三餐

- 早餐：${d.breakfast||'未記錄'}
- 午餐：${d.lunch||'未記錄'}
- 晚餐：${d.dinner||'未記錄'}
- 加餐／點心：${d.snack||'未記錄'}
- 加餐／恢復／腸胃備註：${d.note||'無'}\n\n## 餐點照片附件\n\n${photoAttachmentLines(w)}\n\n## 請 ChatGPT 分析\n\n請先確認台灣當日日期與本筆訓練日期；若跨日，分別說明，再依據本次紀錄：\n\n1. 評估本次訓練品質、疲勞與恢復狀況。\n2. 檢查左手腕、左肩、膝蓋及胃食道逆流風險。\n3. 逐動作判斷下次重量或次數是否需要調整。\n4. 檢查是否出現需降載、減量或停止動作的訊號。\n5. 依餐點照片與文字，分餐估算熱量、蛋白質、碳水與脂肪，提供合理區間並列出份量、用油及醬料假設。\n6. 加總全天攝取量，說明照片看不出的不確定因素及需要我補充的資訊。\n7. 評估蛋白質、飲水、酒精、炸物、零食及晚間飲食是否影響增肌減脂與恢復。\n8. 只有在累積證據足夠時才提出課表改版建議；先說明理由，不要直接修改課表。`;
}

function renderSummary(w){
 currentSummaryWorkout=w;
 const s=workoutStats(w);currentReport=buildMarkdownReport(w);$('#report').textContent=currentReport;renderSummaryPhotos(w);
 $('#summaryHeadline').textContent=`${w.date}｜Day ${w.day}${w.sessionFocus?`｜${w.sessionFocus}`:''}｜${w.durationMinutes} 分鐘｜完成 ${s.totalDone}/${s.total} 組`;
 $('#summaryStats').innerHTML=[['完成率',`${s.totalPercent}%`,`${s.totalDone}/${s.total} 組`],['訓練日',`Day ${w.day}`,w.sessionFocus||'六日分化'],['訓練時間',`${w.durationMinutes} 分`,'上限 60 分'],['估算總量',`${s.volume}`,'kg·reps']].map(x=>`<div class="stat-card"><span>${x[0]}</span><b>${x[1]}</b><small>${escapeHtml(x[2])}</small></div>`).join('');
 if(w.cindy){const c=w.cindy;$('#summaryHeadline').textContent=`${w.date}｜Day D｜${c.actualMinutes}分鐘｜${c.rounds}輪＋${c.partialReps}下`;$('#summaryStats').innerHTML=[['完整輪數',c.rounds,'每輪30次'],['總次數',c.totalReps,`零星${c.partialReps}次`],['訓練時間',c.actualMinutes+'分','目標20分'],['模式',c.effort,'依縮階版本比較']].map(x=>`<div class="stat-card"><span>${escapeHtml(x[0])}</span><b>${escapeHtml(x[1])}</b><small>${escapeHtml(x[2])}</small></div>`).join('')}
 const pr=$('#prCard');if((w.prs||[]).length){pr.classList.remove('hidden');pr.innerHTML=`<b>今日 PR</b>${w.prs.map(x=>`<div class="pr-line">🏆 ${escapeHtml(x)}</div>`).join('')}`}else pr.classList.add('hidden');
 $('#backWorkoutBtn').textContent=w.id===sessionMeta.workoutId?'返回修改本筆':'返回歷史紀錄';$('#workoutPanel').classList.add('hidden');$('#summaryPanel').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
}

async function copyReport(){
 if(!currentReport)return;
 try{await navigator.clipboard.writeText(currentReport)}catch(e){const t=document.createElement('textarea');t.value=currentReport;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}
 const buttons=[$('#copyBtn')];buttons.forEach(b=>{const old=b.textContent;b.textContent='已複製';setTimeout(()=>b.textContent=old,1300)});
}
async function backToWorkout(){
 $('#summaryPanel').classList.add('hidden');$('#workoutPanel').classList.remove('hidden');if(currentSummaryWorkout?.id!==sessionMeta.workoutId)await setView('reviewView');window.scrollTo({top:0,behavior:'smooth'});
}
async function startNewWorkout(){
 const button=$('#newWorkoutBtn');button.disabled=true;
 try{
  if(saveTimer)await saveDraft();const day=currentSummaryWorkout?.day||currentDay,now=Date.now();
  currentDay=day;workoutStartedAt=null;currentDraftKey='';sessionMeta={sessionId:makeId(),workoutId:'',completedAt:null,durationMinutes:null};
  const id=`draft-${localDate()}-${day}`,draft={id,date:localDate(),day,startedAt:null,sessionId:sessionMeta.sessionId,values:{},health:{},updatedAt:now};
  await dbPut('drafts',draft);await chooseDay(day,true);await setView('todayView');if(day!=='D')await startWorkout();window.scrollTo({top:0,behavior:'smooth'});
 }catch(error){console.error(error);showTrainingNotice('無法開始新紀錄，請保留畫面並重試。')}finally{button.disabled=false}
}
async function renderHistory(){
 const all=(await getWorkouts()).sort((a,b)=>(b.startedAt||b.endedAt||0)-(a.startedAt||a.endedAt||0)),filter=$('#historyDay').value,list=all.filter(w=>!filter||w.day===filter);
 renderStreakFromHistory(all);renderReviewOverview(all);await safeWeeklyReview(all);
 $('#historyList').innerHTML=list.length?list.map(w=>{const stats=workoutStats(w);return `<article class="history-row"><button type="button" class="history-entry" data-history-id="${escapeHtml(w.id)}"><span><b>${escapeHtml(w.date)}｜Day ${escapeHtml(w.day)}${w.sessionFocus?'・'+escapeHtml(w.sessionFocus):''}</b><small>${w.cindy?`${w.cindy.rounds}輪＋${w.cindy.partialReps}下`:`${stats.totalDone}/${stats.total} 組`}・${w.durationMinutes} 分・照片 ${totalPhotoCount(w.diet||{})} 張</small><small>蛋白質 ${w.diet?.proteinMet===true?'達標':w.diet?.proteinMet===false?'未達標':'未確認'}</small></span></button><button type="button" class="history-edit" data-edit-history="${escapeHtml(w.id)}" aria-label="修改${escapeHtml(w.date)} Day ${escapeHtml(w.day)}紀錄">修改</button></article>`}).join(''):'<div class="empty">尚無符合的訓練紀錄</div>';
 $$('.history-entry').forEach(button=>button.addEventListener('click',async()=>{const w=all.find(w=>w.id===button.dataset.historyId);if(w){w.prs=await detectPRs(w,all.filter(old=>old.id!==w.id));await setView('todayView');renderSummary(w)}}));
}
async function exportData(){
 await saveDraft();const at=Date.now(),payload={schemaVersion:3,exportedAt:new Date(at).toISOString(),workouts:await dbAll('workouts'),drafts:await dbAll('drafts'),settings:await dbAll('settings')},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`FitWeek-backup-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);await dbPut('settings',{key:'last-backup',at});$('#backupStatus').textContent='上次備份：'+new Date(at).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'});
}
async function importData(file){
 try{const data=JSON.parse(await file.text());if(!Array.isArray(data.workouts))throw new Error('不是完整的訓練備份');for(const [store,key] of [['workouts','id'],['drafts','id'],['settings','key']]){if(data[store]!=null&&!Array.isArray(data[store]))throw new Error('備份格式不正確');for(const value of data[store]||[])if(!value||typeof value[key]!=='string'||!value[key])throw new Error('備份有無法辨認的紀錄')}
  clearTimeout(saveTimer);saveTimer=null;await draftSaveChain.catch(()=>{});for(const store of ['workouts','drafts','settings'])for(const value of data[store]||[])await dbPut(store,value);await loadWeeklyWeightPlans();nutritionLoaded=false;await loadDailyNutrition(localDate(),false);await chooseDay(currentDay,true);await renderHistory();setSaveStatus('備份已還原');alert('還原完成，既有其他紀錄會保留。')
 }catch(error){alert('還原失敗：'+error.message)}
}
async function resetAll(){
 if(!confirm('確定清除本裝置全部訓練、飲食與設定？此動作無法復原。'))return;
 clearTimeout(saveTimer);saveTimer=null;await draftSaveChain.catch(()=>{});for(const store of ['workouts','drafts','settings'])await dbClear(store);nutritionLoaded=false;currentDraftKey='';workoutStartedAt=null;sessionMeta={sessionId:'',workoutId:'',completedAt:null,durationMinutes:null};await loadWeeklyWeightPlans();await loadDailyNutrition(localDate(),false);await chooseDay(scheduledDay(),true);await renderHistory();setSaveStatus('本機資料已清除');
}
function metroClick(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.12,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.08);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.08)}
function writeWavText(view,offset,text){for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i))}
function makeMetronomeWav(){
 const sampleRate=44100,seconds=30,frames=sampleRate*seconds,samples=new Float32Array(frames);
 for(let beat=0;beat<seconds;beat++){
  const accent=beat%5===0,frequency=accent?660:880,gain=accent?.72:.38,length=Math.round(sampleRate*(accent?.12:.08)),start=beat*sampleRate;
  for(let i=0;i<length;i++){const envelope=Math.exp(-i/(sampleRate*(accent?.038:.026))),attack=Math.min(1,i/(sampleRate*.003));samples[start+i]+=Math.sin(2*Math.PI*frequency*i/sampleRate)*gain*envelope*attack}
 }
 const buffer=new ArrayBuffer(44+frames*2),view=new DataView(buffer);writeWavText(view,0,'RIFF');view.setUint32(4,36+frames*2,true);writeWavText(view,8,'WAVE');writeWavText(view,12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);writeWavText(view,36,'data');view.setUint32(40,frames*2,true);
 for(let i=0;i<frames;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);
 return new Blob([buffer],{type:'audio/wav'});
}
function ensureMetroAudio(){
 if(metroAudio)return metroAudio;
 metroAudioUrl=URL.createObjectURL(makeMetronomeWav());metroAudio=new Audio(metroAudioUrl);metroAudio.id='metroAudioEngine';metroAudio.loop=true;metroAudio.preload='auto';metroAudio.playsInline=true;metroAudio.setAttribute('playsinline','');metroAudio.setAttribute('aria-hidden','true');metroAudio.style.display='none';document.body.appendChild(metroAudio);metroAudio.load();
 ['pause','ended','stalled','abort'].forEach(type=>metroAudio.addEventListener(type,()=>{if(metroRunning)scheduleMetroRecovery(type==='ended'||type==='abort')}));
 metroAudio.addEventListener('error',()=>{if(metroRunning)scheduleMetroRecovery(true)});
 if('mediaSession'in navigator){try{if('MediaMetadata'in window)navigator.mediaSession.metadata=new MediaMetadata({title:'60 BPM｜5 拍訓練節拍器',artist:'Training System',album:'第 1 拍重音'});navigator.mediaSession.setActionHandler('play',startMetro);navigator.mediaSession.setActionHandler('pause',stopMetro);navigator.mediaSession.setActionHandler('stop',stopMetro)}catch(e){console.debug('Media Session unavailable',e)}}
 return metroAudio;
}
function updateMetroVisual(){const beat=metroAudio&&metroRunning?Math.floor((metroAudio.currentTime+.04)%5)+1:1,display=$('#metroBeat');if(display.textContent!==`${beat}／5`)display.textContent=`${beat}／5`;display.classList.toggle('accent',metroRunning&&beat===1)}
function scheduleMetroRecovery(restart=false){clearTimeout(metroRecoveryTimer);metroRecoveryTimer=setTimeout(()=>recoverMetro(restart),180)}
async function recoverMetro(restart=false){
 if(!metroRunning||metroRecovering||!metroAudio)return;metroRecovering=true;
 try{if(restart||metroAudio.ended){try{metroAudio.currentTime=0}catch(e){}}await metroAudio.play();metroLastTime=metroAudio.currentTime;metroStallChecks=0;if('mediaSession'in navigator)try{navigator.mediaSession.playbackState='playing'}catch(e){}}
 catch(error){if(metroRunning)metroRecoveryTimer=setTimeout(()=>recoverMetro(restart),1000)}finally{metroRecovering=false}
}
function startMetroWatchdog(){
 clearInterval(metroWatchdog);metroLastTime=metroAudio?.currentTime??-1;metroStallChecks=0;
 metroWatchdog=setInterval(()=>{if(!metroRunning||!metroAudio)return;const now=metroAudio.currentTime;if(metroAudio.paused||metroAudio.ended){scheduleMetroRecovery(metroAudio.ended);return}if(Math.abs(now-metroLastTime)<.03)metroStallChecks++;else metroStallChecks=0;metroLastTime=now;if(metroStallChecks>=2)scheduleMetroRecovery(true)},1000);
}
async function startMetro(){
 const audio=ensureMetroAudio();clearTimeout(metroRecoveryTimer);metroRunning=true;try{audio.currentTime=0}catch(e){}
 try{await audio.play();$('#metro').classList.add('running');$('#metroBtn').textContent='停止';clearInterval(metroTimer);metroTimer=setInterval(updateMetroVisual,120);startMetroWatchdog();updateMetroVisual();if('mediaSession'in navigator)try{navigator.mediaSession.playbackState='playing'}catch(e){}}
 catch(error){metroRunning=false;alert('瀏覽器阻擋音訊播放，請再按一次「開始」。')}
}
function stopMetro(){metroRunning=false;metroRecovering=false;clearTimeout(metroRecoveryTimer);metroRecoveryTimer=null;clearInterval(metroWatchdog);metroWatchdog=null;if(metroAudio){metroAudio.pause();try{metroAudio.currentTime=0}catch(e){}}clearInterval(metroTimer);metroTimer=null;$('#metro').classList.remove('running');$('#metroBtn').textContent='開始';updateMetroVisual();if('mediaSession'in navigator)try{navigator.mediaSession.playbackState='paused'}catch(e){}}
function toggleMetro(){if(metroRunning)stopMetro();else startMetro()}
async function resumeMetroIfNeeded(){if(metroRunning&&metroAudio?.paused){try{await metroAudio.play()}catch(e){console.debug('Background audio resume requires interaction',e)}}updateMetroVisual()}
function resetRestButton(button){if(!button)return;button.classList.remove('running','done');button.textContent=`休息 ${button.dataset.restSeconds} 秒`}
function startRestTimer(seconds,button){
 if(restTimer){clearInterval(restTimer);restTimer=null;if(restButton===button){resetRestButton(button);restButton=null;return}resetRestButton(restButton)}
 restButton=button;const deadline=Date.now()+seconds*1000;button.classList.remove('done');button.classList.add('running');button.textContent=`休息中 ${seconds} 秒（取消）`;
 restTimer=setInterval(()=>{const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));if(remaining>0){button.textContent=`休息中 ${remaining} 秒（取消）`;return}clearInterval(restTimer);restTimer=null;button.classList.remove('running');button.classList.add('done');button.textContent='下一組開始 ✓';restButton=null;metroClick();setTimeout(()=>resetRestButton(button),3000)},1000);
}

function updateVisualViewportOffset(){const vv=window.visualViewport;if(!vv){document.documentElement.style.setProperty('--visual-bottom-offset','0px');return}const layoutHeight=document.documentElement.clientHeight,visualBottom=vv.offsetTop+vv.height,offset=Math.max(0,Math.round(layoutHeight-visualBottom));document.documentElement.style.setProperty('--visual-bottom-offset',`${offset}px`)}
if(window.visualViewport){window.visualViewport.addEventListener('resize',updateVisualViewportOffset);window.visualViewport.addEventListener('scroll',updateVisualViewportOffset)}
window.addEventListener('resize',updateVisualViewportOffset);window.addEventListener('orientationchange',()=>setTimeout(updateVisualViewportOffset,150));
document.addEventListener('visibilitychange',resumeMetroIfNeeded);window.addEventListener('pageshow',resumeMetroIfNeeded);window.addEventListener('focus',resumeMetroIfNeeded);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshStreak().catch(console.error)});window.addEventListener('pageshow',()=>refreshStreak().catch(console.error));

document.addEventListener('click',e=>{
 const tab=e.target.closest('.tab');if(tab){if(tab.dataset.view==='todayView'&&currentSummaryWorkout?.id!==sessionMeta.workoutId){$('#summaryPanel').classList.add('hidden');$('#workoutPanel').classList.remove('hidden')}setView(tab.dataset.view).catch(error=>setSaveStatus('頁面切換尚未完成',true))}
 const dayButton=e.target.closest('.day-pill');if(dayButton)chooseDay(dayButton.dataset.day).catch(error=>{setSaveStatus('儲存失敗・請保留畫面',true);showTrainingNotice(error.message)});
 if(e.target.closest('[data-sync-streak]')){syncStreakToWidget();return}
 const rest=e.target.closest('[data-rest-seconds]');if(rest){startRestTimer(number(rest.dataset.restSeconds),rest);return}
 const deleteButton=e.target.closest('[data-delete-photo]');
 if(deleteButton){
  const meal=deleteButton.dataset.photoMeal,id=deleteButton.dataset.deletePhoto;
  mealPhotos[meal]=(mealPhotos[meal]||[]).filter(photo=>photo.id!==id);
  renderMealPhotoPreviews();saveDraft().catch(console.error);
 }
});
$('#metroBtn').addEventListener('click',toggleMetro);$('#finishBtn').addEventListener('click',finishWorkout);$('#copyBtn').addEventListener('click',copyReport);$('#shareReportBtn').addEventListener('click',()=>shareReportWithPhotos());$('#downloadReportBtn').addEventListener('click',()=>downloadReportPackage());$('#backWorkoutBtn').addEventListener('click',()=>backToWorkout().catch(console.error));$('#exportBtn').addEventListener('click',exportData);$('#importFile').addEventListener('change',e=>e.target.files[0]&&importData(e.target.files[0]));$('#resetBtn').addEventListener('click',resetAll);
$('#copyWidgetBtn')?.addEventListener('click',copyWidgetProgram);$('#newWorkoutBtn')?.addEventListener('click',startNewWorkout);
window.addEventListener('load',async()=>{
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').then(reg=>reg.update()).catch(()=>{});
 try{
  updateVisualViewportOffset();await openDB();await loadCurriculum();await setView(localStorage.getItem('activeView')||'todayView');
  $('#fatal').classList.add('hidden');preloadWidgetSource().catch(console.error);
 }catch(error){
  console.error(error);const box=$('#fatal');box.classList.remove('hidden');
  box.textContent='網頁尚未完成載入。請確認更新包所有檔案都已發布，再重新整理；訓練紀錄不需清除。'+(error.message?'（'+error.message+'）':'');
 }
});
