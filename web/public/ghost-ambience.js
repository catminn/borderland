// Ghost-fire ambience from the Claude Design handoff, lightened for phones: 1x canvas on the login page, 30 fps,
// no canvas blur filter, cached fog gradients; the edge vignette is drawn by CSS (body.login #amb).
(()=>{
if(customElements.get('ghost-ambience'))return;
const RM=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
const rnd=(a,b)=>a+Math.random()*(b-a);
const nz=(t,s)=>Math.sin(t*1.3+s)*.5+Math.sin(t*2.7+s*1.7)*.3+Math.sin(t*5.1+s*3.1)*.2;
const EYE_D=[[.05,.1],[.95,.12],[.04,.48],[.96,.42],[.07,.88],[.93,.9],[.18,.05],[.82,.95],[.03,.28],[.97,.7]];
const EYE_M=[[.15,.085],[.85,.1],[.14,.94],[.86,.955],[.5,.975]];

class GhostAmbience extends HTMLElement{
  static get observedAttributes(){return['data-len','data-err','data-ok','data-keep','data-top'];}
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
      this.onMove=e=>{const r=this.getBoundingClientRect();this.target={x:e.clientX-r.left,y:e.clientY-r.top};};
      this.onLeave=()=>{this.target=null;};
      this.frame.addEventListener('pointermove',this.onMove);this.frame.addEventListener('pointerleave',this.onLeave);
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
  disconnectedCallback(){cancelAnimationFrame(this.raf);this.ro&&this.ro.disconnect();this.io&&this.io.disconnect();
    if(this.frame){this.frame.removeEventListener('pointermove',this.onMove);this.frame.removeEventListener('pointerleave',this.onLeave);}}
  attributeChangedCallback(n,o,v){
    if(!this.ctx||!this.flames)return;
    if(n==='data-len')this.len=+v||0;
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
    if(this.mode==='page')return{x:rnd(.45,.97)*w,y:rnd(26,110)};
    if(this.mode==='screen'||this.mode==='login'){ // bottom-heavy: only around the content (data-keep) and below the page header (data-top)
      for(let i=0;i<40;i++){const q=this.rawSpot();if(Math.random()<.04+.96*Math.pow(q.y/h,3))return q;}
      const q=this.rawSpot();q.y=Math.max(q.y,h*rnd(.78,.96));return q;}
    if(this.mob)return{x:rnd(.1,.9)*w,y:Math.random()<.5?rnd(.07,.17)*h:rnd(.83,.92)*h};
    return{x:(Math.random()<.5?rnd(.05,.28):rnd(.72,.95))*w,y:rnd(.14,.86)*h};}
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
    const login=this.mode!=='page',n=this.mode==='screen'?(this.mob?4:9):login?(this.mob?4:9):(this.mob?2:3);
    this.flames=Array.from({length:n},(_,i)=>{const z=rnd(.3,1),size=login?(this.mob?10+z*13:13+z*19):(this.mob?9+z*8:11+z*11);
      return{...this.spot(),z,size,seed:rnd(0,100),bobA:rnd(5,13),bobS:rnd(.35,.7),swA:rnd(2,6),swS:rnd(.5,1.1),phase:'on',a:login?1:.9,timer:rnd(4,16),dip:0,lean:0,
        trail:login&&i<2?[]:null,trailT:0};}).sort((a,b)=>a.z-b.z);
    const slots=login?(this.mob?EYE_M:EYE_D):[];
    this.eyes=slots.map(([x,y])=>({nx:x,ny:y,s:rnd(.8,1.15),red:Math.random()<.35,tilt:rnd(.06,.16),state:'closed',open:0,t:0,hold:0,blink:0,lx:0,ly:0}));
    this.fog=login?Array.from({length:this.mob?2:5},()=>({x:rnd(0,1),y:rnd(.84,1.02),rx:rnd(.25,.5),ry:rnd(40,90),sp:rnd(.006,.014),a:rnd(.05,.1)})):[];
    this.paper=[];
    this.nextSpawn=rnd(1.2,2.6);
  }
  keepRect(){const k=(this.dataset.keep||'').split(',').map(Number);return k.length===4&&!k.some(isNaN)?k:null;}
  inKeep(x,y,pad=0){if(y<+(this.dataset.top||0)+pad)return true;const k=this.keepRect();if(!k)return false;
    return x>k[0]-pad&&x<k[0]+k[2]+pad&&y>k[1]-pad&&y<k[1]+k[3]+pad;}
  newPaper(y){const z=rnd(.4,1);return{x:rnd(.02,.98),y,z,vy:rnd(14,26),sw:rnd(.5,1.2),seed:rnd(0,100),rot:rnd(0,6),rs:rnd(-.9,.9),slip:Math.random()<.3};}
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
      else if(f.phase==='fade'){f.a-=dt*1.7;if(f.a<=0){f.a=0;f.phase='off';f.off=rnd(.8,2.6);}}
      else if(f.phase==='off'){f.off-=dt;if(f.off<0){Object.assign(f,this.spot());if(f.trail)f.trail=[];f.phase='in';}}
      else if(f.phase==='in'){f.a+=dt*.7;if(f.a>=1){f.a=1;f.phase='on';f.timer=rnd(6,18);}}
      if(Math.random()<dt*.18)f.dip=1;f.dip=Math.max(0,f.dip-dt*2.6);
    }
    for(const f of this.flames)if(f.trail){f.trailT+=dt;if(f.trailT>.09&&f.a>.2){f.trailT=0;f.trail.push({x:f.cx||f.x,y:(f.tip||f.y),a:.9*f.a});if(f.trail.length>22)f.trail.shift();}
      for(const p of f.trail){p.y-=16*dt;p.x+=Math.sin(t*1.7+p.y*.05)*6*dt;p.a-=dt*.45;}f.trail=f.trail.filter(p=>p.a>0);}
    for(const p of this.paper){p.y+=p.vy*(.5+.5*p.z)*dt/h;p.x+=Math.sin(t*p.sw+p.seed)*.018*dt;p.rot+=p.rs*dt;if(p.y>1.06)Object.assign(p,this.newPaper(-.05));}
    for(const b of this.fog){b.x+=b.sp*dt;if(b.x-b.rx>1)b.x=-b.rx;}
    if(this.mode==='page')return;
    let gx=this.target?this.target.x:w/2,gy=this.target?this.target.y:h*.56;
    if(this.okMode){const k=this.okT;gx=cx;gy=cy;
      for(const e of this.eyes){e.open=k<2.3?Math.min(1,e.open+dt/.15):Math.max(0,e.open-dt/.25);}
    }else if(this.errMode){this.errT+=dt;const e2=this.errT;gx=cx;gy=cy;
      for(const e of this.eyes){e.open=e2<.25?Math.min(1,e.open+dt/.18):e2<2.4?1:Math.max(0,e.open-dt/.25);}
      if(e2>2.7){this.errMode=false;this.eyes.forEach(e=>{e.state='closed';e.open=0;});this.nextSpawn=rnd(1.5,3);}
    }else{
      const openCount=this.eyes.filter(e=>e.state!=='closed').length;
      const maxOpen=Math.min(this.eyes.length,(this.mob?1:2)+Math.floor(this.len/(this.mob?3:2)));
      this.nextSpawn-=dt;
      if(this.nextSpawn<0&&openCount<maxOpen){const c=this.eyes.filter(e=>e.state==='closed');
        const c2=c.filter(e=>!this.inKeep(e.nx*w,e.ny*h,30));
        if(c2.length){const e=c2[Math.floor(Math.random()*c2.length)];e.state='opening';e.t=0;e.hold=rnd(1.6,3.4);e.blink=rnd(.5,e.hold-.4);e.lx=0;e.ly=0;}
        this.nextSpawn=rnd(2.6,5.5)/(1+this.len*.3);}
      for(const e of this.eyes){
        if(e.state==='opening'){e.open+=dt;if(e.open>=1){e.open=1;e.state='open';e.t=0;}}
        else if(e.state==='open'){e.t+=dt;const b=e.t-e.blink;e.open=b>0&&b<.2?Math.abs(b-.1)/.1:1;if(e.t>e.hold)e.state='closing';}
        else if(e.state==='closing'||e.state==='stare'){e.open-=dt;if(e.open<=0){e.open=0;e.state='closed';}}
      }
    }
    for(const e of this.eyes){if(e.open<=0)continue;const ex=e.nx*w,ey=e.ny*h,dx=gx-ex,dy=gy-ey,d=Math.hypot(dx,dy)||1,sp=this.okMode||this.errMode?6:1.6;
      e.lx+=(dx/d-e.lx)*Math.min(1,dt*sp);e.ly+=(dy/d-e.ly)*Math.min(1,dt*sp);}
  }
  drawFlame(f,t){
    const c=this.ctx,page=this.mode==='page'||this.dataset.tone==='light',br=(.78+.22*nz(t*2.2,f.seed))*(1-.75*f.dip);
    const cx=f.x+Math.sin(t*f.swS+f.seed)*f.swA+nz(t*1.1,f.seed+3)*2,by=f.y+Math.sin(t*f.bobS+f.seed)*f.bobA;
    const r=f.size*.36*(1+.08*nz(t*6,f.seed)),hg=f.size*1.55*(1+.16*nz(t*4.3,f.seed+5));
    const tdx=nz(t*3.2,f.seed+9)*r*.7+(f.lean||0)*Math.sign(this.w/2-cx)*r*1.8;
    f.cx=cx+tdx;f.tip=by-hg;
    const A=f.a*(page?.6:(.45+.55*f.z))*br;if(A<=.01)return;
    c.save();c.globalAlpha=A;
    const hr=f.size*(page?1.6:2.1),halo=c.createRadialGradient(cx,by-hg*.25,0,cx,by-hg*.25,hr);
    halo.addColorStop(0,page?'rgba(11,118,88,.18)':'rgba(80,220,195,.3)');halo.addColorStop(.5,page?'rgba(11,118,88,.06)':'rgba(60,160,210,.1)');halo.addColorStop(1,'rgba(40,120,200,0)');
    c.fillStyle=halo;c.beginPath();c.arc(cx,by-hg*.25,hr,0,Math.PI*2);c.fill();
    c.shadowColor=page?'rgba(11,118,88,.55)':'rgba(110,240,210,.9)';c.shadowBlur=page?8:10+f.z*8;
    const wr=1+.12*nz(t*5.3,f.seed+11),wl=1+.12*nz(t*4.7,f.seed+17);
    c.beginPath();c.moveTo(cx+tdx,by-hg);
    c.bezierCurveTo(cx+r*1.15*wr,by-hg*.45,cx+r*1.05*wr,by+r*.25,cx,by+r);
    c.bezierCurveTo(cx-r*1.05*wl,by+r*.25,cx-r*1.15*wl,by-hg*.45,cx+tdx,by-hg);
    const g=c.createRadialGradient(cx,by-r*.15,0,cx,by-hg*.3,hg*.95);
    if(page){g.addColorStop(0,'rgba(230,255,246,.95)');g.addColorStop(.25,'rgba(70,205,165,.8)');g.addColorStop(.6,'rgba(11,118,88,.5)');g.addColorStop(1,'rgba(20,80,130,0)');}
    else{g.addColorStop(0,'rgba(255,255,255,.97)');g.addColorStop(.16,'rgba(205,255,240,.92)');g.addColorStop(.4,'rgba(80,225,190,.78)');g.addColorStop(.72,'rgba(40,115,205,.45)');g.addColorStop(1,'rgba(30,50,160,0)');}
    c.fillStyle=g;c.fill();
    c.restore();
  }
  drawPaper(p,t){const c=this.ctx,x=p.x*this.w,y=p.y*this.h,s=8+p.z*7;c.save();c.translate(x,y);c.rotate(p.rot);c.scale(Math.cos(t*1.1+p.seed),1);
    c.globalAlpha=.22+.36*p.z;
    if(p.slip){c.fillStyle='#d6c68c';c.fillRect(-s*.55,-s*.85,s*1.1,s*1.7);c.fillStyle='rgba(150,40,25,.55)';c.fillRect(-s*.25,-s*.3,s*.5,s*.5);}
    else{c.fillStyle='#d8cfa8';c.beginPath();c.arc(0,0,s,0,Math.PI*2);c.rect(-s*.33,-s*.33,s*.66,s*.66);c.fill('evenodd');}
    c.restore();}
  draw(){
    const c=this.ctx,w=this.w,h=this.h,t=this.t,k=this.okMode?this.okT:-1;c.clearRect(0,0,w,h);
    c.save();
    if(k>.58&&k<.9){const a=(1-(k-.58)/.32)*3.2;c.translate(Math.sin(k*95)*a,Math.cos(k*80)*a*.6);}
    for(const b of this.fog){const R=b.rx*w;if(!b.g||b.gw!==w){b.g=c.createRadialGradient(0,0,0,0,0,R);b.g.addColorStop(0,`rgba(150,190,182,${b.a})`);b.g.addColorStop(1,'rgba(150,190,182,0)');b.gw=w;}
      c.save();c.translate(b.x*w,b.y*h);c.scale(1,b.ry/R);c.fillStyle=b.g;c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.fill();c.restore();}
    for(const p of this.paper)this.drawPaper(p,t);
    for(const f of this.flames)if(f.trail)for(const p of f.trail){const rr=4+(1-p.a)*12;
      c.fillStyle=`rgba(150,185,185,${(.07*p.a).toFixed(3)})`;c.beginPath();c.arc(p.x,p.y,rr,0,Math.PI*2);c.fill();}
    for(const f of this.flames)this.drawFlame(f,t);
    c.restore();
    if(this.mode==='screen'&&this.dataset.tone!=='light')for(const e of this.eyes)if(e.open>.01)this.drawEyes(e);
    if(this.mode==='login'){
      if(k>=0){c.fillStyle=`rgba(0,0,0,${Math.min(.5,k/.3*.5).toFixed(3)})`;c.fillRect(0,0,w,h);}
      for(const e of this.eyes)if(e.open>.01)this.drawEyes(e);}
  }
  drawEyes(e){
    const c=this.ctx,x=e.nx*this.w,y=e.ny*this.h,k=e.s*(this.mob?.82:1),ew=27*k,gap=18*k,eh=ew*.32*e.open;
    const col=e.red?['#ff8a5c','#8a2414','rgba(255,90,50,.75)']:['#f6dc86','#a87a22','rgba(240,200,90,.75)'];
    [-1,1].forEach(sd=>{const ex=x+sd*(gap/2+ew/2);c.save();c.translate(ex,y);c.rotate(sd*-e.tilt);
      c.beginPath();c.moveTo(-ew/2,0);c.quadraticCurveTo(0,-eh*1.25,ew/2,0);c.quadraticCurveTo(0,eh*1.25,-ew/2,0);c.closePath();
      c.shadowColor=col[2];c.shadowBlur=20;c.globalAlpha=Math.min(1,e.open*1.5)*.92;
      const g=c.createRadialGradient(0,0,0,0,0,ew*.6);g.addColorStop(0,col[0]);g.addColorStop(1,col[1]);c.fillStyle=g;c.fill();
      c.shadowBlur=0;c.clip();c.fillStyle='#120806';c.beginPath();c.ellipse(e.lx*ew*.26,e.ly*eh*.35,ew*.075,Math.max(.5,eh*.92),0,0,Math.PI*2);c.fill();c.restore();});
  }
  drawStatic(){if(!this.flames)return;const c=this.ctx;c.clearRect(0,0,this.w,this.h);this.flames.forEach(f=>{f.a=this.okMode?0:1;f.dip=0;f.lean=0;this.drawFlame(f,0);});}
}
customElements.define('ghost-ambience',GhostAmbience);
})();
