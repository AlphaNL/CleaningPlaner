/* ======================= DATA (IndexedDB) ======================= */
const DB_NAME = 'clean_planner_db';
const DB_VER  = 1;
let db;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      const store = d.createObjectStore('clients', { keyPath:'id' });
      store.createIndex('name','name', {unique:false});
    };
    req.onsuccess = ()=>{ db=req.result; resolve(); };
    req.onerror   = ()=> reject(req.error);
  });
}
function tx(name,mode='readonly'){ return db.transaction(name,mode).objectStore(name); }
async function listClients(){ return new Promise((res,rej)=>{ const r=tx('clients').getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error);}); }
async function saveClient(c){ return new Promise((res,rej)=>{ const r=tx('clients','readwrite').put(c); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}); }
async function deleteClient(id){return new Promise((res,rej)=>{ const r=tx('clients','readwrite').delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);});}

/* ======================= SCHEDULE HELPERS ======================= */
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function tomorrow(){ const x=new Date(); x.setDate(x.getDate()+1); return x; }
function weekdayOf(date){ const w=date.getDay(); return (w===0)?1:(w+1); }
function nextOccurrence(from, s){
  const cal=new Date(from);
  let daysAhead = (s.weekday - weekdayOf(cal) + 7) % 7; if(daysAhead===0) daysAhead=7;
  const first = new Date(startOfDay(cal).getTime()+daysAhead*86400000);
  if (s.frequency===2){
    const start=new Date(s.startDate||Date.now());
    const weeks=Math.floor((startOfDay(first)-startOfDay(start))/(7*86400000));
    if (weeks%2!==0) return new Date(first.getTime()+7*86400000);
  }
  return first;
}
function isScheduledOn(date,s){ const occ=nextOccurrence(new Date(date.getTime()-86400000),s); return startOfDay(occ).getTime()===startOfDay(date).getTime(); }

/* ======================= UI NODES ======================= */
const tomorrowList   = document.getElementById('tomorrowList');
const tomorrowEmpty  = document.getElementById('tomorrowEmpty');
const clientsList    = document.getElementById('clientsList');
const dialogEl       = document.getElementById('clientDialog');
const form           = document.getElementById('clientForm');
const addBtn         = document.getElementById('addClientBtn');
const search         = document.getElementById('search');

/* ======================= CLIENT FORM ======================= */
addBtn.addEventListener('click', ()=>{
  form.reset();
  document.getElementById('clientId').value='';
  document.getElementById('dialogTitle').textContent='Новий клієнт';
  dialogEl.showModal();
});

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = document.getElementById('clientId').value || crypto.randomUUID();
  const client = {
    id,
    name   : document.getElementById('name').value.trim(),
    street : document.getElementById('street').value.trim(),
    address: document.getElementById('address').value.trim(),
    phone  : document.getElementById('phone').value.trim(),
    notes  : (document.getElementById('notes')?.value || '').trim(),
    schedules:[{
      weekday  : parseInt(document.getElementById('weekday').value,10),
      frequency: parseInt(document.getElementById('frequency').value,10),
      startDate: new Date().toISOString()
    }],
    reminders:[{ time: document.getElementById('remTime').value,
                 offsetMinutes: parseInt(document.getElementById('remOffset').value,10)||0,
                 isEnabled:true }]
  };
  await saveClient(client);
  dialogEl.close();
  refresh();
});

function editClient(c){
  document.getElementById('clientId').value=c.id;
  document.getElementById('name').value=c.name||'';
  document.getElementById('street').value=c.street||'';
  document.getElementById('address').value=c.address||'';
  document.getElementById('phone').value=c.phone||'';
  const notesEl=document.getElementById('notes'); if(notesEl) notesEl.value=c.notes||'';
  const s=(c.schedules&&c.schedules[0])||{weekday:2,frequency:1};
  document.getElementById('weekday').value=s.weekday;
  document.getElementById('frequency').value=s.frequency;
  const r=(c.reminders&&c.reminders[0])||{time:'09:00',offsetMinutes:0};
  document.getElementById('remTime').value=r.time||'09:00';
  document.getElementById('remOffset').value=r.offsetMinutes||0;
  document.getElementById('dialogTitle').textContent='Редагувати клієнта';
  dialogEl.showModal();
}

search.addEventListener('input', ()=> refresh());

/* ======================= LIST RENDER ======================= */
function clientRow(c){
  const li = document.createElement('li');
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = (c.name?.trim()?.[0] || '•').toUpperCase();

  const left = document.createElement('div'); left.className='grow';

  const title = document.createElement('div');
  title.style.display='flex'; title.style.alignItems='center'; title.style.gap='8px';

  const nameEl = document.createElement('div'); nameEl.textContent=c.name;
  const badge  = document.createElement('span'); badge.className='badge';
  const s = (c.schedules && c.schedules[0]) || {frequency:1};
  badge.textContent = (s.frequency===2) ? 'кожні 2 тижні' : 'щотижня';

  title.appendChild(nameEl); title.appendChild(badge);

  const sub   = document.createElement('div'); sub.className='muted'; sub.textContent=(c.address||c.street||'');
  const phone = document.createElement('div'); phone.className='phone'; phone.textContent=(c.phone||'');

  left.appendChild(title); left.appendChild(sub); left.appendChild(phone);

  const actions=document.createElement('div'); actions.className='actions';
  const edit=document.createElement('button'); edit.className='btn'; edit.textContent='Редагувати';
  const del =document.createElement('button');  del.className='btn danger'; del.textContent='Видалити';
  edit.onclick=(e)=>{ e.stopPropagation(); editClient(c); };
  del.onclick =async (e)=>{ e.stopPropagation(); await deleteClient(c.id); refresh(); };
  actions.appendChild(edit); actions.appendChild(del);

  li.appendChild(avatar);
  li.appendChild(left);
  li.appendChild(actions);
  li.onclick=()=>viewClient(c);
  return li;
}

