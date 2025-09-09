
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
/* =========================
   PATCH: Vue + Chart.js Dashboard
   ========================= */

// expose state for framework code
try { if (!window.state) window.state = state; } catch {}

// emit change events whenever saveState runs
(function patchSaveState() {
  try {
    const original = saveState;
    window.saveState = function patchedSaveState() {
      original();
      document.dispatchEvent(new CustomEvent("state:changed", { detail: window.state }));
    };
  } catch {}
})();

// basic utils reused by Vue
function _currencySymbol(cur) {
  return ({ USD:'$', EUR:'€', GBP:'£', CAD:'C$', AUD:'A$' })[cur] || '$';
}
function _fmt(n, cur) {
  return `${_currencySymbol(cur)}${(+n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function _monthSlice(transactions) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return transactions.filter(t => t.dateISO && t.dateISO.startsWith(ym));
}

// Vue app + charts
(function initAnalytics() {
  const hasFrameworks = !!(window.Vue && window.Chart);
  if (!hasFrameworks) return;

  let charts = { trend: null, cats: null, comp: null };
  let vueApp = null;

  function computeKPI() {
    const cur = window.state.settings.currency || 'USD';
    const month = _monthSlice(window.state.transactions || []);
    const income = month.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const expenses = month.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    const net = income - expenses;
    const totalBudget = (window.state.budgets || []).reduce((s, b) => s + Number(b.amount || 0), 0);
    const usedPct = totalBudget ? Math.min(100, Math.round((expenses / totalBudget) * 100)) : 0;

    return {
      income, expenses, net, usedPct, cur,
      incomeDisplay: _fmt(income, cur),
      expensesDisplay: _fmt(expenses, cur),
      netDisplay: _fmt(net, cur),
      usedPctDisplay: `${usedPct}%`
    };
  }

  function computeSeries() {
    const cur = window.state.settings.currency || 'USD';
    const tx = window.state.transactions || [];

    // 30-day running balance
    const today = new Date();
    let balance = 0;
    const labels30 = [];
    const data30 = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const inc = tx.filter(t => t.type === 'income' && t.dateISO?.startsWith(key))
                    .reduce((s, t) => s + Number(t.amount || 0), 0);
      const exp = tx.filter(t => t.type === 'expense' && t.dateISO?.startsWith(key))
                    .reduce((s, t) => s + Number(t.amount || 0), 0);
      balance += inc - exp;
      labels30.push(key.slice(5)); // MM-DD
      data30.push(balance);
    }

    // category breakdown (this month)
    const month = _monthSlice(tx).filter(t => t.type === 'expense');
    const byCat = {};
    month.forEach(t => {
      const cat = (t.category || 'Other').toString();
      byCat[cat] = (byCat[cat] || 0) + Number(t.amount || 0);
    });
    const cats = Object.keys(byCat);
    const catVals = cats.map(c => byCat[c]);

    // income vs expense (this month)
    const income = month.reduce((s, t) => s + 0, 0) +
                   _monthSlice(tx).filter(t => t.type === 'income')
                                  .reduce((s, t) => s + Number(t.amount || 0), 0);
    const expenses = month.reduce((s, t) => s + Number(t.amount || 0), 0);

    return {
      cur,
      trend: { labels: labels30, data: data30 },
      cats: { labels: cats, data: catVals },
      comp: { labels: ['Income', 'Expenses'], data: [income, expenses] }
    };
  }

  function upsertCharts() {
    const ctxTrend = document.getElementById('ch-trend');
    const ctxCats  = document.getElementById('ch-categories');
    const ctxComp  = document.getElementById('ch-income-expense');
    if (!ctxTrend || !ctxCats || !ctxComp) return;

    const series = computeSeries();

    // Trend (line)
    if (!charts.trend) {
      charts.trend = new Chart(ctxTrend, {
        type: 'line',
        data: { labels: series.trend.labels,
          datasets: [{ label: 'Balance', data: series.trend.data, tension: 0.25 }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    } else {
      charts.trend.data.labels = series.trend.labels;
      charts.trend.data.datasets[0].data = series.trend.data;
      charts.trend.update();
    }

    // Categories (doughnut)
    if (!charts.cats) {
      charts.cats = new Chart(ctxCats, {
        type: 'doughnut',
        data: { labels: series.cats.labels,
          datasets: [{ data: series.cats.data }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    } else {
      charts.cats.data.labels = series.cats.labels;
      charts.cats.data.datasets[0].data = series.cats.data;
      charts.cats.update();
    }

    // Income vs Expense (bar)
    if (!charts.comp) {
      charts.comp = new Chart(ctxComp, {
        type: 'bar',
        data: { labels: series.comp.labels,
          datasets: [{ label: 'Amount', data: series.comp.data }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    } else {
      charts.comp.data.labels = series.comp.labels;
      charts.comp.data.datasets[0].data = series.comp.data;
      charts.comp.update();
    }
  }

  // Mount Vue app when Dashboard becomes visible
  function ensureDashboardMounted() {
    if (vueApp) {
      upsertCharts();
      return;
    }
    const el = document.getElementById('dashboardApp');
    if (!el) return;

    const { createApp, reactive } = Vue;
    const kpi = reactive(computeKPI());

    vueApp = createApp({
      data: () => ({ kpi }),
      mounted() {
        upsertCharts();
      }
    });
    vueApp.mount('#dashboardApp');

    // Update Vue + charts when state changes
    document.addEventListener('state:changed', () => {
      const next = computeKPI();
      Object.assign(kpi, next);
      upsertCharts();
    }, { passive: true });

    // Also refresh when window resizes (Chart.js responsive)
    window.addEventListener('resize', () => upsertCharts());
  }

  // Hook tab button to mount dashboard lazily
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.tabbtn[data-tab="dashboard"]');
    if (btn) {
      // wait for your existing tab change code to flip sections
      setTimeout(ensureDashboardMounted, 0);
    }
  });

  // If Dashboard is the first view (unlikely), still init
  if (document.getElementById('tab-dashboard')?.classList.contains('active')) {
    ensureDashboardMounted();
  }

  // On first load, broadcast current state so listeners get initial values
  document.dispatchEvent(new CustomEvent("state:changed", { detail: window.state }));
})();
/* =========================
   PATCH: Explicit Save/Revert UI for Settings
   ========================= */
(function settingsSaveUI(){
  const saveBtn   = document.getElementById('settingsSaveBtn');
  const revertBtn = document.getElementById('settingsRevertBtn');
  const savedLbl  = document.getElementById('settingsSaved');
  const themeSel  = document.getElementById('themeSelect');
  const curSel    = document.getElementById('currencySelect');
  const compactT  = document.getElementById('compactToggle');

  if (!saveBtn || !revertBtn) return;

  function markUnsaved(){
    if (savedLbl){
      savedLbl.textContent = 'Unsaved changes';
      savedLbl.classList.remove('hidden');
    }
  }
  function markSaved(){
    if (savedLbl){
      savedLbl.textContent = 'Saved';
      savedLbl.classList.remove('hidden');
      setTimeout(()=> savedLbl.classList.add('hidden'), 1200);
    }
  }

  // Show "unsaved" note when user tweaks controls
  [themeSel, curSel, compactT].forEach(n => {
    if (!n) return;
    n.addEventListener('input',  markUnsaved);
    n.addEventListener('change', markUnsaved);
  });

  // Save button just forces a save + reapplies theme (autosave already occurs)
  saveBtn.addEventListener('click', () => {
    try { saveState(); applyTheme(); } catch {}
    markSaved();
  });

  // Revert restores controls from current saved state
  revertBtn.addEventListener('click', () => {
    try {
      if (themeSel) themeSel.value = state.settings.theme || 'auto';
      if (curSel)   curSel.value   = state.settings.currency || 'USD';
      if (compactT) compactT.checked = !!state.settings.compact;
      applyTheme();
    } catch {}
    markSaved();
  });
})();
