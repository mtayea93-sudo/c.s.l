/* ============================================================
   «المعمل» — نظام المختبر الكامل داخل CSL
   استقبال / نتائج / إعدادات (تحاليل + باراميترات + عينات)
   بياناتها من YS (lab-data.js) وتعديلاتها بتتحفظ في DB.yset
   ============================================================ */
'use strict';
let lyTab = 'rec';

/* ---------- طبقة البيانات: الدمج بين المستورد والتعديلات المحلية ---------- */
function yset() {
  if (!DB.yset) DB.yset = { profiles: {}, tests: {}, samples: {}, pdetails: {}, ranges: {}, newProfiles: [], newTests: [], delProfiles: [] };
  return DB.yset;
}
const yGroupName = gid => (YS.groups.find(g => g.group_id === gid) || {}).group_name || '';
const yProfile = pid => {
  const o = yset().profiles[pid] || {};
  const base = YS.profiles.find(p => p.profile_id === pid) || yset().newProfiles.find(p => p.profile_id === pid) || {};
  return { ...base, ...o };
};
const yProfiles = () => {
  const del = yset().delProfiles;
  return [...YS.profiles.filter(p => !del.includes(p.profile_id) && !yset().newProfiles.find(n => n.profile_id === p.profile_id)), ...yset().newProfiles];
};
const yTest = tid => {
  const o = yset().tests[tid] || {};
  const base = YS.tests.find(t => t.test_id === tid) || yset().newTests.find(t => t.test_id === tid) || {};
  return { ...base, ...o };
};
const ySample = sc => (YS.samples.find(s => s.sample_code === sc) || {}).sample_name || '';
/* باراميترات التحليل — مع دعم البروفايلات الفرعية */
function yDetailRows(pid) {
  const ov = yset().pdetails[pid];
  let rows = ov !== undefined
    ? ov.map((tid, i) => ({ profile_id: pid, test_id: tid, is_profile: 0, test_ser: i + 1 }))
    : YS.details.filter(x => x.profile_id === pid).sort((a, b) => a.test_ser - b.test_ser);
  return rows.filter(r => r.is_profile === 0 || YS.profiles.some(p => p.profile_id === r.test_id));
}
/* شجرة عرض التقرير: [{head:اسم البروفايل} أو {t:باراميتر}] */
function yReportTree(pid, depth) {
  depth = depth || 0;
  const out = [];
  for (const r of yDetailRows(pid)) {
    if (r.is_profile === 1) {
      const sp = yProfile(r.test_id);
      out.push({ head: sp.report_name || sp.arabic_name || '' });
      out.push(...yReportTree(r.test_id, depth + 1));
      if (depth === 0) out.push({ headEnd: 1 });
    } else out.push({ t: yTest(r.test_id) });
  }
  return out;
}
const yRanges = tid => {
  const o = yset().ranges[tid];
  return o !== undefined ? o : YS.ranges.filter(r => r.test_id === tid);
};
/* المرجعية المناسبة: genderCode 1 ذكر / 2 أنثى / 0 كلا — العمر بالأيام */
function yRef(tid, genderCode, ageDays) {
  const rows = yRanges(tid).filter(r => (r.gender === 0 || r.gender === genderCode));
  if (!rows.length) return null;
  return rows.find(r => ageDays >= (r.age_from_days || 0) && ageDays <= (r.age_to_days || 999999))
      || rows.find(r => (r.age_from_days || 0) === 0 && (r.age_to_days || 999999) >= 999999)
      || rows[0];
}
const yGenders = ['👥 كلاهما', '♂ ذكر', '♀ أنثى'];
const yOps = ['بين', 'أقل من', 'أكبر من', 'أقل من أو يساوي', 'أكبر من أو يساوي'];
function yRefText(r) {
  if (!r) return '';
  if (r.text_value) return r.text_value;
  const f = r.normal_from ?? '', t = r.normal_to ?? '';
  if (r.operator === 1) return `< ${f}`;
  if (r.operator === 2) return `> ${f}`;
  if (r.operator === 3) return `≤ ${f}`;
  if (r.operator === 4) return `≥ ${f}`;
  if (f !== '' && t !== '') return `${f} - ${t}`;
  return f !== '' ? `${f}` : '';
}
function yFlag(val, r) {
  const n = parseFloat(val);
  if (val === '' || val == null || isNaN(n) || !r || r.text_value) return ['', ''];
  const f = parseFloat(r.normal_from), t = parseFloat(r.normal_to);
  let low = false, high = false;
  if (r.operator === 1 || r.operator === 3) { low = false; high = !isNaN(f) && n >= f; }
  else if (r.operator === 2 || r.operator === 4) { low = !isNaN(f) && n <= f; high = false; }
  else { low = !isNaN(f) && n < f; high = !isNaN(t) && n > t; }
  if (low) return ['L ↓', 'color:#c62828;font-weight:900'];
  if (high) return ['H ↑', 'color:#c62828;font-weight:900'];
  return ['', ''];
}
const yAgeDays = p => ((+p.ageY || 0) * 365) + ((+p.ageM || 0) * 30) + (+p.ageD || 0);
const yGenderCode = p => p.gender === 'أنثى' ? 2 : 1;

/* ---------- زيارات «المعمل» ---------- */
function yVisits() { if (!DB.yvisits) DB.yvisits = []; return DB.yvisits; }
function yPatients() { if (!DB.ypatients) DB.ypatients = []; return DB.ypatients; }
function yNextCode(kind) {
  if (!DB.seq.yvisit) DB.seq.yvisit = 100001;
  if (!DB.seq.ypatient) DB.seq.ypatient = 1;
  return kind === 'pat' ? ++DB.seq.ypatient : ++DB.seq.yvisit;
}

/* ============================================================
   الشاشة الرئيسية للتبويب
   ============================================================ */
function renderLabops(sub) {
  if (sub) lyTab = sub;
  if (!['rec', 'res', 'set'].includes(lyTab)) lyTab = 'rec';
  const tabs = [['rec', '🧾 استقبال'], ['res', '🧪 نتائج'], ['set', '⚙️ إعدادات المعمل']];
  shell('المعمل — نظام CSL', `
    <div class="ly-tabs">${tabs.map(t => `<button class="ly-tab ${lyTab === t[0] ? 'on' : ''}" onclick="go('labops/${t[0]}')">${t[1]}</button>`).join('')}</div>
    <div id="ly-body"></div>`);
  if (lyTab === 'rec') lyRenderRec();
  if (lyTab === 'res') lyRenderRes();
  if (lyTab === 'set') lyRenderSet();
}

/* ============================================================
   1) الاستقبال: بيانات المريض + الفحوصات + شريط الإجمالي
   ============================================================ */
let lyRecState = { patientId: null, pids: [], q: '', gid: 0, plan: 'أسعار أساسية', referrer: 'Self referral' };

