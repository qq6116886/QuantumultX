// ==UserScript==
// @name LEIBAO
// @namespace http://tampermonkey.net/
// @version 1.0
// @description 融合课后测试与wxExam单独答题，联网导入xlsx/xls题库，自动答题、自动跳题、回写页面答案
// @match *://v4.21tb.com/courseCenter/*
// @match *://*/wxExam/*
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_registerMenuCommand
// @require https://fastly.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @run-at document-idle
// ==/UserScript==

(function () {
'use strict';

const isCourseCenter = /courseCenter/i.test(location.href);
const isWxExam = /wxExam/i.test(location.href);
if (!isCourseCenter && !isWxExam) return;

const CONFIG = { autoNext: true, interval: 200, nextDelay: 1000 };
let answerBank = GM_getValue('answerBank', {});
let lastQuestionKey = '';
let paused = false;

// ================== 通用工具 ==================
function normalize(s) {
return (s || '').replace(/\s+/g, '').replace(/[，。、；：？！""''（）()《》【】]/g, '').toLowerCase();
}

function lookupLocal(text) {
if (!text) return '';
const cleanText = text.replace(/[\s\n\r]/g, '');
if (answerBank[cleanText]) return answerBank[cleanText];
const nt = normalize(text);
for (const k in answerBank) { if (normalize(k) === nt) return answerBank[k]; }
for (const k in answerBank) {
const nk = normalize(k);
if (nk.length > 5 && (nt.includes(nk) || nk.includes(nt))) return answerBank[k];
}
return '';
}

function formatAnswerDisplay(answer, opts) {
if (!answer) return '';
if (answer.length > 1) return answer;
const letter = answer[0].toUpperCase();

if (opts && opts.length > 0) {
for (const o of opts) {
if (o.label && o.label.toUpperCase() === letter) {
const desc = (o.desc || '').trim();
if (desc) return letter + '. ' + desc;
}
}
const idx = letter.charCodeAt(0) - 65;
const o = opts[idx];
if (o) {
const desc = (o.desc || o.text || '').trim();
const clean = desc.replace(new RegExp('^[A-Z][\\s\\.\\、\\：\\:]?', 'i'), '').trim();
if (clean) return letter + '. ' + clean;
}
return letter;
}
if (letter === 'A') return 'A. 正确';
if (letter === 'B') return 'B. 错误';
return letter;
}

function fullClick(el) {
if (!el) return;
const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
const x = rect.left + rect.width / 2;
const y = rect.top + rect.height / 2;

const fire = (type, Ctor, extra) => {
try {
const ev = new Ctor(type, Object.assign({
bubbles: true, cancelable: true, view: window,
clientX: x, clientY: y
}, extra || {}));
el.dispatchEvent(ev);
} catch (e) {}
};

if (typeof PointerEvent !== 'undefined') {
try { fire('pointerdown', PointerEvent, { pointerType: 'mouse', isPrimary: true }); } catch (e) {}
}
if (typeof TouchEvent !== 'undefined') {
try {
const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
el.dispatchEvent(new TouchEvent('touchstart', {
bubbles: true, cancelable: true, view: window,
touches: [touch], targetTouches: [touch], changedTouches: [touch]
}));
el.dispatchEvent(new TouchEvent('touchend', {
bubbles: true, cancelable: true, view: window,
touches: [], targetTouches: [], changedTouches: [touch]
}));
} catch (e) {}
}
try { fire('mousedown', MouseEvent); } catch (e) {}
try { fire('mouseup', MouseEvent); } catch (e) {}
try { el.click(); } catch (e) {}
}

// ================== 站点：courseCenter（课后测试） ==================
function ccGetCurrentItem() {
const items = Array.from(document.querySelectorAll('.pretest-item'));
if (!items.length) return null;
const winH = window.innerHeight || document.documentElement.clientHeight;
const winW = window.innerWidth || document.documentElement.clientWidth;
const windowCenterY = winH / 2;

let bestItem = null;
let minDistance = Infinity;

for (const el of items) {
const s = window.getComputedStyle(el);
if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.1) continue;

const rect = el.getBoundingClientRect();
if (rect.width < 50 || rect.height < 50) continue;
if (rect.bottom <= 0 || rect.top >= winH) continue;

const centerY = rect.top + rect.height / 2;
const distance = Math.abs(centerY - windowCenterY);

if (distance < minDistance) {
minDistance = distance;
bestItem = el;
}
}
return bestItem;
}

function ccGetOptions(item) {
return Array.from(item.querySelectorAll('.pretest-option')).map(opt => {
const labelEl = opt.querySelector('.option-label');
const descEl = opt.querySelector('.option-desc');

const label = (labelEl?.textContent || '').replace(/[^A-Za-z]/g, '').toUpperCase();
let desc = (descEl?.textContent || opt.textContent || '')
.replace(/^[A-Z][\s\.\、\：\:]*/i, '')
.trim();

return { el: opt, label, desc };
});
}

function tickCourseCenter() {
const item = ccGetCurrentItem();
if (!item) return;
const qEl = item.querySelector('.title-content');
if (!qEl) return;
const text = qEl.textContent.trim();
if (!text) return;

const nEl = item.querySelector('.title-order');
const num = nEl ? nEl.textContent.trim() : '';

setQNum(num || '-');

const key = num + '|' + text;
if (key === lastQuestionKey) return;

// 空库拦截：如果题库被清空了，停止自动作答
if (Object.keys(answerBank).length === 0) {
setAnswer('');
return;
}

const answer = lookupLocal(text);
if (!answer) {
setAnswer('');
lastQuestionKey = key;
return;
}

const opts = ccGetOptions(item);
if (!opts.length) return;

setAnswer(formatAnswerDisplay(answer, opts));

const upper = answer.toUpperCase();
let clicked = false;

opts.forEach(o => {
if (!o.label) return;
const cleanLabel = o.label.replace(/[^A-Za-z]/g, '').toUpperCase();
if (cleanLabel && upper.includes(cleanLabel)) {
fullClick(o.el);
clicked = true;
}
});

if (clicked) {
lastQuestionKey = key;
setSource('已自动选中');

if (CONFIG.autoNext) {
setTimeout(() => {
let next = Array.from(item.querySelectorAll('button, .btn, [role="button"], div'))
.find(b => {
const t = (b.textContent || '').trim();
const r = b.getBoundingClientRect();
if (r.width > 300 || r.height > 100) return false;
return (t === '下一题' || t === '下一页' || t === '下一题 >') && !b.disabled;
});

if (!next) {
next = Array.from(document.querySelectorAll('button, .btn, [role="button"], div'))
.find(b => {
const t = (b.textContent || '').trim();
const r = b.getBoundingClientRect();
if (r.width > 300 || r.height > 100 || r.width < 20) return false;
if (b.closest('.pretest-option')) return false;
return (t === '下一题' || t === '下一页' || t === '下一题 >') && !b.disabled;
});
}

if (next) {
fullClick(next);
} else {
setSource('已答完，请手动交卷');
}
}, CONFIG.nextDelay);
}
} else {
setSource('⚠️ 选项未匹配，需手动');
lastQuestionKey = key;
}
}

// ================== 站点：wxExam（单独答题） ==================
function wxGetOptions() {
const qText = (document.querySelector('.title-cont')?.textContent || '').trim();
let nodes = [];
const area = document.querySelector('.answer-finish');
if (area) nodes = Array.from(area.querySelectorAll('li'));
if (!nodes.length) nodes = Array.from(document.querySelectorAll('.option-item'));
if (!nodes.length) nodes = Array.from(document.querySelectorAll('.choice-item'));
if (!nodes.length) {
nodes = Array.from(document.querySelectorAll('li')).filter(el => /^[A-Z][\s\.\、]/.test(el.textContent.trim()));
}
const res = [];
for (const el of nodes) {
const t = el.textContent.trim().replace(/^[\s✔✅]+/g, '').replace(/\s+/g, ' ');
if (!t) continue;
if (t.includes('正确答案') || t.includes('评卷')) continue;
if (t === qText) continue;

const match = t.match(/^([A-Z])[\s\.\、\：\:]*(.*)/i);
let label = '';
let desc = t;
if (match) {
label = match[1].toUpperCase();
desc = match[2].trim();
} else {
label = String.fromCharCode(65 + res.length);
}

res.push({ el, text: t, label, desc });
}
return res;
}

function wxGetPageAnswer() {
const el = document.querySelector('.answer-right');
if (!el) return '';
const m = (el.textContent || '').match(/正确答案[：:]\s*([A-Za-z,，、\s]+)/);
return m ? m[1].replace(/[^A-Za-z]/g, '').toUpperCase() : '';
}

function wxClickAnswer(answer) {
if (!answer) return false;
const opts = wxGetOptions();
if (!opts.length) return false;

let clicked = false;
for (const letter of answer.split('')) {
let el = null;
for (const o of opts) {
if (o.label === letter) { el = o.el; break; }
}
if (!el) {
const idx = letter.charCodeAt(0) - 65;
if (opts[idx]) el = opts[idx].el;
}
if (el) { fullClick(el); clicked = true; }
}
return clicked;
}

function wxClickNext() {
const mediumBtns = Array.from(document.querySelectorAll('.but-medium'));
for (const btn of mediumBtns) {
const t = (btn.textContent || '').replace(/\s+/g, '').trim();
if (t === '下一题' || t === '下一页' || t === '下一步') {
const target = btn.firstElementChild || btn;
fullClick(target);
return true;
}
}

const all = Array.from(document.querySelectorAll('div, span, button, a, input'));
const matches = [];
for (const el of all) {
let t = '';
if (el.tagName === 'INPUT') t = (el.value || '').replace(/\s+/g, '').trim();
else t = (el.textContent || '').replace(/\s+/g, '').trim();

if (!t || t.length > 8) continue;
if (t === '下一题' || t === '下一页' || t === '下一步' ||
t === '下一题>' || t === '下一页>') {
const r = el.getBoundingClientRect();
if (r.width < 8 || r.height < 8) continue;
if (r.width > 800 || r.height > 200) continue;
matches.push(el);
}
}
if (matches.length) {
matches.sort((a, b) => a.children.length - b.children.length);
fullClick(matches[0]);
return true;
}
return false;
}

let pendingNext = null;

function tickWxExam() {
const tEl = document.querySelector('.title-cont');
if (!tEl) return;
const text = tEl.textContent.trim();
if (!text) return;

const nEl = document.querySelector('.top-span2');
let num = nEl ? nEl.textContent.trim() : '';
if (!num) {
const m = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/);
if (m) num = m[0];
}
setQNum(num || '-');

const key = num + '|' + text;

if (pendingNext) {
if (pendingNext.key === key) {
const now = Date.now();
if (now < pendingNext.notBefore) return;
if (now - (pendingNext.lastClickAt || 0) < 400) return;

pendingNext.attempts++;
if (pendingNext.attempts > 6) {
setSource('⚠️ 下一题按钮点击无效，请手动');
pendingNext = null;
return;
}
pendingNext.lastClickAt = now;

const ok = wxClickNext();
if (ok) {
setSource(`自动跳题中 (${pendingNext.attempts})`);
} else {
setSource('⚠️ 下一题按钮未找到');
pendingNext = null;
}
return;
} else {
pendingNext = null;
}
}

if (key === lastQuestionKey) return;

// 空库拦截：如果题库彻底为空，不执行任何提取和作答
if (Object.keys(answerBank).length === 0) {
setAnswer('');
setSource('-');
return;
}

const pageAnswer = wxGetPageAnswer();
if (pageAnswer) {
const cleanText = text.replace(/[\s\n\r]/g, '');
if (answerBank[cleanText] !== pageAnswer) {
answerBank[cleanText] = pageAnswer;
GM_setValue('answerBank', answerBank);
updateCount();
}
}

const answer = lookupLocal(text) || pageAnswer;
if (!answer) { setAnswer(''); return; }

const opts = wxGetOptions();
if (!opts.length) return;

setAnswer(formatAnswerDisplay(answer, opts));

const ok = wxClickAnswer(answer);
if (!ok) {
setSource('⚠️ 选项未匹配，稍后重试');
return;
}

lastQuestionKey = key;
setSource('已自动选中');

if (CONFIG.autoNext) {
pendingNext = {
key,
attempts: 0,
notBefore: Date.now() + CONFIG.nextDelay,
lastClickAt: 0
};
}
}

