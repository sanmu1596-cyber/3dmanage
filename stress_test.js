/**
 * 并发压力测试脚本
 * 模拟多人同时在线操作场景
 */
const http = require('http');

const BASE = 'http://localhost:3000';
const RESULTS = {};

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(`${BASE}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, time: Date.now() - start, size: data.length });
      });
    }).on('error', reject);
  });
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const jsonBody = JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(jsonBody) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, time: Date.now() - start, size: data.length });
      });
    });
    req.on('error', reject);
    req.write(jsonBody);
    req.end();
  });
}

async function runTest(name, fn, concurrency = 10) {
  console.log(`\n🔄 ${name} (${concurrency} 并发)...`);
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(fn(i));
  }
  const results = await Promise.allSettled(promises);
  
  const succeeded = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');
  const times = succeeded.map(r => r.value.time);
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const max = times.length ? Math.max(...times) : 0;
  const min = times.length ? Math.min(...times) : 0;
  const p95 = times.length ? times.sort((a,b) => a-b)[Math.floor(times.length * 0.95)] : 0;
  
  const result = {
    total: concurrency,
    ok: succeeded.length,
    fail: failed.length,
    avg: `${avg}ms`,
    min: `${min}ms`,
    max: `${max}ms`,
    p95: `${p95}ms`,
  };
  RESULTS[name] = result;
  
  console.log(`  ✅ ${succeeded.length}/${concurrency} 成功 | 平均 ${avg}ms | P95 ${p95}ms | 最大 ${max}ms`);
  if (failed.length > 0) {
    console.log(`  ❌ ${failed.length} 失败:`, failed[0].reason?.message || failed[0].reason);
  }
  return result;
}

async function main() {
  console.log('========================================');
  console.log('  裸眼3D项目管理系统 - 并发压力测试');
  console.log('========================================');
  
  // 预热
  await httpGet('/api/stats/dashboard');
  
  // === 测试1: 多人同时打开Dashboard ===
  await runTest('Dashboard统计(读)', () => httpGet('/api/stats/dashboard'), 20);
  
  // === 测试2: 多人同时查看游戏列表 ===
  await runTest('游戏列表(读)', () => httpGet('/api/games'), 20);
  
  // === 测试3: 多人同时查看适配记录 ===
  await runTest('适配记录-全量(读)', () => httpGet('/api/adaptations'), 20);
  
  // === 测试4: 多人同时查看成员列表 ===
  await runTest('成员列表(读)', () => httpGet('/api/members'), 20);
  
  // === 测试5: 多人同时查看设备列表 ===
  await runTest('设备列表(读)', () => httpGet('/api/devices'), 20);
  
  // === 测试6: 全局搜索并发 ===
  await runTest('全局搜索(读)', (i) => httpGet(`/api/stats/search?q=test${i}`), 15);
  
  // === 测试7: 适配矩阵 ===
  await runTest('适配矩阵(读)', () => httpGet('/api/stats/matrix'), 15);
  
  // === 测试8: 字段选项 ===
  await runTest('字段选项(读)', () => httpGet('/api/field-options'), 20);
  
  // === 测试9: 并发写入（创建+删除测试记录）===
  await runTest('创建游戏(写)', (i) => httpPost('/api/games', {
    name: `压力测试游戏_${i}_${Date.now()}`,
    platform: 'PC',
    game_type: 'FPS',
    adaptation_status: 'pending'
  }), 10);
  
  // === 测试10: 读写混合 ===
  await runTest('读写混合', (i) => {
    if (i % 3 === 0) return httpPost('/api/games', { name: `混合测试_${i}_${Date.now()}`, platform: 'Android' });
    if (i % 3 === 1) return httpGet('/api/games');
    return httpGet('/api/stats/dashboard');
  }, 15);

  // === 测试11: 模拟首屏加载（Dashboard场景，3个并发请求）===
  await runTest('首屏加载模拟', async () => {
    const [r1, r2, r3] = await Promise.all([
      httpGet('/api/field-options'),
      httpGet('/api/members'),
      httpGet('/api/stats/dashboard')
    ]);
    return { status: 200, time: Math.max(r1.time, r2.time, r3.time), size: r1.size + r2.size + r3.size };
  }, 10);
  
  // === 测试12: 模拟适配进展页（优化后：3个请求代替N+2个）===
  await runTest('适配进展页模拟', async () => {
    const [r1, r2, r3] = await Promise.all([
      httpGet('/api/devices'),
      httpGet('/api/games'),
      httpGet('/api/adaptations')
    ]);
    return { status: 200, time: Math.max(r1.time, r2.time, r3.time), size: r1.size + r2.size + r3.size };
  }, 10);

  // 清理压力测试创建的游戏
  console.log('\n🧹 清理测试数据...');
  const gamesResp = await httpGet('/api/games');
  try {
    const gamesBody = await new Promise((resolve) => {
      http.get(`${BASE}/api/games`, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      });
    });
    const games = JSON.parse(gamesBody);
    const testGames = (games.data || []).filter(g => g.name && (g.name.startsWith('压力测试游戏_') || g.name.startsWith('混合测试_')));
    if (testGames.length > 0) {
      const ids = testGames.map(g => g.id);
      await httpPost('/api/batch/delete', { resource: 'games', ids });
      console.log(`  ♻ 清理了 ${ids.length} 条测试游戏`);
    }
  } catch (e) {
    console.log('  ⚠ 清理失败（手动删除即可）');
  }
  
  // 汇总报告
  console.log('\n========================================');
  console.log('  📊 测试结果汇总');
  console.log('========================================');
  console.log('');
  console.log('测试项目'.padEnd(24) + '并发  成功  平均    P95     最大');
  console.log('-'.repeat(68));
  Object.entries(RESULTS).forEach(([name, r]) => {
    console.log(
      name.padEnd(24) +
      String(r.total).padEnd(6) +
      String(r.ok).padEnd(6) +
      r.avg.padEnd(8) +
      r.p95.padEnd(8) +
      r.max
    );
  });
  
  // 判定
  const allOk = Object.values(RESULTS).every(r => r.fail === 0);
  const avgTimes = Object.values(RESULTS).map(r => parseInt(r.avg));
  const maxAvg = Math.max(...avgTimes);
  
  console.log('\n' + (allOk ? '✅ 所有测试通过，零失败' : '⚠️ 存在失败请求'));
  console.log(`📈 最高平均响应时间: ${maxAvg}ms ${maxAvg < 200 ? '(优秀)' : maxAvg < 500 ? '(良好)' : maxAvg < 1000 ? '(一般)' : '(需优化)'}`);
}

main().catch(console.error);
