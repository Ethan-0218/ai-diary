// 자동 생성: docs/prototype/webview-book.html → 문자열. 원본 수정 시 재생성.
/* eslint-disable */
export const BOOK3D_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>3D Book (WebView)</title>
<!--
  ============================================================
  AI 일기 — 3D 책 (React Native WebView용 단독 컴포넌트)
  ============================================================
  Three.js(0.160) + RoundedBoxGeometry. 단일 셸 표지 + 경첩 홈 + 표지/책등 제목.

  ▸ RN에서 상태 주입 (둘 중 아무거나):
    webViewRef.current.postMessage(JSON.stringify({
      title: "엄마가 된 첫 해",   // 표지/책등 제목 (필수)
      sub:   "일반 · 친구",        // 표지 부제 (선택)
      spineTitle: "엄마가 된 첫 해",// 책등 제목 (선택, 없으면 title 사용)
      color: "plain"               // "plain"|"news"|"novel" 또는 "#F6AE94" hex
    }));
    // 또는 injectedJavaScript 로: window.setBook({...})

  ▸ RN으로 이벤트 전달:
    onMessage 로 {type:"ready"} (로드 완료), {type:"tap"} (책 탭) 수신.

  ▸ 브라우저 단독 테스트: ?title=오늘의일기&color=novel&sub=소설·소설가
  ============================================================
-->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css" />
<style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden}
  #c{width:100vw;height:100vh;display:block;cursor:grab;touch-action:none}
  #c:active{cursor:grabbing}
</style>
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/" } }
</script>
</head>
<body>
<canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const canvas=document.getElementById('c');
const PRESETS={ plain:0xF7B49B, news:0xA6CDEE, novel:0xCDB0F1 };
const FONT="Pretendard, -apple-system, system-ui, sans-serif";

// ---- 렌더러 / 씬 ----
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(30,1,0.1,100); camera.position.set(0,0.5,13);

scene.add(new THREE.HemisphereLight(0xcdd6ff,0x161320,0.75));
scene.add(new THREE.AmbientLight(0xffffff,0.22));
const key=new THREE.DirectionalLight(0xfff1de,1.55); key.position.set(-5,7,7); key.castShadow=true;
key.shadow.mapSize.set(1024,1024); key.shadow.radius=7; key.shadow.camera.near=1; key.shadow.camera.far=40;
key.shadow.camera.left=-7; key.shadow.camera.right=7; key.shadow.camera.top=7; key.shadow.camera.bottom=-7;
scene.add(key);
const rim=new THREE.DirectionalLight(0xa99cf2,0.65); rim.position.set(6,2,-5); scene.add(rim);

// ---- 책(단일 셸) ----
const W=3.0,H=4.0,T=0.66,wt=0.13;
const coverMat=new THREE.MeshStandardMaterial({color:PRESETS.plain,roughness:0.58,metalness:0.0});
const pagesMat=new THREE.MeshStandardMaterial({color:0xf3ecdb,roughness:0.85});
function coverShellGeo(){
  const w2=W/2,t2=T/2,r=0.17,ir=0.05,gx=-w2+wt+0.18,gw=0.16,gd=0.055, s=new THREE.Shape();
  s.moveTo(w2,t2);
  s.lineTo(gx+gw/2,t2); s.quadraticCurveTo(gx,t2-gd,gx-gw/2,t2);   // 앞표지 경첩 홈
  s.lineTo(-w2+r,t2); s.quadraticCurveTo(-w2,t2,-w2,t2-r);
  s.lineTo(-w2,-t2+r); s.quadraticCurveTo(-w2,-t2,-w2+r,-t2);
  s.lineTo(gx-gw/2,-t2); s.quadraticCurveTo(gx,-t2+gd,gx+gw/2,-t2); // 뒤표지 경첩 홈
  s.lineTo(w2,-t2);
  s.lineTo(w2,-t2+wt);
  s.lineTo(-w2+wt+ir,-t2+wt); s.quadraticCurveTo(-w2+wt,-t2+wt,-w2+wt,-t2+wt+ir);
  s.lineTo(-w2+wt,t2-wt-ir); s.quadraticCurveTo(-w2+wt,t2-wt,-w2+wt+ir,t2-wt);
  s.lineTo(w2,t2-wt); s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:H,bevelEnabled:true,bevelThickness:0.05,bevelSize:0.045,bevelSegments:4,steps:1});
  g.center(); g.rotateX(-Math.PI/2); return g;
}
const book=new THREE.Group();
const cover=new THREE.Mesh(coverShellGeo(),coverMat); cover.castShadow=true; cover.receiveShadow=true;
const pages=new THREE.Mesh(new RoundedBoxGeometry(W-0.26,H-0.20,T-2*wt-0.04,4,0.04),pagesMat); pages.castShadow=true; pages.receiveShadow=true;
book.add(cover,pages);
book.rotation.set(-0.30,0.55,0.05);
scene.add(book);

