import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'

test('push cliente: no pide permiso solo, detecta revocación y respeta Ahora no',async()=>{
  const original={document:globalThis.document,window:globalThis.window,Notification:globalThis.Notification,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')}
  const nodes=new Map(),listeners={}
  const publicKey=crypto.randomBytes(65).toString('base64url')
  const bytes=Uint8Array.from(Buffer.from(publicKey,'base64url'))
  let nativeRequests=0,record={permission:'granted',enabled:true,promptAfter:0,checkedAt:Date.now()}
  let sub={options:{applicationServerKey:bytes.buffer},toJSON:()=>({endpoint:'https://fcm.googleapis.com/test'}),unsubscribe:async()=>{sub=null;return true}}
  const reg={pushManager:{getSubscription:async()=>sub,subscribe:async()=>{throw new Error('No se debe llamar al proveedor en esta prueba')}}}
  globalThis.document={hidden:false,getElementById:(id)=>nodes.get(id)||null,addEventListener:()=>{},createElement:()=>({setAttribute:()=>{},remove(){nodes.delete(this.id)}}),body:{appendChild:(node)=>nodes.set(node.id,node)}}
  globalThis.Notification={permission:'granted',requestPermission:()=>{nativeRequests++;globalThis.Notification.permission='granted';return Promise.resolve('granted')}}
  globalThis.window={isSecureContext:true,Notification:globalThis.Notification,PushManager:function(){},addEventListener:(name,fn)=>{listeners[name]=fn}}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{register:async()=>reg,ready:Promise.resolve(reg),getRegistration:async()=>reg,addEventListener:()=>{}}}})
  const storage=new Map()
  const oldStorage=globalThis.localStorage
  globalThis.localStorage={getItem:(key)=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}
  const {api}=await import('../webpanel/public/assets/js/api.js')
  const oldApi={...api}
  const {state}=await import('../webpanel/public/assets/js/core.js')
  const push=await import('../webpanel/public/assets/js/push.js')
  api.get=async()=>({...record,publicKey,settings:{enabled:true,promptMinutes:60}})
  api.post=async(route,body)=>{
    if(route.endsWith('/dismiss')){record.promptAfter=Date.now()+3600000;return {ok:true}}
    const wasActive=record.enabled
    record={...record,permission:body.permission,enabled:body.permission==='granted'&&Boolean(body.subscription),checkedAt:Date.now()}
    if(wasActive&&!record.enabled)record.promptAfter=0
    return {...record}
  }
  api.del=async()=>{record.enabled=false;return {ok:true}}
  state.user={id:1}
  try{
    await push.syncPush(true)
    assert.equal(nativeRequests,0);assert.equal(record.enabled,true)
    globalThis.Notification.permission='denied'
    await push.syncPush(true)
    assert.equal(record.enabled,false);assert.equal(record.permission,'denied')
    assert.ok(nodes.has('push-prompt'))
    await push.dismissPush();assert.ok(!nodes.has('push-prompt'))
    await push.syncPush(true);assert.ok(!nodes.has('push-prompt'))
    globalThis.Notification.permission='default'
    await push.enablePush();assert.equal(nativeRequests,1);assert.equal(record.enabled,true)
    await push.disablePush();assert.equal(record.enabled,false);assert.ok(!nodes.has('push-prompt'))
  }finally{
    push.stopPushClient();state.user=null;Object.assign(api,oldApi)
    globalThis.document=original.document;globalThis.window=original.window;globalThis.Notification=original.Notification
    if(original.navigator)Object.defineProperty(globalThis,'navigator',original.navigator);else delete globalThis.navigator
    if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage
  }
})
