# 裸眼3D游戏适配项目管理系统

一个完整的项目管理系统，用于管理裸眼3D游戏适配项目的成员、设备、游戏、测试和缺陷。

## 功能特性

### 🎯 核心功能
- **成员管理** - 管理团队成员信息、角色和状态
- **设备管理** - 管理测试设备，支持分配给成员
- **游戏管理** - 管理待测试的游戏信息
- **测试管理** - 创建和管理测试任务，关联游戏和设备
- **缺陷管理** - 记录和跟踪测试中发现的缺陷

### 📊 数据统计
- 实时统计成员、设备、游戏、测试和缺陷数量
- 可视化仪表盘展示项目概况

### 🎨 界面特点
- 现代化 UI 设计
- 响应式布局，支持移动端
- 标签页切换，操作便捷
- 状态标签可视化

## 技术栈

### 后端
- **Node.js** - JavaScript 运行环境
- **Express** - Web 框架
- **SQLite3** - 轻量级数据库
- **CORS** - 跨域资源共享

### 前端
- **HTML5** - 页面结构
- **CSS3** - 样式设计
- **JavaScript (ES6+)** - 交互逻辑
- **Fetch API** - 数据请求

## 安装步骤

### 1. 确保已安装 Node.js

首先确保你的系统已安装 Node.js（推荐 v14 或更高版本）。可以通过以下命令检查：

```bash
node -v
npm -v
```

