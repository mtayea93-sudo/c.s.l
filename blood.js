/* ============================================================
   🩸 بنك الدم — وحدة متكاملة داخل CSL
   البيانات جوه DB (DB.bloodDonors / DB.bloodDonations) — المزامنة
   السحابية شغالة عليها تلقائياً زي باقي بيانات المعمل.
   الحالات اللي بتتسجل ليها فصيلة دم / ABO Group / Rh Grouping
   في الاستقبال بتتسجل هنا كمتبرعين تلقائياً.
   ============================================================ */

/* ---------- أدوات مساعدة ---------- */
function bloodEnsure() {
  DB.bloodDonors = Array.isArray(DB.bloodDonors) ? DB.bloodDonors : [];
  DB.bloodDonations = Array.isArray(DB.bloodDonations) ? DB.bloodDonations : [];
}
/* تحاليل فصيلة الدم — بدقة عشان متلقطش Rh C/D/E أو غيرها */
function bloodTestHit(name) {
  return /فصيلة\s*دم|فصيلة\s*الدم|abo\s*group|blood\s*group|rh\s*group|rh\s*blood|rh\s*typing/i.test(name || '');
}
/* استخراج الفصيلة من نتيجة نصية: O+ / A- / AB+ ... */
function bloodParseType(text) {
  if (!text) return '';
  const m = String(text).match(/\b(AB|A|B|O)\s*(\+|-|pos|neg|positive|negative|موجب|سالب)/i);
  if (!m) return '';
  const sign = /pos|\+|موجب|positive/i.test(m[2]) ? '+' : '-';
  return m[1].toUpperCase() + sign;
}
function bloodTypeClass(t) {
  return { 'A+': 'blood-a-pos', 'A-': 'blood-a-neg', 'B+': 'blood-b-pos', 'B-': 'blood-b-neg', 'AB+': 'blood-ab-pos', 'AB-': 'blood-ab-neg', 'O+': 'blood-o-pos', 'O-': 'blood-o-neg' }[t] || '';
}
/* آخر تبرع للمتبرع (من سجل التبرعات، أو الخانة الاحتياطية القديمة) */
function bloodLastDate(d) {
  const ds = (DB.bloodDonations || []).filter(x => x.donorId === d.id).map(x => x.date).sort();
  if (ds.length) return ds[ds.length - 1];
  return d.lastDonation || '';
}
function bloodEligibleOn(d) {
  const last = bloodLastDate(d);
  if (!last) return true;
  return (Date.now() - new Date(last).getTime()) >= 90 * 24 * 3600 * 1000;
}
function bloodDaysSince(d) {
  const last = bloodLastDate(d);
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
}
function bloodDonorCount(d) {
  return (DB.bloodDonations || []).filter(x => x.donorId === d.id).length;
}
/* عدد أيام من تاريخ YYYY-MM-DD */
function bloodAgeDays(dt) {
  if (!dt) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dt);
  if (!m) return null;
  return Math.floor((Date.now() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000);
}
function bloodUid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e4); }

/* ---------- التسجيل التلقائي من الاستقبال ---------- */
/* بيتنده من recSave — لازم تتنده قبل save() */
function bloodAutoFromVisit(v) {
  bloodEnsure();
  let hits = 0;
  (v.tests || []).forEach(t => {
    const tst = testById(t.testId);
    if (!tst || !bloodTestHit(tst.name)) return;
    const pat = patById(v.patientId);
    if (!pat) return;
    /* دور على الفصيلة في نتائج التحليل لو متحطت */
    let parsed = '';
    const res = t.results || {};
    for (const k in res) { parsed = bloodParseType(res[k]); if (parsed) break; }
    if (!parsed) parsed = bloodParseType(tst.name);
    const nat = (pat.nationalId || '').trim();
    let d = DB.bloodDonors.find(x => (pat.id && x.patientId === pat.id) || (nat && x.nationalId === nat));
    if (d) {
      if (parsed && !d.bloodType) { d.bloodType = parsed; hits++; }
      d.lastVisitId = v.id;
    } else {
      DB.bloodDonors.push({
        id: bloodUid('bd'), patientId: pat.id || '', source: 'csl',
        name: pat.name || '', nationalId: nat, phone: pat.phone || '',
        bloodType: parsed, birthDate: pat.dob || '', address: pat.address || '',
        lastDonation: '', lastVisitId: v.id, registeredAt: new Date().toISOString()
      });
      hits++;
    }
  });
  return hits;
}

/* فحص الحالات القديمة (زيارة زرار في صفحة بنك الدم) */
function bloodScanOld() {
  bloodEnsure();
  let hits = 0;
  (DB.visits || []).forEach(v => { hits += bloodAutoFromVisit(v); });
  save();
  renderBlood();
  toast(hits ? '🩸 اتسجل ' + hits + ' متبرع من الحالات' : '✅ كل الحالات اللي عليها فصيلة دم متسجلة بالفعل');
}

