/* ============================================================
   CSL — Complete System for Laboratories
   نظام معمل متكامل: استقبال / CASA / حسابات / مخزن / إعدادات
   ============================================================ */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = p => p + '_' + Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (+n || 0).toLocaleString('en-EG', { maximumFractionDigits: 2 });
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); };
function modal(html) { closeModal(); const w = document.createElement('div'); w.className = 'modal-wrap'; w.id = 'modal-wrap'; w.innerHTML = `<div class="modal">${html}</div>`; w.onclick = e => { if (e.target === w) closeModal(); }; document.body.appendChild(w); }
function closeModal() { const w = $('#modal-wrap'); if (w) w.remove(); }

/* ---------- keys ---------- */
const KEY = 'csl_v1', META_KEY = 'csl_meta_v1', SES = 'csl_ses';
const labKey = id => KEY + '_' + id;
const actKey = id => 'csl_act_' + id;
const mkCode = () => Math.random().toString(36).slice(2, 6).toLowerCase() + '-' + Math.random().toString(36).slice(2, 6).toLowerCase();

let META = null, DB = null, LABID = null;

/* ---------- seed: تحاليل من الكتالوج المستورد ---------- */
function seed() {
  const T = (id, name, cat, price, fields) => ({ id, name, cat, price, fields: fields || [] });
  const tests = [];
  for (const r of (typeof YS_PANELS !== 'undefined' ? YS_PANELS : [])) tests.push(T('yp_' + tests.length, r.n, r.c, r.p, r.f || []));
  for (const r of (typeof YS_TESTS !== 'undefined' ? YS_TESTS : [])) tests.push(T('yt_' + tests.length, r.n, r.c, r.p, r.f || []));
  if (!tests.some(t => /منوي/.test(t.name))) tests.push(T('casa_1', 'تحليل السائل المنوي (CASA)', 'السائل المنوي', 250, []));
  return {
    lab: { name: 'معملك', branch: 'الفرع الرئيسي', logo: '', schedule: 'يومياً من 9 صباحاً حتى 10 مساءً — ما عدا الجمعة', header: { title: 'معملك للتحاليل الطبية', address: '', phones: '', footer: 'CSL' } },
    tests, patients: [], visits: [], payments: [],
    treasury: { days: {}, balances: [] },
    companies: [], companyDebts: [],
    inventory: [], invLog: [],
    users: [{ id: 'u1', name: 'المدير', user: 'admin', pass: 'admin', role: 'أدمن' }],
    seq: { patient: 1, visit: 1001, invoice: 5001 },
    casaQueue: [],
  };
}

/* ---------- meta / labs ---------- */
function loadMeta() {
  try { META = JSON.parse(localStorage.getItem(META_KEY)); } catch (e) { META = null; }
  if (!META || !META.labs) { META = { superUser: { user: 'mt', pass: 'mozo' }, labs: [] }; saveMeta(); }
}
function saveMeta() { localStorage.setItem(META_KEY, JSON.stringify(META)); if (typeof cloudScheduleMetaPush === 'function') cloudScheduleMetaPush(); }
function labById(id) { return META.labs.find(l => l.id === id); }
function isActivated(id) { return localStorage.getItem(actKey(id)) === '1'; }
function activate(id) { localStorage.setItem(actKey(id), '1'); }
function save() { if (LABID) localStorage.setItem(labKey(LABID), JSON.stringify(DB)); if (typeof cloudSchedulePush === 'function') cloudSchedulePush(); }
function loadLab(id) {
  LABID = id;
  try { DB = JSON.parse(localStorage.getItem(labKey(id))); } catch (e) { DB = null; }
  if (!DB || !DB.tests) { DB = seed(); save(); }
  if (typeof cloudPullLab === 'function') cloudPullLab(id);
}

/* ---------- session ---------- */
function session() { try { return JSON.parse(sessionStorage.getItem(SES)); } catch (e) { return null; } }
function setSession(s) { sessionStorage.setItem(SES, JSON.stringify(s)); }
function logout() { sessionStorage.removeItem(SES); location.hash = ''; route(); }

