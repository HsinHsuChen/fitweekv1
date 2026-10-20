const CACHE='training-v2.5.0-calm-workout-ui';
const VERSION='2.5.0';
const ASSETS=['./','./index.html','./FitWeek-Streak.js','./manifest.json','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png',...['styles.css','app.js','features.js','ui.js','exercise-demos.js','weekly-weights.js','cindy.js','streak.js','curriculum.json','jszip.min.js'].map(file=>`./${file}?v=${VERSION}`)];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('training-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(event.request);
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{}));return response}
   return await caches.match(event.request)||response;
  }catch(error){const cached=await caches.match(event.request);if(cached)return cached;throw error}
 })());
});
