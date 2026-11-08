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
  for (const r of (typeof YS_PANELS !== 'undefined' ? YS_PANELS : [])) { const t = T('yp_' + tests.length, r.n, r.c, r.p, r.f || []); if (r.ar) t.ar = r.ar; tests.push(t); }
  for (const r of (typeof YS_TESTS !== 'undefined' ? YS_TESTS : [])) tests.push(T('yt_' + tests.length, r.n, r.c, r.p, r.f || []));
  if (!tests.some(t => /منوي/.test(t.name))) tests.push(T('casa_1', 'تحليل السائل المنوي (CASA)', 'السائل المنوي', 250, []));
  return {
    lab: { name: 'معملك', branch: 'الفرع الرئيسي', logo: '', schedule: 'يومياً من 9 صباحاً حتى 10 مساءً — ما عدا الجمعة', header: { title: 'معملك للتحاليل الطبية', address: '', phones: '', footer: 'CSL' } },
    tests, patients: [], visits: [], payments: [],
    treasury: { days: {}, balances: [] },
    companies: [], companyDebts: [],
    inventory: [], invLog: [],
    users: [{ id: 'u1', name: 'المدير', user: 'admin', pass: 'mhmd@1993', role: 'أدمن' }],
    seq: { patient: 1, visit: 1001, invoice: 5001 },
    casaQueue: [],
  };
}

/* ---------- meta / labs ---------- */
function loadMeta() {
  try { META = JSON.parse(localStorage.getItem(META_KEY)); } catch (e) { META = null; }
  if (!META || !META.labs) { META = { superUser: { user: 'mt', pass: 'mhmd@1993' }, labs: [] }; saveMeta(); }
  else if (META.superUser && META.superUser.pass === 'mozo') { META.superUser.pass = 'mhmd@1993'; saveMeta(); }
}
/* وضع المعاينة: جلسة read-only — بنمنع أي حفظ أو رفع للسحابة */
let __roWarnAt = 0;
function roBlocked() {
  const s = session();
  if (!s || !s.ro) return false;
  const n = Date.now();
  if (n - __roWarnAt > 4000) { __roWarnAt = n; toast('👁️ وضع المعاينة — للمشاهدة فقط، ممنوع التعديل'); }
  return true;
}
function saveMeta() { if (roBlocked()) return; if (!META || typeof META !== 'object' || !Array.isArray(META.labs)) META = { superUser: { user: 'mt', pass: 'mhmd@1993' }, labs: [] }; localStorage.setItem(META_KEY, JSON.stringify(META)); if (typeof cloudScheduleMetaPush === 'function') cloudScheduleMetaPush(); }
function labById(id) { return META.labs.find(l => l.id === id); }
function isActivated(id) { return localStorage.getItem(actKey(id)) === '1'; }
function activate(id) { localStorage.setItem(actKey(id), '1'); }
/* المعملات المفعلة على الجهاز ده — عشان الدخول من غير كود تاني */
const MYLABS_KEY = 'csl_my_labs';
function myLabs() { try { return JSON.parse(localStorage.getItem(MYLABS_KEY) || '[]'); } catch (e) { return []; } }
function rememberLab(l) {
  const list = myLabs().filter(x => x.id !== l.id);
  list.unshift({ id: l.id, name: l.name });
  localStorage.setItem(MYLABS_KEY, JSON.stringify(list.slice(0, 20)));
}
function save() { if (roBlocked()) return; if (LABID) localStorage.setItem(labKey(LABID), JSON.stringify(DB)); if (typeof cloudSchedulePush === 'function') cloudSchedulePush(); }
function loadLab(id) {
  LABID = id;
  try { DB = JSON.parse(localStorage.getItem(labKey(id))); } catch (e) { DB = null; }
  if (!DB || !DB.tests) { DB = seed(); save(); }
  catalogFixes();
  if (typeof cloudPullLab === 'function') cloudPullLab(id);
}

/* ---------- session ---------- */
function session() { try { return JSON.parse(sessionStorage.getItem(SES)); } catch (e) { return null; } }
function setSession(s) { sessionStorage.setItem(SES, JSON.stringify(s)); }
function logout() { sessionStorage.removeItem(SES); if (typeof cloudSignOut === 'function') cloudSignOut(); location.hash = ''; route(); }

