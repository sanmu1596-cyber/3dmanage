const http = require('http');

function req(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  try {
    // 1. 登录
    console.log('=== 登录 ===');
    const login = await req({
      hostname: 'localhost', port: 3000, path: '/api/auth/login',
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ username: 'admin', password: 'admin123' }));
    const token = JSON.parse(login.body).token;
    console.log('登录成功, token:', token ? '已获取' : '失败');

    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

    // 2. 创建游戏问题
    console.log('\n=== POST /api/game-issues ===');
    const gi = await req({
      hostname: 'localhost', port: 3000, path: '/api/game-issues',
      method: 'POST', headers
    }, JSON.stringify({ game_name: '原神', issue_type: 'Bug', priority: 'P0-紧急', issue_desc: '游戏启动崩溃', owner: '张三', status: '待处理', remarks: '测试备注' }));
    console.log('状态:', gi.status, '响应:', gi.body);
    const giId = JSON.parse(gi.body).id;

    // 3. 读取游戏问题列表
    console.log('\n=== GET /api/game-issues ===');
    const giList = await req({ hostname: 'localhost', port: 3000, path: '/api/game-issues', method: 'GET', headers });
    console.log('状态:', giList.status, '条数:', JSON.parse(giList.body).length);

    // 4. 更新游戏问题
    console.log('\n=== PUT /api/game-issues/' + giId + ' ===');
    const giUpdate = await req({
      hostname: 'localhost', port: 3000, path: '/api/game-issues/' + giId,
      method: 'PUT', headers
    }, JSON.stringify({ game_name: '原神', issue_type: 'Bug', priority: 'P1-高', issue_desc: '游戏启动崩溃（已修复）', owner: '张三', status: '已解决', remarks: '已修复' }));
    console.log('状态:', giUpdate.status, '响应:', giUpdate.body);

    // 5. 创建设备
    console.log('\n=== POST /api/equipment ===');
    const eq = await req({
      hostname: 'localhost', port: 3000, path: '/api/equipment',
      method: 'POST', headers
    }, JSON.stringify({ name: '测试手机', equipment_no: 'EQ-001', keeper: '李四', date: '2026-04-27', remarks: '测试设备' }));
    console.log('状态:', eq.status, '响应:', eq.body);
    const eqId = JSON.parse(eq.body).id;

    // 6. 读取设备列表
    console.log('\n=== GET /api/equipment ===');
    const eqList = await req({ hostname: 'localhost', port: 3000, path: '/api/equipment', method: 'GET', headers });
    console.log('状态:', eqList.status, '条数:', JSON.parse(eqList.body).length);

    // 7. 更新设备
    console.log('\n=== PUT /api/equipment/' + eqId + ' ===');
    const eqUpdate = await req({
      hostname: 'localhost', port: 3000, path: '/api/equipment/' + eqId,
      method: 'PUT', headers
    }, JSON.stringify({ name: '测试手机Pro', equipment_no: 'EQ-001', keeper: '李四', date: '2026-04-27', remarks: '已更新' }));
    console.log('状态:', eqUpdate.status, '响应:', eqUpdate.body);

    // 8. 删除设备
    console.log('\n=== DELETE /api/equipment/' + eqId + ' ===');
    const eqDel = await req({ hostname: 'localhost', port: 3000, path: '/api/equipment/' + eqId, method: 'DELETE', headers });
    console.log('状态:', eqDel.status, '响应:', eqDel.body);

    // 9. 删除游戏问题
    console.log('\n=== DELETE /api/game-issues/' + giId + ' ===');
    const giDel = await req({ hostname: 'localhost', port: 3000, path: '/api/game-issues/' + giId, method: 'DELETE', headers });
    console.log('状态:', giDel.status, '响应:', giDel.body);

    console.log('\n✅ 全部测试完成');
  } catch (e) {
    console.error('❌ 测试失败:', e.message);
  }
}
main();