/* ============================================================
   الصفحة الرئيسية
   ============================================================ */
let bloodTab = 'donors';
let bloodNeedType = '';
function goBlood(tab) { bloodTab = tab; renderBlood(); }

function renderBlood() {
  bloodEnsure();
  const tabs = [
    ['donors', '📋 المتبرعون'], ['new', '➕ تسجيل متبرع'], ['donations', '🩸 سجل التبرعات'],
    ['need', '📣 مطلوب متبرعون'], ['stats', '📊 الإحصائيات']
  ];
  const body = `
  <div class="blood-tabs">
    ${tabs.map(t => `<button class="blood-tab ${bloodTab === t[0] ? 'on' : ''}" onclick="goBlood('${t[0]}')">${t[1]}</button>`).join('')}
  </div>
  <div id="blood-body">${bloodBody()}</div>`;
  shell('🩸 بنك الدم', body);
  bloodAfterRender();
}

function bloodBody() {
  bloodEnsure();
  if (bloodTab === 'donors') return bloodDonorsHtml();
  if (bloodTab === 'new') return bloodNewHtml();
  if (bloodTab === 'donations') return bloodDonationsHtml();
  if (bloodTab === 'need') return bloodNeedHtml();
  if (bloodTab === 'stats') return bloodStatsHtml();
  return '';
}

