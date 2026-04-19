/* ════════════════════════════════════════════
   INVISIBLE INK — app.js  ·  by Muhammad Daniya
════════════════════════════════════════════ */
'use strict';

/* ── DAILY PROMPTS ── */
const PROMPTS = [
  "What are you carrying that you haven't put down yet?",
  "Describe a moment from today that you almost missed.",
  "What truth are you avoiding?",
  "Who do you wish understood you better?",
  "What would you say if you knew they'd never read it?",
  "Write to the version of you from five years ago.",
  "What part of yourself are you still getting to know?",
  "What have you been waiting for permission to feel?",
  "Describe the last time you felt fully yourself.",
  "What do you miss that you can never return to?",
  "What small thing made today worth it?",
  "What are you pretending not to want?",
  "What conversation keeps replaying in your mind?",
  "Where in your life are you holding back?",
  "What does 'home' feel like to you today?",
  "Write about a silence that said more than words.",
  "What fear is actually protecting you from something?",
  "What would you save if everything else burned?",
  "What have you been brave about lately?",
  "Who do you love that you've never told?",
  "What does your body feel right now?",
  "What chapter of your life are you currently in?",
  "What would you write on a wall that no one would see?",
  "What do you keep almost saying?",
  "What are you grateful for that you never say out loud?",
  "Name something you've forgiven yourself for.",
  "What have you outgrown but haven't let go?",
  "What would you do if no one was watching?",
  "Who are you when no one needs anything from you?",
  "What does 'enough' look like in your life?"
];
const todayPrompt = () => {
  const d = new Date();
  const dy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return PROMPTS[dy % PROMPTS.length];
};

/* ── TAG COLOURS ── */
const TAG_COLORS = [
  { name: 'amber',    bg: 'rgba(196,168,122,0.18)', text: '#c4a87a' },
  { name: 'rose',     bg: 'rgba(255,100,130,0.15)', text: '#ff7096' },
  { name: 'sage',     bg: 'rgba(90,180,120,0.15)',  text: '#5ab478' },
  { name: 'sky',      bg: 'rgba(80,160,255,0.15)',  text: '#50a0ff' },
  { name: 'lavender', bg: 'rgba(160,120,255,0.15)', text: '#a078ff' },
  { name: 'coral',    bg: 'rgba(255,130,90,0.15)',  text: '#ff825a' },
];
const tagColor = name => TAG_COLORS.find(c => c.name === name) || TAG_COLORS[0];

/* ── STATE ── */
let notes = [], tags = [], settings = {};
let activeId    = null;
let saveTimer   = null;
let shareMs     = 0;
let shareNoteId = null;
let filterMode  = 'all';
let searchQ     = '';
let cdInterval  = null;
let focusMode   = false;
let privTimer   = null;   // for auto-privacy
let isRecording = false;
let recognition = null;
let selTagColor = 'amber';
let noteTagIds  = [];

/* ── STORAGE ── */
function loadAll() {
  try { notes    = JSON.parse(localStorage.getItem('ii_notes') || '[]'); } catch { notes    = []; }
  try { tags     = JSON.parse(localStorage.getItem('ii_tags')  || '[]'); } catch { tags     = []; }
  try { settings = JSON.parse(localStorage.getItem('ii_sett')  || '{}'); } catch { settings = {}; }
  settings.goalWords  = settings.goalWords  || 300;
  settings.todayWords = settings.todayWords || 0;
  settings.todayDate  = settings.todayDate  || '';
  const today = new Date().toISOString().slice(0, 10);
  if (settings.todayDate !== today) { settings.todayWords = 0; settings.todayDate = today; saveSettings(); }
}
const saveNotes    = () => localStorage.setItem('ii_notes', JSON.stringify(notes));
const saveTags     = () => localStorage.setItem('ii_tags',  JSON.stringify(tags));
const saveSettings = () => localStorage.setItem('ii_sett',  JSON.stringify(settings));
const getPwd       = () => localStorage.getItem('ii_pwd') || null;
const setPwd       = h  => localStorage.setItem('ii_pwd', h);

