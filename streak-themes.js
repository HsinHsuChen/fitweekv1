/* 共用於網頁、推播與 Scriptable；以同一訓練日選色，避免各自隨機。 */
(function(root){
 'use strict';
 const S=root.FitWeekStreak||(typeof module==='object'&&module.exports?require('./streak.js'):null);
 const themes=[
 {id:'ember',name:'暖橘',emoji:'🟠',bg:['1b1713','3a1d12'],flame:['ec4a1f','ffb02e','fff1a8'],glow:'ff8a1f',active:'每次累積，都算進步',rest:'休息充電，下次再出發',idle:'新的開始，一樣值得',title:'e8cdb4',num:'fff8ee',msg:'f6e6d4',sub:'c9a98f',sync:'a98c76'},
 {id:'purple',name:'紫色',emoji:'🟣',bg:['170a2a','3b1566'],flame:['8b3df0','c27bff','f6eaff'],glow:'a855f7',active:'一步一步，靠近目標',rest:'留點餘力，走得更遠',idle:'從這一次，重新出發',title:'d9c2f2',num:'fbf5ff',msg:'eddcfa',sub:'bfa3dc',sync:'a78bc4'},
 {id:'blue',name:'藍色',emoji:'🔵',bg:['0a1624','0f3252'],flame:['1f6fe5','4fc3ff','e8fbff'],glow:'38b6ff',active:'照著自己的節奏前進',rest:'放慢腳步，好好恢復',idle:'找回節奏，再次開始',title:'b8d9f0',num:'f4fbff',msg:'dcefff',sub:'93b9d6',sync:'7ea3c0'},
 {id:'green',name:'青綠',emoji:'🟢',bg:['0a1a14','10402f'],flame:['16a35c','5eea8f','ebfff2'],glow:'3ddc84',active:'穩穩練習，慢慢變強',rest:'恢復，也是進步的一部分',idle:'重新扎根，慢慢累積',title:'b5dcc7',num:'f3fff8',msg:'d9f5e5',sub:'8fbfa5',sync:'79a58e'},
 {id:'rose',name:'暖紅',emoji:'🔴',bg:['1f0a14','4a1330'],flame:['e0356b','ff7ca8','fff0f5'],glow:'ff5c8a',active:'願意開始，就很棒了',rest:'照顧自己，也算努力',idle:'給自己一個新的開始',title:'efc0d1',num:'fff5f8',msg:'fadce7',sub:'cc9bb0',sync:'b3869a'}
 ];
 function themeAt(now=Date.now()){const index=Math.floor((S.windowStart(now)+8*3600000)/S.DAY_MS);return themes[((index%themes.length)+themes.length)%themes.length]}
 function presentation(events,now=Date.now()){
  const state=S.calculate(events,now),start=S.windowStart(now),theme=themeAt(now);
  const completed=(Array.isArray(events)?events:[]).some(e=>e&&Number.isFinite(e.startedAt)&&e.startedAt>=start&&e.startedAt<=now&&S.calculate([e],now).lastStartedAt===e.startedAt);
  const rest=S.isRestWindow(now),pending=!rest&&!completed;
  const message=rest?theme.rest:state.count?theme.active:theme.idle;
  return {state,theme,completed,rest,pending,windowStart:start,windowDate:S.windowDate(now),message};
 }
 function notification(events,now=Date.now(),test=false){
  const p=presentation(events,now);
  const status=p.completed?'今日已完成':p.rest?'今天是休息日':'今天還沒運動';
  return {title:`${p.theme.emoji} 連續訓練 ${p.state.count} 次｜${status}`,body:(test?'測試通知・':'')+p.message+(p.pending?'。有空時開始，依身體狀態調整。':''),windowDate:p.windowDate,createdAt:now,test};
 }
 const api={themes,themeAt,presentation,notification};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.FitWeekThemes=api;
})(typeof globalThis==='object'?globalThis:this);
