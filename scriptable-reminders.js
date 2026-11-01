/* Scriptable 通知介接；只操作目前網站的 FitWeek 通知。 */
async function applyFitWeekLocalReminders(value,prefs,action='sync',now=Date.now()){
 const plan=FitWeekLocalReminders.plan(value,prefs,now),pending=await Notification.allPending(),delivered=await Notification.allDelivered();
 const currentIds=new Set(plan.items.map(item=>item.id));
 const completed=value.lastStartedAt>=FitWeekStreak.windowStart(now)&&value.lastStartedAt<=now;
 const toRemove=pending.filter(n=>FitWeekLocalReminders.owned(n,plan.prefix)&&!currentIds.has(n.identifier)).map(n=>n.identifier);
 // 停用／今天已完成時，優先清除，排程失敗也不留下舊的當日催促。
 if(toRemove.length)await Notification.removePending(toRemove);
 if(!plan.settings.enabled||completed){const ids=delivered.filter(n=>FitWeekLocalReminders.owned(n,plan.prefix)).map(n=>n.identifier);if(ids.length)await Notification.removeDelivered(ids)}
 let count=0;
 for(const item of plan.items){const n=new Notification();n.identifier=item.id;n.title=item.title;n.body=item.body;n.threadIdentifier=plan.prefix;n.sound='default';n.openURL=item.websiteUrl;n.userInfo={fitweek:true,windowDate:item.windowDate};n.setTriggerDate(new Date(item.triggerAt));await n.schedule();count++}
 if(action==='test'){
  const n=new Notification(),theme=FitWeekThemes.themeAt(now),state=FitWeekStreak.display(value,now);n.identifier=plan.prefix+'test';n.title=theme.emoji+' FitWeek｜測試通知';n.body=`連續訓練 ${state.count} 次。${state.count?theme.active:theme.idle}。這是測試，不影響訓練紀錄。`;n.threadIdentifier=plan.prefix;n.sound='default';n.openURL=value.websiteUrl;n.setTriggerDate(new Date(now+10000));await n.schedule();
 }
 return {count,until:plan.until,enabled:plan.settings.enabled,time:plan.settings.time,test:action==='test'};
}
