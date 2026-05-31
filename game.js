// ===== Uçan Veysi — düşen kafaları yakala =====
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const bestEl  = document.getElementById("best");
const overlay = document.getElementById("overlay");
const ovTitle = document.getElementById("ov-title");
const ovText  = document.getElementById("ov-text");
const startBtn = document.getElementById("startBtn");

const IMG_SRCS = [
  "img/veysi1.jpeg","img/veysi2.jpeg","img/veysi3.jpeg","img/veysi4.jpeg",
  "img/veysi5.jpeg","img/veysi6.jpeg","img/veysi7.jpeg","img/veysi8.jpeg",
  "img/veysi9.jpeg","img/veysi10.jpeg","img/veysi11.jpeg"
];
// her foto için dikey yüz odağı — hepsi ortalanmış (0.5)
const POS = IMG_SRCS.map(() => 0.5);
const images = IMG_SRCS.map(s => { const i = new Image(); i.src = s; return i; });

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);

// ---- ses ----
let audioCtx = null;
const ac = () => audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
function tone(freq, dur, type="square", vol=0.25, slideTo=null) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
}
function laugh(){ [380,300,420,320,460].forEach((f,i)=>setTimeout(()=>tone(f,0.08,"sawtooth",0.18),i*55)); }
const catchSound = (combo=1) => { tone(500 + combo*40, 0.1, "square", 0.22, 1100 + combo*60); laugh(); };
const goldSound  = () => [660,880,1100,1320].forEach((f,i)=>setTimeout(()=>tone(f,0.12,"triangle",0.25),i*70));
const heartSound = () => [523,784].forEach((f,i)=>setTimeout(()=>tone(f,0.18,"sine",0.3),i*110));
const starSound  = () => [880,1175,1568].forEach((f,i)=>setTimeout(()=>tone(f,0.15,"sine",0.25),i*80));
const bombSound  = () => tone(120,0.45,"sawtooth",0.4,40);
const missSound  = () => tone(200,0.25,"triangle",0.3,90);
const endSound   = () => [523,415,330,262].forEach((f,i)=>setTimeout(()=>tone(f,0.25,"triangle",0.25),i*140));

// ---- durum ----
let basket = { x: 0, w: 90, h: 26 };
let items = [], parts = [], floats = [];
let score = 0, lives = 3, running = false;
let combo = 0, bestCombo = 0;
let slowT = 0;          // yavaş çekim kalan süre (frame)
let shakeT = 0;         // ekran sarsıntısı
let best = +(localStorage.getItem("ucanveysi_best") || 0);
let spawnTimer = 0, lastT = 0;
const MAX_LIVES = 5;
bestEl.textContent = best;

// tür ağırlıkları
const TYPES = [
  { t:"head",   w:58 },
  { t:"bomb",   w:22 },
  { t:"golden", w:8  },
  { t:"heart",  w:4  },
  { t:"star",   w:8  },
];
function pickType(){
  const tot = TYPES.reduce((s,x)=>s+x.w,0);
  let r = Math.random()*tot;
  for (const x of TYPES){ if ((r-=x.w) < 0) return x.t; }
  return "head";
}

function setLives(n){ lives = Math.min(MAX_LIVES, Math.max(0,n)); livesEl.textContent = "❤️".repeat(lives) || "💀"; }
function multiplier(){ return Math.min(5, 1 + Math.floor(combo/4)); }

// ---- kontrol ----
function moveTo(clientX){
  const r = cv.getBoundingClientRect();
  basket.x = Math.max(basket.w/2, Math.min(W - basket.w/2, clientX - r.left));
}
cv.addEventListener("pointerdown", e => moveTo(e.clientX));
cv.addEventListener("pointermove", e => { if (e.buttons || e.pointerType === "touch") moveTo(e.clientX); });
let keyDir = 0;
window.addEventListener("keydown", e => { if(e.key==="ArrowLeft")keyDir=-1; if(e.key==="ArrowRight")keyDir=1; });
window.addEventListener("keyup",   e => { if((e.key==="ArrowLeft"&&keyDir<0)||(e.key==="ArrowRight"&&keyDir>0))keyDir=0; });

