const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const bestEl  = document.getElementById('best');
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ov-title');
const ovText  = document.getElementById('ov-text');
const startBtn= document.getElementById('startBtn');

let DPR = Math.min(window.devicePixelRatio||1, 2);
let W=0,H=0;
function resize(){
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = W*DPR; cv.height = H*DPR;
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize);

// ---- Game state ----
let running=false, score=0, lives=3, best=+(localStorage.getItem('ucanveysi_best')||0);
let player, items, particles, spawnT, combo, comboT, slowT, lastTs;
bestEl.textContent = best;

const IMG_SRCS = [
  'img/veysi1.jpeg','img/veysi2.jpeg','img/veysi3.jpeg','img/veysi4.jpeg',
  'img/veysi5.jpeg','img/veysi6.jpeg','img/veysi7.jpeg','img/veysi8.jpeg',
  'img/veysi9.jpeg','img/veysi10.jpeg','img/veysi11.jpeg'
];
const imgs = [];
let imgsLoaded = 0;
IMG_SRCS.forEach(src=>{
  const im = new Image(); im.src = src;
  im.onload = ()=>{ imgsLoaded++; };
  imgs.push(im);
});

const player_img = new Image(); player_img.src = IMG_SRCS[0];

// Draw an image as a centered, cover-fit circle of diameter `d` at the
// current origin. Crops the source to its centered square so portrait
// photos stay centered (no stretching).
function drawCover(img, d){
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if(!iw || !ih){ ctx.fillStyle='#ff7ad9'; ctx.fillRect(-d/2,-d/2,d,d); return; }
  const side = Math.min(iw, ih);
  const sx = (iw - side)/2, sy = (ih - side)/2;
  ctx.drawImage(img, sx, sy, side, side, -d/2, -d/2, d, d);
}

// ---- Input ----
let targetX = null;
function pointerX(e){
  const r = cv.getBoundingClientRect();
  const x = (e.touches? e.touches[0].clientX : e.clientX) - r.left;
  return x;
}
function onMove(e){ targetX = pointerX(e); if(e.cancelable) e.preventDefault(); }
cv.addEventListener('mousemove', onMove);
cv.addEventListener('touchstart', onMove, {passive:false});
cv.addEventListener('touchmove', onMove, {passive:false});
cv.addEventListener('mousedown', onMove);
window.addEventListener('keydown', e=>{
  if(e.key==='ArrowLeft')  targetX = (player? player.x:W/2) - 40;
  if(e.key==='ArrowRight') targetX = (player? player.x:W/2) + 40;
});

// ---- Spawning ----
const TYPES = {
  HEAD:  'head',
  GOLD:  'gold',
  LIFE:  'life',
  SLOW:  'slow',
  BOMB:  'bomb'
};
function spawn(){
  const r = Math.random();
  let type = TYPES.HEAD;
  if(r > 0.93) type = TYPES.BOMB;
  else if(r > 0.88) type = TYPES.LIFE;
  else if(r > 0.82) type = TYPES.SLOW;
  else if(r > 0.72) type = TYPES.GOLD;

  const size = type===TYPES.HEAD||type===TYPES.GOLD ? 46 : 40;
  const x = Math.random()*(W-size*2)+size;
  const vy = (type===TYPES.BOMB? 2.6 : 1.8) + Math.random()*1.6 + score*0.002;
  items.push({type, x, y:-size, size, vy, rot:(Math.random()-.5)*0.04, img: imgs[(Math.random()*imgs.length)|0]});
}

// ---- Particles ----
function burst(x,y,color,n=14){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=Math.random()*3+1;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color});
  }
}

// ---- Game loop ----
function reset(){
  player = {x:W/2, y:0, w:64, h:54, speed:0.22};
  items=[]; particles=[]; spawnT=0; combo=0; comboT=0; slowT=0;
  score=0; lives=3; running=true; lastTs=performance.now();
  updateHUD();
}
function updateHUD(){
  scoreEl.textContent = score;
  livesEl.textContent = '❤️'.repeat(Math.max(0,lives)) || '—';
  bestEl.textContent = best;
}
function endGame(){
  running=false;
  if(score>best){ best=score; localStorage.setItem('ucanveysi_best', best); }
  ovTitle.textContent = '💀 Oyun Bitti';
  ovText.innerHTML = `Puanın: <b>${score}</b><br>Rekor: <b>${best}</b>`;
  startBtn.textContent = 'TEKRAR OYNA';
  overlay.classList.add('show');
}

