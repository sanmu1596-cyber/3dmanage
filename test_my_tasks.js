/**
 * 端到端测试：配置计划 + 我的任务 流程
 */
const http = require('http');

const BASE = 'http://localhost:3000';

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    let passed = 0, failed = 0;
    function check(name, cond) {
        if (cond) { console.log(`  ✅ ${name}`); passed++; }
        else { console.log(`  ❌ ${name}`); failed++; }
    }

    console.log('\n========== 1. 配置计划 API ==========');
    
    // 获取所有计划
    const plans = await request('GET', '/api/plans');
    check('GET /api/plans success', plans.success === true);
    check('plans有数据', plans.data && plans.data.length > 0);
    check('plans有game_count字段', plans.data[0].game_count !== undefined);
    check('plans有plan_no字段', plans.data[0].plan_no && plans.data[0].plan_no.startsWith('PLAN-'));
    check('plans有avg_progress字段', plans.data[0].avg_progress !== undefined);

    // 获取计划详情
    const planId = plans.data[0].id;
    const detail = await request('GET', `/api/plans/${planId}`);
    check('GET /api/plans/:id success', detail.success === true);
    check('详情包含games数组', Array.isArray(detail.data.games));
    check('详情包含devices_json', Array.isArray(detail.data.devices_json));

    console.log('\n========== 2. 我的任务 API ==========');
    
    const myTasks = await request('GET', '/api/my-tasks');
    check('GET /api/my-tasks success', myTasks.success === true);
    check('my-tasks有数据', myTasks.data && myTasks.data.length > 0);
    
    if (myTasks.data.length > 0) {
        const t = myTasks.data[0];
        check('task有plan_id', t.plan_id !== undefined);
        check('task有plan_title', !!t.plan_title);
        check('task有plan_no', !!t.plan_no);
        check('task有plan_date', !!t.plan_date);
        check('task有plan_goal', t.plan_goal !== undefined);
        check('task有devices_json', Array.isArray(t.devices_json));
        check('task有game_name', !!t.game_name);
        check('task有adapt_status', !!t.adapt_status);
        check('task有adapt_progress(number)', typeof t.adapt_progress === 'number');

        // 按plan_id分组
        const planMap = {};
        myTasks.data.forEach(t => {
            if (!planMap[t.plan_id]) planMap[t.plan_id] = [];
            planMap[t.plan_id].push(t);
        });
        const planCount = Object.keys(planMap).length;
        check(`任务可按plan_id分成${planCount}个计划`, planCount >= 1);
        
        // 输出每个计划的统计
        for (const [pid, tasks] of Object.entries(planMap)) {
            const title = tasks[0].plan_title;
            const notStarted = tasks.filter(t => t.adapt_status === 'not_started').length;
            const adapting = tasks.filter(t => t.adapt_status === 'adapting').length;
            const finished = tasks.filter(t => t.adapt_status === 'finished').length;
            console.log(`    📋 ${title} (plan_id=${pid}): ${tasks.length}条 | 未开始:${notStarted} 适配中:${adapting} 已结束:${finished}`);
        }
    }

    console.log('\n========== 3. 单条提交测试 ==========');
    if (myTasks.data.length > 0) {
        const taskToUpdate = myTasks.data[0];
        const submitResult = await request('PUT', `/api/my-tasks/${taskToUpdate.id}`, {
            adapt_status: taskToUpdate.adapt_status,
            adapt_progress: taskToUpdate.adapt_progress,
            remark: taskToUpdate.remark || 'test'
        });
        check('PUT /api/my-tasks/:id success', submitResult.success === true);
    }

    console.log('\n========== 4. 创建+删除计划测试 ==========');
    const newPlan = await request('POST', '/api/plans', {
        title: '测试计划-自动化',
        plan_date: '2026-04-01',
        devices_json: [{id: 1, name: 'test-device'}],
        goal: '自动化测试',
        status: 'draft',
        games: [{game_name: '测试游戏', game_platform: 'PC'}]
    });
    check('POST /api/plans success', newPlan.success === true);
    check('返回plan_no', !!newPlan.plan_no);
    console.log(`    新计划: id=${newPlan.id}, plan_no=${newPlan.plan_no}`);

    if (newPlan.id) {
        // 发布
        const pubResult = await request('POST', `/api/plans/${newPlan.id}/publish`);
        check('POST /api/plans/:id/publish success', pubResult.success === true);

        // 验证在my-tasks中可见
        const tasksAfterPublish = await request('GET', '/api/my-tasks');
        const newPlanTasks = tasksAfterPublish.data.filter(t => t.plan_id === newPlan.id);
        check('发布后在my-tasks中可见', newPlanTasks.length === 1);

        // 删除
        const delResult = await request('DELETE', `/api/plans/${newPlan.id}`);
        check('DELETE /api/plans/:id success', delResult.success === true);

        // 验证从my-tasks消失
        const tasksAfterDelete = await request('GET', '/api/my-tasks');
        const deletedTasks = tasksAfterDelete.data.filter(t => t.plan_id === newPlan.id);
        check('删除后从my-tasks消失', deletedTasks.length === 0);
    }

    console.log(`\n========== 结果: ${passed} passed, ${failed} failed ==========\n`);
    process.exit(failed > 0 ? 1 : 0);
}

test().catch(e => { console.error('测试异常:', e); process.exit(1); });
