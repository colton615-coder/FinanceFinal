
const el = (id) => document.getElementById(id);
const $ = (sel, p=document) => p.querySelector(sel);
const $$ = (sel, p=document) => [...p.querySelectorAll(sel)];

const state = {
  settings: { theme: 'auto', currency: 'USD', compact: false },
  budgets: [],
  transactions: [],
};

const STORAGE_KEY = 'budget-mobile-state-v1';
function loadState(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) Object.assign(state, JSON.parse(raw)); }catch{} }
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

const currencySymbol = (cur) => ({USD:'$',EUR:'€',GBP:'£',CAD:'C$',AUD:'A$'})[cur] || '$';
const fmt = (n, cur) => `${currencySymbol(cur)}${(+n).toLocaleString(undefined,{maximumFractionDigits:2})}`;

function applyTheme(){
  const root = document.documentElement;
  const { theme, compact } = state.settings;
  if (theme === 'auto'){ const dark = matchMedia('(prefers-color-scheme: dark)').matches; root.classList.toggle('dark', dark); }
  else { root.classList.toggle('dark', theme==='dark'); }
  document.body.classList.toggle('compact', !!compact);
}

function activateTab(id){
  $$('.tab').forEach(s=>s.classList.remove('active'));
  el(`tab-${id}`).classList.add('active');
  $$('.tabbtn').forEach(b=>b.classList.remove('active'));
  $(`.tabbtn[data-tab="${id}"]`).classList.add('active');
  el('appTitle').textContent = id[0].toUpperCase() + id.slice(1);
}

function calcMonthTotals(){
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const list = state.transactions.filter(t=> t.dateISO.startsWith(ym));
  const income = list.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expenses = list.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const totalBudget = state.budgets.reduce((s,b)=>s+Number(b.amount),0) || 0;
  const usedPct = totalBudget ? Math.min(100, Math.round((expenses/totalBudget)*100)) : 0;
  return { income, expenses, net: income-expenses, usedPct, totalBudget };
}

function renderOverview(){
  const { income, expenses, net, usedPct } = calcMonthTotals();
  el('ov-income').textContent = fmt(income, state.settings.currency);
  el('ov-expenses').textContent = fmt(expenses, state.settings.currency);
  el('ov-net').textContent = fmt(net, state.settings.currency);
  el('ov-budget').textContent = `${usedPct}%`;
  drawBars();
  drawLine();
}

function renderBudgets(){
  const wrap = el('budgetList'); wrap.innerHTML = '';
  const totalBudget = state.budgets.reduce((s,b)=>s+Number(b.amount),0);
  const totalSpent = state.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const usedPct = totalBudget ? Math.min(100,(totalSpent/totalBudget)*100) : 0;
  el('budgetProgress').style.width = `${usedPct.toFixed(1)}%`;
  el('budgetUsedPct').textContent = `${usedPct.toFixed(1)}% used`;
  el('budgetRemaining').textContent = `${fmt(totalBudget-totalSpent, state.settings.currency)} remaining`;

  const byCat = {};
  state.transactions.filter(t=>t.type==='expense').forEach(t=> { byCat[t.category||'Other']=(byCat[t.category||'Other']||0)+Number(t.amount); });
  state.budgets.forEach(b=>{
    const spent = byCat[b.category]||0; const pct = b.amount ? (spent/b.amount)*100 : 0; const over = pct>100;
    const item = document.createElement('div'); item.className='item';
    item.innerHTML = `<div><div><strong>${b.category}</strong></div>
      <div class="meta">${fmt(spent, state.settings.currency)} of ${fmt(b.amount, state.settings.currency)}</div></div>
      <div style="text-align:right"><div class="meta">${pct.toFixed(1)}% used</div>
      ${over ? `<div class="meta" style="color:#f87171">Over by ${fmt(spent-b.amount, state.settings.currency)}</div>` : `<div class="meta">${fmt(b.amount-spent, state.settings.currency)} left</div>`}</div>`;
    wrap.appendChild(item);
  });
}

function renderTransactions(){
  const sel = el('filterCategory');
  const cats = Array.from(new Set(state.transactions.map(t=>(t.category||'Other').toLowerCase())));
  sel.innerHTML = `<option value="all">All categories</option>` + cats.map(c=>`<option value="${c}">${c[0].toUpperCase()+c.slice(1)}</option>`).join('');

  const q = el('search').value.toLowerCase();
  const cat = el('filterCategory').value;
  const sort = el('sortBy').value;
  let list = state.transactions.filter(t=> t.desc.toLowerCase().includes(q) && (cat==='all' || (t.category||'other').toLowerCase()===cat));
  list.sort((a,b)=> sort==='date' ? new Date(b.dateISO)-new Date(a.dateISO) : Number(b.amount)-Number(a.amount));

  const wrap = el('txnList'); wrap.innerHTML='';
  if(!list.length) el('emptyTxn').classList.remove('hidden'); else el('emptyTxn').classList.add('hidden');
  list.forEach(t=>{
    const item = document.createElement('div'); item.className='item';
    const sign = t.type==='income' ? '+' : '-';
    item.innerHTML = `<div><div><strong>${t.desc}</strong></div><div class="meta">${new Date(t.dateISO).toLocaleString()} • ${(t.category||'Other')}</div></div>
      <div style="text-align:right; ${t.type==='income'?'color:#22c55e':'color:#ef4444'}">${sign}${fmt(t.amount, state.settings.currency)}</div>`;
    wrap.appendChild(item);
  });
}

