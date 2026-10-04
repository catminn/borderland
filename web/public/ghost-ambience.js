// Ghost-fire ambience from the Claude Design handoff, lightened for phones: 1x canvas on the login page, 30 fps,
// no procedural smoke or trails; the edge vignette is drawn by CSS (body.login #amb).
(()=>{
if(customElements.get('ghost-ambience'))return;
const RM=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
const rnd=(a,b)=>a+Math.random()*(b-a);
const nz=(t,s)=>Math.sin(t*1.3+s)*.5+Math.sin(t*2.7+s*1.7)*.3+Math.sin(t*5.1+s*3.1)*.2;
const EYE_D=[[.082,.085,1.1],[.26,.061,.7],[.463,.11,.8],[.735,.053,.9],[.919,.103,1.2],[.971,.481,.7],[.835,.28,.6],[.3,.22,.8],[.64,.2,.7],[.04,.3,.8],[.17,.17,.7]]; // upper part of the page only (above the fog)
const EYE_M=[[.12,.055,.8],[.5,.04,.6],[.88,.06,.85],[.28,.115,.75],[.74,.12,.7],[.5,.145,.55]];

const EYE_SQLR=[[-0.176,87],[-0.127,88],[-0.09,89],[-0.028,90],[0.02,91],[0.05,92],[0.094,93],[0.147,94],[0.193,95],[0.243,96]]; // squinted eyes looking left..right: [pupil x, frame]
const FL={fw:80,fh:202,cols:12,ok:false,img:new Image()};FL.img.onload=()=>{FL.ok=true;};FL.img.src='img/flames.webp?v=4'; // 3 ghost-flame forms (40-frame loops) + their matching dissolve clips
const FL_DIS_BASE=[120,134,158],FL_DIS_N=[14,24,24];
const EYE_GAZE=[[-0.019,0.152,21],[0.046,-0.104,22],[-0.228,0.081,23],[0.161,0.158,24],[0.032,0.027,25],[-0.144,0.162,26],[-0.107,0.066,27],[0.11,0.085,28],[0.069,0.183,29],[-0.048,0.23,30],[-0.042,-0.019,31],[-0.028,0.086,32],[0.041,0.1,33],[-0.076,0.121,34],[-0.091,0.189,35],[-0.037,0.038,36],[0.001,0.208,37],[-0.185,0.13,38],[-0.183,0.056,39],[0.072,0.137,40],[-0.126,0.117,41],[-0.04,0.189,42],[0.115,0.149,43],[0.14,0.193,44],[0.003,0.0,45],[-0.068,0.087,46],[-0.069,0.156,47],[-0.014,0.119,48],[0.032,0.139,49],[-0.075,0.036,50],[-0.183,0.162,51],[0.093,0.056,52],[0.056,0.071,53],[-0.132,0.045,54],[-0.007,0.064,55],[0.099,0.193,56],[-0.012,0.179,57],[0.016,0.115,58],[0.154,0.133,59],[-0.05,0.137,60]];const EYE_GC=[-0.021,0.144,0.194,0.168]; // gaze table: [pupil x, pupil y, frame] + centre/half-range
const EYE_ATLAS={fw:256,fh:119,ok:false,img:new Image()};EYE_ATLAS.img.onload=()=>{EYE_ATLAS.ok=true;};EYE_ATLAS.img.src='img/eyes.webp';

class GhostAmbience extends HTMLElement{
  static get observedAttributes(){return['data-len','data-err','data-ok','data-keep','data-top','data-tone'];}
  // Light pages: paper money drifting down at a slant. Dark pages and login: ghost fire rising from below.
  get light(){return this.mode!=='login'&&this.dataset.tone==='light';}
  connectedCallback(){
    this.style.cssText='position:absolute;inset:0;display:block;pointer-events:none;overflow:hidden';
    if(!this.cv){this.cv=document.createElement('canvas');this.cv.style.cssText='width:100%;height:100%;display:block';this.appendChild(this.cv);}
    this.ctx=this.cv.getContext('2d');
    this.mode=this.dataset.mode||'login';
    this.len=+(this.dataset.len||0);
    this.t=0;this.visible=true;this.okMode=false;this.errMode=false;
    this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(this);
    this.io=new IntersectionObserver(es=>{this.visible=es[0].isIntersecting;});this.io.observe(this);
    this.frame=this.closest('[data-ga-frame]');
    if(this.frame){
      this.onMove=e=>{const r=this.getBoundingClientRect();this.target={x:e.clientX-r.left,y:e.clientY-r.top};this.lastMove=this.t;this.nextSpawn=Math.min(this.nextSpawn,.25);};
      this.onLeave=e=>{if(e.pointerType!=='touch')this.target=null;}; // a finger lifts off, but the eyes keep looking at where it was
      this.frame.addEventListener('pointermove',this.onMove);this.frame.addEventListener('pointerdown',this.onMove);this.frame.addEventListener('pointerleave',this.onLeave);
    }
    if(this.mode!=='login'){ // a flame dissolves when the pointer passes over it, or a tap lands on it
      this.onPtr=e=>{if(e.type==='pointermove'&&e.pointerType==='touch')return;const r=this.getBoundingClientRect();this.hit={x:e.clientX-r.left,y:e.clientY-r.top,tap:e.type==='pointerdown'};};
      addEventListener('pointermove',this.onPtr,{passive:true});addEventListener('pointerdown',this.onPtr,{passive:true});
    }
    this.reduced=RM.matches;
    this.resize();
    if(this.reduced)return;
    this.last=performance.now();
    const minDt=this.mode==='page'?0:1/31;
    this.loop=now=>{this.raf=requestAnimationFrame(this.loop);const raw=(now-this.last)/1000;if(raw<minDt)return;
      const dt=Math.min(.05,raw);this.last=now;
      if(this.visible&&this.w>0&&this.flames&&!document.hidden){this.t+=dt;this.update(dt);this.draw();}};
    this.raf=requestAnimationFrame(this.loop);
  }
  disconnectedCallback(){removeEventListener('pointermove',this.onPtr);removeEventListener('pointerdown',this.onPtr);cancelAnimationFrame(this.raf);this.ro&&this.ro.disconnect();this.io&&this.io.disconnect();
    if(this.frame){this.frame.removeEventListener('pointermove',this.onMove);this.frame.removeEventListener('pointerdown',this.onMove);this.frame.removeEventListener('pointerleave',this.onLeave);}}
  attributeChangedCallback(n,o,v){
    if(!this.ctx||!this.flames)return;
    if(n==='data-len')this.len=+v||0;
    if(n==='data-tone'&&v!==o){this.init();if(this.reduced)this.drawStatic();return;}
    if((n==='data-keep'||n==='data-top')&&v!==o)this.flames.forEach(f=>{if(this.inKeep(f.x,f.y,8))Object.assign(f,this.spot());});
    if(n==='data-err'&&o!==null&&v!==o&&v!=='0')this.triggerError();
    if(n==='data-ok'){if(v==='1'&&o!=='1')this.triggerOk();else if(v!=='1'&&o==='1'){this.okMode=false;this.init();if(this.reduced)this.drawStatic();}}
  }
  resize(){const w=this.clientWidth,h=this.clientHeight,d=Math.min(window.devicePixelRatio||1,this.mode==='page'?1.5:1);
    if(!w||!h)return;
    const mob=w<600,first=!this.flames||mob!==this.mob;
    this.w=w;this.h=h;this.mob=mob;this.cv.width=Math.round(w*d);this.cv.height=Math.round(h*d);this.ctx.setTransform(d,0,0,d,0,0);
    if(first){this.init();if(this.dataset.ok==='1'){this.okMode=true;this.okT=9;}}
    else this.flames.forEach(f=>{if(f.x>w||f.y>h)Object.assign(f,this.spot());});
    if(this.reduced)this.drawStatic();}
  spot(){const w=this.w,h=this.h;
    if(this.mode==='page')return{x:rnd(.45,.97)*w,y:h-rnd(6,30)};
    if((this.mode==='screen'||this.mode==='login')&&this.dataset.free==='1')return this.freeSpot();
    if(this.mode==='screen'||this.mode==='login'){ // bottom-heavy: only around the content (data-keep) and below the page header (data-top)
      for(let i=0;i<40;i++){const q=this.rawSpot();if(Math.random()<.04+.96*Math.pow(q.y/h,3))return q;}
      const q=this.rawSpot();q.y=Math.max(q.y,h*rnd(.78,.96));return q;}
    if(this.mob)return{x:rnd(.1,.9)*w,y:Math.random()<.5?rnd(.07,.17)*h:rnd(.83,.92)*h};
    return{x:(Math.random()<.5?rnd(.05,.28):rnd(.72,.95))*w,y:rnd(.14,.86)*h};}
  isFree(x,y){
    if(this.dataset.free!=='1')return true;
    const r=this.getBoundingClientRect();let n=document.elementFromPoint(r.left+x,r.top+y);if(!n)return true;
    for(;n&&n!==document.body&&n!==document.documentElement;n=n.parentElement){
      if(/^(H1|H2|H3|P|SPAN|B|BUTTON|LABEL|INPUT|TEXTAREA|TABLE|A)$/.test(n.tagName))return false; // NAV / HEADER are only containers: their empty space is free too
      const bg=getComputedStyle(n).backgroundColor;if(bg&&bg!=='transparent'&&!/rgba\([^)]*,\s*0\)$/.test(bg))return false;}
    return true;}
  freeSpot(){const w=this.w,h=this.h,T=Math.min(h-40,16); // anywhere no panel covers it, a little more toward the bottom
    for(let i=0;i<30;i++){const y=T+(h-T-10)*(1-Math.pow(Math.random(),1.5)),x=rnd(.03,.97)*w;if(this.isFree(x,y)&&this.isFree(x,y-24))return{x,y};}
    return{x:rnd(.03,.97)*w,y:h-rnd(6,30)};}
  rawSpot(){const w=this.w,h=this.h;
    const k=this.keepRect(),T=Math.min(h-20,+(this.dataset.top||0)),pad=12;
    if(!k)return{x:rnd(.01,.99)*w,y:rnd(T+10,h-6)};
    const bands=[[0,T,w,k[1]-pad],[0,k[1]+k[3]+pad,w,h-4],[0,Math.max(T,k[1]),k[0]-pad,k[1]+k[3]],[k[0]+k[2]+pad,Math.max(T,k[1]),w,k[1]+k[3]]]
      .map(b=>[Math.max(4,b[0]),Math.max(T+8,b[1]),Math.min(w-4,b[2]),b[3]]).filter(b=>b[2]-b[0]>6&&b[3]-b[1]>6);
    if(!bands.length)return{x:rnd(.01,.99)*w,y:rnd(T+10,h-6)};
    let a=Math.random()*bands.reduce((s,b)=>s+(b[2]-b[0])*(b[3]-b[1]),0);
    for(const b of bands){a-=(b[2]-b[0])*(b[3]-b[1]);if(a<=0)return{x:rnd(b[0],b[2]),y:rnd(b[1],b[3])};}
    const b=bands[0];return{x:rnd(b[0],b[2]),y:rnd(b[1],b[3])};}
  init(){
    const login=this.mode!=='page';
    if(this.light){this.flames=[];this.eyes=[];
      this.paper=Array.from({length:this.mode==='screen'?(this.mob?9:18):(this.mob?4:7)},()=>this.newPaper(rnd(-.1,1)));this.nextSpawn=9;return;}
    const n=this.mode==='screen'?(this.mob?3:5):login?0:(this.mob?1:2);
    this.flames=Array.from({length:n},(_,i)=>{const z=rnd(.3,1),size=login?(this.mob?10+z*13:13+z*19):(this.mob?9+z*8:11+z*11);
      return{...this.spot(),form:Math.floor(rnd(0,3)),ft:0,z,size,seed:rnd(0,100),bobA:rnd(5,13),bobS:rnd(.35,.7),swA:rnd(2,6),swS:rnd(.5,1.1),phase:'on',a:login?1:.9,timer:rnd(4,16),dip:0,lean:0,rise:this.mode==='page'?rnd(5,10):rnd(12,26)};}).sort((a,b)=>a.z-b.z);
    const slots=this.mode==='login'?(this.mob?EYE_M:EYE_D):[]; // no eyes inside the app pages for now
    this.eyes=slots.map(([x,y,s,r])=>({nx:x,ny:y,s:s?s*.85:rnd(.8,1.15),red:s?!!r:Math.random()<.35,ang:0,sq:0,dw:0,near:false,tilt:rnd(.06,.16),state:'closed',open:0,t:0,hold:0,blink:0,lx:0,ly:0}));
    if(this.mode==='login'&&this.eyes.length&&this.dataset.ok!=='1'){const n0=this.mob?3:4;const pick=[];this.eyes.slice().sort(()=>Math.random()-.5).forEach(e=>{if(pick.length<n0&&!pick.some(o=>this.eyeHit(e,o)))pick.push(e);});pick.forEach(e=>{e.state='opening';e.open=-rnd(0,.45);e.t=0;e.hold=rnd(2.5,5);e.blink=rnd(.8,e.hold-.5);});}
    this.paper=[];
    this.nextSpawn=this.mode==='login'?rnd(.9,1.8):rnd(3,8);
  }
  nearFlame(x,y){return this.flames.some(f=>f.phase!=='off'&&f.a>.05&&Math.hypot(f.x-x,f.y-f.size*2.5-y)<160);}
  eyeBox(e){const k=e.s*(this.mob?.82:1),w=150*k*.9,hh=150*k*119/256;return{x:e.nx*this.w,y:e.ny*this.h,w,h:hh};}
  eyeHit(a,b){const A=this.eyeBox(a),B=this.eyeBox(b);return Math.abs(A.x-B.x)<(A.w+B.w)/2+10&&Math.abs(A.y-B.y)<(A.h+B.h)/2+10;}
  keepRect(){const k=(this.dataset.keep||'').split(',').map(Number);return k.length===4&&!k.some(isNaN)?k:null;}
  inKeep(x,y,pad=0){if(y<+(this.dataset.top||0)+pad)return true;const k=this.keepRect();if(!k)return false;
    return x>k[0]-pad&&x<k[0]+k[2]+pad&&y>k[1]-pad&&y<k[1]+k[3]+pad;}
  newPaper(y){const z=rnd(.4,1),k=this.mode==='screen'?1.4:1;return{x:rnd(-.25,.95),y,z,vx:rnd(8,18)*k,vy:rnd(10,20)*k,swA:rnd(18,40)*k,ph:rnd(0,6.3),sw:rnd(.5,1.2),seed:rnd(0,100),rot:rnd(0,6),rs:rnd(-.9,.9),slip:Math.random()<.3};}
  triggerError(){if(this.reduced||this.mode!=='login'||this.okMode)return;this.errMode=true;this.errT=0;this.eyes.forEach(e=>{e.state='stare';});}
  triggerOk(){this.okMode=true;this.okT=0;this.errMode=false;}
  update(dt){
    const t=this.t,w=this.w,h=this.h,cx=w/2,cy=h/2;
    if(this.okMode)this.okT+=dt;
    for(const f of this.flames){
      if(this.okMode){const k=this.okT;
        {if(!f.sc){f.sc=1;const dx=f.x-cx,dy=f.y-cy,d=Math.hypot(dx,dy)||1,sp=rnd(380,620);f.vx=dx/d*sp;f.vy=dy/d*sp-rnd(30,80);f.lean=0;}
          f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=1-dt*1.6;f.vy*=1-dt*1.6;f.size*=1+dt*.5;f.a=Math.max(0,f.a-dt*1.3);}
        if(f.phase==='off'||f.phase==='in'){f.a=0;}
        continue;}
      if(f.phase==='on'){f.timer-=dt;if(f.timer<0)f.phase='fade';}
      else if(f.phase==='fade'){f.ft=(f.ft||0)+dt;if(f.ft>=FL_DIS_N[f.form]/8){f.ft=0;f.a=0;f.phase='off';f.off=rnd(.8,2.6);}} // plays this form's dissolve clip
      else if(f.phase==='off'){f.off-=dt;if(f.off<0){Object.assign(f,this.spot());f.form=Math.floor(rnd(0,3));f.phase='in';}}
      else if(f.phase==='in'){f.a+=dt*.7;if(f.a>=1){f.a=1;f.phase='on';f.timer=rnd(6,18);}}
      if(Math.random()<dt*.18)f.dip=1;f.dip=Math.max(0,f.dip-dt*2.6);
      if(f.rise){f.y-=f.rise*dt; // drift upward; fade out near the top or when touching the big screen's content
        const top=this.mode==='page'?16:this.mode==='login'?h*.04:this.dataset.free==='1'?10:Math.min(h-20,+(this.dataset.top||0))+12;
        if(f.phase==='on'&&(f.y-f.size<top||(this.mode==='screen'&&this.inKeep(f.x,f.y-f.size*1.5,0))))f.phase='fade';
        if(f.phase==='on'&&this.dataset.free==='1'&&(f.chk=(f.chk||rnd(0,.4))-dt)<0){f.chk=.4;if(!this.isFree(f.x,f.y-f.size))f.phase='fade';}}
    }
    if(this.hit){const H=this.hit;this.hit=null;for(const f of this.flames){if(f.phase!=='on'&&f.phase!=='in')continue;const hs=f.size*6.5,fw=hs*FL.fw/FL.fh,fx=f.cx||f.x,top=f.tip||f.y-hs*.7,bot=f.y+hs*.2,pad=H.tap?18:0;
      if(Math.abs(H.x-fx)<fw*.45+pad&&H.y>top-pad&&H.y<bot+pad){f.phase='fade';f.ft=0;}}}
    for(const p of this.paper){const sp=.5+.5*p.z,sw=Math.cos(t*p.sw+p.ph); // falling leaf: swings side to side, slows at the ends of each swing
      p.y+=p.vy*sp*(.55+.45*Math.abs(sw))*dt/h;p.x+=(p.vx*sp+sw*p.swA)*dt/w;p.rot=Math.sin(t*p.sw+p.ph)*.6+p.seed;if(p.y>1.08||p.x>1.12)Object.assign(p,this.newPaper(-.06));}
    if(this.mode==='page')return;
    let gx=this.target?this.target.x:w/2,gy=this.target?this.target.y:h*.56;
    if(this.okMode){const k=this.okT;gx=cx;gy=cy;
      for(const e of this.eyes){e.open=Math.max(0,e.open-dt/.35);if(e.open<=0)e.state='closed';} // PIN accepted: every eye shuts
    }else if(this.errMode){this.errT+=dt;const e2=this.errT;gx=cx;gy=cy;
      for(const e of this.eyes){e.open=e2<.25?Math.min(1,e.open+dt/.18):e2<2.4?1:Math.max(0,e.open-dt/.25);}
      if(e2>2.7){this.errMode=false;this.eyes.forEach(e=>{e.state='closed';e.open=0;});this.nextSpawn=rnd(1.5,3);}
    }else{
      const openCount=this.eyes.filter(e=>e.state==='opening'||e.state==='open').length;
      const active=this.lastMove!=null&&this.t-this.lastMove<2.5; // the pointer is moving: more eyes wake up to watch it
      const R=Math.min(w,h)*.4,RF=R*1.6,chase=!!(this.target&&active); // while the pointer moves, only eyes within RF of it stay lit
      if(this.target&&this.mode==='login'&&!this.okMode){const T=this.target;
        if(!this.eyes.some(e=>e.state!=='closed'&&Math.hypot(e.nx*w-T.x,e.ny*h-T.y)<R)){this.wakeNear=(this.wakeNear||0)-dt;
          if(this.wakeNear<0){this.wakeNear=.8;let best=null,bd=R*1.8;for(const e of this.eyes){if(e.state!=='closed')continue;const d=Math.hypot(e.nx*w-T.x,e.ny*h-T.y);if(d<bd&&!this.eyes.some(o=>o!==e&&o.state!=='closed'&&this.eyeHit(e,o))){bd=d;best=e;}}
            if(best){best.state='opening';best.far=0;best.dw=0;best.t=0;best.hold=rnd(3,5)*(active?1:4);best.blink=rnd(1,2.5);best.lx=0;best.ly=0;}}}}
      const calm=this.mode!=='login'; // big screen / staff / player pages: only an occasional pair, upper half, never on a flame
      const maxOpen=calm?(active?2:1):Math.min(this.eyes.length,(this.mob?2:3)+Math.floor(this.len/(this.mob?3:2))+(active?(this.mob?3:5):0)+(this.dataset.more==='1'?2:0));
      this.nextSpawn-=dt;
      if(this.nextSpawn<0&&openCount<maxOpen){const c=this.eyes.filter(e=>e.state==='closed');
        const c2=c.filter(e=>!this.inKeep(e.nx*w,e.ny*h,30)&&!this.eyes.some(o=>o!==e&&o.state!=='closed'&&this.eyeHit(e,o))&&(!calm||(e.ny<.5&&!this.nearFlame(e.nx*w,e.ny*h))));
        if(c2.length&&this.dataset.free==='1'){const e=c2[0],k=e.s*(this.mob?.82:1)*36,T=Math.min(h-40,+(this.dataset.top||0))+30;let ok=false;
          for(let i=0;i<20&&!ok;i++){const x=rnd(.06,.94)*w,y=calm?rnd(T,Math.max(T+60,h*.5)):rnd(T,h-30);if((!calm||(!this.nearFlame(x,y)&&!this.inKeep(x,y,40)))&&(!chase||Math.hypot(x-this.target.x,y-this.target.y)<RF)&&this.isFree(x,y)&&this.isFree(x-k,y)&&this.isFree(x+k,y)&&this.isFree(x-k*.5,y-9)&&this.isFree(x+k*.5,y+9)){e.nx=x/w;e.ny=y/h;ok=true;}}
          if(!ok)c2.length=0;}
        if(chase&&this.dataset.free!=='1')c2.splice(0,c2.length,...c2.filter(p=>Math.hypot(p.nx*w-this.target.x,p.ny*h-this.target.y)<RF));
        if(c2.length){let e;if(this.target&&active){const px=this.target.x;const py=this.target.y,dd=p=>Math.hypot(p.nx*w-px,p.ny*h-py);const s2=c2.slice().sort((p,q)=>dd(p)-dd(q));e=s2[Math.floor(Math.random()*Math.min(2,s2.length))];} // eyes wake up on the side the pointer is on
          else e=c2[this.dataset.free==='1'?0:Math.floor(Math.random()*c2.length)];e.state='opening';e.far=0;e.dw=0;e.t=0;e.hold=rnd(2.2,4.2)*(this.target&&!active&&!calm?4:1);e.blink=rnd(.5,e.hold-.4);e.lx=0;e.ly=0;}
        this.nextSpawn=calm?rnd(7,16)/(active?2:1):rnd(1.4,3.2)/(1+this.len*.3)/(active?4:1)*(this.target&&!active?3:1);}
      for(const e of this.eyes){
        if(e.state==='opening'){e.open+=dt*3;if(e.open>=1){e.open=1;e.state='open';e.t=0;}}
        else if(e.state==='open'){e.t+=dt;if(this.target){const dist=Math.hypot(e.nx*w-this.target.x,e.ny*h-this.target.y);e.near=dist<R;
          if(calm&&this.nearFlame(e.nx*w,e.ny*h))e.hold=Math.min(e.hold,e.t+.3);
          if(e.near&&!calm){e.hold=Math.max(e.hold,e.t+1.5);e.dw+=dt;} // the pointer is close: keep staring, and squint the longer it stays
          else{e.dw=Math.max(0,e.dw-dt*2);if(active&&dist>RF&&!e.far){e.far=1;e.hold=Math.min(e.hold,e.t+.2);}else if(!active&&!calm&&dist<RF)e.hold=Math.max(e.hold,e.t+1.5);}} // pointer resting: eyes within RF stay put instead of churning
        else{e.near=false;e.dw=0;}
        if(this.len>0&&e.sq>.1)e.hold=Math.max(e.hold,e.t+1.5); // typing a PIN: eyes that are squinting keep watching
        let b=e.t-e.blink;if(b>.2){e.blink=e.t+rnd(2.2,4.5);b=-1;}e.open=b>0&&b<.2?Math.abs(b-.1)/.1:1;if(e.t>e.hold)e.state='closing';}
        else if(e.state==='closing'||e.state==='stare'){e.open-=dt;if(e.open<=0){e.open=0;e.state='closed';}}
      }
    }
    if(this.mode==='login'&&!this.okMode&&!this.errMode){this.nextGlitch=(this.nextGlitch==null?rnd(2,4):this.nextGlitch)-dt;
      if(this.nextGlitch<0){const op=this.eyes.filter(e=>e.state==='open'&&e.open>.98&&!e.gl&&e.ang<.1);if(op.length)op[Math.floor(Math.random()*op.length)].gl={s:Math.random()<.45?'A':'B',t:0};this.nextGlitch=rnd(2.2,5);}}
    for(const e of this.eyes){if(e.gl){e.gl.t+=dt;if(e.gl.t>(e.gl.s==='A'?.72:.36)||this.errMode||this.okMode)e.gl=null;}}
    for(const e of this.eyes){const tsq=this.errMode||this.mode!=='login'?0:Math.max(Math.min(1,this.len?.25+.15*this.len:0),e.near&&e.state==='open'?Math.min(.9,Math.max(0,((e.dw||0)-1.2)/3)):0);e.sq+=(tsq-e.sq)*Math.min(1,dt*(this.errMode?12:3));}
    for(const e of this.eyes){const want=this.errMode?1:0;e.ang+=(want-e.ang)*Math.min(1,dt*(want?2.2:4));if(Math.abs(want-e.ang)<.01)e.ang=want;}
    for(const e of this.eyes){if(e.open<=0)continue;const ex=e.nx*w,ey=e.ny*h,dx=gx-ex,dy=gy-ey,d=Math.hypot(dx,dy)||1,sp=this.okMode||this.errMode?6:4;
      e.lx+=(dx/d-e.lx)*Math.min(1,dt*sp);e.ly+=(dy/d-e.ly)*Math.min(1,dt*sp);}
  }
  drawFlame(f,t){
    if(!FL.ok)return;
    const c=this.ctx,br=.88+.12*nz(t*2.2,f.seed),fadeOut=f.phase==='fade';
    const cx=f.x+Math.sin(t*f.swS+f.seed)*f.swA+nz(t*1.1,f.seed+3)*2,by=f.y+Math.sin(t*f.bobS+f.seed)*f.bobA;
    const H=f.size*6.5,W=H*FL.fw/FL.fh,ax=.58,ay=.7;
    let i;
    if(fadeOut)i=FL_DIS_BASE[f.form]+Math.min(FL_DIS_N[f.form]-1,Math.floor((f.ft||0)*8));
    else{const n=40,p=2*n-2,s=Math.floor((t+f.seed)*8)%p;i=f.form*40+(s<n?s:p-s);}
    f.cx=cx;f.tip=by-ay*H;
    const A=f.a*(.5+.5*f.z)*br*(1-.6*f.dip);if(A<=.01)return;
    c.save();c.globalAlpha=Math.min(1,A);
    c.drawImage(FL.img,(i%FL.cols)*FL.fw,Math.floor(i/FL.cols)*FL.fh,FL.fw,FL.fh,cx-ax*W,by-ay*H,W,H);
    c.restore();
  }
  drawPaper(p,t){const c=this.ctx,x=p.x*this.w,y=p.y*this.h,s=this.mode==='screen'?9+p.z*8:6+p.z*5;c.save();c.translate(x,y);c.rotate(p.rot);c.scale(.25+.75*Math.abs(Math.cos(t*.55+p.seed)),1);
    c.globalAlpha=.3+.35*p.z;c.lineWidth=1;c.strokeStyle='rgba(70,95,88,.22)';c.fillStyle='#ffffff';
    c.shadowColor='rgba(40,70,60,.12)';c.shadowBlur=4;
    c.beginPath();c.arc(0,0,s,0,Math.PI*2);c.rect(-s*.33,-s*.33,s*.66,s*.66);c.fill('evenodd');c.shadowBlur=0;c.stroke();
    c.restore();}
  draw(){
    const c=this.ctx,w=this.w,h=this.h,t=this.t,k=this.okMode?this.okT:-1;c.clearRect(0,0,w,h);
    c.save();
    if(k>.58&&k<.9){const a=(1-(k-.58)/.32)*3.2;c.translate(Math.sin(k*95)*a,Math.cos(k*80)*a*.6);}
    for(const p of this.paper)this.drawPaper(p,t);
    for(const f of this.flames)this.drawFlame(f,t);
    c.restore();
    if(this.mode==='screen'&&this.dataset.tone!=='light')for(const e of this.eyes)if(e.open>.01)this.drawEyes(e);
    if(this.mode==='login'){
      if(k>=0){c.fillStyle=`rgba(0,0,0,${Math.min(.5,k/.3*.5).toFixed(3)})`;c.fillRect(0,0,w,h);}
      for(const e of this.eyes)if(e.open>.01)this.drawEyes(e);}
  }
  // Eyes are frames from the generated cat-eye clips (img/eyes.webp: 9 blink frames closed->open, 12 cyan->red angry frames, 24 gaze frames).
  drawEyes(e){
    const A=EYE_ATLAS;if(!A.ok)return;
    const c=this.ctx,k=e.s*(this.mob?.82:1),dw=150*k,dh=dw*A.fh/A.fw,x=e.nx*this.w-dw/2,y=e.ny*this.h-dh/2;let i,sy=1;
    let jx=0;
    if(e.gl&&e.ang<.2&&e.open>.9){const G=e.gl;if(G.s==='A'){i=69+Math.min(13,Math.floor(G.t*20));}else{i=83+Math.min(3,Math.floor(G.t*12));jx=(Math.random()-.5)*6*k;}if(G.s==='A'&&G.t<.35)jx=(Math.random()-.5)*4*k;}
    else if(e.ang>.5){i=9+Math.round(e.ang*11);sy=Math.max(.05,e.open);}
    else if(e.sq>.04&&e.sq<.5&&e.open>=.98){const gx=.03+e.lx*.21;let b=1e9;i=91;for(const g of EYE_SQLR){const d=Math.abs(g[0]-gx);if(d<b){b=d;i=g[1];}}}
    else if(e.sq>.04){i=61+Math.round(e.sq*7);sy=e.open<.98?Math.max(.05,e.open):1;}
    else if(e.open<.98)i=Math.round(Math.max(0,e.open)*8);
    else if(e.ang>.02)i=9+Math.round(e.ang*11);
    else{let b=1e9;i=21;const gx=EYE_GC[0]+e.lx*EYE_GC[2],gy=EYE_GC[1]+e.ly*EYE_GC[3];
      let dc=1e9;for(const g of EYE_GAZE){const d=((g[0]-gx)/EYE_GC[2])**2+((g[1]-gy)/EYE_GC[3])**2;if(d<b){b=d;i=g[2];}if(g[2]===e.gi)dc=d;}
      if(dc<b+.04)i=e.gi;e.gi=i;}
    c.save();c.globalAlpha=Math.min(1,e.open*3)*.95;
    c.drawImage(A.img,(i%9)*A.fw,Math.floor(i/9)*A.fh,A.fw,A.fh,x+jx+(e.ang>.5?0:e.lx*(e.sq>.04?5:2.5)*k),y+dh*(1-sy)/2+(e.ang>.5?0:e.ly*(e.sq>.04?5:3)*k),dw,dh*sy);
    c.restore();
  }
  drawStatic(){if(!this.flames)return;const c=this.ctx;c.clearRect(0,0,this.w,this.h);(this.paper||[]).forEach(p=>this.drawPaper(p,0));this.flames.forEach(f=>{f.a=this.okMode?0:1;f.dip=0;f.lean=0;this.drawFlame(f,0);});}
}
customElements.define('ghost-ambience',GhostAmbience);
})();
