// 腾讯系看板：批量整格格式 wrapper 逻辑测试（需 jsdom 提供 DOM）
// 复制 txWrapWholeCell / txToggleDeco / txStripTags 的实现，验证：
//   - 加粗后再改字体不互相覆盖（核心 bug）
//   - 各属性 toggle 正确
//   - 复用同一 wrapper 不嵌套
const path = require('path');
const { JSDOM } = require(path.join('C:\\Users\\joesyang\\.workbuddy\\binaries\\node\\workspace\\node_modules', 'jsdom'));
const dom = new JSDOM('<!DOCTYPE html><body></body>');
global.document = dom.window.document;

const TX_SIZE_PX = { '1': '10px', '2': '13px', '3': '14px', '4': '16px', '5': '20px', '6': '24px', '7': '32px' };

function txWrapWholeCell(html, type, value) {
    const tmp = document.createElement('div');
    tmp.innerHTML = (html || '').trim();
    let wrap = tmp.firstElementChild;
    if (!(wrap && wrap.classList && wrap.classList.contains('tx-cellfmt') && tmp.children.length === 1)) {
        wrap = document.createElement('div');
        wrap.className = 'tx-cellfmt';
        wrap.innerHTML = html || '';
    }
    const st = wrap.style;
    switch (type) {
        case 'bold':         st.fontWeight = st.fontWeight === '700' ? '' : '700'; break;
        case 'italic':       st.fontStyle = st.fontStyle === 'italic' ? '' : 'italic'; break;
        case 'underline':    txToggleDeco(st, 'underline'); break;
        case 'strikeThrough':txToggleDeco(st, 'line-through'); break;
        case 'fontName':     st.fontFamily = value || ''; break;
        case 'foreColor':    st.color = value || ''; break;
        case 'fontSize':     st.fontSize = TX_SIZE_PX[value] || '14px'; break;
        case 'lineHeight':   st.lineHeight = value || ''; break;
        case 'removeFormat': return txStripTags(html);
        default: return html;
    }
    if (!wrap.getAttribute('style')) return wrap.innerHTML;
    return wrap.outerHTML;
}
function txToggleDeco(st, deco) {
    const cur = (st.textDecoration || st.textDecorationLine || '').split(/\s+/).filter(Boolean);
    const idx = cur.indexOf(deco);
    if (idx >= 0) cur.splice(idx, 1); else cur.push(deco);
    st.textDecoration = cur.join(' ');
}
function txStripTags(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    return d.textContent || '';
}

const assert = require('assert');
let pass = 0;
function t(name, fn) { fn(); console.log('  ✓ ' + name); pass++; }

console.log('批量整格格式 wrapper 测试：');

t('纯文本加粗 → 包 wrapper 且 font-weight:700', () => {
    const out = txWrapWholeCell('游戏中黑屏', 'bold');
    assert.ok(/font-weight:\s*700/.test(out), out);
    assert.ok(out.includes('游戏中黑屏'));
});

t('★核心：加粗后再改字体，两者都在（不互相覆盖）', () => {
    let h = txWrapWholeCell('文本', 'bold');
    h = txWrapWholeCell(h, 'fontName', 'SimSun');
    assert.ok(/font-weight:\s*700/.test(h), '加粗丢了: ' + h);
    assert.ok(/font-family:\s*SimSun/.test(h), '字体没生效: ' + h);
});

t('★核心：改字体后再改字号再改颜色，三者叠加', () => {
    let h = txWrapWholeCell('x', 'fontName', 'Arial');
    h = txWrapWholeCell(h, 'fontSize', '5');
    h = txWrapWholeCell(h, 'foreColor', '#ff0000');
    assert.ok(/font-family:\s*Arial/.test(h), h);
    assert.ok(/font-size:\s*20px/.test(h), h);
    assert.ok(/color:\s*(#ff0000|rgb\(255, 0, 0\))/.test(h), h);
});

t('复用同一 wrapper，不会嵌套多层 div', () => {
    let h = txWrapWholeCell('x', 'bold');
    h = txWrapWholeCell(h, 'italic');
    const cnt = (h.match(/tx-cellfmt/g) || []).length;
    assert.strictEqual(cnt, 1, '出现多层 wrapper: ' + h);
});

t('加粗 toggle：再点一次取消，且无残留 style 时拆掉容器', () => {
    let h = txWrapWholeCell('abc', 'bold');
    h = txWrapWholeCell(h, 'bold');
    assert.ok(!/font-weight/.test(h), h);
    assert.strictEqual(h, 'abc'); // 无样式 → 还原裸文本
});

t('下划线 + 删除线可共存', () => {
    let h = txWrapWholeCell('x', 'underline');
    h = txWrapWholeCell(h, 'strikeThrough');
    assert.ok(/underline/.test(h) && /line-through/.test(h), h);
});

t('下划线 toggle 取消只去掉下划线，保留删除线', () => {
    let h = txWrapWholeCell('x', 'underline');
    h = txWrapWholeCell(h, 'strikeThrough');
    h = txWrapWholeCell(h, 'underline');
    assert.ok(!/underline/.test(h), h);
    assert.ok(/line-through/.test(h), h);
});

t('清除格式 → 回纯文本', () => {
    let h = txWrapWholeCell('x', 'bold');
    h = txWrapWholeCell(h, 'fontName', 'Arial');
    const plain = txWrapWholeCell(h, 'removeFormat');
    assert.strictEqual(plain, 'x');
});

console.log(`\n全部 ${pass} 项通过 ✅`);
