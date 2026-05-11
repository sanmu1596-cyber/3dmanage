# 三个模块详细对比与代码位置

## 1. 游戏问题模块 (game-issues) - STATUS: ✅ 正常

### 模块架构流程图
```
HTML Sidebar (data-tab="game-issues")
  ↓
switchTab('game-issues')
  ↓
loadTabData('game-issues')
  ↓
switch: case 'game-issues': await loadGameIssues()
  ↓
public/js/issues-versions.js::loadGameIssues() [第337行]
  ↓
API: ${API_BASE}/game-issues
```

### 详细代码位置

**1. HTML定义 (public/index.html 第74行)**
```html
<a class="sidebar-item" data-tab="game-issues" onclick="switchTab('game-issues')">
    🎮 游戏问题
</a>
```

**2. app.js中的case定义 (app.js 第561行)**
```javascript
case 'game-issues':
    await loadGameIssues();
    break;
```

**3. 函数实现 (public/js/issues-versions.js 第337-348行)**
```javascript
let allGameIssuesData = [];

async function loadGameIssues() {
    try {
        const resp = await authFetch(`${API_BASE}/game-issues`);
        const data = await resp.json();
        allGameIssuesData = data || [];
        renderGameIssuesTable(allGameIssuesData);
        updateGameIssuesStats();
    } catch (e) {
        console.error('加载游戏问题失败:', e);
        showToast('加载游戏问题失败', 'error');
    }
}
```

**4. 相关表格 (public/index.html 第732-785行)**
```html
<section id="game-issues" class="tab-content">
    ...
    <tbody id="game-issues-table"></tbody>
    ...
</section>
```

### 检验清单
- [x] sidebar中有data-tab定义
- [x] app.js中有对应case
- [x] 函数已在js文件中定义
- [x] 函数名匹配
- [x] HTML容器存在
- [x] API调用正确

---

## 2. 版本管理 (versions) - STATUS: ⚠️ 存在冲突

### 问题: loadVersions 函数重复定义

### 函数定义冲突

**定义位置1: app.js (第10038行)**
```javascript
async function loadVersions() {
    try {
        const response = await authFetch(`${API_BASE}/versions`);
        const result = await response.json();
        allVersionsData = result.data || [];

        versionsReleasedData = allVersionsData.filter(v => v.status === 'released');
        versionsTestingData = allVersionsData.filter(v => v.status === 'testing');

        renderVersionsTable('released', versionsReleasedData);
        renderVersionsTable('testing', versionsTestingData);

        populateVersionDeviceFilters();
    } catch (error) {
        console.error('加载版本数据失败:', error);
    }
}
```

**定义位置2: public/js/issues-versions.js (第30行)** - DUPLICATE!
```javascript
async function loadVersions() {
    try {
        const response = await authFetch(`${API_BASE}/versions`);
        const result = await response.json();
        allVersionsData = result.data || [];

        versionsReleasedData = allVersionsData.filter(v => v.status === 'released');
        versionsTestingData = allVersionsData.filter(v => v.status === 'testing');

        renderVersionsTable('released', versionsReleasedData);
        renderVersionsTable('testing', versionsTestingData);

        populateVersionDeviceFilters();
    } catch (error) {
        console.error('加载版本数据失败:', error);
    }
}
```

### 脚本加载顺序 (public/index.html)
```html
<script src="js/issues-versions.js?v=20260508"></script>  <!-- 第2884行 - 定义 loadVersions() -->
<script src="js/social.js?v=20260508"></script>           <!-- 第2885行 -->
<script src="modules-extra.js?v=20260427"></script>       <!-- 第2886行 -->
<script src="app.js"></script>                            <!-- 第2888行 - 也定义 loadVersions() -->
```

### 结果分析
- 因为app.js在最后加载，app.js中的 loadVersions() 会**覆盖** issues-versions.js中的定义
- 这不是立即的错误，但导致代码重复和维护混乱

### 相关错误线索

**截图中的错误**: "loadInterfaceVersions is not defined"
- 搜索结果: 找到 `loadInterlaceVersions` (正确) 但未找到 `loadInterfaceVersions` (错误拼写)
- 这个错误是一个独立的拼写问题，需要全局搜索修复

### app.js中的引用 (第597行)
```javascript
case 'versions':
    if (!allDevicesData || allDevicesData.length === 0) await loadDevices();
    await loadVersions();
    break;
```

### 检验清单
- [x] sidebar中有data-tab定义
- [x] app.js中有对应case
- [x] 函数已定义 (但重复了2次!)
- [ ] 函数唯一性检查失败
- [x] HTML容器存在 (public/index.html 第1338行)
- [ ] loadInterfaceVersions 拼写错误未解决