/* ---------- router ---------- */
function go(p) { location.hash = '#/' + p; }
function route() {
  const h = location.hash.replace(/^#\//, '');
  const [page0, arg0] = h.split('/');
  if (page0 === 'go' && arg0) { loadMeta(); return goLab(arg0); }
  const ses = session();
  if (!ses) { LABID = null; return renderLogin(); }
  if (typeof sessionTampered === 'function' && sessionTampered()) {
    sessionStorage.removeItem(SES); LABID = null;
    return renderLogin();
  }
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
  if (page === 'blood') return renderBlood();
  if (page === 'results') return renderResults();
  if (page === 'finance') return renderFinance();
  if (page === 'inventory') return renderInventory();
  if (page === 'settings') return renderSettings();
  if (page === 'labops') return renderLabops(arg);
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
    ${ses.ro ? '<div style="background:#fff8e6;color:#8a6d1a;padding:8px 14px;font-size:13px;font-weight:700;text-align:center;border-bottom:1px solid #f0dfae">👁️ وضع المعاينة — تفرّج على كل حاجة، ممنوع الإضافة أو التعديل أو الحذف</div>' : ''}
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
    <img src="logo-wide.png" alt="C.S.L" style="width:100%;max-width:340px;display:block;margin:0 auto 6px;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35))">
    <div class="sub">Complete System for Laboratories — نظام المعمل المتكامل</div>
    <div class="ltabs">
      <button class="btn ${loginMode === 'lab' ? 'btn-p' : 'btn-o'}" onclick="loginTab('lab')">دخول معمل</button>
      <button class="btn ${loginMode === 'super' ? 'btn-p' : 'btn-o'}" onclick="loginTab('super')">دخول الموزّع</button>
    </div>
    <div id="login-body"></div>
    <button class="btn btn-o" style="width:100%;margin-top:12px" onclick="demoLogin()">👁️ دخول تجريبي — معاينة فقط</button>
    <div id="ver-stamp" style="text-align:center;color:#5a6b8c;font-size:10px;margin-top:10px">…</div>
  </div></div>`;
  try { $('#ver-stamp').textContent = 'الإصدار: ' + (window.APP_VERSION || '') + ' — لو رقم الإصدار قديم، استنى ثواني والموقع هيتحدّث لوحده'; } catch (e) {}
  loginTab(loginMode);
}
function loginTab(m) {
  loginMode = m;
  $$('.ltabs .btn').forEach((b, i) => { b.className = 'btn ' + ((i === 0) === (m === 'lab') ? 'btn-p' : 'btn-o'); });
  $('#login-body').innerHTML = m === 'super' ? `
    <div class="field"><label>اسم المستخدم</label><input class="inp" id="lg-user"></div>
    <div class="field"><label>كلمة المرور</label><input class="inp" type="password" id="lg-pass"></div>
    <button class="btn btn-p" onclick="doSuperLogin()">دخول لوحة الموزّع ⬅</button>
  ` : (() => {
    const mine = myLabs();
    return `
    ${mine.length ? `
    <div class="field"><label>🏢 المعمل (مفعل على الجهاز ده)</label>
      <select class="inp" id="lg-lab" onchange="lgLabChange()">
        <option value="">— اختار المعمل —
        ${mine.map(l => `<option value="${l.id}">${esc(l.name)}`).join('')}
        <option value="__new">➕ معمل جديد (كود تفعيل)
      </select></div>
    <div class="field" id="lg-code-wrap" style="display:none"><label>كود التفعيل (أول مرة بس)</label><input class="inp num" id="lg-code"></div>
    ` : `
    <div class="field"><label>كود التفعيل (أول مرة بس — الجهاز هيتذكره)</label><input class="inp num" id="lg-code"></div>`}
    <div class="field"><label>اسم المستخدم</label><input class="inp" id="lg-user"></div>
    <div class="field"><label>كلمة المرور</label><input class="inp" type="password" id="lg-pass"></div>
    <button class="btn btn-p" onclick="doLabLogin()">دخول ⬅</button>`;
  })();
}
/* دخول تجريبي: معمل demo ببيانات جاهزة — الجلسة read-only (مفيش حفظ ولا رفع) */
function demoLogin() {
  const sess = { type: 'lab', labId: 'lab_demo', name: 'زائر تجريبي', role: 'معاينة', user: 'demo', ro: true };
  sess.sig = signSession(sess);
  setSession(sess);
  loadLab('lab_demo');
  /* بيانات عينة في الذاكرة بس — وضع المعاينة بيمنع الحفظ فمبتتحفظش ولا بتترفع */
  if (DB && (!DB.patients || !DB.patients.length)) {
    const casa = DB.tests.find(t => t.id === 'casa_1') || DB.tests[0];
    const other = DB.tests.find(t => t !== casa) || casa;
    DB.lab.name = 'معمل الطيّب التجريبي';
    DB.lab.header.title = 'معمل الطيّب التجريبي للتحاليل الطبية';
    DB.patients = [
      { id: 'demo_p1', name: 'أحمد محمود السيد', age: 32, gender: 'ذكر', phone: '01001234567', code: 'P-1001', createdAt: '2026-10-09', title: '', ageMonths: 0, ageDays: 0, dob: '', nationality: '', nationalId: '', address: '', refNo: '', refTitle: '', referrer: 'دكتور محمود', pricePlan: '' },
      { id: 'demo_p2', name: 'محمد عبد الله حسن', age: 41, gender: 'ذكر', phone: '01115556677', code: 'P-1002', createdAt: '2026-10-10', title: '', ageMonths: 0, ageDays: 0, dob: '', nationality: '', nationalId: '', address: '', refNo: '', refTitle: '', referrer: '', pricePlan: '' },
      { id: 'demo_p3', name: 'مصطفى كامل إبراهيم', age: 28, gender: 'ذكر', phone: '01229998877', code: 'P-1003', createdAt: '2026-10-11', title: '', ageMonths: 0, ageDays: 0, dob: '', nationality: '', nationalId: '', address: '', refNo: '', refTitle: '', referrer: 'دكتور سمير', pricePlan: '' },
      { id: 'demo_p4', name: 'خالد عمر يوسف', age: 35, gender: 'ذكر', phone: '01554443322', code: 'P-1004', createdAt: '2026-10-11', title: '', ageMonths: 0, ageDays: 0, dob: '', nationality: '', nationalId: '', address: '', refNo: '', refTitle: '', referrer: '', pricePlan: '' },
    ];
    DB.visits = [
      { id: 'demo_v1', no: 1001, invoiceNo: 5001, patientId: 'demo_p1', date: '2026-10-09', doctor: 'د. محمود فتحي', discount: 0, paidAmount: 250, notes: '', tests: [{ testId: casa.id, status: 'done', results: { 'الحجم': '3.2 ml', 'التركيز': '38 M/ml', 'الحركة التقدمية': '42%', 'الشكل الطبيعي': '18%' } }] },
      { id: 'demo_v2', no: 1002, invoiceNo: 5002, patientId: 'demo_p2', date: '2026-10-10', doctor: '', discount: 50, paidAmount: 200, notes: 'حجز مسبق', tests: [{ testId: casa.id, status: 'pending', results: {} }] },
      { id: 'demo_v3', no: 1003, invoiceNo: 5003, patientId: 'demo_p3', date: '2026-10-11', doctor: 'د. سمير عادل', discount: 0, paidAmount: 400, notes: '', tests: [{ testId: other.id, status: 'pending', results: {} }, { testId: casa.id, status: 'pending', results: {} }] },
      { id: 'demo_v4', no: 1004, invoiceNo: 5004, patientId: 'demo_p4', date: '2026-10-11', doctor: '', discount: 0, paidAmount: 0, notes: '', tests: [{ testId: other.id, status: 'pending', results: {} }] },
    ];
    DB.payments = [
      { id: 'demo_pay1', visitId: 'demo_v1', invoiceNo: 5001, patient: 'أحمد محمود السيد', amount: 250, date: '2026-10-09', at: '2026-10-09T12:30:00.000Z' },
      { id: 'demo_pay2', visitId: 'demo_v2', invoiceNo: 5002, patient: 'محمد عبد الله حسن', amount: 200, date: '2026-10-10', at: '2026-10-10T13:15:00.000Z' },
      { id: 'demo_pay3', visitId: 'demo_v3', invoiceNo: 5003, patient: 'مصطفى كامل إبراهيم', amount: 400, date: '2026-10-11', at: '2026-10-11T10:05:00.000Z' },
    ];
    DB.inventory = [
      { id: 'demo_iv1', name: 'أنابيب تحاليل EDTA', unit: 'أنبوب', stock: 240, minStock: 100, createdAt: '2026-10-01' },
      { id: 'demo_iv2', name: 'أكواب بلاستيك معقمة', unit: 'كوب', stock: 35, minStock: 50, createdAt: '2026-10-01' },
      { id: 'demo_iv3', name: 'إبر سحب 5 مل', unit: 'إبرة', stock: 120, minStock: 40, createdAt: '2026-10-01' },
    ];
    DB.invLog = [{ id: 'demo_l1', itemId: 'demo_iv2', qty: 15, at: '2026-10-10T09:00:00.000Z' }];
    DB.casaQueue = [{ visitId: 'demo_v2', addedAt: '2026-10-10T13:16:00.000Z', done: false }, { visitId: 'demo_v3', addedAt: '2026-10-11T10:06:00.000Z', done: false }];
  }
  go(''); route();
}
function doSuperLogin() {
  const { user, pass } = { user: $('#lg-user').value.trim(), pass: $('#lg-pass').value };
  if (user === META.superUser.user && pass === META.superUser.pass) {
    setSession({ type: 'super', name: 'الموزّع' }); go(''); route();
    /* نجيب معاملات الموزّع من السحابة تلقائياً أول ما يدخل */
    if (window.CLOUD && CLOUD.ready) {
      cloudPullMetaAwait().then(changed => { if (changed) { try { renderDistributor(); } catch (e) {} } }).catch(() => {});
    } else if (window.CLOUD && !CLOUD.gaveUp) {
      const tryPull = setInterval(() => {
        if (CLOUD.ready) { clearInterval(tryPull); cloudPullMetaAwait().then(c => { if (c) { try { renderDistributor(); } catch (e) {} } }).catch(() => {}); }
        if (CLOUD.gaveUp) clearInterval(tryPull);
      }, 3000);
    }
  } else toast('⚠️ بيانات الموزّع غير صحيحة');
}
function lgLabChange() {
  const v = $('#lg-lab')?.value;
  const w = $('#lg-code-wrap'); if (!w) return;
  w.style.display = v === '__new' ? '' : 'none';
}
async function doLabLogin() {
  const u = $('#lg-user').value.trim(), p = $('#lg-pass').value;
  let lab = null;
  const sel = $('#lg-lab')?.value;
  if (sel && sel !== '__new') {
    lab = META.labs.find(l => l.id === sel);
    if (!lab) return toast('⚠️ المعمل مش موجود في بيانات الموزّع — جرّب كود التفعيل');
  } else {
    const c = ($('#lg-code')?.value || '').trim().toLowerCase();
    if (!c) return toast('⚠️ أدخل كود التفعيل');
    lab = META.labs.find(l => l.code === c);
    if (!lab && typeof cloudPullMetaAwait === 'function' && window.CLOUD && CLOUD.ok) {
      /* الكود مش معروف محلياً — نسحب بيانات الموزّع من السحابة ونجرب تاني */
      toast('⏳ بجيب بيانات الموزّع من السحابة…');
      try { await cloudPullMetaAwait(); } catch (e) { /* metaErr اتسجل */ }
      lab = META.labs.find(l => l.code === c);
    }
    if (!lab) {
      const why = (window.CLOUD && CLOUD.metaErr) ? ' (' + CLOUD.metaErr + ')' : '';
      return toast('⚠️ كود التفعيل غير صحيح' + why);
    }
  }
  if (!lab.active) return toast('⚠️ المعمل موقوف — تواصل مع الموزّع');
  const dbRaw = (DB && LABID === lab.id) ? DB : JSON.parse(localStorage.getItem(labKey(lab.id)) || 'null');
  const usr = (dbRaw?.users || []).find(x => x.user === u);
  const v = await verifyPass(usr, p);
  if (!v.ok) return toast('⚠️ اسم المستخدم أو كلمة المرور غير صحيحة');
  if (v.upgraded) {
    usr.salt = v.rec.salt; usr.pass = v.rec.pass;
    localStorage.setItem(labKey(lab.id), JSON.stringify(dbRaw));
    if (DB && LABID === lab.id) DB = dbRaw;
    if (typeof cloudSchedulePushLab === 'function') cloudSchedulePushLab(lab.id, dbRaw);
  }
  if (!isActivated(lab.id)) activate(lab.id);
  rememberLab(lab);
  loadLab(lab.id);
  const sess = { type: 'lab', labId: lab.id, name: usr.name, role: usr.role, user: usr.user };
  sess.sig = signSession(sess);
  setSession(sess);
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
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer"><input type="checkbox" id="dl-casa"> تفعيل CASA معاه (كود واحد)</label>
        <button class="btn btn-t" onclick="distCreate()">إنشاء معمل + كود تفعيل</button>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
        <button class="btn btn-o btn-s" onclick="distCloudPull()">☁️ جلب المعاملات من السحابة</button>
        <span style="font-size:11.5px;color:var(--mut)">لو شغلت على جهاز تاني قبل كده — دوس هنا وكل معاملاتك هتظهر (البيانات الأصلية على السحابة مش على التليفون)</span>
      </div>
    </div>
    <div class="card"><h3>🏢 المعملات</h3>
      ${META.labs.length ? `<table><tr><th>الاسم</th><th>كود الدخول</th><th>الرابط المباشر</th><th>الحالة</th><th>إجراءات</th></tr>
      ${META.labs.map(l => `<tr>
        <td style="font-weight:700">${esc(l.name)}</td>
        <td class="num"><b>${l.code}</b></td>
        <td class="num" style="font-size:11.5px">csl.mtayea.com/#/go/${l.id}</td>
        <td>${l.active ? '<span class="pill p-paid">نشط</span>' : '<span class="pill p-unpaid">موقوف</span>'} ${l.casa ? '<span class="pill p-paid">CASA ✓</span>' : '<span class="pill p-unpaid">CASA ✗</span>'}${l.casa ? `<div class="mut" style="font-size:10px">id: ${l.id}</div>` : ''}</td>
        <td>
          <button class="btn btn-o btn-s" onclick="distToggle('${l.id}')">${l.active ? 'إيقاف' : 'تفعيل'}</button>
          <button class="btn btn-t btn-s" onclick="distCasa('${l.id}')">${l.casa ? 'إيقاف CASA' : 'تفعيل CASA'}</button>
          <button class="btn btn-t btn-s" onclick="distUsers('${l.id}')">المستخدمون</button>
          <button class="btn btn-r btn-s" onclick="distDelete('${l.id}')">حذف</button>
        </td></tr>`).join('')}</table>` : '<div class="empty">لا توجد معملات بعد</div>'}
    </div>
  </div>`;
  updateSyncBadge();
}
/* سحب بيانات الموزّع من السحابة يدوياً — بيدمج المعاملات بالـ id */
async function distCloudPull() {
  if (!navigator.onLine) return toast('⚠️ مفيش نت على الجهاز');
  if (!window.CLOUD || !CLOUD.ready) return toast('⚠️ جاري الاتصال بالسحابة — استنى ثواني ودوس تاني');
  toast('⏳ بجيب بيانات الموزّع من السحابة…');
  try {
    await cloudPullMetaAwait();
    renderDistributor();
    const n = (META.labs || []).length;
    toast(n ? '✅ اتجابت ' + n + ' معمل من السحابة' : '☁️ السحابة مفيهاش معملات — أنشئ معملك الأول');
  } catch (e) {
    toast('⚠️ تعذّر السحب — اتأكد من النت وجرب تاني');
  }
}
function distCreate() {
  const name = $('#dl-name').value.trim();
  if (!name) return toast('⚠️ أدخل اسم المعمل');
  const id = 'lab_' + Math.random().toString(36).slice(2, 8);
  META.labs.push({ id, name, code: mkCode(), active: true, casa: !!($('#dl-casa') && $('#dl-casa').checked), createdAt: today() });
  saveMeta();
  const fresh = seed(); fresh.lab.name = name;
  localStorage.setItem(labKey(id), JSON.stringify(fresh));
  toast('✅ اتعمل معمل «' + name + '» — الكود: ' + META.labs[META.labs.length - 1].code);
  renderDistributor();
}
function distToggle(id) { const l = labById(id); l.active = !l.active; saveMeta(); renderDistributor(); }
function distCasa(id) { const l = labById(id); l.casa = !l.casa; saveMeta(); renderDistributor(); toast(l.casa ? '✓ CASA مفعّل للمعمل ده' : '✗ CASA اتوقف للمعمل ده'); }
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
    <div class="hint" style="margin-top:8px">البيانات الافتراضية لأي معمل جديد: <b class="num">admin / mhmd@1993</b></div>
    <div class="modal-actions"><button class="btn btn-o" onclick="closeModal()">إغلاق</button></div>`);
}
async function distResetPass(labId, userId) {
  const raw = localStorage.getItem(labKey(labId));
  const db = raw ? JSON.parse(raw) : null;
  if (!db) return toast('⚠️ البيانات مش متاحة');
  const u = db.users.find(x => x.id === userId);
  if (!u) return;
  const hp = await hashNewPass('mhmd@1993');
  u.salt = hp.salt; u.pass = hp.pass;
  localStorage.setItem(labKey(labId), JSON.stringify(db));
  if (typeof cloudSchedulePushLab === 'function') cloudSchedulePushLab(labId, db);
  toast('✅ اتعمل ريسيت — كلمة السر بقت mhmd@1993');
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
async function doGoLab(id) {
  const lab = labById(id);
  if (!lab.active) return toast('⚠️ المعمل موقوف');
  const raw = JSON.parse(localStorage.getItem(labKey(id)) || 'null');
  const usr = (raw?.users || []).find(x => x.user === $('#gl-user').value.trim());
  const v = await verifyPass(usr, $('#gl-pass').value);
  if (!v.ok) return toast('⚠️ بيانات الدخول غير صحيحة');
  if (v.upgraded) {
    usr.salt = v.rec.salt; usr.pass = v.rec.pass;
    localStorage.setItem(labKey(id), JSON.stringify(raw));
    if (typeof cloudSchedulePushLab === 'function') cloudSchedulePushLab(id, raw);
  }
  activate(id); rememberLab(lab); loadLab(id);
  const sess = { type: 'lab', labId: id, name: usr.name, role: usr.role, user: usr.user };
  sess.sig = signSession(sess);
  setSession(sess);
  closeModal(); go(''); route();
}

/* ---------- home: التبويبات الخمسة ---------- */
function renderHome() {
  const ses = session();
  const casaOn = !!labById(LABID)?.casa;
  const tVisits = DB.visits.filter(v => v.date === today());
  const tIncome = (DB.payments || []).filter(p => p.date === today()).reduce((a, p) => a + (p.amount || 0), 0);
  const pendT = DB.visits.reduce((a, v) => a + v.tests.filter(t => t.status !== 'done').length, 0);
  const pendV = DB.visits.filter(v => v.tests.some(t => t.status !== 'done')).length;
  const awaitT = DB.visits.reduce((a, v) => a + v.tests.filter(t => t.status === 'done' && !t.reviewed).length, 0);
  const awaitList = [];
  DB.visits.forEach(v => v.tests.forEach((t, i) => {
    if (t.status === 'done' && !t.reviewed && awaitList.length < 6) {
      const p = patById(v.patientId); const tt = testById(t.testId);
      awaitList.push({ v, i, p, tname: tt ? tt.name : '' });
    }
  }));
  awaitList.sort((a, b) => (b.v.date + (b.v.id || '')).localeCompare(a.v.date + (a.v.id || '')));
  const tiles = [
    ['labops', 'المعمل', 'استقبال + نتائج + إعدادات (تحاليل/باراميترات/عينات) — بنظام CSL الكامل', '🏥', '#0b5bd3'],
    ['casa', 'CASA', casaOn ? 'تحليل السائل المنوي — مفعّل ✓ بيفتح على موقعنا casa.mtayea.com في تبويب جديد' : 'تحليل السائل المنوي — غير مفعّل للمعمل ده، هيُفتح موقع CASA عادي وتقدر تفعّله هناك', '🔬', '#0fa08c', 'https://casa.mtayea.com'],
    ['finance', 'الحسابات', 'الخزينة + بيان الوارد والمصروف + مديونية الشركات', '💰', '#e8a33d'],
    ['inventory', 'المخزن', 'المخزون والمستهلك والمتبقي وإنذار نقص المخزون', '📦', '#7a4fd0'],
    ['blood', 'بنك الدم', 'متبرعون + سجل تبرعات + «مطلوب متبرعون» — والحالات اللي عليها فصيلة دم بتتسجل هنا تلقائياً', '🩸', '#c0392b'],
    ['settings', 'الإعدادات', 'الأسعار والتحاليل واللوجو والترويسة وإعدادات الطباعة والمستخدمين والشركات', '⚙️', '#54627d'],
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
    <div class="stats">
      <div class="stat blue"><div class="v">${tVisits.length}</div><div class="l">حالات اليوم</div></div>
      <div class="stat green"><div class="v num">${fmt(tIncome)}</div><div class="l">محصّل اليوم (ج.م)</div></div>
      <div class="stat gold"><div class="v">${pendT}</div><div class="l">تحليل منتظر نتيجة${pendV ? ` (${pendV} حالة)` : ''}</div></div>
      <div class="stat ${awaitT ? 'red' : 'green'}"><div class="v">${awaitT}</div><div class="l">نتيجة بانت مراجعة</div></div>
    </div>
    <div class="dash-grid">
      <div class="card"><h3>📊 إيراد آخر ٧ أيام (ج.م)</h3>
        <canvas id="home-chart" style="width:100%;height:190px"></canvas>
      </div>
      <div class="card"><h3>⚡ نتائج بانت مراجعة نهائية</h3>
        ${awaitList.length ? awaitList.map(x => `
          <div class="ql-row">
            <span class="ql-p"><b>${esc(x.p ? x.p.name : '')}</b><br><small style="color:var(--mut)">${esc(x.tname)} — <span class="num">${x.v.invoiceNo} / ${x.v.date}</span></small></span>
            <button class="btn btn-o btn-s" onclick="go('results')">فتح</button>
          </div>`).join('')
        : '<div class="empty">✅ كل النتائج اتمراجعت — مفيش حاجة معلّقة</div>'}
        <div style="margin-top:10px"><button class="btn btn-p btn-s" onclick="go('results')">📋 فتح صفحة النتائج</button></div>
      </div>
    </div>
    <div class="tiles">
      ${tiles.map(t => t[5]
        ? `<a class="tile" href="${t[5]}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
            <div class="ic" style="background:${t[4]}22;color:${t[4]}">${t[3]}</div>
            <div><h3>${t[1]}</h3><p>${t[2]}</p></div>
            <span class="arr">↗</span></a>`
        : `<div class="tile" onclick="go('${t[0]}')">
            <div class="ic" style="background:${t[4]}22;color:${t[4]}">${t[3]}</div>
            <div><h3>${t[1]}</h3><p>${t[2]}</p></div>
            <span class="arr">←</span></div>`).join('')}
    </div>
  </div>`;
  updateSyncBadge();
  setTimeout(drawHomeChart, 30);
}

