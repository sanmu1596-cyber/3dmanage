# SearchableSelect 组件使用文档

> 学习 TAPD / Element Plus 风格的可筛选下拉选择器
> 适用于游戏选择、成员选择、设备选择等所有需要从大量选项中搜索的场景

## 文件位置

- **组件代码**：`public/js/components/searchable-select.js`
- **样式（已合并）**：`public/styles-tapd.css` 中 `.searchable-select` 系列
- **加载顺序**：必须在 `core.js` 之后、业务模块之前加载

## 核心特性

| 能力 | 说明 |
|------|------|
| 关键字过滤 | 输入即实时过滤（不区分大小写） |
| 高亮匹配 | 匹配段用 `<mark>` 包裹，黄色背景 |
| 键盘导航 | ↑↓ 移动、Enter 选中、Esc 关闭 |
| 副标题 | item.sub 字段会显示在选项右侧（灰色） |
| 清空按钮 | `allowClear: true` 显示 ✕ 按钮 |
| 暗色模式 | 自动适配 `[data-theme="dark"]` |
| 失焦保护 | 未选有效值时自动恢复 |
| 自动滚动 | 打开时自动滚到选中项 |

## API

### 1. `SearchableSelect.init(baseId, items, value, options?)`

初始化已有 DOM 容器。

**参数：**
- `baseId` — 容器 baseId（HTML 结构需手写）
- `items` — 可选项数组（字符串或对象）
- `value` — 初始值
- `options` — 可选配置 `{ onChange, onClear }`

### 2. `SearchableSelect.create(config)`

自动构建 HTML 并初始化（推荐）。

**config 字段：**
```js
{
    containerId: 'parent-div',  // 父容器 ID
    container: domNode,         // 或直接传 DOM
    id: 'my-select',            // 可选，自动生成
    name: 'gameId',             // 隐藏域 name（用于表单）
    placeholder: '搜索游戏...',
    items: [...],
    value: '',
    allowClear: true,           // 是否显示清空按钮
    required: true,             // input required
    onChange: (value, item) => { ... },
    onClear: () => { ... }
}
```

### 3. `SearchableSelect.update(baseId, items)`

动态更新选项数据（如成员/游戏列表刷新后）。

### 4. `SearchableSelect.setValue(baseId, value)`

程序设值（自动同步 input 显示）。

### 5. `SearchableSelect.getValue(baseId)`

读取当前隐藏值。

### 6. `SearchableSelect.destroy(baseId)`

解绑事件，移除实例缓存。

## 使用示例

### 示例 1：字符串数组（最简）

```html
<div class="searchable-select" id="my-wrap">
    <input class="searchable-select-input" id="my-input" placeholder="搜索...">
    <span class="searchable-select-arrow">▾</span>
    <div class="searchable-select-dropdown" id="my-dropdown"></div>
    <input type="hidden" id="my">
</div>
```

```js
const games = ['Palworld', 'Cyberpunk 2077', 'GTA V'];
SearchableSelect.init('my', games, '');
// 取值: document.getElementById('my').value
```

### 示例 2：对象数组（推荐 — 解耦显示与值）

```js
const games = [
    { value: 1,  label: 'Palworld',     sub: 'Steam · 角色扮演' },
    { value: 2,  label: 'Cyberpunk',    sub: 'PS5 · 动作' }
];
SearchableSelect.init('my', games, 1, {
    onChange: (value, item) => {
        console.log('选中游戏ID:', value, '游戏对象:', item);
    }
});
// hidden.value = 1（数字ID），input.value 显示 'Palworld'
```

### 示例 3：自动建 DOM

```js
SearchableSelect.create({
    containerId: 'form-fields',
    name: 'gameId',
    placeholder: '请选择游戏...',
    items: gamesList,
    value: currentGameId,
    allowClear: true,
    onChange: (value, item) => loadGameDetails(value)
});
```

### 示例 4：动态更新选项

```js
// 初始化空列表
SearchableSelect.init('owner-select', [], '');

// 异步加载后更新
fetch('/api/members').then(r => r.json()).then(members => {
    SearchableSelect.update('owner-select', members.map(m => ({
        value: m.id,
        label: m.name,
        sub: m.role
    })));
});
```

## 暗色模式

CSS 已自动适配：
- 输入框背景 `var(--bg-input, #1c2330)`
- 浮层背景 `var(--bg-elevated, #1c2330)`
- 高亮 mark `#5a4500` → `#ffe072`

## 兼容性

为保持向后兼容，`window.initSearchableSelect(baseId, items, value)` 仍可调用，
但**新代码请使用 `SearchableSelect.init` / `SearchableSelect.create`**，功能更全。

## 已应用模块

| 模块 | 字段 | 调用 |
|------|------|------|
| 游戏问题 - 新增/编辑弹窗 | 游戏名称 | `SearchableSelect.init('gi-game-name', items, value)` |

## 待应用建议

- MOD 验证 - 游戏选择
- 适配进展 - 关联游戏
- 报表 - 游戏筛选
- 测试用例 - 游戏关联
- 任何"成员/设备/标签"等需要从大量选项搜索的场景

---
_Last updated: 2026-06-10_
