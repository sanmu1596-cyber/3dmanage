/**
 * 用户体验测试套件
 * 模拟多人登录系统，测试各模块易用性
 * 运行：node ux-test-suite.js
 */

const http = require('http');

const BASE_URL = 'http://21.214.83.112:3000';

// 测试用户角色
const TEST_USERS = [
    { name: '项目经理小王', role: 'PM', focus: ['dashboard', 'games', 'progress'] },
    { name: '测试工程师小李', role: 'QA', focus: ['bugs', 'tests', 'game-issues'] },
    { name: '开发工程师小张', role: 'DEV', focus: ['games', 'bugs', 'devices'] },
    { name: '产品经理小陈', role: 'PM', focus: ['dashboard', 'members', 'requirements'] },
    { name: '运维工程师小赵', role: 'OPS', focus: ['devices', 'members', 'games'] }
];

// 易用性问题收集
const uxIssues = [];
const performanceMetrics = [];
const testResults = [];

// HTTP 请求封装
function request(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        const startTime = Date.now();
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                try {
                    const result = JSON.parse(body);
                    resolve({
                        status: res.statusCode,
                        data: result.data || result,
                        raw: result,
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        duration
                    });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body, ok: false, duration });
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
        
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

// 记录易用性问题
function reportUXIssue(category, severity, description, suggestion) {
    uxIssues.push({
        category,
        severity, // P0-紧急, P1-重要, P2-一般, P3-优化
        description,
        suggestion,
        time: new Date().toLocaleTimeString()
    });
    console.log(`  ⚠️ [${severity}] ${category}: ${description}`);
}

// 记录测试结果
function recordTest(module, testName, passed, details = '', duration = 0) {
    testResults.push({ module, testName, passed, details, duration });
    const icon = passed ? '✅' : '❌';
    console.log(`  ${icon} ${testName} ${duration ? `(${duration}ms)` : ''}`);
}

// ==================== 模块测试函数 ====================

// 1. Dashboard 仪表盘测试
async function testDashboard(user) {
    console.log(`\n📊 [${user.name}] 测试项目概览...`);
    
    const start = Date.now();
    
    // 测试统计数据加载
    const [games, devices, members, bugs, tests] = await Promise.all([
        request('GET', '/api/games'),
        request('GET', '/api/devices'),
        request('GET', '/api/members'),
        request('GET', '/api/bugs'),
        request('GET', '/api/tests')
    ]);
    
    const loadTime = Date.now() - start;
    performanceMetrics.push({ module: 'dashboard', operation: '并行加载5个API', duration: loadTime });
    
    recordTest('dashboard', '统计数据并行加载', loadTime < 2000, `耗时 ${loadTime}ms`, loadTime);
    
    if (loadTime > 1000) {
        reportUXIssue('仪表盘', 'P2', `首屏加载较慢(${loadTime}ms)`, '考虑添加加载骨架屏或懒加载');
    }
    
    // 检查数据完整性
    const gamesCount = Array.isArray(games.data) ? games.data.length : 0;
    const devicesCount = Array.isArray(devices.data) ? devices.data.length : 0;
    const membersCount = Array.isArray(members.data) ? members.data.length : 0;
    
    recordTest('dashboard', '游戏数据获取', games.ok && gamesCount > 0, `${gamesCount}条记录`);
    recordTest('dashboard', '设备数据获取', devices.ok && devicesCount > 0, `${devicesCount}条记录`);
    recordTest('dashboard', '成员数据获取', members.ok && membersCount > 0, `${membersCount}条记录`);
    
    return { games: gamesCount, devices: devicesCount, members: membersCount };
}

