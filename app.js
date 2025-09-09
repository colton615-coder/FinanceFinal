
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
/* =========================
   PATCH: Chart.js theming (colors, gradients, pro look)
   - Applies to existing charts (trend, categories, income/expense)
   - Reacts to theme changes and window resize
   ========================= */
(function fancyCharts(){
  if (!window.Chart) return;

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function hexToRgba(hex, alpha = 1) {
    const h = hex.replace('#','');
    const bigint = parseInt(h.length === 3 ? h.split('').map(x=>x+x).join('') : h, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  function palette() {
    return [
      cssVar('--ch1','#60a5fa'),
      cssVar('--ch2','#34d399'),
      cssVar('--ch3','#f472b6'),
      cssVar('--ch4','#f59e0b'),
      cssVar('--ch5','#a78bfa'),
      cssVar('--ch6','#22d3ee'),
    ];
  }

  function styleScales(opts) {
    const tick = cssVar('--fg', '#e5e7eb');
    const grid = 'rgba(107, 114, 128, 0.20)'; // slate-500 @ 20%
    if (opts.scales?.x) {
      opts.scales.x.ticks = Object.assign({ color: tick }, opts.scales.x.ticks || {});
      opts.scales.x.grid  = Object.assign({ color: grid },  opts.scales.x.grid  || {});
    }
    if (opts.scales?.y) {
      opts.scales.y.ticks = Object.assign({ color: tick }, opts.scales.y.ticks || {});
      opts.scales.y.grid  = Object.assign({ color: grid },  opts.scales.y.grid  || {});
    }
    if (opts.plugins?.legend?.labels) {
      opts.plugins.legend.labels.color = tick;
    }
  }

  function updateAllCharts() {
    const ids = ['ch-trend','ch-categories','ch-income-expense'];
    ids.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (!el) return;
      const chart = Chart.getChart(el);
      if (!chart) return;

      const pal = palette();
      const p0 = pal[0], p1 = pal[1], p2 = pal[2];

      // Global options polish
      chart.options = chart.options || {};
      chart.options.responsive = true;
      chart.options.maintainAspectRatio = false;
      chart.options.plugins = chart.options.plugins || {};
      chart.options.plugins.tooltip = Object.assign({ backgroundColor: 'rgba(15,23,42,0.92)', titleColor:'#fff', bodyColor:'#e5e7eb', borderWidth:1, borderColor:'rgba(255,255,255,0.06)' }, chart.options.plugins.tooltip || {});
      chart.options.plugins.legend = Object.assign({ labels: { color: cssVar('--fg','#e5e7eb') } }, chart.options.plugins.legend || {});
      styleScales(chart.options);

      if (chart.config.type === 'line') {
        const ctx = chart.ctx;
        const grad = ctx.createLinearGradient(0, 0, 0, chart.height);
        grad.addColorStop(0, hexToRgba(p0, 0.22));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        const ds = chart.data.datasets[0] || (chart.data.datasets[0] = {});
        ds.borderColor   = p0;
        ds.backgroundColor = grad;
        ds.pointRadius   = 0;
        ds.borderWidth   = 2;
        ds.fill          = true;
      }

      if (chart.config.type === 'doughnut') {
        const ds = chart.data.datasets[0] || (chart.data.datasets[0] = {});
        ds.backgroundColor = palette().map(c => hexToRgba(c, 0.90));
        ds.borderColor     = hexToRgba('#0b0c10', 1);  // matches dark bg nicely
        ds.borderWidth     = 2;
        chart.config.options = chart.config.options || {};
        chart.config.options.cutout = '62%';
      }

      if (chart.config.type === 'bar') {
        const ds = chart.data.datasets[0] || (chart.data.datasets[0] = {});
        ds.backgroundColor = hexToRgba(p2, 0.88);
        ds.borderColor     = hexToRgba(p2, 1);
        ds.borderWidth     = 1.5;
        ds.borderRadius    = 6;
      }

      chart.update();
    });
  }

  // Recolor on state changes (after series rebuild), on theme changes, and on resize
  document.addEventListener('state:changed', () => setTimeout(updateAllCharts, 0));
  window.addEventListener('resize', () => setTimeout(updateAllCharts, 0));
  try {
    const originalApply = window.applyTheme;
    window.applyTheme = function patchedApplyTheme() {
      originalApply?.();
      updateAllCharts();
    };
  } catch {}

  // First pass after load (and after dashboard mount)
  setTimeout(updateAllCharts, 400);
})();
/* =========================
   PATCH: Haptics on taps (best-effort)
   ========================= */
(function haptics(){
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  window.haptic = (pattern='tap') => {
    if (!canVibrate) return;
    if (pattern === 'tap') navigator.vibrate(10);
    else if (pattern === 'impact') navigator.vibrate([8,8]);
    else if (pattern === 'success') navigator.vibrate([5,5,5]);
  };
  document.addEventListener('click', e=>{
    if (e.target.closest?.('.btn') || e.target.closest?.('.tabbtn')) haptic('tap');
  }, { passive: true });
})();

