// 氛围装饰层 #decor：用图片（assets/atmosphere 里有全部素材的备份）。克制：
// 登录页 = 底部彼岸花丛 + 一层淡雾 + 一朵骨花；其余深色页（大屏等）只留底部一条花丛。
// 位于鬼火画布之下、所有面板之下；面板不透明，装饰只会出现在空白处。
(()=>{
const el=document.getElementById('decor');if(!el)return;
const img=(src,cls)=>'<img src="img/'+src+'.webp" alt="" decoding="async"'+(cls?' class="'+cls+'"':'')+'>';
// 花丛带：同一张图左右镜像拼接，接缝处天然连续
const tiles=Array.from({length:18},(_,i)=>img('lily-strip',i%2?'fl':'')).join('');
el.innerHTML='<div class="dc-fog">'+img('fog')+'</div>'+img('bone-flower','dc-bone')+'<div class="dc-lilies">'+tiles+'</div>';
})();