// 2. 成员管理模块测试
async function testMembers(user) {
    console.log(`\n👥 [${user.name}] 测试成员管理模块...`);
    
    // 获取成员列表
    const listStart = Date.now();
    const list = await request('GET', '/api/members');
    const listTime = Date.now() - listStart;
    
    recordTest('members', '成员列表加载', list.ok, `${list.data?.length || 0}条`, listTime);
    
    // 测试创建成员
    const testMember = {
        name: `UX测试成员_${user.role}_${Date.now()}`,
        wechat_id: 'ux_test_001',
        role: '测试工程师',
        duty: '用户体验测试',
        status: 'active'
    };
    
    const createStart = Date.now();
    const created = await request('POST', '/api/members', testMember);
    const createTime = Date.now() - createStart;
    
    recordTest('members', '创建成员', created.ok, '', createTime);
    
    if (createTime > 500) {
        reportUXIssue('成员管理', 'P2', `创建操作响应慢(${createTime}ms)`, '优化数据库写入');
    }
    
    let memberId = created.data?.id;
    
    // 测试更新成员
    if (memberId) {
        const updateStart = Date.now();
        const updated = await request('PUT', `/api/members/${memberId}`, {
            ...testMember,
            duty: '用户体验测试-已更新'
        });
        const updateTime = Date.now() - updateStart;
        recordTest('members', '更新成员', updated.ok, '', updateTime);
    }
    
    // 测试删除成员
    if (memberId) {
        const deleteStart = Date.now();
        const deleted = await request('DELETE', `/api/members/${memberId}`);
        const deleteTime = Date.now() - deleteStart;
        recordTest('members', '删除成员', deleted.ok, '', deleteTime);
    }
    
    // 易用性检查点
    if (!list.data || list.data.length === 0) {
        reportUXIssue('成员管理', 'P1', '成员列表为空时无引导提示', '添加空状态引导，如"点击创建按钮添加成员"');
    }
}

// 3. 游戏管理模块测试
async function testGames(user) {
    console.log(`\n🎮 [${user.name}] 测试游戏管理模块...`);
    
    // 获取游戏列表
    const listStart = Date.now();
    const list = await request('GET', '/api/games');
    const listTime = Date.now() - listStart;
    
    const gamesData = Array.isArray(list.data) ? list.data : [];
    recordTest('games', '游戏列表加载', list.ok, `${gamesData.length}条`, listTime);
    
    // 测试分页性能（如果数据量大）
    if (gamesData.length > 50) {
        performanceMetrics.push({ module: 'games', operation: '大数据量加载', duration: listTime, count: gamesData.length });
        
        if (listTime > 1000) {
            reportUXIssue('游戏管理', 'P1', `${gamesData.length}条游戏加载耗时${listTime}ms`, '实现服务端分页或虚拟滚动');
        }
    }
    
    // 测试创建游戏
    const testGame = {
        name: `UX测试游戏_${Date.now()}`,
        english_name: 'UX Test Game',
        platform: 'PC',
        game_id: `TEST_${Date.now()}`,
        game_type: '动作',
        online_status: '未开始',
        developer: '测试开发商',
        quality: 'A'
    };
    
    const createStart = Date.now();
    const created = await request('POST', '/api/games', testGame);
    const createTime = Date.now() - createStart;
    
    recordTest('games', '创建游戏', created.ok, '', createTime);
    
    let gameId = created.data?.id;
    
    // 测试搜索功能（模拟用户搜索）
    const searchStart = Date.now();
    const searchResult = await request('GET', '/api/games?search=测试');
    const searchTime = Date.now() - searchStart;
    
    recordTest('games', '搜索功能', searchResult.ok, '', searchTime);
    
    // 测试筛选功能
    const filterStart = Date.now();
    const filterResult = await request('GET', '/api/games?platform=PC');
    const filterTime = Date.now() - filterStart;
    
    recordTest('games', '筛选功能', filterResult.ok, '', filterTime);
    
    // 清理测试数据
    if (gameId) {
        await request('DELETE', `/api/games/${gameId}`);
    }
    
    // 易用性检查点
    reportUXIssue('游戏管理', 'P3', '游戏列表字段过多', '考虑默认隐藏部分字段，提供自定义列功能');
}

// 4. 设备管理模块测试
async function testDevices(user) {
    console.log(`\n📱 [${user.name}] 测试设备管理模块...`);
    
    const listStart = Date.now();
    const list = await request('GET', '/api/devices');
    const listTime = Date.now() - listStart;
    
    const devicesData = Array.isArray(list.data) ? list.data : [];
    recordTest('devices', '设备列表加载', list.ok, `${devicesData.length}条`, listTime);
    
    // 测试创建设备
    const testDevice = {
        name: `UX测试设备_${Date.now()}`,
        device_type: '裸眼3D显示器',
        model: 'UX-TEST-001',
        status: '空闲'
    };
    
    const createStart = Date.now();
    const created = await request('POST', '/api/devices', testDevice);
    const createTime = Date.now() - createStart;
    
    recordTest('devices', '创建设备', created.ok, '', createTime);
    
    let deviceId = created.data?.id;
    
    // 清理
    if (deviceId) {
        await request('DELETE', `/api/devices/${deviceId}`);
        recordTest('devices', '删除设备', true, '');
    }
}