/* ── CRYPTO ── */
async function hashPwd(p) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ii2025::' + p));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
async function deriveKey(p, salt) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(p), { name:'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:120000, hash:'SHA-256' }, km, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
async function encryptNote(note, pwd) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(pwd, salt);
  const data = new TextEncoder().encode(JSON.stringify({ title: note.title||'', content: note.content||'', updatedAt: note.updatedAt||Date.now() }));
  const enc  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, data);
  const out  = new Uint8Array(28 + enc.byteLength);
  out.set(salt); out.set(iv, 16); out.set(new Uint8Array(enc), 28);
  return btoa(String.fromCharCode(...out));
}
async function decryptNote(b64, pwd) {
  const bytes = new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
  const key   = await deriveKey(pwd, bytes.slice(0,16));
  const dec   = await crypto.subtle.decrypt({ name:'AES-GCM', iv: bytes.slice(16,28) }, key, bytes.slice(28));
  return JSON.parse(new TextDecoder().decode(dec));
}

/* ── UTILS ── */
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const esc   = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function fmtShort(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date(), diff = now - d;
  if (diff < 60000)     return 'Just now';
  if (diff < 3600000)   return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000)  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday:'short' });
  return d.toLocaleDateString([], { month:'short', day:'numeric' });
}
function fmtLong(ts) {
  return new Date(ts||Date.now()).toLocaleDateString([], { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function countdown(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff/86400000), h = Math.floor((diff%86400000)/3600000), m = Math.floor((diff%3600000)/60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function wc(text) {
  return (text||'').trim().split(/\s+/).filter(Boolean).length;
}

/* ── TEXTAREA AUTO-RESIZE ── */
function resizeBody() {
  const ta = document.getElementById('note-body');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

/* ── SCREEN NAVIGATION ── */
function showScreen(id) {
  document.querySelectorAll('.screen:not(#splash)').forEach(s => {
    s.classList.add('hidden');
    s.classList.remove('sr','sl');
  });
  document.getElementById(id).classList.remove('hidden');
}

function openEditor(id) {
  document.getElementById('app').classList.add('sl');
  const ed = document.getElementById('editor');
  ed.classList.remove('hidden');
  ed.classList.add('sr');
  requestAnimationFrame(() => requestAnimationFrame(() => ed.classList.remove('sr')));
  loadIntoEditor(id);
}

function closeEditor() {
  stopVoice();
  exitFocus();
  const ed = document.getElementById('editor');
  ed.classList.add('sr');
  document.getElementById('app').classList.remove('sl');
  setTimeout(() => { ed.classList.add('hidden'); ed.classList.remove('sr'); }, 310);
  activeId = null;
  renderNotes();
}

/* ── EYE TOGGLE ── */
function bindEye(btnId, inpId, icoId) {
  const btn = document.getElementById(btnId);
  const inp = document.getElementById(inpId);
  const ico = document.getElementById(icoId);
  if (!btn || !inp) return;
  let show = false;
  btn.addEventListener('click', () => {
    show = !show;
    inp.type = show ? 'text' : 'password';
    if (ico) ico.setAttribute('href', show ? '#i-eye-off' : '#i-eye');
  });
}

/* ── LOCK SCREEN ── */
function initLock() {
  const hasPwd = getPwd();
  const card = document.getElementById('lock-card');
  const h    = document.getElementById('lock-h');
  const sub  = document.getElementById('lock-sub');
  const i1   = document.getElementById('inp1');
  const i2r  = document.getElementById('inp2-row');
  const i2   = document.getElementById('inp2');
  const btn  = document.getElementById('lock-btn');
  const err  = document.getElementById('lock-err');
  let step   = hasPwd ? 'enter' : 'create';

  i1.value = ''; i2.value = ''; err.textContent = '';
  i1.type = 'password'; i2.type = 'password';
  i2r.classList.add('hidden');
  document.getElementById('inp1-row').classList.remove('hidden');

  if (!hasPwd) {
    h.textContent   = 'Begin your journal';
    sub.textContent = 'Set a password to keep your thoughts private';
    btn.textContent = 'Continue';
  } else {
    h.textContent   = 'Welcome back';
    sub.textContent = 'Enter your password to open your journal';
    btn.textContent = 'Open Journal';
  }

  const shake = () => { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 450); };

  async function submit() {
    err.textContent = '';
    if (step === 'create') {
      if (i1.value.length < 4) { err.textContent = 'At least 4 characters'; shake(); return; }
      step = 'confirm';
      document.getElementById('inp1-row').classList.add('hidden');
      i2r.classList.remove('hidden');
      h.textContent = 'Confirm password'; sub.textContent = 'Re-enter your password'; btn.textContent = 'Create Journal';
      i2.value = ''; i2.focus(); return;
    }
    if (step === 'confirm') {
      if (i1.value !== i2.value) { err.textContent = "Passwords don't match"; shake(); i2.value = ''; i2.focus(); return; }
      setPwd(await hashPwd(i1.value)); enterApp(); return;
    }
    if (step === 'enter') {
      if (await hashPwd(i1.value) === getPwd()) enterApp();
      else { err.textContent = 'Wrong password'; shake(); i1.value = ''; i1.focus(); }
    }
  }

  btn.onclick  = submit;
  i1.onkeydown = e => { if (e.key === 'Enter') submit(); };
  i2.onkeydown = e => { if (e.key === 'Enter') submit(); };
  bindEye('eye1','inp1','eye1-ico');
  bindEye('eye2','inp2','eye2-ico');
  setTimeout(() => i1.focus(), 400);
}

function enterApp() {
  loadAll();
  showScreen('app');
  document.getElementById('prompt-text').textContent = todayPrompt();
  rebuildFilterTabs();
  renderNotes();
  updateFabRing();
  startCdInterval();
}

/* ── PRIVACY — tap to blur for 5s, auto-clears ── */
function triggerPrivacy() {
  const list = document.getElementById('notes-list');
  const btn  = document.getElementById('btn-privacy');
  const ico  = document.getElementById('privacy-ico');

  if (privTimer) {
    /* Already active → cancel early */
    clearTimeout(privTimer);
    privTimer = null;
    list.classList.remove('privacy-mode');
    btn.classList.remove('on');
    ico.setAttribute('href','#i-eye');
    return;
  }

  /* Activate blur */
  list.classList.add('privacy-mode');
  btn.classList.add('on');
  ico.setAttribute('href','#i-eye-off');

  /* Auto-remove after 5 seconds */
  privTimer = setTimeout(() => {
    list.classList.remove('privacy-mode');
    btn.classList.remove('on');
    ico.setAttribute('href','#i-eye');
    privTimer = null;
  }, 5000);
}

/* ── FAB WORD-COUNT RING ── */
const RING_C = 195;
function updateFabRing() {
  const prog = Math.min(settings.todayWords / Math.max(settings.goalWords, 1), 1);
  const el   = document.getElementById('fab-ring');
  if (el) el.style.strokeDashoffset = RING_C * (1 - prog);
}
function updateGoalSheet() {
  const prog = Math.min(settings.todayWords / Math.max(settings.goalWords, 1), 1);
  const pct  = Math.round(prog * 100);
  const gp = document.getElementById('goal-prog');
  if (gp) gp.style.strokeDashoffset = RING_C * (1 - prog);
  const gn = document.getElementById('goal-n');
  const gd = document.getElementById('goal-d');
  const gs = document.getElementById('goal-sub');
  const gi = document.getElementById('goal-inp');
  if (gn) gn.textContent = settings.todayWords;
  if (gd) gd.textContent = 'of ' + settings.goalWords;
  if (gs) gs.textContent = pct >= 100 ? '🎉 Goal reached!' : `${pct}% of today's goal`;
  if (gi) gi.value = settings.goalWords;
}
function trackWords() {
  const count = wc(document.getElementById('note-body')?.value || '');
  if (count > settings.todayWords) {
    settings.todayWords = count;
    saveSettings();
    updateFabRing();
  }
}

/* ── NOTES LIST ── */
function getFiltered() {
  const now = Date.now();
  notes.forEach(n => {
    if (n.mode === 'locked' && n.lockedUntil && now >= n.lockedUntil) { n.mode = 'normal'; n.lockedUntil = null; saveNotes(); }
  });
  let list = searchQ
    ? notes.filter(n => (n.title||'').toLowerCase().includes(searchQ) || (n.content||'').toLowerCase().includes(searchQ))
    : [...notes];
  if (filterMode === 'pinned')            list = list.filter(n => n.pinned);
  else if (filterMode === 'unsent')       list = list.filter(n => n.mode === 'unsent');
  else if (filterMode === 'locked')       list = list.filter(n => n.mode === 'locked');
  else if (filterMode.startsWith('tag:')) list = list.filter(n => (n.tags||[]).includes(filterMode.slice(4)));
  return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

function renderNotes() {
  const listEl   = document.getElementById('notes-list');
  const filtered = getFiltered();
  const cntEl    = document.getElementById('notes-count');
  if (cntEl) cntEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">
      <svg class="empty-ic"><use href="#i-nib"/></svg>
      <div class="empty-h">${searchQ ? 'Nothing found' : filterMode === 'all' ? 'Nothing written yet' : 'No entries here'}</div>
      <div class="empty-s">${!searchQ && filterMode === 'all' ? 'Tap + to begin your first entry.' : ''}</div>
    </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(cardHTML).join('');

  listEl.querySelectorAll('.note-card').forEach(el => {
    el.addEventListener('click', () => {
      const n = notes.find(x => x.id === el.dataset.id);
      if (!n) return;
      if (n.mode === 'locked' && n.lockedUntil && Date.now() < n.lockedUntil) {
        el.style.transform = 'scale(0.97)'; setTimeout(() => el.style.transform = '', 180); return;
      }
      openEditor(n.id);
    });
  });
}

function cardHTML(n) {
  const isLocked = n.mode === 'locked' && n.lockedUntil && Date.now() < n.lockedUntil;
  const preview  = (n.content||'').replace(/\n/g,' ').trim() || 'No content yet…';
  const noteTags = (n.tags||[]).map(tid => {
    const t = tags.find(x => x.id === tid); if (!t) return '';
    const c = tagColor(t.color);
    return `<span class="card-tag" style="background:${c.bg};color:${c.text}">${esc(t.name)}</span>`;
  }).join('');
  let modeIco = '';
  if (n.mode === 'locked') modeIco = `<span class="card-mode-ic"><svg width="13" height="13"><use href="#i-lock"/></svg></span>`;
  if (n.mode === 'unsent') modeIco = `<span class="card-mode-ic"><svg width="13" height="13"><use href="#i-mail"/></svg></span>`;
  const pinIco = n.pinned ? `<span class="pin-ic"><svg width="11" height="11"><use href="#i-pin"/></svg></span>` : '';
  let extra = '';
  if (n.mode === 'unsent' && n.to) extra = `<div class="card-to">To: ${esc(n.to)}</div>`;
  if (isLocked) { const cd = countdown(n.lockedUntil); extra = `<div class="card-locked-cd"><svg width="11" height="11"><use href="#i-clock"/></svg> Unlocks in ${cd}</div>`; }

  return `<div class="note-card mode-${n.mode}" data-id="${n.id}">
    <div class="card-top">
      <div class="card-title">${esc(n.title||'Untitled')}</div>
      <div class="card-top-right">${pinIco}${modeIco}</div>
    </div>
    ${extra}
    <div class="card-preview">${esc(preview.slice(0,120))}${preview.length>120?'…':''}</div>
    <div class="card-bottom">
      <span class="card-date">${fmtShort(n.updatedAt)}</span>
      <div class="card-tags">${noteTags}</div>
    </div>
  </div>`;
}

function rebuildFilterTabs() {
  const row = document.getElementById('filter-row');
  while (row.children.length > 4) row.removeChild(row.lastChild);
  tags.forEach(t => {
    const c = tagColor(t.color);
    const b = document.createElement('button');
    b.className = 'ftab'; b.dataset.filter = 'tag:' + t.id;
    b.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${c.text};display:inline-block;flex-shrink:0"></span> ${esc(t.name)}`;
    b.addEventListener('click', () => setFilter('tag:' + t.id, b));
    row.appendChild(b);
  });
}
function setFilter(f, el) {
  filterMode = f;
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderNotes();
}
function startCdInterval() {
  if (cdInterval) clearInterval(cdInterval);
  cdInterval = setInterval(() => { if (document.querySelectorAll('.note-card.mode-locked').length) renderNotes(); }, 30000);
}

/* ── EDITOR ── */
function loadIntoEditor(id) {
  activeId = id;
  const n  = notes.find(x => x.id === id);
  if (!n) return;
  document.getElementById('note-title').value = n.title   || '';
  document.getElementById('note-body').value  = n.content || '';
  document.getElementById('to-inp').value     = n.to      || '';
  document.getElementById('ed-dateline').textContent = fmtLong(n.updatedAt);
  updateEditorMode(n.mode);
  setTimeout(resizeBody, 0);
  if (!n.title && !n.content) {
    document.getElementById('ed-prompt-q').textContent = todayPrompt();
    document.getElementById('ed-prompt').classList.remove('hidden');
  } else {
    document.getElementById('ed-prompt').classList.add('hidden');
  }
  document.getElementById('note-title').focus();
}

function updateEditorMode(mode) {
  const badge = document.getElementById('ed-badge');
  badge.className   = 'ed-badge ' + mode;
  badge.textContent = { normal:'Normal', unsent:'Unsent', locked:'Time-locked' }[mode] || mode;
  document.getElementById('to-wrap').classList.toggle('hidden', mode !== 'unsent');
  document.getElementById('note-title').classList.toggle('unsent-mode', mode === 'unsent');
}

function scheduleSave() {
  document.getElementById('save-dot')?.classList.add('vis');
  document.getElementById('save-dot2')?.classList.add('vis');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const n = notes.find(x => x.id === activeId); if (!n) return;
    n.title     = document.getElementById('note-title').value;
    n.content   = document.getElementById('note-body').value;
    n.to        = document.getElementById('to-inp').value;
    n.updatedAt = Date.now();
    document.getElementById('ed-dateline').textContent = fmtLong(n.updatedAt);
    const idx = notes.findIndex(x => x.id === activeId);
    if (idx > 0) { const [x] = notes.splice(idx, 1); notes.unshift(x); }
    saveNotes(); trackWords();
    setTimeout(() => { document.getElementById('save-dot')?.classList.remove('vis'); document.getElementById('save-dot2')?.classList.remove('vis'); }, 900);
  }, 420);
}

function createNote() {
  const n = { id:genId(), title:'', content:'', to:'', mode:'normal', lockedUntil:null, tags:[], pinned:false, createdAt:Date.now(), updatedAt:Date.now() };
  notes.unshift(n); saveNotes(); openEditor(n.id);
}
function deleteNote(id) {
  if (!confirm('Delete this note forever?')) return;
  notes = notes.filter(n => n.id !== id); saveNotes(); closeEditor();
}

/* ── FOCUS MODE ── */
function toggleFocus() {
  focusMode = !focusMode;
  document.getElementById('editor').classList.toggle('focus-mode', focusMode);
  document.getElementById('focus-hint').classList.toggle('hidden', !focusMode);
  if (focusMode) document.getElementById('note-body').focus();
}
function exitFocus() {
  if (!focusMode) return;
  focusMode = false;
  document.getElementById('editor').classList.remove('focus-mode');
  document.getElementById('focus-hint').classList.add('hidden');
}

/* ── VOICE TO TEXT ── */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function initVoice() {
  if (!SR) return;
  recognition = new SR();
  recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US';
  recognition.onresult = e => {
    const text = Array.from(e.results).filter(r => r.isFinal).map(r => r[0].transcript).join('');
    if (text) { insertAtCursor(text + ' '); }
  };
  recognition.onend   = () => stopVoice();
  recognition.onerror = () => stopVoice();
}
function insertAtCursor(text) {
  const ta = document.getElementById('note-body');
  const s = ta.selectionStart, e2 = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e2);
  ta.selectionStart = ta.selectionEnd = s + text.length;
  resizeBody(); scheduleSave();
}
function toggleVoice() {
  if (!recognition) { alert('Voice input not available on this browser.'); return; }
  if (isRecording) stopVoice(); else startVoice();
}
function startVoice() {
  isRecording = true; try { recognition.start(); } catch {}
  document.getElementById('btn-voice')?.classList.add('on');
  document.getElementById('voice-indicator')?.classList.remove('hidden');
}
function stopVoice() {
  if (!isRecording) return;
  isRecording = false; try { recognition.stop(); } catch {}
  document.getElementById('btn-voice')?.classList.remove('on');
  document.getElementById('voice-indicator')?.classList.add('hidden');
}

/* ── NOTE OPTIONS SHEET ── */
function openNoteMenu() {
  const n = notes.find(x => x.id === activeId); if (!n) return;
  document.querySelectorAll('.mode-opt').forEach(b => b.classList.remove('sel'));
  document.querySelector(`.mode-opt[data-mode="${n.mode}"]`)?.classList.add('sel');
  document.getElementById('timelock-sec').classList.toggle('vis', n.mode === 'locked');
  document.getElementById('unlock-dt').value = n.lockedUntil
    ? new Date(n.lockedUntil).toISOString().slice(0,16)
    : new Date(Date.now()+86400000).toISOString().slice(0,16);
  document.getElementById('pin-toggle').classList.toggle('on', !!n.pinned);
  noteTagIds = [...(n.tags||[])];
  renderNoteTagsSheet();
  openOverlay('menu-overlay');
}

function renderNoteTagsSheet() {
  const wrap = document.getElementById('note-tags-wrap');
  if (!tags.length) { wrap.innerHTML = `<span style="font-size:13px;color:var(--text3)">No tags yet — add them in Settings</span>`; return; }
  wrap.innerHTML = tags.map(t => {
    const c = tagColor(t.color), sel = noteTagIds.includes(t.id);
    return `<span class="tag-chip${sel?' selected':''}" data-tid="${t.id}" style="background:${c.bg};color:${c.text};border-color:${sel?c.text:'transparent'}">${esc(t.name)}</span>`;
  }).join('');
  wrap.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tid = chip.dataset.tid, idx = noteTagIds.indexOf(tid);
      if (idx > -1) noteTagIds.splice(idx,1); else noteTagIds.push(tid);
      renderNoteTagsSheet();
    });
  });
}

