/* ============================================================
   CSL — الموظفون (نظام الرواتب والشيفتات)
   نفس منطق نظام رواتب MT — مخصص لبنية CSL (داخل DB.payroll لكل معمل)
   ============================================================ */
'use strict';

/* ---------- حالة الشاشة ---------- */
const STF = { month: null, empId: null };

/* ---------- بيانات الرواتب داخل معمل المستخدم ---------- */
function PR() {
  if (!DB.payroll) DB.payroll = { emps: [], pays: [], settings: { currency: 'EGP', fx: {}, updatedAt: Date.now() } };
  if (!Array.isArray(DB.payroll.emps)) DB.payroll.emps = [];
  if (!Array.isArray(DB.payroll.pays)) DB.payroll.pays = [];
  if (!DB.payroll.settings) DB.payroll.settings = { currency: 'EGP', fx: {}, updatedAt: Date.now() };
  return DB.payroll;
}

/* ---------- أرقام وتواريخ ---------- */
const cslNum = v => { const n = parseFloat(String(v ?? '').replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; };
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function curMonth() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function monthLabel(m) { const [y, mm] = (m || '').split('-').map(Number); return (MONTHS_AR[mm - 1] || m) + ' ' + y; }
/* أيام العمل في الشهر — الجمعة مش محسوبة */
function workDays(m) {
  const [y, mm] = m.split('-').map(Number);
  const n = new Date(y, mm, 0).getDate();
  let c = 0;
  for (let d = 1; d <= n; d++) if (new Date(y, mm - 1, d).getDay() !== 5) c++;
  return c;
}
function dayWage(salary, m) { const wd = workDays(m || STF.month || curMonth()); return wd ? Math.round(cslNum(salary) / wd * 100) / 100 : 0; }
function wageHint(salary) { return 'قيمة يوم العمل: ' + fmt(dayWage(salary, STF.month || curMonth())) + ' ' + curSym() + ' — بناءً على ' + workDays(STF.month || curMonth()) + ' يوم عمل (الجمعة مش محسوبة)'; }
function payOf(empId, m) { return PR().pays.find(p => p.empId === empId && p.month === m); }

/* ---------- العملات ---------- */
const CURRENCIES = { EGP: 'جنيه مصري 🇪🇬', USD: 'دولار أمريكي 🇺🇸', SAR: 'ريال سعودي 🇸🇦', EUR: 'يورو 🇪🇺', GBP: 'جنيه استرليني 🇬🇧', AED: 'درهم إماراتي 🇦🇪', KWD: 'دينار كويتي 🇰🇼' };
const FX_DEFAULT = { USD: 53.87, SAR: 14.36, EUR: 59.25, GBP: 71.17, AED: 14.67, KWD: 174.35 };
function fxRates() { return Object.assign({}, FX_DEFAULT, PR().settings.fx || {}); }
function curSym() { return { EGP: 'ج.م', USD: '$', SAR: 'ر.س', EUR: '€', GBP: '£', AED: 'د.إ', KWD: 'د.ك' }[PR().settings.currency] || 'ج.م'; }
/* تحويل مبلغ من الجنيه لعملة العرض الحالية */
function toCur(egp) { const c = PR().settings.currency; if (c === 'EGP') return Math.round(egp * 100) / 100; const r = fxRates()[c]; return r ? Math.round(egp / r * 100) / 100 : egp; }
function fromCur(v) { const c = PR().settings.currency; if (c === 'EGP') return cslNum(v); const r = fxRates()[c]; return r ? Math.round(cslNum(v) * r * 100) / 100 : cslNum(v); }

/* ---------- الشيفتات ---------- */
const SHIFT_TYPES = { morning: 'صباحي ☀️', evening: 'مسائي 🌆', night: 'سهر 🌙', custom: 'مخصص ⚙️' };
const SHIFT_PRESETS = { morning: { from: '09:00', to: '16:00' }, evening: { from: '16:00', to: '23:00' }, night: { from: '22:00', to: '06:00' }, custom: { from: '', to: '' } };
const DOWS = [['sat', 'السبت'], ['sun', 'الأحد'], ['mon', 'الاثنين'], ['tue', 'الثلاثاء'], ['wed', 'الأربعاء'], ['thu', 'الخميس'], ['fri', 'الجمعة']];
const DOW_IDX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
function shiftOf(e) { return (e && e.shift && e.shift.days && e.shift.days.length) ? e.shift : null; }
function hoursBetween(from, to) {
  if (!from || !to) return 0;
  const fh = +from.split(':')[0], fm = +from.split(':')[1] || 0, th = +to.split(':')[0], tm = +to.split(':')[1] || 0;
  let d = (th * 60 + tm) - (fh * 60 + fm);
  if (d <= 0) d += 24 * 60;
  return Math.round(d / 60 * 100) / 100;
}
function shiftHours(sh) { if (!sh) return 0; return cslNum(sh.hours) || hoursBetween(sh.from, sh.to); }
function shiftLabel(e) {
  const sh = shiftOf(e); if (!sh) return '';
  const days = (sh.days || []).map(d => (DOWS.find(x => x[0] === d) || [d, d])[1]).join('، ');
  const t = SHIFT_TYPES[sh.type] || 'مخصص ⚙️';
  const tm = (sh.from && sh.to) ? ' من ' + sh.from + ' لـ ' + sh.to : '';
  return t + tm + ' · ' + days + ' · ' + shiftHours(sh) + ' ساعة/يوم';
}
function shiftDayCount(m, days) {
  const [y, mm] = m.split('-').map(Number);
  const n = new Date(y, mm, 0).getDate();
  let c = 0;
  for (let d = 1; d <= n; d++) {
    const js = new Date(y, mm - 1, d).getDay();
    const k = Object.keys(DOW_IDX).find(k2 => DOW_IDX[k2] === js);
    if (days.includes(k)) c++;
  }
  return c;
}
function expectedHours(e, m) { const sh = shiftOf(e); return sh ? Math.round(shiftDayCount(m, sh.days) * shiftHours(sh) * 100) / 100 : 0; }
function hourRate(e, m, salaryDisp) { const eh = expectedHours(e, m); return eh ? Math.round(cslNum(salaryDisp) / eh * 100) / 100 : 0; }
function shiftInfoLine(e, salaryDisp) {
  const m = STF.month || curMonth();
  const eh = expectedHours(e, m);
  return 'المفترض ' + eh + ' ساعة في ' + monthLabel(m) + ' · سعر الساعة: ' + fmt(hourRate(e, m, salaryDisp)) + ' ' + curSym() + ' — الزيادة عن المفترض بتتحسب مكافأة تلقائياً';
}

/* ---------- بطاقة تسجيل القبض ---------- */
function stfPayCard(e) {
  const p = payOf(e.id, STF.month);
  const salary = p ? toCur(p.salary) : toCur(e.salary);
  const deduction = p ? toCur(p.deduction) : 0;
  const bonus = p ? toCur(p.bonus) : 0;
  const reason = p ? (p.deductReason || '') : '';
  const payDate = p && p.payDate ? p.payDate : today();
  const du = (p && p.dedUnit) || 'fixed';
  let dedShow = deduction || '';
  if (du === 'hour') { const r = hourRate(e, STF.month, salary); dedShow = deduction && r ? Math.round(deduction / r * 100) / 100 : ''; }
  else if (du === 'day') { const w = dayWage(salary, STF.month); dedShow = deduction && w ? Math.round(deduction / w * 100) / 100 : ''; }
  const net = cslNum(salary) - cslNum(deduction) + cslNum(bonus);
  return `
  <div class="card stf-paycard" id="pc-${e.id}">
    <h3>👤 ${esc(e.name)} ${p ? '<span class="pill p-paid">تم القبض ✓</span>' : ''}</h3>
    <div class="stf-grid">
      <div><label class="stf-lbl">الراتب (${curSym()})</label><input class="inp2" inputmode="decimal" id="s-${e.id}" value="${salary}" oninput="stfSalChanged('${e.id}')"></div>
      ${shiftOf(e) ? `
      <div><label class="stf-lbl">⏱ ساعات الحضور الفعلية</label><input class="inp2" inputmode="decimal" id="h-${e.id}" value="${p && p.hoursAtt != null ? p.hoursAtt : expectedHours(e, STF.month)}" oninput="stfHoursChanged('${e.id}')">
        <div class="stf-hint" id="aw-${e.id}">${shiftInfoLine(e, salary)}</div></div>` : `
      <div><label class="stf-lbl">أيام الغياب — الجُمُع مش محسوبة ✅</label><input class="inp2" inputmode="numeric" id="a-${e.id}" value="${p && p.absDays ? p.absDays : ''}" placeholder="0" oninput="stfAbsChanged('${e.id}')">
        <div class="stf-hint" id="aw-${e.id}">${wageHint(salary)}</div></div>`}
      <div><label class="stf-lbl">الخصم — ثابت ولا بالساعة ولا باليوم؟</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="inp2" inputmode="decimal" id="d-${e.id}" value="${dedShow}" placeholder="0" oninput="stfDedChanged('${e.id}');stfCalcNet('${e.id}')" style="flex:1">
          <select class="inp2" id="du-${e.id}" onchange="stfDedUnitChanged('${e.id}')" style="width:110px;padding:10px 8px">
            <option value="fixed" ${du === 'fixed' ? 'selected' : ''}>مبلغ ثابت</option>
            <option value="hour" ${du === 'hour' ? 'selected' : ''}>بالساعة</option>
            <option value="day" ${du === 'day' ? 'selected' : ''}>باليوم</option>
          </select>
        </div>
        <div class="stf-hint" id="dh-${e.id}"></div></div>
      <div id="fr-${e.id}"><label class="stf-lbl">${numDedTxt(e.id)}</label><input class="inp2" id="r-${e.id}" value="${esc(reason)}" placeholder="مثال: غياب يومين" ${cslNum(deduction) ? '' : 'disabled'}></div>
      <div><label class="stf-lbl">مكافأة (${curSym()})</label><input class="inp2" inputmode="decimal" id="b-${e.id}" value="${bonus || ''}" placeholder="0" oninput="stfBonusChanged('${e.id}')">
        <div class="stf-hint" style="color:var(--gold)" id="bh-${e.id}"></div></div>
      <div><label class="stf-lbl">تاريخ القبض</label><input type="date" class="inp2" id="dt-${e.id}" value="${payDate}"></div>
    </div>
    ${shiftOf(e) ? stfCalcBox(e, p) : ''}
    <div class="stf-deserve" id="des-${e.id}"></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:12px">
      <div class="stf-netpill" style="flex:1" id="np-${e.id}">${fmt(net)} ${curSym()}<small>الصافي (يتحسب تلقائي)</small></div>
      <button class="btn btn-p" onclick="stfSavePay('${e.id}')">💾 حفظ</button>
    </div>
  </div>`;
}
function numDedTxt(empId) { return cslNum($('#d-' + empId)?.value) > 0 ? 'سبب الخصم' : 'سبب الخصم 🔒 (اتفتح لما تكتب خصم)'; }
/* تحويل قيمة الخصم لعملة العرض حسب الوحدة: ثابت / بالساعة / باليوم */
function stfDedPounds(empId) {
  const e = PR().emps.find(x => x.id === empId);
  const uEl = $('#du-' + empId);
  const u = uEl ? uEl.value : 'fixed';
  const v = cslNum($('#d-' + empId).value);
  if (u === 'hour' && e) return Math.round(v * hourRate(e, STF.month, $('#s-' + empId).value) * 100) / 100;
  if (u === 'day') return Math.round(v * dayWage($('#s-' + empId).value, STF.month) * 100) / 100;
  return v;
}
function stfDedChanged(empId) {
  const has = stfDedPounds(empId) > 0;
  const r = $('#r-' + empId);
  r.disabled = !has;
  if (!has) r.value = '';
  $('#fr-' + empId + ' .stf-lbl').textContent = has ? 'سبب الخصم' : 'سبب الخصم 🔒 (اتفتح لما تكتب خصم)';
  stfDedHint(empId);
}
function stfDedHint(empId) {
  const el = $('#dh-' + empId); if (!el) return;
  const e = PR().emps.find(x => x.id === empId);
  const uEl = $('#du-' + empId);
  const u = uEl ? uEl.value : 'fixed';
  const v = cslNum($('#d-' + empId).value);
  if (!v) { el.textContent = 'اكتب مبلغ أو عدد — والنظام بيحوّله لـ' + curSym() + ' حسب اختيارك'; return; }
  if (u === 'hour' && e) {
    const r = hourRate(e, STF.month, $('#s-' + empId).value);
    el.textContent = v + ' ساعة × ' + fmt(r) + ' ' + curSym() + ' = ' + fmt(Math.round(v * r * 100) / 100) + ' ' + curSym();
  } else if (u === 'day') {
    const w = dayWage($('#s-' + empId).value, STF.month);
    el.textContent = v + ' يوم × ' + fmt(w) + ' ' + curSym() + ' = ' + fmt(Math.round(v * w * 100) / 100) + ' ' + curSym();
  } else {
    el.textContent = 'مبلغ ثابت: ' + fmt(v) + ' ' + curSym();
  }
}
function stfDedUnitChanged(empId) { stfDedChanged(empId); stfCalcNet(empId); }
/* المستحق: اللي المفروض ياخده حسب الحضور — من غير خصومات يدوية ولا مكافآت */
function stfDeserveCalc(empId) {
  const e = PR().emps.find(x => x.id === empId); if (!e) return 0;
  const s = cslNum($('#s-' + empId).value);
  const hEl = $('#h-' + empId);
  if (hEl) {
    if (hEl.value.trim() === '') return s;
    const att = cslNum(hEl.value);
    return Math.round(att * hourRate(e, STF.month, s) * 100) / 100;
  }
  const aEl = $('#a-' + empId);
  if (aEl && cslNum(aEl.value) > 0) return Math.round((s - cslNum(aEl.value) * dayWage(s, STF.month)) * 100) / 100;
  return s;
}
function stfDeserveUI(empId) {
  const el = $('#des-' + empId); if (!el) return;
  el.innerHTML = '<span>🎯 المستحق: <b>' + fmt(stfDeserveCalc(empId)) + ' ' + curSym() + '</b></span><small>حسب الحضور — لو مكتبتش حاجة المستحق المرتب كامل</small>';
}
function stfCalcNet(empId) {
  const s = cslNum($('#s-' + empId).value), d = stfDedPounds(empId), b = cslNum($('#b-' + empId).value);
  $('#np-' + empId).innerHTML = fmt(s - d + b) + ' ' + curSym() + '<small>الصافي (يتحسب تلقائي)</small>';
  stfDeserveUI(empId);
}

/* ---------- حاسبة الساعات (ساعات × أيام) ---------- */
let STF_CALC = {};
function stfCalcKey(empId) { return empId + '|' + STF.month; }
function stfCalcRows(empId, p) {
  const k = stfCalcKey(empId);
  if (!STF_CALC[k]) {
    if (p && p.hoursAtt != null) {
      const e = PR().emps.find(x => x.id === empId);
      const sh = e && shiftOf(e);
      const per = sh ? shiftHours(sh) : 0;
      STF_CALC[k] = per ? [{ h: per, d: Math.round(cslNum(p.hoursAtt) / per * 100) / 100 }] : [{ h: '', d: '' }];
    } else STF_CALC[k] = [{ h: '', d: '' }];
  }
  return STF_CALC[k];
}
function stfCalcRowsHtml(empId) {
  const rows = STF_CALC[stfCalcKey(empId)] || [];
  return rows.map((r, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input class="inp2" inputmode="decimal" placeholder="ساعات" value="${r.h}" style="flex:1;padding:8px 10px" oninput="stfCalcChanged('${empId}',${i},'h',this.value)">
      <span style="color:var(--mut)">×</span>
      <input class="inp2" inputmode="decimal" placeholder="أيام" value="${r.d}" style="flex:1;padding:8px 10px" oninput="stfCalcChanged('${empId}',${i},'d',this.value)">
      <span style="font-size:.75rem;color:var(--mut);min-width:60px;text-align:center">= ${fmt(cslNum(r.h) * cslNum(r.d))} س</span>
      <button class="btn btn-r btn-s" style="padding:6px 9px" onclick="stfCalcDel('${empId}',${i})">✕</button>
    </div>`).join('');
}
function stfCalcChanged(empId, i, f, v) {
  const rows = STF_CALC[stfCalcKey(empId)]; if (!rows || !rows[i]) return;
  rows[i][f] = v;
  const t = $('#ctot-' + empId); if (t) t.textContent = stfCalcTotalTxt(empId);
  const rowEl = $('#crows-' + empId).children[i];
  if (rowEl) { const sp = rowEl.querySelectorAll('span'); if (sp[1]) sp[1].textContent = '= ' + fmt(cslNum(rows[i].h) * cslNum(rows[i].d)) + ' س'; }
}
function stfCalcTotalTxt(empId) {
  const rows = STF_CALC[stfCalcKey(empId)] || [];
  let t = 0; rows.forEach(r => t += cslNum(r.h) * cslNum(r.d));
  return 'المجموع: ' + fmt(Math.round(t * 100) / 100) + ' ساعة';
}
function stfCalcAdd(empId) {
  STF_CALC[stfCalcKey(empId)].push({ h: '', d: '' });
  $('#crows-' + empId).innerHTML = stfCalcRowsHtml(empId);
}
function stfCalcDel(empId, i) {
  const rows = STF_CALC[stfCalcKey(empId)];
  rows.splice(i, 1);
  if (!rows.length) rows.push({ h: '', d: '' });
  $('#crows-' + empId).innerHTML = stfCalcRowsHtml(empId);
  const t = $('#ctot-' + empId); if (t) t.textContent = stfCalcTotalTxt(empId);
}
function stfCalcAdopt(empId) {
  const rows = STF_CALC[stfCalcKey(empId)] || [];
  let t = 0; rows.forEach(r => t += cslNum(r.h) * cslNum(r.d));
  t = Math.round(t * 100) / 100;
  if (!t) return toast('⚠️ اكتب ساعات وأيام الأول');
  const hEl = $('#h-' + empId); if (!hEl) return;
  hEl.value = t;
  stfHoursChanged(empId);
  toast('☑️ اتسجل ' + fmt(t) + ' ساعة في خانة الحضور');
}
function stfCalcBox(e, p) {
  stfCalcRows(e.id, p);
  return `
  <div style="border:1.5px dashed var(--line);border-radius:12px;padding:10px 12px;margin-top:10px;background:var(--bg)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <b style="font-size:.82rem">🧮 حاسبة الساعات — ساعات × أيام</b>
      <button class="btn btn-o btn-s" onclick="stfCalcAdd('${e.id}')">➕ صف</button>
    </div>
    <div id="crows-${e.id}">${stfCalcRowsHtml(e.id)}</div>
    <div id="ctot-${e.id}" style="font-size:.85rem;font-weight:700;color:var(--teal);margin:8px 0">${stfCalcTotalTxt(e.id)}</div>
    <button class="btn btn-p btn-s" style="width:100%" onclick="stfCalcAdopt('${e.id}')">✅ سجّل المجموع في خانة الحضور</button>
  </div>`;
}
/* لما تكتب أيام الغياب: الخصم بيتحسب لوحده = عدد الأيام × قيمة اليوم */
function stfAbsChanged(empId) {
  let a = Math.floor(cslNum($('#a-' + empId).value));
  const wd = workDays(STF.month);
  if (a < 0) a = 0;
  if (a > wd) { a = wd; $('#a-' + empId).value = a; toast('⚠️ أقصى عدد أيام عمل في الشهر ده ' + wd + ' يوم'); }
  const dEl = $('#d-' + empId);
  const duEl = $('#du-' + empId); if (duEl) duEl.value = 'fixed';
  if (a > 0) {
    dEl.value = Math.round(a * dayWage($('#s-' + empId).value, STF.month) * 100) / 100;
    const rEl = $('#r-' + empId);
    if (!rEl.value.trim()) rEl.value = 'غياب ' + a + ' أيام';
  } else {
    $('#a-' + empId).value = '';
    dEl.value = '';
  }
  stfDedChanged(empId); stfCalcNet(empId);
}
/* لما تسجل الساعات الفعلية: النقصان = خصم تلقائي، والزيادة عن المفروض = مكافأة تلقائية */
function stfHoursChanged(empId) {
  const e = PR().emps.find(x => x.id === empId); if (!e || !shiftOf(e)) return;
  let att = cslNum($('#h-' + empId).value);
  const exp = expectedHours(e, STF.month);
  if (att < 0) { att = 0; $('#h-' + empId).value = 0; }
  const diff = Math.max(0, Math.round((exp - att) * 100) / 100);
  const ot = Math.max(0, Math.round((att - exp) * 100) / 100);
  const rate = hourRate(e, STF.month, $('#s-' + empId).value);
  const dEl = $('#d-' + empId);
  const duEl = $('#du-' + empId); if (duEl) duEl.value = 'fixed';
  if (diff > 0) {
    dEl.value = Math.round(diff * rate * 100) / 100;
    const rEl = $('#r-' + empId);
    if (!rEl.value.trim()) rEl.value = 'فرق ' + diff + ' ساعات عن المفترض';
  } else {
    dEl.value = '';
  }
  const bEl = $('#b-' + empId);
  const bh = $('#bh-' + empId);
  if (ot > 0) {
    const amt = Math.round(ot * rate * 100) / 100;
    bEl.value = amt;
    bEl.dataset.ot = '1';
    if (bh) bh.textContent = '⏱ زيادة ' + ot + ' ساعة عن المفروض = ' + fmt(amt) + ' ' + curSym() + ' — متحسبة كمكافأة';
  } else if (bEl.dataset.ot === '1') {
    bEl.value = ''; delete bEl.dataset.ot;
    if (bh) bh.textContent = '';
  }
  stfDedChanged(empId); stfCalcNet(empId);
}
function stfBonusChanged(empId) {
  const bEl = $('#b-' + empId);
  if (bEl.dataset.ot === '1') { delete bEl.dataset.ot; const bh = $('#bh-' + empId); if (bh) bh.textContent = ''; }
  stfCalcNet(empId);
}
function stfSalChanged(empId) {
  const e = PR().emps.find(x => x.id === empId);
  const aEl = $('#a-' + empId);
  if (aEl && cslNum(aEl.value) > 0) {
    const duEl = $('#du-' + empId); if (duEl) duEl.value = 'fixed';
    $('#d-' + empId).value = Math.round(cslNum(aEl.value) * dayWage($('#s-' + empId).value, STF.month) * 100) / 100;
    stfDedChanged(empId);
  }
  const hEl = $('#h-' + empId);
  if (hEl && shiftOf(e)) {
    stfHoursChanged(empId);
    $('#aw-' + empId).textContent = shiftInfoLine(e, $('#s-' + empId).value);
  } else {
    $('#aw-' + empId).textContent = wageHint($('#s-' + empId).value);
  }
  const duEl2 = $('#du-' + empId);
  if (duEl2 && duEl2.value !== 'fixed') stfDedChanged(empId);
  stfCalcNet(empId);
}

/* ---------- حفظ القبض (التخزين بيتم بالجنيه المصري دائماً) ---------- */
function stfSavePay(empId) {
  const s = cslNum($('#s-' + empId).value), d = stfDedPounds(empId), b = cslNum($('#b-' + empId).value);
  const reason = $('#r-' + empId).value.trim();
  const dt = $('#dt-' + empId).value;
  if (!s) return toast('⚠️ اكتب الراتب');
  if (d < 0 || b < 0) return toast('⚠️ الخصم والمكافأة مينفعش يكونوا بالسالب');
  if (d > 0 && !reason) return toast('⚠️ اكتب سبب الخصم');
  if (d > s) return toast('⚠️ الخصم أكبر من الراتب!');
  const ex = payOf(empId, STF.month);
  const e0 = PR().emps.find(x => x.id === empId);
  const aEl = $('#a-' + empId), hEl = $('#h-' + empId);
  const duEl = $('#du-' + empId);
  /* التحويل للجنيه عند الحفظ — العرض بأي عملة يفضل متاح */
  const sEgp = fromCur(s), dEgp = fromCur(d), bEgp = fromCur(b);
  const rec = { id: ex ? ex.id : uid('pay'), empId, month: STF.month, salary: sEgp, deduction: dEgp, dedUnit: duEl ? duEl.value : 'fixed', deductReason: d ? reason : '', bonus: bEgp, net: Math.round((sEgp - dEgp + bEgp) * 100) / 100, payDate: dt, absDays: aEl ? cslNum(aEl.value) : 0, hoursExp: hEl && e0 ? expectedHours(e0, STF.month) : null, hoursAtt: hEl ? cslNum(hEl.value) : null, updatedAt: Date.now() };
  if (ex) Object.assign(ex, rec); else PR().pays.push(rec);
  save(); renderStaff(); toast('✅ تم حفظ القبض');
}

/* ---------- شاشة الموظفون ---------- */
function renderStaff() {
  if (!STF.month) STF.month = curMonth();
  PR();
  const ses = session();
  const tabs = `
  <div class="tabs5" style="margin-bottom:14px">
    <button class="btn ${!STF.empId ? 'btn-p' : 'btn-o'}" onclick="stfGoList()">👥 الموظفون</button>
    <button class="btn ${STF.empId ? 'btn-p' : 'btn-o'}" onclick="stfGoPay()">💰 تسجيل القبض</button>
  </div>`;
  let body = '';
  if (STF.empId) body = stfPayView(); else body = stfEmpList();
  shell('الموظفون — الرواتب', tabs + body);
  if (!STF.empId) stfBindList(); else stfBindPay();
}
function stfGoList() { STF.empId = null; go('staff'); renderStaff(); }
function stfGoPay() { STF.empId = STF.empId || (PR().emps[0] && PR().emps[0].id) || null; go('staff'); renderStaff(); }
/* القائمة جنب بعضها في الموبايل: كل موظف صف — والدخول ليه شاشة فرعية للقبض */
function stfEmpList() {
  const emps = PR().emps;
  const m = STF.month;
  const totalSal = emps.filter(e => e.active !== false).reduce((a, e) => a + toCur(e.salary), 0);
  const paidCount = emps.filter(e => payOf(e.id, m)).length;
  return `
  <div class="stats">
    <div class="stat blue"><div class="v">${emps.length}</div><div class="l">موظف</div></div>
    <div class="stat green"><div class="v">${fmt(totalSal)}</div><div class="l">إجمالي الرواتب (${curSym()})</div></div>
    <div class="stat gold"><div class="v">${paidCount}/${emps.length}</div><div class="l">قبض ${monthLabel(m)}</div></div>
  </div>
  <div class="card"><h3>👥 الموظفون</h3>
    <div class="toolbar" style="margin-bottom:12px">
      <button class="btn btn-p btn-s" onclick="stfEmpModal()">➕ موظف جديد</button>
      <button class="btn btn-o btn-s" onclick="stfGoPay()">💰 تسجيل القبض</button>
      <button class="btn btn-o btn-s" onclick="stfCurModal()">💱 العملة: ${curSym()}</button>
    </div>
    ${emps.length ? `<table><tr><th>الاسم</th><th>الراتب (${curSym()})</th><th>الشيفت</th><th>حالة ${monthLabel(m)}</th><th>إجراءات</th></tr>
    ${emps.map(e => { const p = payOf(e.id, m); return `<tr>
      <td style="font-weight:700">${esc(e.name)}${e.active === false ? ' <span class="pill p-unpaid">موقوف</span>' : ''}${e.phone ? `<div class="mut" style="font-size:11px;font-weight:400">${esc(e.phone)}</div>` : ''}</td>
      <td class="num">${fmt(toCur(e.salary))}</td>
      <td style="font-size:11.5px">${shiftOf(e) ? esc(shiftLabel(e)) : '<span class="mut">بدون شيفت</span>'}</td>
      <td>${p ? '<span class="pill p-paid">قبض ✓</span>' : '<span class="pill p-unpaid">لسه</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-t btn-s" onclick="stfEmpModal('${e.id}')">تعديل</button>
        <button class="btn btn-p btn-s" onclick="STF.empId='${e.id}';renderStaff()">القبض</button>
        <button class="btn btn-r btn-s" onclick="stfDelEmp('${e.id}')">حذف</button>
      </td></tr>`; }).join('')}</table>` : '<div class="empty">لا يوجد موظفون بعد — دوس «موظف جديد» 👆</div>'}
  </div>`;
}
function stfBindList() {}
/* شاشة القبض: قائمة بأسماء الموظفين — والضغط يفتح شاشة فرعية لكل موظف */
function stfPayView() {
  const emps = PR().emps;
  const m = STF.month;
  let nav = '';
  { const d = new Date(); const months = []; for (let i = -2; i <= 3; i++) { const dd = new Date(d.getFullYear(), d.getMonth() + i, 1); months.push(dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0')); } nav = months; }
  const e = emps.find(x => x.id === STF.empId);
  const head = `
  <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 16px">
    <button class="btn btn-o btn-s" onclick="stfGoList()">→ رجوع للقائمة</button>
    <select class="inp2" style="flex:1;min-width:150px" onchange="STF.month=this.value;STF_CALC={};renderStaff()">
      ${nav.map(mm => `<option value="${mm}" ${mm === m ? 'selected' : ''}>${monthLabel(mm)}</option>`).join('')}
    </select>
    <button class="btn btn-o btn-s" onclick="stfCurModal()">💱 ${curSym()}</button>
  </div>`;
  if (!e) {
    return head + `<div class="card"><h3>💰 اختر موظف لتسجيل القبض — ${monthLabel(m)}</h3>
    ${emps.length ? emps.map(x => { const p = payOf(x.id, m); return `
      <div class="tile" style="margin-bottom:8px" onclick="STF.empId='${x.id}';renderStaff()">
        <span style="font-size:22px">👤</span>
        <div style="flex:1"><b>${esc(x.name)}</b><div style="font-size:12px;color:var(--mut)">${shiftOf(x) ? esc(shiftLabel(x)) : 'بدون شيفت'} · الراتب ${fmt(toCur(x.salary))} ${curSym()}</div></div>
        ${p ? '<span class="pill p-paid">قبض ✓</span>' : '<span class="pill p-unpaid">لسه</span>'}
      </div>`; }).join('') : '<div class="empty">مفيش موظفين — سجل موظف الأول من تبويب الموظفون</div>'}</div>`;
  }
  return head + stfPayCard(e);
}
function stfBindPay() {
  PR().emps.filter(e => e.active !== false).forEach(e => {
    if ($('#pc-' + e.id)) { stfDedHint(e.id); stfDeserveUI(e.id); }
  });
}

/* ---------- إضافة/تعديل موظف ---------- */
function stfEmpModal(id) {
  const e = id ? PR().emps.find(x => x.id === id) : null;
  const sh = e && e.shift ? e.shift : { type: 'morning', from: '09:00', to: '16:00', hours: '', days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'] };
  modal(`<h3>${e ? '✏️ تعديل موظف' : '➕ موظف جديد'}</h3>
  <div class="stf-grid">
    <div><label class="stf-lbl">الاسم</label><input class="inp2" id="em-name" value="${e ? esc(e.name) : ''}" placeholder="اسم الموظف"></div>
    <div><label class="stf-lbl">الراتب الشهري (${curSym()})</label><input class="inp2" inputmode="decimal" id="em-sal" value="${e ? toCur(e.salary) : ''}" placeholder="0"></div>
    <div><label class="stf-lbl">الموبايل (اختياري)</label><input class="inp2" inputmode="tel" id="em-phone" value="${e ? esc(e.phone || '') : ''}" placeholder="01xxxxxxxxx"></div>
    <div><label class="stf-lbl">تاريخ التعيين</label><input type="date" class="inp2" id="em-hire" value="${e && e.hireDate ? e.hireDate : today()}"></div>
  </div>
  <fieldset class="stf-fieldset"><legend>🕐 الشيفت (اختياري — لو سيبته فاضي الحساب بالأيام)</legend>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <select class="inp2" id="em-shtype" onchange="stfShTypeChange()" style="flex:1;min-width:120px">
        ${Object.keys(SHIFT_TYPES).map(t => `<option value="${t}" ${sh.type === t ? 'selected' : ''}>${SHIFT_TYPES[t]}</option>`).join('')}
      </select>
      <input type="time" class="inp2" id="em-shfrom" value="${sh.from || ''}" onchange="stfShTimeChange()">
      <span style="color:var(--mut)">إلى</span>
      <input type="time" class="inp2" id="em-shto" value="${sh.to || ''}" onchange="stfShTimeChange()">
      <input class="inp2" inputmode="decimal" id="em-shhours" value="${sh.hours || ''}" placeholder="ساعات/يوم" style="width:100px" oninput="$('#em-shhint').textContent=stfShiftHint()">
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">
      ${DOWS.map(d => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;font-weight:700;cursor:pointer"><input type="checkbox" class="em-shday" value="${d[0]}" ${(sh.days || []).includes(d[0]) ? 'checked' : ''}> ${d[1]}</label>`).join('')}
    </div>
    <div class="stf-hint" id="em-shhint">${stfShiftHint(sh)}</div>
  </fieldset>
  <div style="display:flex;gap:10px;margin-top:14px">
    <button class="btn btn-p" style="flex:1" onclick="stfSaveEmp('${id || ''}')">💾 حفظ</button>
    <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
  </div>`);
  setTimeout(() => { const h = $('#em-shhours'); if (h && !h.value) h.value = ''; }, 0);
}
function stfShTypeChange() {
  const t = $('#em-shtype').value;
  const pr = SHIFT_PRESETS[t] || { from: '', to: '' };
  if (pr.from) { $('#em-shfrom').value = pr.from; $('#em-shto').value = pr.to; }
  $('#em-shhint').textContent = stfShiftHint();
}
function stfShTimeChange() {
  $('#em-shtype').value = 'custom';
  $('#em-shhint').textContent = stfShiftHint();
}
function stfShiftHint(sh) {
  const g = id => $(id) ? $(id).value : null;
  const o = sh || { type: g('#em-shtype'), from: g('#em-shfrom'), to: g('#em-shto'), hours: g('#em-shhours') };
  const days = $$('.em-shday').filter(c => c.checked).map(c => c.value);
  if (!days.length) return '⚠️ اختار أيام الشيفت على الأقل';
  const hrs = cslNum(o.hours) || hoursBetween(o.from, o.to);
  const dc = shiftDayCount(STF.month || curMonth(), days);
  return 'ساعات الشيفت: ' + hrs + ' ساعة/يوم · الأيام المختارة: ' + days.length + ' أيام/أسبوع · المفترض في ' + monthLabel(STF.month || curMonth()) + ': ' + Math.round(dc * hrs * 100) / 100 + ' ساعة';
}
function stfSaveEmp(id) {
  const name = $('#em-name').value.trim();
  const sal = cslNum($('#em-sal').value);
  if (!name) return toast('⚠️ اكتب اسم الموظف');
  if (!sal) return toast('⚠️ اكتب الراتب');
  const days = $$('.em-shday').filter(c => c.checked).map(c => c.value);
  const shift = days.length ? { type: $('#em-shtype').value, from: $('#em-shfrom').value, to: $('#em-shto').value, hours: cslNum($('#em-shhours').value) || undefined, days } : undefined;
  const salEgp = fromCur(sal);
  if (id) {
    const e = PR().emps.find(x => x.id === id); if (!e) return;
    e.name = name; e.salary = salEgp; e.phone = $('#em-phone').value.trim(); e.hireDate = $('#em-hire').value;
    if (shift) e.shift = shift; else delete e.shift;
    e.updatedAt = Date.now();
  } else {
    PR().emps.push({ id: uid('emp'), name, salary: salEgp, phone: $('#em-phone').value.trim(), hireDate: $('#em-hire').value, shift, active: true, createdAt: Date.now(), updatedAt: Date.now() });
  }
  save(); closeModal(); renderStaff(); toast('✅ تم حفظ الموظف');
}
function stfDelEmp(id) {
  const e = PR().emps.find(x => x.id === id); if (!e) return;
  if (!confirm('حذف «' + e.name + '» نهائياً؟ قبضه السابق هيتحذف برضه')) return;
  DB.payroll.emps = PR().emps.filter(x => x.id !== id);
  DB.payroll.pays = PR().pays.filter(p => p.empId !== id);
  save(); renderStaff(); toast('🗑️ تم الحذف');
}

/* ---------- العملات ---------- */
function stfCurModal() {
  const s = PR().settings;
  const rates = fxRates();
  modal(`<h3>💱 العملة</h3>
  <p style="font-size:12.5px;color:var(--mut);margin-bottom:12px">اختار عملة العرض — كل المبالغ (رواتب وخصومات وقبض) هتتحول تلقائياً للعملة الجديدة بالسعر اللي تحدده. السعر = كام جنيه يصرف الدولار/الريال الواحد.</p>
  <div class="stf-grid">
    <div><label class="stf-lbl">العملة</label>
      <select class="inp2" id="cur-sel" onchange="stfCurToggle()">
        ${Object.keys(CURRENCIES).map(c => `<option value="${c}" ${s.currency === c ? 'selected' : ''}>${CURRENCIES[c]}</option>`).join('')}
      </select></div>
    <div id="cur-rate-wrap" style="${s.currency === 'EGP' ? 'display:none' : ''}"><label class="stf-lbl">سعر الصرف (1 ${s.currency} = كام ج.م)</label><input class="inp2" inputmode="decimal" id="cur-rate" value="${rates[s.currency] || ''}"></div>
  </div>
  <div style="display:flex;gap:10px;margin-top:14px">
    <button class="btn btn-p" style="flex:1" onclick="stfSaveCur()">💾 حفظ التحويل</button>
    <button class="btn btn-o" onclick="closeModal()">إلغاء</button>
  </div>`);
}
function stfCurToggle() {
  const c = $('#cur-sel').value;
  $('#cur-rate-wrap').style.display = c === 'EGP' ? 'none' : '';
  if (c !== 'EGP') $('#cur-rate').value = fxRates()[c] || '';
}
function stfSaveCur() {
  const s = PR().settings;
  const nc = $('#cur-sel').value;
  if (nc !== 'EGP') {
    const r = cslNum($('#cur-rate').value);
    if (!r) return toast('⚠️ اكتب سعر الصرف');
    s.fx = s.fx || {}; s.fx[nc] = r;
  }
  if (nc !== s.currency) {
    /* التخزين دايماً بالجنيه المصري — تغيير العملة بيغير العرض بس، فكل المبالغ (قديمة وجديدة) بتظهر بالعملة المختارة فوراً */
    s.currency = nc;
    s.updatedAt = Date.now();
    toast('💱 العرض بقى بـ' + CURRENCIES[nc] + ' — كل المبالغ اتحولت للمقابل بالسعر اللي حددته');
  }
  save(); closeModal(); renderStaff();
}

/* ---------- ستايل خاص بالرواتب ---------- */
(function stfCss() {
  const st = document.createElement('style');
  st.textContent = `
  .stf-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
  @media(max-width:720px){.stf-grid{grid-template-columns:1fr}}
  .stf-lbl{display:block;font-size:12.5px;font-weight:700;color:var(--mut);margin-bottom:5px}
  .stf-hint{font-size:.72rem;color:var(--mut);margin-top:5px;line-height:1.7}
  .stf-fieldset{border:1.5px dashed var(--line);border-radius:12px;padding:12px;margin-top:14px}
  .stf-fieldset legend{font-size:12.5px;font-weight:800;color:var(--navy);padding:0 6px}
  .stf-deserve{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#fff8e6;border:1px solid #f0dfae;color:#8a6d1a;padding:10px 14px;border-radius:12px;font-weight:700;font-size:.9rem;margin-top:12px;flex-wrap:wrap}
  .stf-deserve small{font-weight:500;font-size:.7rem}
  .stf-netpill{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;border-radius:14px;padding:13px 18px;font-size:19px;font-weight:800;text-align:center}
  .stf-netpill small{display:block;font-size:.68rem;font-weight:500;opacity:.75;margin-top:2px}
  .stf-paycard h3{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  `;
  document.head.appendChild(st);
})();
