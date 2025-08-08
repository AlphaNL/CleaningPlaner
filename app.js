// IndexedDB
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

// Elements
const clientsList = document.getElementById('clientsList');
const tomorrowList = document.getElementById('tomorrowList');
const tomorrowEmpty = document.getElementById('tomorrowEmpty');
const dialogEl = document.getElementById('clientDialog');
const form = document.getElementById('clientForm');
const addBtn = document.getElementById('addClientBtn');
const search = document.getElementById('search');

// Add client
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
    notes  : document.getElementById('notes').value.trim(),
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

// View client
const viewDialog=document.getElementById('clientViewDialog');
document.getElementById('vClose')?.addEventListener('click', ()=>viewDialog.close());

function viewClient(c){
  document.getElementById('vName').textContent=c.name;
  document.getElementById('vAddress').textContent=c.address;
  document.getElementById('vStreet').textContent=c.street;
  document.getElementById('vNotes').textContent=c.notes;
  if(c.phone){ document.getElementById('vPhone').textContent=c.phone; document.getElementById('vPhone').href='tel:'+c.phone.replace(/\s+/g,''); }
  viewDialog.showModal();
}

// Render clients
function clientRow(c){
  const li=document.createElement('li');
  li.textContent=c.name;
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
  filtered.forEach(c=>clientsList.appendChild(clientRow(c)));
  tomorrowEmpty.style.display = items.length ? 'none':'block';
}

// Snake game
const snakeDialog=document.getElementById('snakeDialog');
const canvas=document.getElementById('snakeCanvas');
const ctx=canvas.getContext('2d');
let snake,dir,food,loop,speed,N=20,GRID=16;
function rndCell(){return {x:Math.floor(Math.random()*N),y:Math.floor(Math.random()*N)};}
function resetSnake(){snake=[{x:10,y:10},{x:9,y:10},{x:8,y:10}];dir={x:1,y:0};food=rndCell();speed=110;}
function drawCell(x,y,color){ctx.fillStyle=color;ctx.fillRect(x*GRID,y*GRID,GRID-1,GRID-1);}
function stepSnake(){
  const head={x:(snake[0].x+dir.x+N)%N,y:(snake[0].y+dir.y+N)%N};
  if(snake.some((s,i)=>i>0 && s.x===head.x && s.y===head.y)){resetSnake();}
  else{
    snake.unshift(head);
    if(head.x===food.x && head.y===food.y){food=rndCell();if(speed>60) speed-=3;}
    else snake.pop();
  }
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawCell(food.x,food.y,'#22c55e');
  snake.forEach((s,i)=>drawCell(s.x,s.y,i===0?'#60a5fa':'#94a3b8'));
  clearTimeout(loop);
  loop=setTimeout(stepSnake,speed);
}
document.getElementById('openSnake').onclick=()=>{snakeDialog.showModal();resetSnake();stepSnake();}
document.getElementById('btnCloseSnake').onclick=()=>{snakeDialog.close();clearTimeout(loop);}
canvas.addEventListener('click', e=>{
  const rect=canvas.getBoundingClientRect();
  const x=e.clientX-rect.left,y=e.clientY-rect.top;
  const headX=(snake[0].x+0.5)*GRID,headY=(snake[0].y+0.5)*GRID;
  const dx=x-headX,dy=y-headY;
  if(Math.abs(dx)>Math.abs(dy))dir={x:dx>0?1:-1,y:0};else dir={x:0,y:dy>0?1:-1};
});

window.addEventListener('load',async()=>{await openDB();refresh();});