const ground=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.ShadowMaterial({opacity:0.30}));
ground.rotation.x=-Math.PI/2; ground.position.y=-3.0; ground.receiveShadow=true; scene.add(ground);

// ---- 표지/책등 제목 (CanvasTexture) ----
let labelMesh=null,labelTex=null,spineMesh=null,spineTex=null;
function wrapTitle(s){
  s=(s||'').trim(); if(!s) return [''];
  const words=s.split(/\\s+/), lines=[]; let cur='';
  words.forEach(w=>{ if(((cur?cur+' ':'')+w).length<=8){ cur=(cur?cur+' ':'')+w; } else { if(cur) lines.push(cur); cur=w; } });
  if(cur) lines.push(cur);
  const out=[]; lines.forEach(l=>{ while(l.length>9){ out.push(l.slice(0,9)); l=l.slice(9);} out.push(l); });
  return out.slice(0,3);
}
function makeLabelTexture(lines,sub){
  const c=document.createElement('canvas'); c.width=512; c.height=683;
  const g=c.getContext('2d'); g.clearRect(0,0,512,683); g.textAlign='center';
  const maxLen=Math.max.apply(null,lines.map(l=>l.length||1));
  const fs=maxLen<=5?62:maxLen<=7?52:maxLen<=9?44:38, lh=fs*1.22;
  const startY=300-(lines.length-1)*(lh/2);
  g.shadowColor='rgba(255,250,242,0.55)'; g.shadowBlur=8;
  g.fillStyle='rgba(38,25,12,0.95)'; g.font='800 '+fs+'px '+FONT;
  lines.forEach((l,i)=>g.fillText(l,256,startY+i*lh));
  if(sub){
    const dy=startY+(lines.length-1)*lh+56;
    g.strokeStyle='rgba(38,25,12,0.5)'; g.lineWidth=3; g.beginPath(); g.moveTo(208,dy); g.lineTo(304,dy); g.stroke();
    g.fillStyle='rgba(38,25,12,0.82)'; g.font='600 29px '+FONT; g.fillText(sub,256,dy+48);
  }
  g.fillStyle='rgba(38,25,12,0.6)'; g.font='40px serif'; g.fillText('✦',256,624);
  g.shadowBlur=0;
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8; return t;
}
function makeSpineTexture(title){
  const c=document.createElement('canvas'); c.width=120; c.height=780;
  const g=c.getContext('2d'); g.clearRect(0,0,120,780);
  const s=(title||'').trim();
  if(s){
    g.save(); g.translate(60,390); g.rotate(Math.PI/2);
    g.textAlign='center'; g.textBaseline='middle';
    let fs=56; g.font='700 '+fs+'px '+FONT;
    while(g.measureText(s).width>660 && fs>18){ fs-=2; g.font='700 '+fs+'px '+FONT; }
    g.shadowColor='rgba(255,250,242,0.5)'; g.shadowBlur=6;
    g.fillStyle='rgba(38,25,12,0.92)'; g.fillText(s,0,0); g.restore();
  }
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8; return t;
}
function drawLabels(title,sub,spineTitle){
  const lines=wrapTitle(title);
  if(labelTex) labelTex.dispose(); labelTex=makeLabelTexture(lines,sub||'');
  if(!labelMesh){
    labelMesh=new THREE.Mesh(new THREE.PlaneGeometry(W*0.92,H*0.92), new THREE.MeshBasicMaterial({map:labelTex,transparent:true,depthWrite:false}));
    labelMesh.position.set(0,0,T/2+0.05); book.add(labelMesh);
  } else { labelMesh.material.map=labelTex; labelMesh.material.needsUpdate=true; }
  if(spineTex) spineTex.dispose(); spineTex=makeSpineTexture(spineTitle||title);
  if(!spineMesh){
    spineMesh=new THREE.Mesh(new THREE.PlaneGeometry(T*0.84,(H-0.10)*0.93), new THREE.MeshBasicMaterial({map:spineTex,transparent:true,depthWrite:false}));
    spineMesh.position.set(-W/2-0.006,0,0); spineMesh.rotation.y=-Math.PI/2; book.add(spineMesh);
  } else { spineMesh.material.map=spineTex; spineMesh.material.needsUpdate=true; }
}