function applyNoteMode() {
  const n = notes.find(x => x.id === activeId); if (!n) return;
  const sel = document.querySelector('.mode-opt.sel'); if (!sel) return;
  n.mode   = sel.dataset.mode;
  n.pinned = document.getElementById('pin-toggle').classList.contains('on');
  n.tags   = [...noteTagIds];
  if (n.mode === 'locked') { const dv = document.getElementById('unlock-dt').value; n.lockedUntil = dv ? new Date(dv).getTime() : null; }
  else n.lockedUntil = null;
  saveNotes(); updateEditorMode(n.mode); closeOverlay('menu-overlay');
}

/* ── SHARE MODAL ── */
function openShareModal() {
  if (!activeId) return;
  shareNoteId = activeId;
  const n = notes.find(x => x.id === activeId); if (!n) return;
  document.getElementById('share-desc').innerHTML = `Share <strong>"${esc(n.title||'Untitled')}"</strong> — AES-256 encrypted.`;
  document.getElementById('share-pwd').value = '';
  document.getElementById('link-result').style.display = 'none';
  const gb = document.getElementById('gen-btn'); gb.style.display = 'block'; gb.textContent = 'Generate encrypted link'; gb.disabled = false;
  document.getElementById('copy-btn').style.display = 'none';
  document.querySelectorAll('.exp-btn').forEach(b => b.classList.toggle('sel', b.dataset.ms === '0'));
  shareMs = 0;
  openOverlay('share-overlay');
  setTimeout(() => document.getElementById('share-pwd').focus(), 200);
}