async function refresh(){
  const items=await listClients();
  const q=(search.value||'').toLowerCase();
  const filtered=items.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.street||'').toLowerCase().includes(q) ||
    (c.address||'').toLowerCase().includes(q) ||
    (c.phone||'').toLowerCase().includes(q)
  );
  clientsList.innerHTML='';
  filtered.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>clientsList.appendChild(clientRow(c)));

  const t=tomorrow();
  const tClients=items.filter(c=>(c.schedules||[]).some(s=>isScheduledOn(t,s)));
  tomorrowList.innerHTML='';
  tClients.forEach(c=>{ const li=document.createElement('li'); li.textContent=c.name+' — '+(c.address||c.street||''); tomorrowList.appendChild(li); });
  tomorrowEmpty.style.display=tClients.length?'none':'block';
}

/* ======================= VIEW DIALOG ======================= */
const viewDialog=document.getElementById('clientViewDialog');
const vName=document.getElementById('vName');
const vAddress=document.getElementById('vAddress');
const vStreet=document.getElementById('vStreet');
const vPhone=document.getElementById('vPhone');
const vNotes=document.getElementById('vNotes');
document.getElementById('vClose')?.addEventListener('click', ()=>viewDialog.close());

function viewClient(c){
  vName.textContent=c.name||'';
  vAddress.textContent=c.address||'';
  vStreet.textContent=c.street||'';
  vNotes.textContent=c.notes||'';
  if(c.phone){ vPhone.textContent=c.phone; vPhone.href='tel:'+c.phone.replace(/\s+/g,''); } else { vPhone.textContent=''; vPhone.removeAttribute('href'); }
  viewDialog.showModal();
}

/* ======================= SNAKE OVERLAY ======================= */
const snakeOverlay = document.getElementById('snakeOverlay');
const snakeStartBtn = document.getElementById('snakeStartBtn');
const snakeCanvas = document.getElementById('snakeCanvas');
const snakeCloseBtn = document.getElementById('snakeClose');
const sctx = snakeCanvas.getContext('2d');
const GRID = 16, N = 20;
let snake, dir, food, loop, speed;

function rndCell(){ return {x:Math.floor(Math.random()*N), y:Math.floor(Math.random()*N)}; }

function resetSnake(){
  snake=[{x:10,y:10},{x:9,y:10},{x:8,y:10}];
  dir={x:1,y:0}; food=rndCell(); speed=110;
}
function drawCell(x,y,color){ sctx.fillStyle=color; sctx.fillRect(x*GRID,y*GRID,GRID-1,GRID-1); }

function stepSnake(){
  const head={x:(snake[0].x+dir.x+N)%N, y:(snake[0].y+dir.y+N)%N};
  if (snake.some((s,i)=>i>0 && s.x===head.x && s.y===head.y)){ resetSnake(); }
  else {
    snake.unshift(head);
    if (head.x===food.x && head.y===food.y){ food=rndCell(); if (speed>60) speed-=3; }
    else snake.pop();
  }
  sctx.clearRect(0,0,snakeCanvas.width,snakeCanvas.height);
  drawCell(food.x, food.y, '#22c55e');
  snake.forEach((s,i)=> drawCell(s.x,s.y, i===0?'#60a5fa':'#94a3b8'));
  clearTimeout(loop);
  loop=setTimeout(stepSnake, speed);
}
function startSnake(){ resetSnake(); stepSnake(); }
function setDir(nx,ny){
  if (snake.length>1 && (snake[0].x+nx===snake[1].x) && (snake[0].y+ny===snake[1].y)) return;
  dir={x:nx,y:ny};
}
snakeCanvas.addEventListener('mousedown', e => {
  const rect = snakeCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const headX = (snake[0].x + 0.5) * GRID, headY = (snake[0].y + 0.5) * GRID;
  const dx = x - headX, dy = y - headY;
  if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
  else setDir(0, dy > 0 ? 1 : -1);
});
snakeStartBtn.addEventListener('click', ()=>{
  document.getElementById('snakeStartScreen').style.display='none';
  document.getElementById('snakeGameArea').style.display='block';
  startSnake();
});
snakeCloseBtn.addEventListener('click', ()=>{
  snakeOverlay.style.display='none';
  document.getElementById('snakeStartScreen').style.display='block';
  document.getElementById('snakeGameArea').style.display='none';
  clearTimeout(loop);
});
document.getElementById('openSnake')?.addEventListener('click', ()=>{
  snakeOverlay.style.display='flex';
});

/* ======================= BOOT ======================= */
async function requestNotif(){ if(!('Notification'in window)) return; if(Notification.permission==='default'){ try{ await Notification.requestPermission(); }catch{} } }
window.addEventListener('load', async ()=>{
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./service-worker.js'); }catch{} }
  await openDB(); await requestNotif(); refresh();
});