// ---- 상태 ----
const state={ title:'나의 일기', sub:'', spineTitle:'', color:'plain' };
function toHex(c){
  if(c==null) return null;
  if(typeof c==='number') return c;
  if(typeof c==='string'){ if(PRESETS[c]!=null) return PRESETS[c]; return parseInt(c.replace('#',''),16); }
  return null;
}
function setBook(opts){
  opts=opts||{};
  if(opts.title!=null) state.title=String(opts.title);
  if(opts.sub!=null) state.sub=String(opts.sub);
  if(opts.spineTitle!=null) state.spineTitle=String(opts.spineTitle);
  if(opts.color!=null){ const h=toHex(opts.color); if(h!=null){ state.color=opts.color; coverMat.color.setHex(h); } }
  if(opts.static!=null){
    const on = !!opts.static && opts.static!=='0' && opts.static!=='false';
    if(on){ auto=false; floatOn=false; book.position.y=0; book.rotation.set(-0.14,0.46,0.02); }
    else { auto=true; floatOn=true; }
  }
  drawLabels(state.title,state.sub,state.spineTitle);
  dirty=true;
}
window.setBook=setBook;
let auto=true, floatOn=true, dirty=true;
function invalidate(){ dirty=true; }

// ---- RN 브리지 ----
function postRN(msg){ try{ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }catch(e){} }
function onBridge(ev){
  let d=ev.data; if(typeof d!=='string') return;
  try{ d=JSON.parse(d); }catch(e){ return; }
  if(d && typeof d==='object') setBook(d);
}
window.addEventListener('message',onBridge);
document.addEventListener('message',onBridge); // Android RN

// ---- 쿼리 파라미터(단독 테스트) ----
(function(){
  const q=new URLSearchParams(location.search), o={};
  if(q.get('title')) o.title=q.get('title');
  if(q.get('sub')) o.sub=q.get('sub');
  if(q.get('spineTitle')) o.spineTitle=q.get('spineTitle');
  if(q.get('color')) o.color=q.get('color');
  if(q.get('static')) o.static=q.get('static');
  setBook(o);
})();
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>{drawLabels(state.title,state.sub,state.spineTitle);invalidate();});

// ---- 드래그 회전 + 탭 ----
let drag=false,moved=false,lx=0,ly=0;
canvas.addEventListener('pointerdown',e=>{drag=true;moved=false;auto=false;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture&&canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{ if(!drag)return; const dx=e.clientX-lx,dy=e.clientY-ly; if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  book.rotation.y+=dx*0.01; book.rotation.x+=dy*0.01; book.rotation.x=Math.max(-1.1,Math.min(0.9,book.rotation.x)); lx=e.clientX;ly=e.clientY; dirty=true;});
canvas.addEventListener('pointerup',()=>{ drag=false; if(!moved) postRN({type:'tap'}); });

// ---- 리사이즈 / 루프 ----
function resize(){ const w=innerWidth,h=innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); dirty=true; }
window.addEventListener('resize',resize); resize();
const clock=new THREE.Clock();
(function loop(){ requestAnimationFrame(loop);
  const t=clock.getElapsedTime();
  if(floatOn){ book.position.y=Math.sin(t*1.1)*0.10; dirty=true; }
  if(auto){ book.rotation.y=0.55+Math.sin(t*0.5)*0.20; dirty=true; }
  if(dirty){ renderer.render(scene,camera); dirty=false; }   // 정적 모드: 변화 있을 때만 렌더
})();

postRN({type:'ready'});
</script>
</body>
</html>
`;
