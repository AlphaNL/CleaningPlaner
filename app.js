// Відкриття БД
const DB_NAME = 'clean_planner_db';
const DB_VER  = 1;
let db;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if(!d.objectStoreNames.contains('clients')){
        const store = d.createObjectStore('clients', { keyPath:'id' });
        store.createIndex('name','name', {unique:false});
      }
    };
    req.onsuccess = ()=>{ db=req.result; resolve(); };
    req.onerror   = ()=> reject(req.error);
  });
}
function tx(name,mode='readonly'){ return db.transaction(name,mode).objectStore(name); }
async function listClients(){ return new Promise((res,rej)=>{ const r=tx('clients').getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error);}); }
async function saveClient(c){ return new Promise((res,rej)=>{ const r=tx('clients','readwrite').put(c); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}); }
async function deleteClient(id){return new Promise((res,rej)=>{ const r=tx('clients','readwrite').delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);});}

// Елементи
const dialogEl       = document.getElementById('clientDialog');
const form           = document.getElementById('clientForm');
const addBtn         = document.getElementById('addClientBtn');
const search         = document.getElementById('search');
const clientsList    = document.getElementById('clientsList');
const tomorrowList   = document.getElementById('tomorrowList');
const tomorrowEmpty  = document.getElementById('tomorrowEmpty');

// Відкрити форму
addBtn.addEventListener('click', ()=>{
  form.reset();
  document.getElementById('clientId').value='';
  document.getElementById('dialogTitle').textContent='Новий клієнт';
  dialogEl.showModal();
});

// Скасувати — просто закриває
document.getElementById('cancelBtn').addEventListener('click', ()=>{
  dialogEl.close();
});

// Зберегти
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

// Рендер клієнтів
function clientRow(c){
  const li = document.createElement('li');
  li.textContent = c.name;
  li.onclick = () => alert(c.name);
  return li;
}

async function refresh(){
  const items=await listClients();
  clientsList.innerHTML='';
  items.forEach(c=>clientsList.appendChild(clientRow(c)));
}

window.addEventListener('load', async ()=>{
  await openDB();
  refresh();
});