/* رسم بياني أعمدة لإيراد آخر ٧ أيام — بدون مكتبات خارجية */
function drawHomeChart() {
  const c = document.getElementById('home-chart'); if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth || 500, H = 190;
  c.width = W * dpr; c.height = H * dpr;
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); }
  const sums = days.map(dt => (DB.payments || []).filter(p => p.date === dt).reduce((a, p) => a + (p.amount || 0), 0));
  const wd = ['حد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];
  const labels = days.map(dt => { const d = new Date(dt + 'T00:00:00'); return wd[d.getDay()] + ' ' + d.getDate(); });
  const max = Math.max.apply(null, sums.concat([1]));
  const padB = 26, padT = 14, padX = 8;
  const bw = (W - padX * 2) / 7;
  const bh = H - padB - padT;
  x.strokeStyle = '#e3e8f0'; x.fillStyle = '#7a8aa0'; x.font = '10.5px Tahoma'; x.textAlign = 'center';
  for (let g = 0; g <= 3; g++) {
    const y = padT + bh * g / 3;
    x.beginPath(); x.moveTo(padX, y); x.lineTo(W - padX, y); x.stroke();
    x.textAlign = 'left'; x.fillText(fmt(Math.round(max * (3 - g) / 3)), padX + 2, y - 2); x.textAlign = 'center';
  }
  sums.forEach((s, i) => {
    const h = Math.max(2, bh * s / max);
    const bx = W - padX - (i + 1) * bw + bw * 0.18; /* RTL: اليوم الأحد يمين */
    const by = padT + bh - h;
    const grad = x.createLinearGradient(0, by, 0, by + h);
    grad.addColorStop(0, '#1e5eff'); grad.addColorStop(1, '#123cb0');
    x.fillStyle = grad;
    const r = Math.min(5, bw * 0.32 / 2);
    x.beginPath();
    x.moveTo(bx, by + h); x.lineTo(bx, by + r); x.arcTo(bx, by, bx + r, by, r);
    x.lineTo(bx + bw * 0.64 - r, by); x.arcTo(bx + bw * 0.64, by, bx + bw * 0.64, by + r, r);
    x.lineTo(bx + bw * 0.64, by + h); x.closePath(); x.fill();
    x.fillStyle = '#1b2a4a'; x.font = 'bold 10px Tahoma';
    x.fillText(fmt(s), bx + bw * 0.32, by - 4);
    x.fillStyle = '#7a8aa0'; x.font = '10.5px Tahoma';
    x.fillText(labels[i], bx + bw * 0.32, H - 8);
  });
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
    <div class="y-totalbar" id="rec-bar">
      <div class="yb b-total"><span>الإجمالي</span><b id="yb-total" class="num">0</b></div>
      <div class="yb b-disc"><span>الخصم</span><b id="yb-disc" class="num">0</b></div>
      <div class="yb b-paid"><span>المدفوع</span><b id="yb-paid" class="num">0</b></div>
      <div class="yb b-rem"><span>المتبقي</span><b id="yb-rem" class="num">0</b></div>
    </div>
    <div class="grid3" style="margin-top:12px">
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
    <div class="grid3">
      <div class="field"><label>اللقب</label><select class="inp2" id="np-title" style="width:100%"><option value="">—</option><option>السيد</option><option>السيدة</option><option>الطفل</option><option>الطفلة</option></select></div>
      <div class="field" style="grid-column:span 2"><label>الاسم بالكامل *</label><input class="inp2" id="np-name" value="${esc(q)}" style="width:100%"></div>
      <div class="field"><label>النوع</label><select class="inp2" id="np-gender" style="width:100%"><option>ذكر</option><option>أنثى</option></select></div>
      <div class="field"><label>سن — عام *</label><input class="inp2 num" id="np-age" type="number" min="0" max="120" style="width:100%" onchange="npAgeToDob()"></div>
      <div class="field"><label>شهر</label><input class="inp2 num" id="np-agemo" type="number" min="0" max="11" value="0" style="width:100%"></div>
      <div class="field"><label>يوم</label><input class="inp2 num" id="np-aged" type="number" min="0" max="30" value="0" style="width:100%"></div>
      <div class="field"><label>تاريخ الميلاد</label><input class="inp2" id="np-dob" type="date" style="width:100%" onchange="npDobToAge()"></div>
      <div class="field"><label>الجنسية</label><input class="inp2" id="np-nat" value="مصري" style="width:100%"></div>
      <div class="field"><label>رقم وطني</label><input class="inp2 num" id="np-nid" style="width:100%"></div>
      <div class="field"><label>رقم التليفون</label><input class="inp2 num" id="np-phone" style="width:100%"></div>
      <div class="field" style="grid-column:span 2"><label>العنوان</label><input class="inp2" id="np-addr" style="width:100%"></div>
      <div class="field"><label>رقم إحالة</label><input class="inp2 num" id="np-refno" style="width:100%"></div>
      <div class="field"><label>لقب الإحالة</label><input class="inp2" id="np-reftitle" style="width:100%"></div>
      <div class="field"><label>إحالة</label><select class="inp2" id="np-referrer" style="width:100%"><option>Self referral</option><option>طبيب</option><option>شركة</option></select></div>
      <div class="field"><label>خطة الأسعار</label><select class="inp2" id="np-plan" style="width:100%"><option>السعر الأساسي</option></select></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-p" onclick="recSavePatient()">💾 حفظ</button>
      <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
    </div>`);
}
/* سن ↔ تاريخ ميلاد (محسوبة تلقائياً) */
function npAgeToDob() {
  const y = +$('#np-age').value || 0; if (!y) return;
  const n = new Date(); const d = new Date(n.getFullYear() - y, n.getMonth(), n.getDate());
  $('#np-dob').value = d.toISOString().slice(0, 10);
}
function npDobToAge() {
  const dob = $('#np-dob').value; if (!dob) return;
  const d = new Date(dob), n = new Date();
  let y = n.getFullYear() - d.getFullYear(), m = n.getMonth() - d.getMonth(), dd = n.getDate() - d.getDate();
  if (dd < 0) { m--; dd += 30; } if (m < 0) { y--; m += 12; }
  $('#np-age').value = y; $('#np-agemo').value = m; $('#np-aged').value = dd;
}
function recSavePatient() {
  const name = $('#np-name').value.trim(), age = +$('#np-age').value;
  if (!name || !age) return toast('⚠️ الاسم والسن مطلوبان');
  const p = { id: uid('p'), name, age, gender: $('#np-gender').value, phone: $('#np-phone').value.trim(),
    code: 'P-' + String(DB.seq.patient++).padStart(4, '0'), createdAt: today(),
    title: $('#np-title')?.value || '', ageMonths: +$('#np-agemo')?.value || 0, ageDays: +$('#np-aged')?.value || 0,
    dob: $('#np-dob')?.value || '', nationality: $('#np-nat')?.value.trim() || '', nationalId: $('#np-nid')?.value.trim() || '',
    address: $('#np-addr')?.value.trim() || '', refNo: $('#np-refno')?.value.trim() || '', refTitle: $('#np-reftitle')?.value.trim() || '',
    referrer: $('#np-referrer')?.value || '', pricePlan: $('#np-plan')?.value || '' };
  DB.patients.push(p); save(); closeModal(); recPickPatient(p.id);
  toast('✅ تم تسجيل الحالة ' + p.code);
}
function recPickPatient(id) {
  recState.patientId = id;
  const p = patById(id);
  $('#rec-pat-results').innerHTML = '';
  $('#rec-pat-chosen').innerHTML = `<div class="hint ok">✅ الحالة المختارة: <b>${esc(p.title ? p.title + ' ' : '')}${esc(p.name)}</b> — <span class="num">${esc(p.code)}</span> — ${p.age} سنة — ${esc(p.gender || '')} — ${esc(p.phone || 'بدون تليفون')}</div>`;
}
function recTestSearch() {
  const q = ($('#rec-test-q')?.value || '').trim().toLowerCase();
  const list = DB.tests.filter(t => !q || t.name.toLowerCase().includes(q) || (t.ar || '').includes(q)).slice(0, 60);
  $('#rec-test-list').innerHTML = list.map(t => `
    <label class="chk-row"><input type="checkbox" ${recState.testIds.has(t.id) ? 'checked' : ''} onchange="recToggleTest('${t.id}')">
      <span><b>${esc(t.name)}</b>${t.ar ? ` <small style="color:#0fa08c">— ${esc(t.ar)}</small>` : ''}<br><small style="color:var(--mut)">${esc(t.cat || '')}</small></span>
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
  const bt = $('#yb-total'); if (bt) { bt.textContent = fmt(gross); $('#yb-disc').textContent = fmt(disc); $('#yb-paid').textContent = fmt(paid); $('#yb-rem').textContent = fmt(net - paid); }
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
  if (casaHit) { DB.casaQueue.unshift({ visitId: v.id, addedAt: new Date().toISOString(), done: false }); casaCloudPush(v); }
  /* بنك الدم: أي تحليل فصيلة دم / ABO / Rh بيسجّل الحالة كمتبرع تلقائياً */
  const bloodHits = (typeof bloodAutoFromVisit === 'function') ? bloodAutoFromVisit(v) : 0;
  save();
  toast('✅ تم حفظ الحالة — فاتورة رقم ' + v.invoiceNo + (casaHit ? ' — 🔬 اتسجلت في CASA' : '') + (bloodHits ? ' — 🩸 ' + bloodHits + ' في بنك الدم' : ''));
  if (printIt) printInvoice(v.id);
  renderReception();
}
/* إرسال الحالة المنوية لموقع CASA الخاص بالمعمل (نفس سحابة CSL — مسار labs/<casaLabId>) */
async function casaCloudPush(v) {
  try {
    const lab = (typeof labById === 'function') ? labById(LABID) : null;
    const casaLabId = lab && lab.casaLabId;
    if (!casaLabId) return; /* المعمل ده لسه مش مربوط بموقع CASA */
    const pat = patById(v.patientId); if (!pat) return;
    const SYNC_URL = 'https://csl-sync.m-tayea93.workers.dev';
    const KEY = 'casa-sync-k3m9qf27ahmed2026';
    const req = async (doc, method, body) => {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await fetch(SYNC_URL + '/casa?key=' + KEY + '&doc=' + encodeURIComponent(doc), {
          method: method || 'GET', signal: ctrl.signal,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined });
        if (!r.ok) throw new Error('http ' + r.status);
        return await r.json();
      } finally { clearTimeout(tm); }
    };
    const root = 'labs/' + casaLabId + ':';
    /* المريض */
    const pid = 'csl_p' + pat.id;
    const pd = await req(root + 'patients');
    const parr = (pd && pd.d) || [];
    if (!parr.find(x => x.id === pid)) {
      parr.push({ id: pid, code: pat.code || String(pid), name: pat.name, age: (pat.ageY != null ? String(pat.ageY) : (pat.age || '')), phone: pat.phone || '', refDoctor: v.doctor || '', notes: 'من CSL — فاتورة ' + v.invoiceNo, labId: casaLabId, createdAt: new Date().toISOString() });
      await req(root + 'patients', 'PUT', { t: Date.now(), d: parr });
    }
    /* الدراسة: استمارة نتيجة فاضية جاهزة للتحليل في CASA */
    const sid = 'csl_v' + v.id;
    const sd = await req(root + 'studies');
    const sarr = (sd && sd.d) || [];
    if (!sarr.find(x => x.id === sid)) {
      sarr.push({ id: sid, patientId: pid, date: v.date || today(),
        volume: '', ph: '', concentration: '', count: '', pr: '', np: '', immotile: '', motileRatio: '', normalMorph: '', tzi: '', sdi: '', wbc: '', rbc: '', spermatogenicCells: '',
        vcl: '', vsl: '', vap: '', lin: '', wob: '', str: '',
        comment: 'من CSL — فاتورة ' + v.invoiceNo + (v.doctor ? ' — د. ' + v.doctor : ''), labId: casaLabId, src: 'csl' });
      await req(root + 'studies', 'PUT', { t: Date.now(), d: sarr });
    }
    toast('☁️ الحالة اتبعتت لموقع CASA');
  } catch (e) { console.warn('casaCloudPush:', e); }
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
      <td><button class="btn btn-o btn-s" onclick="printInvoice('${v.id}')" title="طباعة الفاتورة (فيها باركود)">🖨️</button>
          <button class="btn btn-t btn-s" onclick="printVisitBarcode('${v.id}')" title="طباعة باركود الحالة — ستيكر يلزق على العينة">🏷️ باركود</button>
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
  const v = DB.visits.find(x => x.id === id); const p = patById(v.patientId); const h = DB.lab.header || {};
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${v.invoiceNo}</title>
  <style>body{font-family:Tahoma;font-size:13px;padding:20px;position:relative;z-index:1}h2{margin:0}.hd{text-align:center;border-bottom:2px solid #0d1b3e;padding-bottom:10px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:7px;text-align:center}th{background:#0d1b3e;color:#fff}
  .t{margin-top:14px;font-size:15px}.sch{text-align:center;color:#666;font-size:12px;margin-top:16px}
  .report-headimg{width:100%;max-height:45mm;object-fit:contain;margin-bottom:10px}
  .report-wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:0;pointer-events:none}
  .report-wm img{max-width:75%;max-height:75%;opacity:.12}</style></head><body>
  ${h.wmImg ? `<div class="report-wm"><img src="${h.wmImg}"></div>` : ''}
  ${h.headerImg ? `<img class="report-headimg" src="${h.headerImg}">` : ''}
  <div class="hd">${DB.lab.logo ? `<img src="${DB.lab.logo}" style="max-height:70px">` : ''}
    <h2>${esc(h.title)}</h2><div>${esc(h.address)}</div><div class="num">${esc(h.phones)}</div></div>
  <div>فاتورة رقم: <b class="num">${v.invoiceNo}</b> — التاريخ: <b>${v.date}</b></div>
  <div>الحالة: <b>${esc(p?.name)}</b> — ${p?.age} سنة — <span class="num">${esc(p?.phone || '')}</span></div>
  ${v.doctor ? `<div>الدكتور: <b>${esc(v.doctor)}</b></div>` : ''}
  <div style="display:flex;flex-direction:column;align-items:center;margin-top:12px">${barcodeSvg(String(v.invoiceNo), 12)}<div class="num" style="font-weight:900;letter-spacing:2px;font-size:14px">${esc(v.invoiceNo)}</div></div>
  <table><tr><th>#</th><th>التحليل</th><th>السعر</th></tr>
  ${v.tests.map((t, i) => { const tt = testById(t.testId); return `<tr><td>${i + 1}</td><td>${esc(tt?.name)}</td><td>${fmt(tt?.price)}</td></tr>`; }).join('')}</table>
  <div class="t">الإجمالي: ${fmt(v.tests.reduce((a, t) => a + (testById(t.testId)?.price || 0), 0))} ج.م — الخصم: ${fmt(v.discount)} ج.م — <b>المطلوب: ${fmt(visitTotal(v))} ج.م</b> — المدفوع: ${fmt(v.paidAmount || 0)} ج.م — المتبقي: ${fmt(visitTotal(v) - (v.paidAmount || 0))} ج.م</div>
  <div class="sch">🕐 ${esc(DB.lab.schedule)}<br>${esc(h.footer)}</div>
  <script>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ============================================================
   النتائج — إدخال نتائج التحاليل (زي يسيّر: حالة ← تحليل ← نتيجة)
   ============================================================ */
let resQ = '';
function renderResults() {
  const pend = DB.visits.reduce((a, v) => a + v.tests.filter(t => t.status !== 'done').length, 0);
  const done = DB.visits.reduce((a, v) => a + v.tests.filter(t => t.status === 'done').length, 0);
  // قائمة المرضى اللي ليهم زيارات
  const pats = DB.patients.filter(p => DB.visits.some(v => v.patientId === p.id));
  shell('النتائج — إدخال نتائج التحاليل', `
  <div class="stats">
    <div class="stat blue"><div class="v">${DB.visits.length}</div><div class="l">إجمالي الحالات</div></div>
    <div class="stat gold"><div class="v">${pend}</div><div class="l">تحليل منتظر نتيجة</div></div>
    <div class="stat green"><div class="v">${done}</div><div class="l">تحليل بنتيجة</div></div>
  </div>
  <div class="card"><h3>١) اختار الحالة</h3>
    <select id="res-pat" class="inp2" style="width:100%" onchange="resPickPat()">
      <option value="">— اختار اسم المريض —
      ${pats.map(p => { const n = DB.visits.filter(v => v.patientId === p.id).length;
        const pendp = DB.visits.filter(v => v.patientId === p.id).reduce((a, v) => a + v.tests.filter(t => t.status !== 'done').length, 0);
        return `<option value="${p.id}">${esc(p.name)} <span class="num">(${n} زيارة${pendp ? ` — ${pendp} منتظر` : ''})</span></option>`; }).join('')}
    </select>
  </div>
  <div id="res-list"><div class="card"><div class="empty">👆 اختار اسم المريض من القائمة وهتظهر زياراته وتحاليله تحت</div></div></div>`);
}
function resPickPat() {
  const sel = document.getElementById('res-pat'), list = document.getElementById('res-list');
  if (!sel || !list) return;
  const pid = sel.value;
  if (!pid) { list.innerHTML = '<div class="card"><div class="empty">👆 اختار اسم المريض من القائمة وهتظهر زياراته وتحاليله تحت</div></div>'; return; }
  const vs = DB.visits.filter(v => v.patientId === pid);
  list.innerHTML = resListHtml(vs);
}
/* حالة التحليل في سير المراجعة: منتظر ← بنتيجة ← متحقق ← مُراجع */
function resPill(t) {
  if (t.status !== 'done') return '<span class="pill p-unpaid">⏳ منتظر نتيجة</span>';
  if (t.reviewed) return '<span class="pill p-done">✅ مُراجع — جاهز للطباعة</span>';
  if (t.verified) return '<span class="pill p-ver">🔍 متحقق منه</span>';
  return '<span class="pill p-unpaid">✏️ بنتيجة</span>';
}
function resVerify(visitId, idx) {
  const v = DB.visits.find(x => x.id === visitId); const t = v && v.tests[idx];
  if (!t || t.status !== 'done') return toast('⚠️ سجّل النتيجة الأول');
  if (t.verified) return toast('🔍 النتيجة متحقق منها بالفعل');
  t.verified = { at: new Date().toISOString(), by: (session() || {}).name || '' };
  save(); toast('🔍 تم التحقق من النتيجة'); resPickPat();
}
function resReview(visitId, idx) {
  const v = DB.visits.find(x => x.id === visitId); const t = v && v.tests[idx];
  if (!t || !t.verified) return toast('⚠️ لازم التحقق من النتيجة الأول');
  if (t.reviewed) return toast('✅ النتيجة مُراجعة بالفعل');
  t.reviewed = { at: new Date().toISOString(), by: (session() || {}).name || '' };
  save(); toast('✅ تمت المراجعة — التقرير جاهز للطباعة'); resPickPat();
}
function resListHtml(vs) {
  if (!vs.length) return '<div class="card"><div class="empty">لا توجد حالات — سجّل حالة من الاستقبال الأول</div></div>';
  return vs.map(v => { const p = patById(v.patientId);
    const rev = v.tests.filter(t => t.reviewed).length;
    return `<div class="card">
      <h3 style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span>🧍 <b>${esc(p?.name)}</b> <span class="num" style="color:var(--mut)">فاتورة ${v.invoiceNo} — ${v.date}</span>
          <span class="pill ${rev === v.tests.length && rev ? 'p-done' : 'p-unpaid'}">${rev}/${v.tests.length} مُراجَع</span></span>
        <span><button class="btn btn-g btn-s" onclick="resReport('${v.id}')" title="كل التحاليل في تقرير واحد">🖨️ تقرير شامل (الكل)</button></span></h3>
      <div style="overflow-x:auto"><table><tr><th>التحليل</th><th>الحالة</th><th>النتيجة</th><th>التحقق</th><th>المراجعة</th><th>طباعة</th></tr>
      ${v.tests.map((t, i) => { const tt = testById(t.testId);
        return `<tr style="${t.hidden ? 'opacity:.45' : ''}"><td style="font-weight:700">${esc(tt?.name)} <button class="btn btn-o btn-s" style="padding:2px 7px;font-size:12px" onclick="resEditTest('${v.id}',${i})" title="تعديل بيانات التحليل: الاسم والمعدل والوحدة والحسابات">⚙️</button>
        <button class="btn ${t.hidden ? 'btn-r' : 'btn-g'} btn-s" style="padding:2px 7px;font-size:12px" onclick="resToggleHidden('${v.id}',${i})" title="${t.hidden ? 'إظهار في التقرير الشامل' : 'إخفاء من التقرير الشامل'}">${t.hidden ? '🚫' : '👁️'}</button>${t.hidden ? ' <span style="font-size:10px;color:#c62828;font-weight:400">مخفي</span>' : ''}</td>
        <td>${resPill(t)}</td>
        <td><button class="btn btn-p btn-s" onclick="resWork('${v.id}',${i})">${t.status === 'done' ? 'تعديل' : 'إدخال'}</button></td>
        <td>${t.status === 'done' ? (t.verified ? `<span style="color:#0b6e62;font-size:12px;white-space:nowrap">✔ ${esc(String(t.verified.by || '').split(' ')[0])}</span>` : `<button class="btn btn-o btn-s" onclick="resVerify('${v.id}',${i})">🔍 تحقق</button>`) : '<span style="color:#999">—</span>'}</td>
        <td>${t.verified ? (t.reviewed ? `<span style="color:#2e7d32;font-size:12px;white-space:nowrap">✔ ${esc(String(t.reviewed.by || '').split(' ')[0])}</span>` : `<button class="btn btn-o btn-s" onclick="resReview('${v.id}',${i})">✅ مراجعة</button>`) : '<span style="color:#999">—</span>'}</td>
        <td>${t.status === 'done' ? `<button class="btn btn-o btn-s" onclick="resReport('${v.id}',${i})" title="طباعة التحليل ده لوحده">🖨️ تقرير</button>` : '<span style="color:#999">—</span>'}</td></tr>`;
      }).join('')}</table></div>
    </div>`; }).join('');
}

/* آخر نتيجة مسجّلة لنفس المريض في نفس التحليل — للمقارنة أثناء الإدخال */
function resPrevOf(pid, testId, field, beforeDate, curVisitId) {
  const vs = DB.visits.filter(x => x.patientId === pid && x.id !== curVisitId && x.date <= beforeDate
    && x.tests.some(t => t.testId === testId && t.status === 'done' && t.results && t.results[field] !== undefined && t.results[field] !== ''))
    .sort((a, b) => a.date < b.date ? 1 : -1);
  for (const vv of vs) {
    const t = vv.tests.find(t => t.testId === testId && t.status === 'done' && t.results && t.results[field] !== undefined && t.results[field] !== '');
    if (t) return { val: t.results[field], date: vv.date };
  }
  return null;
}
/* إدخال النتيجة: حقول التحليل من الكتالوج [اسم الحقل، الوحدة، من، إلى] */
function resWork(visitId, idx) {
  const v = DB.visits.find(x => x.id === visitId); const t = v.tests[idx]; const tt = testById(t.testId);
  const p = patById(v.patientId);
  t.results = t.results || {};
  const fields = (tt?.fields && tt.fields.length) ? tt.fields : [['النتيجة', '', '', '']];
  const prevMap = {}; fields.forEach(f => { prevMap[f[0]] = resPrevOf(v.patientId, t.testId, f[0], v.date, v.id); });
  modal(`<h3>🧪 ${esc(tt?.name)}</h3>
    <div class="y-pat-banner">
      <div><b>${esc(p?.title ? p.title + ' ' : '')}${esc(p?.name)}</b><span style="color:var(--mut)"> — ${esc(p?.gender || '')} - ${p?.age ?? ''}Y</span></div>
      <div style="font-size:12px;color:var(--mut)">${esc(v.referrer || 'Self referral')} • Reg Time: ${v.date} • Visit <span class="num">${v.invoiceNo}</span>${tt?.cat ? ` • ${esc(tt.cat)}` : ''}</div>
    </div>
    <div class="results-grid" style="margin-top:12px">
    ${fields.map((f, i) => { const val = t.results[f[0]] ?? '';
      return `<div class="res-field"><label>${esc(f[0])}${f[1] ? ` (${esc(f[1])})` : ''}${f[4] ? ` <span title="خانة محسوبة تلقائياً" style="background:#e3f4f1;color:#0b6e62;border-radius:6px;padding:0 5px;font-size:10px">⚙️ محسوبة</span>` : ''}</label>
      <input id="rf-${i}" ${f[4] ? 'readonly' : ''} ${f[4] ? 'style="background:#f2f7fa;font-weight:700;color:#122a5c"' : ''} value="${esc(val)}" oninput="resFlagLive(${i},'${esc(f[2] || '')}','${esc(f[3] || '')}')">
      ${f[2] || f[3] ? `<div class="rf num">( ${esc(f[2])} - ${esc(f[3])} ) <span id="rfl-${i}"></span></div>` : ''}${prevMap[f[0]] ? `<div class="rf" style="color:#0b6e62;font-size:11px">📈 آخر نتيجة: <b>${esc(prevMap[f[0]].val)}</b> <span class="num">(${prevMap[f[0]].date})</span></div>` : ''}</div>`;
    }).join('')}
    </div>
    <div class="field" style="margin-top:12px"><label>ملاحظات / تعليق الدكتور</label><input class="inp2" id="rf-notes" value="${esc(t.notes || '')}" style="width:100%"></div>
    <div class="modal-actions">
      <button class="btn btn-p" onclick="resSave('${visitId}',${idx})">💾 حفظ النتيجة</button>
      <button class="btn btn-g" onclick="resSave('${visitId}',${idx},true)">💾 حفظ + تقرير</button>
      <button class="btn btn-o" onclick="closeModal()">إغلاق</button>
    </div>`);
  window.__resFields = fields;
  fields.forEach((f, i) => { const el = document.getElementById('rf-' + i); if (el && !f[4]) el.addEventListener('input', () => resCalcFields()); });
  resCalcFields();
  fields.forEach((f, i) => { if (t.results[f[0]] != null && t.results[f[0]] !== '') resFlagLive(i, f[2] || '', f[3] || ''); });
}
/* تظليل تلقائي: أحمر لو عالي/واطي عن المرجع */
function resFlagLive(i, low, hi) {
  const el = $('#rf-' + i), fl = $('#rfl-' + i); if (!el || !fl) return;
  const n = parseFloat(el.value);
  if (el.value.trim() === '' || isNaN(n)) { fl.textContent = ''; el.style.borderColor = ''; return; }
  const lo = parseFloat(low), hi2 = parseFloat(hi);
  if (!isNaN(lo) && n < lo) { fl.textContent = 'L ↓'; fl.style.color = '#c62828'; fl.style.fontWeight = '900'; el.style.borderColor = '#c62828'; }
  else if (!isNaN(hi2) && n > hi2) { fl.textContent = 'H ↑'; fl.style.color = '#c62828'; fl.style.fontWeight = '900'; el.style.borderColor = '#c62828'; }
  else { fl.textContent = '✓'; fl.style.color = '#2e7d32'; fl.style.fontWeight = '700'; el.style.borderColor = '#2e7d32'; }
}
function resSave(visitId, idx, report) {
  const v = DB.visits.find(x => x.id === visitId); const t = v.tests[idx]; const tt = testById(t.testId);
  const fields = (tt?.fields && tt.fields.length) ? tt.fields : [['النتيجة', '', '', '']];
  const r = {};
  fields.forEach((f, i) => { const el = $('#rf-' + i); if (el) r[f[0]] = el.value.trim(); });
  t.results = computeTestResults(fields, r); t.notes = $('#rf-notes').value.trim(); t.status = 'done'; t.doneAt = new Date().toISOString();
  save(); closeModal(); toast('✅ تم حفظ نتيجة ' + (tt?.name || ''));
  resPickPat();
  if (report) resReport(visitId);
}
/* ============================================================
   تقرير النتائج — محرك طباعة A4 فاخر
   سير العمل: إدخال نتيجة ← تحقق ← مراجعة ← طباعة
   كل إعدادات الطباعة قابلة للتخصيص من صفحة الإعدادات
   ============================================================ */
const RSET_DEF = { margTop: 8, margSide: 10, font: 13, lineH: 7.5, showQR: true, showTitle: true, title: 'تقرير نتائج التحاليل', showSign: true, signName: '', signImg: '', showWM: true, showFootWM: true, showSched: true };
function rset() { return Object.assign({}, RSET_DEF, DB.lab.rset || {}); }
const dmy = iso => { if (!iso) return ''; const d = new Date(iso); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); };

