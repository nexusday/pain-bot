/**
 * Iconos estilo Lucide (SVG inline) — sin CDN, para WebView de WhatsApp.
 */
const I = {
  snake: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1 0-6h2"/><path d="M7 14v.2A3 3 0 0 0 8.9 20H12a3 3 0 0 0 0-6h-2"/><path d="M16 20h2a3 3 0 0 0 0-6h-2"/><circle cx="18" cy="13" r="1" fill="currentColor" stroke="none"/><path d="M20 10c0-2.5-1.5-4-4-4"/></svg>`,
  trophy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  play: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7L8 5z"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  apple: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/></svg>`,
  xCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  chevronUp: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  chevronLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  move: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/></svg>`
}

/**
 * Snake HTML self-contained, diseño limpio profesional.
 */
export function htmlSnake(playerName = 'Jugador') {
  const name = String(playerName || 'Jugador')
    .replace(/[<>&"'`\\]/g, '')
    .slice(0, 24) || 'Jugador'

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
:root{
  --bg:#0c1220;
  --surface:#131b2e;
  --surface2:#1a2438;
  --line:rgba(148,163,184,.14);
  --text:#f1f5f9;
  --muted:#94a3b8;
  --accent:#22c55e;
  --accent2:#16a34a;
  --danger:#ef4444;
  --food:#f43f5e;
  --r:18px;
}
html,body{width:100%;min-height:100%;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow-x:hidden}
body{padding:12px;display:flex;justify-content:center;align-items:flex-start}
.app{width:100%;max-width:360px;background:linear-gradient(180deg,var(--surface) 0%,#0f1729 100%);border:1px solid var(--line);border-radius:22px;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.logo{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(34,197,94,.22),rgba(34,197,94,.06));color:var(--accent);border:1px solid rgba(34,197,94,.25);flex:0 0 auto}
.brand h1{font-size:15px;font-weight:750;letter-spacing:.2px;line-height:1.1}
.player{display:flex;align-items:center;gap:4px;margin-top:3px;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.player svg{flex:0 0 auto;opacity:.85}
.stats{display:flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--line);border-radius:999px;padding:7px 11px;color:var(--muted);font-size:12px;font-weight:600}
.stats svg{color:#fbbf24}
.stats b{color:var(--text);font-size:14px;font-variant-numeric:tabular-nums}
.stage{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--line);background:#070b14}
canvas{width:100%;aspect-ratio:1;display:block;background:
  radial-gradient(circle at 30% 20%,rgba(34,197,94,.08),transparent 45%),
  radial-gradient(circle at 80% 70%,rgba(59,130,246,.06),transparent 40%),
  #070b14}
.panel{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;text-align:center;background:rgba(7,11,20,.82);backdrop-filter:blur(4px)}
.panel .ico{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;margin-bottom:2px}
.panel.start .ico{background:rgba(34,197,94,.12);color:var(--accent);border:1px solid rgba(34,197,94,.25)}
.panel.over .ico{background:rgba(239,68,68,.12);color:var(--danger);border:1px solid rgba(239,68,68,.25)}
.panel h2{font-size:20px;font-weight:780;letter-spacing:.2px}
.panel p{font-size:12.5px;color:var(--muted);line-height:1.45;max-width:230px}
.btn{margin-top:6px;border:0;border-radius:14px;padding:11px 18px;min-width:148px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:720;font-size:13.5px;color:#052e16;background:linear-gradient(180deg,#4ade80,#22c55e);box-shadow:0 6px 16px rgba(34,197,94,.28)}
.btn:active{transform:scale(.98);filter:brightness(.96)}
.hidden{display:none!important}
.pad{margin-top:12px;display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,52px);gap:8px;justify-content:center}
.pad button{border:0;border-radius:14px;background:var(--surface2);color:var(--text);border:1px solid var(--line);display:grid;place-items:center}
.pad button:active{background:#243049;color:var(--accent);border-color:rgba(34,197,94,.35)}
.hint{margin-top:11px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:#64748b}
.hint svg{opacity:.7}
</style>
</head>
<body>
<div class="app">
  <div class="bar">
    <div class="brand">
      <div class="logo">${I.snake}</div>
      <div style="min-width:0">
        <h1>Snake</h1>
        <div class="player">${I.user}<span>${name}</span></div>
      </div>
    </div>
    <div class="stats">${I.trophy}<b id="score">0</b></div>
  </div>

  <div class="stage">
    <canvas id="c" width="336" height="336"></canvas>
    <div class="panel start" id="start">
      <div class="ico">${I.apple}</div>
      <h2>Listo para jugar</h2>
      <p>Come la fruta, evita las paredes y tu propio cuerpo.</p>
      <button class="btn" id="btnStart">${I.play}<span>Jugar</span></button>
    </div>
    <div class="panel over hidden" id="over">
      <div class="ico">${I.xCircle}</div>
      <h2>Fin de partida</h2>
      <p id="final">Puntos: 0</p>
      <button class="btn" id="btnAgain">${I.refresh}<span>Reintentar</span></button>
    </div>
  </div>

  <div class="pad">
    <span></span>
    <button type="button" data-d="u" aria-label="Arriba">${I.chevronUp}</button>
    <span></span>
    <button type="button" data-d="l" aria-label="Izquierda">${I.chevronLeft}</button>
    <button type="button" data-d="d" aria-label="Abajo">${I.chevronDown}</button>
    <button type="button" data-d="r" aria-label="Derecha">${I.chevronRight}</button>
  </div>
  <div class="hint">${I.move}<span>Pad o desliza sobre el tablero</span></div>
</div>
<script>
(function(){
  const canvas=document.getElementById('c');
  const ctx=canvas.getContext('2d');
  const scoreEl=document.getElementById('score');
  const startEl=document.getElementById('start');
  const overEl=document.getElementById('over');
  const finalEl=document.getElementById('final');
  const N=16, CELL=canvas.width/N;
  let snake, dir, nextDir, food, score, alive, last=0, raf=0;

  function randFood(){
    let p;
    do{p={x:(Math.random()*N)|0,y:(Math.random()*N)|0}}
    while(snake.some(s=>s.x===p.x&&s.y===p.y));
    return p;
  }

  function reset(){
    cancelAnimationFrame(raf);
    snake=[{x:8,y:8},{x:7,y:8},{x:6,y:8}];
    dir=nextDir={x:1,y:0};
    food=randFood();
    score=0; alive=true; last=0;
    scoreEl.textContent=score;
    startEl.classList.add('hidden');
    overEl.classList.add('hidden');
    raf=requestAnimationFrame(loop);
  }

  function setDir(d){
    const map={u:{x:0,y:-1},d:{x:0,y:1},l:{x:-1,y:0},r:{x:1,y:0}};
    const nd=map[d]; if(!nd) return;
    if(nd.x===-dir.x&&nd.y===-dir.y) return;
    nextDir=nd;
  }

  document.querySelectorAll('.pad button').forEach(b=>{
    const go=e=>{e.preventDefault();setDir(b.dataset.d)};
    b.addEventListener('touchstart',go,{passive:false});
    b.addEventListener('click',go);
  });
  document.getElementById('btnStart').onclick=reset;
  document.getElementById('btnAgain').onclick=reset;

  let sx=0,sy=0;
  canvas.addEventListener('touchstart',e=>{const t=e.changedTouches[0];sx=t.clientX;sy=t.clientY},{passive:true});
  canvas.addEventListener('touchend',e=>{
    const t=e.changedTouches[0]; const dx=t.clientX-sx, dy=t.clientY-sy;
    if(Math.abs(dx)<18&&Math.abs(dy)<18) return;
    if(Math.abs(dx)>Math.abs(dy)) setDir(dx>0?'r':'l'); else setDir(dy>0?'d':'u');
  },{passive:true});

  function roundRect(x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<N;i++){
      for(let j=0;j<N;j++){
        if((i+j)%2===0){
          ctx.fillStyle='rgba(148,163,184,.035)';
          ctx.fillRect(i*CELL,j*CELL,CELL,CELL);
        }
      }
    }
    const fx=food.x*CELL+CELL/2, fy=food.y*CELL+CELL/2;
    ctx.fillStyle='rgba(244,63,94,.25)';
    ctx.beginPath(); ctx.arc(fx,fy,CELL*0.42,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#f43f5e';
    ctx.beginPath(); ctx.arc(fx,fy,CELL*0.28,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fb7185';
    ctx.beginPath(); ctx.arc(fx-CELL*0.08,fy-CELL*0.08,CELL*0.08,0,Math.PI*2); ctx.fill();

    snake.forEach((s,i)=>{
      const pad=i===0?2.5:3.5;
      const g=ctx.createLinearGradient(s.x*CELL,s.y*CELL,s.x*CELL+CELL,s.y*CELL+CELL);
      if(i===0){ g.addColorStop(0,'#4ade80'); g.addColorStop(1,'#16a34a'); }
      else { g.addColorStop(0,'#22c55e'); g.addColorStop(1,'#15803d'); }
      ctx.fillStyle=g;
      roundRect(s.x*CELL+pad,s.y*CELL+pad,CELL-pad*2,CELL-pad*2,6);
      ctx.fill();
      if(i===0){
        ctx.fillStyle='#052e16';
        const ex=s.x*CELL+CELL/2+(dir.x*CELL*0.12);
        const ey=s.y*CELL+CELL/2+(dir.y*CELL*0.12);
        const ox=dir.x===0?CELL*0.12:0;
        const oy=dir.y===0?CELL*0.12:0;
        ctx.beginPath(); ctx.arc(ex-ox,ey-oy,2.1,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex+ox,ey+oy,2.1,0,Math.PI*2); ctx.fill();
      }
    });
  }

  function step(){
    if(!alive) return;
    dir=nextDir;
    const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
    if(head.x<0||head.y<0||head.x>=N||head.y>=N||snake.some(s=>s.x===head.x&&s.y===head.y)){
      alive=false;
      finalEl.textContent='Puntos: '+score;
      overEl.classList.remove('hidden');
      return;
    }
    snake.unshift(head);
    if(head.x===food.x&&head.y===food.y){
      score+=10; scoreEl.textContent=score; food=randFood();
    } else snake.pop();
  }

  function loop(ts){
    if(!alive){draw(); return}
    if(!last) last=ts;
    if(ts-last>125){ step(); last=ts }
    draw();
    raf=requestAnimationFrame(loop);
  }

  draw();
})();
</script>
</body>
</html>`
}

export default htmlSnake
