# 游戏列表新增字段功能说明

## 功能概述

为游戏列表添加三个新字段,以更好地管理和追踪游戏适配项目:

1. **负责人** - 记录每个游戏的负责人,从成员列表中选择
2. **上线状态** - 记录游戏的上线状态,包含:待上线、适配中、暂停适配、已上线
3. **品质** - 记录游戏的品质等级,包含:一般、推荐

## 技术实现

### 1. 数据库迁移

创建迁移脚本 `migration_add_game_fields.js`,为games表添加三个新字段:

```sql
ALTER TABLE games ADD COLUMN owner_id INTEGER;
ALTER TABLE games ADD COLUMN online_status TEXT DEFAULT 'pending';
ALTER TABLE games ADD COLUMN quality TEXT DEFAULT 'normal';
```

**字段说明:**
- `owner_id`: 关联members表的id,存储负责人ID
- `online_status`: 上线状态,可选值: pending(待上线)、in_progress(适配中)、paused(暂停适配)、online(已上线)
- `quality`: 品质等级,可选值: normal(一般)、recommended(推荐)

### 2. 后端API修改

#### GET /api/games - 获取游戏列表
修改查询语句,使用LEFT JOIN关联members表,返回负责人姓名:

```sql
SELECT g.*, m.name as owner_name
FROM games g
LEFT JOIN members m ON g.owner_id = m.id
ORDER BY g.created_at DESC
```

#### POST /api/games - 创建游戏
接收并保存三个新字段:
```javascript
const { name, ..., owner_id, online_status, quality } = req.body;
```

#### PUT /api/games/:id - 更新游戏
接收并更新三个新字段:
```javascript
const { name, ..., owner_id, online_status, quality } = req.body;
```

### 3. 前端实现

#### HTML修改

**游戏表格:**
```html
<th data-field="owner">负责人</th>
<th data-field="online_status">上线状态</th>
<th data-field="quality">品质</th>
```

**字段显示设置:**
```html
<div class="checkbox-group">
  <label class="checkbox-label">
    <input type="checkbox" value="owner" checked>
    <span>负责人</span>
  </label>
</div>
<!-- online_status, quality 类似 -->
```

**游戏表单:**
```html
<div class="form-group">
  <label>负责人</label>
  <select id="game-owner">
    <option value="">未分配</option>
    <!-- 动态从成员列表填充 -->
  </select>
</div>

<div class="form-group">
  <label>上线状态</label>
  <select id="game-online-status">
    <option value="pending">待上线</option>
    <option value="in_progress">适配中</option>
    <option value="paused">暂停适配</option>
    <option value="online">已上线</option>
  </select>
</div>

<div class="form-group">
  <label>品质</label>
  <select id="game-quality">
    <option value="normal">一般</option>
    <option value="recommended">推荐</option>
  </select>
</div>
```

#### JavaScript修改

**状态管理:**
```javascript
let visibleColumns = {
  name: true,
  english_name: true,
  platform: true,
  game_id: true,
  game_type: true,
  description: true,
  developer: true,
  operator: true,
  release_date: true,
  config_path: true,
  adapter_progress: true,
  owner: true,        // 新增
  online_status: true, // 新增
  quality: true        // 新增
};
```

**表单提交:**
```javascript
const data = {
  name: document.getElementById('game-name').value,
  // ... 其他字段
  owner_id: document.getElementById('game-owner').value,
  online_status: document.getElementById('game-online-status').value,
  quality: document.getElementById('game-quality').value
};
```

**数据编辑:**
```javascript
document.getElementById('game-owner').value = game.owner_id || '';
document.getElementById('game-online-status').value = game.online_status || 'pending';
document.getElementById('game-quality').value = game.quality || 'normal';
```

**表格渲染:**
```javascript
if (visibleColumns.owner) {
  rowHtml += `<td>${escapeHtml(game.owner_name || '-')}</td>`;
}
if (visibleColumns.online_status) {
  const statusMap = {
    'pending': '待上线',
    'in_progress': '适配中',
    'paused': '暂停适配',
    'online': '已上线'
  };
  rowHtml += `<td>${escapeHtml(statusMap[game.online_status] || '-')}</td>`;
}
if (visibleColumns.quality) {
  const qualityMap = {
    'normal': '一般',
    'recommended': '推荐'
  };
  rowHtml += `<td>${escapeHtml(qualityMap[game.quality] || '-')}</td>`;
}
```

**下拉框填充:**
```javascript
// 在 loadMembers() 函数中
updateSelectOptions('game-owner', result.data, 'id', 'name', '未分配');
```

## 使用说明

### 1. 添加/编辑游戏时

