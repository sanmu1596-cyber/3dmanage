/**
 * GUI 测试脚本
 * 检查 HTML 元素完整性、必需元素是否存在、ID重复等问题
 */

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

const results = {
  passed: 0,
  failed: 0,
  warnings: [],
  errors: []
};

function assert(condition, name, details = '') {
  if (condition) {
    results.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    results.failed++;
    results.errors.push({ test: name, details });
    console.log(`  ❌ ${name}${details ? ': ' + details : ''}`);
  }
}

function warn(name) {
  results.warnings.push(name);
  console.log(`  ⚠️ ${name}`);
}

console.log('═'.repeat(60));
console.log('              GUI 测试报告');
console.log('═'.repeat(60));

// ==================== 1. 侧边栏菜单检查 ====================
console.log('\n📋 1. 侧边栏菜单检查\n');

const sidebarItems = [
  { tab: 'members', name: '成员管理' },
  { tab: 'devices', name: '设备管理' },
  { tab: 'games', name: '游戏管理' },
  { tab: 'tests', name: '测试记录' },
  { tab: 'bugs', name: '缺陷管理' },
  { tab: 'game-issues', name: '游戏问题' },
  { tab: 'equipment', name: '设备管理' },
  { tab: 'versions', name: '版本管理' },
  { tab: 'plans', name: '配置计划' },
  { tab: 'field-settings', name: '字段设置' },
  { tab: 'users', name: '用户管理' }
];

sidebarItems.forEach(item => {
  const regex = new RegExp(`data-tab=["']${item.tab}["']`);
  const exists = regex.test(html);
  assert(exists, `侧边栏: ${item.name} (${item.tab})`);
});

// ==================== 2. Section 元素检查 ====================
console.log('\n📦 2. Section 元素检查\n');

const sections = [
  'members-section',
  'devices-section',
  'games-section',
  'tests-section',
  'bugs-section',
  'game-issues-section',
  'equipment-section',
  'versions-section',
  'plans-section',
  'field-settings-section',
  'users-section'
];

sections.forEach(id => {
  const regex = new RegExp(`id=["']${id}["']`);
  const exists = regex.test(html);
  assert(exists, `Section: ${id}`);
});

// ==================== 3. 表格元素检查 ====================
console.log('\n📊 3. 表格元素检查\n');

const tables = [
  'members-table',
  'devices-table',
  'games-table',
  'tests-table',
  'bugs-table',
  'game-issues-table',
  'equipment-table',
  'versions-table',
  'plans-table',
  'users-table'
];

tables.forEach(id => {
  const regex = new RegExp(`id=["']${id}["']`);
  const exists = regex.test(html);
  assert(exists, `表格: ${id}`);
});

// ==================== 4. 弹窗 Modal 检查 ====================
console.log('\n🪟 4. 弹窗 Modal 检查\n');

const modals = [
  'member-modal',
  'device-modal',
  'game-modal',
  'test-modal',
  'bug-modal',
  'game-issue-modal',
  'equipment-modal',
  'version-modal'
];

modals.forEach(id => {
  const regex = new RegExp(`id=["']${id}["']`);
  const exists = regex.test(html);
  if (exists) {
    results.passed++;
    console.log(`  ✅ 弹窗: ${id}`);
  } else {
    warn(`弹窗可能缺失: ${id}`);
  }
});

// ==================== 5. 表单元素检查 ====================
console.log('\n📝 5. 关键表单元素检查\n');

const forms = [
  { id: 'game-issue-game-name', name: '游戏问题-游戏名称' },
  { id: 'game-issue-issue-type', name: '游戏问题-问题类型' },
  { id: 'game-issue-priority', name: '游戏问题-优先级' },
  { id: 'game-issue-owner', name: '游戏问题-负责人' },
  { id: 'game-issue-status', name: '游戏问题-状态' },
  { id: 'game-issue-desc', name: '游戏问题-描述' }
];

forms.forEach(item => {
  const regex = new RegExp(`id=["']${item.id}["']`);
  const exists = regex.test(html);
  assert(exists, `表单: ${item.name}`);
});

// ==================== 6. ID 重复检查 ====================
console.log('\n🔍 6. ID 重复检查\n');

const idRegex = /id=["']([^"']+)["']/g;
const ids = {};
let match;
while ((match = idRegex.exec(html)) !== null) {
  const id = match[1];
  if (ids[id]) {
    ids[id]++;
  } else {
    ids[id] = 1;
  }
}

const duplicates = Object.entries(ids).filter(([id, count]) => count > 1);
if (duplicates.length === 0) {
  results.passed++;
  console.log('  ✅ 无重复ID');
} else {
  duplicates.forEach(([id, count]) => {
    results.failed++;
    results.errors.push({ test: `ID重复: ${id}`, details: `出现${count}次` });
    console.log(`  ❌ ID重复: "${id}" 出现 ${count} 次`);
  });
}