// ================== 主循环 & 实时监听 ==================
let throttleTimer = null;
function tick() {
if (paused) return;
try {
if (isCourseCenter) tickCourseCenter();
else if (isWxExam) tickWxExam();
} catch (e) {
console.error('[AutoAnswer]', e);
}
}

setInterval(tick, CONFIG.interval);

function observePage() {
if (!document.body) return;
const observer = new MutationObserver(() => {
if (paused) return;
if (throttleTimer) return;
throttleTimer = setTimeout(() => {
throttleTimer = null;
tick();
}, 50);
});
observer.observe(document.body, {
childList: true,
subtree: true,
characterData: true,
attributes: true
});
}
if (document.body) observePage();
else window.addEventListener('load', observePage);

// ================== 题库导入 ==================
function buildBankFromRows(rows) {
const bank = {};
for (let i = 0; i < rows.length; i++) {
const row = rows[i];
if (!row || !row.length) continue;
let typeIdx = -1;
for (let j = 0; j < row.length; j++) {
const cell = String(row[j] || '').trim();
if (cell.includes('单选') || cell.includes('多选') || cell.includes('复选') || cell.includes('判断')) {
typeIdx = j;
break;
}
}
if (typeIdx === -1) continue;
const valid = [];
for (let j = typeIdx; j < row.length; j++) {
const v = String(row[j] || '').trim();
if (v !== '') valid.push(v);
}
if (valid.length < 3) continue;
const q = valid[1];
const a = valid[2];
if (!q || !a) continue;
if (q.includes('题干') || q.includes('题目*')) continue;
let cleanA = a.replace(/[^A-Za-z]/g, '').toUpperCase();
if (!cleanA) {
if (a.includes('正确') || a === '对' || a === '√') cleanA = 'A';
else if (a.includes('错误') || a === '错' || a === '×') cleanA = 'B';
}
if (cleanA) bank[q.replace(/[\s\n\r]/g, '')] = cleanA;
}
return bank;
}