1. 点击"添加游戏"或"编辑"按钮
2. 填写基本信息后,在表单底部找到三个新字段:
   - **负责人**: 从下拉列表选择成员(成员数据从成员管理模块获取)
   - **上线状态**: 选择游戏当前状态
   - **品质**: 选择游戏品质等级
3. 点击"保存"按钮

### 2. 查看游戏列表

1. 游戏列表默认显示所有14个字段
2. 如需隐藏某些字段,点击"⚙️ 显示设置"按钮
3. 取消勾选不需要的字段,点击"应用"
4. 三个新字段可独立显示/隐藏

### 3. 字段说明

#### 负责人
- **数据类型**: 关联成员ID
- **数据来源**: 成员管理模块
- **显示方式**: 显示成员姓名
- **默认值**: 未分配(空)
- **约束**: 必须从成员列表中选择

#### 上线状态
- **数据类型**: 枚举字符串
- **可选值**:
  - `pending` - 待上线
  - `in_progress` - 适配中
  - `paused` - 暂停适配
  - `online` - 已上线
- **默认值**: 待上线
- **显示方式**: 中文显示

#### 品质
- **数据类型**: 枚举字符串
- **可选值**:
  - `normal` - 一般
  - `recommended` - 推荐
- **默认值**: 一般
- **显示方式**: 中文显示

## 文件变更清单

### 新建文件
1. `project-management/migration_add_game_fields.js` - 数据库迁移脚本

### 修改文件
1. `project-management/server.js`
   - 修改 `gamesRouter.get('/')` - 添加JOIN查询
   - 修改 `gamesRouter.post('/')` - 接收新字段
   - 修改 `gamesRouter.put('/:id')` - 更新新字段

2. `project-management/public/index.html`
   - 添加三个新列到游戏表格
   - 添加三个新字段到显示设置面板
   - 添加三个新字段到游戏表单

3. `project-management/public/app.js`
   - 更新 `visibleColumns` 状态对象
   - 修改游戏表单提交逻辑
   - 修改 `editGame()` 函数
   - 修改 `renderGamesPage()` 渲染逻辑
   - 修改 `loadMembers()` 函数,填充负责人下拉框

## 数据库变更

### games表新增字段

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| owner_id | INTEGER | NULL | 负责人ID,关联members.id |
| online_status | TEXT | 'pending' | 上线状态 |
| quality | TEXT | 'normal' | 品质等级 |

### 外键关系

```
games.owner_id → members.id
```

## 兼容性

### 向后兼容
- 三个新字段都是可选字段,不会影响现有数据
- 旧数据的三个新字段将使用默认值或NULL
- 现有的CRUD操作完全兼容

### 数据迁移
- 迁移脚本已执行成功
- 现有游戏记录的三个新字段已自动填充默认值
- 新旧数据可以在同一系统中正常使用

## 测试验证

### 功能测试
- ✅ 数据库迁移成功,三个字段添加完成
- ✅ 添加游戏时可以设置三个新字段
- ✅ 编辑游戏时可以修改三个新字段
- ✅ 游戏列表正确显示三个新字段
- ✅ 负责人下拉框正确填充成员列表
- ✅ 上线状态下拉框显示4个选项
- ✅ 品质下拉框显示2个选项
- ✅ 字段显示设置可以控制三个新字段的显示/隐藏
- ✅ 状态代码正确转换为中文显示

### 技术测试
- ✅ 无语法错误(linter检查通过)
- ✅ 服务器正常启动(端口3000)
- ✅ 浏览器正常访问(http://localhost:3000)
- ✅ API接口正常返回数据
- ✅ 表单提交数据完整

## 未来优化方向

1. **上线状态筛选**: 在筛选功能中添加"上线状态"筛选器
2. **负责人筛选**: 在筛选功能中添加"负责人"筛选器
3. **品质筛选**: 在筛选功能中添加"品质"筛选器
4. **数据统计**: 添加基于新字段的统计图表
5. **权限控制**: 根据负责人字段限制编辑权限

## 注意事项

1. **负责人数据**: 负责人下拉框的数据来源于成员管理模块,需要先添加成员才能选择
2. **字段默认值**: 三个新字段都有默认值,不会影响现有数据
3. **数据完整性**: 建议为每个游戏分配负责人,以便后续管理和追踪
4. **显示控制**: 三个新字段可以通过"显示设置"独立控制显示/隐藏

## 相关文档

- [字段显示设置功能说明](./COLUMN_SETTINGS_FEATURE.md)
- [适配进展功能说明](./ADAPTER_PROGRESS_FEATURE.md)
- [系统自检报告](./SYSTEM_CHECK.md)

---

最后更新: 2026年3月26日 10:45