function ns(tag,attrs={}){ const e=document.createElementNS('http://www.w3.org/2000/svg',tag); Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v))); return e; }
function drawBars(){
  const elc = el('barChart'); elc.innerHTML='';
  const width = elc.clientWidth||320, height = elc.clientHeight||160;
  const svg = ns('svg',{width,height});
  const now = new Date();
  const days = [...Array(7)].map((_,i)=>{ const d=new Date(now); d.setDate(d.getDate()-(6-i));
    const key=d.toISOString().slice(0,10);
    const sum=state.transactions.filter(t=>t.type==='expense' && t.dateISO.startsWith(key)).reduce((s,t)=>s+Number(t.amount),0);
    return {sum}; });
  const max = Math.max(10, ...days.map(d=>d.sum)); const barW = width/7 - 6;
  days.forEach((d,idx)=>{ const h=Math.round((d.sum/max)*(height-20));
    svg.appendChild(ns('rect',{x: idx*(barW+6)+3, y: height-h-10, width: barW, height: h, fill:'#2563eb'})); });
  elc.appendChild(svg);
}
function drawLine(){
  const elc = el('lineChart'); elc.innerHTML='';
  const width = elc.clientWidth||320, height = elc.clientHeight||160;
  const svg = ns('svg',{width,height});
  const today=new Date(); let balance=0;
  const pts=[...Array(30)].map((_,i)=>{ const d=new Date(today); d.setDate(d.getDate()-(29-i));
    const key=d.toISOString().slice(0,10);
    const inc=state.transactions.filter(t=>t.type==='income' && t.dateISO.startsWith(key)).reduce((s,t)=>s+Number(t.amount),0);
    const exp=state.transactions.filter(t=>t.type==='expense' && t.dateISO.startsWith(key)).reduce((s,t)=>s+Number(t.amount),0);
    balance += inc-exp; return {x:i,y:balance}; });
  const minY=Math.min(...pts.map(p=>p.y),0), maxY=Math.max(...pts.map(p=>p.y),10);
  const d = pts.map((p,i)=>{ const x=(i/(pts.length-1))*(width-20)+10; const y=height-10-((p.y-minY)/(maxY-minY||1))*(height-20); return `${i?'L':'M'}${x},${y}`; }).join(' ');
  svg.appendChild(ns('path',{d,stroke:'#22c55e',fill:'none','stroke-width':2}));
  elc.appendChild(svg);
}

function bindEvents(){
  $$('.tabbtn').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab)));
  ['search','filterCategory','sortBy'].forEach(id=> el(id).addEventListener('input', renderTransactions));
  el('addTxnBtn').addEventListener('click', ()=> el('txnDialog').showModal());
  el('saveTxn').addEventListener('click', (ev)=>{
    ev.preventDefault();
    const t = { id: crypto.randomUUID(), type: el('txnType').value, desc: el('txnDesc').value.trim(),
      amount: parseFloat(el('txnAmount').value), category: el('txnCategory').value.trim() || 'Other', dateISO: new Date().toISOString() };
    if(!t.desc || isNaN(t.amount)) return;
    state.transactions.unshift(t); saveState(); el('txnForm').reset(); el('txnDialog').close(); renderAll();
  });
  el('addBudgetBtn').addEventListener('click', ()=> el('budgetDialog').showModal());
  el('saveBudget').addEventListener('click', (ev)=>{
    ev.preventDefault();
    const cat = el('budgetCategory').value.trim(); const amt = parseFloat(el('budgetAmount').value);
    if(!cat || isNaN(amt)) return;
    const exist = state.budgets.find(b=>b.category.toLowerCase()===cat.toLowerCase());
    if(exist) exist.amount = amt; else state.budgets.push({category:cat, amount:amt});
    saveState(); el('budgetForm').reset(); el('budgetDialog').close(); renderAll();
  });
  el('themeSelect').addEventListener('change', e=> { state.settings.theme = e.target.value; saveState(); applyTheme(); });
  el('currencySelect').addEventListener('change', e=> { state.settings.currency = e.target.value; saveState(); renderAll(); });
  el('compactToggle').addEventListener('change', e=> { state.settings.compact = e.target.checked; saveState(); applyTheme(); });

  el('exportBtn').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(state)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'budget-data.json'; a.click();
    URL.revokeObjectURL(url);
  });
  el('importBtn').addEventListener('click', ()=> el('importFile').click());
  el('importFile').addEventListener('change', async e=>{
    const file = e.target.files[0]; if(!file) return;
    try { const text = await file.text(); const data = JSON.parse(text); Object.assign(state, data); saveState(); applyTheme(); renderAll(); } catch {}
  });
  el('clearBtn').addEventListener('click', ()=> { if(confirm('Delete ALL local data?')){ state.budgets=[]; state.transactions=[]; saveState(); renderAll(); } });

  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault(); deferredPrompt = e; el('installBtn').classList.remove('hidden');
  });
  el('installBtn').addEventListener('click', async ()=>{
    if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; el('installBtn').classList.add('hidden');
  });
}

function renderAll(){ renderOverview(); renderBudgets(); renderTransactions(); }

loadState(); applyTheme(); bindEvents(); renderAll(); activateTab('overview');