/* ---------- router ---------- */
function go(p) { location.hash = '#/' + p; }
function route() {
  const h = location.hash.replace(/^#\//, '');
  const [page0, arg0] = h.split('/');
  if (page0 === 'go' && arg0) { loadMeta(); return goLab(arg0); }
  const ses = session();
  if (!ses) { LABID = null; return renderLogin(); }
  if (ses.type === 'super') {
    const [page] = h.split('/');
    if (page === 'settings') return renderSettings();
    return renderDistributor();
  }
  if (LABID !== ses.labId) loadLab(ses.labId);
  const [page, arg] = h.split('/');
  if (!page || page === 'home') return renderHome();
  if (page === 'reception') return renderReception();
  if (page === 'casa') return renderCASA();
  if (page === 'finance') return renderFinance();
  if (page === 'inventory') return renderInventory();
  if (page === 'settings') return renderSettings();
  renderHome();
}
window.addEventListener('hashchange', route);
window.addEventListener('load', () => { loadMeta(); cloudInit(); cloudPullMeta(); });

/* ---------- shell ---------- */
function shell(title, bodyHtml) {
  const ses = session();
  $('#root').innerHTML = `
  <div class="topbar">
    <img src="${DB.lab.logo || 'icon-192.png'}" alt="" onerror="this.src='icon-192.png'">
    <span class="t">CSL</span>
    <span style="color:#8fa8d8;font-size:12px">${esc(DB.lab.name)}</span>
    <span class="sp"></span>
    <span id="sync-badge" class="sync-badge off">…</span>
    <span class="who">${esc(ses.name)} (${esc(ses.role)})</span>
    <button class="icon-btn" onclick="go('home')" title="الرئيسية">🏠</button>
    <button class="icon-btn" onclick="logout()" title="خروج">⏻</button>
  </div>
  <div id="view">
    <div class="page-head"><button class="back" onclick="go('home')">→</button><h2>${esc(title)}</h2></div>
    ${bodyHtml}
  </div>`;
  updateSyncBadge();
}

/* ---------- login ---------- */
let loginMode = 'lab';
function renderLogin() {
  $('#root').innerHTML = `
  <div id="login-view"><div class="login-box">
    <h1>🧪 CSL</h1>
    <div class="sub">Complete System for Laboratories — نظام المعمل المتكامل</div>
    <div class="ltabs">
      <button class="btn ${loginMode === 'lab' ? 'btn-p' : 'btn-o'}" onclick="loginTab('lab')">دخول معمل</button>
      <button class="btn ${loginMode === 'super' ? 'btn-p' : 'btn-o'}" onclick="loginTab('super')">دخول الموزّع</button>
    </div>
    <div id="login-body"></div>
  </div></div>`;
  loginTab(loginMode);
}
function loginTab(m) {
  loginMode = m;
  $$('.ltabs .btn').forEach((b, i) => { b.className = 'btn ' + ((i === 0) === (m === 'lab') ? 'btn-p' : 'btn-o'); });
  $('#login-body').innerHTML = m === 'super' ? `
    <div class="field"><label>اسم المستخدم</label><input class="inp" id="lg-user"></div>
    <div class="field"><label>كلمة المرور</label><input class="inp" type="password" id="lg-pass"></div>
    <button class="btn btn-p" onclick="doSuperLogin()">دخول لوحة الموزّع ⬅</button>
  ` : `
    <div class="field"><label>اسم المستخدم</label><input class="inp" id="lg-user"></div>
    <div class="field"><label>كلمة المرور</label><input class="inp" type="password" id="lg-pass"></div>
    <div class="field"><label>كود التفعيل (الجهاز)</label><input class="inp num" id="lg-code"></div>
    <button class="btn btn-p" onclick="doLabLogin()">دخول ⬅</button>
  `;
}
function doSuperLogin() {
  const { user, pass } = { user: $('#lg-user').value.trim(), pass: $('#lg-pass').value };
  if (user === META.superUser.user && pass === META.superUser.pass) {
    setSession({ type: 'super', name: 'الموزّع' }); go(''); route();
  } else toast('⚠️ بيانات الموزّع غير صحيحة');
}
function doLabLogin() {
  const u = $('#lg-user').value.trim(), p = $('#lg-pass').value, c = $('#lg-code').value.trim().toLowerCase();
  const lab = META.labs.find(l => l.code === c);
  if (!lab) return toast('⚠️ كود التفعيل غير صحيح');
  if (!lab.active) return toast('⚠️ المعمل موقوف — تواصل مع الموزّع');
  const usr = (DB && LABID === lab.id ? DB.users : JSON.parse(localStorage.getItem(labKey(lab.id)) || 'null')?.users || []).find(x => x.user === u && x.pass === p);
  if (!usr) return toast('⚠️ اسم المستخدم أو كلمة المرور غير صحيحة');
  if (!isActivated(lab.id)) activate(lab.id);
  loadLab(lab.id);
  setSession({ type: 'lab', labId: lab.id, name: usr.name, role: usr.role, user: usr.user });
  go(''); route();
}

/* ---------- distributor ---------- */
function renderDistributor() {
  $('#root').innerHTML = `
  <div class="topbar">
    <span class="t">🎛️ لوحة الموزّع — CSL</span>
    <span class="sp"></span>
    <span id="sync-badge" class="sync-badge off">…</span>
    <button class="icon-btn" onclick="logout()" title="خروج">⏻</button>
  </div>
  <div id="view">
    <div class="stats">
      <div class="stat blue"><div class="v">${META.labs.length}</div><div class="l">معمل مشترك</div></div>
      <div class="stat green"><div class="v">${META.labs.filter(l => l.active).length}</div><div class="l">نشط</div></div>
    </div>
    <div class="card"><h3>➕ إنشاء معمل جديد</h3>
      <div class="toolbar">
        <input class="inp2" id="dl-name" placeholder="اسم المعمل" style="flex:1;min-width:220px">
        <button class="btn btn-t" onclick="distCreate()">إنشاء معمل + كود تفعيل</button>
      </div>
    </div>
    <div class="card"><h3>🏢 المعملات</h3>
      ${META.labs.length ? `<table><tr><th>الاسم</th><th>كود الدخول</th><th>الرابط المباشر</th><th>الحالة</th><th>إجراءات</th></tr>
      ${META.labs.map(l => `<tr>
        <td style="font-weight:700">${esc(l.name)}</td>
        <td class="num"><b>${l.code}</b></td>
        <td class="num" style="font-size:11.5px">csl.mtayea.com/#/go/${l.id}</td>
        <td>${l.active ? '<span class="pill p-paid">نشط</span>' : '<span class="pill p-unpaid">موقوف</span>'}</td>
        <td>
          <button class="btn btn-o btn-s" onclick="distToggle('${l.id}')">${l.active ? 'إيقاف' : 'تفعيل'}</button>
          <button class="btn btn-t btn-s" onclick="distUsers('${l.id}')">المستخدمون</button>
          <button class="btn btn-r btn-s" onclick="distDelete('${l.id}')">حذف</button>
        </td></tr>`).join('')}</table>` : '<div class="empty">لا توجد معملات بعد</div>'}
    </div>
  </div>`;
  updateSyncBadge();
}
function distCreate() {
  const name = $('#dl-name').value.trim();
  if (!name) return toast('⚠️ أدخل اسم المعمل');
  const id = 'lab_' + Math.random().toString(36).slice(2, 8);
  META.labs.push({ id, name, code: mkCode(), active: true, createdAt: today() });
  saveMeta();
  const fresh = seed(); fresh.lab.name = name;
  localStorage.setItem(labKey(id), JSON.stringify(fresh));
  toast('✅ اتعمل معمل «' + name + '» — الكود: ' + META.labs[META.labs.length - 1].code);
  renderDistributor();
}
function distToggle(id) { const l = labById(id); l.active = !l.active; saveMeta(); renderDistributor(); }
/* عرض/إدارة مستخدمي معمل من لوحة الموزّع */
function distUsers(id) {
  const l = labById(id); if (!l) return;
  const raw = localStorage.getItem(labKey(id));
  let db = null;
  try { db = raw ? JSON.parse(raw) : null; } catch (e) { db = null; }
  if (!db || !db.users) {
    // محاولة سحبها من السحابة
    if (typeof cloudFetchLabUsers === 'function') return cloudFetchLabUsers(id);
    return toast('⚠️ بيانات المعمل مش متاحة على الجهاز ده — افتح المعمل مرة واحدة على أي جهاز عشان تتزامن');
  }
  renderDistUsers(id, db);
}
function renderDistUsers(id, db) {
  const l = labById(id);
  modal(`<h3>👥 مستخدمو معمل «${esc(l.name)}»</h3>
    ${db.users.map(u => `<div class="chk-row" style="margin-bottom:8px">
      <b>${esc(u.name)}</b> <span class="num" style="color:var(--mut)">${esc(u.user)}</span>
      <span class="pill p-done">${esc(u.role)}</span>
      <span class="sp"></span>
      <button class="btn btn-o btn-s" onclick="distResetPass('${id}','${u.id}')">🔑 ريسيت كلمة السر (admin)</button>
    </div>`).join('') || '<div class="empty">لا يوجد مستخدمون</div>'}
    <div class="hint" style="margin-top:8px">البيانات الافتراضية لأي معمل جديد: <b class="num">admin / admin</b></div>
    <div class="modal-actions"><button class="btn btn-o" onclick="closeModal()">إغلاق</button></div>`);
}
function distResetPass(labId, userId) {
  const raw = localStorage.getItem(labKey(labId));
  const db = raw ? JSON.parse(raw) : null;
  if (!db) return toast('⚠️ البيانات مش متاحة');
  const u = db.users.find(x => x.id === userId);
  if (!u) return;
  u.pass = 'admin';
  localStorage.setItem(labKey(labId), JSON.stringify(db));
  if (typeof cloudSchedulePushLab === 'function') cloudSchedulePushLab(labId, db);
  toast('✅ اتعمل ريسيت — كلمة السر بقت admin');
  renderDistUsers(labId, db);
}
function distDelete(id) {
  if (!confirm('هتحذف المعمل نهائياً؟')) return;
  META.labs = META.labs.filter(l => l.id !== id);
  localStorage.removeItem(labKey(id)); saveMeta(); renderDistributor();
}
/* دخول مباشر بمسار #/go/<labId> */
function goLab(id) {
  const l = labById(id);
  if (!l) { toast('⚠️ المعمل غير موجود'); return; }
  modal(`<h3>دخول ${esc(l.name)}</h3>
    <div class="field"><label>اسم المستخدم</label><input class="inp2" id="gl-user" style="width:100%"></div>
    <div class="field"><label>كلمة المرور</label><input class="inp2" type="password" id="gl-pass" style="width:100%"></div>
    <div class="modal-actions">
      <button class="btn btn-p" onclick="doGoLab('${id}')">دخول ⬅</button>
      <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
    </div>`);
}
function doGoLab(id) {
  const lab = labById(id);
  if (!lab.active) return toast('⚠️ المعمل موقوف');
  const raw = JSON.parse(localStorage.getItem(labKey(id)) || 'null');
  const usr = (raw?.users || []).find(x => x.user === $('#gl-user').value.trim() && x.pass === $('#gl-pass').value);
  if (!usr) return toast('⚠️ بيانات الدخول غير صحيحة');
  activate(id); loadLab(id);
  setSession({ type: 'lab', labId: id, name: usr.name, role: usr.role, user: usr.user });
  closeModal(); go(''); route();
}

/* ---------- home: التبويبات الخمسة ---------- */
function renderHome() {
  const ses = session();
  const tiles = [
    ['reception', 'الاستقبال', 'تسجيل الحالات والفواتير وتحصيل المدفوعات', '🧾', '#1e5eff'],
    ['casa', 'CASA', 'تحليل السائل المنوي — الحالات تتسجل تلقائياً من الاستقبال', '🔬', '#0fa08c'],
    ['finance', 'الحسابات', 'الخزينة + بيان الوارد والمصروف + مديونية الشركات', '💰', '#e8a33d'],
    ['inventory', 'المخزن', 'المخزون والمستهلك والمتبقي وإنذار نقص المخزون', '📦', '#7a4fd0'],
    ['settings', 'الإعدادات', 'الأسعار والتحاليل واللوجو والترويسة والمستخدمين والشركات', '⚙️', '#54627d'],
  ];
  $('#root').innerHTML = `
  <div class="topbar">
    <img src="${DB.lab.logo || 'icon-192.png'}" onerror="this.src='icon-192.png'">
    <span class="t">CSL</span>
    <span class="sp"></span>
    <span id="sync-badge" class="sync-badge off">…</span>
    <span class="who">${esc(ses.name)} (${esc(ses.role)})</span>
    <button class="icon-btn" onclick="logout()" title="خروج">⏻</button>
  </div>
  <div id="view">
    <div class="lab-head">
      ${DB.lab.logo ? `<img src="${DB.lab.logo}">` : `<img src="icon-192.png">`}
      <div>
        <div class="n">${esc(DB.lab.name)}</div>
        <div class="b">🕐 ${esc(DB.lab.schedule)}</div>
        <div class="b">🔗 csl.mtayea.com/#/go/${LABID}</div>
      </div>
    </div>
    <div class="tiles">
      ${tiles.map(t => `<div class="tile" onclick="go('${t[0]}')">
        <div class="ic" style="background:${t[4]}22;color:${t[4]}">${t[3]}</div>
        <div><h3>${t[1]}</h3><p>${t[2]}</p></div>
        <span class="arr">←</span></div>`).join('')}
    </div>
  </div>`;
  updateSyncBadge();
}

/* ============================================================
   1) الاستقبال — تسجيل حالة + حسابها (إجمالي/خصم/مدفوع/متبقي)
   ============================================================ */
let recState = { patientId: null, testIds: new Set() };
const patById = id => DB.patients.find(p => p.id === id);
const testById = id => DB.tests.find(t => t.id === id);
function visitTotal(v) { const s = v.tests.reduce((a, t) => a + (testById(t.testId)?.price || 0), 0); return Math.max(0, s - (v.discount || 0)); }

function renderReception() {
  recState = { patientId: null, testIds: new Set() };
  const todayVisits = DB.visits.filter(v => v.date === today());
  shell('الاستقبال — تسجيل حالة جديدة', `
  <div class="stats">
    <div class="stat blue"><div class="v">${todayVisits.length}</div><div class="l">حالات اليوم</div></div>
    <div class="stat green"><div class="v">${fmt(todayVisits.reduce((a, v) => a + (v.paidAmount || 0), 0))}</div><div class="l">محصّل اليوم</div></div>
    <div class="stat red"><div class="v">${fmt(todayVisits.reduce((a, v) => a + Math.max(0, visitTotal(v) - (v.paidAmount || 0)), 0))}</div><div class="l">متبقٍ على العملاء</div></div>
  </div>
  <div class="card"><h3>١) بيانات الحالة</h3>
    <div class="toolbar">
      <input id="rec-search" class="inp2" placeholder="🔍 بحث بالاسم أو كود أو موبايل…" style="flex:1;min-width:220px" oninput="recSearch()">
      <button class="btn btn-t btn-s" onclick="recNewPatient()">+ حالة جديدة</button>
    </div>
    <div id="rec-pat-results"></div>
    <div id="rec-pat-chosen"></div>
  </div>
  <div class="card"><h3>٢) التحاليل المطلوبة</h3>
    <input id="rec-test-q" class="inp2" placeholder="🔍 بحث ذكي في ${DB.tests.length} تحليل…" style="width:100%;margin-bottom:12px" oninput="recTestSearch()">
    <div id="rec-test-list" style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow:auto"></div>
    <div id="rec-chosen" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px"></div>
  </div>
  <div class="card"><h3>٣) حساب الحالة</h3>
    <div class="grid3">
      <div class="field"><label>الإجمالي</label><input class="inp2" id="rec-total" readonly style="width:100%;font-weight:800"></div>
      <div class="field"><label>نوع الخصم</label><select class="inp2" id="rec-disc-type" style="width:100%" onchange="recCalc()">
        <option value="amount">مبلغ ثابت</option><option value="percent">نسبة %</option></select></div>
      <div class="field"><label>قيمة الخصم</label><input class="inp2 num" id="rec-disc" type="number" value="0" style="width:100%" oninput="recCalc()"></div>
      <div class="field"><label>المطلوب بعد الخصم</label><input class="inp2" id="rec-net" readonly style="width:100%;font-weight:800;color:#b57a14"></div>
      <div class="field"><label>المدفوع</label><input class="inp2 num" id="rec-paid" type="number" value="0" style="width:100%" oninput="recCalc()"></div>
      <div class="field"><label>المتبقي</label><input class="inp2" id="rec-remain" readonly style="width:100%;font-weight:800;color:#c62828"></div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div class="field"><label>👨‍⚕️ اسم الدكتور</label><input class="inp2" id="rec-doc" style="width:100%"></div>
      <div class="field"><label>ملاحظات</label><input class="inp2" id="rec-notes" style="width:100%"></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="btn btn-p" style="width:auto" onclick="recSave()">💾 حفظ الحالة</button>
      <button class="btn btn-g" style="width:auto" onclick="recSave(true)">💾 حفظ + طباعة</button>
    </div>
  </div>
  <div class="card"><h3>📋 حالات اليوم</h3><div id="rec-visits"></div></div>`);
  recTestSearch();
  recRenderVisits();
}
function recSearch() {
  const q = $('#rec-search').value.trim().toLowerCase();
  const res = q ? DB.patients.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8) : [];
  $('#rec-pat-results').innerHTML = res.map(p => `<div class="chk-row" style="margin-bottom:6px" onclick="recPickPatient('${p.id}')">
    <b>${esc(p.name)}</b> <span class="num">${esc(p.code)}</span> <span style="color:var(--mut)">${esc(p.phone || '')}</span></div>`).join('') || (q ? '<div class="empty">لا نتائج — اعمل حالة جديدة</div>' : '');
}
function recNewPatient() {
  const q = $('#rec-search').value.trim();
  modal(`<h3>تسجيل حالة جديدة</h3>
    <div class="grid2">
      <div class="field"><label>الاسم بالكامل *</label><input class="inp2" id="np-name" value="${esc(q)}" style="width:100%"></div>
      <div class="field"><label>السن *</label><input class="inp2 num" id="np-age" type="number" min="0" max="120" style="width:100%"></div>
      <div class="field"><label>النوع</label><select class="inp2" id="np-gender" style="width:100%"><option>ذكر</option><option>أنثى</option></select></div>
      <div class="field"><label>رقم التليفون</label><input class="inp2 num" id="np-phone" style="width:100%"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-p" onclick="recSavePatient()">💾 حفظ</button>
      <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
    </div>`);
}
function recSavePatient() {
  const name = $('#np-name').value.trim(), age = +$('#np-age').value;
  if (!name || !age) return toast('⚠️ الاسم والسن مطلوبان');
  const p = { id: uid('p'), name, age, gender: $('#np-gender').value, phone: $('#np-phone').value.trim(), code: 'P-' + String(DB.seq.patient++).padStart(4, '0'), createdAt: today() };
  DB.patients.push(p); save(); closeModal(); recPickPatient(p.id);
  toast('✅ تم تسجيل الحالة ' + p.code);
}
function recPickPatient(id) {
  recState.patientId = id;
  const p = patById(id);
  $('#rec-pat-results').innerHTML = '';
  $('#rec-pat-chosen').innerHTML = `<div class="hint ok">✅ الحالة المختارة: <b>${esc(p.name)}</b> — <span class="num">${esc(p.code)}</span> — ${p.age} سنة — ${esc(p.phone || 'بدون تليفون')}</div>`;
}
function recTestSearch() {
  const q = ($('#rec-test-q')?.value || '').trim().toLowerCase();
  const list = DB.tests.filter(t => !q || t.name.toLowerCase().includes(q)).slice(0, 60);
  $('#rec-test-list').innerHTML = list.map(t => `
    <label class="chk-row"><input type="checkbox" ${recState.testIds.has(t.id) ? 'checked' : ''} onchange="recToggleTest('${t.id}')">
      <span><b>${esc(t.name)}</b><br><small style="color:var(--mut)">${esc(t.cat || '')}</small></span>
      <span class="pr num">${fmt(t.price)} ج.م</span></label>`).join('') || '<div class="empty">لا نتائج</div>';
}
function recToggleTest(id) {
  recState.testIds.has(id) ? recState.testIds.delete(id) : recState.testIds.add(id);
  recRenderChosen();
}
function recRenderChosen() {
  const total = [...recState.testIds].reduce((a, id) => a + (testById(id)?.price || 0), 0);
  $('#rec-chosen').innerHTML = [...recState.testIds].map(id => { const t = testById(id); return t ? `<span class="pill p-done">${esc(t.name)} — ${fmt(t.price)}</span>` : ''; }).join('');
  $('#rec-total').value = fmt(total) + ' ج.م';
  recCalc();
}
function recCalc() {
  const gross = [...recState.testIds].reduce((a, id) => a + (testById(id)?.price || 0), 0);
  const type = $('#rec-disc-type').value, val = +$('#rec-disc').value || 0;
  const disc = type === 'percent' ? Math.round(gross * Math.min(100, val) / 100) : val;
  const net = Math.max(0, gross - disc);
  const paid = Math.min(net, +$('#rec-paid').value || 0);
  $('#rec-net').value = fmt(net) + ' ج.م';
  $('#rec-remain').value = fmt(net - paid) + ' ج.م';
}
function recSave(printIt) {
  if (!recState.patientId) return toast('⚠️ اختر الحالة أولاً');
  if (!recState.testIds.size) return toast('⚠️ اختار تحليلاً واحداً على الأقل');
  const gross = [...recState.testIds].reduce((a, id) => a + (testById(id)?.price || 0), 0);
  const type = $('#rec-disc-type').value, val = +$('#rec-disc').value || 0;
  const disc = type === 'percent' ? Math.round(gross * Math.min(100, val) / 100) : val;
  const net = Math.max(0, gross - disc);
  const paid = Math.min(net, +$('#rec-paid').value || 0);
  const v = {
    id: uid('v'), no: DB.seq.visit++, invoiceNo: DB.seq.invoice++,
    patientId: recState.patientId, date: today(), doctor: $('#rec-doc').value.trim(),
    discount: disc, paidAmount: paid, notes: $('#rec-notes').value.trim(),
    tests: [...recState.testIds].map(tid => ({ testId: tid, status: 'pending', results: {} })),
  };
  DB.visits.unshift(v);
  if (paid > 0) logPayment(v, paid);
  // CASA queue: أي تحليل منوي يسمع في CASA تلقائياً
  const casaHit = v.tests.some(t => /منوي|سمن|casa|semen/i.test(testById(t.testId)?.name || ''));
  if (casaHit) DB.casaQueue.unshift({ visitId: v.id, addedAt: new Date().toISOString(), done: false });
  save();
  toast('✅ تم حفظ الحالة — فاتورة رقم ' + v.invoiceNo + (casaHit ? ' — 🔬 اتسجلت في CASA' : ''));
  if (printIt) printInvoice(v.id);
  renderReception();
}
function recRenderVisits() {
  const vs = DB.visits.filter(v => v.date === today());
  $('#rec-visits').innerHTML = vs.length ? `<table><tr><th>الفاتورة</th><th>الحالة</th><th>الدكتور</th><th>الإجمالي</th><th>الخصم</th><th>المطلوب</th><th>المدفوع</th><th>المتبقي</th><th></th></tr>
    ${vs.map(v => { const p = patById(v.patientId); const net = visitTotal(v); const rem = net - (v.paidAmount || 0);
      return `<tr><td class="num">${v.invoiceNo}</td><td>${esc(p?.name)}</td><td>${esc(v.doctor || '-')}</td>
      <td class="num">${fmt(v.tests.reduce((a, t) => a + (testById(t.testId)?.price || 0), 0))}</td>
      <td class="num" style="color:#e65100">${fmt(v.discount)}</td>
      <td class="num"><b>${fmt(net)}</b></td>
      <td class="num" style="color:#2e7d32">${fmt(v.paidAmount || 0)}</td>
      <td class="num" style="color:${rem > 0 ? '#c62828' : '#2e7d32'};font-weight:700">${fmt(rem)}</td>
      <td><button class="btn btn-o btn-s" onclick="printInvoice('${v.id}')">🖨️</button>
          ${rem > 0 ? `<button class="btn btn-g btn-s" onclick="visitPay('${v.id}')">تسجيل دفع</button>` : ''}</td></tr>`; }).join('')}</table>`
    : '<div class="empty">لا توجد حالات اليوم</div>';
}
function visitPay(id) {
  const v = DB.visits.find(x => x.id === id);
  const net = visitTotal(v), rem = net - (v.paidAmount || 0);
  modal(`<h3>تسجيل دفع — فاتورة ${v.invoiceNo}</h3>
    <div class="hint">المتبقي: <b>${fmt(rem)} ج.م</b></div>
    <div class="field"><label>المبلغ المدفوع</label><input class="inp2 num" id="vp-amount" type="number" value="${rem}" style="width:100%"></div>
    <div class="modal-actions">
      <button class="btn btn-p" onclick="doVisitPay('${id}')">💾 تسجيل</button>
      <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
    </div>`);
}
function doVisitPay(id) {
  const v = DB.visits.find(x => x.id === id);
  const net = visitTotal(v), rem = net - (v.paidAmount || 0);
  const amt = Math.min(rem, +$('#vp-amount').value || 0);
  if (amt <= 0) return toast('⚠️ أدخل مبلغاً صحيحاً');
  v.paidAmount = (v.paidAmount || 0) + amt;
  logPayment(v, amt);
  save(); closeModal(); toast('✅ تم تسجيل دفع ' + fmt(amt) + ' ج.م — اتسجل في الحسابات');
  route();
}

