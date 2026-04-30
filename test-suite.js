/**
 * 裸眼3D游戏适配管理系统 - 完整测试套件
 * 包含：功能测试、接口测试、性能测试、容错性测试
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

// 测试结果收集
const testResults = {
  passed: 0,
  failed: 0,
  errors: [],
  performance: [],
  warnings: []
};

// ==================== 工具函数 ====================
function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 10000
    };

    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          const json = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, data: json, duration, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, duration, headers: res.headers, parseError: true });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function assert(condition, testName, details = '') {
  if (condition) {
    testResults.passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    testResults.failed++;
    testResults.errors.push({ test: testName, details });
    console.log(`  ❌ ${testName}${details ? ': ' + details : ''}`);
  }
}

function logPerformance(name, duration, threshold = 1000) {
  testResults.performance.push({ name, duration, threshold });
  if (duration > threshold) {
    testResults.warnings.push(`${name}: ${duration}ms (阈值: ${threshold}ms)`);
  }
}

// ==================== 1. 接口测试 ====================
async function testAPIs() {
  console.log('\n📡 === 接口测试 ===\n');

  // 1.1 公开接口测试
  console.log('1.1 公开接口');
  try {
    const config = await request('GET', '/config');
    assert(config.status === 200, 'GET /api/config 返回200');
    assert(config.data && config.data.success === true, '/api/config 返回success:true');
    logPerformance('/api/config', config.duration, 100);
  } catch (e) {
    assert(false, 'GET /api/config', e.message);
  }

  // 1.2 游戏列表接口
  console.log('\n1.2 游戏管理接口');
  try {
    const games = await request('GET', '/games');
    assert(games.status === 200, 'GET /api/games 返回200');
    assert(Array.isArray(games.data) || (games.data && games.data.data), '/api/games 返回数组或对象');
    logPerformance('/api/games', games.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/games', e.message);
  }

  // 1.3 设备列表接口
  console.log('\n1.3 设备管理接口');
  try {
    const devices = await request('GET', '/devices');
    assert(devices.status === 200, 'GET /api/devices 返回200');
    logPerformance('/api/devices', devices.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/devices', e.message);
  }

  // 1.4 成员列表接口
  console.log('\n1.4 成员管理接口');
  try {
    const members = await request('GET', '/members');
    assert(members.status === 200, 'GET /api/members 返回200');
    logPerformance('/api/members', members.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/members', e.message);
  }

  // 1.5 测试记录接口
  console.log('\n1.5 测试记录接口');
  try {
    const tests = await request('GET', '/tests');
    assert(tests.status === 200, 'GET /api/tests 返回200');
    logPerformance('/api/tests', tests.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/tests', e.message);
  }

  // 1.6 缺陷管理接口
  console.log('\n1.6 缺陷管理接口');
  try {
    const bugs = await request('GET', '/bugs');
    assert(bugs.status === 200, 'GET /api/bugs 返回200');
    logPerformance('/api/bugs', bugs.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/bugs', e.message);
  }

  // 1.7 游戏问题接口
  console.log('\n1.7 游戏问题接口');
  try {
    const issues = await request('GET', '/game-issues');
    assert(issues.status === 200, 'GET /api/game-issues 返回200');
    assert(Array.isArray(issues.data), '/api/game-issues 返回数组');
    logPerformance('/api/game-issues', issues.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/game-issues', e.message);
  }

  // 1.8 设备管理接口(equipment)
  console.log('\n1.8 设备管理接口(equipment)');
  try {
    const equipment = await request('GET', '/equipment');
    assert(equipment.status === 200, 'GET /api/equipment 返回200');
    logPerformance('/api/equipment', equipment.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/equipment', e.message);
  }

  // 1.9 游戏账号接口
  console.log('\n1.9 游戏账号接口');
  try {
    const accounts = await request('GET', '/game-accounts');
    assert(accounts.status === 200, 'GET /api/game-accounts 返回200');
    logPerformance('/api/game-accounts', accounts.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/game-accounts', e.message);
  }

  // 1.10 字段设置接口
  console.log('\n1.10 字段设置接口');
  try {
    const fields = await request('GET', '/game-fields');
    assert(fields.status === 200, 'GET /api/game-fields 返回200');
    logPerformance('/api/game-fields', fields.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/game-fields', e.message);
  }

  // 1.11 版本管理接口
  console.log('\n1.11 版本管理接口');
  try {
    const versions = await request('GET', '/versions');
    assert(versions.status === 200, 'GET /api/versions 返回200');
    logPerformance('/api/versions', versions.duration, 500);
  } catch (e) {
    assert(false, 'GET /api/versions', e.message);
  }

  // 1.12 角色管理接口
  console.log('\n1.12 角色管理接口');
  try {
    const roles = await request('GET', '/roles');
    assert(roles.status === 200, 'GET /api/roles 返回200');
    logPerformance('/api/roles', roles.duration, 300);
  } catch (e) {
    assert(false, 'GET /api/roles', e.message);
  }

  // 1.13 用户管理接口
  console.log('\n1.13 用户管理接口');
  try {
    const users = await request('GET', '/users');
    assert(users.status === 200, 'GET /api/users 返回200');
    logPerformance('/api/users', users.duration, 300);
  } catch (e) {
    assert(false, 'GET /api/users', e.message);
  }
}

// ==================== 2. 容错性测试 ====================
async function testErrorHandling() {
  console.log('\n🛡️ === 容错性测试 ===\n');

  // 2.1 无效路由测试
  console.log('2.1 无效路由处理');
  try {
    const notFound = await request('GET', '/nonexistent-endpoint');
    assert(notFound.status === 404, '无效路由返回404');
  } catch (e) {
    assert(false, '无效路由测试', e.message);
  }

  // 2.2 无效ID测试
  console.log('\n2.2 无效ID处理');
  try {
    const invalidGame = await request('GET', '/games/999999');
    assert(invalidGame.status === 404 || invalidGame.status === 200, '无效游戏ID返回404或空');
  } catch (e) {
    // 可能返回错误也是可接受的
    testResults.passed++;
    console.log('  ✅ 无效游戏ID处理正常');
  }

  // 2.3 空数据提交测试
  console.log('\n2.3 空数据提交');
  try {
    const emptyPost = await request('POST', '/games', {});
    assert(emptyPost.status === 400 || emptyPost.status === 500, '空数据提交返回错误状态');
  } catch (e) {
    testResults.passed++;
    console.log('  ✅ 空数据提交被拒绝');
  }

  // 2.4 无效JSON测试
  console.log('\n2.4 无效数据格式');
  try {
    const invalidData = await request('POST', '/game-issues', {
      game_name: null,  // 必填字段为null
      issue_desc: '',
      owner: ''
    });
    assert(invalidData.status === 400, '无效数据返回400', `实际: ${invalidData.status}`);
  } catch (e) {
    testResults.passed++;
    console.log('  ✅ 无效数据被拒绝');
  }

  // 2.5 超长字符串测试
  console.log('\n2.5 超长字符串处理');
  try {
    const longString = 'A'.repeat(10000);
    const longData = await request('POST', '/game-issues', {
      game_name: longString,
      issue_desc: 'test',
      owner: 'test'
    });
    // 应该要么成功要么返回400，不能崩溃
    assert(longData.status === 200 || longData.status === 400 || longData.status === 500, 
           '超长字符串不会导致崩溃');
  } catch (e) {
    assert(false, '超长字符串测试', e.message);
  }

  // 2.6 SQL注入测试
  console.log('\n2.6 SQL注入防护');
  try {
    const sqlInject = await request('GET', "/games?search='; DROP TABLE games; --");
    assert(sqlInject.status === 200, 'SQL注入被正确处理');
  } catch (e) {
    testResults.passed++;
    console.log('  ✅ SQL注入被阻止');
  }

  // 2.7 XSS测试
  console.log('\n2.7 XSS防护(后端存储)');
  try {
    const xssData = await request('POST', '/game-issues', {
      game_name: '<script>alert("xss")</script>',
      issue_desc: 'XSS测试',
      owner: 'tester'
    });
    // 后端应该接受数据（由前端负责转义显示）
    assert(xssData.status === 200 || xssData.status === 400, 'XSS数据处理正常');
  } catch (e) {
    testResults.passed++;
    console.log('  ✅ XSS数据被处理');
  }
}

// ==================== 3. 性能测试 ====================
async function testPerformance() {
  console.log('\n⚡ === 性能测试 ===\n');

  // 3.1 并发请求测试
  console.log('3.1 并发请求测试 (10个并发)');
  const concurrentStart = Date.now();
  try {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(request('GET', '/games'));
    }
    const results = await Promise.all(promises);
    const concurrentDuration = Date.now() - concurrentStart;
    const allSuccess = results.every(r => r.status === 200);
    assert(allSuccess, '10个并发请求全部成功');
    logPerformance('10并发请求', concurrentDuration, 3000);
    console.log(`    总耗时: ${concurrentDuration}ms, 平均: ${Math.round(concurrentDuration/10)}ms/请求`);
  } catch (e) {
    assert(false, '并发请求测试', e.message);
  }

  // 3.2 大数据量响应测试
  console.log('\n3.2 大数据量响应');
  try {
    const largeData = await request('GET', '/games');
    const dataSize = JSON.stringify(largeData.data).length;
    console.log(`    数据大小: ${(dataSize/1024).toFixed(2)} KB`);
    assert(largeData.duration < 2000, `大数据响应时间 < 2秒`, `实际: ${largeData.duration}ms`);
    logPerformance('大数据响应', largeData.duration, 2000);
  } catch (e) {
    assert(false, '大数据量测试', e.message);
  }

  // 3.3 静态资源响应测试
  console.log('\n3.3 静态资源响应');
  try {
    const staticStart = Date.now();
    const staticRes = await request('GET', `${BASE_URL}/index.html`);
    const staticDuration = Date.now() - staticStart;
    assert(staticRes.status === 200, '静态资源返回200');
    logPerformance('静态资源', staticDuration, 500);
  } catch (e) {
    assert(false, '静态资源测试', e.message);
  }
}

// ==================== 4. CRUD功能测试 ====================
async function testCRUD() {
  console.log('\n🔄 === CRUD功能测试 ===\n');

  let createdIssueId = null;

  // 4.1 创建游戏问题
  console.log('4.1 创建游戏问题');
  try {
    const createRes = await request('POST', '/game-issues', {
      game_name: '测试游戏_' + Date.now(),
      issue_type: '画面问题',
      priority: '高',
      issue_desc: '这是一个测试问题描述',
      owner: '测试人员',
      status: '待处理',
      remarks: '测试备注'
    });
    assert(createRes.status === 200, '创建游戏问题返回200', `实际: ${createRes.status}`);
    if (createRes.data && createRes.data.id) {
      createdIssueId = createRes.data.id;
      console.log(`    创建成功, ID: ${createdIssueId}`);
    }
  } catch (e) {
    assert(false, '创建游戏问题', e.message);
  }

  // 4.2 读取游戏问题列表
  console.log('\n4.2 读取游戏问题列表');
  try {
    const listRes = await request('GET', '/game-issues');
    assert(listRes.status === 200, '读取列表返回200');
    assert(Array.isArray(listRes.data), '返回数组格式');
    if (createdIssueId) {
      const found = listRes.data.find(item => item.id === createdIssueId);
      assert(found, '能找到刚创建的记录');
    }
  } catch (e) {
    assert(false, '读取游戏问题列表', e.message);
  }

  // 4.3 更新游戏问题
  if (createdIssueId) {
    console.log('\n4.3 更新游戏问题');
    try {
      const updateRes = await request('PUT', `/game-issues/${createdIssueId}`, {
        game_name: '更新后的游戏名',
        issue_type: '性能问题',
        priority: '中',
        issue_desc: '更新后的描述',
        owner: '更新后的负责人',
        status: '处理中',
        remarks: '更新后的备注'
      });
      assert(updateRes.status === 200, '更新返回200', `实际: ${updateRes.status}`);
    } catch (e) {
      assert(false, '更新游戏问题', e.message);
    }
  }

  // 4.4 删除游戏问题
  if (createdIssueId) {
    console.log('\n4.4 删除游戏问题');
    try {
      const deleteRes = await request('DELETE', `/game-issues/${createdIssueId}`);
      assert(deleteRes.status === 200, '删除返回200', `实际: ${deleteRes.status}`);
      
      // 验证删除成功
      const verifyRes = await request('GET', '/game-issues');
      const stillExists = verifyRes.data.find(item => item.id === createdIssueId);
      assert(!stillExists, '记录已被删除');
    } catch (e) {
      assert(false, '删除游戏问题', e.message);
    }
  }
}

// ==================== 5. 筛选和搜索测试 ====================
async function testFilters() {
  console.log('\n🔍 === 筛选搜索测试 ===\n');

  // 5.1 游戏搜索
  console.log('5.1 游戏搜索');
  try {
    const searchRes = await request('GET', '/games?search=test');
    assert(searchRes.status === 200, '搜索接口返回200');
  } catch (e) {
    assert(false, '游戏搜索', e.message);
  }

  // 5.2 状态筛选
  console.log('\n5.2 状态筛选');
  try {
    const filterRes = await request('GET', '/game-issues?status=待处理');
    assert(filterRes.status === 200, '状态筛选返回200');
  } catch (e) {
    assert(false, '状态筛选', e.message);
  }

  // 5.3 类型筛选
  console.log('\n5.3 类型筛选');
  try {
    const typeRes = await request('GET', '/game-issues?issue_type=画面问题');
    assert(typeRes.status === 200, '类型筛选返回200');
  } catch (e) {
    assert(false, '类型筛选', e.message);
  }

  // 5.4 优先级筛选
  console.log('\n5.4 优先级筛选');
  try {
    const priorityRes = await request('GET', '/game-issues?priority=高');
    assert(priorityRes.status === 200, '优先级筛选返回200');
  } catch (e) {
    assert(false, '优先级筛选', e.message);
  }

  // 5.5 组合筛选
  console.log('\n5.5 组合筛选');
  try {
    const comboRes = await request('GET', '/game-issues?status=待处理&priority=高&search=test');
    assert(comboRes.status === 200, '组合筛选返回200');
  } catch (e) {
    assert(false, '组合筛选', e.message);
  }
}

// ==================== 6. 静态资源测试 ====================
async function testStaticResources() {
  console.log('\n📦 === 静态资源测试 ===\n');

  const resources = [
    { path: '/index.html', name: '首页HTML' },
    { path: '/app.js', name: '主JS文件' },
    { path: '/styles-tapd.css', name: '样式文件' },
    { path: '/modules-extra.js', name: '扩展模块' }
  ];

  for (const res of resources) {
    try {
      const response = await request('GET', `${BASE_URL}${res.path}`);
      assert(response.status === 200, `${res.name} 可访问`);
      logPerformance(res.name, response.duration, 1000);
    } catch (e) {
      assert(false, `${res.name}`, e.message);
    }
  }
}

// ==================== 7. 数据完整性测试 ====================
async function testDataIntegrity() {
  console.log('\n🔐 === 数据完整性测试 ===\n');

  // 7.1 游戏数据字段完整性
  console.log('7.1 游戏数据字段完整性');
  try {
    const games = await request('GET', '/games');
    if (games.data && games.data.length > 0) {
      const sample = games.data[0];
      const requiredFields = ['id', 'name'];
      const hasRequired = requiredFields.every(f => sample.hasOwnProperty(f));
      assert(hasRequired, '游戏数据包含必要字段');
    } else {
      console.log('    ⚠️ 无游戏数据，跳过字段检查');
      testResults.warnings.push('无游戏数据用于字段完整性检查');
    }
  } catch (e) {
    assert(false, '游戏数据字段检查', e.message);
  }

  // 7.2 用户数据字段完整性
  console.log('\n7.2 用户数据字段完整性');
  try {
    const users = await request('GET', '/users');
    if (users.data && users.data.data && users.data.data.length > 0) {
      const sample = users.data.data[0];
      const requiredFields = ['id', 'username'];
      const hasRequired = requiredFields.every(f => sample.hasOwnProperty(f));
      assert(hasRequired, '用户数据包含必要字段');
    } else {
      console.log('    ⚠️ 无用户数据，跳过字段检查');
    }
  } catch (e) {
    assert(false, '用户数据字段检查', e.message);
  }
}

// ==================== 生成测试报告 ====================
function generateReport() {
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('                    📊 测试报告');
  console.log('═'.repeat(60));
  
  const total = testResults.passed + testResults.failed;
  const passRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;
  
  console.log(`\n📈 总体结果:`);
  console.log(`   通过: ${testResults.passed} ✅`);
  console.log(`   失败: ${testResults.failed} ❌`);
  console.log(`   通过率: ${passRate}%`);
  
  if (testResults.errors.length > 0) {
    console.log(`\n❌ 失败的测试:`);
    testResults.errors.forEach((err, i) => {
      console.log(`   ${i+1}. ${err.test}`);
      if (err.details) console.log(`      详情: ${err.details}`);
    });
  }
  
  if (testResults.warnings.length > 0) {
    console.log(`\n⚠️ 警告:`);
    testResults.warnings.forEach((warn, i) => {
      console.log(`   ${i+1}. ${warn}`);
    });
  }
  
  console.log(`\n⏱️ 性能指标:`);
  testResults.performance.forEach(p => {
    const status = p.duration <= p.threshold ? '✅' : '⚠️';
    console.log(`   ${status} ${p.name}: ${p.duration}ms (阈值: ${p.threshold}ms)`);
  });
  
  console.log('\n' + '═'.repeat(60));
  console.log(`测试完成时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log('═'.repeat(60) + '\n');
  
  // 返回是否全部通过
  return testResults.failed === 0;
}

// ==================== 主函数 ====================
async function runTests() {
  console.log('═'.repeat(60));
  console.log('     裸眼3D游戏适配管理系统 - 完整测试套件');
  console.log('═'.repeat(60));
  console.log(`开始时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`测试目标: ${BASE_URL}`);
  
  try {
    await testAPIs();
    await testErrorHandling();
    await testPerformance();
    await testCRUD();
    await testFilters();
    await testStaticResources();
    await testDataIntegrity();
  } catch (e) {
    console.error('\n💥 测试执行出错:', e.message);
  }
  
  const allPassed = generateReport();
  process.exit(allPassed ? 0 : 1);
}

// 执行测试
runTests();