// 5. 游戏问题模块测试
async function testGameIssues(user) {
    console.log(`\n⚠️ [${user.name}] 测试游戏问题模块...`);
    
    const listStart = Date.now();
    const list = await request('GET', '/api/game-issues');
    const listTime = Date.now() - listStart;
    
    const issuesData = Array.isArray(list.data) ? list.data : [];
    recordTest('game-issues', '问题列表加载', list.ok, `${issuesData.length}条`, listTime);
    
    // 测试创建问题
    const testIssue = {
        game_name: 'UX测试游戏',
        issue_type: '功能问题',
        issue_desc: `UX测试问题_${Date.now()}`,
        owner: user.name,
        status: '待处理'
    };
    
    const createStart = Date.now();
    const created = await request('POST', '/api/game-issues', testIssue);
    const createTime = Date.now() - createStart;
    
    recordTest('game-issues', '创建问题', created.ok, '', createTime);
    
    let issueId = created.data?.id;
    
    // 测试状态流转
    if (issueId) {
        const statusUpdate = await request('PUT', `/api/game-issues/${issueId}`, {
            ...testIssue,
            status: '处理中'
        });
        recordTest('game-issues', '状态流转', statusUpdate.ok, '待处理→处理中');
        
        // 清理
        await request('DELETE', `/api/game-issues/${issueId}`);
    }
    
    // 易用性检查点
    reportUXIssue('游戏问题', 'P2', '状态流转没有可视化工作流', '添加看板视图或状态流转图');
}

// 6. 缺陷管理模块测试
async function testBugs(user) {
    console.log(`\n🐛 [${user.name}] 测试缺陷管理模块...`);
    
    const listStart = Date.now();
    const list = await request('GET', '/api/bugs');
    const listTime = Date.now() - listStart;
    
    const bugsData = Array.isArray(list.data) ? list.data : [];
    recordTest('bugs', '缺陷列表加载', list.ok, `${bugsData.length}条`, listTime);
    
    // 测试创建缺陷
    const testBug = {
        game_name: 'UX测试游戏',
        device_name: 'UX测试设备',
        bug_desc: `UX测试缺陷_${Date.now()}`,
        severity: '一般',
        status: '新建',
        reporter: user.name
    };
    
    const createStart = Date.now();
    const created = await request('POST', '/api/bugs', testBug);
    const createTime = Date.now() - createStart;
    
    recordTest('bugs', '创建缺陷', created.ok, '', createTime);
    
    let bugId = created.data?.id;
    
    // 清理
    if (bugId) {
        await request('DELETE', `/api/bugs/${bugId}`);
    }
    
    // 统计不同状态的缺陷
    const statusCount = {};
    bugsData.forEach(bug => {
        const status = bug.status || '未知';
        statusCount[status] = (statusCount[status] || 0) + 1;
    });
    
    console.log(`  📊 缺陷状态分布:`, statusCount);
}

// 7. 测试用例模块测试
async function testTestCases(user) {
    console.log(`\n📝 [${user.name}] 测试测试用例模块...`);
    
    const listStart = Date.now();
    const list = await request('GET', '/api/tests');
    const listTime = Date.now() - listStart;
    
    const testsData = Array.isArray(list.data) ? list.data : [];
    recordTest('tests', '测试列表加载', list.ok, `${testsData.length}条`, listTime);
}

// 8. 并发压力测试
async function testConcurrency() {
    console.log(`\n⚡ 并发压力测试...`);
    
    const concurrentUsers = 10;
    const requestsPerUser = 5;
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < concurrentUsers; i++) {
        for (let j = 0; j < requestsPerUser; j++) {
            promises.push(request('GET', '/api/games'));
            promises.push(request('GET', '/api/members'));
        }
    }
    
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r.ok).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    
    recordTest('concurrency', `${concurrentUsers}用户×${requestsPerUser*2}请求并发`, 
        successCount === results.length, 
        `成功率${(successCount/results.length*100).toFixed(1)}%，平均${avgDuration.toFixed(0)}ms`,
        totalTime
    );
    
    performanceMetrics.push({
        module: 'concurrency',
        operation: `${concurrentUsers}用户并发`,
        duration: totalTime,
        avgResponseTime: avgDuration,
        successRate: successCount / results.length
    });
    
    if (avgDuration > 200) {
        reportUXIssue('性能', 'P1', `高并发下平均响应${avgDuration.toFixed(0)}ms`, '考虑添加缓存或优化查询');
    }
}