/* ---------- تبويب: المتبرعون ---------- */
function bloodDonorsHtml() {
  const ds = DB.bloodDonors;
  const eligible = ds.filter(bloodEligibleOn).length;
  /* تنبيهات: مؤهل من فترة ومحدش كلمه */
  const overdue = ds.filter(d => {
    const days = bloodDaysSince(d);
    return days !== null && days >= 97 && bloodEligibleOn(d);
  }).sort((a, b) => bloodDaysSince(b) - bloodDaysSince(a));
  const pending = ds.filter(d => !d.bloodType).length;
  return `
  <div class="stats">
    <div class="stat"><div class="v">${ds.length}</div><div class="l">إجمالي المتبرعين</div></div>
    <div class="stat green"><div class="v">${eligible}</div><div class="l">مؤهل للتبرع دلوقتي</div></div>
    <div class="stat"><div class="v">${ds.length - eligible}</div><div class="l">لسه باقي عليه أيام</div></div>
    <div class="stat"><div class="v">${DB.bloodDonations.length}</div><div class="l">عملية تبرع مسجلة</div></div>
  </div>
  ${overdue.length ? `<div class="card" style="border-color:#f0c36d;background:#fffcf3">
    <h3 style="margin-bottom:10px;color:#8a6d1a">🔔 متأخرين عن التبرع (مؤهلين من فترة — اتصل بيهم)</h3>
    <table><tr><th>الاسم</th><th>الفصيلة</th><th>آخر تبرع</th><th></th></tr>
    ${overdue.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${bloodBadge(d.bloodType)}</td>
      <td>منذ ${bloodDaysSince(d)} يوم</td>
      <td>${d.phone ? `<a class="btn btn-p" style="padding:6px 14px;font-size:13px" href="tel:${esc(d.phone)}">📞 اتصال</a>` : '-'}</td></tr>`).join('')}
    </table></div>` : ''}
  <div class="card">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
      <input class="inp" id="blood-q" placeholder="🔍 ابحث بالاسم / التليفون / الرقم القومي / الفصيلة..." style="flex:1;min-width:220px" oninput="bloodRenderTable()">
      <button class="btn btn-o" onclick="bloodScanOld()">⚡ سحب المتبرعين من الحالات القديمة</button>
      <button class="btn btn-o" onclick="bloodExportCsv()">📥 Excel</button>
      <label class="btn btn-o" style="margin:0">📤 استيراد<input type="file" accept=".json" style="display:none" onchange="bloodImportJson(event)"></label>
    </div>
    <div id="blood-tbl">${bloodDonorsTable(ds)}</div>
  </div>`;
}
function bloodBadge(t) {
  return t ? `<span class="blood-type ${bloodTypeClass(t)}">${esc(t)}</span>` : '<span style="color:#999">—</span>';
}
function bloodDonorsTable(list) {
  if (!list.length) return '<div class="empty">لا يوجد متبرعون — سجل أول متبرع من تبويب «➕ تسجيل متبرع» أو هتسجل تلقائياً من أي حالة عليها فصيلة دم في الاستقبال</div>';
  return `<table><tr><th>#</th><th>الاسم</th><th>الفصيلة</th><th>التليفون</th><th>آخر تبرع</th><th>الحالة</th><th>إجراءات</th></tr>
  ${list.map((d, i) => {
    const days = bloodDaysSince(d);
    const elig = bloodEligibleOn(d);
    const src = d.source === 'csl' ? '<span title="اتسجل تلقائياً من الاستقبال" style="font-size:11px;color:#0fa08c">☁️</span> ' : '';
    return `<tr>
      <td class="num">${i + 1}</td>
      <td>${src}<b>${esc(d.name)}</b>${d.nationalId ? `<br><small style="color:var(--mut)">${esc(d.nationalId)}</small>` : ''}</td>
      <td>${bloodBadge(d.bloodType)}</td>
      <td class="num" dir="ltr">${esc(d.phone || '—')}</td>
      <td>${days === null ? '<span style="color:#999">لم يتبرع بعد</span>' : `منذ ${days} يوم`}</td>
      <td>${elig ? '<span style="color:#219a52;font-weight:700">✅ مؤهل</span>' : `<span style="color:#e74c3c;font-weight:700">⛔ بعد ${97 - days} يوم</span>`}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-p" style="padding:5px 12px;font-size:12.5px" onclick="bloodDonateModal('${d.id}')">🩸 تبرع</button>
        <button class="btn btn-o" style="padding:5px 12px;font-size:12.5px" onclick="bloodCard('${d.id}')">🪪</button>
        <button class="btn btn-o" style="padding:5px 12px;font-size:12.5px" onclick="bloodEditModal('${d.id}')">✏️</button>
        <button class="btn" style="padding:5px 12px;font-size:12.5px;background:#e74c3c" onclick="bloodDelDonor('${d.id}')">🗑️</button>
      </td></tr>`;
  }).join('')}</table>`;
}
function bloodRenderTable() {
  const q = ($('#blood-q')?.value || '').trim().toLowerCase();
  bloodEnsure();
  const list = !q ? DB.bloodDonors : DB.bloodDonors.filter(d =>
    (d.name || '').toLowerCase().includes(q) || (d.phone || '').includes(q) ||
    (d.nationalId || '').includes(q) || (d.bloodType || '').toLowerCase() === q);
  const el = $('#blood-tbl'); if (el) el.innerHTML = bloodDonorsTable(list);
}

/* ---------- تبويب: تسجيل متبرع جديد ---------- */
function bloodNewHtml(prefill) {
  const d = prefill || {};
  return `<div class="card" style="max-width:640px">
    <div class="field"><label>الاسم الكامل *</label><input class="inp" id="bd-name" value="${esc(d.name || '')}"></div>
    <div class="grid2">
      <div class="field"><label>الرقم القومي (14 رقم)</label><input class="inp num" id="bd-nid" maxlength="14" value="${esc(d.nationalId || '')}" oninput="this.value=this.value.replace(/\\D/g,'')"></div>
      <div class="field"><label>رقم التليفون *</label><input class="inp num" id="bd-phone" dir="ltr" value="${esc(d.phone || '')}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>فصيلة الدم</label><select class="inp" id="bd-type">
        <option value="">— مش معروفة —</option>
        ${['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => `<option ${d.bloodType === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select></div>
      <div class="field"><label>تاريخ الميلاد</label><input class="inp" type="date" id="bd-dob" value="${esc(d.birthDate || '')}"></div>
    </div>
    <div class="field"><label>العنوان</label><input class="inp" id="bd-addr" value="${esc(d.address || '')}"></div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-p" onclick="bloodSaveDonor('')">💾 حفظ المتبرع</button>
      <button class="btn btn-o" onclick="goBlood('donors')">↩️ رجوع للقائمة</button>
    </div>
  </div>`;
}
function bloodSaveDonor(id) {
  if (roBlocked()) return;
  const name = $('#bd-name').value.trim();
  const phone = $('#bd-phone').value.trim();
  const nid = $('#bd-nid').value.trim();
  if (!name) return toast('⚠️ الاسم مطلوب');
  if (!phone) return toast('⚠️ رقم التليفون مطلوب');
  if (nid && nid.length !== 14) return toast('⚠️ الرقم القومي لازم 14 رقم');
  bloodEnsure();
  if (!id && nid && DB.bloodDonors.find(d => d.nationalId === nid)) return toast('⚠️ الرقم القومي مسجل قبل كده — دوّر عليه في القائمة');
  const rec = {
    name, phone, nationalId: nid,
    bloodType: $('#bd-type').value, birthDate: $('#bd-dob').value, address: $('#bd-addr').value.trim()
  };
  if (id) {
    const d = DB.bloodDonors.find(x => x.id === id); if (!d) return;
    Object.assign(d, rec);
    closeModal();
    toast('✅ تم تحديث بيانات المتبرع');
  } else {
    DB.bloodDonors.push({ id: bloodUid('bd'), source: 'manual', patientId: '', lastDonation: '', registeredAt: new Date().toISOString(), ...rec });
    toast('✅ تم تسجيل المتبرع');
  }
  save();
  bloodTab = 'donors'; renderBlood();
}
function bloodEditModal(id) {
  if (roBlocked()) return;
  bloodEnsure();
  const d = DB.bloodDonors.find(x => x.id === id); if (!d) return;
  modal(`<h3 style="margin-bottom:14px">✏️ تعديل متبرع — ${esc(d.name)}</h3>
    <div id="bd-edit">${bloodNewHtml(d)}</div>
    <div style="display:flex;gap:10px;margin-top:6px">
      <button class="btn btn-p" onclick="bloodSaveDonor('${d.id}')">💾 حفظ التعديلات</button>
      <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
    </div>`);
}
function bloodDelDonor(id) {
  if (roBlocked()) return;
  bloodEnsure();
  const d = DB.bloodDonors.find(x => x.id === id); if (!d) return;
  if (!confirm(`حذف المتبرع «${d.name}» وسجل تبرعاته؟`)) return;
  DB.bloodDonors = DB.bloodDonors.filter(x => x.id !== id);
  DB.bloodDonations = DB.bloodDonations.filter(x => x.donorId !== id);
  save(); renderBlood();
  toast('🗑️ تم الحذف');
}

/* ---------- تسجيل عملية تبرع ---------- */
function bloodDonateModal(donorId) {
  if (roBlocked()) return;
  bloodEnsure();
  const d = DB.bloodDonors.find(x => x.id === donorId); if (!d) return;
  modal(`<h3 style="margin-bottom:4px">🩸 تسجيل تبرع — ${esc(d.name)}</h3>
    <div class="hint">الفصيلة: ${d.bloodType || 'غير محددة'} — آخر تبرع: ${bloodLastDate(d) || 'لا يوجد'} — ${bloodEligibleOn(d) ? '✅ مؤهل' : '⛔ مش مؤهل لسه'}</div>
    <div class="grid2">
      <div class="field"><label>تاريخ التبرع *</label><input class="inp" type="date" id="dn-date" value="${today()}"></div>
      <div class="field"><label>الكمية (وحدة) *</label><input class="inp num" id="dn-qty" type="number" min="0.5" step="0.5" value="1"></div>
    </div>
    <div class="field"><label>المكان</label><input class="inp" id="dn-place" placeholder="اسم بنك الدم / المستشفى"></div>
    <div class="field"><label>ملاحظات</label><input class="inp" id="dn-notes"></div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-p" onclick="bloodSaveDonation('${d.id}')">💾 حفظ التبرع</button>
      <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
    </div>`);
}
function bloodSaveDonation(donorId) {
  if (roBlocked()) return;
  const date = $('#dn-date').value;
  const qty = +$('#dn-qty').value;
  if (!date) return toast('⚠️ التاريخ مطلوب');
  if (!qty || qty <= 0) return toast('⚠️ الكمية غير صحيحة');
  const last = bloodLastDate(DB.bloodDonors.find(x => x.id === donorId) || {});
  if (last && date <= last) { if (!confirm('التاريخ ده قبل آخر تبرع — متأكد؟')) return; }
  bloodEnsure();
  DB.bloodDonations.push({
    id: bloodUid('dn'), donorId, date, qty,
    place: $('#dn-place').value.trim(), notes: $('#dn-notes').value.trim(),
    createdAt: new Date().toISOString(), createdBy: (session() || {}).name || ''
  });
  save(); closeModal(); renderBlood();
  toast('🩸 تم تسجيل التبرع بنجاح');
}

/* ---------- تبويب: سجل التبرعات ---------- */
function bloodDonationsHtml() {
  bloodEnsure();
  const ds = [...DB.bloodDonations].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const totalQty = DB.bloodDonations.reduce((a, x) => a + (+x.qty || 0), 0);
  return `<div class="stats">
      <div class="stat"><div class="v">${DB.bloodDonations.length}</div><div class="l">عملية تبرع</div></div>
      <div class="stat green"><div class="v">${totalQty}</div><div class="l">إجمالي الوحدات</div></div>
      <div class="stat"><div class="v">${DB.bloodDonations.filter(x => x.date.slice(0, 7) === today().slice(0, 7)).length}</div><div class="l">هذا الشهر</div></div>
    </div>
    <div class="card">
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <input class="inp" id="dn-q" placeholder="🔍 ابحث بالاسم..." style="flex:1;min-width:200px" oninput="bloodRenderDonations()">
      <button class="btn btn-o" onclick="bloodExportCsv(true)">📥 Excel</button>
      <button class="btn btn-o" onclick="bloodReportModal()">🖨️ تقرير</button>
    </div>
    <div id="dn-tbl">${bloodDonationsTable(ds)}</div></div>`;
}
function bloodDonationsTable(list) {
  if (!list.length) return '<div class="empty">لا توجد عمليات تبرع مسجلة — سجل أول تبرع من زرار «🩸 تبرع» جنب اسم المتبرع</div>';
  return `<table><tr><th>#</th><th>التاريخ</th><th>المتبرع</th><th>الفصيلة</th><th>الكمية</th><th>المكان</th><th>ملاحظات</th><th></th></tr>
  ${list.map((x, i) => {
    const d = DB.bloodDonors.find(z => z.id === x.donorId);
    return `<tr><td class="num">${i + 1}</td><td class="num">${esc(x.date)}</td>
      <td><b>${esc(d ? d.name : 'محذوف')}</b></td><td>${d ? bloodBadge(d.bloodType) : '—'}</td>
      <td class="num">${x.qty} وحدة</td><td>${esc(x.place || '—')}</td><td>${esc(x.notes || '')}</td>
      <td><button class="btn" style="padding:5px 12px;font-size:12.5px;background:#e74c3c" onclick="bloodDelDonation('${x.id}')">🗑️</button></td></tr>`;
  }).join('')}</table>`;
}
function bloodRenderDonations() {
  const q = ($('#dn-q')?.value || '').trim().toLowerCase();
  bloodEnsure();
  const ds = [...DB.bloodDonations].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
    .filter(x => { const d = DB.bloodDonors.find(z => z.id === x.donorId); return !q || (d && d.name.toLowerCase().includes(q)); });
  const el = $('#dn-tbl'); if (el) el.innerHTML = bloodDonationsTable(ds);
}
function bloodDelDonation(id) {
  if (roBlocked()) return;
  if (!confirm('حذف عملية التبرع دي؟')) return;
  bloodEnsure();
  DB.bloodDonations = DB.bloodDonations.filter(x => x.id !== id);
  save(); renderBlood(); toast('🗑️ تم الحذف');
}

/* ---------- تبويب: مطلوب متبرعون ---------- */
function bloodNeedHtml() {
  bloodEnsure();
  const t = bloodNeedType;
  let list = [], ineligible = [];
  if (t) {
    list = DB.bloodDonors.filter(d => d.bloodType === t);
    ineligible = list.filter(d => !bloodEligibleOn(d));
    list = list.filter(bloodEligibleOn)
      .sort((a, b) => (bloodDaysSince(a) ?? -1) - (bloodDaysSince(b) ?? -1)); /* الأقدم تبرعاً = الأولوية */
  }
  return `<div class="card" style="max-width:720px">
    <div class="field"><label>📣 فصيلة مطلوبة</label>
      <select class="inp" onchange="bloodNeedType=this.value;renderBlood()">
        <option value="">— اختر الفصيلة —</option>
        ${['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(x => `<option ${t === x ? 'selected' : ''}>${x}</option>`).join('')}
      </select></div>
    ${!t ? '<div class="empty">اختر الفصيلة المطلوبة وهيطلعلك كل المؤهلين فوراً</div>' : ''}
    ${t && !list.length ? '<div class="empty">لا يوجد متبرعون مؤهلون لهذه الفصيلة حالياً</div>' : ''}
    ${t && list.length ? `
      <div class="hint ok">✅ فيه ${list.length} متبرع مؤهل — مرتبين بالأولوية (الأقدم تبرعاً الأول)
        <button class="btn btn-o" style="padding:4px 14px;font-size:12.5px;margin-right:10px" onclick="bloodNeedPrint()">🖨️ طباعة القائمة</button></div>
      <table><tr><th>#</th><th>الاسم</th><th>آخر تبرع</th><th>التليفون</th><th></th></tr>
      ${list.map((d, i) => `<tr>
        <td class="num">${i + 1}</td><td><b>${esc(d.name)}</b></td>
        <td>${bloodDaysSince(d) === null ? 'لم يتبرع' : 'منذ ' + bloodDaysSince(d) + ' يوم'}</td>
        <td class="num" dir="ltr">${esc(d.phone || '—')}</td>
        <td>${d.phone ? `<a class="btn btn-p" style="padding:6px 14px;font-size:13px" href="tel:${esc(d.phone)}">📞 اتصال</a>` : '-'}</td>
      </tr>`).join('')}</table>
      ${ineligible.length ? `<div class="hint" style="margin-top:12px">⏳ ${ineligible.length} متبرع تانيين من نفس الفصيلة بس لسه باقي عليهم أيام لحد ما يتأهلوا</div>` : ''}
    ` : ''}
  </div>`;
}

/* ---------- تبويب: الإحصائيات ---------- */
function bloodStatsHtml() {
  bloodEnsure();
  /* تبرعات آخر 12 شهر */
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleDateString('ar-EG', { month: 'short' }) });
  }
  const perMonth = months.map(m => DB.bloodDonations.filter(x => x.date.slice(0, 7) === m.key).reduce((a, x) => a + (+x.qty || 0), 0));
  const maxM = Math.max(1, ...perMonth);
  const byType = {};
  DB.bloodDonors.forEach(d => { if (d.bloodType) byType[d.bloodType] = (byType[d.bloodType] || 0) + 1; });
  const top = [...DB.bloodDonations].map(x => ({ x, d: DB.bloodDonors.find(z => z.id === x.donorId) }))
    .filter(o => o.d);
  const counts = {};
  top.forEach(o => { counts[o.d.id] = (counts[o.d.id] || 0) + 1; });
  const heroes = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, n]) => ({ d: DB.bloodDonors.find(z => z.id === id), n }));
  return `<div class="stats">
      <div class="stat green"><div class="v">${DB.bloodDonors.filter(bloodEligibleOn).length}</div><div class="l">مؤهل الآن</div></div>
      <div class="stat"><div class="v">${DB.bloodDonations.reduce((a, x) => a + (+x.qty || 0), 0)}</div><div class="l">وحدة دم منذ البداية</div></div>
      <div class="stat"><div class="v">${DB.bloodDonations.filter(x => x.date.slice(0, 7) === today().slice(0, 7)).length}</div><div class="l">تبرع هذا الشهر</div></div>
    </div>
    <div class="card"><h3 style="margin-bottom:12px">📊 التبرعات آخر 12 شهر (وحدات)</h3>
      <div class="blood-chart">${months.map((m, i) => `
        <div class="blood-col" title="${m.key}: ${perMonth[i]} وحدة">
          <div class="blood-bar" style="height:${Math.round(perMonth[i] / maxM * 100)}%"></div>
          <span>${m.label}</span><b>${perMonth[i] || ''}</b>
        </div>`).join('')}</div>
    </div>
    <div class="grid2">
      <div class="card"><h3 style="margin-bottom:12px">🧬 المتبرعون حسب الفصيلة</h3>
        <table><tr><th>الفصيلة</th><th>عدد المتبرعين</th></tr>
        ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<tr><td>${bloodBadge(t)}</td><td class="num">${n}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">لا يوجد</td></tr>'}
        </table></div>
      <div class="card"><h3 style="margin-bottom:12px">🏆 أنشط المتبرعين</h3>
        <table><tr><th>#</th><th>الاسم</th><th>عدد التبرعات</th></tr>
        ${heroes.map((h, i) => `<tr><td class="num">${i + 1}</td><td>${esc(h.d.name)} ${bloodBadge(h.d.bloodType)}</td><td class="num">${h.n}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">لا يوجد</td></tr>'}
        </table></div>
    </div>`;
}

/* ---------- كارت المتبرع (طباعة) ---------- */
function bloodCard(id) {
  bloodEnsure();
  const d = DB.bloodDonors.find(x => x.id === id); if (!d) return;
  const w = window.open('', '_blank', 'width=420,height=600');
  if (!w) return toast('⚠️ اسمح بالنوافذ المنبثقة عشان تطبع الكارت');
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>كارت متبرع</title>
  <style>body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f5f5f5;display:flex;justify-content:center;padding:30px}
  .card{width:340px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.15);border:1px solid #eee}
  .head{background:linear-gradient(135deg,#e74c3c,#8e44ad);color:#fff;padding:22px;text-align:center}
  .head h1{margin:0;font-size:1.3rem}.head p{opacity:.85;font-size:.85rem;margin-top:4px}
  .body{padding:22px}.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px dashed #eee;font-size:.95rem}
  .row b{color:#c0392b}.type{display:inline-block;background:#e8f5e9;color:#2e7d32;padding:4px 16px;border-radius:20px;font-weight:800;font-size:1.2rem}
  .foot{text-align:center;color:#999;font-size:.75rem;padding:14px}</style></head><body>
  <div class="card"><div class="head"><h1>🩸 كارت متبرع دم</h1><p>${esc(DB.lab.name || '')}</p></div>
  <div class="body">
    <div class="row"><span>الاسم</span><b>${esc(d.name)}</b></div>
    <div class="row"><span>الفصيلة</span><span class="type">${esc(d.bloodType || '—')}</span></div>
    <div class="row"><span>آخر تبرع</span><b>${bloodLastDate(d) || '—'}</b></div>
    <div class="row"><span>عدد مرات التبرع</span><b>${bloodDonorCount(d)}</b></div>
    <div class="row"><span>الحالة</span><b>${bloodEligibleOn(d) ? '✅ مؤهل للتبرع' : '⛔ غير مؤهل حالياً'}</b></div>
  </div><div class="foot">صدر من نظام CSL — csl.mtayea.com</div></div>
  <script>setTimeout(()=>print(),400)<\/script></body></html>`);
  w.document.close();
}

/* ---------- تصدير / استيراد ---------- */
function bloodExportCsv(donationsOnly) {
  bloodEnsure();
  let rows, name;
  if (donationsOnly) {
    name = 'blood-donations-' + today() + '.csv';
    rows = [['التاريخ', 'المتبرع', 'الفصيلة', 'الكمية', 'المكان', 'ملاحظات']];
    [...DB.bloodDonations].sort((a, b) => b.date.localeCompare(a.date)).forEach(x => {
      const d = DB.bloodDonors.find(z => z.id === x.donorId);
      rows.push([x.date, d ? d.name : '', d ? d.bloodType : '', x.qty, x.place || '', x.notes || '']);
    });
  } else {
    name = 'blood-donors-' + today() + '.csv';
    rows = [['الاسم', 'الرقم القومي', 'التليفون', 'الفصيلة', 'آخر تبرع', 'عدد مرات التبرع', 'الحالة', 'المصدر']];
    DB.bloodDonors.forEach(d => rows.push([d.name, d.nationalId || '', d.phone || '', d.bloodType || '',
      bloodLastDate(d), bloodDonorCount(d), bloodEligibleOn(d) ? 'مؤهل' : 'غير مؤهل', d.source === 'csl' ? 'من الاستقبال' : 'يدوي']));
  }
  const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
  toast('📥 تم التصدير — بيفتح في Excel على طول');
}
function bloodImportJson(ev) {
  if (roBlocked()) return;
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('ملف غير صالح');
      bloodEnsure();
      let added = 0;
      data.forEach(x => {
        if (!x || !x.name) return;
        const nid = (x.nationalId || '').trim();
        if (nid && DB.bloodDonors.find(d => d.nationalId === nid)) return;
        DB.bloodDonors.push({
          id: bloodUid('bd'), patientId: x.patientId || '', source: x.source || 'import',
          name: String(x.name), nationalId: nid, phone: x.phone || '', bloodType: x.bloodType || '',
          birthDate: x.birthDate || '', address: x.address || '', lastDonation: x.lastDonation || '',
          registeredAt: new Date().toISOString()
        });
        added++;
      });
      save(); renderBlood();
      toast('📤 تم استيراد ' + added + ' متبرع');
    } catch (err) { alert('❌ ملف غير صالح: ' + err.message); }
  };
  r.readAsText(f); ev.target.value = '';
}

/* ---------- تقرير التبرعات (يومي / شهري / فترة) — للطباعة ---------- */
function bloodReportModal() {
  const m = today().slice(0, 7);
  modal(`<h3 style="margin-bottom:14px">🖨️ تقرير التبرعات</h3>
    <div class="grid2">
      <div class="field"><label>من تاريخ</label><input class="inp" type="date" id="br-from" value="${m}-01"></div>
      <div class="field"><label>إلى تاريخ</label><input class="inp" type="date" id="br-to" value="${today()}"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">
      <button class="btn btn-o" style="padding:8px 16px;font-size:13px" onclick="bloodReport('day')">📅 اليوم</button>
      <button class="btn btn-o" style="padding:8px 16px;font-size:13px" onclick="bloodReport('month')">🗓️ هذا الشهر</button>
      <button class="btn btn-o" style="padding:8px 16px;font-size:13px" onclick="bloodReport('all')">📊 كل الفترات</button>
      <button class="btn btn-p" onclick="bloodReport('range')">🖨️ طباعة الفترة المختارة</button>
    </div>`);
}
function bloodPrintDoc(title, inner) {
  const w = window.open('', '_blank', 'width=800,height=700');
  if (!w) return toast('⚠️ اسمح بالنوافذ المنبثقة عشان تطبع');
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title>
  <style>body{font-family:'Segoe UI',Tahoma,sans-serif;padding:26px;color:#222}
  h1{font-size:1.2rem;margin:0 0 4px}.sub{color:#777;font-size:.85rem;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  th,td{padding:9px 10px;border-bottom:1px solid #eee;text-align:right}
  th{background:#c0392b;color:#fff}
  .sum{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}
  .box{border:1px solid #eee;border-radius:10px;padding:12px 20px;text-align:center}
  .box b{display:block;font-size:1.4rem;color:#c0392b}
  .foot{margin-top:22px;text-align:center;color:#aaa;font-size:.75rem}
  @media print{button{display:none}}</style></head><body>
  <h1>🩸 ${title}</h1><div class="sub">${esc(DB.lab.name || '')} — نظام CSL — ${new Date().toLocaleDateString('ar-EG')}</div>
  ${inner}
  <div class="foot">صدر من نظام CSL — csl.mtayea.com</div>
  <script>setTimeout(()=>print(),400)<\/script></body></html>`);
  w.document.close();
}
function bloodReport(mode) {
  bloodEnsure();
  const t = today();
  let from = '0000-01-01', to = '9999-12-31', label = 'كل الفترات';
  if (mode === 'day') { from = to = t; label = 'تقرير يوم ' + t; }
  if (mode === 'month') { from = t.slice(0, 7) + '-01'; to = t; label = 'تقرير شهر ' + t.slice(0, 7); }
  if (mode === 'range') {
    from = $('#br-from').value || from; to = $('#br-to').value || to;
    label = 'تقرير الفترة من ' + from + ' إلى ' + to;
  }
  const list = [...DB.bloodDonations].filter(x => x.date >= from && x.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const units = list.reduce((a, x) => a + (+x.qty || 0), 0);
  const donors = new Set(list.map(x => x.donorId)).size;
  const byType = {};
  list.forEach(x => { const d = DB.bloodDonors.find(z => z.id === x.donorId); const tp = d ? d.bloodType : '?'; byType[tp] = (byType[tp] || 0) + (+x.qty || 0); });
  closeModal();
  if (!list.length) return toast('مفيش تبرعات في الفترة دي');
  bloodPrintDoc(label, `
    <div class="sum">
      <div class="box"><b>${list.length}</b>عملية تبرع</div>
      <div class="box"><b>${units}</b>وحدة دم</div>
      <div class="box"><b>${donors}</b>متبرع</div>
    </div>
    <table><tr><th>#</th><th>التاريخ</th><th>المتبرع</th><th>الفصيلة</th><th>الكمية</th><th>المكان</th></tr>
    ${list.map((x, i) => { const d = DB.bloodDonors.find(z => z.id === x.donorId);
      return `<tr><td>${i + 1}</td><td>${esc(x.date)}</td><td>${esc(d ? d.name : 'محذوف')}</td><td>${esc(d ? d.bloodType || '—' : '—')}</td><td>${x.qty} وحدة</td><td>${esc(x.place || '—')}</td></tr>`; }).join('')}
    </table>
    <h3 style="margin:18px 0 8px">حسب الفصيلة</h3>
    <table><tr><th>الفصيلة</th><th>الوحدات</th></tr>
    ${Object.entries(byType).map(([tp, n]) => `<tr><td>${esc(tp)}</td><td>${n}</td></tr>`).join('')}
    </table>`);
}
function bloodNeedPrint() {
  bloodEnsure();
  const t = bloodNeedType;
  if (!t) return;
  const list = DB.bloodDonors.filter(d => d.bloodType === t && bloodEligibleOn(d))
    .sort((a, b) => (bloodDaysSince(a) ?? -1) - (bloodDaysSince(b) ?? -1));
  if (!list.length) return toast('مفيش متبرعين مؤهلين للفصيلة دي');
  bloodPrintDoc('مطلوب متبرعون — فصيلة ' + t, `
    <table><tr><th>#</th><th>الاسم</th><th>التليفون</th><th>آخر تبرع</th></tr>
    ${list.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.name)}</td><td dir="ltr">${esc(d.phone || '—')}</td><td>${bloodDaysSince(d) === null ? 'لم يتبرع' : 'منذ ' + bloodDaysSince(d) + ' يوم'}</td></tr>`).join('')}
    </table>`);
}

/* ---------- ستايل الوحدة ---------- */
(function () {
  const st = document.createElement('style');
  st.textContent = `
  .blood-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .blood-tab{padding:9px 18px;border:1px solid var(--line);background:var(--card);border-radius:999px;cursor:pointer;font-family:inherit;font-size:14px;color:var(--mut)}
  .blood-tab.on{background:#c0392b;border-color:#c0392b;color:#fff;font-weight:700}
  .blood-type{display:inline-block;padding:4px 12px;border-radius:999px;font-weight:800;font-size:12.5px}
  .blood-a-pos{background:#e8f5e9;color:#2e7d32}.blood-a-neg{background:#ffebee;color:#c62828}
  .blood-b-pos{background:#e3f2fd;color:#1565c0}.blood-b-neg{background:#fff3e0;color:#ef6c00}
  .blood-ab-pos{background:#f3e5f5;color:#7b1fa2}.blood-ab-neg{background:#eceff1;color:#455a64}
  .blood-o-pos{background:#e0f7fa;color:#00838f}.blood-o-neg{background:#fce4ec;color:#ad1457}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
  @media(max-width:640px){.grid2{grid-template-columns:1fr}}
  .blood-chart{display:flex;align-items:flex-end;gap:8px;height:170px;padding:10px 4px 0}
  .blood-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px}
  .blood-bar{width:70%;max-width:34px;background:linear-gradient(180deg,#e74c3c,#8e44ad);border-radius:6px 6px 0 0;min-height:2px}
  .blood-col span{font-size:11px;color:var(--mut)}.blood-col b{font-size:11px;color:#c0392b}
  `;
  document.head.appendChild(st);
})();

function bloodAfterRender() { /* جاهز لأي تهيئة مستقبلية */ }
