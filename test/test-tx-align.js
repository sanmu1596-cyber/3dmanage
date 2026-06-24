// 腾讯系看板：单元格对齐逻辑单测（无需 DOM，纯验证数据 toggle + 样式拼接）
const assert = require('assert');

const TX_ALIGN_MAP = { justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right' };
const TX_VALIGN_MAP = { alignTop: 'top', alignMiddle: 'middle', alignBottom: 'bottom' };

// 模拟批量对齐写入逻辑（与 txApplyFormatToSelection 中对齐分支一致）
function applyAlign(rowObj, ci, type) {
    const isV = !!TX_VALIGN_MAP[type];
    const key = isV ? 'valigns' : 'aligns';
    const alignVal = isV ? TX_VALIGN_MAP[type] : TX_ALIGN_MAP[type];
    rowObj[key] = rowObj[key] || [];
    while (rowObj[key].length <= ci) rowObj[key].push('');
    const nextVal = (rowObj[key][ci] === alignVal) ? '' : alignVal;
    rowObj[key][ci] = nextVal;
    return nextVal;
}

// 模拟渲染样式拼接（与 renderTxBoard 中 td style 一致）
function cellStyle(row, ci) {
    const fill = (row.fills && row.fills[ci]) || '';
    const halign = (row.aligns && row.aligns[ci]) || '';
    const valign = (row.valigns && row.valigns[ci]) || '';
    let st = '';
    if (fill) st += `background:${fill};`;
    if (halign) st += `text-align:${halign};`;
    if (valign) st += `vertical-align:${valign};`;
    return st;
}

let pass = 0;
function t(name, fn) { fn(); console.log('  ✓ ' + name); pass++; }

console.log('对齐逻辑测试：');

t('居中对齐写入 aligns', () => {
    const row = { cells: ['x'] };
    applyAlign(row, 0, 'justifyCenter');
    assert.strictEqual(row.aligns[0], 'center');
});

t('居中后切左对齐 → 互斥覆盖（核心 bug 修复点）', () => {
    const row = { cells: ['x'] };
    applyAlign(row, 0, 'justifyCenter');
    applyAlign(row, 0, 'justifyLeft');
    assert.strictEqual(row.aligns[0], 'left'); // 不是嵌套，直接覆盖
});

t('左→右对齐互斥', () => {
    const row = { cells: ['x'] };
    applyAlign(row, 0, 'justifyLeft');
    applyAlign(row, 0, 'justifyRight');
    assert.strictEqual(row.aligns[0], 'right');
});

t('再点同一对齐 → 取消', () => {
    const row = { cells: ['x'] };
    applyAlign(row, 0, 'justifyCenter');
    const r2 = applyAlign(row, 0, 'justifyCenter');
    assert.strictEqual(r2, '');
    assert.strictEqual(row.aligns[0], '');
});

t('垂直对齐独立于水平对齐', () => {
    const row = { cells: ['x'] };
    applyAlign(row, 0, 'justifyCenter');
    applyAlign(row, 0, 'alignMiddle');
    assert.strictEqual(row.aligns[0], 'center');
    assert.strictEqual(row.valigns[0], 'middle');
});

t('垂直对齐三态互斥', () => {
    const row = { cells: ['x'] };
    applyAlign(row, 0, 'alignTop');
    applyAlign(row, 0, 'alignBottom');
    assert.strictEqual(row.valigns[0], 'bottom');
});

t('渲染样式：水平+垂直同时输出', () => {
    const row = { cells: ['x'], aligns: ['right'], valigns: ['middle'] };
    const st = cellStyle(row, 0);
    assert.ok(st.includes('text-align:right;'));
    assert.ok(st.includes('vertical-align:middle;'));
});

t('渲染样式：fill + 对齐共存不冲突', () => {
    const row = { cells: ['x'], fills: ['#ff0'], aligns: ['center'] };
    const st = cellStyle(row, 0);
    assert.ok(st.includes('background:#ff0;'));
    assert.ok(st.includes('text-align:center;'));
});

t('空对齐不产出样式', () => {
    const row = { cells: ['x'] };
    assert.strictEqual(cellStyle(row, 0), '');
});

console.log(`\n全部 ${pass} 项通过 ✅`);
