# GUI 设计规范（Design System）

> 项目级 GUI 一致性规范
> 文件：`public/design-system.css`
> 加载顺序：在 `styles-tapd.css` **之后**加载（覆盖优先级最高）

## 设计原则

参考 **TAPD / Element Plus / Ant Design / Material Design** 的成熟设计：

- **8 点栅格系统**：所有间距用 `var(--space-N)` 系列，4/8/12/16/20/24/32
- **控件统一高度**：默认 36px (`--ctrl-h-md`)，小号 28px，大号 44px
- **圆角阶梯**：sm 4 / md 6 / lg 8 / xl 12 / pill
- **焦点状态**：所有可交互控件 focus 都用 `var(--focus-ring)`（主色 18% halo）
- **过渡时长**：fast 0.12s / base 0.18s / slow 0.3s
- **字号阶梯**：12 / 13 / 14（默认）/ 16 / 18 / 20 / 24

## CSS 变量速查

| 变量 | 值 | 用途 |
|------|-----|------|
| `--space-1`～`--space-10` | 4/8/12/16/20/24/32/40 px | 间距 |
| `--ctrl-h-sm/md/lg` | 28/36/44 px | 控件高度 |
| `--ds-radius-sm/md/lg/xl/pill` | 4/6/8/12/999 px | 圆角 |
| `--fs-xs/sm/md/lg/xl/2xl/3xl` | 12/13/14/16/18/20/24 px | 字号 |
| `--ds-shadow-sm/md/lg` | 0~3 级阴影 | 阴影 |
| `--focus-ring` | `0 0 0 2px rgba(...,0.18)` | 焦点光晕 |
| `--duration-fast/base/slow` | 0.12/0.18/0.3 s | 过渡时长 |
| `--ease-out` | cubic-bezier(0.32, 0.72, 0, 1) | 缓动函数（iOS 风弹性） |

## 已统一的控件

### 1. 按钮 `.btn` / `.tool-btn`

```html
<!-- 默认（次要按钮） -->
<button class="btn">取消</button>

<!-- 主按钮 -->
<button class="btn btn-primary">确定</button>

<!-- 危险按钮 -->
<button class="btn btn-danger">删除</button>

<!-- 链接按钮 -->
<button class="btn btn-link">查看详情</button>

<!-- 尺寸 -->
<button class="btn btn-sm">小</button>
<button class="btn btn-lg">大</button>

<!-- 图标按钮 -->
<button class="btn btn-icon">✕</button>
```

**规范**：
- 高度 36px（小 28 / 大 44）
- 圆角 6px
- gap 6px（图标 + 文字）
- focus-visible 显示 2px 主色光晕
- :active 下移 1px 模拟按下

### 2. 表单控件

`<input>` `<select>` `<textarea>` `.form-control` `.filter-input`

- 高度 36px，圆角 6px
- focus 时主色边框 + 2px halo
- 占位符颜色 `--text-light`
- disabled 灰色背景

```html
<div class="form-row">
  <div class="form-group">
    <label>用户名 <span class="required">*</span></label>
    <input type="text">
  </div>
  <div class="form-group">
    <label>邮箱</label>
    <input type="email">
  </div>
</div>
```

### 3. 弹窗

```html
<div class="modal" style="display:flex">
  <div class="modal-overlay" onclick="closeModal()"></div>
  <div class="modal-container">
    <div class="modal-content">
      <div class="modal-header">
        <h3>标题</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">…</div>
      <div class="modal-footer">
        <button class="btn">取消</button>
        <button class="btn btn-primary">确定</button>
      </div>
    </div>
  </div>
</div>
```

**规范**：
- 容器圆角 12px（xl）+ shadow-lg
- header/footer padding `space-4 space-5`
- body padding `space-5`
- footer 按钮右对齐，间距 8px
- 关闭按钮无底色，hover 浅灰

### 4. 卡片

```html
<div class="card">…</div>
<div class="panel-card">…</div>
<div class="stat-card">…</div>
```

- 圆角 8px + shadow-sm，hover 升级到 shadow-md
- padding 16px

### 5. 徽章 / 标签

```html
<span class="badge badge-primary">进行中</span>
<span class="badge badge-success">已完成</span>
<span class="badge badge-warning">待处理</span>
<span class="badge badge-danger">已关闭</span>
```

- 22px 高，pill 圆角
- 字号 12px

### 6. 工具栏

```html
<div class="toolbar">
  <div class="toolbar-left">
    <button class="btn btn-primary">新增</button>
    <span class="toolbar-divider"></span>
    <input class="filter-input" placeholder="搜索…">
  </div>
  <div class="toolbar-right">
    <button class="btn">导出</button>
  </div>
</div>
```

### 7. 链接

```html
<a href="...">链接</a>
<span class="link" onclick="...">伪链接</span>
```

- 主色，hover 加深 + 下划线

### 8. 滚动条

所有容器自动应用统一滚动条样式（8px、半透明、hover 加深、暗色适配）

## 工具类速查

```css
.text-primary / .text-secondary / .text-tertiary
.text-danger / .text-success / .text-warning
.text-center / .text-right / .text-ellipsis
.flex / .flex-1 / .items-center / .justify-between
.gap-1 ~ .gap-4
.mt-2 ~ .mt-4 / .mb-2 ~ .mb-4
```

## 暗色模式

所有变量都有 `[data-theme="dark"]` 重定义，组件自动适配，**业务代码无需特殊处理**。

## 与现有代码的兼容

`design-system.css` 在 `styles-tapd.css` **之后**加载，会覆盖部分旧样式（如按钮高度统一为 36px）。
**已知影响**：
- 部分弹窗按钮原本是 28px 高 → 现在 36px（更易点击）
- 部分输入框原本各种尺寸 → 现在统一 36px
- 关闭按钮 ✕ 全系统统一无底色

如需特例：用 `style=""` 局部覆盖，或在组件作用域内用更高优先级选择器。

## 后续开发约定

✅ **新增任何控件，必须：**
1. 使用 `var(--space-*)` 而不是硬编码像素
2. 按钮统一用 `.btn` 系列类，不要自定义按钮样式
3. 表单控件统一用原生 input / select / textarea，不要写自定义高度
4. 弹窗结构必须 modal-header/body/footer 三段式
5. 间距遵循 8 点栅格

❌ **禁止：**
- 写 `padding: 13px 17px` 这种非栅格值
- 在每个组件单独写 `border-radius: 5px`
- 重写按钮样式（直接用 .btn 类）

---

_Last updated: 2026-06-10_