如果没有安装，请访问 [Node.js 官网](https://nodejs.org/) 下载并安装。

### 2. 安装依赖

在项目根目录下运行：

```bash
cd project-management
npm install
```

这将安装所有必需的依赖包。

## 启动方式

### 开发模式（支持热重载）

```bash
npm run dev
```

### 生产模式

```bash
npm start
```

启动后，服务器将在 `http://localhost:3000` 运行。

## 使用说明

### 1. 访问系统

打开浏览器，访问 `http://localhost:3000`

### 2. 添加成员

- 点击"成员列表"标签
- 点击右上角的"+ 添加成员"按钮
- 填写成员信息（姓名为必填项）
- 点击"保存"按钮

### 3. 添加设备

- 点击"设备列表"标签
- 点击右上角的"+ 添加设备"按钮
- 填写设备信息（设备名称为必填项）
- 可以选择将设备分配给某个成员
- 点击"保存"按钮

### 4. 添加游戏

- 点击"游戏列表"标签
- 点击右上角的"+ 添加游戏"按钮
- 填写游戏信息（游戏名称为必填项）
- 点击"保存"按钮

### 5. 创建测试

- 点击"测试列表"标签
- 点击右上角的"+ 添加测试"按钮
- 填写测试信息：
  - 选择要测试的游戏
  - 选择测试设备
  - 选择测试人员
  - 设置测试日期、状态和优先级
- 点击"保存"按钮

### 6. 记录缺陷

- 点击"缺陷列表"标签
- 点击右上角的"+ 添加缺陷"按钮
- 填写缺陷信息：
  - 选择关联的测试
  - 填写缺陷标题
  - 设置严重程度和状态
  - 可以分配负责人
  - 填写缺陷描述和复现步骤
- 点击"保存"按钮

## 数据库说明

系统使用 SQLite 数据库，数据库文件位于 `database.sqlite`，包含以下表：

### members（成员表）
- id - 成员ID
- name - 姓名
- role - 角色
- department - 部门
- phone - 手机
- email - 邮箱
- status - 状态（active/inactive）
- created_at - 创建时间
- updated_at - 更新时间

### devices（设备表）
- id - 设备ID
- name - 设备名称
- type - 类型
- model - 型号
- serial_number - 序列号
- status - 状态（available/assigned/maintenance/broken）
- assigned_to - 分配给（成员ID）
- location - 位置
- created_at - 创建时间
- updated_at - 更新时间

### games（游戏表）
- id - 游戏ID
- name - 游戏名称
- game_type - 游戏类型
- adaptation_progress - 适配进度
- version - 游戏版本
- developer - 游戏厂商
- package_size - 安装包大小
- adaptation_status - 适配状态（pending/in_progress/completed/failed）
- adaptation_notes - 适配备注
- created_at - 创建时间
- updated_at - 更新时间

### tests（测试表）
- id - 测试ID
- name - 测试名称
- game_id - 游戏ID
- device_id - 设备ID
- tester_id - 测试人ID
- test_date - 测试日期
- status - 状态（pending/in_progress/completed/failed）
- priority - 优先级（low/medium/high/urgent）
- result - 测试结果
- bugs_count - 缺陷数量
- description - 描述
- created_at - 创建时间
- updated_at - 更新时间

### bugs（缺陷表）
- id - 缺陷ID
- test_id - 测试ID
- title - 缺陷标题
- severity - 严重程度（advice/prompt/normal/serious/fatal）
- status - 状态（open/in_progress/resolved/closed/reopened）
- description - 描述
- steps - 复现步骤
- assignee_id - 负责人ID
- created_at - 创建时间
- updated_at - 更新时间

## API 接口

### 成员管理
- `GET /api/members` - 获取所有成员
- `POST /api/members` - 创建成员
- `PUT /api/members/:id` - 更新成员
- `DELETE /api/members/:id` - 删除成员

### 设备管理
- `GET /api/devices` - 获取所有设备
- `POST /api/devices` - 创建设备
- `PUT /api/devices/:id` - 更新设备
- `DELETE /api/devices/:id` - 删除设备

### 游戏管理
- `GET /api/games` - 获取所有游戏
- `POST /api/games` - 创建游戏
- `PUT /api/games/:id` - 更新游戏
- `DELETE /api/games/:id` - 删除游戏

### 测试管理
- `GET /api/tests` - 获取所有测试
- `POST /api/tests` - 创建测试
- `PUT /api/tests/:id` - 更新测试
- `DELETE /api/tests/:id` - 删除测试

### 缺陷管理
- `GET /api/bugs` - 获取所有缺陷
- `POST /api/bugs` - 创建缺陷
- `PUT /api/bugs/:id` - 更新缺陷
- `DELETE /api/bugs/:id` - 删除缺陷

## 项目结构

```
project-management/
├── public/              # 前端文件
│   ├── index.html      # 主页面
│   ├── styles.css      # 样式文件
│   └── app.js          # JavaScript 逻辑
├── database.js         # 数据库初始化
├── server.js           # 服务器入口
├── package.json        # 项目配置
├── database.sqlite     # SQLite 数据库文件（运行后自动生成）
└── README.md           # 项目说明文档
```

## 注意事项

1. **数据库文件**：`database.sqlite` 会在首次运行时自动创建，请勿删除
2. **端口占用**：默认使用 3000 端口，如果被占用请修改 `server.js` 中的 PORT 常量
3. **数据备份**：建议定期备份 `database.sqlite` 文件
4. **浏览器兼容性**：推荐使用现代浏览器（Chrome、Firefox、Edge、Safari）

## 常见问题

### Q: 如何重置数据库？
A: 删除 `database.sqlite` 文件，然后重启服务器，系统会自动创建新的数据库。

### Q: 可以修改默认端口吗？
A: 可以，编辑 `server.js` 文件，修改 `PORT` 常量的值。

### Q: 如何部署到生产环境？
A: 建议使用 PM2 等 Node.js 进程管理工具：
```bash
npm install -g pm2
pm2 start server.js --name "project-management"
```

## 开发计划

- [ ] 添加用户认证和权限管理
- [ ] 支持数据导出（Excel、CSV）
- [ ] 添加通知功能（邮件、站内信）
- [ ] 支持文件上传（测试报告、截图等）
- [ ] 添加数据统计图表
- [ ] 支持多语言切换
- [ ] 添加搜索和筛选功能

## 许可证

MIT License

## 联系方式

如有问题或建议，请联系项目维护者。