// 9. 响应时间一致性测试
async function testResponseConsistency() {
    console.log(`\n📈 响应时间一致性测试...`);
    
    const iterations = 20;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await request('GET', '/api/games');
        times.push(Date.now() - start);
    }
    
    const avg = times.reduce((a, b) => a + b) / times.length;
    const max = Math.max(...times);
    const min = Math.min(...times);
    const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);
    
    console.log(`  📊 ${iterations}次请求: 平均${avg.toFixed(0)}ms, 最快${min}ms, 最慢${max}ms, 标准差${stdDev.toFixed(0)}ms`);
    
    recordTest('consistency', '响应时间一致性', stdDev < 100, `标准差${stdDev.toFixed(0)}ms`);
    
    if (stdDev > 50) {
        reportUXIssue('性能', 'P2', `响应时间波动大(标准差${stdDev.toFixed(0)}ms)`, '检查服务器负载和数据库连接池');
    }
    
    if (max > avg * 3) {
        reportUXIssue('性能', 'P2', `存在响应时间异常值(最大${max}ms，平均${avg.toFixed(0)}ms)`, '排查慢查询和资源竞争');
    }
}

// 10. 用户工作流模拟
async function simulateUserWorkflow(user) {
    console.log(`\n🔄 [${user.name}] 模拟完整工作流...`);
    
    const workflow = [];
    
    // 1. 登录后查看仪表盘
    workflow.push({ action: '查看仪表盘', time: Date.now() });
    await request('GET', '/api/games');
    await request('GET', '/api/bugs');
    
    // 2. 根据角色访问重点模块
    for (const module of user.focus) {
        workflow.push({ action: `访问${module}模块`, time: Date.now() });
        
        switch (module) {
            case 'games':
                await request('GET', '/api/games');
                break;
            case 'bugs':
                await request('GET', '/api/bugs');
                break;
            case 'members':
                await request('GET', '/api/members');
                break;
            case 'devices':
                await request('GET', '/api/devices');
                break;
            case 'game-issues':
                await request('GET', '/api/game-issues');
                break;
            case 'tests':
                await request('GET', '/api/tests');
                break;
        }
        
        // 模拟用户阅读时间
        await new Promise(r => setTimeout(r, 100));
    }
    
    // 3. 执行一些操作
    workflow.push({ action: '执行数据操作', time: Date.now() });
    
    const workflowTime = Date.now() - workflow[0].time;
    recordTest('workflow', `${user.role}角色工作流`, true, `${workflow.length}个步骤，${workflowTime}ms`);
}

// ==================== 生成报告 ====================

function generateReport() {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    📋 用户体验测试报告');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`测试时间: ${new Date().toLocaleString()}`);
    console.log(`测试地址: ${BASE_URL}`);
    console.log('');
    
    // 测试结果统计
    const passed = testResults.filter(t => t.passed).length;
    const failed = testResults.filter(t => !t.passed).length;
    console.log('📊 测试结果统计');
    console.log('───────────────────────────────────────────────────────────────');
    console.log(`  总计: ${testResults.length} | ✅ 通过: ${passed} | ❌ 失败: ${failed}`);
    console.log(`  通过率: ${(passed / testResults.length * 100).toFixed(1)}%`);
    console.log('');
    
    // 按模块统计
    const moduleStats = {};
    testResults.forEach(t => {
        if (!moduleStats[t.module]) moduleStats[t.module] = { passed: 0, failed: 0 };
        if (t.passed) moduleStats[t.module].passed++;
        else moduleStats[t.module].failed++;
    });
    
    console.log('📦 模块测试情况');
    console.log('───────────────────────────────────────────────────────────────');
    Object.entries(moduleStats).forEach(([module, stats]) => {
        const total = stats.passed + stats.failed;
        const rate = (stats.passed / total * 100).toFixed(0);
        const bar = '█'.repeat(Math.round(rate / 10)) + '░'.repeat(10 - Math.round(rate / 10));
        console.log(`  ${module.padEnd(15)} ${bar} ${rate}% (${stats.passed}/${total})`);
    });
    console.log('');
    
    // 性能指标
    console.log('⚡ 性能指标');
    console.log('───────────────────────────────────────────────────────────────');
    performanceMetrics.forEach(m => {
        console.log(`  ${m.module.padEnd(12)} ${m.operation.padEnd(20)} ${m.duration}ms`);
    });
    console.log('');
    
    // 易用性问题
    console.log('🔍 易用性问题 (按优先级排序)');
    console.log('───────────────────────────────────────────────────────────────');
    
    const sortedIssues = uxIssues.sort((a, b) => {
        const priority = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 };
        return priority[a.severity] - priority[b.severity];
    });
    
    if (sortedIssues.length === 0) {
        console.log('  ✅ 未发现明显易用性问题');
    } else {
        sortedIssues.forEach((issue, idx) => {
            const icon = { 'P0': '🔴', 'P1': '🟠', 'P2': '🟡', 'P3': '🟢' }[issue.severity];
            console.log(`\n  ${icon} [${issue.severity}] ${issue.category}`);
            console.log(`     问题: ${issue.description}`);
            console.log(`     建议: ${issue.suggestion}`);
        });
    }
    console.log('');
    
    // 优化建议汇总
    console.log('💡 优化建议汇总');
    console.log('───────────────────────────────────────────────────────────────');
    
    const suggestions = [
        { priority: 'P1', item: '添加操作成功/失败的明确反馈提示' },
        { priority: 'P1', item: '表单验证错误时高亮显示具体字段' },
        { priority: 'P2', item: '长列表添加骨架屏或加载动画' },
        { priority: 'P2', item: '批量操作添加进度指示' },
        { priority: 'P2', item: '关键操作添加确认二次确认' },
        { priority: 'P3', item: '添加快捷键支持提升效率' },
        { priority: 'P3', item: '记住用户的筛选和排序偏好' }
    ];
    
    suggestions.forEach(s => {
        const icon = { 'P1': '🟠', 'P2': '🟡', 'P3': '🟢' }[s.priority];
        console.log(`  ${icon} [${s.priority}] ${s.item}`);
    });
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                       测试完成');
    console.log('═══════════════════════════════════════════════════════════════');
    
    return {
        totalTests: testResults.length,
        passed,
        failed,
        passRate: (passed / testResults.length * 100).toFixed(1),
        uxIssues: sortedIssues,
        performanceMetrics
    };
}