async function generateLink() {
  const pwd = document.getElementById('share-pwd').value.trim(); if (!pwd) return;
  const n = notes.find(x => x.id === shareNoteId); if (!n) return;
  const btn = document.getElementById('gen-btn'); btn.textContent = 'Encrypting…'; btn.disabled = true;
  try {
    const enc  = await encryptNote(n, pwd);
    const exp  = shareMs > 0 ? Date.now() + shareMs : null;
    const pay  = btoa(JSON.stringify({ expiresAt:exp, enc }));
    const link = window.location.href.split('#')[0] + '#share=' + encodeURIComponent(pay);
    document.getElementById('link-txt').textContent = link;
    document.getElementById('link-result').style.display = 'block';
    btn.style.display = 'none';
    const cb = document.getElementById('copy-btn'); cb.style.display = 'block'; cb.textContent = 'Copy link'; cb.className = 'primary-btn';
  } catch { btn.textContent = 'Error — try again'; btn.disabled = false; }
}

/* ── SHARE VIEW (URL hash) ── */
async function initShareView(shareId) {
  showScreen('share-view');
  const gate = document.getElementById('sv-gate'), dead = document.getElementById('sv-dead');
  let payload;
  try { payload = JSON.parse(atob(decodeURIComponent(shareId))); }
  catch { document.getElementById('sv-dead-msg').textContent = 'This link is corrupted.'; dead.style.display = 'block'; return; }
  const { expiresAt, enc } = payload;
  if (expiresAt && Date.now() > expiresAt) { document.getElementById('sv-dead-msg').textContent = 'This link has expired.'; dead.style.display = 'block'; return; }
  if (expiresAt) document.getElementById('sv-sub').textContent = `Expires ${new Date(expiresAt).toLocaleString()}`;
  gate.style.display = 'block';
  const pi = document.getElementById('sv-pwd'), ub = document.getElementById('sv-unlock'), se = document.getElementById('sv-err');
  const shk = () => { gate.classList.remove('shake'); void gate.offsetWidth; gate.classList.add('shake'); setTimeout(() => gate.classList.remove('shake'), 450); };
  async function tryOpen() {
    se.textContent = ''; const pwd = pi.value.trim(); if (!pwd) return;
    ub.textContent = 'Decrypting…'; ub.disabled = true;
    try {
      const note = await decryptNote(enc, pwd);
      gate.style.display = 'none';
      document.getElementById('snv-title').textContent = note.title || 'Untitled';
      document.getElementById('snv-date').textContent  = fmtLong(note.updatedAt);
      document.getElementById('snv-body').textContent  = note.content || '';
      const sv = document.getElementById('sv-note'); sv.style.display = 'flex'; sv.style.flexDirection = 'column';
    } catch { se.textContent = 'Wrong password.'; shk(); pi.value = ''; pi.focus(); ub.textContent = 'Read Note'; ub.disabled = false; }
  }
  ub.onclick = tryOpen; pi.onkeydown = e => { if (e.key === 'Enter') tryOpen(); };
  bindEye('sv-eye','sv-pwd','sv-eye-ico');
  setTimeout(() => pi.focus(), 420);
}

