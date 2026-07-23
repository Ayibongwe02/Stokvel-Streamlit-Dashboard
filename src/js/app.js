/**
 * app.js — Main entry point
 * Handles: data loading, page routing, role toggle (User / Analyst),
 * mobile nav, and auto-refresh every 60 s.
 */

import DataStore          from './data.js';
import { renderOverview } from './overview.js';
import { initMembers }    from './members.js';
import { renderForecastHub } from './forecastHub.js';
import { renderAnomaly }  from './anomaly.js';
import { renderRegional } from './regional.js';

// ── Page registry ──────────────────────────────────────────────
const PAGES = {
  overview: { title: 'Overview',        render: renderOverview,   analystOnly: false },
  forecast: { title: 'Forecasting Hub', render: renderForecastHub, analystOnly: false },
  members:  { title: 'Members',         render: initMembers,      analystOnly: false },
  anomaly:  { title: 'Anomaly Tracker', render: renderAnomaly,    analystOnly: true  },
  regional: { title: 'Regional View',   render: renderRegional,   analystOnly: true  },
};

let _activePage   = 'overview';
let _refreshTimer = null;
const REFRESH_MS  = 60_000; // auto-refresh every 60 s

// ── Role (User / Analyst) ────────────────────────────────────────
const ROLE_KEY = 'stokvel_role';
let _role = localStorage.getItem(ROLE_KEY) || 'user';

/**
 * Applies role-driven CSS classes / chip / hint text. Pure DOM work only —
 * safe to call at any point, including before DataStore has loaded.
 */
function applyRoleClasses() {
  document.body.classList.toggle('role-analyst', _role === 'analyst');
  document.body.classList.toggle('role-user', _role === 'user');

  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.role === _role);
  });

  const chip = document.getElementById('role-chip');
  if (chip) {
    chip.textContent = _role === 'analyst' ? 'Analyst View' : 'User View';
    chip.className = 'chip ' + (_role === 'analyst' ? 'chip-analyst' : 'chip-user');
  }

  const hint = document.getElementById('role-hint');
  if (hint) {
    hint.textContent = _role === 'analyst'
      ? 'Full model comparison, diagnostics & raw data.'
      : 'Simple balances, forecasts & alerts.';
  }
}

/**
 * Full role switch: updates classes AND re-renders the active page.
 * Only safe to call once DataStore has data loaded — callers during
 * initial boot should use applyRoleClasses() instead and let
 * loadAndRender() perform the first render.
 */
function applyRole() {
  applyRoleClasses();

  // If the current page is analyst-only and we've switched to User mode, bounce to Overview.
  if (_role === 'user' && PAGES[_activePage]?.analystOnly) {
    showPage('overview');
  } else {
    renderActive();
  }
}

function setRole(role) {
  if (role !== 'user' && role !== 'analyst') return;
  _role = role;
  localStorage.setItem(ROLE_KEY, role);
  applyRole();
}

function wireRoleToggle() {
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => setRole(btn.dataset.role));
  });
}

// ── Routing ────────────────────────────────────────────────────
function showPage(id) {
  if (!PAGES[id]) return;
  _activePage = id;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-' + id)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${id}"]`)?.classList.add('active');
  document.getElementById('topbar-title').textContent = PAGES[id].title;

  closeMobileNav();
  if (DataStore.get()) PAGES[id].render();
}

function renderActive() {
  if (!DataStore.get()) return; // data not loaded yet — nothing to render
  PAGES[_activePage]?.render();
}

// ── Data load + UI update ───────────────────────────────────────
async function loadAndRender() {
  try {
    await DataStore.load();
    updateMeta();
    renderActive();
    document.getElementById('loading-overlay')?.classList.add('hidden');
  } catch (err) {
    console.error('Dashboard data error:', err);
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.querySelector('.loading-text').textContent =
        'Failed to load data. Make sure dashboard_data.json exists. ' + err.message;
    }
  }
}

function updateMeta() {
  const at  = DataStore.generatedAt();
  const d   = new Date(at);
  const fmt = d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  document.getElementById('last-updated').textContent = 'Updated ' + fmt;
  document.getElementById('topbar-meta').textContent  = 'dashboard_data.json';

  const badge = document.querySelector('.nav-badge');
  if (badge) badge.textContent = DataStore.anomalies().length;

  const fc = document.getElementById('footer-fc-count');
  const tx = document.getElementById('footer-tx-count');
  if (fc) fc.textContent = DataStore.forecasting().length  + ' forecasting records';
  if (tx) tx.textContent = DataStore.transactions().length + ' transaction records';
}

// ── Auto-refresh ────────────────────────────────────────────────
function startAutoRefresh() {
  clearInterval(_refreshTimer);
  _refreshTimer = setInterval(async () => {
    console.log('[Stokvel] Auto-refreshing data…');
    await loadAndRender();
  }, REFRESH_MS);
}

// ── Nav wiring ──────────────────────────────────────────────────
function wireNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => showPage(item.dataset.page));
  });
}

// ── Mobile nav (hamburger) ───────────────────────────────────────
function openMobileNav()  { document.querySelector('.sidebar')?.classList.add('open'); }
function closeMobileNav() { document.querySelector('.sidebar')?.classList.remove('open'); }
function wireMobileNav() {
  document.getElementById('mobile-nav-btn')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('open');
  });
}

// ── Boot ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  wireNav();
  wireRoleToggle();
  wireMobileNav();
  applyRoleClasses();   // safe pre-data DOM setup only — do NOT render yet
  await loadAndRender(); // loads DataStore, then performs the first render
  startAutoRefresh();
});