---

## 3. 操作日志 (activity-logs) - STATUS: ✅ 正常(但不规范)

### 模块架构流程图
```
HTML Sidebar (data-tab="activity-logs")
  ↓
switchTab('activity-logs')
  ↓
social.js的AOP拦截 (不经过app.js的loadTabData)
  ↓
if (tabId === 'activity-logs') loadActivityLogs(1)
  ↓
public/js/social.js::loadActivityLogs() [第262行]
  ↓
API: ${API_BASE}/activity-logs
```

### 问题: app.js中缺少显式的case定义

**HTML定义 (public/index.html 第128行)**
```html
<a class="sidebar-item" data-tab="activity-logs" onclick="switchTab('activity-logs')">
    📋 操作日志
</a>
```

**app.js中的loadTabData (第520-630行)** - **没有case 'activity-logs'**
```javascript
async function loadTabData(tabId, switchId) {
    // ... 其他cases ...
    switch (tabId) {
        case 'dashboard': ...
        case 'games': ...
        // ... 更多cases ...
        case 'client-issues':
            await loadVersions();
            await loadClientIssues();
            break;
        // 缺少: case 'activity-logs': break;
    }
}
```

**社交模块的AOP拦截 (public/js/social.js 第346-351行)**
```javascript
const _origSwitchTab2 = window.switchTab;
window.switchTab = function(tabId) {
    _origSwitchTab2(tabId);
    if (tabId === 'activity-logs') loadActivityLogs(1);  // 自动加载!
};
```

### 函数实现 (public/js/social.js 第262-284行)
```javascript
async function loadActivityLogs(page) {
    if (page) _logCurrentPage = page;
    const type = document.getElementById('log-type-filter')?.value || 'all';
    try {
        const [listRes, statsRes] = await Promise.all([
            authFetch(`${API_BASE}/activity-logs?resource_type=${type}&page=${_logCurrentPage}&limit=${_logPageSize}`),
            authFetch(`${API_BASE}/activity-logs/stats`)
        ]);
        const listData = await listRes.json();
        const statsData = await statsRes.json();

        if (listData.success) renderActivityLogTable(listData.data);
        if (statsData.success) renderLogStats(statsData.data);

        renderLogPagination(listData.total);
    } catch (e) {
        console.error('加载操作日志失败:', e);
        document.getElementById('activity-logs-tbody').innerHTML =
            '<tr><td colspan="6" class="empty-state"><div>加载失败，请重试</div></td></tr>';
    }
}
```

### HTML容器 (public/index.html 第1013-1039行)
```html
<section id="activity-logs" class="tab-content">
    ...
    <tbody id="activity-logs-tbody"></tbody>
    ...
</section>
```

### 检验清单
- [x] sidebar中有data-tab定义
- [x] app.js中没有显式的case (依赖AOP拦截)
- [x] 函数已在social.js中定义
- [x] 函数名匹配
- [x] HTML容器存在
- [x] 有自动加载机制 (但不规范)
- [ ] 缺少app.js中的显式注册

### 现状评估
虽然模块能正常工作，但架构设计不规范：
- 类型1模块: 显式在app.js中注册 (game-issues)
- 类型2模块: 依赖AOP拦截 (activity-logs) - 不一致

---

## 快速参考表

| 特性 | game-issues | versions | activity-logs |
|------|-----------|----------|---------------|
| HTML标签 | game-issues | versions | activity-logs |
| 模块文件 | issues-versions.js | issues-versions.js + app.js | social.js |
| 初始化函数 | loadGameIssues() | loadVersions() ✗2 | loadActivityLogs() |
| app.js case | ✓ | ✓ | ✗ (AOP) |
| 函数冲突 | ✗ | ✓ 重复定义 | ✗ |
| API端点 | /game-issues | /versions | /activity-logs |
| 运行状态 | ✅ 正常 | ⚠️ 冲突 | ✅ 正常(非规范) |

---

## 具体错误:"loadInterfaceVersions is not defined"

### 搜索结果

**在issues-versions.js中找到的正确函数名:**
- 第1230行: `async function loadInterlaceVersions() {`
- 第1021行: `async function loadInterlaceIssues() {`

**错误调用的拼写:** `loadInterfaceVersions` (Interface ≠ Interlace)

### 可能的调用位置
需要在以下位置检查:
1. HTML中的onclick事件
2. 按钮的 data-* 属性
3. 其他JavaScript文件中的函数调用
4. 模态框的打开/关闭逻辑

### 修复方法
全局替换 `loadInterfaceVersions` → `loadInterlaceVersions`