function update(dt){
  // player follow
  if(targetX!=null){
    player.x += (targetX - player.x) * Math.min(1, player.speed*dt/16);
    player.x = Math.max(player.w/2, Math.min(W-player.w/2, player.x));
  }
  player.y = H - 46;

  // spawning
  spawnT -= dt;
  const interval = Math.max(280, 760 - score*3);
  if(spawnT<=0){ spawn(); spawnT = interval; }

  // items
  for(let i=items.length-1;i>=0;i--){
    const it=items[i];
    it.y += it.vy * (slowT>0?0.45:1) * (dt/16);
    it.rot += 0.01;
    // catch test
    if(it.y+it.size>player.y-player.h/2 && Math.abs(it.x-player.x)<player.w/2+it.size/2 && it.y<player.y+player.h/2){
      // caught
      handleCatch(it); items.splice(i,1); continue;
    }
    if(it.y - it.size > H){
      // missed
      if(it.type===TYPES.HEAD || it.type===TYPES.GOLD){ loseLife(); combo=0; }
      items.splice(i,1);
    }
  }

  // particles
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.life-=0.02;
    if(p.life<=0) particles.splice(i,1);
  }

  if(comboT>0) comboT-=dt; else combo=0;
  if(slowT>0)  slowT-=dt;
}

function handleCatch(it){
  if(it.type===TYPES.BOMB){
    loseLife(); loseLife(); combo=0;
    burst(it.x,it.y,'#ff5d5d',24);
    return;
  }
  if(it.type===TYPES.LIFE){ lives=Math.min(5,lives+1); burst(it.x,it.y,'#7CFC00'); updateHUD(); return; }
  if(it.type===TYPES.SLOW){ slowT=4000; burst(it.x,it.y,'#5cc8ff'); return; }
  combo++; comboT=1500;
  const mult = 1 + Math.floor(combo/3);
  const gain = (it.type===TYPES.GOLD?5:1)*mult;
  score += gain;
  burst(it.x,it.y, it.type===TYPES.GOLD?'#ffd54a':'#ff7ad9');
  updateHUD();
}
function loseLife(){
  lives--; updateHUD();
  if(lives<=0) endGame();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  // background sky bits
  ctx.globalAlpha=1;

  // items
  for(const it of items){
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    if(it.type===TYPES.BOMB){
      ctx.font = `${it.size}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('💣',0,0);
    } else if(it.type===TYPES.LIFE){
      ctx.font = `${it.size}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('❤️',0,0);
    } else if(it.type===TYPES.SLOW){
      ctx.font = `${it.size}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('⭐',0,0);
    } else {
      // head (veysi) — round clipped, centered cover-fit image
      const s=it.size;
      ctx.beginPath(); ctx.arc(0,0,s/2,0,Math.PI*2); ctx.closePath(); ctx.clip();
      drawCover(it.img, s);
      if(it.type===TYPES.GOLD){
        ctx.lineWidth=3; ctx.strokeStyle='#ffd54a'; ctx.beginPath(); ctx.arc(0,0,s/2,0,Math.PI*2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // player (basket / veysi pilot)
  ctx.save();
  ctx.translate(player.x, player.y);
  const pw=player.w, ph=player.h;
  // body
  ctx.beginPath();
  ctx.arc(0,0,pw/2,0,Math.PI*2); ctx.closePath(); ctx.clip();
  drawCover(player_img, pw);
  ctx.restore();
  // basket rim
  ctx.save(); ctx.translate(player.x,player.y);
  ctx.lineWidth=3; ctx.strokeStyle='#5cc8ff';
  ctx.beginPath(); ctx.arc(0,0,pw/2,0,Math.PI*2); ctx.stroke();
  ctx.restore();

  // particles
  for(const p of particles){
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle=p.color;
    ctx.fillRect(p.x,p.y,3,3);
  }
  ctx.globalAlpha=1;

  // combo badge
  if(combo>1){
    ctx.fillStyle='rgba(255,255,255,.9)';
    ctx.font='bold 16px system-ui'; ctx.textAlign='center';
    ctx.fillText(`KOMBO x${1+Math.floor(combo/3)}  (${combo})`, W/2, 28);
  }
}

function frame(ts){
  const dt = Math.min(40, ts - lastTs); lastTs = ts;
  if(running){ update(dt); draw(); }
  requestAnimationFrame(frame);
}

function start(){
  resize();
  reset();
  overlay.classList.remove('show');
}
startBtn.addEventListener('click', start);

// boot
resize();
requestAnimationFrame(frame);
