
/* Simple IndexedDB setup */
const DB_NAME = 'clean_planner_db';
const DB_VER = 1;
let db;

const freq = { weekly:1, biweekly:2 };

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      const clients = d.createObjectStore('clients', { keyPath:'id' });
      clients.createIndex('name','name', { unique:false });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode='readonly') {
  return db.transaction(store, mode).objectStore(store);
}

async function listClients() {
  return new Promise((res,rej) => {
    const r = tx('clients').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

async function saveClient(client) {
  return new Promise((res,rej) => {
    const r = tx('clients','readwrite').put(client);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

async function deleteClient(id) {
  return new Promise((res,rej) => {
    const r = tx('clients','readwrite').delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/* Scheduling helpers */
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function tomorrow(){ const x=new Date(); x.setDate(x.getDate()+1); return x; }
function weekdayOf(date){ const w = date.getDay(); return (w===0)?1:(w+1); } // 1=Mon..7=Sun

function nextOccurrence(from, schedule){
  const cal = new Date(from);
  // find next target weekday
  let daysAhead = (schedule.weekday - weekdayOf(cal) + 7) % 7;
  if (daysAhead===0) daysAhead = 7; // next occurrence, not today
  const firstHit = new Date(startOfDay(cal).getTime() + daysAhead*86400000);
  if (schedule.frequency === 2) { // biweekly
    const start = new Date(schedule.startDate || Date.now());
    const weeks = Math.floor((startOfDay(firstHit)-startOfDay(start))/ (7*86400000));
    if (weeks % 2 !== 0) {
      return new Date(firstHit.getTime() + 7*86400000);
    }
  }
  return firstHit;
}

function isScheduledOn(date, schedule){
  // check if next occurrence computed from yesterday lands on 'date'
  const from = new Date(date.getTime() - 86400000);
  const occ = nextOccurrence(from, schedule);
  return startOfDay(occ).getTime() === startOfDay(date).getTime();
}

/* Simple mini chart (bar) using Canvas */
function renderChart(ctx, arr){
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(0,0,W,H);
  const pad = 12;
  const bw = (W - pad*2) / arr.length * 0.7;
  const max = Math.max(1, ...arr.map(x=>x.count));
  arr.forEach((p, i) => {
    const x = pad + i * ((W - pad*2)/arr.length) + (((W - pad*2)/arr.length)-bw)/2;
    const h = (H - pad*2) * (p.count / max);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x, H - pad - h, bw, h);
  });
}

/* UI logic */
const tomorrowList = document.getElementById('tomorrowList');
const tomorrowEmpty = document.getElementById('tomorrowEmpty');
const clientsList = document.getElementById('clientsList');
const dialogEl = document.getElementById('clientDialog');
const form = document.getElementById('clientForm');
const addBtn = document.getElementById('addClientBtn');
const search = document.getElementById('search');

addBtn.addEventListener('click', () => {
  form.reset();
  document.getElementById('clientId').value = '';
  document.getElementById('dialogTitle').textContent = 'Новий клієнт';
  dialogEl.showModal();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('clientId').value || crypto.randomUUID();
  const client = {
    id,
    name: document.getElementById('name').value.trim(),
    street: document.getElementById('street').value.trim(),
    address: document.getElementById('address').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    schedules: [{
      weekday: parseInt(document.getElementById('weekday').value,10),
      frequency: parseInt(document.getElementById('frequency').value,10),
      startDate: new Date().toISOString()
    }],
    reminders: [{
      time: document.getElementById('remTime').value,
      offsetMinutes: parseInt(document.getElementById('remOffset').value,10) || 0,
      isEnabled: true
    }]
  };
  await saveClient(client);
  dialogEl.close();
  refresh();
});

function clientRow(c){
  const li = document.createElement('li');
  const left = document.createElement('div'); left.className='grow';
  const title = document.createElement('div'); title.textContent = c.name;
  const sub = document.createElement('div'); sub.className='muted';
  sub.textContent = c.address || c.street;
  left.appendChild(title); left.appendChild(sub);
  const actions = document.createElement('div'); actions.className='actions';
  const edit = document.createElement('button'); edit.className='btn'; edit.textContent='Редагувати';
  const del = document.createElement('button'); del.className='btn danger'; del.textContent='Видалити';
  edit.onclick = () => editClient(c);
  del.onclick = async () => { await deleteClient(c.id); refresh(); };
  actions.appendChild(edit); actions.appendChild(del);
  li.appendChild(left); li.appendChild(actions);
  return li;
}

function editClient(c){
  document.getElementById('clientId').value = c.id;
  document.getElementById('name').value = c.name;
  document.getElementById('street').value = c.street||'';
  document.getElementById('address').value = c.address||'';
  document.getElementById('notes').value = c.notes||'';
  const s = (c.schedules && c.schedules[0]) || {weekday:2, frequency:1};
  document.getElementById('weekday').value = s.weekday;
  document.getElementById('frequency').value = s.frequency;
  const r = (c.reminders && c.reminders[0]) || {time:'09:00', offsetMinutes:0};
  document.getElementById('remTime').value = r.time || '09:00';
  document.getElementById('remOffset').value = r.offsetMinutes || 0;
  document.getElementById('dialogTitle').textContent = 'Редагувати клієнта';
  dialogEl.showModal();
}

search.addEventListener('input', () => refresh());

async function refresh(){
  const items = await listClients();
  const q = (search.value||'').toLowerCase();
  const filtered = items.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.street||'').toLowerCase().includes(q) ||
    (c.address||'').toLowerCase().includes(q)
  );
  // Clients list
  clientsList.innerHTML = '';
  filtered.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c => clientsList.appendChild(clientRow(c)));
  // Tomorrow
  const tmr = tomorrow();
  const tmrClients = items.filter(c => (c.schedules||[]).some(s => isScheduledOn(tmr, s)));
  tomorrowList.innerHTML = '';
  tmrClients.forEach(c => {
    const li = document.createElement('li');
    li.textContent = c.name + ' — ' + (c.address || c.street || '');
    tomorrowList.appendChild(li);
  });
  tomorrowEmpty.style.display = tmrClients.length? 'none':'block';
  // Chart
  const arr = [];
  for(let i=0;i<7;i++){
    const day = new Date(); day.setDate(day.getDate()+i);
    const count = items.filter(c => (c.schedules||[]).some(s => isScheduledOn(day, s))).length;
    arr.push({day, count});
  }
  const ctx = document.getElementById('chart').getContext('2d');
  renderChart(ctx, arr);
}

/* Local notifications (web) — best-effort */
async function requestNotif(){
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
}

window.addEventListener('load', async () => {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/service-worker.js'); } catch {}
  }
  await openDB();
  await requestNotif();
  refresh();
});
