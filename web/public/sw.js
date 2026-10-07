// 离线重开用的缓存（不缓存 /api/）。
// 页面文件：网络优先（3 秒超时），失败、超时或服务器返回错误页时用上次缓存的版本；平时每次联网都会刷新缓存，所以改了代码不会被旧缓存挡住。
// 字体和图片：缓存优先。游戏状态不在这里，由 app.js 存在 localStorage。
const V='bd-v1';
const CORE=['/','/index.html','/fonts.css','/style.css','/paper.css','/app.js','/rules.js','/offline-sheet.js','/ghost-ambience.js','/img/seal-zhun.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(V).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

// 缓存的键只用路径（去掉 ?pin= 等参数，避免把 PIN 存进缓存）。
const keyOf=u=>new Request(u.origin+u.pathname);
const store=async(u,res)=>{if(res&&res.status===200&&res.type==='basic'){try{await (await caches.open(V)).put(keyOf(u),res.clone());}catch(e){/* 空间不足：忽略 */}}return res;};

self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||r.headers.has('range'))return;
  const heavy=/^\/(fonts|img)\//.test(u.pathname);
  e.respondWith((async()=>{
    const hit=await caches.match(keyOf(u));
    if(heavy&&hit)return hit;
    try{
      // 有缓存才设超时（慢网下尽快回退）；没有缓存就老实等网络，别把大字体文件掐断。
      const res=hit?await Promise.race([fetch(r),new Promise((_,no)=>setTimeout(no,3000))]):await fetch(r);
      if(res.ok)return await store(u,res);
      if(hit)return hit;
      return res;
    }catch(err){
      if(hit)return hit;
      if(r.mode==='navigate'){const home=await caches.match(keyOf(new URL('/',u.origin)));if(home)return home;}
      throw err;
    }
  })());
});