/* ── SETTINGS ── */
async function changePassword() {
  const cur = document.getElementById('s-cur').value, nw = document.getElementById('s-new').value;
  const err = document.getElementById('s-err'); err.textContent = ''; err.style.color = '';
  if (!cur || !nw) { err.textContent = 'Fill both fields'; return; }
  if (nw.length < 4) { err.textContent = 'New password too short'; return; }
  if (await hashPwd(cur) !== getPwd()) { err.textContent = 'Wrong current password'; return; }
  setPwd(await hashPwd(nw));
  document.getElementById('s-cur').value = ''; document.getElementById('s-new').value = '';
  err.style.color = 'var(--accent)'; err.textContent = 'Password updated ✓';
  setTimeout(() => { err.textContent = ''; err.style.color = ''; }, 2500);
}

function renderAllTagsSettings() {
  const wrap = document.getElementById('all-tags-wrap');
  wrap.innerHTML = tags.map(t => {
    const c = tagColor(t.color);
    return `<span class="tag-chip selected" style="background:${c.bg};color:${c.text};border-color:${c.text}">${esc(t.name)} <button class="tag-chip-del" data-tid="${t.id}">✕</button></span>`;
  }).join('');
  wrap.querySelectorAll('.tag-chip-del').forEach(b => {
    b.onclick = () => {
      const tid = b.dataset.tid;
      tags = tags.filter(t => t.id !== tid);
      notes.forEach(n => { if (n.tags) n.tags = n.tags.filter(x => x !== tid); });
      saveTags(); saveNotes(); renderAllTagsSettings(); rebuildFilterTabs();
    };
  });
  const row = document.getElementById('tc-row');
  row.innerHTML = TAG_COLORS.map(c => `<div class="tc-dot${selTagColor===c.name?' sel':''}" data-cn="${c.name}" style="background:${c.text}"></div>`).join('');
  row.querySelectorAll('.tc-dot').forEach(d => { d.onclick = () => { selTagColor = d.dataset.cn; renderAllTagsSettings(); }; });
}

