// 静态装饰层（#decor）：雾、彼岸花丛、铜钱、红绸、骨花藤蔓。纯 SVG + CSS，位于鬼火画布下方、所有面板上方的下面。
// 只在登录页、大屏和深色全屏页显示（见 style.css）；面板是不透明的，装饰只会出现在空白处。
(()=>{
const el=document.getElementById('decor');if(!el)return;
const rng=seed=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const f=n=>Math.round(n*10)/10;

// 彼岸花：一根细茎 + 向外卷曲的花瓣 + 更长的花蕊（末端一点）
function lily(r,x,by,h,s){
  const lean=(r()-.5)*46,tx=x+lean,ty=by-h;
  let d='<path d="M'+f(x)+' '+f(by)+'Q'+f(x+lean*.15)+' '+f(by-h*.55)+' '+f(tx)+' '+f(ty)+'" class="ls"/>';
  const n=7;
  for(let k=0;k<n;k++){
    const a=-Math.PI/2+(k-(n-1)/2)*.52+(r()-.5)*.2,len=s*(24+r()*12);
    const ex=tx+Math.cos(a)*len*1.15,ey=ty+Math.sin(a)*len*.55+len*.32;
    const cx=tx+Math.cos(a)*len*.75,cy=ty+Math.sin(a)*len*.9-len*.18;
    d+='<path d="M'+f(tx)+' '+f(ty)+'Q'+f(cx)+' '+f(cy)+' '+f(ex)+' '+f(ey)+'" class="lp" style="stroke-width:'+f(1.5*s+.4)+'"/>';
  }
  for(let k=0;k<6;k++){
    const a=-Math.PI/2+(k-2.5)*.42+(r()-.5)*.16,len=s*(40+r()*16);
    const ex=tx+Math.cos(a)*len*.95,ey=ty+Math.sin(a)*len*.95+len*.1;
    const cx=tx+Math.cos(a)*len*.4,cy=ty+Math.sin(a)*len*.9-len*.35;
    d+='<path d="M'+f(tx)+' '+f(ty)+'Q'+f(cx)+' '+f(cy)+' '+f(ex)+' '+f(ey)+'" class="lt"/><circle cx="'+f(ex)+'" cy="'+f(ey)+'" r="'+f(1.5*s+.6)+'" class="ld"/>';
  }
  return d;
}

// 铜钱：圆形方孔，贴在地面，略扁
function coin(r,x,y,rad){
  const rot=r()*80-40,sq=rad*.34;
  return '<g transform="translate('+f(x)+' '+f(y)+') rotate('+f(rot)+') scale(1 '+f(.62+r()*.2)+')">'
    +'<circle r="'+f(rad)+'" class="cn"/><circle r="'+f(rad*.78)+'" class="cn2"/>'
    +'<rect x="'+f(-sq)+'" y="'+f(-sq)+'" width="'+f(sq*2)+'" height="'+f(sq*2)+'" class="ch"/></g>';
}

// 红绸：一条带高光的宽带，沿曲线铺开
function silk(path,w){
  return '<path d="'+path+'" class="sk" style="stroke-width:'+w+'"/><path d="'+path+'" class="sk2" style="stroke-width:'+f(w*.18)+'"/>';
}

// 骨花藤蔓：骨节状的枝，分叉，末端开五瓣骨白色的花
function bone(r,x0,y0,ang,len,depth){
  let d='',x=x0,y=y0,a=ang;
  const segs=Math.max(4,Math.round(len/17));
  for(let i=0;i<segs;i++){
    const l=len/segs;a+=(r()-.5)*.34+(depth?0:.05);
    const nx=x+Math.cos(a)*l,ny=y+Math.sin(a)*l;
    d+='<path d="M'+f(x)+' '+f(y)+'L'+f(nx)+' '+f(ny)+'" class="bn" style="stroke-width:'+f(Math.max(2.2,6.2-i*.5-depth*1.6))+'"/>';
    d+='<circle cx="'+f(nx)+'" cy="'+f(ny)+'" r="'+f(Math.max(2.2,4.4-i*.3-depth))+'" class="bk"/>';
    if(depth<2&&i>=1&&i<segs-1&&r()<.42)d+=bone(r,nx,ny,a+(r()<.5?-1:1)*(.7+r()*.5),len*(.5+r()*.15),depth+1);
    x=nx;y=ny;
  }
  // 末端骨花
  const fr=depth?9:15;
  for(let k=0;k<5;k++){
    const pa=a+(k-2)*.62,px=x+Math.cos(pa)*fr*1.9,py=y+Math.sin(pa)*fr*1.9;
    const lx=x+Math.cos(pa-.28)*fr*1.1,ly=y+Math.sin(pa-.28)*fr*1.1,rx=x+Math.cos(pa+.28)*fr*1.1,ry=y+Math.sin(pa+.28)*fr*1.1;
    d+='<path d="M'+f(x)+' '+f(y)+'Q'+f(lx)+' '+f(ly)+' '+f(px)+' '+f(py)+'Q'+f(rx)+' '+f(ry)+' '+f(x)+' '+f(y)+'Z" class="bp"/>';
  }
  d+='<circle cx="'+f(x)+'" cy="'+f(y)+'" r="'+f(fr*.38)+'" class="bc"/>';
  return d;
}

const r=rng(20261020);
// 底部地面：彼岸花丛 + 铜钱 + 红绸（viewBox 1600×260，底对齐）
let g='<defs><linearGradient id="dkSilk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5c0d0c"/><stop offset=".5" stop-color="#a3201b"/><stop offset="1" stop-color="#4a0a0a"/></linearGradient></defs>';
g+=silk('M-40 236C220 214 380 262 640 238S1040 214 1240 244S1520 226 1660 240',16).replace(/class="sk"/,'class="sk" stroke="url(#dkSilk)"');
for(let i=0;i<46;i++)g+=coin(r,r()*1600,150+r()*100,6+r()*5);
const xs=[];for(let i=0;i<54;i++){const x=(i+r()*.8)*(1600/54);xs.push(x);}
xs.sort(()=>r()-.5);
for(const x of xs){const dist=Math.abs(x-800)/800,h=40+r()*70+dist*38,s=.58+r()*.5;g+=lily(r,x,262+r()*8,h,s);}
const ground='<svg class="dc-ground" viewBox="0 0 1600 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">'+g+'</svg>';

// 左上 / 右上骨花藤蔓
const cr=rng(77);
const cornerL='<svg class="dc-corner l" viewBox="0 0 360 300" aria-hidden="true">'+bone(cr,-10,-8,.78,230,0)+bone(cr,-14,40,.3,150,1)+'</svg>';
const cornerR='<svg class="dc-corner r" viewBox="0 0 360 300" aria-hidden="true">'+bone(cr,370,-8,Math.PI-.78,230,0)+bone(cr,374,50,Math.PI-.3,150,1)+'</svg>';
// 右上红绸（垂挂）
const drape='<svg class="dc-drape" viewBox="0 0 220 520" preserveAspectRatio="xMaxYMin meet" aria-hidden="true"><defs><linearGradient id="dkSilk2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a0a0a"/><stop offset=".55" stop-color="#9c1d18"/><stop offset="1" stop-color="#3a0808"/></linearGradient></defs>'
  +'<path d="M172 -10C140 90 205 170 150 262S128 400 160 520L180 488L204 516C176 400 205 330 208 262S168 90 206 -10Z" fill="url(#dkSilk2)" stroke="#2a0505" stroke-width="1.2"/>'
  +'<path d="M184 -6C158 92 214 172 172 262S154 400 182 492" fill="none" stroke="rgba(255,150,130,.3)" stroke-width="3" stroke-linecap="round"/>'
  +'</svg>';

el.innerHTML='<div class="dc-fog a"></div><div class="dc-fog b"></div>'+cornerL+cornerR+drape+ground;
})();