// ---- oyun ----
function start(){
  resize();
  score = 0; setLives(3); items = []; parts = []; floats = [];
  combo = 0; bestCombo = 0; slowT = 0; shakeT = 0; spawnTimer = 0;
  running = true;
  scoreEl.textContent = 0;
  overlay.classList.remove("show");
  ac().resume();
  basket.x = W/2; basket.w = Math.max(64, W*0.2);
  lastT = performance.now();
  requestAnimationFrame(loop);
}

function spawn(){
  const r = Math.max(24, W*0.082);
  const type = pickType();
  const idx = Math.floor(Math.random()*images.length);
  // HIZ: daha hızlı taban + skorla daha dik artış
  const speed = 3.6 + Math.random()*1.6 + score*0.04;
  items.push({ x: r + Math.random()*(W - 2*r), y: -r, r, vy: speed, type, img: images[idx], pos: POS[idx], rot: 0, vr: (Math.random()-0.5)*0.1 });
}

function burst(x, y, color, n=12){
  for (let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2, sp = 1.5 + Math.random()*3.5;
    parts.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 1, life: 1, color, r: 2+Math.random()*3 });
  }
}
function popText(x, y, txt, color){ floats.push({ x, y, txt, color, life: 1 }); }

function loop(t){
  if (!running) return;
  let dt = Math.min(2, (t - lastT)/16.67); lastT = t;
  if (slowT > 0){ slowT -= dt; dt *= 0.45; }   // yavaş çekim

  // klavye
  if (keyDir) basket.x = Math.max(basket.w/2, Math.min(W - basket.w/2, basket.x + keyDir*8*dt));

  // spawn — skorla hızlanan, daha sık çıkış
  spawnTimer += dt;
  const interval = Math.max(22, 70 - score*0.6);
  if (spawnTimer >= interval){ spawnTimer = 0; spawn(); }

  // ekran sarsıntısı
  ctx.save();
  if (shakeT > 0){ shakeT -= dt; const s = shakeT*0.6; ctx.translate((Math.random()-0.5)*s, (Math.random()-0.5)*s); }
  ctx.clearRect(-20,-20,W+40,H+40);

  // yavaş çekim arka plan tonu
  if (slowT > 0){ ctx.fillStyle = "rgba(79,195,247,.07)"; ctx.fillRect(0,0,W,H); }

  const basketY = H - basket.h - 8;

  for (let i = items.length - 1; i >= 0; i--){
    const it = items[i];
    it.y += it.vy * dt; it.rot += it.vr * dt;

    // yakalama
    if (it.y + it.r >= basketY && it.y - it.r < basketY + basket.h && Math.abs(it.x - basket.x) < basket.w/2 + it.r*0.5){
      onCatch(it); items.splice(i,1);
      if (lives <= 0) return end();
      continue;
    }
    // yere düştü
    if (it.y - it.r > H){
      if (it.type === "head" || it.type === "golden"){ setLives(lives-1); missSound(); combo = 0; shakeT = 6; }
      items.splice(i,1);
      if (lives <= 0) return end();
      continue;
    }
    drawItem(it);
  }

  // parçacıklar
  for (let i = parts.length-1; i>=0; i--){
    const p = parts[i];
    p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 0.15*dt; p.life -= 0.03*dt;
    if (p.life <= 0){ parts.splice(i,1); continue; }
    ctx.globalAlpha = Math.max(0,p.life); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // uçan yazılar
  for (let i = floats.length-1; i>=0; i--){
    const f = floats[i]; f.y -= 1.1*dt; f.life -= 0.022*dt;
    if (f.life <= 0){ floats.splice(i,1); continue; }
    ctx.globalAlpha = Math.max(0,f.life); ctx.fillStyle = f.color;
    ctx.font = "900 22px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  drawBasket(basketY);

  // kombo göstergesi
  if (combo >= 2){
    ctx.fillStyle = multiplier()>1 ? "#ffd23f" : "#4fc3f7";
    ctx.font = "900 clamp(20px,5vw,30px) system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`KOMBO ${combo}  x${multiplier()}`, W/2, 34);
  }
  if (slowT > 0){
    ctx.fillStyle = "#4fc3f7"; ctx.font = "700 14px system-ui"; ctx.textAlign = "right";
    ctx.fillText("⭐ YAVAŞ ÇEKİM", W-10, H-10);
  }
  ctx.restore();
  requestAnimationFrame(loop);
}

function onCatch(it){
  if (it.type === "bomb"){
    setLives(lives-1); bombSound(); combo = 0; shakeT = 14;
    burst(it.x, it.y, "#ff5252", 16); popText(it.x, it.y-it.r, "💥", "#ff5252");
    return;
  }
  if (it.type === "heart"){
    setLives(lives+1); heartSound(); burst(it.x,it.y,"#ff6b9d",14); popText(it.x,it.y-it.r,"+CAN","#ff6b9d");
    return;
  }
  if (it.type === "star"){
    slowT = 240; starSound(); burst(it.x,it.y,"#9fe8ff",16); popText(it.x,it.y-it.r,"YAVAŞ!","#9fe8ff");
    return;
  }
  // head veya golden
  combo++; bestCombo = Math.max(bestCombo, combo);
  const base = it.type === "golden" ? 5 : 1;
  const pts = base * multiplier();
  score += pts; scoreEl.textContent = score;
  if (it.type === "golden"){ goldSound(); burst(it.x,it.y,"#ffd23f",18); }
  else { catchSound(combo); burst(it.x,it.y,"#7CFC00",10); }
  popText(it.x, it.y-it.r, "+"+pts, it.type==="golden" ? "#ffd23f" : "#7CFC00");
}

function clipFace(it, ring){
  ctx.save();
  ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI*2); ctx.closePath(); ctx.clip();
  if (it.img.complete && it.img.naturalWidth){
    const iw = it.img.naturalWidth, ih = it.img.naturalHeight;
    const s = (it.r*2)/Math.min(iw,ih), dw = iw*s, dh = ih*s;
    // yatay ve dikey ortala (cover-fit, merkezden)
    ctx.drawImage(it.img, it.x - dw/2, it.y - it.r - (dh - it.r*2)*it.pos, dw, dh);
  } else { ctx.fillStyle = "#4fc3f7"; ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI*2);
  ctx.lineWidth = ring.w; ctx.strokeStyle = ring.c; ctx.stroke();
}

function emoji(it, ch, ringC){
  ctx.beginPath(); ctx.arc(it.x,it.y,it.r,0,Math.PI*2);
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fill();
  if (ringC){ ctx.lineWidth = 3; ctx.strokeStyle = ringC; ctx.stroke(); }
  ctx.font = `${it.r*1.3}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ch, it.x, it.y);
  ctx.textBaseline = "alphabetic";
}

function drawItem(it){
  if (it.type === "bomb"){ emoji(it, "💣", "#ffd23f"); return; }
  if (it.type === "heart"){ emoji(it, "❤️", "#ff6b9d"); return; }
  if (it.type === "star"){
    // parlayan yıldız halkası
    const g = ctx.createRadialGradient(it.x,it.y,it.r*0.2,it.x,it.y,it.r);
    g.addColorStop(0,"rgba(159,232,255,.5)"); g.addColorStop(1,"rgba(159,232,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(it.x,it.y,it.r,0,Math.PI*2); ctx.fill();
    emoji(it, "⭐", "#9fe8ff"); return;
  }
  if (it.type === "golden"){
    // altın parıltı
    ctx.save();
    ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 18;
    clipFace(it, { w:5, c:"#ffd23f" });
    ctx.restore();
    return;
  }
  clipFace(it, { w:3, c:"#4fc3f7" });
}

function drawBasket(y){
  const x = basket.x - basket.w/2;
  ctx.fillStyle = "#8d5524";
  roundRect(x, y, basket.w, basket.h, 6); ctx.fill();
  ctx.fillStyle = "#a86b32";
  roundRect(x, y, basket.w, 7, 4); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 2;
  for (let i = 1; i < 5; i++){
    const px = x + (basket.w/5)*i;
    ctx.beginPath(); ctx.moveTo(px, y+4); ctx.lineTo(px, y+basket.h-2); ctx.stroke();
  }
}

function roundRect(x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

function end(){
  running = false;
  endSound();
  if (score > best){ best = score; localStorage.setItem("ucanveysi_best", best); bestEl.textContent = best; ovTitle.textContent = "🏆 YENİ REKOR!"; }
  else ovTitle.textContent = "Oyun Bitti!";
  ovText.innerHTML = `Puanın: <b>${score}</b> · En iyi kombo: <b>${bestCombo}</b><br>Rekor: <b>${best}</b>`;
  startBtn.textContent = "TEKRAR OYNA";
  overlay.classList.add("show");
}

startBtn.addEventListener("click", start);
resize();