/* =========================
   PATCH: Swipe between tabs (L/R)
   ========================= */
(function swipeTabs(){
  const order = ['dashboard','overview','budgets','transactions','settings'];
  let x0 = 0, y0 = 0;
  const threshold = 45;
  window.addEventListener('touchstart', e => {
    const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY;
  }, { passive: true });
  window.addEventListener('touchend', e => {
    const t = e.changedTouches[0]; const dx = t.clientX - x0; const dy = t.clientY - y0;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
    const cur = document.querySelector('.tab.active')?.id?.replace('tab-','') || 'overview';
    const idx = order.indexOf(cur);
    const next = dx < 0 ? order[Math.min(order.length-1, idx+1)] : order[Math.max(0, idx-1)];
    if (next && next !== cur) { haptic('impact'); activateTab(next); document.dispatchEvent(new Event('tab:changed')); }
  }, { passive: true });
})();

/* =========================
   PATCH: Pull-to-refresh on Dashboard (data re-render)
   ========================= */
(function pullToRefresh(){
  let startY = 0, armed = false;
  window.addEventListener('touchstart', e => {
    if (window.scrollY === 0 && document.getElementById('tab-dashboard')?.classList.contains('active')) {
      startY = e.touches[0].clientY; armed = true;
    }
  }, { passive: true });
  window.addEventListener('touchend', e => {
    if (!armed) return; armed = false;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 70) { haptic('success'); document.dispatchEvent(new CustomEvent('state:changed', { detail: state })); renderAll(); }
  }, { passive: true });
})();

/* =========================
   PATCH: Recurring transactions (monthly | weekly | biweekly)
   - Add [monthly] / [weekly] / [biweekly] to Description
   - OR long-press Save (600ms) to create a monthly rule
   ========================= */
(function recurringEngine(){
  if (!state.meta) state.meta = {};
  if (!Array.isArray(state.recurring)) state.recurring = [];

  function monthKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  function scheduleNext(rule, from) {
    const d = new Date(from);
    if (rule.cadence === 'weekly') d.setDate(d.getDate() + 7);
    else if (rule.cadence === 'biweekly') d.setDate(d.getDate() + 14);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }

  function applyRecurring() {
    const today = new Date();
    (state.recurring || []).forEach(rule => {
      let due = new Date(rule.nextRunISO || rule.anchorISO || new Date());
      // run all missed occurrences (safe catch-up)
      let ran = false;
      while (due <= today) {
        state.transactions.unshift({
          id: (crypto?.randomUUID?.() || String(Date.now())),
          type: rule.type, desc: rule.desc, amount: Number(rule.amount),
          category: rule.category || 'Other', dateISO: new Date(due).toISOString()
        });
        due = scheduleNext(rule, due);
        ran = true;
      }
      if (ran) {
        rule.nextRunISO = due.toISOString();
      }
    });
    if ((state.recurring || []).length) { saveState(); renderAll(); }
  }

  // Long-press on Save to mark as recurring (default monthly)
  const saveBtn = document.getElementById('saveTxn');
  let pressTimer;
  if (saveBtn) {
    saveBtn.addEventListener('touchstart', ()=> { pressTimer = setTimeout(()=> saveBtn.dataset.longpress = '1', 600); }, { passive: true });
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(evt => saveBtn.addEventListener(evt, ()=> clearTimeout(pressTimer), { passive: true }));
  }

  // Intercept txn submit to optionally create rule
  document.addEventListener('submit', function(e){
    if (e.target?.id !== 'txnForm') return;
    try {
      const rawDesc = document.getElementById('txnDesc')?.value || '';
      const tag = (rawDesc.match(/\[(monthly|weekly|biweekly)\]/i)||[])[1];
      const makeRecurring = !!tag || (saveBtn?.dataset.longpress === '1');

      if (makeRecurring) {
        const cadence = (tag || 'monthly').toLowerCase();
        const type = document.getElementById('txnType')?.value || 'expense';
        const amtRaw = String(document.getElementById('txnAmount')?.value || '').replace(',','.');
        const amount = parseFloat(amtRaw);
        const category = (document.getElementById('txnCategory')?.value || 'Other').trim() || 'Other';
        const desc = rawDesc.replace(/\[(monthly|weekly|biweekly)\]/ig,'').trim();
        const anchor = new Date();
        const next = scheduleNext({ cadence }, anchor);
        state.recurring.push({
          id: (crypto?.randomUUID?.() || String(Date.now())),
          type, amount, category, desc,
          cadence, anchorISO: anchor.toISOString(), nextRunISO: next.toISOString()
        });
        saveState();
        saveBtn.dataset.longpress = '';
      }
    } catch {}
  }, { capture: true });

  // Run on load and then every 6 hours
  applyRecurring();
  setInterval(applyRecurring, 6 * 60 * 60 * 1000);
})();

