/* Push only: deliberately no fetch interception or cached school data. */
self.addEventListener('push',event=>{
 event.waitUntil(self.registration.showNotification('SchoolShield',{body:'You have new school activity. Open SchoolShield to review it.',tag:'schoolshield-activity',icon:new URL('assets/schoolshield-logo.png',self.registration.scope).href}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL('notifications.html',self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const client=clients.find(c=>c.url===target);if(client)return client.focus();return self.clients.openWindow(target);}));
});