function addNewTag() {
  const inp = document.getElementById('new-tag-inp'), nm = inp.value.trim(); if (!nm) return;
  if (tags.length >= 10) { alert('Maximum 10 tags'); return; }
  tags.push({ id:genId(), name:nm, color:selTagColor }); saveTags(); inp.value = '';
  renderAllTagsSettings(); rebuildFilterTabs();
}

/* ── OVERLAYS ── */
const openOverlay      = id => document.getElementById(id).classList.add('open');
const closeOverlay     = id => document.getElementById(id).classList.remove('open');
const closeAllOverlays = ()  => document.querySelectorAll('.overlay').forEach(o => o.classList.remove('open'));

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', () => {

  /* Hash routing */
  if (window.location.hash.startsWith('#share=')) { initShareView(window.location.hash.slice(7)); return; }

  /* Splash → Lock */
  setTimeout(() => { document.getElementById('splash').classList.add('hidden'); initLock(); showScreen('lock'); }, 2500);

  /* Notes list */
  document.getElementById('fab').onclick = createNote;
  document.getElementById('prompt-write-btn').onclick = createNote;

  document.getElementById('btn-search').onclick = () => {
    const sw = document.getElementById('search-wrap'), open = sw.classList.toggle('open');
    if (open) document.getElementById('search-inp').focus();
    else { searchQ = ''; document.getElementById('search-inp').value = ''; renderNotes(); }
  };
  document.getElementById('search-inp').oninput = e => { searchQ = e.target.value.toLowerCase().trim(); renderNotes(); };

  document.getElementById('filter-row').addEventListener('click', e => {
    const tab = e.target.closest('.ftab'); if (!tab) return; setFilter(tab.dataset.filter, tab);
  });

  document.getElementById('btn-privacy').onclick = triggerPrivacy;

  document.getElementById('btn-goal').onclick = () => { updateGoalSheet(); openOverlay('goal-overlay'); };
  document.getElementById('goal-save-btn').onclick = () => {
    const v = parseInt(document.getElementById('goal-inp').value) || 300;
    settings.goalWords = Math.max(50, Math.min(10000, v));
    saveSettings(); updateFabRing(); updateGoalSheet(); closeOverlay('goal-overlay');
  };

  document.getElementById('btn-settings').onclick = () => { renderAllTagsSettings(); openOverlay('settings-overlay'); };
  document.getElementById('s-change-btn').onclick  = changePassword;
  document.getElementById('s-lock-btn').onclick    = () => { closeAllOverlays(); activeId = null; exitFocus(); stopVoice(); initLock(); showScreen('lock'); };
  document.getElementById('add-tag-btn').onclick   = addNewTag;
  document.getElementById('new-tag-inp').onkeydown = e => { if (e.key === 'Enter') addNewTag(); };

  /* Editor */
  document.getElementById('ed-back').onclick    = closeEditor;
  document.getElementById('note-title').oninput = scheduleSave;
  document.getElementById('to-inp').oninput     = scheduleSave;
  document.getElementById('note-body').addEventListener('input', () => { resizeBody(); scheduleSave(); });

  /* Prompt dismiss */
  const px = document.getElementById('ed-prompt-x');
  const dp = () => document.getElementById('ed-prompt').classList.add('hidden');
  px.addEventListener('click', dp);
  px.addEventListener('touchend', e => { e.preventDefault(); dp(); });

  document.getElementById('ed-share-btn').onclick = openShareModal;
  document.getElementById('ed-menu-btn').onclick  = openNoteMenu;
  document.getElementById('btn-voice').onclick    = toggleVoice;
  document.getElementById('btn-focus').onclick    = toggleFocus;

  /* Exit focus on tap outside text areas */
  document.getElementById('editor').addEventListener('click', e => {
    if (focusMode && !e.target.closest('#note-body') && !e.target.closest('#note-title')) exitFocus();
  });

  /* Note options */
  document.querySelectorAll('.mode-opt').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.mode-opt').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      document.getElementById('timelock-sec').classList.toggle('vis', b.dataset.mode === 'locked');
    };
  });
  document.getElementById('menu-apply-btn').onclick  = applyNoteMode;
  document.getElementById('menu-delete-btn').onclick = () => { closeOverlay('menu-overlay'); setTimeout(() => deleteNote(activeId), 100); };
  document.getElementById('pin-toggle').onclick      = function() { this.classList.toggle('on'); };

  /* Share */
  document.querySelectorAll('.exp-btn').forEach(b => {
    b.onclick = () => { document.querySelectorAll('.exp-btn').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); shareMs = parseInt(b.dataset.ms); };
  });
  document.getElementById('gen-btn').onclick     = generateLink;
  document.getElementById('share-pwd').onkeydown = e => { if (e.key === 'Enter') generateLink(); };
  document.getElementById('copy-btn').onclick    = () => {
    navigator.clipboard.writeText(document.getElementById('link-txt').textContent).then(() => {
      const cb = document.getElementById('copy-btn'); cb.textContent = '✓ Copied!'; cb.classList.add('ok');
      setTimeout(() => { cb.textContent = 'Copy link'; cb.classList.remove('ok'); }, 2200);
    }).catch(() => {});
  };
  bindEye('share-eye','share-pwd','share-eye-ico');

  /* Backdrop dismiss all overlays */
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) closeOverlay(o.id); });
  });

  /* Voice */
  initVoice();

  /* Service worker */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});
