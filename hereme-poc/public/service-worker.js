'use strict';
const allowedRoute=value=>typeof value==='string'&&(/^(?:\/|\/me|\/chat|\/chat\/[0-9a-f-]{36}|\/\?post=\d+)$/.test(value));
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  const route=allowedRoute(data.route)?data.route:'/',title=typeof data.title==='string'&&data.title.length<=80?data.title:'Ny varsling';
  const body=typeof data.body==='string'&&data.body.length<=160?data.body:'Du har en ny varsling i HerEme.';
  event.waitUntil(Promise.all([self.registration.showNotification(title,{body,icon:'/assets/pwa/icon-192.png',badge:'/assets/pwa/icon-192.png',tag:typeof data.tag==='string'?data.tag.slice(0,100):'hereme',data:{route},renotify:true}),self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>Promise.all(clients.map(client=>client.postMessage({type:'notification.created'}))))]));
});
self.addEventListener('notificationclick',event=>{event.notification.close();const route=allowedRoute(event.notification.data?.route)?event.notification.data.route:'/';event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if('navigate' in client)await client.navigate(route);return client.focus();}return self.clients.openWindow(route);})());});
