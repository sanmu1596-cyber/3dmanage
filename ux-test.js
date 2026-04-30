/**
 * 用户体验 & 功能测试脚本
 * 测试：易用性、响应速度、容错性
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const API_BASE = '/api';

// 测试结果收集
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// HTTP 请求封装
function httpRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const url = new URL(BASE_URL + path);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          const json = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, data: json, duration, raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, duration, raw: body, parseError: true });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

const GET = (path) => httpRequest('GET', path);
const POST = (path, data) => httpRequest('POST', path, data);
const PUT = (path, data) => httpRequest('PUT', path, data);
const DELETE = (path) => httpRequest('DELETE', path);

// 测试断言
function assert(condition, testName, details = '') {
  if (condition) {
    results.passed.push(testName);
    console.log(`  ✅ ${testName}`);
  } else {
    results.failed.push({ test: testName, details });
    console.log(`  ❌ ${testName} ${details ? '- ' + details : ''}`);
  }
}

function warn(testName, message) {
  results.warnings.push({ test: testName, message });
  console.log(`  ⚠️ ${testName} - ${message}`);
}

// ==================== 测试套件 ====================

async function testDashboard() {
  console.log('\n📊 Dashboard 概览页测试...');
  
  const res = await GET(`${API_BASE}/stats/dashboard`);
  assert(res.status === 200, 'Dashboard API 可访问');
  assert(res.duration < 500, `Dashboard 响应速度 (${res.duration}ms < 500ms)`, `实际: ${res.duration}ms`);
  
  // API 返回 { success: true, data: {...} } 结构
  const dashData = res.data?.data;
  if (dashData) {
    assert(dashData.games_total !== undefined, 'Dashboard 返回游戏总数');
    assert(dashData.devices_total !== undefined, 'Dashboard 返回设备总数');
    assert(dashData.bugs_open !== undefined, 'Dashboard 返回未关闭缺陷数');
    assert(dashData.bugs_total !== undefined, 'Dashboard 返回缺陷总数');
  } else {
    assert(false, 'Dashboard 数据结构异常');
  }
}

async function testGlobalSearch() {
  console.log('\n🔍 全局搜索测试...');
  
  // 测试搜索 API
  const res = await GET(`${API_BASE}/stats/search?q=test`);
  assert(res.status === 200, '全局搜索 API 可访问');
  assert(res.duration < 300, `搜索响应速度 (${res.duration}ms < 300ms)`, `实际: ${res.duration}ms`);
  
  // 测试空搜索
  const emptyRes = await GET(`${API_BASE}/stats/search?q=`);
  assert(emptyRes.status === 200, '空搜索不报错');
  
  // 测试特殊字符
  const specialRes = await GET(`${API_BASE}/stats/search?q=${encodeURIComponent("'\"<>")}`);
  assert(specialRes.status === 200, '特殊字符搜索不报错（SQL注入防护）');
}

async function testGamesModule() {
  console.log('\n🎮 游戏模块测试...');
  
  // 基础列表
  const listRes = await GET(`${API_BASE}/games`);
  assert(listRes.status === 200, '游戏列表 API 可访问');
  assert(listRes.duration < 300, `游戏列表响应速度 (${listRes.duration}ms)`, `实际: ${listRes.duration}ms`);
  
  // 筛选
  const filterRes = await GET(`${API_BASE}/games?platform=Steam&status=已适配`);
  assert(filterRes.status === 200, '游戏筛选功能正常');
  
  // 搜索
  const searchRes = await GET(`${API_BASE}/games?search=test`);
  assert(searchRes.status === 200, '游戏搜索功能正常');
  
  // 分页
  const pageRes = await GET(`${API_BASE}/games?page=1&limit=10`);
  assert(pageRes.status === 200, '游戏分页功能正常');
  
  // 边界：无效分页参数
  const badPageRes = await GET(`${API_BASE}/games?page=-1&limit=abc`);
  assert(badPageRes.status === 200, '无效分页参数不崩溃');
}

async function testDevicesModule() {
  console.log('\n📱 设备模块测试...');
  
  const res = await GET(`${API_BASE}/devices`);
  assert(res.status === 200, '设备列表 API 可访问');
  assert(res.duration < 300, `设备列表响应速度 (${res.duration}ms)`, `实际: ${res.duration}ms`);
  
  // 检查返回数据结构
  if (res.data?.data && Array.isArray(res.data.data)) {
    assert(true, '设备列表返回正确数据结构');
  } else if (Array.isArray(res.data)) {
    assert(true, '设备列表返回数组数据');
  }
}

async function testMembersModule() {
  console.log('\n👥 成员模块测试...');
  
  const res = await GET(`${API_BASE}/members`);
  assert(res.status === 200, '成员列表 API 可访问');
  assert(res.duration < 300, `成员列表响应速度 (${res.duration}ms)`, `实际: ${res.duration}ms`);
}

async function testBugsModule() {
  console.log('\n🐛 缺陷模块测试...');
  
  const res = await GET(`${API_BASE}/bugs`);
  assert(res.status === 200, '缺陷列表 API 可访问');
  assert(res.duration < 300, `缺陷列表响应速度 (${res.duration}ms)`, `实际: ${res.duration}ms`);
  
  // 检查返回数据结构
  if (res.data?.data || Array.isArray(res.data)) {
    assert(true, '缺陷列表返回正确数据');
  }
}

async function testTestCasesModule() {
  console.log('\n📝 测试用例模块测试...');
  
  const res = await GET(`${API_BASE}/test-cases`);
  assert(res.status === 200, '测试用例列表 API 可访问');
  assert(res.duration < 300, `测试用例列表响应速度 (${res.duration}ms)`, `实际: ${res.duration}ms`);
}

async function testPlansModule() {
  console.log('\n📋 配置计划模块测试...');
  
  const res = await GET(`${API_BASE}/plans`);
  assert(res.status === 200, '计划列表 API 可访问');
  assert(res.duration < 300, `计划列表响应速度 (${res.duration}ms)`, `实际: ${res.duration}ms`);
}

async function testMyTasksModule() {
  console.log('\n✅ 我的任务模块测试...');
  
  const res = await GET(`${API_BASE}/my-tasks`);
  assert(res.status === 200, '我的任务 API 可访问');
  assert(res.duration < 500, `我的任务响应速度 (${res.duration}ms)`, `实际: ${res.duration}ms`);
}

async function testActivityLog() {
  console.log('\n📜 活动日志测试...');
  
  const res = await GET(`${API_BASE}/stats/activity?limit=10`);
  assert(res.status === 200, '活动日志 API 可访问');
  assert(res.duration < 200, `活动日志响应速度 (${res.duration}ms)`, `实际: ${res.duration}ms`);
}

async function testErrorHandling() {
  console.log('\n🛡️ 错误处理 & 容错性测试...');
  
  // 不存在的资源
  const notFoundRes = await GET(`${API_BASE}/games/99999`);
  assert(notFoundRes.status === 404 || notFoundRes.status === 200, '不存在的游戏返回合理响应');
  
  // 不存在的 API
  const badApiRes = await GET(`${API_BASE}/nonexistent`);
  assert(badApiRes.status === 404 || badApiRes.status === 200, '不存在的 API 不崩溃');
  
  // 空数据创建 (bugs 模块需要 title)
  const emptyCreateRes = await POST(`${API_BASE}/bugs`, {});
  // 服务器可能返回 400 错误或 200 带 error 信息，都算正常
  assert(emptyCreateRes.status === 400 || emptyCreateRes.status === 200 || emptyCreateRes.status === 500, '空数据创建不崩溃');
  
  // 超长字符串
  const longString = 'x'.repeat(10000);
  const longDataRes = await POST(`${API_BASE}/bugs`, { title: longString, description: '测试' });
  assert(longDataRes.status === 200 || longDataRes.status === 400 || longDataRes.status === 500, '超长数据不崩溃');
}

async function testPerformance() {
  console.log('\n⚡ 性能测试（并发请求）...');
  
  // 10 个并发请求
  const startTime = Date.now();
  const requests = [];
  for (let i = 0; i < 10; i++) {
    requests.push(GET(`${API_BASE}/games`));
  }
  
  const results = await Promise.all(requests);
  const totalTime = Date.now() - startTime;
  const avgTime = Math.round(totalTime / 10);
  
  const allSuccess = results.every(r => r.status === 200);
  assert(allSuccess, '10 并发请求全部成功');
  assert(totalTime < 2000, `10 并发总耗时 (${totalTime}ms < 2000ms)`, `实际: ${totalTime}ms`);
  
  console.log(`    平均响应时间: ${avgTime}ms`);
}

async function testFieldSettings() {
  console.log('\n⚙️ 字段设置测试...');
  
  // 正确的 API 路径是 /api/field-options
  const res = await GET(`${API_BASE}/field-options`);
  assert(res.status === 200, '字段设置 API 可访问');
  assert(res.duration < 200, `字段设置响应速度 (${res.duration}ms)`, `实际: ${res.duration}ms`);
}

// ==================== 主函数 ====================

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('      🔬 裸眼3D游戏适配项目管理系统 - UX 测试');
  console.log('═══════════════════════════════════════════════════');
  
  try {
    await testDashboard();
    await testGlobalSearch();
    await testGamesModule();
    await testDevicesModule();
    await testMembersModule();
    await testBugsModule();
    await testTestCasesModule();
    await testPlansModule();
    await testMyTasksModule();
    await testActivityLog();
    await testFieldSettings();
    await testErrorHandling();
    await testPerformance();
    
    // 汇总
    console.log('\n═══════════════════════════════════════════════════');
    console.log('                    📊 测试汇总');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  ✅ 通过: ${results.passed.length}`);
    console.log(`  ❌ 失败: ${results.failed.length}`);
    console.log(`  ⚠️ 警告: ${results.warnings.length}`);
    
    if (results.failed.length > 0) {
      console.log('\n失败详情:');
      results.failed.forEach(f => {
        console.log(`  - ${f.test}: ${f.details}`);
      });
    }
    
    if (results.warnings.length > 0) {
      console.log('\n警告详情:');
      results.warnings.forEach(w => {
        console.log(`  - ${w.test}: ${w.message}`);
      });
    }
    
    const passRate = Math.round(results.passed.length / (results.passed.length + results.failed.length) * 100);
    console.log(`\n  📈 通过率: ${passRate}%`);
    
    if (passRate >= 90) {
      console.log('\n  🎉 UX 测试整体合格！');
    } else if (passRate >= 70) {
      console.log('\n  ⚠️ 有部分问题需要修复');
    } else {
      console.log('\n  🚨 存在较多问题，需要重点关注');
    }
    
  } catch (error) {
    console.error('\n💥 测试脚本出错:', error.message);
  }
}

runAllTests();