/* مولّد التقرير — بيخدم الطباعة الحقيقية والمعاينة التجريبية */
function buildReportHtml(v, p, doneTests, opts) {
  opts = opts || {};
  const h = DB.lab.header || {};
  const rs = rset();
  const sexStr = p && p.gender === 'أنثى' ? 'Female' : (p && p.gender ? 'Male' : '');
  const ageStr = p && p.age ? String(p.age) + ' Y' : '';
  const flagOf = (val, low, hi) => {
    const n = parseFloat(val); if (val === '' || isNaN(n)) return ['', ''];
    const lo = parseFloat(low), hh = parseFloat(hi);
    if (!isNaN(lo) && n < lo) return ['L', 'color:#c62828'];
    if (!isNaN(hh) && n > hh) return ['H', 'color:#c62828'];
    return ['', ''];
  };
  const rowHtml = (f, t, res) => {
    const val = (res || t.results || {})[f[0]] ?? '';
    const [fg, st] = flagOf(val, f[2], f[3]);
    const ref = (f[2] || f[3]) ? `${esc(f[2] || '')} - ${esc(f[3] || '')}` : '—';
    return `<tr class="rr">
      <td class="c-name">${esc(f[0])}${f[1] ? ` <span class="c-unit">${esc(f[1])}</span>` : ''}</td>
      <td class="c-res" style="${st}">${esc(val) || '—'}${fg ? ` <b class="c-flag">${fg}</b>` : ''}</td>
      <td class="c-ref num">${ref}</td>
    </tr>`;
  };
  const groups = doneTests.map(t => { const tt = testById(t.testId);
    const fields = (tt && tt.fields && tt.fields.length) ? tt.fields : [['النتيجة', '', '', '']];
    const res = computeTestResults(fields, t.results || {});
    const stamp = [];
    if (t.verified) stamp.push('تحقق: ' + esc((t.verified.by || '')) + ' — ' + dmy(t.verified.at));
    if (t.reviewed) stamp.push('مراجعة: ' + esc((t.reviewed.by || '')) + ' — ' + dmy(t.reviewed.at));
    return `<tbody class="grp">
      <tr class="grp-head"><td colspan="3">${esc(tt ? tt.name : '')}${stamp.length ? `<span class="grp-stamp">${stamp.join(' • ')}</span>` : ''}</td></tr>
      ${fields.map(f => rowHtml(f, t, res)).join('')}
      ${tt && tt.cv ? `<tr class="grp-curve"><td colspan="3">${gttCurveSvg(fields, t.results || {})}</td></tr>` : ''}
      ${t.notes ? `<tr class="grp-notes"><td colspan="3"><b>ملاحظات:</b> ${esc(t.notes)}</td></tr>` : ''}
    </tbody>`; }).join('');
  const allRev = doneTests.every(t => t.reviewed);
  const signName = rs.signName || DB.lab.specialist || '';
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير ${esc(v.invoiceNo)}</title>
  <style>
  *{box-sizing:border-box}
  body{font-family:Tahoma,Arial,sans-serif;margin:0;background:#fff;color:#111}
  .page{width:210mm;min-height:297mm;padding:${rs.margTop}mm ${rs.margSide}mm 34mm;margin:auto;position:relative;z-index:1}
  .report-headimg{width:100%;max-height:45mm;object-fit:contain;margin-bottom:3mm}
  .report-header{display:grid;grid-template-columns:${rs.showQR ? '1fr 1fr 1fr 50mm' : '1fr 1fr 1fr'};gap:2mm;border:1.5px solid #333;border-radius:2mm;padding:3mm;margin-bottom:4mm}
  .rh-cell{display:flex;flex-direction:column;gap:1mm;font-size:12.5px}
  .rh-label{font-size:10px;color:#777;font-weight:700}
  .rh-qr{border-right:1px dashed #999;padding-right:3mm;display:flex;flex-direction:column;gap:.5mm;font-size:11px;justify-content:center}
  .rh-qr-title{font-weight:900;font-size:12px}
  .rh-qr-line{direction:ltr;text-align:left}
  .report-title{text-align:center;font-weight:900;font-size:16px;margin:2mm 0 3mm;color:#0d1b3e}
  table.rt{width:100%;border-collapse:collapse}
  .rt thead th{font-size:${rs.font - 1}px;border-top:1.2px solid #333;border-bottom:1.2px solid #333;padding:1.5mm 2mm;text-align:right;color:#0d1b3e;background:#fff}
  .grp-head td{background:#e2e6ee;font-weight:900;font-size:${rs.font + 1}px;padding:1.6mm 2mm}
  .grp-head{break-inside:avoid;break-after:avoid;page-break-after:avoid}
  .rr{break-inside:avoid;page-break-inside:avoid}
  .grp-stamp{float:left;font-weight:400;font-size:9.5px;color:#555}
  .rr td{border-bottom:1px dashed #aaa;padding:${Math.round(rs.lineH * 0.3 * 10) / 10}mm 2mm;font-size:${rs.font}px;vertical-align:middle}
  .c-name{width:46%}.c-res{width:27%;font-weight:700}.c-flag{font-size:${rs.font - 1}px}.c-unit{color:#555;font-size:${rs.font - 2}px;font-weight:400}.c-ref{width:27%;color:#333}
  .grp-notes td{font-size:${rs.font - 1}px;color:#333;padding:1.5mm 2mm;white-space:pre-wrap}
  .pfoot{position:fixed;bottom:4mm;left:${rs.margSide}mm;right:${rs.margSide}mm;display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;border-top:1px solid #999;padding-top:1.5mm;z-index:2;background:#fff}
  .pf-remarks{font-size:11px;color:#444;max-width:42%}
  .pf-review{font-size:10.5px;font-weight:700;text-align:center}
  .pf-review.ok{color:#2e7d32}
  .pf-review.no{color:#b26a00}
  .pf-sign{text-align:center;min-width:45mm}
  .pf-sign-title{font-size:11px;color:#666}
  .pf-sign-name{font-weight:900;border-top:1px solid #333;padding-top:1mm;margin-top:${rs.signImg ? '1' : '8'}mm}
  .pf-sign-img{max-height:16mm;max-width:45mm;object-fit:contain}
  .report-wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:0;pointer-events:none}
  .report-wm img{max-width:75%;max-height:75%;opacity:.12}
  @media print{@page{size:A4;margin:0}body{padding:0}.pfoot{position:fixed}}
  </style></head><body>
  ${rs.showWM && h.wmImg ? `<div class="report-wm"><img src="${h.wmImg}"></div>` : ''}
  <div class="page">
    ${h.headerImg ? `<img class="report-headimg" src="${h.headerImg}">` : ''}
    <div class="report-header">
      <div class="rh-cell"><span class="rh-label">اسم المريض / Patient</span><b>${esc(p ? p.name : '')}</b></div>
      <div class="rh-cell"><span class="rh-label">التاريخ / Date</span><span class="num">${esc(v.date)}</span>${(() => { const pv = (DB.visits || []).filter(x => x.patientId === v.patientId && x.id !== v.id && x.date < v.date).sort((a, b) => a.date < b.date ? 1 : -1)[0]; return pv ? `<div class="num" style="font-size:9.5px;color:#666;font-weight:400;line-height:1.5">زيارة سابقة: ${esc(pv.date)}<br>فاتورة ${esc(pv.invoiceNo)}</div>` : ''; })()}</div>
      <div class="rh-cell"><span class="rh-label">الطبيب المحيل / Referral</span>${esc(v.doctor || 'Self referral')}</div>
      ${rs.showQR ? `<div class="rh-qr">
        <div class="rh-qr-title">${esc(h.title || DB.lab.name)}</div>
        <div class="rh-qr-line num">Request: ${esc(v.invoiceNo)}</div>
        <div class="rh-qr-line num">Patient: ${esc(p ? p.code : '')}</div>
        <div class="rh-qr-line">${sexStr} - ${ageStr}</div>
      </div>` : ''}
    </div>
    ${rs.showTitle ? `<div class="report-title">${esc(rs.title)}</div>` : ''}
    <table class="rt">
      <thead><tr><th>Test name</th><th>Result</th><th>Reference range</th></tr></thead>
      ${groups}
    </table>
  </div>
  <div class="pfoot">
    <div class="pf-remarks">${rs.showSched ? `🕐 ${esc(DB.lab.schedule)}<br>` : ''}${esc(h.footer || '')}</div>
    <div class="pf-review ${allRev ? 'ok' : 'no'}">${allRev ? '✔ تم التحقق والمراجعة' : '⚠ النتائج بانت مراجعة نهائية'}</div>
    ${rs.showSign ? `<div class="pf-sign">
      <div class="pf-sign-title">توقيع أخصائي المختبر</div>
      ${rs.signImg ? `<img class="pf-sign-img" src="${rs.signImg}">` : ''}
      <div class="pf-sign-name">${esc(signName)}</div>
    </div>` : ''}
    ${rs.showFootWM ? `<div style="position:fixed;bottom:1mm;left:0;right:0;text-align:center;font-size:9px;color:#bbb">CSL — csl.mtayea.com</div>` : ''}
  </div>
  <script>window.print()<\/script></body></html>`;
}

/* طباعة تقرير حقيقي — بتسجّل عدد مرات الطباعة على الزيارة */
function resReport(visitId, onlyIdx) {
  const v = DB.visits.find(x => x.id === visitId); if (!v) return;
  const p = patById(v.patientId);
  let doneTests = v.tests.filter(t => t.status === 'done' && !t.hidden);
  if (onlyIdx != null) {
    const one = v.tests[onlyIdx];
    if (!one || one.status !== 'done') return toast('⚠️ التحليل ده لسه مفيهوش نتيجة');
    doneTests = [one];
  }
  if (!doneTests.length) return toast('⚠️ لسه مفيش نتائج محفوظة للحالة دي');
  v.prints = (v.prints || 0) + 1;
  v.lastPrintedAt = new Date().toISOString();
  save();
  const w = window.open('', '_blank');
  w.document.write(buildReportHtml(v, p, doneTests));
  w.document.close();
}

/* معاينة تجريبية ببيانات وهمية — من إعدادات الطباعة */
function stPreviewReport() {
  stSaveRset(true);
  const tt = DB.tests.find(t => t.fields && t.fields.length >= 3) || DB.tests[0];
  if (!tt) return toast('⚠️ مفيش تحاليل في الكتالوج');
  const fields = (tt.fields && tt.fields.length) ? tt.fields : [['النتيجة', '', '', '']];
  const results = {};
  fields.forEach((f, i) => { results[f[0]] = f[2] && f[3] ? String((parseFloat(f[2]) + parseFloat(f[3])) / 2 || 12.5) : (i === 0 ? 'طبيعي' : ''); });
  results[fields[0][0]] = results[fields[0][0]] || 'سلبي';
  const sampleT = { testId: tt.id, status: 'done', results, notes: 'معاينة تجريبية لشكل التقرير — البيانات دي مش حقيقية.',
    verified: { at: new Date().toISOString(), by: 'معاينة' }, reviewed: { at: new Date().toISOString(), by: 'معاينة' } };
  const sampleV = { id: 'preview', invoiceNo: '5001', date: today(), doctor: 'د. معاينة' };
  const sampleP = { name: 'مريض تجريبي — Preview Patient', code: 'ab-12cd', age: 35, gender: 'ذكر' };
  const w = window.open('', '_blank');
  w.document.write(buildReportHtml(sampleV, sampleP, [sampleT], { sample: true }));
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
  const monthPaid = DB.companyDebts.reduce((a, d) => {
    if (d.pays && d.pays.length) return a + d.pays.filter(pp => (pp.date || '').startsWith(month)).reduce((x, pp) => x + pp.amount, 0);
    return a + ((d.date || '').startsWith(month) ? (d.paid || 0) : 0);
  }, 0);

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
  ${dates.map(dt => { const d = data[dt]; const inv = invoiceIncomeByShift(dt).total;
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
    const inv = invoiceIncomeByShift(dt).total;
    const manual = (d.patient.total || 0) + (d.lab.total || 0);
    const out = Object.values(d.expenses || {}).reduce((a, b) => a + (+b || 0), 0) + (d.expenseDetails || []).reduce((a, e) => a + (e.amount || 0), 0);
    const compPaid = cdPaidOn(dt);
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
    const inv = invoiceIncomeByShift(dt).total;
    const manual = (d.patient.total || 0) + (d.lab.total || 0);
    const out = Object.values(d.expenses || {}).reduce((a, b) => a + (+b || 0), 0) + (d.expenseDetails || []).reduce((a, e) => a + (e.amount || 0), 0);
    const compPaid = cdPaidOn(dt);
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

/* سداد الشركات محسوب بتاريخ كل دفعة (قديم: كله بتاريخ المعاملة) */
function cdPaidOn(dt) {
  return (DB.companyDebts || []).reduce((a, d) => {
    if (d.pays && d.pays.length) return a + d.pays.filter(pp => pp.date === dt).reduce((x, pp) => x + pp.amount, 0);
    return a + (d.date === dt ? (d.paid || 0) : 0);
  }, 0);
}

/* ---------- مديونية الشركات ---------- */
function cdAdd() {
  const companyId = $('#cd-company').value;
  const date = $('#cd-date').value;
  const amount = +$('#cd-amount').value || 0;
  const paid = +$('#cd-paid').value || 0;
  if (!companyId) return toast('⚠️ اختار الشركة (بتتسجل من الإعدادات)');
  if (!amount) return toast('⚠️ أدخل المبلغ');
  const entry = { id: uid('cd'), companyId, date, amount, paid, remaining: Math.max(0, amount - paid) };
  if (paid > 0) entry.pays = [{ amount: paid, date }];
  DB.companyDebts.push(entry);
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
  d.pays = d.pays || [];
  d.pays.push({ amount: amt, date: today() });
  save(); closeModal(); toast('✅ تم تسجيل سداد ' + fmt(amt) + ' ج.م');
  cdRender(); trReports();
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
  const cs = (typeof cloudStatusInfo === 'function') ? cloudStatusInfo() : { ok: false, last: null };
  const rs = rset();
  const csLast = cs.last ? new Date(cs.last).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : 'لسه مفيش نسخة مرفوعة من الجهاز ده';
  window.__cloudPushed = () => {
    const el = document.getElementById('cs-last');
    if (el) el.textContent = cloudStatusInfo().last ? new Date(cloudStatusInfo().last).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : 'لسه مفيش نسخة مرفوعة من الجهاز ده';
    toast('✅ اترفعت نسخة الحماية على السحابة');
  };
  shell('الإعدادات', `
  <div class="card"><h3>☁️ حماية السحابة</h3>
    <p style="margin:0 0 10px;font-size:13px;color:#556">
      ${cs.ok ? '🟢 <b>متصل بالسحابة</b> — بياناتك بتتزامن تلقائياً، وكل جهاز يدخل بنفس كود التفعيل بيشوف نفس البيانات.' : '🔴 <b>شغال محلياً بس</b> (مفيش نت) — البيانات محفوظة على الجهاز وهتتزامن أول ما النت يرجع.'}<br>
      🕐 آخر نسخة حماية مرفوعة: <b id="cs-last">${esc(csLast)}</b>
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="cloudBackupNow()">☁️ ارفع نسخة حماية دلوقتي</button>
      <button class="btn btn-o" onclick="cloudRestoreNow()">⬇️ استرجاع نسخة السحابة على الجهاز ده</button>
    </div>
  </div>
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
    <div class="grid2" style="margin-top:4px">
      <div class="field"><label>🖼️ صورة رأس التقرير — بتظهر في أعلى التقرير والفاتورة (اختياري)</label>
        <input type="file" accept="image/*" class="inp2" id="st-h-headimg" onchange="stUploadHeaderImg(this)" style="width:100%">
        ${DB.lab.header.headerImg ? `<div style="margin-top:6px"><img src="${DB.lab.header.headerImg}" style="max-height:60px;border-radius:8px;border:1px solid var(--line)"> <a href="javascript:stClearHeaderImg()" style="color:#c62828;font-size:12px">✖ إزالة</a></div>` : ''}
      </div>
      <div class="field"><label>🔏 لوجو العلامة المائية — بيظهر خلف التقرير بشفافية 12% (اختياري)</label>
        <input type="file" accept="image/*" class="inp2" id="st-h-wm" onchange="stUploadWatermark(this)" style="width:100%">
        ${DB.lab.header.wmImg ? `<div style="margin-top:6px"><img src="${DB.lab.header.wmImg}" style="max-height:60px;border-radius:8px;border:1px solid var(--line);opacity:.4"> <a href="javascript:stClearWatermark()" style="color:#c62828;font-size:12px">✖ إزالة</a></div>` : ''}
      </div>
    </div>
    <button class="btn btn-p btn-s" onclick="stSaveHeader()">💾 حفظ الترويسة</button>
  </div>
  <div class="card"><h3>🖨️ إعدادات طباعة التقارير (A4)</h3>
    <div class="grid2">
      <div class="field"><label>الهامش العلوي (مم)</label><input class="inp2 num" type="number" id="rs-margTop" value="${rs.margTop}" style="width:100%"></div>
      <div class="field"><label>الهامش الجانبي (مم)</label><input class="inp2 num" type="number" id="rs-margSide" value="${rs.margSide}" style="width:100%"></div>
      <div class="field"><label>حجم خط التقرير (بكسل)</label><input class="inp2 num" type="number" id="rs-font" value="${rs.font}" style="width:100%"></div>
      <div class="field"><label>ارتفاع سطر النتيجة (مم)</label><input class="inp2 num" step="0.5" id="rs-lineH" value="${rs.lineH}" style="width:100%"></div>
      <div class="field"><label>عنوان التقرير</label><input class="inp2" id="rs-title" value="${esc(rs.title)}" style="width:100%"></div>
      <div class="field"><label>اسم أخصائي المختبر (بيظهر تحت التوقيع)</label><input class="inp2" id="rs-signName" value="${esc(rs.signName || DB.lab.specialist || '')}" style="width:100%"></div>
    </div>
    <div class="grid2" style="margin-top:4px">
      <div class="field"><label>✍️ صورة التوقيع — بتحط سكان توقيع الأخصائي في آخر كل صفحة (اختياري)</label>
        <input type="file" accept="image/*" class="inp2" id="rs-signImg" onchange="stUploadSignImg(this)" style="width:100%">
        ${rs.signImg ? `<div style="margin-top:6px"><img src="${rs.signImg}" style="max-height:44px;border-radius:8px;border:1px solid var(--line)"> <a href="javascript:stClearSignImg()" style="color:#c62828;font-size:12px">✖ إزالة</a></div>` : ''}
      </div>
      <div class="field"><label>عناصر التقرير</label>
        <div class="chk-grid">
          <label class="chk"><input type="checkbox" id="rs-showQR" ${rs.showQR ? 'checked' : ''}> صندوق البيانات (QR)</label>
          <label class="chk"><input type="checkbox" id="rs-showTitle" ${rs.showTitle ? 'checked' : ''}> عنوان التقرير</label>
          <label class="chk"><input type="checkbox" id="rs-showSign" ${rs.showSign ? 'checked' : ''}> التوقيع</label>
          <label class="chk"><input type="checkbox" id="rs-showWM" ${rs.showWM ? 'checked' : ''}> العلامة المائية الخلفية</label>
          <label class="chk"><input type="checkbox" id="rs-showSched" ${rs.showSched ? 'checked' : ''}> مواعيد العمل في الأسفل</label>
          <label class="chk"><input type="checkbox" id="rs-showFootWM" ${rs.showFootWM ? 'checked' : ''}> سطر CSL في الأسفل</label>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p btn-s" onclick="stSaveRset()">💾 حفظ إعدادات الطباعة</button>
      <button class="btn btn-t btn-s" onclick="stPreviewReport()">👁️ معاينة تقرير تجريبي</button>
    </div>
  </div>
  <div class="card"><h3>🏷️ قائمة الأسعار (${DB.tests.length} تحليل)</h3>
    <div class="toolbar">
      <input class="inp2" id="pr-q" placeholder="🔍 بحث…" style="flex:1;min-width:180px" oninput="stPriceSearch()">
      <button class="btn btn-o btn-s" onclick="stRefreshCatalog()">🔄 تحديث الكتالوج من يسيّر</button>
    </div>
    <div id="pr-list" style="max-height:340px;overflow:auto"></div>
    <div style="margin-top:12px;border-top:1px dashed #d5dcee;padding-top:12px">
      <div class="toolbar">
        <input class="inp2" id="pr-new-name" placeholder="اسم تحليل جديد" style="flex:2;min-width:160px">
        <input class="inp2 num" id="pr-new-price" type="number" placeholder="السعر" style="width:110px">
        <select class="inp2" id="pr-new-cat" style="width:150px">
          ${['كيميا وبايوكيميا','هيماتولوجي','هرمونات','مناعة وفيروسات','أورام ماركرز','بول','سائل منوي','مزارع','PCR','أنسجة وهيستو','تخثر','فحوصات عامة ومزارع','عام'].map(c => `<option>${c}</option>`).join('')}
        </select>
      </div>
      <div class="hint" style="margin:8px 0 4px">📋 حقول النتيجة والمرجع <small style="color:var(--mut)">(زي يسيّر — سيبها فاضية لو التحليل نتيجة واحدة)</small></div>
      <div id="pr-fields"></div>
      <div class="toolbar">
        <button class="btn btn-o btn-s" onclick="stAddFieldRow()">➕ إضافة قياس</button>
        <button class="btn btn-t btn-s" onclick="stAddTest()">💾 حفظ التحليل</button>
      </div>
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
  stNewFields = [];
  stRenderFieldRows();
}
/* صفوف حقول المرجع لتحليل جديد */
let stNewFields = [];
function stRenderFieldRows() {
  const w = $('#pr-fields'); if (!w) return;
  w.innerHTML = stNewFields.map((f, i) => `<div class="toolbar" style="margin-bottom:6px">
    <input class="inp2" placeholder="اسم القياس" value="${esc(f[0])}" style="flex:2;min-width:150px" oninput="stNewFields[${i}][0]=this.value">
    <input class="inp2" placeholder="الوحدة" value="${esc(f[1])}" style="width:100px" oninput="stNewFields[${i}][1]=this.value">
    <input class="inp2 num" placeholder="من" value="${esc(f[2])}" style="width:80px" oninput="stNewFields[${i}][2]=this.value">
    <input class="inp2 num" placeholder="إلى" value="${esc(f[3])}" style="width:80px" oninput="stNewFields[${i}][3]=this.value">
    <button class="btn btn-r btn-s" onclick="stNewFields.splice(${i},1);stRenderFieldRows()">✖</button>
  </div>`).join('');
}
function stAddFieldRow() { stNewFields.push(['', '', '', '']); stRenderFieldRows(); }
/* تعديل مرجع تحليل موجود */
function stEditRef(id) {
  const t = testById(id); if (!t) return;
  const fields = (t.fields && t.fields.length) ? t.fields.map(f => [...f]) : [['', '', '', '']];
  modal(`<h3>📋 مرجع: ${esc(t.name)}</h3>
    <div id="ref-rows">${fields.map((f, i) => `<div class="toolbar" style="margin-bottom:6px">
      <input class="inp2" placeholder="اسم القياس" value="${esc(f[0])}" style="flex:2;min-width:150px">
      <input class="inp2" placeholder="الوحدة" value="${esc(f[1])}" style="width:100px">
      <input class="inp2 num" placeholder="من" value="${esc(f[2])}" style="width:80px">
      <input class="inp2 num" placeholder="إلى" value="${esc(f[3])}" style="width:80px">
      <button class="btn btn-r btn-s" onclick="this.parentElement.remove()">✖</button>
    </div>`).join('')}</div>
    <div class="toolbar"><button class="btn btn-o btn-s" onclick="stAddRefRow()">➕ إضافة قياس</button></div>
    <div class="modal-actions">
      <button class="btn btn-p" onclick="stSaveRef('${id}')">💾 حفظ المرجع</button>
      <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
    </div>`);
}
function stAddRefRow() {
  $('#ref-rows').insertAdjacentHTML('beforeend', `<div class="toolbar" style="margin-bottom:6px">
    <input class="inp2" placeholder="اسم القياس" style="flex:2;min-width:150px">
    <input class="inp2" placeholder="الوحدة" style="width:100px">
    <input class="inp2 num" placeholder="من" style="width:80px">
    <input class="inp2 num" placeholder="إلى" style="width:80px">
    <button class="btn btn-r btn-s" onclick="this.parentElement.remove()">✖</button>
  </div>`);
}
function stSaveRef(id) {
  const t = testById(id); if (!t) return;
  const rows = [...document.querySelectorAll('#ref-rows .toolbar')];
  const fields = rows.map(r => [...r.querySelectorAll('input')].map(i => i.value.trim())).filter(f => f[0]);
  t.fields = fields;
  save(); closeModal(); toast('✅ تم حفظ المرجع'); stPriceSearch();
}
function saveSuper() { META.superUser = { user: $('#sp-user').value.trim(), pass: $('#sp-pass').value }; saveMeta(); toast('✅ تم الحفظ'); }
function stSaveLab() { DB.lab.name = $('#st-name').value.trim(); DB.lab.schedule = $('#st-schedule').value.trim(); save(); toast('✅ تم الحفظ'); renderSettings(); }
function stSaveHeader() { DB.lab.header = { ...DB.lab.header, title: $('#st-h-title').value.trim(), address: $('#st-h-address').value.trim(), phones: $('#st-h-phones').value.trim(), footer: $('#st-h-footer').value.trim() }; save(); toast('✅ تم حفظ الترويسة'); }

function stSaveRset(silent) {
  const g = id => document.getElementById(id);
  if (!g('rs-margTop')) return;
  DB.lab.rset = {
    margTop: +g('rs-margTop').value || 8,
    margSide: +g('rs-margSide').value || 10,
    font: +g('rs-font').value || 13,
    lineH: +g('rs-lineH').value || 7.5,
    title: (g('rs-title').value || '').trim() || 'تقرير نتائج التحاليل',
    signName: (g('rs-signName').value || '').trim(),
    signImg: (DB.lab.rset && DB.lab.rset.signImg) || '',
    showQR: g('rs-showQR').checked,
    showTitle: g('rs-showTitle').checked,
    showSign: g('rs-showSign').checked,
    showWM: g('rs-showWM').checked,
    showSched: g('rs-showSched').checked,
    showFootWM: g('rs-showFootWM').checked,
  };
  save();
  if (!silent) { toast('✅ تم حفظ إعدادات الطباعة'); renderSettings(); }
}
function stUploadSignImg(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { DB.lab.rset = DB.lab.rset || {}; DB.lab.rset.signImg = r.result; save(); toast('✅ تم رفع صورة التوقيع'); renderSettings(); };
  r.readAsDataURL(f);
}
function stClearSignImg() { if (DB.lab.rset) delete DB.lab.rset.signImg; save(); renderSettings(); }
/* صورة رأس التقرير — بتحفظ فور اختيارها */
function stUploadHeaderImg(inp) {
  const f = inp.files && inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { DB.lab.header = DB.lab.header || {}; DB.lab.header.headerImg = r.result; save(); toast('✅ اتحفظت صورة الرأس'); renderSettings(); };
  r.readAsDataURL(f);
}
function stClearHeaderImg() { if (DB.lab.header) delete DB.lab.header.headerImg; save(); renderSettings(); }
/* لوجو العلامة المائية — بيتحفظ فور اختياره */
function stUploadWatermark(inp) {
  const f = inp.files && inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { DB.lab.header = DB.lab.header || {}; DB.lab.header.wmImg = r.result; save(); toast('✅ اتحفظت العلامة المائية'); renderSettings(); };
  r.readAsDataURL(f);
}
function stClearWatermark() { if (DB.lab.header) delete DB.lab.header.wmImg; save(); renderSettings(); }
function stUploadLogo(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { DB.lab.logo = r.result; save(); toast('✅ تم رفع اللوجو'); renderSettings(); };
  r.readAsDataURL(f);
}
function stPriceSearch() {
  const q = ($('#pr-q')?.value || '').trim().toLowerCase();
  const list = DB.tests.filter(t => !q || t.name.toLowerCase().includes(q) || (t.ar || '').includes(q)).slice(0, 80);
  $('#pr-list').innerHTML = `<table><tr><th>التحليل</th><th>القسم</th><th>السعر</th><th></th></tr>
  ${list.map(t => `<tr><td style="text-align:right">${esc(t.name)} ${t.fields && t.fields.length ? `<small style="color:var(--mut)">(${t.fields.length} قياس)</small>` : ''}</td><td>${esc(t.cat || '-')}</td>
  <td><input class="inp2 num" type="number" value="${t.price}" style="width:90px;padding:5px 8px" onchange="stSetPrice('${t.id}', this.value)"></td>
  <td><button class="btn btn-o btn-s" onclick="stEditRef('${t.id}')">📋 مرجع</button>
  <button class="btn btn-r btn-s" onclick="stDelTest('${t.id}')">🗑️</button></td></tr>`).join('')}</table>`;
}
function stSetPrice(id, v) { const t = testById(id); t.price = +v || 0; save(); toast('✅ تم تحديث السعر'); }
/* استيراد كتالوج يسيّر الجديد — بيحافظ على التحاليل اللي ضفتها بنفسك وأسعارك */
function stRefreshCatalog() {
  if (!confirm('هيتحدث الكتالوج من يسيّر بالبارتشنات والمراجع الجديدة. أسعار التحاليل الأساسية هترجع الافتراضية — تحاليلك الخاصة وأسعارها هتفضل زي ما هي. كمّل؟')) return;
  const T = (id, name, cat, price, fields) => ({ id, name, cat, price, fields: fields || [] });
  const fresh = [];
  for (const r of (typeof YS_PANELS !== 'undefined' ? YS_PANELS : [])) { const t = T('yp_' + fresh.length, r.n, r.c, r.p, r.f || []); if (r.ar) t.ar = r.ar; fresh.push(t); }
  for (const r of (typeof YS_TESTS !== 'undefined' ? YS_TESTS : [])) fresh.push(T('yt_' + fresh.length, r.n, r.c, r.p, r.f || []));
  if (!fresh.some(t => /منوي/.test(t.name))) fresh.push(T('casa_1', 'تحليل السائل المنوي (CASA)', 'سائل منوي', 250, []));
  const mine = DB.tests.filter(t => !/^yp_|^yt_|^casa_/.test(t.id));
  const priceKeep = {};
  DB.tests.forEach(t => { if (/^yp_|^yt_|^casa_/.test(t.id)) priceKeep[t.name] = t.price; });
  fresh.forEach(t => { if (priceKeep[t.name]) t.price = priceKeep[t.name]; });
  DB.tests = fresh.concat(mine);
  catalogFixes();
  save(); renderSettings(); toast('✅ الكتالوج اتحدث — ' + fresh.length + ' تحليل');
}
function stDelTest(id) { if (!confirm('حذف التحليل؟')) return; DB.tests = DB.tests.filter(t => t.id !== id); save(); stPriceSearch(); }
function stAddTest() {
  const name = $('#pr-new-name').value.trim();
  if (!name) return toast('⚠️ أدخل الاسم');
  const fields = stNewFields.filter(f => f[0]);
  DB.tests.push({ id: uid('t'), name, cat: $('#pr-new-cat').value.trim() || 'عام', price: +$('#pr-new-price').value || 0, fields });
  save(); $('#pr-new-name').value = ''; $('#pr-new-price').value = '';
  stNewFields = []; stRenderFieldRows(); stPriceSearch(); toast('✅ تمت الإضافة');
}
async function stAddUser() {
  const name = $('#us-name').value.trim(), user = $('#us-user').value.trim(), pass = $('#us-pass').value;
  if (!name || !user || !pass) return toast('⚠️ أكمل كل الحقول');
  if (DB.users.find(u => u.user === user)) return toast('⚠️ اسم المستخدم موجود');
  const hp = await hashNewPass(pass);
  DB.users.push({ id: uid('u'), name, user, salt: hp.salt, pass: hp.pass, role: $('#us-role').value });
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

loadMeta(); route();


/* ===== الدخول التلقائي من لوحة التحكم الموحّدة (m-tayea.mtayea.com/panel) ===== */
window.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.mt !== 'sso') return;
  if (typeof window.MT_SSO_HANDLE === 'function') window.MT_SSO_HANDLE(d);
});
window.MT_SSO_HANDLE = function (d) {
  if (d.site !== 'csl') return;
  try { setSession({ type: 'super', name: 'الموزّع' }); go(''); route(); } catch (e) {}
};/* ============================================================
   محرك المعادلات + محرر بيانات التحليل من شاشة النتائج
   خانة الحساب: عنصر خامس في الحقل بصيغة زي  #0/#1*100
   (#0 = أول خانة، #1 = تانية خانة وهكذا — بتتكسب تلقائياً)
   ============================================================ */
function calcFieldValue(formula, vals) {
  if (!formula) return null;
  try {
    const expr = String(formula).replace(/#(\d+)/g, (m, i) => {
      const v = vals[+i];
      return (v == null || isNaN(v)) ? 'NaN' : '(' + v + ')';
    });
    if (/NaN/.test(expr)) return null;
    if (!/^[\d\s+\-*/().%]+$/.test(expr)) return null;
    let e = expr.replace(/%/g, '/100');
    const r = Function('"use strict";return (' + e + ')')();
    if (typeof r !== 'number' || !isFinite(r)) return null;
    return Math.round(r * 100) / 100;
  } catch (e) { return null; }
}
/* نتائج التحليل بعد حساب الخانات المحسوبة (الحساب دايماً يكسب على المخزن) */
function computeTestResults(fields, results) {
  const out = Object.assign({}, results || {});
  const vals = fields.map(f => parseFloat(out[f[0]]));
  fields.forEach((f, i) => {
    if (!f[4]) return;
    const v = calcFieldValue(f[4], vals);
    out[f[0]] = (v == null) ? (out[f[0]] || '') : String(v);
  });
  return out;
}
/* داخل شاشة الإدخال: أعد حساب الخانات المحسوبة لحظياً */
function resCalcFields() {
  const fields = window.__resFields || [];
  fields.forEach((f, i) => {
    if (!f[4]) return;
    const el = document.getElementById('rf-' + i); if (!el) return;
    const vals = fields.map(ff => { const e2 = document.getElementById('rf-' + fields.indexOf(ff)); return e2 ? parseFloat(e2.value) : NaN; });
    const v = calcFieldValue(f[4], vals);
    el.value = (v == null) ? '' : v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
/* زرار ⚙️ جنب التحليل — يفتح بيانات التحليل كاملة للتعديل */
function resEditTest(visitId, idx) {
  const v = DB.visits.find(x => x.id === visitId); const t = v && v.tests[idx]; const tt = testById(t.testId);
  if (!tt) return toast('⚠️ التحليل مش موجود');
  const fields = (tt.fields && tt.fields.length) ? tt.fields.map(f => [...f]) : [['', '', '', '', '']];
  modal(`<h3>⚙️ بيانات التحليل: ${esc(tt.name)}</h3>
    <p style="font-size:12px;color:#7a8aa0;margin:4px 0 10px">أي تعديل هنا بيتحفظ على التحليل نفسه في الكتالوج — وهيسمع في كل الحالات والتقارير.</p>
    <div class="toolbar" style="margin-bottom:8px">
      <input class="inp2" id="ret-name" value="${esc(tt.name)}" placeholder="اسم التحليل" style="flex:2;min-width:160px">
      <input class="inp2 num" id="ret-price" type="number" value="${tt.price || 0}" placeholder="السعر" style="width:90px">
      <label style="font-size:12px;display:flex;align-items:center;gap:5px;white-space:nowrap"><input type="checkbox" id="ret-cv" ${tt.cv ? 'checked' : ''}> 📈 كيرف (منحنى)</label>
    </div>
    <div style="font-size:11.5px;color:#0b6e62;background:#e3f4f1;border-radius:8px;padding:6px 10px;margin-bottom:8px">💡 خانة «حساب»: اكتب معادلة بالحقول بالترتيب — مثال: <b class="num">#0/#1*100</b> يعني خانة ١ ÷ خانة ٢ × ١٠٠، والخانة المحسوبة بتتعبى لوحدها.</div>
    <div id="ret-rows">${fields.map((f, i) => `<div class="toolbar" style="margin-bottom:6px">
      <input class="inp2" placeholder="اسم القياس" value="${esc(f[0])}" style="flex:2;min-width:130px">
      <input class="inp2" placeholder="الوحدة" value="${esc(f[1])}" style="width:85px">
      <input class="inp2 num" placeholder="من" value="${esc(f[2])}" style="width:65px">
      <input class="inp2 num" placeholder="إلى" value="${esc(f[3])}" style="width:65px">
      <input class="inp2 num" dir="ltr" placeholder="#0/#1*100" value="${esc(f[4] || '')}" style="width:95px" title="معادلة الحساب (اختياري)">
      <button class="btn btn-r btn-s" onclick="this.parentElement.remove()">✖</button>
    </div>`).join('')}</div>
    <div class="toolbar"><button class="btn btn-o btn-s" onclick="resAddTestRow()">➕ إضافة قياس</button></div>
    <div class="modal-actions">
      <button class="btn btn-p" onclick="resSaveTestEdit('${visitId}',${idx})">💾 حفظ بيانات التحليل</button>
      <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
    </div>`);
}
function resAddTestRow() {
  $('#ret-rows').insertAdjacentHTML('beforeend', `<div class="toolbar" style="margin-bottom:6px">
    <input class="inp2" placeholder="اسم القياس" style="flex:2;min-width:130px">
    <input class="inp2" placeholder="الوحدة" style="width:85px">
    <input class="inp2 num" placeholder="من" style="width:65px">
    <input class="inp2 num" placeholder="إلى" style="width:65px">
    <input class="inp2 num" dir="ltr" placeholder="#0/#1*100" style="width:95px" title="معادلة الحساب (اختياري)">
    <button class="btn btn-r btn-s" onclick="this.parentElement.remove()">✖</button>
  </div>`);
}
function resSaveTestEdit(visitId, idx) {
  const v = DB.visits.find(x => x.id === visitId); const t = v && v.tests[idx]; const tt = testById(t.testId);
  if (!tt) return;
  const name = $('#ret-name').value.trim();
  if (!name) return toast('⚠️ اسم التحليل فاضي');
  tt.name = name;
  tt.price = +$('#ret-price').value || tt.price || 0;
  if ($('#ret-cv').checked) tt.cv = 1; else delete tt.cv;
  const rows = [...document.querySelectorAll('#ret-rows .toolbar')];
  const fields = rows.map(r => [...r.querySelectorAll('input')].map(i => i.value.trim())).filter(f => f[0]);
  tt.fields = fields;
  save(); closeModal(); toast('✅ تم حفظ بيانات التحليل — هتسمع في كل الحالات');
  if (typeof resPickPat === 'function') resPickPat();
}
/* ---------- كيرف منحنى اختبار تحمل الغلوكوز (SVG داخل التقرير — يطبع ويتعاين) ---------- */
function gttCurveSvg(fields, results) {
  const res = computeTestResults(fields, results);
  const pts = fields.map(f => ({ l: f[0], v: parseFloat(res[f[0]]) })).filter(p => !isNaN(p.v));
  if (pts.length < 2) return '';
  const W = 175, H = 62, P = 12;
  const vals = pts.map(p => p.v);
  let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  lo = Math.min(lo, 70) * 0.94; hi = Math.max(hi, 140) * 1.05;
  const X = i => W - P - i * (W - 2 * P) / (pts.length - 1); /* RTL: أول عينة على اليمين */
  const Y = v => P + (hi - v) / (hi - lo) * (H - 2 * P);
  let grid = '';
  [70, 100, 140].forEach(g => {
    if (g > lo && g < hi)
      grid += `<line x1="${P}" y1="${Y(g)}" x2="${W - P}" y2="${Y(g)}" stroke="#ddd" stroke-dasharray="3,3"/>` +
              `<text x="${P + 1}" y="${Y(g) - 1.2}" font-size="5.5" fill="#999">${g}</text>`;
  });
  const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) =>
    `<circle cx="${X(i)}" cy="${Y(p.v)}" r="2.2" fill="#0d1b3e"/>` +
    `<text x="${X(i)}" y="${Y(p.v) - 4}" font-size="6" font-weight="bold" text-anchor="middle" fill="#122a5c">${p.v}</text>` +
    `<text x="${X(i)}" y="${H - 1}" font-size="5.8" text-anchor="middle" fill="#555">${esc(p.l)}</text>`).join('');
  return `<svg width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2mm auto;background:#fbfcff;border:1px solid #dfe6f5;border-radius:2mm">${grid}<polyline points="${line}" fill="none" stroke="#1e5eff" stroke-width="1.4"/>${dots}</svg>`;
}
/* ---------- ترقيع تلقائي للكتالوج: معدلات ووحدات ومعادلات محسوبة ---------- */
/* بيشتغل بعد كل تحميل وبيملأ بس اللي فاضي — آمن ومتكرر */
const CATALOG_FIXES = [
  { re: /albumin\s*\/\s*creatinine ratio \(a\/c ?%\)/i,
    fields: [['Urine Albumin', 'mg/dl', '', ''], ['Urine Creatinine', 'mg/dl', '', ''], ['A/C %', '%', '', '30', '#0/#1*100']] },
  { re: /urine albumin\/creatinine ratio \(acr\)/i,
    fields: [['Urine Albumin', 'mg/dl', '', ''], ['Urine Creatinine', 'mg/dl', '', ''], ['ACR', 'mg/g', '', '30', '#0/#1*1000']] },
  { re: /^alb\/creat ratio$/i,
    fields: [['Urine Albumin', 'mg/dl', '', ''], ['Urine Creatinine', 'mg/dl', '', ''], ['Alb/Creat ratio', 'mg/g', '', '30', '#0/#1*1000']] },
  { re: /prothrombin time \(pt\)/i,
    fields: [['PT', 'sec', '11', '14'], ['Control', 'sec', '11', '13.5'], ['INR', '', '0.9', '1.1', '#0/#1']] },
  { re: /calcium\s*\/\s*creatinine\s*ratio/i,
    fields: [['Urine Calcium', 'mg/dl', '', ''], ['Urine Creatinine', 'mg/dl', '', ''], ['Ca/Cr ratio', 'mg/mg', '', '0.2', '#0/#1']] },
  { re: /glucose tolerance curve/i,
    cv: 1,
    fields: [['Fasting', 'mg/dl', '70', '100'], ['1/2 Hour', 'mg/dl', '', '170'], ['1 Hour', 'mg/dl', '', '185'], ['2 Hours', 'mg/dl', '', '140'], ['3 Hours', 'mg/dl', '70', '120']] },
];
function catalogFixes() {
  if (!DB || !DB.tests) return;
  let changed = false;
  CATALOG_FIXES.forEach(fx => {
    DB.tests.forEach(t => {
      if (!fx.re.test(t.name || '')) return;
      if (fx.cv) { if (!t.cv) { t.cv = 1; changed = true; } }
      if (!t.fields || !t.fields.length) { t.fields = fx.fields.map(f => [...f]); changed = true; }
    });
  });
  /* تحليل ناقص: Calcium / Creatinine ratio — بيضاف لو مش موجود أصلاً */
  const hasCaCr = DB.tests.some(t => /calcium.*creatinine.*ratio|ca\s*\/\s*cr/i.test(t.name || ''));
  if (!hasCaCr) {
    let mx = 0; DB.tests.forEach(t => { const m = /^t(\d+)$/.exec(t.id || ''); if (m) mx = Math.max(mx, +m[1]); });
    DB.tests.push({ id: 'yt_' + (mx + 1), name: 'Urine Calcium/Creatinine ratio (Ca/Cr)', price: 150, fields: [['Urine Calcium', 'mg/dl', '', ''], ['Urine Creatinine', 'mg/dl', '', ''], ['Ca/Cr ratio', 'mg/mg', '', '0.2', '#0/#1']], cat: 'كيميا وبايوكيميا' });
    changed = true;
  }
  if (changed) save();
}
/* ============================================================
   نظام الباركود (Code 39 — بدون مكتبات خارجية، SVG يطبع مباشرة)
   + إخفاء/إظهار التحليل من التقرير
   ============================================================ */
const BARCODE_MAP = {
  '0':'101001101101','1':'110100101011','2':'101100101011','3':'110110010101',
  '4':'101001101011','5':'110100110101','6':'101100110101','7':'101001011011',
  '8':'110100101101','9':'101100101101','A':'110101001011','B':'101101001011',
  'C':'110110100101','D':'101011001011','E':'110101100101','F':'101101100101',
  'G':'101010011011','H':'110101001101','I':'101101001101','J':'101011001101',
  'K':'110101010011','L':'101101010011','M':'110110101001','N':'101011010011',
  'O':'110101101001','P':'101101101001','Q':'101010110011','R':'110101011001',
  'S':'101101011001','T':'101011011001','U':'110010101011','V':'100110101011',
  'W':'110011010101','X':'100101101011','Y':'110010110101','Z':'100110110101',
  '-':'100101011011','.':'110010101101',' ':'100110101101','$':'100100100101',
  '/':'100100101001','+':'100101001001','%':'101001001001','*':'100101101101'
};
/* باركود SVG جاهز للطباعة — text: أرقام/حروف كابيتال */
function barcodeSvg(text, heightMm) {
  heightMm = heightMm || 12;
  const clean = String(text == null ? '' : text).toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '-');
  const full = '*' + clean + '*';
  const N = 0.33, W = N * 2.4, H = heightMm;
  let x = N, parts = [];
  for (const ch of full) {
    const pat = BARCODE_MAP[ch] || BARCODE_MAP['-'];
    let bar = true;
    for (const b of pat) {
      const wdt = b === '1' ? W : N;
      if (bar) parts.push(`<rect x="${x.toFixed(2)}" y="0" width="${wdt.toFixed(2)}" height="${H}"/>`);
      x += wdt; bar = !bar;
    }
    x += N;
  }
  const total = x + N;
  return `<svg width="${total.toFixed(1)}mm" height="${H}mm" viewBox="0 0 ${total.toFixed(1)} ${H}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">${parts.join('')}</svg>`;
}
/* طباعة ستيكر باركود الحالة (يلزق على العينة/الملف) */
function printVisitBarcode(id) {
  const v = DB.visits.find(x => x.id === id); if (!v) return;
  const p = patById(v.patientId);
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>باركود ${esc(v.invoiceNo)}</title>
  <style>
  *{box-sizing:border-box}
  body{font-family:Tahoma,Arial,sans-serif;margin:0;display:flex;justify-content:center;background:#fff}
  .lbl{width:64mm;border:1px dashed #bbb;border-radius:2mm;padding:3mm;margin:4mm;text-align:center;color:#000}
  .n{font-size:13px;font-weight:900}
  .d{font-size:10px;color:#333;margin-top:1mm}
  svg{margin:1.5mm auto 0.5mm}
  .code{font-size:12px;font-weight:900;letter-spacing:2px}
  @media print{@page{size:auto;margin:2mm}body{display:block}.lbl{border:none;margin:0 auto}}
  </style></head><body>
  <div class="lbl">
    <div class="n">${esc(p?.name || '')}</div>
    <div class="d">${esc(v.date)}${v.doctor ? ' — د. ' + esc(v.doctor) : ''}</div>
    ${barcodeSvg(String(v.invoiceNo), 13)}
    <div class="code num">${esc(v.invoiceNo)}</div>
  </div>
  <script>window.print()<\/script></body></html>`);
  w.document.close();
}
/* إخفاء/إظهار تحليل من التقرير الشامل */
function resToggleHidden(visitId, idx) {
  const v = DB.visits.find(x => x.id === visitId); const t = v && v.tests[idx];
  if (!t) return;
  t.hidden = !t.hidden;
  save(); resPickPat();
  toast(t.hidden ? '🚫 «' + (testById(t.testId)?.name || '') + '» مش هيظهر في التقرير الشامل' : '👁️ «' + (testById(t.testId)?.name || '') + '» هيرجع يظهر في التقرير');
}