function applyBank(bank) {
const n = Object.keys(bank).length;
if (!n) { alert('❌ 未解析到有效题目，请检查文件格式（需含"题型/题干/答案"列）'); return; }
answerBank = Object.assign({}, answerBank, bank);
GM_setValue('answerBank', answerBank);
updateCount();
alert(`✅ 导入成功！本次读取：${n} 条。\n当前题库：${Object.keys(answerBank).length} 条。`);
}

async function importFile(file) {
if (!file) return;
const name = file.name;

if (/\.(xlsx|xls)$/i.test(name)) {
if (!window.XLSX) {
alert('⚠️ Excel 解析库尚未加载（需要联网），请稍等几秒后重试。');
return;
}
try {
setSource('解析Excel...');
const ab = await file.arrayBuffer();
const wb = window.XLSX.read(ab, { type: 'array' });
const bank = {};
for (const sn of wb.SheetNames) {
const ws = wb.Sheets[sn];
if (!ws) continue;
const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
Object.assign(bank, buildBankFromRows(rows));
}
applyBank(bank);
setSource('导入完成');
} catch (e) {
setSource('解析失败');
alert('Excel 解析失败：' + e.message);
}
return;
}

if (/\.json$/i.test(name)) {
try {
const txt = await file.text();
const obj = JSON.parse(txt);
const bank = {};
for (const k in obj) {
const v = String(obj[k] || '').replace(/[^A-Za-z]/g, '').toUpperCase();
if (k && v) bank[k.replace(/[\s\n\r]/g, '')] = v;
}
applyBank(bank);
setSource('导入完成');
} catch (e) {
setSource('解析失败');
alert('JSON 解析失败：' + e.message);
}
return;
}

const reader = new FileReader();
reader.onload = () => {
try {
const bank = {};
const lines = String(reader.result).split(/\r?\n/);
for (const line of lines) {
if (!line.trim()) continue;
const parts = line.split(/\t|,|\||=>/);
if (parts.length < 2) continue;
const q = parts[0].trim().replace(/^["']|["']$/g, '').replace(/[\s\n\r]/g, '');
const a = parts[1].trim().replace(/[^A-Za-z]/g, '').toUpperCase();
if (q && a && !/^题目$|^问题$|^题干$/i.test(q)) bank[q] = a;
}
applyBank(bank);
setSource('导入完成');
} catch (e) {
setSource('解析失败');
alert('解析出现异常，请重试。');
}
};
reader.readAsText(file, 'utf-8');
}

function openImportDialog() {
const input = document.createElement('input');
input.type = 'file';
input.accept = '.json,.csv,.txt,.xlsx,.xls';
input.onchange = () => importFile(input.files[0]);
input.click();
}

function clearBank() {
answerBank = {};
GM_setValue('answerBank', {});
updateCount();

lastQuestionKey = '';
pendingNext = null;

setAnswer('');
setSource('已彻底清空');

setTimeout(() => { setSource('-'); }, 2000);
}

// ================== 悬浮面板 ==================
const panel = document.createElement('div');
panel.id = 'aa-panel';
panel.style.cssText = `
position:fixed;right:10px;top:45px;z-index:999999;
background:rgba(20,20,20,0.9);color:#fff;
border-radius:10px;font-size:12px;line-height:1.6;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
box-shadow:0 8px 24px rgba(0,0,0,.5);
overflow:hidden;user-select:none;width:210px;
backdrop-filter:blur(10px);
-webkit-backdrop-filter:blur(10px);
border:1px solid rgba(255,255,255,0.1);
`;

const modeLabel = isCourseCenter ? '课后测试' : '单独答题';

panel.innerHTML = `
<div id="aa-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;background:linear-gradient(90deg,#1677ff,#69b1ff);font-weight:bold;font-size:13px;color:#fff;">
<span>📚 LEIBAO · ${modeLabel}</span>
<span id="aa-arrow" style="transition:transform .2s;">▼</span>
</div>
<div id="aa-body" style="padding:10px 12px;">
<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#bbb;">题号</span><span id="aa-qnum" style="color:#fff;font-weight:bold;">-</span></div>
<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#bbb;">状态</span><span id="aa-status" style="color:#52c41a;font-weight:bold;">运行中</span></div>
<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#bbb;">题库</span><span id="aa-count" style="color:#69b1ff;font-weight:bold;">0 条</span></div>
<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#bbb;">来源</span><span id="aa-source" style="color:#faad14;">-</span></div>
<div style="margin-bottom:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;">
<div id="aa-answer" style="color:#fff;font-weight:bold;font-size:16px;background:#ff4d4f;padding:8px 12px;border-radius:6px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(255,77,79,0.3);text-align:center;">-</div>
</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;">
<button id="aa-import" style="flex:1;min-width:60px;cursor:pointer;border:none;border-radius:4px;padding:5px 8px;background:#1677ff;color:#fff;font-size:12px;">📥 导入</button>
<button id="aa-clear" style="flex:1;min-width:60px;cursor:pointer;border:none;border-radius:4px;padding:5px 8px;background:#ff4d4f;color:#fff;font-size:12px;">🗑️ 清空</button>
</div>
<div style="display:flex;gap:6px;margin-top:6px;">
<button id="aa-toggle" style="flex:1;cursor:pointer;border:none;border-radius:4px;padding:5px 8px;background:#faad14;color:#000;font-size:12px;">⏸️ 暂停</button>
<button id="aa-mini" style="flex:1;cursor:pointer;border:none;border-radius:4px;padding:5px 8px;background:#555;color:#fff;font-size:12px;white-space:nowrap;">收起</button>
</div>
</div>
`;

if (document.body) document.body.appendChild(panel);
else window.addEventListener('load', () => document.body.appendChild(panel));

const $ = id => panel.querySelector(id);
const headerEl = $('#aa-header');
const bodyEl = $('#aa-body');
const arrowEl = $('#aa-arrow');
const statusEl = $('#aa-status');
const countEl = $('#aa-count');
const sourceEl = $('#aa-source');
const answerEl = $('#aa-answer');
const qnumEl = $('#aa-qnum');
const toggleBtn = $('#aa-toggle');

let collapsed = false;
function setCollapsed(v) {
collapsed = v;
bodyEl.style.display = v ? 'none' : 'block';
arrowEl.style.transform = v ? 'rotate(-90deg)' : 'rotate(0deg)';
}
headerEl.onclick = () => setCollapsed(!collapsed);
$('#aa-mini').onclick = (e) => { e.stopPropagation(); setCollapsed(true); };

function setQNum(num) {
if (qnumEl.textContent !== num) qnumEl.textContent = num;
}
function updateCount() {
countEl.textContent = Object.keys(answerBank).length + ' 条';
}
function setAnswer(text) {
if (!text) {
answerEl.textContent = '未找到';
answerEl.style.background = '#333';
answerEl.style.color = '#888';
answerEl.style.boxShadow = 'none';
} else {
answerEl.textContent = text;
answerEl.style.background = '#ff4d4f';
answerEl.style.color = '#fff';
answerEl.style.boxShadow = '0 4px 12px rgba(255,77,79,0.3)';
}
}
function setSource(s) {
sourceEl.textContent = s || '-';
}

updateCount();

$('#aa-import').onclick = openImportDialog;
$('#aa-clear').onclick = clearBank;

toggleBtn.onclick = () => {
paused = !paused;
CONFIG.autoNext = !paused;
statusEl.textContent = paused ? '已暂停' : '运行中';
statusEl.style.color = paused ? '#ff4d4f' : '#52c41a';
toggleBtn.textContent = paused ? '▶️ 继续' : '⏸️ 暂停';
toggleBtn.style.background = paused ? '#52c41a' : '#faad14';

if (!paused) {
lastQuestionKey = '';
tick();
}
};

GM_registerMenuCommand('📥 导入本地题库', openImportDialog);
GM_registerMenuCommand('🗑️ 清空本地题库', clearBank);
})();