/* ---------- فاتورة طباعة ---------- */
function printInvoice(id) {
  const v = DB.visits.find(x => x.id === id); const p = patById(v.patientId); const h = DB.lab.header;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${v.invoiceNo}</title>
  <style>body{font-family:Tahoma;font-size:13px;padding:20px}h2{margin:0}.hd{text-align:center;border-bottom:2px solid #0d1b3e;padding-bottom:10px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:7px;text-align:center}th{background:#0d1b3e;color:#fff}
  .t{margin-top:14px;font-size:15px}.sch{text-align:center;color:#666;font-size:12px;margin-top:16px}</style></head><body>
  <div class="hd">${DB.lab.logo ? `<img src="${DB.lab.logo}" style="max-height:70px">` : ''}
    <h2>${esc(h.title)}</h2><div>${esc(h.address)}</div><div class="num">${esc(h.phones)}</div></div>
  <div>فاتورة رقم: <b class="num">${v.invoiceNo}</b> — التاريخ: <b>${v.date}</b></div>
  <div>الحالة: <b>${esc(p?.name)}</b> — ${p?.age} سنة — <span class="num">${esc(p?.phone || '')}</span></div>
  ${v.doctor ? `<div>الدكتور: <b>${esc(v.doctor)}</b></div>` : ''}
  <table><tr><th>#</th><th>التحليل</th><th>السعر</th></tr>
  ${v.tests.map((t, i) => { const tt = testById(t.testId); return `<tr><td>${i + 1}</td><td>${esc(tt?.name)}</td><td>${fmt(tt?.price)}</td></tr>`; }).join('')}</table>
  <div class="t">الإجمالي: ${fmt(v.tests.reduce((a, t) => a + (testById(t.testId)?.price || 0), 0))} ج.م — الخصم: ${fmt(v.discount)} ج.م — <b>المطلوب: ${fmt(visitTotal(v))} ج.م</b> — المدفوع: ${fmt(v.paidAmount || 0)} ج.م — المتبقي: ${fmt(visitTotal(v) - (v.paidAmount || 0))} ج.م</div>
  <div class="sch">🕐 ${esc(DB.lab.schedule)}<br>${esc(h.footer)}</div>
  <script>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ---------- دفتر التحصيل (يرتبط بالحسابات) ---------- */
function logPayment(v, amount) {
  DB.payments = DB.payments || [];
  DB.payments.push({ id: uid('pay'), visitId: v.id, invoiceNo: v.invoiceNo, patient: (patById(v.patientId) || {}).name || '', amount, date: today(), at: new Date().toISOString() });
}
function invoiceIncomeByShift(date) {
  let m = 0, e = 0;
  (DB.payments || []).filter(p => p.date === date).forEach(p => { if (new Date(p.at).getHours() < 14) m += p.amount; else e += p.amount; });
  return { m, e, total: m + e };
}

/* ============================================================
   2) CASA — تحليل السائل المنوي (يتسجل تلقائياً من الاستقبال)
   ============================================================ */
const CASA_TEMPLATE = [
  ['فترة الامتناع (أيام)', 'abstinence', '2-7'],
  ['درجة الحرارة (°م)', 'temp', ''],
  ['لزوجة السائل المنوي', 'viscosity', ''],
  ['التخفيف (مرات)', 'dilution', ''],
  ['الحجم (مل)', 'volume', '≥ 1.5'],
  ['pH', 'ph', '≥ 7.2'],
  ['تركيز الحيوانات المنوية (مليون/مل)', 'concentration', '≥ 15'],
  ['إجمالي العدد (مليون)', 'totalCount', '≥ 39'],
  ['الحركة التقدمية % (PR)', 'pr', '≥ 30'],
  ['إجمالي الحركة % (PR+NP)', 'totalMotility', '≥ 40'],
  ['الحيوانات الساكنة %', 'immotile', ''],
  ['الشكل الطبيعي %', 'morphology', '≥ 4'],
  ['الخلايا المستديرة (مليون/مل)', 'roundCells', '< 5'],
  ['التكتل (Aggr.)', 'agglutination', ''],
];
function renderCASA() {
  const queue = (DB.casaQueue || []).filter(q => !q.done);
  const done = (DB.casaQueue || []).filter(q => q.done);
  shell('CASA — تحليل السائل المنوي', `
  ${DB.casaQueue === undefined ? '' : ''}
  <div class="stats">
    <div class="stat blue"><div class="v">${queue.length}</div><div class="l">في الانتظار</div></div>
    <div class="stat green"><div class="v">${done.length}</div><div class="l">مكتمل اليوم</div></div>
  </div>
  <div class="card"><h3>🔬 حالات CASA المسجلة تلقائياً من الاستقبال</h3>
    ${queue.length ? `<table><tr><th>الفاتورة</th><th>الحالة</th><th>الدكتور</th><th>الوقت</th><th></th></tr>
    ${queue.map(q => { const v = DB.visits.find(x => x.id === q.visitId); if (!v) return ''; const p = patById(v.patientId);
      return `<tr><td class="num">${v.invoiceNo}</td><td style="font-weight:700">${esc(p?.name)}</td><td>${esc(v.doctor || '-')}</td>
      <td>${new Date(q.addedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</td>
      <td><button class="btn btn-p btn-s" onclick="casaWork('${q.visitId}')">فتح التحليل</button></td></tr>`; }).join('')}</table>`
    : '<div class="empty">لا توجد حالات منتظرة — أي حالة بتتسجل في الاستقبال بتحليل منوي بتظهر هنا تلقائياً</div>'}
  </div>
  <div class="card"><h3>✅ محاليل مكتملة</h3>
    ${done.length ? `<table><tr><th>الفاتورة</th><th>الحالة</th><th>التركيز</th><th>الحركة التقدمية</th><th>الشكل الطبيعي</th><th></th></tr>
    ${done.slice().reverse().map(q => { const v = DB.visits.find(x => x.id === q.visitId); if (!v) return ''; const p = patById(v.patientId);
      const r = v.casaResults || {};
      return `<tr><td class="num">${v.invoiceNo}</td><td>${esc(p?.name)}</td><td class="num">${esc(r.concentration || '-')}</td>
      <td class="num">${esc(r.pr || '-')}%</td><td class="num">${esc(r.morphology || '-')}%</td>
      <td><button class="btn btn-o btn-s" onclick="casaReport('${v.id}')">🖨️ تقرير</button></td></tr>`; }).join('')}</table>`
    : '<div class="empty">لا توجد محاليل مكتملة</div>'}
  </div>`);
}
function casaWork(visitId) {
  const v = DB.visits.find(x => x.id === visitId); const p = patById(v.patientId);
  const r = v.casaResults || {};
  modal(`<h3>🔬 CASA — ${esc(p?.name)} <span class="num">(فاتورة ${v.invoiceNo})</span></h3>
    <div class="results-grid">
    ${CASA_TEMPLATE.map(f => `<div class="res-field"><label>${f[0]}</label>
      <input id="casa-${f[1]}" value="${esc(r[f[1]] ?? '')}" ${f[1] === 'abstinence' ? '' : ''}>
      ${f[2] ? `<div class="rf">مرجع: ${f[2]}</div>` : ''}</div>`).join('')}
    </div>
    <div class="field" style="margin-top:12px"><label>ملاحظات</label><input class="inp2" id="casa-notes" value="${esc(r.notes || '')}" style="width:100%"></div>
    <div class="modal-actions">
      <button class="btn btn-p" onclick="casaSave('${visitId}')">💾 حفظ النتيجة</button>
      <button class="btn btn-g" onclick="casaSave('${visitId}',true)">💾 حفظ + تقرير</button>
      <button class="btn btn-o" onclick="closeModal()">إغلاق</button>
    </div>`);
}
function casaSave(visitId, report) {
  const v = DB.visits.find(x => x.id === visitId);
  const r = {};
  CASA_TEMPLATE.forEach(f => { const el = $('#casa-' + f[1]); if (el) r[f[1]] = el.value.trim(); });
  r.notes = $('#casa-notes').value.trim();
  r.at = new Date().toISOString();
  v.casaResults = r;
  const q = (DB.casaQueue || []).find(x => x.visitId === visitId);
  if (q) q.done = true;
  // تحديث حالة الاختبار نفسه في الزيارة
  v.tests.forEach(t => { if (/منوي|سمن|casa|semen/i.test(testById(t.testId)?.name || '')) { t.status = 'done'; t.results = t.results || {}; t.results['نتيجة CASA'] = 'مكتملة — شوف التقرير'; } });
  save(); closeModal();
  toast('✅ تم حفظ نتيجة CASA');
  if (report) casaReport(visitId); else renderCASA();
}
function casaReport(visitId) {
  const v = DB.visits.find(x => x.id === visitId); const p = patById(v.patientId); const h = DB.lab.header;
  const r = v.casaResults || {};
  const abnormal = (val, ref) => {
    if (!val || !ref) return '';
    const num = parseFloat(val); if (isNaN(num)) return '';
    if (ref.startsWith('≥')) return num < parseFloat(ref.slice(1)) ? ' style="color:#c62828;font-weight:800"' : '';
    if (ref.startsWith('<')) return num >= parseFloat(ref.slice(1)) ? ' style="color:#c62828;font-weight:800"' : '';
    return '';
  };
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير CASA</title>
  <style>body{font-family:Tahoma;font-size:13.5px;padding:24px;max-width:800px;margin:auto}
  .hd{text-align:center;border-bottom:2px solid #0d1b3e;padding-bottom:10px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #888;padding:8px;text-align:center}th{background:#0d1b3e;color:#fff}
  .ref{color:#888;font-size:11px}.foot{margin-top:18px;font-size:11.5px;color:#666;text-align:center;border-top:1px solid #ccc;padding-top:10px}</style></head><body>
  <div class="hd">${DB.lab.logo ? `<img src="${DB.lab.logo}" style="max-height:70px">` : ''}<h2>${esc(h.title)}</h2>
  <div>${esc(h.address)}</div><div class="num">${esc(h.phones)}</div>
  <div style="margin-top:6px;font-weight:800">تقرير تحليل السائل المنوي — Semen Analysis (CASA)</div></div>
  <div>الاسم: <b>${esc(p?.name)}</b> — السن: ${p?.age} — النوع: ${p?.gender} — التاريخ: <b>${(r.at || '').slice(0, 10) || today()}</b></div>
  ${v.doctor ? `<div>الدكتور المحوّل: <b>${esc(v.doctor)}</b></div>` : ''}
  <table><tr><th>الفحص</th><th>النتيجة</th><th>المرجع (WHO)</th></tr>
  ${CASA_TEMPLATE.filter(f => r[f[1]]).map(f => `<tr><td>${f[0]}</td><td${abnormal(r[f[1]], f[2])}>${esc(r[f[1]])}</td><td class="ref">${f[2] || '-'}</td></tr>`).join('')}</table>
  ${r.notes ? `<div style="margin-top:12px"><b>ملاحظات:</b> ${esc(r.notes)}</div>` : ''}
  <div class="foot">🕐 ${esc(DB.lab.schedule)} — ${esc(h.footer)}<br>فاتورة رقم ${v.invoiceNo}</div>
  <script>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ============================================================
   3) الحسابات = الخزينة (وارد/مصروف) + مديونية الشركات
   ============================================================ */
const TR_EXPENSE_FIELDS = [['e-tissues','مناديل'],['e-gloves','جوانتي'],['e-cotton','قطن'],['e-syringes','سرنجات'],['e-pens','أقلام'],['e-pins','دبابيس'],['e-sticks','اساتيك'],['e-saline','محلول ملح'],['e-water','مياه حقن'],['e-insulin','سرنجات انسولين'],['e-heparin','هيبارين'],['e-bags','أكياس'],['e-incinerator','محرقة'],['e-sugar','سكر'],['e-tea','شاي'],['e-coffee','قهوة'],['e-food','أكل'],['e-doctor','دكتور'],['e-other','أخرى'],['e-lab-m','لاب صباحي'],['e-lab-e','لاب مسائي']];
let trDiscounts = [], trExpDetails = [];
const tgv = id => parseFloat((document.getElementById(id) || {}).value) || 0;
const tsv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
function tdata() {
  DB.companies = DB.companies || []; DB.companyDebts = DB.companyDebts || [];
  DB.inventory = DB.inventory || []; DB.invLog = DB.invLog || []; DB.casaQueue = DB.casaQueue || [];
  if (!DB.treasury) DB.treasury = { days: {}, balances: [] }; if (!DB.treasury.days) DB.treasury.days = {}; if (!DB.treasury.balances) DB.treasury.balances = []; return DB.treasury; }

function renderFinance() {
  tdata();
  const todayStr = today();
  trDiscounts = []; trExpDetails = [];
  const compTotals = DB.companies.map(c => {
    const debts = DB.companyDebts.filter(d => d.companyId === c.id);
    const total = debts.reduce((a, d) => a + d.amount, 0);
    const paid = debts.reduce((a, d) => a + d.paid, 0);
    return { c, total, paid, remaining: total - paid };
  });
  const month = todayStr.slice(0, 7);
  const monthPaid = DB.companyDebts.filter(d => (d.date || '').startsWith(month)).reduce((a, d) => a + d.paid, 0);

  shell('الحسابات — الخزينة والمديونية', `
  <div class="tabs5">
    <button class="btn btn-t on" id="ftab-treasury" onclick="finTab('treasury')">💼 الخزينة</button>
    <button class="btn btn-o" id="ftab-comp" onclick="finTab('comp')">🏢 مديونية الشركات</button>
  </div>
  <div id="fin-treasury">
    <div class="hint ok">🧾 أي مبلغ بيتسجل «مدفوع» في الاستقبال بيظهر هنا في «وارد الفواتير» تلقائياً — صباحي (قبل 2 ظهراً) ومسائي (بعدها)</div>
    <div class="card"><h3>📅 اليوم</h3>
      <div class="toolbar">
        <input type="date" id="tr-date" class="inp2" value="${todayStr}" onchange="trLoadDay()">
        <button class="btn btn-p btn-s" onclick="trSaveDay()">💾 حفظ اليوم</button>
        <button class="btn btn-o btn-s no-print" onclick="window.print()">🖨️ طباعة</button>
      </div>
      <div class="stats">
        <div class="stat green"><div class="v" id="tr-st-inv">0</div><div class="l">وارد الفواتير (تلقائي)</div></div>
        <div class="stat"><div class="v" id="tr-st-p">0</div><div class="l">وارد يدوي (بيشنت)</div></div>
        <div class="stat blue"><div class="v" id="tr-st-l">0</div><div class="l">وارد اللاب</div></div>
        <div class="stat red"><div class="v" id="tr-st-e">0</div><div class="l">مصاريف</div></div>
        <div class="stat gold"><div class="v" id="tr-st-d">0</div><div class="l">خصومات</div></div>
        <div class="stat green"><div class="v" id="tr-st-g">0</div><div class="l">إجمالي الوارد</div></div>
      </div>
    </div>
    <div class="card"><h3>💵 الوارد اليدوي</h3>
      <div class="grid3">
        <div class="field"><label>بيشنت — صباحي</label><input class="inp2 num" id="tr-p-m" type="number" value="0" style="width:100%" oninput="trCalcP()"></div>
        <div class="field"><label>بيشنت — مسائي</label><input class="inp2 num" id="tr-p-e" type="number" value="0" style="width:100%" oninput="trCalcP()"></div>
        <div class="field"><label>إجمالي البيشنت</label><input class="inp2" id="tr-p-t" readonly style="width:100%;font-weight:800"></div>
        <div class="field"><label>لاب خارجي — صباحي</label><input class="inp2 num" id="tr-l-extm" type="number" value="0" style="width:100%" oninput="trCalcL()"></div>
        <div class="field"><label>لاب خارجي — مسائي</label><input class="inp2 num" id="tr-l-exte" type="number" value="0" style="width:100%" oninput="trCalcL()"></div>
        <div class="field"><label>إجمالي اللاب</label><input class="inp2" id="tr-l-total" readonly style="width:100%;font-weight:800"></div>
      </div>
      <div class="grid3">
        <div class="field"><label>خصم البيشنت (يُعرض فقط)</label><input class="inp2 num" id="tr-disc" type="number" value="0" style="width:100%" oninput="trStats()"></div>
        <div class="field"><label>مصاريف اللاب — صباحي</label><input class="inp2 num" id="e-lab-m" type="number" value="0" style="width:100%" oninput="trStats()"></div>
        <div class="field"><label>مصاريف اللاب — مسائي</label><input class="inp2 num" id="e-lab-e" type="number" value="0" style="width:100%" oninput="trStats()"></div>
      </div>
    </div>
    <div class="card"><h3>📋 المصاريف التشغيلية</h3>
      <div class="grid3">
        ${TR_EXPENSE_FIELDS.slice(0, 18).map(f => `<div class="field"><label>${f[1]}</label><input class="inp2 num" id="${f[0]}" type="number" value="0" style="width:100%" oninput="trStats()"></div>`).join('')}
      </div>
    </div>
    <div class="card"><h3>📝 بيان مصاريف حرة (بيان + جهة + مبلغ)</h3>
      <div class="toolbar">
        <input class="inp2" id="tr-x-desc" placeholder="البيان (مثال: فاتورة كهرباء)" style="flex:2;min-width:180px">
        <input class="inp2 num" id="tr-x-amount" type="number" placeholder="المبلغ" style="width:130px">
        <select class="inp2" id="tr-x-party" style="width:160px"><option value="">-- الجهة --</option><option>دلتا كير</option><option>أحمد عصام</option><option>بيور</option><option>أخرى</option></select>
        <button class="btn btn-r btn-s" onclick="trAddExp()">➕ إضافة</button>
      </div>
      <div id="tr-x-table"></div>
    </div>
    <div class="card"><h3>📅 ملخص الأيام المحفوظة</h3>
      <div id="tr-monthly"></div>
    </div>
    <div class="card"><h3>📒 دفتر اليومية + 💰 الأرباح</h3>
      <div class="toolbar"><input type="month" id="tr-month-pick" class="inp2" value="${month}" onchange="trReports()"></div>
      <h3 style="font-size:13.5px;color:var(--mut);border:none;padding:0;margin:6px 0 8px">دفتر الحركة</h3><div id="tr-ledger"></div>
      <h3 style="font-size:13.5px;color:var(--mut);border:none;padding:0;margin:16px 0 8px">الأرباح الشهرية (بعد خصم سداد الشركات)</h3><div id="tr-profit"></div>
    </div>
  </div>
  <div id="fin-comp" style="display:none">
    <div class="stats">
      <div class="stat ${compTotals.reduce((a, c) => a + c.remaining, 0) > 0 ? 'red' : 'green'}"><div class="v">${fmt(compTotals.reduce((a, c) => a + c.remaining, 0))}</div><div class="l">إجمالي المديونية المتبقية</div></div>
      <div class="stat green"><div class="v">${fmt(compTotals.reduce((a, c) => a + c.paid, 0))}</div><div class="l">إجمالي السداد</div></div>
      <div class="stat gold"><div class="v">${fmt(monthPaid)}</div><div class="l">سداد هذا الشهر (بيتحخصم من الأرباح)</div></div>
    </div>
    <div class="card"><h3>➕ تسجيل معاملة شركة</h3>
      <div class="toolbar">
        <select class="inp2" id="cd-company" style="min-width:180px">
          <option value="">-- اسم الشركة (بتتسجل من الإعدادات) --</option>
          ${DB.companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
        <input type="date" class="inp2" id="cd-date" value="${todayStr}">
        <input class="inp2 num" id="cd-amount" type="number" placeholder="المبلغ" style="width:130px">
        <input class="inp2 num" id="cd-paid" type="number" placeholder="المسدد" style="width:130px">
        <button class="btn btn-p btn-s" onclick="cdAdd()">➕ إضافة</button>
      </div>
      <div id="cd-list"></div>
    </div>
  </div>`);
  trLoadDay(); cdRender();
}
function finTab(t) {
  $('#fin-treasury').style.display = t === 'treasury' ? '' : 'none';
  $('#fin-comp').style.display = t === 'comp' ? '' : 'none';
  $('#ftab-treasury').className = 'btn ' + (t === 'treasury' ? 'btn-t on' : 'btn-o');
  $('#ftab-comp').className = 'btn ' + (t === 'comp' ? 'btn-t on' : 'btn-o');
}
function trCalcP() { tsv('tr-p-t', tgv('tr-p-m') + tgv('tr-p-e')); trStats(); }
function trCalcL() { tsv('tr-l-total', tgv('tr-l-extm') + tgv('tr-l-exte') + tgv('e-lab-m') + tgv('e-lab-e')); trStats(); }
function trStats() {
  const inv = invoiceIncomeByShift($('#tr-date').value);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
  set('tr-st-inv', inv.total); set('tr-st-p', tgv('tr-p-t')); set('tr-st-l', tgv('tr-l-total'));
  set('tr-st-d', tgv('tr-disc'));
  let exp = 0; TR_EXPENSE_FIELDS.forEach(f => { exp += tgv(f[0]); });
  set('tr-st-e', exp);
  set('tr-st-g', inv.total + tgv('tr-p-t') + tgv('tr-l-total'));
}
function trAddExp() {
  const desc = $('#tr-x-desc').value.trim(), amount = +$('#tr-x-amount').value || 0, party = $('#tr-x-party').value;
  if (!desc || amount <= 0) return toast('⚠️ أدخل البيان والمبلغ');
  trExpDetails.push({ desc, amount, party });
  $('#tr-x-desc').value = ''; $('#tr-x-amount').value = ''; $('#tr-x-party').value = '';
  trRenderExp();
}
function trRemoveExp(i) { trExpDetails.splice(i, 1); trRenderExp(); }
function trRenderExp() {
  const c = $('#tr-x-table');
  if (!trExpDetails.length) { c.innerHTML = '<div class="empty">لا توجد مصاريف حرة</div>'; return; }
  const tot = trExpDetails.reduce((a, e) => a + e.amount, 0);
  c.innerHTML = `<table><tr><th>#</th><th>البيان</th><th>الجهة</th><th>المبلغ</th><th></th></tr>
  ${trExpDetails.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.desc)}</td><td>${esc(e.party || '-')}</td><td class="num" style="color:#c62828;font-weight:700">${fmt(e.amount)}</td>
  <td><button class="btn btn-o btn-s" onclick="trRemoveExp(${i})">🗑️</button></td></tr>`).join('')}
  <tr style="background:#ffebee;font-weight:800"><td colspan="3">الإجمالي</td><td class="num">${fmt(tot)} ج.م</td><td></td></tr></table>`;
}
function trSaveDay() {
  const date = $('#tr-date').value;
  if (!date) return toast('⚠️ اختر التاريخ');
  let exp = {}; TR_EXPENSE_FIELDS.forEach(f => { exp[f[0]] = tgv(f[0]); });
  tdata().days[date] = {
    date, invoiceIncome: invoiceIncomeByShift(date),
    patient: { morning: tgv('tr-p-m'), evening: tgv('tr-p-e'), total: tgv('tr-p-t'), discount: tgv('tr-disc') },
    lab: { extM: tgv('tr-l-extm'), extE: tgv('tr-l-exte'), total: tgv('tr-l-total') },
    expenses: exp, expenseDetails: JSON.parse(JSON.stringify(trExpDetails)),
  };
  save(); toast('✅ تم حفظ اليوم'); trMonthly(); trReports();
}
function trLoadDay() {
  const date = $('#tr-date').value; if (!date) return;
  const d = tdata().days[date];
  trExpDetails = d ? JSON.parse(JSON.stringify(d.expenseDetails || [])) : [];
  ['tr-p-m','tr-p-e','tr-l-extm','tr-l-exte','tr-disc','e-lab-m','e-lab-e',...TR_EXPENSE_FIELDS.map(f => f[0])].forEach(id => tsv(id, 0));
  if (d) {
    tsv('tr-p-m', d.patient.morning); tsv('tr-p-e', d.patient.evening);
    tsv('tr-l-extm', d.lab.extM); tsv('tr-l-exte', d.lab.extE);
    tsv('tr-disc', d.patient.discount || 0);
    Object.entries(d.expenses || {}).forEach(([k, v]) => tsv(k, v));
  }
  trCalcP(); trCalcL(); trRenderExp(); trMonthly(); trReports();
}
function trDeleteDay(date) { if (!confirm('حذف بيانات ' + date + '؟')) return; delete tdata().days[date]; save(); trMonthly(); trReports(); if ($('#tr-date').value === date) trLoadDay(); }
function trMonthly() {
  const data = tdata().days; const dates = Object.keys(data).sort().reverse();
  $('#tr-monthly').innerHTML = dates.length ? `<table><tr><th>اليوم</th><th>وارد فواتير</th><th>وارد يدوي</th><th>إجمالي الوارد</th><th>مصاريف</th><th></th></tr>
  ${dates.map(dt => { const d = data[dt]; const inv = d.invoiceIncome?.total || 0;
    const manual = (d.patient.total || 0) + (d.lab.total || 0);
    const exp = Object.values(d.expenses || {}).reduce((a, b) => a + (+b || 0), 0) + (d.expenseDetails || []).reduce((a, e) => a + (e.amount || 0), 0);
    return `<tr><td class="num">${dt}</td><td class="num" style="color:#2e7d32;font-weight:700">${fmt(inv)}</td>
    <td class="num">${fmt(manual)}</td><td class="num" style="color:#1565C0;font-weight:800">${fmt(inv + manual)}</td>
    <td class="num" style="color:#c62828">${fmt(exp)}</td>
    <td><button class="btn btn-o btn-s" onclick="$('#tr-date').value='${dt}';trLoadDay();window.scrollTo(0,0)">✏️</button>
    <button class="btn btn-r btn-s" onclick="trDeleteDay('${dt}')">🗑️</button></td></tr>`; }).join('')}</table>`
    : '<div class="empty">لا توجد أيام محفوظة</div>';
}
function trReports() {
  const data = Object.assign({}, tdata().days);
  (DB.payments || []).forEach(p => { if (!data[p.date]) data[p.date] = { date: p.date, patient: { total: 0 }, lab: { total: 0 }, expenses: {}, expenseDetails: [] }; });
  (DB.companyDebts || []).forEach(cd => { if (!data[cd.date]) data[cd.date] = { date: cd.date, patient: { total: 0 }, lab: { total: 0 }, expenses: {}, expenseDetails: [] }; });
  const dates = Object.keys(data).sort();
  const month = $('#tr-month-pick').value;
  // دفتر الحركة
  let bal = 0, rows = '';
  dates.slice().reverse().forEach((dt, i) => {
    const d = data[dt];
    const inv = d.invoiceIncome ? d.invoiceIncome.total : invoiceIncomeByShift(dt).total;
    const manual = (d.patient.total || 0) + (d.lab.total || 0);
    const out = Object.values(d.expenses || {}).reduce((a, b) => a + (+b || 0), 0) + (d.expenseDetails || []).reduce((a, e) => a + (e.amount || 0), 0);
    const compPaid = (DB.companyDebts || []).filter(x => x.date === dt).reduce((a, x) => a + x.paid, 0);
    const net = manual + inv - out - compPaid;
    bal += net;
    rows += `<tr><td>${i + 1}</td><td class="num">${dt}</td><td class="num">${fmt(manual)}</td><td class="num" style="color:#2e7d32">${fmt(inv)}</td>
    <td class="num" style="color:#1565C0;font-weight:700">${fmt(manual + inv)}</td><td class="num" style="color:#c62828">${fmt(out)}</td>
    <td class="num" style="color:#e65100">${fmt(compPaid)}</td><td class="num" style="font-weight:800;color:${net >= 0 ? '#2e7d32' : '#c62828'}">${fmt(net)}</td><td class="num" style="font-weight:800">${fmt(bal)}</td></tr>`;
  });
  $('#tr-ledger').innerHTML = dates.length ? `<table><tr><th>#</th><th>اليوم</th><th>وارد يدوي</th><th>فواتير</th><th>إجمالي الوارد</th><th>مصروفات</th><th>سداد شركات</th><th>الصافي</th><th>الرصيد</th></tr>${rows}</table>` : '<div class="empty">لا توجد حركات</div>';
  // الأرباح الشهرية
  const md = dates.filter(d => d.startsWith(month));
  let tIn = 0, tOut = 0, tComp = 0, prow = '';
  md.slice().reverse().forEach((dt, i) => {
    const d = data[dt];
    const inv = d.invoiceIncome ? d.invoiceIncome.total : invoiceIncomeByShift(dt).total;
    const manual = (d.patient.total || 0) + (d.lab.total || 0);
    const out = Object.values(d.expenses || {}).reduce((a, b) => a + (+b || 0), 0) + (d.expenseDetails || []).reduce((a, e) => a + (e.amount || 0), 0);
    const compPaid = (DB.companyDebts || []).filter(x => x.date === dt).reduce((a, x) => a + x.paid, 0);
    tIn += manual + inv; tOut += out; tComp += compPaid;
    const net = manual + inv - out - compPaid;
    prow += `<tr><td>${i + 1}</td><td class="num">${dt}</td><td class="num" style="color:#1565C0;font-weight:700">${fmt(manual + inv)}</td>
    <td class="num" style="color:#c62828">${fmt(out)}</td><td class="num" style="color:#e65100">${fmt(compPaid)}</td>
    <td class="num" style="font-weight:800;color:${net >= 0 ? '#2e7d32' : '#c62828'}">${fmt(net)}</td></tr>`;
  });
  const net = tIn - tOut - tComp;
  $('#tr-profit').innerHTML = md.length ? `<table><tr><th>#</th><th>اليوم</th><th>الوارد</th><th>المصروفات</th><th>سداد شركات</th><th>صافي الربح</th></tr>${prow}
  <tr style="background:${net >= 0 ? '#e8f5e9' : '#ffebee'};font-weight:800"><td colspan="2">إجمالي الشهر (${md.length} يوم)</td>
  <td class="num">${fmt(tIn)} ج.م</td><td class="num">${fmt(tOut)} ج.م</td><td class="num">${fmt(tComp)} ج.م</td>
  <td class="num" style="font-size:16px;color:${net >= 0 ? '#2e7d32' : '#c62828'}">${fmt(net)} ج.م</td></tr></table>`
    : '<div class="empty">لا توجد بيانات في هذا الشهر</div>';
}

/* ---------- مديونية الشركات ---------- */
function cdAdd() {
  const companyId = $('#cd-company').value;
  const date = $('#cd-date').value;
  const amount = +$('#cd-amount').value || 0;
  const paid = +$('#cd-paid').value || 0;
  if (!companyId) return toast('⚠️ اختار الشركة (بتتسجل من الإعدادات)');
  if (!amount) return toast('⚠️ أدخل المبلغ');
  DB.companyDebts.push({ id: uid('cd'), companyId, date, amount, paid, remaining: Math.max(0, amount - paid) });
  save(); toast('✅ تم تسجيل المعاملة');
  $('#cd-amount').value = ''; $('#cd-paid').value = '';
  cdRender(); trReports();
}
function cdPay(id) {
  const d = DB.companyDebts.find(x => x.id === id);
  const rem = d.amount - d.paid;
  if (rem <= 0) return toast('✅ المعاملة مسددة بالكامل');
  modal(`<h3>سداد — ${esc(DB.companies.find(c => c.id === d.companyId)?.name)}</h3>
    <div class="hint">المتبقي: <b>${fmt(rem)} ج.م</b></div>
    <div class="field"><label>مبلغ السداد</label><input class="inp2 num" id="cdp-amount" type="number" value="${rem}" style="width:100%"></div>
    <div class="modal-actions"><button class="btn btn-p" onclick="cdDoPay('${id}')">💾 تسجيل السداد</button>
    <button class="btn btn-o" onclick="closeModal()">إلغاء</button></div>`);
}
function cdDoPay(id) {
  const d = DB.companyDebts.find(x => x.id === id);
  const rem = d.amount - d.paid;
  const amt = Math.min(rem, +$('#cdp-amount').value || 0);
  if (amt <= 0) return toast('⚠️ مبلغ غير صحيح');
  d.paid += amt;
  save(); closeModal(); toast('✅ تم تسجيل سداد ' + fmt(amt) + ' ج.م');
  cdRender();
}
function cdDelete(id) { if (!confirm('حذف المعاملة؟')) return; DB.companyDebts = DB.companyDebts.filter(x => x.id !== id); save(); cdRender(); }
function cdRender() {
  const c = $('#cd-list'); if (!c) return;
  if (!DB.companies.length) { c.innerHTML = '<div class="hint warn">⚠️ لسه مفيش شركات — ضيفها من الإعدادات ← قائمة الشركات</div>'; return; }
  c.innerHTML = DB.companies.map(comp => {
    const debts = DB.companyDebts.filter(d => d.companyId === comp.id).sort((a, b) => b.date.localeCompare(a.date));
    const total = debts.reduce((a, d) => a + d.amount, 0);
    const paid = debts.reduce((a, d) => a + d.paid, 0);
    const rem = total - paid;
    return `<div class="card" style="background:#fbfcfe">
      <h3 style="display:flex;justify-content:space-between"><span>🏢 ${esc(comp.name)}</span>
      <span>${rem > 0 ? `<span class="pill p-unpaid">متبقٍ ${fmt(rem)} ج.م</span>` : '<span class="pill p-paid">مسدد بالكامل</span>'}</span></h3>
      ${debts.length ? `<table><tr><th>التاريخ</th><th>المبلغ</th><th>المسدد</th><th>المتبقي</th><th></th></tr>
      ${debts.map(d => `<tr><td class="num">${d.date}</td><td class="num">${fmt(d.amount)}</td>
      <td class="num" style="color:#2e7d32">${fmt(d.paid)}</td>
      <td class="num" style="color:${d.amount - d.paid > 0 ? '#c62828' : '#2e7d32'};font-weight:700">${fmt(d.amount - d.paid)}</td>
      <td>${d.amount - d.paid > 0 ? `<button class="btn btn-g btn-s" onclick="cdPay('${d.id}')">سداد</button>` : ''}
      <button class="btn btn-r btn-s" onclick="cdDelete('${d.id}')">🗑️</button></td></tr>`).join('')}</table>`
      : '<div class="empty">لا توجد معاملات لهذه الشركة</div>'}
      <div style="margin-top:10px;font-size:13px;color:var(--mut)">الإجمالي: ${fmt(total)} — السداد: ${fmt(paid)} — المتبقي: <b style="color:${rem > 0 ? '#c62828' : '#2e7d32'}">${fmt(rem)} ج.م</b></div>
    </div>`;
  }).join('');
}

/* ============================================================
   4) المخزن — مخزون / مستهلك / متبقي / إنذار نقص
   ============================================================ */
function renderInventory() {
  const inv = DB.inventory || [];
  inv.forEach(it => { it.consumed = (DB.invLog || []).filter(l => l.itemId === it.id).reduce((a, l) => a + l.qty, 0); });
  const low = inv.filter(it => it.stock - it.consumed < it.minStock);
  shell('المخزن — المخزون والاستهلاك', `
  <div class="stats">
    <div class="stat blue"><div class="v">${inv.length}</div><div class="l">صنف</div></div>
    <div class="stat red"><div class="v">${low.length}</div><div class="l">أصناف تحتاج طلب ⚠️</div></div>
  </div>
  ${low.length ? `<div class="hint warn">⚠️ أصناف قربت تخلص: ${low.map(i => esc(i.name)).join('، ')} — اطلبها قبل ما تتوقف</div>` : ''}
  <div class="card"><h3>➕ إضافة صنف</h3>
    <div class="toolbar">
      <input class="inp2" id="iv-name" placeholder="اسم الصنف" style="flex:2;min-width:170px">
      <input class="inp2" id="iv-unit" placeholder="الوحدة (علبة/شريط/عبوة)" style="width:160px">
      <input class="inp2 num" id="iv-stock" type="number" placeholder="المخزون (كمية واردة)" style="width:150px">
      <input class="inp2 num" id="iv-min" type="number" placeholder="حد الطلب (إنذار)" style="width:150px">
      <button class="btn btn-p btn-s" onclick="ivAdd()">➕ إضافة</button>
    </div>
  </div>
  <div class="card"><h3>📦 الأصناف — المخزون / المستهلك / المتبقي</h3>
    ${inv.length ? `<table><tr><th>الصنف</th><th>الوحدة</th><th>الواردة</th><th>المستهلك</th><th>المتبقي</th><th>الحالة</th><th></th></tr>
    ${inv.map(it => { const remain = it.stock - it.consumed; const isLow = remain < it.minStock;
      return `<tr><td style="font-weight:700">${esc(it.name)}</td><td>${esc(it.unit)}</td>
      <td class="num">${fmt(it.stock)}</td><td class="num" style="color:#e65100">${fmt(it.consumed)}</td>
      <td class="num" style="font-weight:800;color:${isLow ? '#c62828' : '#2e7d32'}">${fmt(remain)}</td>
      <td>${isLow ? '<span class="pill p-unpaid">⚠️ اطلب الآن</span>' : '<span class="pill p-paid">كافٍ</span>'}</td>
      <td><button class="btn btn-o btn-s" onclick="ivConsume('${it.id}')">➖ تسجيل استهلاك</button>
      <button class="btn btn-t btn-s" onclick="ivRestock('${it.id}')">➕ وارد مخزن</button>
      <button class="btn btn-r btn-s" onclick="ivDelete('${it.id}')">🗑️</button></td></tr>`; }).join('')}</table>`
    : '<div class="empty">المخزن فاضي — ضيف أصناف</div>'}
  </div>`);
}
function ivAdd() {
  const name = $('#iv-name').value.trim(), unit = $('#iv-unit').value.trim() || 'وحدة';
  const stock = +$('#iv-stock').value || 0, min = +$('#iv-min').value || 5;
  if (!name) return toast('⚠️ أدخل اسم الصنف');
  DB.inventory.push({ id: uid('iv'), name, unit, stock, minStock: min, createdAt: today() });
  save(); toast('✅ تم إضافة الصنف'); renderInventory();
}
function ivConsume(id) {
  const it = DB.inventory.find(x => x.id === id);
  modal(`<h3>تسجيل استهلاك — ${esc(it.name)}</h3>
    <div class="hint">المتبقي حالياً: <b>${fmt(it.stock - (DB.invLog || []).filter(l => l.itemId === id).reduce((a, l) => a + l.qty, 0))} ${esc(it.unit)}</b></div>
    <div class="field"><label>الكمية المستهلكة</label><input class="inp2 num" id="ivc-qty" type="number" value="1" style="width:100%"></div>
    <div class="modal-actions"><button class="btn btn-p" onclick="ivDoConsume('${id}')">💾 تسجيل</button>
    <button class="btn btn-o" onclick="closeModal()">إلغاء</button></div>`);
}
function ivDoConsume(id) {
  const qty = +$('#ivc-qty').value || 0;
  if (qty <= 0) return toast('⚠️ كمية غير صحيحة');
  DB.invLog = DB.invLog || [];
  DB.invLog.push({ id: uid('il'), itemId: id, qty, date: today(), at: new Date().toISOString() });
  save(); closeModal(); toast('✅ تم تسجيل الاستهلاك'); renderInventory();
}
function ivRestock(id) {
  const it = DB.inventory.find(x => x.id === id);
  modal(`<h3>وارد مخزن — ${esc(it.name)}</h3>
    <div class="field"><label>الكمية الواردة</label><input class="inp2 num" id="ivr-qty" type="number" value="10" style="width:100%"></div>
    <div class="modal-actions"><button class="btn btn-p" onclick="ivDoRestock('${id}')">💾 إضافة للمخزون</button>
    <button class="btn btn-o" onclick="closeModal()">إلغاء</button></div>`);
}
function ivDoRestock(id) {
  const qty = +$('#ivr-qty').value || 0;
  if (qty <= 0) return toast('⚠️ كمية غير صحيحة');
  const it = DB.inventory.find(x => x.id === id);
  it.stock += qty;
  save(); closeModal(); toast('✅ تم إضافة ' + qty + ' ' + it.unit); renderInventory();
}
function ivDelete(id) { if (!confirm('حذف الصنف من المخزن؟')) return; DB.inventory = DB.inventory.filter(x => x.id !== id); save(); renderInventory(); }

/* ============================================================
   5) الإعدادات
   ============================================================ */
function renderSettings() {
  const ses = session();
  if (ses.type === 'super') {
    $('#root').innerHTML = `
    <div class="topbar"><span class="t">⚙️ إعدادات الموزّع</span><span class="sp"></span>
    <button class="icon-btn" onclick="go('')">🏠</button><button class="icon-btn" onclick="logout()">⏻</button></div>
    <div id="view">
      <div class="card"><h3>بيانات الموزّع</h3>
        <div class="grid2">
          <div class="field"><label>اسم المستخدم</label><input class="inp2" id="sp-user" value="${esc(META.superUser.user)}" style="width:100%"></div>
          <div class="field"><label>كلمة المرور</label><input class="inp2" id="sp-pass" value="${esc(META.superUser.pass)}" style="width:100%"></div>
        </div>
        <button class="btn btn-p btn-s" onclick="saveSuper()">💾 حفظ</button>
      </div>
    </div>`;
    return;
  }
  shell('الإعدادات', `
  <div class="card"><h3>🏷️ بيانات المعمل</h3>
    <div class="grid2">
      <div class="field"><label>اسم المعمل</label><input class="inp2" id="st-name" value="${esc(DB.lab.name)}" style="width:100%"></div>
      <div class="field"><label>🕐 مواعيد العمل</label><input class="inp2" id="st-schedule" value="${esc(DB.lab.schedule)}" style="width:100%"></div>
    </div>
    <div class="field"><label>شعار المعمل (لوجو) — بيرفع من جهازك ويظهر في الفواتير والتقارير</label>
      <input type="file" accept="image/*" class="inp2" id="st-logo" onchange="stUploadLogo(this)" style="width:100%">
      ${DB.lab.logo ? `<img src="${DB.lab.logo}" style="max-height:70px;margin-top:8px;border-radius:10px;border:1px solid var(--line)">` : ''}
    </div>
    <button class="btn btn-p btn-s" onclick="stSaveLab()">💾 حفظ</button>
  </div>
  <div class="card"><h3>📄 ترويسة التقرير (فاتورة/نتائج)</h3>
    <div class="grid2">
      <div class="field"><label>العنوان الرئيسي</label><input class="inp2" id="st-h-title" value="${esc(DB.lab.header.title)}" style="width:100%"></div>
      <div class="field"><label>العنوان والشارع</label><input class="inp2" id="st-h-address" value="${esc(DB.lab.header.address)}" style="width:100%"></div>
      <div class="field"><label>أرقام التليفونات</label><input class="inp2 num" id="st-h-phones" value="${esc(DB.lab.header.phones)}" style="width:100%"></div>
      <div class="field"><label>سطر التذييل</label><input class="inp2" id="st-h-footer" value="${esc(DB.lab.header.footer)}" style="width:100%"></div>
    </div>
    <button class="btn btn-p btn-s" onclick="stSaveHeader()">💾 حفظ الترويسة</button>
  </div>
  <div class="card"><h3>🏷️ قائمة الأسعار (${DB.tests.length} تحليل)</h3>
    <div class="toolbar">
      <input class="inp2" id="pr-q" placeholder="🔍 بحث…" style="flex:1;min-width:180px" oninput="stPriceSearch()">
    </div>
    <div id="pr-list" style="max-height:340px;overflow:auto"></div>
    <div class="toolbar" style="margin-top:12px">
      <input class="inp2" id="pr-new-name" placeholder="اسم تحليل جديد" style="flex:2;min-width:160px">
      <input class="inp2 num" id="pr-new-price" type="number" placeholder="السعر" style="width:110px">
      <input class="inp2" id="pr-new-cat" placeholder="القسم" style="width:120px">
      <button class="btn btn-t btn-s" onclick="stAddTest()">➕ إضافة تحليل</button>
    </div>
  </div>
  <div class="card"><h3>👥 المستخدمين</h3>
    <table><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th></th></tr>
    ${DB.users.map(u => `<tr><td>${esc(u.name)}</td><td class="num">${esc(u.user)}</td><td>${esc(u.role)}</td>
    <td>${u.user !== session().user ? `<button class="btn btn-r btn-s" onclick="stDelUser('${u.id}')">🗑️</button>` : ''}</td></tr>`).join('')}</table>
    <div class="toolbar" style="margin-top:12px">
      <input class="inp2" id="us-name" placeholder="الاسم" style="width:140px">
      <input class="inp2" id="us-user" placeholder="اسم المستخدم" style="width:130px">
      <input class="inp2" id="us-pass" placeholder="كلمة المرور" style="width:120px">
      <select class="inp2" id="us-role"><option>موظف استقبال</option><option>دكتور</option><option>أدمن</option></select>
      <button class="btn btn-p btn-s" onclick="stAddUser()">➕ إضافة</button>
    </div>
  </div>
  <div class="card"><h3>🏢 الشركات المتعامل معها <span style="font-size:11px;color:var(--mut)">(بتسمع تلقائي في المديونية)</span></h3>
    <div class="toolbar">
      <input class="inp2" id="co-name" placeholder="اسم الشركة" style="flex:1;min-width:180px">
      <button class="btn btn-p btn-s" onclick="stAddCompany()">➕ إضافة شركة</button>
    </div>
    ${DB.companies.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${DB.companies.map(c =>
      `<span class="pill p-done" style="font-size:13px">${esc(c.name)} <a href="javascript:stDelCompany('${c.id}')" style="color:#c62828;margin-right:6px;text-decoration:none">✖</a></span>`).join('')}</div>`
    : '<div class="empty">لا توجد شركات</div>'}
  </div>
  <div class="card"><h3>☁️ النسخ الاحتياطي</h3>
    <div class="hint">البيانات بتتزامن تلقائياً مع السحابة. لو عايز نسخة محلية كمان:</div>
    <button class="btn btn-o btn-s" onclick="stExport()">⬇️ تصدير نسخة احتياطية (JSON)</button>
    <label class="btn btn-o btn-s" style="margin-right:8px">⬆️ استيراد نسخة<input type="file" accept=".json" style="display:none" onchange="stImport(this)"></label>
  </div>`);
  stPriceSearch();
}
function saveSuper() { META.superUser = { user: $('#sp-user').value.trim(), pass: $('#sp-pass').value }; saveMeta(); toast('✅ تم الحفظ'); }
function stSaveLab() { DB.lab.name = $('#st-name').value.trim(); DB.lab.schedule = $('#st-schedule').value.trim(); save(); toast('✅ تم الحفظ'); renderSettings(); }
function stSaveHeader() { DB.lab.header = { title: $('#st-h-title').value.trim(), address: $('#st-h-address').value.trim(), phones: $('#st-h-phones').value.trim(), footer: $('#st-h-footer').value.trim() }; save(); toast('✅ تم حفظ الترويسة'); }
function stUploadLogo(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { DB.lab.logo = r.result; save(); toast('✅ تم رفع اللوجو'); renderSettings(); };
  r.readAsDataURL(f);
}
function stPriceSearch() {
  const q = ($('#pr-q')?.value || '').trim().toLowerCase();
  const list = DB.tests.filter(t => !q || t.name.toLowerCase().includes(q)).slice(0, 80);
  $('#pr-list').innerHTML = `<table><tr><th>التحليل</th><th>القسم</th><th>السعر</th><th></th></tr>
  ${list.map(t => `<tr><td style="text-align:right">${esc(t.name)}</td><td>${esc(t.cat || '-')}</td>
  <td><input class="inp2 num" type="number" value="${t.price}" style="width:90px;padding:5px 8px" onchange="stSetPrice('${t.id}', this.value)"></td>
  <td><button class="btn btn-r btn-s" onclick="stDelTest('${t.id}')">🗑️</button></td></tr>`).join('')}</table>`;
}
function stSetPrice(id, v) { const t = testById(id); t.price = +v || 0; save(); toast('✅ تم تحديث السعر'); }
function stDelTest(id) { if (!confirm('حذف التحليل؟')) return; DB.tests = DB.tests.filter(t => t.id !== id); save(); stPriceSearch(); }
function stAddTest() {
  const name = $('#pr-new-name').value.trim();
  if (!name) return toast('⚠️ أدخل الاسم');
  DB.tests.push({ id: uid('t'), name, cat: $('#pr-new-cat').value.trim() || 'عام', price: +$('#pr-new-price').value || 0, fields: [] });
  save(); $('#pr-new-name').value = ''; $('#pr-new-price').value = ''; stPriceSearch(); toast('✅ تمت الإضافة');
}
function stAddUser() {
  const name = $('#us-name').value.trim(), user = $('#us-user').value.trim(), pass = $('#us-pass').value;
  if (!name || !user || !pass) return toast('⚠️ أكمل كل الحقول');
  if (DB.users.find(u => u.user === user)) return toast('⚠️ اسم المستخدم موجود');
  DB.users.push({ id: uid('u'), name, user, pass, role: $('#us-role').value });
  save(); toast('✅ تمت الإضافة'); renderSettings();
}
function stDelUser(id) { if (!confirm('حذف المستخدم؟')) return; DB.users = DB.users.filter(u => u.id !== id); save(); renderSettings(); }
function stAddCompany() {
  const name = $('#co-name').value.trim();
  if (!name) return toast('⚠️ أدخل اسم الشركة');
  DB.companies.push({ id: uid('co'), name });
  save(); toast('✅ اتضافت الشركة وبتسمع في المديونية'); renderSettings();
}
function stDelCompany(id) { DB.companies = DB.companies.filter(c => c.id !== id); save(); renderSettings(); }
function stExport() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'csl-backup-' + LABID + '-' + today() + '.json';
  a.click();
}
function stImport(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { DB = JSON.parse(r.result); save(); toast('✅ تم الاستيراد'); route(); }
    catch (e) { toast('⚠️ ملف غير صالح'); }
  };
  r.readAsText(f);
}

route();