/* =========================
   PATCH: Budget rollovers (carry leftover -> next month)
   - Stores state.rollovers { [category]: amount }
   - Adjusts budget cards + KPI usedPct to include carry
   ========================= */
(function budgetRollovers(){
  if (!state.meta) state.meta = {};
  if (!state.meta.lastRolloverMonth) state.meta.lastRolloverMonth = '';
  if (!state.rollovers) state.rollovers = {};

  function monthKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

  function applyRolloverIfNeeded() {
    const nowKey = monthKey();
    if (state.meta.lastRolloverMonth === nowKey) return;

    const prev = new Date(); prev.setMonth(prev.getMonth() - 1);
    const prevKey = monthKey(prev);

    const spentByCat = {};
    state.transactions
      .filter(t => t.type === 'expense' && t.dateISO?.startsWith(prevKey))
      .forEach(t => { const c = t.category || 'Other'; spentByCat[c] = (spentByCat[c] || 0) + Number(t.amount || 0); });

    const carry = {};
    state.budgets.forEach(b => {
      const spent = spentByCat[b.category] || 0;
      const leftover = Math.max(0, Number(b.amount || 0) - spent);
      if (leftover > 0) carry[b.category] = (state.rollovers?.[b.category] || 0) + leftover;
    });

    state.rollovers = carry;
    state.meta.lastRolloverMonth = nowKey;
    saveState();
  }

  const _renderBudgets = window.renderBudgets;
  window.renderBudgets = function patchedRenderBudgets(){
    applyRolloverIfNeeded();

    const wrap = document.getElementById('budgetList'); if (wrap) wrap.innerHTML = '';
    const totalBase   = state.budgets.reduce((s,b)=>s + Number(b.amount || 0), 0);
    const totalCarry  = state.budgets.reduce((s,b)=> s + (state.rollovers?.[b.category] || 0), 0);
    const totalBudget = totalBase + totalCarry;
    const totalSpent  = state.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
    const usedPct     = totalBudget ? Math.min(100, (totalSpent/totalBudget)*100) : 0;

    const prog = document.getElementById('budgetProgress');
    const used = document.getElementById('budgetUsedPct');
    const rem  = document.getElementById('budgetRemaining');
    if (prog) prog.style.width = `${usedPct.toFixed(1)}%`;
    if (used) used.textContent = `${usedPct.toFixed(1)}% used`;
    if (rem)  rem.textContent  = `${fmt(totalBudget - totalSpent, state.settings.currency)} remaining`;

    const byCat = {};
    state.transactions.filter(t=>t.type==='expense').forEach(t => {
      const c = t.category || 'Other';
      byCat[c] = (byCat[c] || 0) + Number(t.amount || 0);
    });

    state.budgets.forEach(b => {
      const spent   = byCat[b.category] || 0;
      const budget  = Number(b.amount || 0) + (state.rollovers?.[b.category] || 0);
      const pct     = budget ? (spent / budget) * 100 : 0;
      const over    = pct > 100;
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div>
          <div><strong>${b.category}</strong></div>
          <div class="meta">${fmt(spent, state.settings.currency)} of ${fmt(budget, state.settings.currency)}</div>
        </div>
        <div style="text-align:right">
          <div class="meta">${pct.toFixed(1)}% used</div>
          ${over ? `<div class="meta" style="color:#f87171">Over by ${fmt(spent - budget, state.settings.currency)}</div>`
                 : `<div class="meta">${fmt(budget - spent, state.settings.currency)} left</div>`}
        </div>`;
      document.getElementById('budgetList')?.appendChild(item);
    });
  };

  const _calc = window.calcMonthTotals;
  window.calcMonthTotals = function patchedCalcMonthTotals(){
    applyRolloverIfNeeded();
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthTx = state.transactions.filter(t => t.dateISO?.startsWith(ym));
    const income  = monthTx.filter(t => t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
    const expenses= monthTx.filter(t => t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
    const base    = state.budgets.reduce((s,b)=>s+Number(b.amount||0),0);
    const carry   = Object.values(state.rollovers || {}).reduce((s,v)=>s+Number(v||0),0);
    const totalBudget = base + carry;
    const usedPct = totalBudget ? Math.min(100, Math.round((expenses/totalBudget)*100)) : 0;
    return { income, expenses, net: income - expenses, usedPct, totalBudget };
  };

  applyRolloverIfNeeded();
})();

/* =========================
   PATCH: Lighthouse helpers (idle work + passive listeners already used)
   ========================= */
(function lighthouseMicro(){
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1));
  idle(() => {
    // trigger lazy dashboard series build without blocking first paint
    document.dispatchEvent(new CustomEvent('state:changed', { detail: state }));
  });
})();