// ==================== 7. 标签闭合检查 ====================
console.log('\n🏷️ 7. HTML 标签闭合检查\n');

const tagPairs = [
  ['<div', '</div>'],
  ['<section', '</section>'],
  ['<table', '</table>'],
  ['<tr', '</tr>'],
  ['<td', '</td>'],
  ['<th', '</th>'],
  ['<form', '</form>'],
  ['<select', '</select>'],
  ['<option', '</option>'],
  ['<ul', '</ul>'],
  ['<li', '</li>'],
  ['<span', '</span>'],
  ['<button', '</button>'],
  ['<a ', '</a>'],
  ['<label', '</label>'],
  ['<thead', '</thead>'],
  ['<tbody', '</tbody>']
];

tagPairs.forEach(([open, close]) => {
  const openCount = (html.match(new RegExp(open, 'gi')) || []).length;
  const closeCount = (html.match(new RegExp(close, 'gi')) || []).length;
  
  if (openCount === closeCount) {
    // 只报告重要的标签
    if (['<div', '<section', '<table', '<form'].includes(open)) {
      console.log(`  ✅ ${open.replace('<', '')} 标签匹配: ${openCount} 对`);
    }
  } else {
    warn(`${open} 标签不匹配: 开启 ${openCount}, 闭合 ${closeCount}`);
  }
});

// ==================== 8. JavaScript 函数检查 ====================
console.log('\n⚙️ 8. JavaScript 关键函数检查\n');

const jsPath = path.join(__dirname, 'public', 'app.js');
const js = fs.readFileSync(jsPath, 'utf-8');

const requiredFunctions = [
  'switchTab',
  'loadTabData',
  'loadGameIssues',
  'renderGameIssuesTable',
  'openGameIssueModal',
  'submitGameIssueForm',
  'deleteGameIssue',
  'filterGameIssues',
  'showToast',
  'escapeHtml',
  'authFetch'
];

requiredFunctions.forEach(fn => {
  const regex = new RegExp(`(function\\s+${fn}|const\\s+${fn}\\s*=|let\\s+${fn}\\s*=|async\\s+function\\s+${fn})`);
  const exists = regex.test(js);
  assert(exists, `函数: ${fn}()`);
});

// ==================== 9. CSS 类检查 ====================
console.log('\n🎨 9. CSS 类使用检查\n');

const cssClasses = [
  'sidebar-item',
  'content-section',
  'toolbar',
  'data-table',
  'modal',
  'modal-content',
  'form-group',
  'action-btn',
  'toast'
];

cssClasses.forEach(cls => {
  const regex = new RegExp(`class=["'][^"']*${cls}[^"']*["']`);
  const exists = regex.test(html);
  assert(exists, `CSS类使用: ${cls}`);
});

// ==================== 10. 数据属性检查 ====================
console.log('\n📊 10. 数据属性检查\n');

// 检查是否有必要的 onclick 事件
const onclickPatterns = [
  { pattern: /onclick="switchTab/, name: '切换标签页事件' },
  { pattern: /onclick="openGameIssueModal/, name: '打开游戏问题弹窗事件' },
  { pattern: /onclick="editGameIssue/, name: '编辑游戏问题事件' },
  { pattern: /onclick="deleteGameIssue/, name: '删除游戏问题事件' }
];

onclickPatterns.forEach(item => {
  const exists = item.pattern.test(html) || item.pattern.test(js);
  assert(exists, item.name);
});

// ==================== 生成报告 ====================
console.log('\n');
console.log('═'.repeat(60));
console.log('                    📊 测试汇总');
console.log('═'.repeat(60));

const total = results.passed + results.failed;
const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

console.log(`\n📈 总体结果:`);
console.log(`   通过: ${results.passed} ✅`);
console.log(`   失败: ${results.failed} ❌`);
console.log(`   警告: ${results.warnings.length} ⚠️`);
console.log(`   通过率: ${passRate}%`);

if (results.errors.length > 0) {
  console.log(`\n❌ 失败的测试:`);
  results.errors.forEach((err, i) => {
    console.log(`   ${i+1}. ${err.test}`);
    if (err.details) console.log(`      详情: ${err.details}`);
  });
}

if (results.warnings.length > 0) {
  console.log(`\n⚠️ 警告:`);
  results.warnings.forEach((warn, i) => {
    console.log(`   ${i+1}. ${warn}`);
  });
}

console.log('\n' + '═'.repeat(60));
console.log(`测试完成时间: ${new Date().toLocaleString('zh-CN')}`);
console.log('═'.repeat(60) + '\n');

process.exit(results.failed > 0 ? 1 : 0);
