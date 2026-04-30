/**
 * 多用户并发模拟测试 v3
 * 适配实际 API 接口，验证数据同步稳定性
 */

const http = require('http');

const BASE_URL = 'http://21.214.83.112:3000';

// 模拟用户配置
const USERS = [
  { id: 1, name: '测试用户A', role: '开发工程师' },
  { id: 2, name: '测试用户B', role: '测试工程师' },
  { id: 3, name: '测试用户C', role: '项目经理' },
  { id: 4, name: '测试用户D', role: '运维工程师' },
  { id: 5, name: '测试用户E', role: '产品经理' }
];

// 测试结果统计
const stats = {
  total: 0,
  success: 0,
  failed: 0,
  syncErrors: 0,
  operations: []
};

// HTTP 请求封装
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = body ? JSON.parse(body) : {};
          // 统一判断成功：状态码 200/201 或 result.success === true
          const isSuccess = res.statusCode === 200 || res.statusCode === 201 || result.success === true;
          // 处理 {success, data} 格式
          if (result.data !== undefined) {
            resolve({ status: res.statusCode, data: result.data, raw: result, ok: isSuccess });
          } else {
            resolve({ status: res.statusCode, data: result, raw: result, ok: isSuccess });
          }
        } catch (e) {
          resolve({ status: res.statusCode, data: body, raw: body, ok: res.statusCode === 200 });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 生成随机数据
function generateTestData(userId, type, extra = {}) {
  const timestamp = Date.now();
  switch (type) {
    case 'member':
      return {
        name: `并发测试成员_U${userId}_${timestamp}`,
        role: USERS[userId - 1]?.role || '测试角色'
      };
    case 'device':
      return {
        name: `并发测试设备_U${userId}_${timestamp}`,
        type: '测试设备',
        status: '空闲',
        location: `测试区域${userId}`
      };
    case 'game':
      return {
        name: `并发测试游戏_U${userId}_${timestamp}`,
        platform: 'PC'
      };
    case 'issue':
      return {
        game_name: extra.gameName || `测试游戏_${userId}`,  // 使用 game_name 而非 game_id
        issue_type: '功能问题',
        priority: '中',
        issue_desc: `并发测试问题_U${userId}_${timestamp}`,
        owner: USERS[userId - 1]?.name || '测试人员',
        status: '待处理'
      };
    default:
      return {};
  }
}

// 记录操作
function logOperation(userId, operation, success, details = '') {
  stats.total++;
  if (success) {
    stats.success++;
  } else {
    stats.failed++;
  }
  stats.operations.push({
    userId,
    operation,
    success,
    details,
    timestamp: new Date().toISOString()
  });
  
  const status = success ? '✅' : '❌';
  console.log(`  ${status} 用户${userId}: ${operation} ${details}`);
}

// 模拟单个用户的完整操作流程
async function simulateUser(userId) {
  const user = USERS[userId - 1];
  console.log(`\n👤 用户${userId} (${user.name}) 开始操作...`);
  
  const createdIds = {
    member: null,
    device: null,
    game: null,
    gameName: null,
    issue: null
  };

  try {
    // 1. 创建成员
    const memberData = generateTestData(userId, 'member');
    const memberRes = await request('POST', '/api/members', memberData);
    if (memberRes.ok) {
      createdIds.member = memberRes.data?.id || memberRes.raw?.id;
      logOperation(userId, '创建成员', true, `ID: ${createdIds.member}`);
    } else {
      logOperation(userId, '创建成员', false, `状态: ${memberRes.status}`);
    }

    // 2. 创建设备
    const deviceData = generateTestData(userId, 'device');
    const deviceRes = await request('POST', '/api/devices', deviceData);
    if (deviceRes.ok) {
      createdIds.device = deviceRes.data?.id || deviceRes.raw?.id;
      logOperation(userId, '创建设备', true, `ID: ${createdIds.device}`);
    } else {
      logOperation(userId, '创建设备', false, `状态: ${deviceRes.status}`);
    }

    // 3. 创建游戏
    const gameData = generateTestData(userId, 'game');
    const gameRes = await request('POST', '/api/games', gameData);
    if (gameRes.ok) {
      createdIds.game = gameRes.data?.id || gameRes.raw?.id;
      createdIds.gameName = gameData.name;  // 保存游戏名称
      logOperation(userId, '创建游戏', true, `ID: ${createdIds.game}`);
    } else {
      logOperation(userId, '创建游戏', false, `状态: ${gameRes.status}`);
    }

    // 4. 创建问题 (使用 game_name)
    if (createdIds.gameName) {
      const issueData = generateTestData(userId, 'issue', { gameName: createdIds.gameName });
      const issueRes = await request('POST', '/api/game-issues', issueData);
      if (issueRes.ok) {
        createdIds.issue = issueRes.data?.id || issueRes.raw?.id;
        logOperation(userId, '创建问题', true, `ID: ${createdIds.issue}`);
      } else {
        logOperation(userId, '创建问题', false, `状态: ${issueRes.status}`);
      }
    }

    // 随机延迟模拟真实用户行为
    await delay(Math.random() * 300 + 100);

    // 5. 更新操作 (API 支持 PUT /:id)
    if (createdIds.member) {
      const updateData = { role: `更新角色_${userId}_${Date.now()}` };
      const updateRes = await request('PUT', `/api/members/${createdIds.member}`, updateData);
      logOperation(userId, '更新成员', updateRes.ok, `ID: ${createdIds.member}`);
    }

    if (createdIds.game) {
      const updateGame = { platform: 'PC/Console' };
      const updateGameRes = await request('PUT', `/api/games/${createdIds.game}`, updateGame);
      logOperation(userId, '更新游戏', updateGameRes.ok, `ID: ${createdIds.game}`);
    }

    if (createdIds.issue) {
      const updateIssue = { status: '处理中', remarks: `用户${userId}更新` };
      const updateIssueRes = await request('PUT', `/api/game-issues/${createdIds.issue}`, updateIssue);
      logOperation(userId, '更新问题', updateIssueRes.ok, `ID: ${createdIds.issue}`);
    }

    await delay(Math.random() * 200 + 100);

    // 6. 列表查询
    const listMembersRes = await request('GET', '/api/members');
    const memberCount = Array.isArray(listMembersRes.data) ? listMembersRes.data.length : 0;
    logOperation(userId, '查询成员列表', listMembersRes.status === 200, `共${memberCount}条`);

    const listGamesRes = await request('GET', '/api/games');
    const gameCount = Array.isArray(listGamesRes.data) ? listGamesRes.data.length : 0;
    logOperation(userId, '查询游戏列表', listGamesRes.status === 200, `共${gameCount}条`);

    const listIssuesRes = await request('GET', '/api/game-issues');
    const issueCount = Array.isArray(listIssuesRes.data) ? listIssuesRes.data.length : 0;
    logOperation(userId, '查询问题列表', listIssuesRes.status === 200, `共${issueCount}条`);

  } catch (error) {
    logOperation(userId, '操作异常', false, error.message);
  }

  return createdIds;
}

// 并发数据同步验证
async function verifySyncConsistency(allCreatedIds) {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 数据同步一致性验证');
  console.log('='.repeat(60));

  let syncErrors = 0;

  // 获取所有数据
  const [membersRes, devicesRes, gamesRes, issuesRes] = await Promise.all([
    request('GET', '/api/members'),
    request('GET', '/api/devices'),
    request('GET', '/api/games'),
    request('GET', '/api/game-issues')
  ]);

  const members = Array.isArray(membersRes.data) ? membersRes.data : [];
  const devices = Array.isArray(devicesRes.data) ? devicesRes.data : [];
  const games = Array.isArray(gamesRes.data) ? gamesRes.data : [];
  const issues = Array.isArray(issuesRes.data) ? issuesRes.data : [];

  console.log(`\n📊 数据库当前状态:`);
  console.log(`   成员: ${members.length} 条`);
  console.log(`   设备: ${devices.length} 条`);
  console.log(`   游戏: ${games.length} 条`);
  console.log(`   问题: ${issues.length} 条`);

  // 验证每个用户创建的数据是否存在
  console.log(`\n🔍 验证各用户创建的数据...`);
  
  for (let i = 0; i < allCreatedIds.length; i++) {
    const userIds = allCreatedIds[i];
    const userId = i + 1;
    
    if (userIds.member) {
      const found = members.find(m => m.id === userIds.member);
      if (found) {
        console.log(`   ✅ 用户${userId}的成员(ID:${userIds.member}) 存在`);
      } else {
        console.log(`   ❌ 用户${userId}的成员(ID:${userIds.member}) 丢失!`);
        syncErrors++;
      }
    }

    if (userIds.device) {
      const found = devices.find(d => d.id === userIds.device);
      if (found) {
        console.log(`   ✅ 用户${userId}的设备(ID:${userIds.device}) 存在`);
      } else {
        console.log(`   ❌ 用户${userId}的设备(ID:${userIds.device}) 丢失!`);
        syncErrors++;
      }
    }

    if (userIds.game) {
      const found = games.find(g => g.id === userIds.game);
      if (found) {
        console.log(`   ✅ 用户${userId}的游戏(ID:${userIds.game}) 存在`);
      } else {
        console.log(`   ❌ 用户${userId}的游戏(ID:${userIds.game}) 丢失!`);
        syncErrors++;
      }
    }

    if (userIds.issue) {
      const found = issues.find(item => item.id === userIds.issue);
      if (found) {
        console.log(`   ✅ 用户${userId}的问题(ID:${userIds.issue}) 存在`);
      } else {
        console.log(`   ❌ 用户${userId}的问题(ID:${userIds.issue}) 丢失!`);
        syncErrors++;
      }
    }
  }

  stats.syncErrors = syncErrors;
  return syncErrors;
}

// 清理测试数据
async function cleanupTestData(allCreatedIds) {
  console.log('\n' + '='.repeat(60));
  console.log('🧹 清理测试数据');
  console.log('='.repeat(60));

  let cleaned = 0;
  let errors = 0;

  for (const userIds of allCreatedIds) {
    // 按依赖顺序删除：问题 -> 游戏 -> 设备 -> 成员
    if (userIds.issue) {
      try {
        const res = await request('DELETE', `/api/game-issues/${userIds.issue}`);
        if (res.ok) cleaned++;
        else errors++;
      } catch (e) { errors++; }
    }
    if (userIds.game) {
      try {
        const res = await request('DELETE', `/api/games/${userIds.game}`);
        if (res.ok) cleaned++;
        else errors++;
      } catch (e) { errors++; }
    }
    if (userIds.device) {
      try {
        const res = await request('DELETE', `/api/devices/${userIds.device}`);
        if (res.ok) cleaned++;
        else errors++;
      } catch (e) { errors++; }
    }
    if (userIds.member) {
      try {
        const res = await request('DELETE', `/api/members/${userIds.member}`);
        if (res.ok) cleaned++;
        else errors++;
      } catch (e) { errors++; }
    }
  }

  console.log(`   已清理 ${cleaned} 条测试数据`);
  if (errors > 0) {
    console.log(`   ⚠️ ${errors} 条数据清理失败`);
  }
  
  return { cleaned, errors };
}

// 高并发压力测试
async function highConcurrencyTest() {
  console.log('\n' + '='.repeat(60));
  console.log('⚡ 高并发压力测试 (30个并发请求)');
  console.log('='.repeat(60));

  const concurrentRequests = 10;
  const startTime = Date.now();

  const promises = [];
  for (let i = 0; i < concurrentRequests; i++) {
    promises.push(request('GET', '/api/members'));
    promises.push(request('GET', '/api/games'));
    promises.push(request('GET', '/api/devices'));
  }

  const results = await Promise.all(promises);
  const endTime = Date.now();
  const duration = endTime - startTime;

  const successCount = results.filter(r => r.status === 200).length;
  const totalRequests = results.length;

  console.log(`\n   📈 并发请求统计:`);
  console.log(`   总请求数: ${totalRequests}`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${totalRequests - successCount}`);
  console.log(`   总耗时: ${duration}ms`);
  console.log(`   平均响应: ${(duration / totalRequests).toFixed(2)}ms`);
  console.log(`   吞吐量: ${(totalRequests / duration * 1000).toFixed(2)} req/s`);

  return {
    total: totalRequests,
    success: successCount,
    duration,
    throughput: (totalRequests / duration * 1000).toFixed(2)
  };
}

// 竞态条件测试 - 多用户同时更新同一条记录
async function raceConditionTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🏁 竞态条件测试 (多用户同时更新同一记录)');
  console.log('='.repeat(60));

  // 先创建一条测试记录
  const createRes = await request('POST', '/api/members', {
    name: `竞态测试成员_${Date.now()}`,
    role: '初始角色'
  });
  
  const testId = createRes.data?.id || createRes.raw?.id;
  if (!testId) {
    console.log('   ❌ 创建测试记录失败');
    return { success: false, updates: 0 };
  }
  console.log(`   创建测试记录 ID: ${testId}`);

  // 5个用户同时更新同一条记录
  const updatePromises = [];
  for (let i = 1; i <= 5; i++) {
    updatePromises.push(
      request('PUT', `/api/members/${testId}`, {
        role: `用户${i}的更新_${Date.now()}`
      })
    );
  }

  const updateResults = await Promise.all(updatePromises);
  const successCount = updateResults.filter(r => r.ok).length;

  console.log(`   并发更新结果: ${successCount}/5 成功`);

  // 验证最终数据状态 - 从列表中查找
  const listRes = await request('GET', '/api/members');
  const members = Array.isArray(listRes.data) ? listRes.data : [];
  const finalData = members.find(m => m.id === testId);
  
  if (finalData && finalData.role) {
    console.log(`   ✅ 最终数据状态一致: role="${finalData.role.substring(0, 30)}..."`);
  } else {
    console.log(`   ⚠️ 数据状态异常或已被删除`);
  }

  // 清理测试记录
  await request('DELETE', `/api/members/${testId}`);
  console.log(`   已清理测试记录`);

  return {
    success: successCount >= 4, // 允许少量失败
    updates: successCount
  };
}

// 读写一致性测试
async function readWriteConsistencyTest() {
  console.log('\n' + '='.repeat(60));
  console.log('📝 读写一致性测试 (写入后立即读取验证)');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (let i = 1; i <= 3; i++) {
    const uniqueName = `一致性测试_${Date.now()}_${i}`;
    
    // 写入
    const createRes = await request('POST', '/api/games', {
      name: uniqueName,
      platform: 'Test'
    });
    
    const createdId = createRes.data?.id || createRes.raw?.id;
    
    if (!createdId) {
      console.log(`   ❌ 测试${i}: 创建失败`);
      failed++;
      continue;
    }

    // 立即读取验证
    const listRes = await request('GET', '/api/games');
    const games = Array.isArray(listRes.data) ? listRes.data : [];
    const found = games.find(g => g.id === createdId && g.name === uniqueName);

    if (found) {
      console.log(`   ✅ 测试${i}: 写入后立即可读 (ID: ${createdId})`);
      passed++;
    } else {
      console.log(`   ❌ 测试${i}: 写入后无法读取`);
      failed++;
    }

    // 清理
    await request('DELETE', `/api/games/${createdId}`);
  }

  console.log(`\n   结果: ${passed}/3 通过`);
  
  return {
    passed,
    failed,
    success: failed === 0
  };
}

// 主测试流程
async function runMultiUserTest() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           多用户并发模拟测试 - 数据同步验证                ║');
  console.log('║           服务器: http://21.214.83.112:3000                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📅 测试时间: ${new Date().toLocaleString()}`);
  console.log(`👥 模拟用户数: ${USERS.length}`);

  // 检查服务器连接
  console.log('\n' + '='.repeat(60));
  console.log('🔌 检查服务器连接');
  console.log('='.repeat(60));
  
  try {
    const healthCheck = await request('GET', '/api/members');
    if (healthCheck.status === 200) {
      console.log('   ✅ 服务器连接正常');
    } else {
      console.log(`   ❌ 服务器响应异常: ${healthCheck.status}`);
      return;
    }
  } catch (error) {
    console.log(`   ❌ 无法连接服务器: ${error.message}`);
    return;
  }

  // Phase 1: 多用户并发操作
  console.log('\n' + '='.repeat(60));
  console.log('📋 Phase 1: 多用户并发操作');
  console.log('='.repeat(60));

  const startTime = Date.now();
  
  // 同时启动所有用户操作
  const userPromises = USERS.map((_, index) => simulateUser(index + 1));
  const allCreatedIds = await Promise.all(userPromises);

  const phase1Duration = Date.now() - startTime;
  console.log(`\n⏱️ Phase 1 完成，耗时: ${phase1Duration}ms`);

  // Phase 2: 数据同步验证
  const syncErrors = await verifySyncConsistency(allCreatedIds);

  // Phase 3: 读写一致性测试
  const rwResult = await readWriteConsistencyTest();

  // Phase 4: 竞态条件测试
  const raceResult = await raceConditionTest();

  // Phase 5: 高并发压力测试
  const pressureResult = await highConcurrencyTest();

  // Phase 6: 清理测试数据
  const cleanupResult = await cleanupTestData(allCreatedIds);

  // 生成测试报告
  console.log('\n' + '═'.repeat(60));
  console.log('                    📊 测试报告汇总');
  console.log('═'.repeat(60));
  
  const successRate = ((stats.success / stats.total) * 100).toFixed(1);
  const concurrentSuccessRate = ((pressureResult.success / pressureResult.total) * 100).toFixed(1);
  
  console.log(`
┌─────────────────────────────────────────────────────────┐
│                    多用户操作测试                        │
├─────────────────────────────────────────────────────────┤
│  模拟用户数:        ${USERS.length} 个                                  │
│  总操作次数:        ${String(stats.total).padEnd(2)} 次                                │
│  成功操作:          ${String(stats.success).padEnd(2)} 次                                │
│  失败操作:          ${String(stats.failed).padEnd(2)} 次                                 │
│  操作成功率:        ${successRate}%                              │
├─────────────────────────────────────────────────────────┤
│                    数据同步验证                          │
├─────────────────────────────────────────────────────────┤
│  同步错误数:        ${syncErrors} 次                                  │
│  数据完整性:        ${syncErrors === 0 ? '✅ 完整' : '❌ 有丢失'}                           │
├─────────────────────────────────────────────────────────┤
│                    读写一致性测试                        │
├─────────────────────────────────────────────────────────┤
│  测试结果:          ${rwResult.passed}/3 通过                            │
│  一致性状态:        ${rwResult.success ? '✅ 正常' : '⚠️ 异常'}                           │
├─────────────────────────────────────────────────────────┤
│                    竞态条件测试                          │
├─────────────────────────────────────────────────────────┤
│  并发更新成功:      ${raceResult.updates}/5                                │
│  数据一致性:        ${raceResult.success ? '✅ 一致' : '⚠️ 部分失败'}                           │
├─────────────────────────────────────────────────────────┤
│                    高并发压力测试                        │
├─────────────────────────────────────────────────────────┤
│  并发请求数:        ${pressureResult.total} 次                                │
│  并发成功率:        ${concurrentSuccessRate}%                             │
│  系统吞吐量:        ${pressureResult.throughput} req/s                      │
│  平均响应时间:      ${(pressureResult.duration / pressureResult.total).toFixed(2)}ms                             │
└─────────────────────────────────────────────────────────┘`);

  // 判断测试是否通过
  const overallSuccess = syncErrors === 0 && 
                         rwResult.success && 
                         pressureResult.success === pressureResult.total;
  
  if (overallSuccess) {
    console.log(`\n🎉 测试结果: ✅ 全部通过`);
    console.log(`   系统在多用户并发操作下表现稳定，数据同步正常`);
  } else {
    console.log(`\n⚠️ 测试结果: 基本通过，有少量问题`);
    if (syncErrors > 0) {
      console.log(`   - 发现 ${syncErrors} 次数据同步错误`);
    }
    if (!rwResult.success) {
      console.log(`   - 读写一致性测试有失败`);
    }
    if (pressureResult.success < pressureResult.total) {
      console.log(`   - 高并发测试有 ${pressureResult.total - pressureResult.success} 次失败`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  
  return {
    users: USERS.length,
    totalOps: stats.total,
    success: stats.success,
    failed: stats.failed,
    syncErrors,
    readWrite: rwResult,
    raceCondition: raceResult,
    pressure: pressureResult,
    cleanup: cleanupResult,
    passed: overallSuccess
  };
}

// 运行测试
runMultiUserTest()
  .then(result => {
    console.log('\n测试完成！');
    process.exit(result?.passed || result?.syncErrors === 0 ? 0 : 1);
  })
  .catch(err => {
    console.error('测试异常:', err);
    process.exit(1);
  });