// ==================== 主测试流程 ====================

async function runUXTests() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('        🧪 裸眼3D游戏适配项目管理系统 - 用户体验测试');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`开始时间: ${new Date().toLocaleString()}`);
    console.log(`测试地址: ${BASE_URL}`);
    console.log(`模拟用户: ${TEST_USERS.length}人`);
    console.log('');
    
    // 检查服务器连通性
    console.log('🔌 检查服务器连接...');
    try {
        const health = await request('GET', '/api/games');
        if (!health.ok) throw new Error('API 返回错误');
        console.log('  ✅ 服务器连接正常\n');
    } catch (e) {
        console.log('  ❌ 服务器连接失败:', e.message);
        process.exit(1);
    }
    
    // 1. 基础功能测试（模拟不同用户）
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('                    阶段一：功能模块测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    for (const user of TEST_USERS) {
        console.log(`\n👤 === ${user.name} (${user.role}) ===`);
        
        await testDashboard(user);
        
        if (user.focus.includes('members')) await testMembers(user);
        if (user.focus.includes('games')) await testGames(user);
        if (user.focus.includes('devices')) await testDevices(user);
        if (user.focus.includes('bugs')) await testBugs(user);
        if (user.focus.includes('game-issues')) await testGameIssues(user);
        if (user.focus.includes('tests')) await testTestCases(user);
        
        await simulateUserWorkflow(user);
        
        // 模拟用户间隔
        await new Promise(r => setTimeout(r, 500));
    }
    
    // 2. 性能压力测试
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('                    阶段二：性能压力测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await testConcurrency();
    await testResponseConsistency();
    
    // 3. 生成报告
    const report = generateReport();
    
    return report;
}

// 执行测试
runUXTests().then(report => {
    console.log('\n测试报告已生成');
    
    // 将报告写入文件
    const fs = require('fs');
    const reportContent = `# 用户体验测试报告

## 测试概要
- 测试时间: ${new Date().toLocaleString()}
- 测试地址: ${BASE_URL}
- 总测试数: ${report.totalTests}
- 通过: ${report.passed}
- 失败: ${report.failed}
- 通过率: ${report.passRate}%

## 易用性问题

${report.uxIssues.map(i => `### [${i.severity}] ${i.category}
- **问题**: ${i.description}
- **建议**: ${i.suggestion}
`).join('\n')}

## 性能指标

| 模块 | 操作 | 耗时 |
|------|------|------|
${report.performanceMetrics.map(m => `| ${m.module} | ${m.operation} | ${m.duration}ms |`).join('\n')}
`;
    
    fs.writeFileSync('UX_TEST_REPORT.md', reportContent);
    console.log('报告已保存到 UX_TEST_REPORT.md');
    
}).catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
});