function lyRenderRec() {
  const st = lyRecState;
  const p = st.patientId ? yPatients().find(x => x.id === st.patientId) : null;
  const profiles = yProfiles().filter(x =>
    (st.gid === 0 || x.group_id === st.gid) &&
    (!st.q || (x.arabic_name || '').includes(st.q) || (x.report_name || '').toLowerCase().includes(st.q.toLowerCase()) || (x.profile_name || '').toLowerCase().includes(st.q.toLowerCase()))
  ).slice(0, 60);
  const sel = st.pids.map(pid => yProfile(pid));
  const gross = sel.reduce((a, x) => a + (+x.price || 0), 0);
  const disc = +($('#ly-disc')?.value || 0);
  const paid = +($('#ly-paid')?.value || 0);
  const rem = gross - disc - paid;
  $('#ly-body').innerHTML = `
  <div class="ly-rec-grid">
    <div class="card">
      <h3>👤 بيانات المريض ${p ? `<span class="pill ok">كود: ${esc(p.code)}</span>` : '<span class="pill warn">مريض جديد</span>'}</h3>
      <div class="grid3">
        <div><label>اللقب</label><select id="ly-title" class="inp2">${['السيد', 'السيدة', 'الطفل', 'الطفلة'].map(t => `<option ${p?.title === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div style="grid-column:span 2"><label>اسم المريض</label><input id="ly-name" class="inp2" value="${esc(p?.name || '')}" placeholder="الاسم بالكامل"></div>
        <div><label>الجنس</label><select id="ly-gender" class="inp2">${['ذكر', 'أنثى'].map(g => `<option ${p?.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        <div><label>السن (سنوات)</label><input id="ly-agey" type="number" min="0" class="inp2" value="${p?.ageY ?? ''}" onchange="lyAgeDob('y')"></div>
        <div><label>شهر</label><input id="ly-agem" type="number" min="0" max="11" class="inp2" value="${p?.ageM ?? ''}" onchange="lyAgeDob('y')"></div>
        <div><label>يوم</label><input id="ly-aged" type="number" min="0" max="30" class="inp2" value="${p?.ageD ?? ''}" onchange="lyAgeDob('y')"></div>
        <div><label>تاريخ الميلاد</label><input id="ly-dob" type="date" class="inp2" value="${p?.dob || ''}" onchange="lyAgeDob('d')"></div>
        <div><label>الجنسية</label><input id="ly-nat" class="inp2" value="${esc(p?.nat || 'مصري')}"></div>
        <div><label>الرقم القومي</label><input id="ly-nid" class="inp2 num" value="${esc(p?.nid || '')}"></div>
        <div><label>التليفون</label><input id="ly-phone" class="inp2 num" value="${esc(p?.phone || '')}"></div>
        <div style="grid-column:span 2"><label>العنوان</label><input id="ly-addr" class="inp2" value="${esc(p?.addr || '')}"></div>
        <div><label>الطبيب المحيل</label><select id="ly-ref" class="inp2"><option>Self referral</option>${YS.referral.filter(r => r.visible !== 0).map(r => `<option ${st.referrer === r.name ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div><label>خطة الأسعار</label><select id="ly-plan" class="inp2">${YS.priceplans.filter(x => x.visible !== 0).map(x => `<option ${st.plan === x.rank_name ? 'selected' : ''}>${esc(x.rank_name)}</option>`).join('')}</select></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-g" onclick="lySavePatient()">💾 حفظ بيانات المريض</button>
        <button class="btn btn-o" onclick="lyNewPatient()">✨ مريض جديد</button>
        <button class="btn btn-o" onclick="lyPickPatient()">🔍 مرضى سابقون</button>
      </div>
    </div>
    <div class="card">
      <h3>🧪 الفحوصات المطلوبة <span class="pill">${sel.length}</span></h3>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <select class="inp2" style="max-width:180px" onchange="lyRecState.gid=+this.value;lyRenderRec()">
          <option value="0">كل المجموعات</option>
          ${YS.groups.filter(g => g.group_id !== 0).map(g => `<option value="${g.group_id}" ${st.gid === g.group_id ? 'selected' : ''}>${esc(g.group_name)}</option>`).join('')}
        </select>
        <input class="inp2" placeholder="🔍 بحث في التحاليل…" value="${esc(st.q)}" oninput="lyRecState.q=this.value;lyRenderRec();setTimeout(()=>{const el=document.querySelector('#ly-q');el&&el.focus();el&&el.setSelectionRange(el.value.length,el.value.length)},0)" id="ly-q">
      </div>
      <div class="ly-testlist">
        ${profiles.map(x => `<div class="ly-testrow ${st.pids.includes(x.profile_id) ? 'sel' : ''}" onclick="lyToggleTest(${x.profile_id})">
          <div class="ly-tr-name">${esc(x.arabic_name || x.report_name || x.profile_name)} <span class="en">${esc(x.report_name || '')}</span></div>
          <div class="num">${fmt(x.price || 0)}</div>
        </div>`).join('') || '<div class="mut" style="padding:14px;text-align:center">لا نتائج</div>'}
      </div>
      <div id="ly-sel">
        ${sel.map(x => `<div class="ly-selrow"><span>${esc(x.arabic_name || x.report_name || x.profile_name)}</span><b class="num">${fmt(x.price || 0)}</b><button class="icon-btn" onclick="lyToggleTest(${x.profile_id})">✕</button></div>`).join('')}
      </div>
      <div class="y-totalbar" style="margin-top:10px">
        <div class="yb b-total"><span>الإجمالي TOTAL</span><b>${fmt(gross)}</b></div>
        <div class="yb b-disc"><span>الخصم DISCOUNT</span><b><input id="ly-disc" type="number" min="0" class="ly-ybinp" value="${disc || ''}" oninput="lyCalc()"></b></div>
        <div class="yb b-paid"><span>المدفوع PAID</span><b><input id="ly-paid" type="number" min="0" class="ly-ybinp" value="${paid || ''}" oninput="lyCalc()"></b></div>
        <div class="yb b-rem"><span>المتبقي REM</span><b id="ly-rem">${fmt(rem)}</b></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-p" onclick="lySaveVisit()" ${p && sel.length ? '' : 'disabled'}>💾 حفظ الحالة</button>
        <button class="btn btn-g" onclick="lySaveVisit(true)" ${p && sel.length ? '' : 'disabled'}>🖨️ حفظ + إيصال</button>
      </div>
    </div>
  </div>`;
  const q = $('#ly-q'); if (q) { q.focus(); }
}
function lyCalc() {
  const gross = lyRecState.pids.reduce((a, pid) => a + (+yProfile(pid).price || 0), 0);
  const rem = gross - (+($('#ly-disc')?.value || 0)) - (+($('#ly-paid')?.value || 0));
  const el = $('#ly-rem'); if (el) el.textContent = fmt(rem);
}
function lyToggleTest(pid) {
  const i = lyRecState.pids.indexOf(pid);
  if (i >= 0) lyRecState.pids.splice(i, 1); else lyRecState.pids.push(pid);
  lyRenderRec();
}
function lyAgeDob(mode) {
  if (mode === 'y') {
    const y = +$('#ly-agey').value || 0, m = +$('#ly-agem').value || 0, d = +$('#ly-aged').value || 0;
    if (y || m || d) { const dt = new Date(); dt.setFullYear(dt.getFullYear() - y); dt.setMonth(dt.getMonth() - m); dt.setDate(dt.getDate() - d); $('#ly-dob').value = dt.toISOString().slice(0, 10); }
  } else {
    const dob = $('#ly-dob').value; if (!dob) return;
    const b = new Date(dob), n = new Date();
    let y = n.getFullYear() - b.getFullYear(), m = n.getMonth() - b.getMonth(), d = n.getDate() - b.getDate();
    if (d < 0) { m--; d += 30; } if (m < 0) { y--; m += 12; }
    $('#ly-agey').value = y; $('#ly-agem').value = m; $('#ly-aged').value = d;
  }
}
function lyCollectPatient() {
  const name = $('#ly-name').value.trim();
  if (!name) { toast('⚠️ اكتب اسم المريض'); return null; }
  return {
    title: $('#ly-title').value, name, gender: $('#ly-gender').value,
    ageY: +$('#ly-agey').value || 0, ageM: +$('#ly-agem').value || 0, ageD: +$('#ly-aged').value || 0,
    dob: $('#ly-dob').value, nat: $('#ly-nat').value, nid: $('#ly-nid').value,
    phone: $('#ly-phone').value, addr: $('#ly-addr').value,
  };
}
function lySavePatient() {
  const d = lyCollectPatient(); if (!d) return;
  let p = lyRecState.patientId ? yPatients().find(x => x.id === lyRecState.patientId) : null;
  if (p) Object.assign(p, d);
  else { p = { id: uid('yp'), code: 'P-' + yNextCode('pat'), ...d }; yPatients().push(p); lyRecState.patientId = p.id; }
  save(); toast('✅ تم حفظ بيانات المريض'); lyRenderRec();
}
function lyNewPatient() { lyRecState.patientId = null; lyRenderRec(); }
function lyPickPatient() {
  const list = yPatients().slice().reverse().slice(0, 50);
  modal(`<h3>🔍 اختيار مريض</h3>
    <input class="inp2" placeholder="بحث…" oninput="this.nextElementSibling.innerHTML=lyPatList(this.value)">
    <div>${lyPatList('')}</div>
    <div style="text-align:left;margin-top:10px"><button class="btn btn-o" onclick="closeModal()">إغلاق</button></div>`);
}
function lyPatList(q) {
  return yPatients().slice().reverse().filter(p => !q || p.name.includes(q) || (p.phone || '').includes(q)).slice(0, 30)
    .map(p => `<div class="ly-testrow" onclick="lyRecState.patientId='${p.id}';lyRecState.referrer='${esc(p.ref || 'Self referral')}';closeModal();lyRenderRec()">
      <div class="ly-tr-name">${esc(p.title || '')} ${esc(p.name)} <span class="en">${esc(p.code)}</span></div>
      <div>${p.gender} — ${p.ageY || 0} سنة</div></div>`).join('') || '<div class="mut" style="padding:12px;text-align:center">لا يوجد مرضى بعد</div>';
}
function lySaveVisit(withInvoice) {
  const p = yPatients().find(x => x.id === lyRecState.patientId);
  if (!p || !lyRecState.pids.length) return;
  const gross = lyRecState.pids.reduce((a, pid) => a + (+yProfile(pid).price || 0), 0);
  const v = {
    id: uid('yv'), code: 'Y' + yNextCode('v'), date: today(), time: new Date().toTimeString().slice(0, 5),
    patientId: p.id, profiles: [...lyRecState.pids], results: {}, donePids: [],
    gross, disc: +($('#ly-disc')?.value || 0), paid: +($('#ly-paid')?.value || 0),
    referrer: $('#ly-ref')?.value || 'Self referral', plan: $('#ly-plan')?.value || 'أسعار أساسية',
  };
  yVisits().push(v); save();
  toast('✅ تم حفظ الحالة — كود: ' + v.code);
  if (withInvoice) lyInvoice(v.id);
  lyRecState.pids = []; lyRecState.patientId = null;
  lyRenderRec();
}
function lyInvoice(visitId) {
  const v = yVisits().find(x => x.id === visitId); const p = yPatients().find(x => x.id === v.patientId);
  const rem = v.gross - v.disc - v.paid;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>إيصال ${v.code}</title><style>
    body{font-family:Tahoma;margin:0;padding:8mm} .inv{max-width:80mm;margin:auto}
    .h{text-align:center;border-bottom:1.5px solid #333;padding-bottom:2mm;margin-bottom:3mm}
    .h b{font-size:16px} .row{display:flex;justify-content:space-between;font-size:13px;margin:1mm 0}
    table{width:100%;border-collapse:collapse;font-size:12.5px;margin:3mm 0} td,th{border-bottom:1px dashed #999;padding:1.5mm;text-align:right}
    th{border-bottom:1px solid #333} .tot{font-size:14px;font-weight:900} .f{margin-top:5mm;font-size:11px;color:#555;text-align:center}
    @media print{body{padding:0}}</style></head><body><div class="inv">
    <div class="h"><b>${esc(DB.lab.name)}</b><div>${esc(DB.lab.branch || '')}</div><div class="num">${v.code} — ${v.date} ${v.time}</div></div>
    <div class="row"><span>المريض:</span><b>${esc(p?.title || '')} ${esc(p?.name)}</b></div>
    <div class="row"><span>الجنس / السن:</span><span>${esc(p?.gender)} — ${p?.ageY || 0} سنة</span></div>
    <div class="row"><span>الطبيب:</span><span>${esc(v.referrer)}</span></div>
    <table><tr><th>الفحص</th><th>السعر</th></tr>
    ${v.profiles.map(pid => { const x = yProfile(pid); return `<tr><td>${esc(x.arabic_name || x.report_name)}</td><td class="num">${fmt(x.price || 0)}</td></tr>`; }).join('')}
    </table>
    <div class="row tot"><span>الإجمالي</span><span>${fmt(v.gross)}</span></div>
    <div class="row"><span>الخصم</span><span>${fmt(v.disc)}</span></div>
    <div class="row"><span>المدفوع</span><span>${fmt(v.paid)}</span></div>
    <div class="row tot"><span>المتبقي</span><span>${fmt(rem)}</span></div>
    <div class="f">${esc(DB.lab.schedule)}</div>
  </div><script>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ============================================================
   2) النتائج — بحث بالكود + حالات الفحوصات + إدخال النتائج + تقرير نتائج
   ============================================================ */
let lyRes = { q: '', visitId: null, pid: null };

function lyRenderRes() {
  const st = lyRes;
  const list = yVisits().slice().reverse().filter(v => {
    const p = yPatients().find(x => x.id === v.patientId);
    return !st.q || v.code.includes(st.q) || (p?.name || '').includes(st.q) || (p?.phone || '').includes(st.q);
  }).slice(0, 30);
  const v = st.visitId ? yVisits().find(x => x.id === st.visitId) : null;
  const p = v ? yPatients().find(x => x.id === v.patientId) : null;
  $('#ly-body').innerHTML = `
  <div class="ly-res-grid">
    <div class="card">
      <h3>🔍 بحث</h3>
      <input class="inp2" placeholder="كود الحالة / اسم المريض / تليفون" value="${esc(st.q)}" oninput="lyRes.q=this.value;lyRenderRes();setTimeout(()=>{const el=$('#ly-res-q');el&&el.focus()},0)" id="ly-res-q">
      <div class="ly-testlist" style="margin-top:8px">
        ${list.map(x => `<div class="ly-testrow ${st.visitId === x.id ? 'sel' : ''}" onclick="lyRes.visitId='${x.id}';lyRes.pid=null;lyRenderRes()">
          <div class="ly-tr-name">${esc(yPatients().find(pp => pp.id === x.patientId)?.name || '')} <span class="en num">${x.code}</span></div>
          <div>${x.date} ${x.time}</div></div>`).join('') || '<div class="mut" style="padding:12px;text-align:center">لا توجد حالات — سجّل من الاستقبال أولاً</div>'}
      </div>
      ${v ? `<div class="ly-testlist" style="margin-top:10px;border-top:2px solid var(--line);padding-top:8px">
        ${v.profiles.map(pid => { const x = yProfile(pid); const done = v.donePids.includes(pid);
          return `<div class="ly-testrow ${st.pid === pid ? 'sel' : ''}" onclick="lyRes.pid=${pid};lyRenderRes()">
            <div class="ly-tr-name">${esc(x.arabic_name || x.report_name)}</div>
            <span class="pill ${done ? 'ok' : 'warn'}">${done ? 'تم' : 'معلق'}</span></div>`; }).join('')}
      </div>` : ''}
    </div>
    <div class="card" id="ly-work">${v && st.pid ? lyWorkHtml(v, p, st.pid) : '<div class="mut" style="text-align:center;padding:30px">اختار حالة ثم فحص لإدخال النتائج</div>'}</div>
  </div>`;
}
function lyWorkHtml(v, p, pid) {
  const x = yProfile(pid);
  const rows = yReportTree(pid);
  const gc = yGenderCode(p), ad = yAgeDays(p);
  const vals = v.results[pid] || {};
  return `
  <div class="y-pat-banner">
    <b>${esc(p?.title || '')} ${esc(p?.name)}</b> — ${esc(p?.gender)} - ${p?.ageY || 0} سنة ${p?.ageM ? p.ageM + ' شهر ' : ''}${p?.ageD ? p.ageD + ' يوم' : ''}
    <div class="mut" style="font-size:12px;margin-top:3px">⏱️ تسجيل: ${v.date} ${v.time} • زيارة ${v.code} • ${esc(v.referrer || 'Self referral')} • ${esc(v.plan || '')}</div>
  </div>
  <h3>${esc(x.arabic_name || x.report_name)} <span class="en">${esc(x.report_name || '')}</span></h3>
  <div class="report-table-head" style="border-color:var(--line);margin-bottom:4px"><div>Test name</div><div style="margin-right:auto;margin-left:22mm">Result</div><div>Reference range</div></div>
  ${rows.map((r, i) => {
    if (r.head) return `<div class="report-profile" style="background:#e5e9f2;height:auto;padding:6px 10px;margin:8px 0 0;font-size:14px">${esc(r.head)}</div>`;
    if (r.headEnd) return '';
    const t = r.t;
    const ref = yRef(t.test_id, gc, ad);
    const [fg, st] = yFlag(vals[t.test_id] ?? '', ref);
    return `<div class="ly-resrow">
      <div class="ly-res-name">${esc(t.report_name || t.test_name)} ${t.unit_code ? `<span class="en mut">(${esc(t.unit_code)})</span>` : ''}</div>
      <div class="ly-res-inp">
        <input class="inp2 num ly-val" data-tid="${t.test_id}" value="${esc(vals[t.test_id] ?? '')}" oninput="lyFlagLive(this,${t.test_id})">
        <span class="ly-flag" id="lyf-${t.test_id}" style="${st}">${fg}</span>
      </div>
      <div class="rf num" id="lyr-${t.test_id}">${yRefText(ref)} ${ref?.unit ? `<span class="en mut">${esc(ref.unit)}</span>` : ''}</div>
    </div>`;
  }).join('')}
  ${x.default_comment ? `<pre class="report-comment" style="color:#333">${esc(x.default_comment)}</pre>` : ''}
  <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
    <button class="btn btn-p" onclick="lySaveResults('${v.id}',${pid})">💾 حفظ النتائج</button>
    <button class="btn btn-g" onclick="lyReport('${v.id}',${pid})">🖨️ طباعة التقرير</button>
    <button class="btn btn-o" onclick="lyToggleDone('${v.id}',${pid})">${v.donePids.includes(pid) ? '↩️ فتح التعديل' : '✔️ اعتماد الفحص'}</button>
  </div>`;
}
function lyFlagLive(inp, tid) {
  const v = yVisits().find(x => x.id === lyRes.visitId);
  const p = yPatients().find(x => x.id === v.patientId);
  const ref = yRef(tid, yGenderCode(p), yAgeDays(p));
  const [fg, st] = yFlag(inp.value, ref);
  const el = $('#lyf-' + tid);
  if (el) { el.textContent = fg; el.style.cssText = st; }
}
function lySaveResults(visitId, pid) {
  const v = yVisits().find(x => x.id === visitId);
  const vals = {};
  $$('.ly-val').forEach(el => { if (el.value !== '') vals[el.dataset.tid] = el.value; });
  v.results[pid] = vals;
  if (!v.donePids.includes(pid)) v.donePids.push(pid);
  save(); toast('✅ تم حفظ النتائج'); lyRenderRes();
}
function lyToggleDone(visitId, pid) {
  const v = yVisits().find(x => x.id === visitId);
  const i = v.donePids.indexOf(pid);
  if (i >= 0) v.donePids.splice(i, 1); else v.donePids.push(pid);
  save(); lyRenderRes();
}
/* تقرير النتائج GenericReport — نفس شكل الطباعة */
function lyReport(visitId, onlyPid) {
  const v = yVisits().find(x => x.id === visitId);
  const p = yPatients().find(x => x.id === v.patientId);
  const h = DB.lab.header;
  const pids = (onlyPid ? [onlyPid] : v.profiles).filter(pid => v.donePids.includes(pid));
  if (!pids.length) return toast('⚠️ مفيش فحوصات معتمدة للطباعة');
  const gc = yGenderCode(p), ad = yAgeDays(p);
  const sexStr = p?.gender === 'أنثى' ? 'Female' : 'Male';
  const ageStr = [p?.ageY && p.ageY + ' Y', p?.ageM && p.ageM + ' M', p?.ageD && p.ageD + ' D'].filter(Boolean).join(' ');
  const resTable = pid => {
    const x = yProfile(pid);
    const vals = v.results[pid] || {};
    const lines = [];
    for (const r of yReportTree(pid)) {
      if (r.head) { lines.push(`<div class="report-profile">${esc(r.head)}</div>`); continue; }
      if (r.headEnd) continue;
      const t = r.t;
      const ref = yRef(t.test_id, gc, ad);
      const val = vals[t.test_id] ?? '';
      const [fg, st] = yFlag(val, ref);
      const unit = (ref && ref.unit) || t.unit_code || '';
      lines.push(`<div class="report-table-line">
        <div class="rt-name">${esc(t.report_name || t.test_name)}</div>
        <div class="rt-result" style="${st}">${esc(val)}${fg ? ` <b>${fg}</b>` : ''} <span class="rt-unit">${esc(unit)}</span></div>
        <div class="rt-ref num">${yRefText(ref)}</div>
      </div>`);
    }
    if (x.default_comment) lines.push(`<pre class="report-comment">${esc(x.default_comment)}</pre>`);
    return `<div class="report-profile">${esc(x.arabic_name || x.report_name || x.profile_name)}</div>` + lines.join('');
  };
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير ${v.code}</title>
  <style>
  body{font-family:Tahoma;margin:0;background:#fff}
  .report-page{width:210mm;min-height:295mm;padding:10mm 12mm;box-sizing:border-box;margin:auto;display:flex;flex-direction:column}
  .report-header{display:grid;grid-template-columns:1fr 1fr 1fr 52mm;grid-template-areas:"name date ref qr";gap:2mm;border:1.5px solid #333;border-radius:3mm;padding:3mm;margin-bottom:4mm}
  .rh-name{grid-area:name}.rh-date{grid-area:date}.rh-ref{grid-area:ref}
  .rh-cell{display:flex;flex-direction:column;gap:1mm;font-size:13px}
  .rh-label{font-size:10.5px;color:#777;font-weight:700}
  .rh-qr{grid-area:qr;border-right:1px dashed #999;padding-right:3mm;display:flex;flex-direction:column;gap:.5mm;font-size:11px;justify-content:center}
  .rh-qr-title{font-weight:900;font-size:12px}
  .rh-qr-line{direction:ltr;text-align:left}
  .report-title{text-align:center;font-weight:900;font-size:16px;margin:2mm 0 4mm;color:#0d1b3e}
  .report-table-head{display:flex;justify-content:space-between;font-weight:900;border-bottom:1px solid gray;padding-bottom:1mm;margin-bottom:1mm;font-size:13.5px}
  .report-table-head div:nth-child(2){margin-right:auto;margin-left:22mm}
  .report-table-line{display:flex;align-items:center;flex:0 0 8mm;border-bottom:1px dashed #adadad;font-size:13px}
  .rt-name{width:44%}.rt-result{width:31%;font-weight:700}.rt-unit{color:#555;font-weight:400;font-size:11.5px}.rt-ref{width:25%;color:#333;direction:ltr;text-align:left}
  .report-profile{background:#cccccc;height:7mm;display:flex;align-items:center;padding:0 3mm;font-size:15px;font-weight:900;margin:2mm 0 0}
  .report-comment{white-space:pre-wrap;margin:1.5mm 0;padding:0 3mm;font-size:12.5px}
  .report-footer{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;padding-top:6mm}
  .report-remarks{font-size:12px;color:#444;max-width:60%}
  .report-sign{text-align:center}
  .report-sign-title{font-size:12px;color:#666}
  .report-sign-name{font-weight:900;border-top:1px solid #333;padding-top:1mm;margin-top:8mm;min-width:45mm}
  .report-watermark{text-align:center;font-size:10px;color:#aaa;margin-top:2mm}
  @media print{@page{size:A4;margin:0}body{padding:0}}
  </style></head><body>
  <div class="report-page">
    <div class="report-header">
      <div class="rh-cell rh-name"><span class="rh-label">اسم المريض / Patient</span><b>${esc(p?.title || '')} ${esc(p?.name)}</b></div>
      <div class="rh-cell rh-date"><span class="rh-label">التاريخ / Date</span><span class="num">${v.date} ${v.time}</span></div>
      <div class="rh-cell rh-ref"><span class="rh-label">الطبيب المحيل / Referral</span>${esc(v.referrer || 'Self referral')}</div>
      <div class="rh-qr">
        <div class="rh-qr-title">${esc(h.title || DB.lab.name)}</div>
        <div class="rh-qr-line num">Request: ${v.code}</div>
        <div class="rh-qr-line num">Patient: ${esc(p?.code)}</div>
        <div class="rh-qr-line">${sexStr} - ${ageStr}</div>
      </div>
    </div>
    <div class="report-title">تقرير نتائج التحاليل</div>
    <div class="report-body">
      <div class="report-table-head"><div>Test name</div><div>Result</div><div>Reference range</div></div>
      ${pids.map(pid => resTable(pid)).join('')}
    </div>
    <div class="report-footer">
      <div class="report-remarks">🕐 ${esc(DB.lab.schedule)}<br>${esc(h.footer || '')}</div>
      <div class="report-sign">
        <div class="report-sign-title">توقيع أخصائي المختبر</div>
        <div class="report-sign-name">${esc(DB.lab.specialist || '')}</div>
      </div>
    </div>
    <div class="report-watermark">CSL — csl.mtayea.com</div>
  </div>
  <script>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ============================================================
   3) إعدادات المعمل الكاملة: تحاليل + باراميترات + عينات
   ============================================================ */
let lySet = { tab: 'tests', q: '', gid: 0, pid: null, tid: null, sid: null };

function lyRenderSet() {
  const st = lySet;
  const tabs = [['tests', '🧪 التحاليل (Tests)'], ['params', '⚗️ الباراميترات (Parameters)'], ['samples', '🧫 العينات (Samples)'], ['plans', '💳 خطط الأسعار']];
  $('#ly-body').innerHTML = `
    <div class="ly-tabs small">${tabs.map(t => `<button class="ly-tab ${st.tab === t[0] ? 'on' : ''}" onclick="lySet.tab='${t[0]}';lySet.pid=null;lySet.tid=null;lyRenderSet()">${t[1]}</button>`).join('')}</div>
    <div id="ly-set-body"></div>`;
  if (st.tab === 'tests') lySetTests();
  if (st.tab === 'params') lySetParams();
  if (st.tab === 'samples') lySetSamples();
  if (st.tab === 'plans') lySetPlans();
}

/* ---- التحاليل: قائمة بفلاتر المجموعة/البحث + محرر التحليل وباراميتراته ---- */
function lySetTests() {
  const st = lySet;
  const all = yProfiles().filter(x =>
    (st.gid === 0 || x.group_id === st.gid) &&
    (!st.q || (x.arabic_name || '').includes(st.q) || (x.report_name || '').toLowerCase().includes(st.q.toLowerCase()) || (x.profile_name || '').toLowerCase().includes(st.q.toLowerCase())));
  $('#ly-set-body').innerHTML = `
  <div class="ly-set-grid">
    <div class="card">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <select class="inp2" style="max-width:170px" onchange="lySet.gid=+this.value;lySetTests()">
          <option value="0">All Groups</option>
          ${YS.groups.filter(g => g.group_id !== 0).map(g => `<option value="${g.group_id}" ${st.gid === g.group_id ? 'selected' : ''}>${esc(g.group_name)}</option>`).join('')}
        </select>
        <input class="inp2" placeholder="Filter tests — بحث" value="${esc(st.q)}" oninput="lySet.q=this.value;lySetTests();setTimeout(()=>{const el=$('#ly-set-q');el&&el.focus()},0)" id="ly-set-q">
        <button class="btn btn-g" onclick="lyEditProfile(null)">➕ تحليل جديد</button>
      </div>
      <div class="ly-testlist tall">
        ${all.slice(0, 120).map(x => `<div class="ly-testrow ${st.pid === x.profile_id ? 'sel' : ''}" onclick="lySet.pid=${x.profile_id};lySetTests()">
          <div class="ly-tr-name">${esc(x.arabic_name || x.report_name || x.profile_name)} ${x.hidden ? '<span class="pill">مخفي</span>' : ''}<br><span class="en mut">${esc(x.report_name || '')} • ${esc(yGroupName(x.group_id))}</span></div>
          <div class="num">${fmt(x.price || 0)}</div></div>`).join('') || '<div class="mut" style="padding:12px;text-align:center">لا نتائج</div>'}
        ${all.length > 120 ? `<div class="mut" style="text-align:center;padding:8px">… ${all.length - 120} نتيجة أخرى — استخدم البحث</div>` : ''}
      </div>
    </div>
    <div class="card" id="ly-prof-edit">${st.pid ? lyProfileEditor(st.pid) : '<div class="mut" style="text-align:center;padding:30px">اختار تحليل من القايمة</div>'}</div>
  </div>`;
}
function lyProfileEditor(pid) {
  const x = yProfile(pid);
  const rows = yDetailRows(pid);
  return `
  <h3>تحرير التحليل <span class="en">#${pid}</span></h3>
  <div class="grid3">
    <div><label>الاسم بالعربي</label><input id="lep-ar" class="inp2" value="${esc(x.arabic_name || '')}"></div>
    <div style="grid-column:span 2"><label>اسم التقرير (إنجليزي)</label><input id="lep-en" class="inp2" value="${esc(x.report_name || '')}"></div>
    <div><label>الاسم المختصر (code)</label><input id="lep-code" class="inp2" value="${esc(x.profile_name || '')}"></div>
    <div><label>المجموعة</label><select id="lep-gid" class="inp2">${YS.groups.filter(g => g.group_id !== 0).map(g => `<option value="${g.group_id}" ${x.group_id === g.group_id ? 'selected' : ''}>${esc(g.group_name)}</option>`).join('')}</select></div>
    <div><label>السعر</label><input id="lep-price" type="number" class="inp2 num" value="${x.price || 0}"></div>
    <div><label>مخفي في القايمة؟</label><select id="lep-hidden" class="inp2"><option value="0" ${!x.hidden ? 'selected' : ''}>ظاهر</option><option value="1" ${x.hidden ? 'selected' : ''}>مخفي</option></select></div>
    <div style="grid-column:span 3"><label>تعليق التقرير الافتراضي (Comment)</label><textarea id="lep-comment" class="inp2" rows="2">${esc(x.default_comment || '')}</textarea></div>
    <div style="grid-column:span 3"><label>معلومات للمريض (Info)</label><textarea id="lep-info" class="inp2" rows="2">${esc(x.info || '')}</textarea></div>
  </div>
  <h4 style="margin:12px 0 6px">الباراميترات المكوّنة للتحليل (${rows.length})</h4>
  <div class="ly-testlist" style="max-height:240px">
    ${rows.map((r, i) => { const t = yTest(r.test_id); const ref = yRanges(r.test_id)[0];
      return `<div class="ly-selrow"><span class="num mut" style="min-width:22px">${i + 1}</span>
        <span style="flex:1">${esc(t.report_name || t.test_name)} ${t.unit_code ? `<span class="en mut">(${esc(t.unit_code)})</span>` : ''}<br><span class="en mut">${yRefText(ref) || 'بدون مرجعية'}</span></span>
        <button class="icon-btn" title="تعديل المرجعية" onclick="lySet.tab='params';lySet.tid=${r.test_id};lyRenderSet()">⚗️</button>
        <button class="icon-btn" title="حذف" onclick="lyDetailDel(${pid},${r.test_id})">🗑</button></div>`; }).join('') || '<div class="mut" style="padding:10px;text-align:center">لا باراميترات</div>'}
  </div>
  <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
    <select id="lep-add" class="inp2" style="flex:1;min-width:200px"><option value="">➕ إضافة باراميتر…</option>${YS.tests.map(t => `<option value="${t.test_id}">${esc(t.report_name || t.test_name)}</option>`).join('')}</select>
    <button class="btn btn-o" onclick="lyDetailAdd(${pid})">إضافة</button>
  </div>
  <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
    <button class="btn btn-p" onclick="lySaveProfile(${pid})">💾 حفظ التحليل</button>
    <button class="btn btn-o" onclick="lyEditProfile(${pid === null ? '' : pid})" style="display:none"></button>
    <button class="btn btn-g" onclick="lyDupProfile(${pid})">📄 نسخ كتحليل جديد</button>
    <button class="btn btn-r" onclick="lyDelProfile(${pid})">🗑 حذف</button>
  </div>`;
}
function lyEditProfile() {
  const id = 'np' + Date.now();
  yset().newProfiles.push({ profile_id: id, profile_name: '', arabic_name: '', report_name: '', group_id: 2, price: 0, hidden: 0, default_comment: '', info: '' });
  yset().pdetails[id] = [];
  lySet.pid = id; lySetTests();
}
function lySaveProfile(pid) {
  const o = {
    arabic_name: $('#lep-ar').value, report_name: $('#lep-en').value, profile_name: $('#lep-code').value,
    group_id: +$('#lep-gid').value, price: +$('#lep-price').value || 0, hidden: +$('#lep-hidden').value,
    default_comment: $('#lep-comment').value, info: $('#lep-info').value,
  };
  if (yset().newProfiles.find(n => n.profile_id === pid)) Object.assign(yset().newProfiles.find(n => n.profile_id === pid), o);
  else yset().profiles[pid] = { ...(yset().profiles[pid] || {}), ...o };
  save(); toast('✅ تم حفظ التحليل'); lySetTests();
}
function lyDupProfile(pid) {
  const x = yProfile(pid);
  const id = 'np' + Date.now();
  yset().newProfiles.push({ ...x, profile_id: id, arabic_name: (x.arabic_name || '') + ' (نسخة)', report_name: (x.report_name || '') + ' Copy' });
  yset().pdetails[id] = yDetailRows(pid).map(r => r.test_id);
  save(); lySet.pid = id; lySetTests(); toast('📄 تم إنشاء نسخة');
}
function lyDelProfile(pid) {
  if (!confirm('حذف التحليل ده؟ هيتخفي من كل الشاشات.')) return;
  if (yset().newProfiles.find(n => n.profile_id === pid)) yset().newProfiles = yset().newProfiles.filter(n => n.profile_id !== pid);
  else yset().delProfiles.push(pid);
  delete yset().profiles[pid];
  lySet.pid = null; save(); lySetTests();
}
function lyDetailAdd(pid) {
  const tid = +$('#lep-add').value; if (!tid) return;
  const ov = yDetailRows(pid).map(r => r.test_id);
  if (ov.includes(tid)) return toast('⚠️ الباراميتر موجود بالفعل');
  ov.push(tid); yset().pdetails[pid] = ov; lySetTests();
}
function lyDetailDel(pid, tid) {
  yset().pdetails[pid] = yDetailRows(pid).map(r => r.test_id).filter(x => x !== tid);
  lySetTests();
}

/* ---- الباراميترات: قائمة 989 + محرر الاسم/الوحدة/المرجعية بالسن والجنس ---- */
function lySetParams() {
  const st = lySet;
  const all = YS.tests.filter(t => !st.q || (t.report_name || '').toLowerCase().includes(st.q.toLowerCase()) || (t.test_name || '').toLowerCase().includes(st.q.toLowerCase()));
  $('#ly-set-body').innerHTML = `
  <div class="ly-set-grid">
    <div class="card">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <input class="inp2" style="flex:1" placeholder="🔍 بحث في الباراميترات (${YS.tests.length})" value="${esc(st.q)}" oninput="lySet.q=this.value;lySetParams();setTimeout(()=>{const el=$('#ly-par-q');el&&el.focus()},0)" id="ly-par-q">
        <button class="btn btn-g" onclick="lyEditTest()">➕ باراميتر جديد</button>
      </div>
      <div class="ly-testlist tall">
        ${all.slice(0, 120).map(t => `<div class="ly-testrow ${st.tid === t.test_id ? 'sel' : ''}" onclick="lySet.tid=${t.test_id};lySetParams()">
          <div class="ly-tr-name">${esc(t.report_name || t.test_name)}<br><span class="en mut">${esc(t.unit_code || '')} • عينة: ${esc(ySample(t.sample_code))} • ${yRanges(t.test_id).length} مرجعية</span></div></div>`).join('') || '<div class="mut" style="padding:12px;text-align:center">لا نتائج</div>'}
        ${all.length > 120 ? `<div class="mut" style="text-align:center;padding:8px">… ${all.length - 120} أخرى — استخدم البحث</div>` : ''}
      </div>
    </div>
    <div class="card" id="ly-test-edit">${st.tid ? lyTestEditor(st.tid) : '<div class="mut" style="text-align:center;padding:30px">اختار باراميتر من القايمة</div>'}</div>
  </div>`;
}
function lyTestEditor(tid) {
  const t = yTest(tid);
  const isNew = !!yset().newTests.find(x => x.test_id === tid);
  const rows = yRanges(tid);
  return `
  <h3>تحرير الباراميتر <span class="en">#${tid}</span></h3>
  <div class="grid3">
    <div style="grid-column:span 2"><label>اسم التقرير (إنجليزي)</label><input id="lte-en" class="inp2" value="${esc(t.report_name || '')}"></div>
    <div><label>الاسم المختصر</label><input id="lte-name" class="inp2" value="${esc(t.test_name || '')}"></div>
    <div><label>الوحدة Unit</label><input id="lte-unit" class="inp2" value="${esc(t.unit_code || '')}"></div>
    <div><label>العينة</label><select id="lte-sample" class="inp2">${YS.samples.map(s => `<option value="${s.sample_code}" ${t.sample_code === s.sample_code ? 'selected' : ''}>${esc(s.sample_name)}</option>`).join('')}</select></div>
    <div><label>صيغة النتيجة</label><input id="lte-fmt" class="inp2 num" value="${esc(t.result_foramt || '0.00')}"></div>
    <div style="grid-column:span 3"><label>القيمة الافتراضية</label><input id="lte-def" class="inp2" value="${esc(t.default_value || '')}"></div>
  </div>
  <h4 style="margin:12px 0 6px">المرجعية (${rows.length}) — بالجنس والسن</h4>
  <table class="ly-table">
    <tr><th>الجنس</th><th>العمر من (يوم)</th><th>إلى (يوم)</th><th>الشرط</th><th>من</th><th>إلى</th><th>الوحدة</th><th>نصي</th><th></th></tr>
    ${rows.map((r, i) => `<tr>
      <td><select class="inp2" onchange="lyRangeSet(${tid},${i},'gender',+this.value)">${[0, 1, 2].map(g => `<option value="${g}" ${r.gender === g ? 'selected' : ''}>${yGenders[g]}</option>`).join('')}</select></td>
      <td><input class="inp2 num" style="width:70px" value="${r.age_from_days ?? 0}" onchange="lyRangeSet(${tid},${i},'age_from_days',+this.value)"></td>
      <td><input class="inp2 num" style="width:80px" value="${r.age_to_days ?? 999999}" onchange="lyRangeSet(${tid},${i},'age_to_days',+this.value)"></td>
      <td><select class="inp2" onchange="lyRangeSet(${tid},${i},'operator',+this.value)">${yOps.map((o, oi) => `<option value="${oi}" ${r.operator === oi ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
      <td><input class="inp2 num" style="width:70px" value="${esc(r.normal_from ?? '')}" onchange="lyRangeSet(${tid},${i},'normal_from',this.value)"></td>
      <td><input class="inp2 num" style="width:70px" value="${esc(r.normal_to ?? '')}" onchange="lyRangeSet(${tid},${i},'normal_to',this.value)"></td>
      <td><input class="inp2" style="width:70px" value="${esc(r.unit || '')}" onchange="lyRangeSet(${tid},${i},'unit',this.value)"></td>
      <td><input class="inp2" style="width:80px" value="${esc(r.text_value || '')}" onchange="lyRangeSet(${tid},${i},'text_value',this.value)"></td>
      <td><button class="icon-btn" onclick="lyRangeDel(${tid},${i})">🗑</button></td>
    </tr>`).join('')}
  </table>
  <button class="btn btn-o" onclick="lyRangeAdd(${tid})">➕ إضافة سطر مرجعية</button>
  <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
    <button class="btn btn-p" onclick="lySaveTest(${tid})">💾 حفظ الباراميتر</button>
    ${isNew ? `<button class="btn btn-r" onclick="lyDelTest(${tid})">🗑 حذف</button>` : `<button class="btn btn-g" onclick="lyResetTest(${tid})">↩️ استرجاع الأصل</button>`}
  </div>`;
}
function lyRangesEdit(tid) {
  if (yset().ranges[tid] === undefined) yset().ranges[tid] = YS.ranges.filter(r => r.test_id === tid).map(r => ({ ...r }));
  return yset().ranges[tid];
}
function lyRangeSet(tid, i, k, v) { lyRangesEdit(tid)[i][k] = v; }
function lyRangeAdd(tid) { lyRangesEdit(tid).push({ test_id: tid, gender: 0, age_from_days: 0, age_to_days: 999999, is_single_value: 0, operator: 0, normal_from: '', normal_to: '', unit: yTest(tid).unit_code || '', text_value: '' }); lySetParams(); }
function lyRangeDel(tid, i) { lyRangesEdit(tid).splice(i, 1); lySetParams(); }
function lyEditTest() {
  const id = Date.now();
  yset().newTests.push({ test_id: id, test_name: '', report_name: '', group_id: 2, unit_code: '', sample_code: 24, result_foramt: '0.00', default_value: '', comments: '' });
  yset().ranges[id] = [];
  lySet.tid = id; lySetParams();
}
function lySaveTest(tid) {
  const o = { report_name: $('#lte-en').value, test_name: $('#lte-name').value, unit_code: $('#lte-unit').value, sample_code: +$('#lte-sample').value, result_foramt: $('#lte-fmt').value, default_value: $('#lte-def').value };
  const nt = yset().newTests.find(x => x.test_id === tid);
  if (nt) Object.assign(nt, o); else yset().tests[tid] = { ...(yset().tests[tid] || {}), ...o };
  save(); toast('✅ تم حفظ الباراميتر');
}
function lyDelTest(tid) {
  if (!confirm('حذف الباراميتر الجديد ده؟')) return;
  yset().newTests = yset().newTests.filter(x => x.test_id !== tid);
  delete yset().tests[tid]; delete yset().ranges[tid];
  lySet.tid = null; save(); lySetParams();
}
function lyResetTest(tid) { delete yset().tests[tid]; delete yset().ranges[tid]; save(); lySetParams(); toast('↩️ تم استرجاع الأصل'); }

/* ---- العينات: قائمة العينات الكاملة + إضافة/تعديل محلي ---- */
function lySetSamples() {
  const st = lySet;
  const over = yset().samples;
  const list = YS.samples.map(s => ({ ...s, ...(over[s.sample_code] || {}) }));
  $('#ly-set-body').innerHTML = `
  <div class="ly-set-grid">
    <div class="card">
      <h3>🧫 العينات (${list.length}) — القائمة الكاملة</h3>
      <div class="ly-testlist tall">
        ${list.map(s => `<div class="ly-testrow ${st.sid === s.sample_code ? 'sel' : ''}" onclick="lySet.sid=${s.sample_code};lySetSamples()">
          <div class="ly-tr-name">${esc(s.sample_name)} ${over[s.sample_code] ? '<span class="pill ok">معدّل</span>' : ''}</div>
          <div class="num">${esc(s.tube_size)}</div></div>`).join('')}
      </div>
      <button class="btn btn-g" style="margin-top:8px" onclick="lyNewSample()">➕ عينة جديدة</button>
      <div class="mut" style="font-size:12px;margin-top:8px">عينات جديدة بتتخزن محلياً ومتتظهرش في النظام المركزي — زي النظام الأصلي بالظبط (عينات فرعية).</div>
    </div>
    <div class="card">${st.sid ? lySampleEditor(st.sid) : '<div class="mut" style="text-align:center;padding:30px">اختار عينة من القايمة</div>'}</div>
  </div>`;
}
function lySampleEditor(sc) {
  const s = { ...(YS.samples.find(x => x.sample_code === sc) || {}), ...(yset().samples[sc] || {}) };
  return `
  <h3>تحرير العينة <span class="en">#${sc}</span></h3>
  <div class="grid3">
    <div style="grid-column:span 2"><label>اسم العينة</label><input id="lse-name" class="inp2" value="${esc(s.sample_name || '')}"></div>
    <div><label>حجم الأنبوبة tube_size</label><input id="lse-tube" class="inp2 num" value="${esc(s.tube_size || '0.0')}"></div>
    <div><label>المجموعة</label><input id="lse-grp" class="inp2" value="${esc(s.sample_group || '')}"></div>
    <div><label>نمط الليبل</label><input id="lse-lbl" class="inp2" value="${esc(s.label_style || 'BRC')}"></div>
  </div>
  <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
    <button class="btn btn-p" onclick="lySaveSample(${sc})">💾 حفظ العينة</button>
    ${yset().samples[sc] ? `<button class="btn btn-g" onclick="delete yset().samples[${sc}];save();lySetSamples();toast('↩️ تم الاسترجاع')">↩️ استرجاع الأصل</button>` : ''}
  </div>
  <div class="mut" style="margin-top:10px;font-size:12px">العينات المستوردة من النظام: ${YS.samples.length} عينة بأكوادها الأصلية.</div>`;
}
function lyNewSample() {
  const sc = Math.max(...YS.samples.map(s => s.sample_code), 99) + 1 + Object.keys(yset().samples).filter(k => !YS.samples.find(s => s.sample_code == k)).length;
  yset().samples[sc] = { sample_code: sc, sample_name: 'عينة جديدة', tube_size: '0.0', sample_group: '', label_style: 'BRC' };
  lySet.sid = sc; lySetSamples();
}
function lySaveSample(sc) {
  yset().samples[sc] = { sample_code: sc, sample_name: $('#lse-name').value, tube_size: $('#lse-tube').value, sample_group: $('#lse-grp').value, label_style: $('#lse-lbl').value };
  save(); toast('✅ تم حفظ العينة'); lySetSamples();
}

/* ---- خطط الأسعار ---- */
function lySetPlans() {
  $('#ly-set-body').innerHTML = `<div class="card">
    <h3>💳 خطط الأسعار (${YS.priceplans.length})</h3>
    <div class="ly-testlist tall">
      ${YS.priceplans.map(p => `<div class="ly-testrow"><div class="ly-tr-name">${esc(p.rank_name)}<br><span class="en mut">${p.percent}% • ${p.type === 2 ? 'نسبة' : 'ثابت'}</span></div></div>`).join('')}
    </div>
    <div class="mut" style="font-size:12px;margin-top:8px">الأسعار الفعلية على كل تحليل من شاشة التحاليل — الخطة بتظهر في الاستقبال عند اختيارها.</div>
  </div>`;
}
