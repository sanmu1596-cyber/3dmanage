/**
 * plans.js — 计划管理全流程模块
 * 职责：创建/编辑计划、计划详情、机型/游戏选择弹窗、字段配置、动态选项、列宽拖拽
 * 依赖：core.js, auth.js, router.js, entities.js（authFetch, showToast, switchTab等）
 */
var App = window.App;

// ==================== 适配进展功能 ====================

// 加载适配进展数据
async function loadProgressData() {
    try {
        // 如果设备数据被行内编辑修改过，强制刷新
        if (window._progressDataStale) {
            window._progressDataStale = false;
            // allDevicesData 已在行内编辑时同步更新，这里直接用
        }
        // 复用已加载的数据，仅在为空时才请求（避免重复请求）
        if (!allDevicesData || allDevicesData.length === 0) {
            const devicesResponse = await authFetch(`${API_BASE}/devices`);
            const devicesResult = await devicesResponse.json();
            allDevicesData = devicesResult.data || [];
        }

        if (!allGamesForProgress || allGamesForProgress.length === 0) {
            const gamesResponse = await authFetch(`${API_BASE}/games`);
            const gamesResult = await gamesResponse.json();
            allGamesForProgress = gamesResult.data || [];
        }

        // P0: 从后端加载适配记录（不再随机生成）
        await loadAdaptationRecords();

        // 生成设备tab
        renderDeviceTabs();

        console.log('适配进展数据加载完成');
    } catch (error) {
        console.error('加载适配进展数据失败:', error);
    }
}

// P0: 从后端API加载适配记录（优化：1个请求替代N个串行请求）
async function loadAdaptationRecords() {
    progressData = [];

    try {
        // 一次性获取所有适配记录（替代原来按设备逐个请求的N+1模式）
        const resp = await authFetch(`${API_BASE}/adaptations`);
        const result = await resp.json();
        const allRecords = result.data || [];

        // 按 device_id 分组
        const recordsByDevice = {};
        allRecords.forEach(r => {
            if (!recordsByDevice[r.device_id]) recordsByDevice[r.device_id] = [];
            recordsByDevice[r.device_id].push(r);
        });

        // 为每个设备构建 progressData
        for (const device of allDevicesData) {
            const records = recordsByDevice[device.id] || [];
            const deviceGames = records.map(r => ({
                id: r.id,
                deviceId: r.device_id,
                deviceName: device.name || r.device_name,
                gameId: r.game_id,
                gameName: r.game_name || '未知',
                gamePlatform: r.game_platform || '-',
                gameType: r.game_type || '-',
                adapterProgress: r.adapter_progress || 0,
                ownerName: r.owner_name || '-',
                onlineStatus: r.online_status || 'pending',
                quality: r.quality || 'normal',
                updatedAt: r.updated_at || null
            }));

            progressData.push({
                deviceId: device.id,
                deviceName: device.name,
                games: deviceGames
            });
        }
    } catch (e) {
        console.error('加载适配记录失败:', e);
        // fallback: 为每个设备创建空记录
        allDevicesData.forEach(device => {
            progressData.push({ deviceId: device.id, deviceName: device.name, games: [] });
        });
    }
}

// generateProgressData 保留为空操作（兼容旧代码调用）
function generateProgressData() {
    // P0: 不再随机生成,数据从后端加载
    console.log('generateProgressData 已废弃,数据从后端加载');
}

// 渲染设备tab
function renderDeviceTabs() {
    const tabContainer = document.getElementById('device-tab-container');
    tabContainer.innerHTML = '';

    progressData.forEach((deviceData, index) => {
        const tab = document.createElement('button');
        tab.className = 'device-tab' + (index === 0 ? ' active' : '');
        tab.textContent = deviceData.deviceName;
        tab.onclick = () => selectDevice(index);
        tabContainer.appendChild(tab);
    });

    // 默认选中第一个设备
    if (progressData.length > 0) {
        selectDevice(0);
    }
}

// 选择设备
function selectDevice(deviceIndex) {
    // 更新tab激活状态
    const tabs = document.querySelectorAll('.device-tab');
    tabs.forEach((tab, index) => {
        if (index === deviceIndex) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    currentDeviceId = deviceIndex;

    // 渲染该设备的游戏适配进展
    renderProgressTable(deviceIndex);
}

// 渲染适配进展表格
function renderProgressTable(deviceIndex) {
    const tbody = document.getElementById('progress-table');

    if (!progressData[deviceIndex] || progressData[deviceIndex].games.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <div class="empty-icon">📊</div>
                    <div class="empty-text">该设备暂无适配记录</div>
                    <div class="empty-sub">请先在「配置计划」中添加游戏，或点击下方按钮手动添加</div>
                    <div class="empty-action">
                        <button class="btn btn-primary" onclick="showAddGameModal(${deviceIndex})">➕ 添加游戏适配</button>
                    </div>
                </td>
            </tr>
        `;
        updateProgressModuleStats(deviceIndex);
        return;
    }

    const games = progressData[deviceIndex].games;

    // 状态映射（动态从字段设置读取）
    const onlineStatusMap = {};
    getFieldOptionsByKey('online_status').forEach(o => onlineStatusMap[o.value] = o.label);
    // fallback
    if (!onlineStatusMap['pending']) Object.assign(onlineStatusMap, {'pending':'待上线','in_progress':'适配中','paused':'暂停适配','online':'已上线'});

    const qualityMap = {};
    getFieldOptionsByKey('quality').forEach(o => qualityMap[o.value] = o.label);
    if (!qualityMap['normal']) Object.assign(qualityMap, {'normal':'一般','recommended':'推荐'});

    tbody.innerHTML = games.map((gameData, index) => `
        <tr>
            <td class="text-center"><strong>${index + 1}</strong></td>
            <td>${escapeHtml(gameData.gameName)}</td>
            <td>${escapeHtml(gameData.gamePlatform || '-')}</td>
            <td>${escapeHtml(gameData.gameType || '-')}</td>
            <td>
                <div class="progress-bar-container">
                    <div class="progress-bar-track"><div class="progress-bar" style="width: ${gameData.adapterProgress}%"></div></div>
                    <span class="progress-text">${gameData.adapterProgress}%</span>
                </div>
            </td>
            <td class="editable-cell" data-field="ownerName" data-row-index="${index}" data-device-index="${deviceIndex}">
                <span class="cell-value">${escapeHtml(gameData.ownerName || '-')}</span>
            </td>
            <td class="editable-cell text-center" data-field="onlineStatus" data-row-index="${index}" data-device-index="${deviceIndex}">
                <span class="cell-value"><span class="status-badge status-${gameData.onlineStatus}">${escapeHtml(onlineStatusMap[gameData.onlineStatus] || '-')}</span></span>
            </td>
            <td class="editable-cell text-center" data-field="quality" data-row-index="${index}" data-device-index="${deviceIndex}">
                <span class="cell-value">${escapeHtml(qualityMap[gameData.quality] || '-')}</span>
            </td>
            <td class="text-center">${gameData.updatedAt ? formatDate(gameData.updatedAt) : '-'}</td>
            <td class="text-center">
                <button class="btn btn-small btn-delete" onclick="deleteProgressItem(${deviceIndex}, ${gameData.id})">删除</button>
            </td>
        </tr>
    `).join('');

    // 为所有可编辑单元格添加点击事件
    const editableCells = tbody.querySelectorAll('.editable-cell');
    editableCells.forEach(cell => {
        cell.addEventListener('click', () => {
            const field = cell.dataset.field;
            const rowIndex = parseInt(cell.dataset.rowIndex);
            const deviceIndex = parseInt(cell.dataset.deviceIndex);
            showEditDropdown(cell, field, rowIndex, deviceIndex);
        });
    });

    // 更新适配进展统计
    updateProgressModuleStats(deviceIndex);
}

// 显示编辑下拉框
function showEditDropdown(cell, field, rowIndex, deviceIndex) {
    // 如果已经在编辑状态,不重复创建
    if (cell.classList.contains('editing')) {
        return;
    }

    const gameData = progressData[deviceIndex].games[rowIndex];
    cell.classList.add('editing');

    // 锁定单元格宽高，防止编辑态撑开引起抖动
    const rect = cell.getBoundingClientRect();
    cell.style.width = rect.width + 'px';
    cell.style.minWidth = rect.width + 'px';
    cell.style.maxWidth = rect.width + 'px';
    cell.style.height = rect.height + 'px';
    cell.style.boxSizing = 'border-box';

    // 创建下拉选择框
    const select = document.createElement('select');
    select.className = 'edit-select';

    // 根据字段类型填充选项
    if (field === 'ownerName') {
        // 负责人: 从成员列表获取
        allMembersData.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name;
            option.textContent = member.name;
            if (member.name === gameData.ownerName) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } else if (field === 'onlineStatus') {
        // 上线状态（从字段设置动态获取）
        let statuses = getFieldOptionsByKey('online_status').map(o => ({ value: o.value, text: o.label }));
        if (statuses.length === 0) statuses = [{value:'pending',text:'待上线'},{value:'in_progress',text:'适配中'},{value:'paused',text:'暂停适配'},{value:'online',text:'已上线'}];
        statuses.forEach(status => {
            const option = document.createElement('option');
            option.value = status.value;
            option.textContent = status.text;
            if (status.value === gameData.onlineStatus) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } else if (field === 'quality') {
        // 品质（从字段设置动态获取）
        let qualities = getFieldOptionsByKey('quality').map(o => ({ value: o.value, text: o.label }));
        if (qualities.length === 0) qualities = [{value:'normal',text:'一般'},{value:'recommended',text:'推荐'}];
        qualities.forEach(quality => {
            const option = document.createElement('option');
            option.value = quality.value;
            option.textContent = quality.text;
            if (quality.value === gameData.quality) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    // 隐藏原始值
    const cellValue = cell.querySelector('.cell-value');
    cellValue.style.display = 'none';

    // 添加下拉框
    cell.appendChild(select);
    select.focus();
    // 单击直接展开选项列表
    try { select.showPicker(); } catch(e) { select.click(); }

    // 保存更改的函数
    let _saved = false;
    const saveChanges = async () => {
        if (_saved) return;
        _saved = true;
        let newValue = select.value;
        let displayValue = newValue;

        // 根据字段类型处理值
        if (field === 'onlineStatus') {
            displayValue = `<span class="status-badge status-${sanitizeCssClass(newValue)}">${getFieldOptionLabel('online_status', newValue)}</span>`;
            gameData.onlineStatus = newValue;
        } else if (field === 'quality') {
            displayValue = getFieldOptionLabel('quality', newValue);
            gameData.quality = newValue;
        } else if (field === 'ownerName') {
            displayValue = newValue;
            gameData.ownerName = newValue;
        }

        // 更新单元格显示
        cellValue.innerHTML = displayValue;
        cellValue.style.display = '';

        // 移除下拉框和编辑状态
        select.remove();
        cell.classList.remove('editing');
        // 解除宽高锁定
        cell.style.width = '';
        cell.style.minWidth = '';
        cell.style.maxWidth = '';
        cell.style.height = '';

        // P0: 同步更新到后端
        try {
            await authFetch(`${API_BASE}/adaptations/${gameData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adapter_progress: gameData.adapterProgress,
                    owner_name: gameData.ownerName,
                    online_status: gameData.onlineStatus,
                    quality: gameData.quality
                })
            });
        } catch (e) {
            console.error('同步适配记录到后端失败:', e);
        }

        // 如果修改了上线状态，同步刷新设备列表的"适配游戏数"
        if (field === 'onlineStatus') {
            loadDevices();
        }

        console.log(`更新字段 ${field}: ${newValue}`, gameData);
    };

    // 事件监听
    select.addEventListener('change', saveChanges);
    select.addEventListener('blur', saveChanges);

    // 防止点击下拉框时触发单元格点击
    select.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// 删除适配进展项目
function deleteProgressItem(deviceIndex, itemId) {
    showConfirm('确定要删除该适配记录吗？', async () => {
        try {
            // P0: 先删后端
            await authFetch(`${API_BASE}/adaptations/${itemId}`, { method: 'DELETE' });
        } catch (e) {
            console.error('删除适配记录失败:', e);
        }
        // 从进度数据中删除
        const deviceData = progressData[deviceIndex];
        deviceData.games = deviceData.games.filter(g => g.id !== itemId);

        // 重新渲染表格
        renderProgressTable(deviceIndex);
        showToast('已删除适配记录', 'success');
    });
}


// ==============================
// 适配进展 - 添加游戏 / 批量添加游戏
// ==============================

// 弹窗状态
let gameSelectSourceList = [];   // 源列表（可选游戏）
let gameSelectTargetList = [];   // 目标列表（已选游戏）
let gameSelectMode = 'single';   // 'single' 或 'batch'

// 打开添加游戏弹窗（单个添加，同样用穿梭框，选一个即可）
function openAddGameToProgress() {
    if (currentDeviceId === null && progressData.length > 0) {
        currentDeviceId = 0;
    }
    if (currentDeviceId === null) {
        showToast('请先选择一个设备标签', 'warning');
        return;
    }
    gameSelectMode = 'single';
    document.getElementById('game-select-modal-title').textContent = '添加游戏到适配列表';
    openGameSelectModal();
}

// 打开批量添加游戏弹窗
function openBatchAddGameToProgress() {
    if (currentDeviceId === null && progressData.length > 0) {
        currentDeviceId = 0;
    }
    if (currentDeviceId === null) {
        showToast('请先选择一个设备标签', 'warning');
        return;
    }
    gameSelectMode = 'batch';
    document.getElementById('game-select-modal-title').textContent = '批量添加游戏到适配列表';
    openGameSelectModal();
}

// 打开游戏选择弹窗
function openGameSelectModal() {
    // 获取当前设备已有的游戏ID列表
    const existingGameIds = new Set();
    if (progressData[currentDeviceId]) {
        progressData[currentDeviceId].games.forEach(g => {
            existingGameIds.add(g.gameId);
        });
    }

    // 构建源列表：排除当前设备已有的游戏
    gameSelectSourceList = allGamesForProgress
        .filter(game => !existingGameIds.has(game.id))
        .map(game => ({
            id: game.id,
            name: game.name,
            platform: game.platform || '-',
            gameType: game.game_type || '-',
            checked: false
        }));

    gameSelectTargetList = [];

    // 渲染列表
    renderSourceGameList();
    renderTargetGameList();

    // 清空搜索
    document.getElementById('game-select-search').value = '';
    document.getElementById('target-select-search').value = '';
    document.getElementById('select-all-games').checked = false;
    document.getElementById('select-all-target').checked = false;

    // 显示弹窗
    document.getElementById('game-select-modal').style.display = 'block';
}

// 关闭弹窗
function closeGameSelectModal() {
    document.getElementById('game-select-modal').style.display = 'none';
}

// 渲染源列表
function renderSourceGameList(filterText) {
    const container = document.getElementById('source-game-list');
    let items = gameSelectSourceList;

    if (filterText) {
        const keyword = filterText.toLowerCase();
        items = items.filter(g => g.name.toLowerCase().includes(keyword));
    }

    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无可用游戏</div>';
    } else {
        container.innerHTML = items.map((game, idx) => {
            const realIndex = gameSelectSourceList.indexOf(game);
            return `
                <div class="game-select-item ${game.checked ? 'selected' : ''}" onclick="toggleSourceGameCheck(${realIndex})" ondblclick="event.stopPropagation(); dblTransferSourceGame(${realIndex})">
                    <input type="checkbox" ${game.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleSourceGameCheck(${realIndex})">
                    <div class="game-select-item-info">
                        <span class="game-select-item-name">${escapeHtml(game.name)}</span>
                        <span class="game-select-item-meta">${escapeHtml(game.platform)} · ${escapeHtml(game.gameType)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateSourceCount();
}

// 双击左框游戏 → 移到右框（适配进展用）
function dblTransferSourceGame(i) {
    const item = gameSelectSourceList[i];
    if (!item) return;
    item.checked = false;
    gameSelectTargetList.push(item);
    gameSelectSourceList.splice(i, 1);
    document.getElementById('select-all-games').checked = false;
    renderSourceGameList(document.getElementById('game-select-search').value);
    renderTargetGameList(document.getElementById('target-select-search').value);
}

// 渲染目标列表
function renderTargetGameList(filterText) {
    const container = document.getElementById('target-game-list');
    let items = gameSelectTargetList;

    if (filterText) {
        const keyword = filterText.toLowerCase();
        items = items.filter(g => g.name.toLowerCase().includes(keyword));
    }

    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无数据</div>';
    } else {
        container.innerHTML = items.map((game, idx) => {
            const realIndex = gameSelectTargetList.indexOf(game);
            return `
                <div class="game-select-item ${game.checked ? 'selected' : ''}" onclick="toggleTargetGameCheck(${realIndex})" ondblclick="event.stopPropagation(); dblTransferTargetGame(${realIndex})">
                    <input type="checkbox" ${game.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleTargetGameCheck(${realIndex})">
                    <div class="game-select-item-info">
                        <span class="game-select-item-name">${escapeHtml(game.name)}</span>
                        <span class="game-select-item-meta">${escapeHtml(game.platform)} · ${escapeHtml(game.gameType)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateTargetCount();
}

// 双击右框游戏 → 移回左框（适配进展用）
function dblTransferTargetGame(i) {
    const item = gameSelectTargetList[i];
    if (!item) return;
    item.checked = false;
    gameSelectSourceList.push(item);
    gameSelectTargetList.splice(i, 1);
    document.getElementById('select-all-target').checked = false;
    renderSourceGameList(document.getElementById('game-select-search').value);
    renderTargetGameList(document.getElementById('target-select-search').value);
}

// 切换源列表游戏选中状态
function toggleSourceGameCheck(index) {
    gameSelectSourceList[index].checked = !gameSelectSourceList[index].checked;
    const filterText = document.getElementById('game-select-search').value;
    renderSourceGameList(filterText);
    updateSelectAllState();
}

// 切换目标列表游戏选中状态
function toggleTargetGameCheck(index) {
    gameSelectTargetList[index].checked = !gameSelectTargetList[index].checked;
    const filterText = document.getElementById('target-select-search').value;
    renderTargetGameList(filterText);
    updateTargetSelectAllState();
}

// 源列表全选/取消全选
function toggleSelectAllGames() {
    const checked = document.getElementById('select-all-games').checked;
    const filterText = document.getElementById('game-select-search').value;

    if (filterText) {
        // 如果有搜索，只全选/取消当前可见的
        const keyword = filterText.toLowerCase();
        gameSelectSourceList.forEach(g => {
            if (g.name.toLowerCase().includes(keyword)) {
                g.checked = checked;
            }
        });
    } else {
        gameSelectSourceList.forEach(g => g.checked = checked);
    }

    renderSourceGameList(filterText);
}

// 目标列表全选/取消全选
function toggleSelectAllTarget() {
    const checked = document.getElementById('select-all-target').checked;
    const filterText = document.getElementById('target-select-search').value;

    if (filterText) {
        const keyword = filterText.toLowerCase();
        gameSelectTargetList.forEach(g => {
            if (g.name.toLowerCase().includes(keyword)) {
                g.checked = checked;
            }
        });
    } else {
        gameSelectTargetList.forEach(g => g.checked = checked);
    }

    renderTargetGameList(filterText);
}

// 将选中的游戏从源列表移到目标列表
function transferGamesToTarget() {
    const toTransfer = gameSelectSourceList.filter(g => g.checked);
    if (toTransfer.length === 0) return;

    // 移到目标列表，重置checked
    toTransfer.forEach(g => {
        g.checked = false;
        gameSelectTargetList.push(g);
    });

    // 从源列表移除
    gameSelectSourceList = gameSelectSourceList.filter(g => !toTransfer.includes(g));

    // 清空搜索和全选
    document.getElementById('select-all-games').checked = false;
    document.getElementById('select-all-target').checked = false;

    const sourceFilter = document.getElementById('game-select-search').value;
    const targetFilter = document.getElementById('target-select-search').value;
    renderSourceGameList(sourceFilter);
    renderTargetGameList(targetFilter);
}

// 将选中的游戏从目标列表移回源列表
function transferGamesFromTarget() {
    const toTransfer = gameSelectTargetList.filter(g => g.checked);
    if (toTransfer.length === 0) return;

    // 移回源列表，重置checked
    toTransfer.forEach(g => {
        g.checked = false;
        gameSelectSourceList.push(g);
    });

    // 从目标列表移除
    gameSelectTargetList = gameSelectTargetList.filter(g => !toTransfer.includes(g));

    // 清空全选
    document.getElementById('select-all-games').checked = false;
    document.getElementById('select-all-target').checked = false;

    const sourceFilter = document.getElementById('game-select-search').value;
    const targetFilter = document.getElementById('target-select-search').value;
    renderSourceGameList(sourceFilter);
    renderTargetGameList(targetFilter);
}

// 搜索过滤源列表
function filterGameSelectList() {
    const filterText = document.getElementById('game-select-search').value;
    renderSourceGameList(filterText);
    updateSelectAllState();
}

// 搜索过滤目标列表
function filterTargetSelectList() {
    const filterText = document.getElementById('target-select-search').value;
    renderTargetGameList(filterText);
    updateTargetSelectAllState();
}

// 更新源列表计数
function updateSourceCount() {
    const checkedCount = gameSelectSourceList.filter(g => g.checked).length;
    const totalCount = gameSelectSourceList.length;
    document.getElementById('source-game-count').textContent = `${checkedCount}/${totalCount}`;
}

// 更新目标列表计数
function updateTargetCount() {
    const checkedCount = gameSelectTargetList.filter(g => g.checked).length;
    const totalCount = gameSelectTargetList.length;
    document.getElementById('target-game-count').textContent = `${checkedCount}/${totalCount}`;
}

// 更新源列表全选状态
function updateSelectAllState() {
    const filterText = document.getElementById('game-select-search').value;
    let visibleItems = gameSelectSourceList;
    if (filterText) {
        const keyword = filterText.toLowerCase();
        visibleItems = visibleItems.filter(g => g.name.toLowerCase().includes(keyword));
    }
    const allChecked = visibleItems.length > 0 && visibleItems.every(g => g.checked);
    document.getElementById('select-all-games').checked = allChecked;
}

// 更新目标列表全选状态
function updateTargetSelectAllState() {
    const filterText = document.getElementById('target-select-search').value;
    let visibleItems = gameSelectTargetList;
    if (filterText) {
        const keyword = filterText.toLowerCase();
        visibleItems = visibleItems.filter(g => g.name.toLowerCase().includes(keyword));
    }
    const allChecked = visibleItems.length > 0 && visibleItems.every(g => g.checked);
    document.getElementById('select-all-target').checked = allChecked;
}

// 确认添加游戏到适配进展
async function confirmAddGamesToProgress() {
    if (gameSelectTargetList.length === 0) {
        showToast('请先将游戏添加到目标列表', 'warning');
        return;
    }

    const deviceIndex = currentDeviceId;
    if (!progressData[deviceIndex]) return;

    const deviceId = progressData[deviceIndex].deviceId;

    // P0: 批量写入后端
    const records = gameSelectTargetList.map(game => ({
        device_id: deviceId,
        game_id: game.id,
        adapter_progress: 0,
        owner_name: '-',
        online_status: 'pending',
        quality: 'normal'
    }));

    try {
        const resp = await authFetch(`${API_BASE}/adaptations/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records })
        });
        const result = await resp.json();

        if (result.success) {
            // 重新从后端加载该设备的适配记录
            const reloadResp = await authFetch(`${API_BASE}/adaptations/device/${deviceId}`);
            const reloadResult = await reloadResp.json();
            const reloadedRecords = reloadResult.data || [];

            progressData[deviceIndex].games = reloadedRecords.map(r => ({
                id: r.id,
                deviceId: r.device_id,
                deviceName: progressData[deviceIndex].deviceName,
                gameId: r.game_id,
                gameName: r.game_name || '未知',
                gamePlatform: r.game_platform || '-',
                gameType: r.game_type || '-',
                adapterProgress: r.adapter_progress || 0,
                ownerName: r.owner_name || '-',
                onlineStatus: r.online_status || 'pending',
                quality: r.quality || 'normal'
            }));

            showToast(`已添加 ${gameSelectTargetList.length} 个游戏`, 'success');
        }
    } catch (e) {
        console.error('批量添加适配记录失败:', e);
        showToast('添加失败，请重试', 'danger');
    }

    // 关闭弹窗
    closeGameSelectModal();

    // 重新渲染表格
    renderProgressTable(deviceIndex);
}


// ==============================
// 配置计划模块
// ==============================

// 配置计划数据
let configPlans = [];           // 所有计划
let currentPlanIndex = null;    // 当前选中的计划索引

// 配置计划分页状态
let planCurrentPage = 1;
let planPageSize = 20;

// 机型选择弹窗数据
let deviceSelectSourceList = [];
let deviceSelectTargetList = [];

// 游戏选择弹窗数据（配置计划用）
let planGameSelectSourceList = [];
let planGameSelectTargetList = [];

// 创建计划表单中已选的机型和游戏
let planSelectedDevices = [];
let planSelectedGames = [];

// 编辑计划模式：null=创建，数字=编辑的计划ID
let editingPlanId = null;

// ========== 视图切换 ==========

function showCreatePlanView() {
    editingPlanId = null; // 创建模式
    document.getElementById('plan-list-view').style.display = 'none';
    document.getElementById('plan-detail-view').style.display = 'none';
    document.getElementById('plan-create-view').style.display = 'block';

    // 更新标题
    const titleEl = document.querySelector('#plan-create-view .toolbar-title');
    if (titleEl) titleEl.textContent = '新增适配计划';

    // 更新按钮
    const actionsEl = document.querySelector('#plan-form .form-actions');
    if (actionsEl) {
        actionsEl.innerHTML = `
            <button type="button" class="tool-btn" onclick="showPlanListView()">取消</button>
            <button type="button" class="tool-btn" onclick="submitPlan(event, 'draft')">💾 保存草稿</button>
            <button type="button" class="tool-btn tool-btn-primary" onclick="submitPlan(event, 'published')">🚀 创建并发布</button>
        `;
    }

    // 重置表单
    document.getElementById('plan-form').reset();
    planSelectedDevices = [];
    planSelectedGames = [];
    renderPlanDeviceTags();
    renderPlanGameTags();

    // 设置默认日期为今天
    document.getElementById('plan-date').value = new Date().toISOString().split('T')[0];

    // 填充默认负责人下拉框
    fillAssigneeSelect();

    // 重置测试用例选择
    planSelectedTcMode = null;
    planSelectedTcIds = new Set();
    updatePlanTcSummary();
}

// 编辑已有计划
function editPlan(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan) return;
    editingPlanId = plan.id;

    document.getElementById('plan-list-view').style.display = 'none';
    document.getElementById('plan-detail-view').style.display = 'none';
    document.getElementById('plan-create-view').style.display = 'block';

    // 更新标题
    const titleEl = document.querySelector('#plan-create-view .toolbar-title');
    if (titleEl) titleEl.textContent = '编辑适配计划';

    // 更新按钮（编辑模式：保存 + 取消）
    const actionsEl = document.querySelector('#plan-form .form-actions');
    if (actionsEl) {
        actionsEl.innerHTML = `
            <button type="button" class="tool-btn" onclick="showPlanListView()">取消</button>
            <button type="button" class="tool-btn tool-btn-primary" onclick="submitPlan(event, '${plan.status || 'draft'}')">💾 保存修改</button>
        `;
    }

    // 填充表单
    document.getElementById('plan-title').value = plan.title || '';
    document.getElementById('plan-date').value = plan.date || '';
    document.getElementById('plan-interlace-version').value = plan.interlaceVersion || '';
    document.getElementById('plan-client-version').value = plan.clientVersion || '';
    document.getElementById('plan-goal').value = plan.goal || '';

    // 填充已选机型
    planSelectedDevices = (plan.devices || []).map(d => typeof d === 'string' ? { id: null, name: d } : { id: d.id, name: d.name });
    renderPlanDeviceTags();

    // 编辑计划时不重新选游戏（游戏在详情页管理），只填充机型和元信息
    planSelectedGames = [];
    renderPlanGameTags();

    // 隐藏游戏选择区域（编辑时游戏在详情页管理）
    const gameSection = document.getElementById('plan-games-section');
    if (gameSection) gameSection.style.display = 'none';
    const assigneeSection = document.getElementById('plan-assignee-section');
    if (assigneeSection) assigneeSection.style.display = 'none';

    // 填充默认负责人下拉框
    fillAssigneeSelect();
}

// 填充默认负责人下拉框
function fillAssigneeSelect() {
    const select = document.getElementById('plan-default-assignee');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">不指定（后续逐个指派）</option>';
    (allMembersData || []).forEach(m => {
        select.innerHTML += `<option value="${m.id}">${escapeHtml(m.name)}</option>`;
    });
    if (currentVal) select.value = currentVal;
}

// 填充测试用例模板下拉框 (已废弃，改用弹窗选择)
async function fillPlanTcTemplateSelect() {
    // 兼容保留，新流程使用 openPlanTcSelectModal()
}

// 模板选择变化时的提示 (已废弃，改用弹窗选择)
function onPlanTcTemplateChange() {
    // 兼容保留
}

// 测试用例关联模式: null=不关联, 'selected'=选定用例
let planSelectedTcMode = null;
let planSelectedTcIds = new Set(); // 创建计划时选中的用例ID

// ========== 创建计划 - 测试用例选择弹窗 ==========
let planTcAllCases = [];
let planTcFilteredCases = [];
let planTcSuites = [];
let planTcCurrentSuiteId = null;
let planTcTempSelectedIds = new Set(); // 弹窗内临时选中

// 打开选择弹窗
async function openPlanTcSelectModal() {
    // 加载套件
    try {
        const suiteResp = await authFetch(`${API_BASE}/test-cases/suites`);
        const suiteResult = await suiteResp.json();
        planTcSuites = suiteResult.data || [];
    } catch (e) { planTcSuites = []; }
    
    // 加载所有用例
    try {
        const resp = await authFetch(`${API_BASE}/test-cases`);
        const result = await resp.json();
        planTcAllCases = result.data || [];
    } catch (e) { planTcAllCases = []; }
    
    // 复制已选状态到临时
    planTcTempSelectedIds = new Set(planSelectedTcIds);
    planTcCurrentSuiteId = null;
    
    document.getElementById('plan-tc-search').value = '';
    document.getElementById('plan-tc-category').value = '';
    
    renderPlanTcSuiteTree();
    updatePlanTcBreadcrumb();
    filterPlanTcCases();
    updatePlanTcSelCount();
    
    openModal('plan-tc-select-modal');
}

// 渲染左侧套件树
function renderPlanTcSuiteTree() {
    const container = document.getElementById('plan-tc-suite-list');
    if (!container) return;
    
    const totalCount = planTcAllCases.length;
    const unclassifiedCount = planTcAllCases.filter(tc => !tc.suite_id).length;
    
    let html = `
        <div class="link-tc-suite-item ${planTcCurrentSuiteId === null ? 'active' : ''}" onclick="selectPlanTcSuite(null)">
            <span class="suite-icon">📋</span>
            <span class="suite-name">全部用例</span>
            <span class="suite-count">${totalCount}</span>
        </div>
        <div class="link-tc-suite-item ${planTcCurrentSuiteId === 'unclassified' ? 'active' : ''}" onclick="selectPlanTcSuite('unclassified')">
            <span class="suite-icon">📄</span>
            <span class="suite-name">未归类</span>
            <span class="suite-count">${unclassifiedCount}</span>
        </div>
        <div style="border-top:1px solid var(--border-light);margin:4px 10px;"></div>
    `;
    
    planTcSuites.forEach(suite => {
        const count = planTcAllCases.filter(tc => tc.suite_id === suite.id).length;
        html += `
        <div class="link-tc-suite-item ${planTcCurrentSuiteId === suite.id ? 'active' : ''}" onclick="selectPlanTcSuite(${suite.id})" title="${escapeHtml(suite.description || '')}">
            <span class="suite-icon">📂</span>
            <span class="suite-name">${escapeHtml(suite.name)}</span>
            <span class="suite-count">${count}</span>
        </div>`;
    });
    
    container.innerHTML = html;
}

// 选择套件
function selectPlanTcSuite(suiteId) {
    planTcCurrentSuiteId = suiteId;
    renderPlanTcSuiteTree();
    updatePlanTcBreadcrumb();
    filterPlanTcCases();
}

// 更新面包屑
function updatePlanTcBreadcrumb() {
    const container = document.getElementById('plan-tc-breadcrumb');
    if (!container) return;
    
    if (planTcCurrentSuiteId === null) {
        container.innerHTML = '<span class="tc-breadcrumb-item active">📂 全部用例</span>';
    } else if (planTcCurrentSuiteId === 'unclassified') {
        container.innerHTML = `
            <span class="tc-breadcrumb-item" onclick="selectPlanTcSuite(null)" style="cursor:pointer">📂 全部用例</span>
            <span class="tc-breadcrumb-sep">›</span>
            <span class="tc-breadcrumb-item active">📄 未归类</span>`;
    } else {
        const suite = planTcSuites.find(s => s.id === planTcCurrentSuiteId);
        container.innerHTML = `
            <span class="tc-breadcrumb-item" onclick="selectPlanTcSuite(null)" style="cursor:pointer">📂 全部用例</span>
            <span class="tc-breadcrumb-sep">›</span>
            <span class="tc-breadcrumb-item active">📂 ${escapeHtml(suite?.name || '')}</span>`;
    }
}

// 筛选用例
function filterPlanTcCases() {
    const search = (document.getElementById('plan-tc-search')?.value || '').toLowerCase();
    const category = document.getElementById('plan-tc-category')?.value || '';
    
    planTcFilteredCases = planTcAllCases.filter(tc => {
        if (planTcCurrentSuiteId === 'unclassified') {
            if (tc.suite_id) return false;
        } else if (planTcCurrentSuiteId !== null) {
            if (tc.suite_id !== planTcCurrentSuiteId) return false;
        }
        if (search && !tc.name.toLowerCase().includes(search) && !(tc.code || '').toLowerCase().includes(search)) {
            return false;
        }
        if (category && tc.category !== category) return false;
        return true;
    });
    
    renderPlanTcTable();
}

// 渲染用例表格
function renderPlanTcTable() {
    const tbody = document.getElementById('plan-tc-table');
    if (!tbody) return;
    
    if (planTcFilteredCases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">暂无测试用例</td></tr>`;
        return;
    }
    
    tbody.innerHTML = planTcFilteredCases.map(tc => {
        const isSelected = planTcTempSelectedIds.has(tc.id);
        return `
            <tr class="${isSelected ? 'selected' : ''}" onclick="togglePlanTcSelect(${tc.id})">
                <td><input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); togglePlanTcSelect(${tc.id})"></td>
                <td>${escapeHtml(tc.code || '-')}</td>
                <td>${escapeHtml(tc.name)}</td>
                <td><span class="tc-category-tag">${escapeHtml(tc.category || '')}</span></td>
                <td><span class="tc-priority-tag ${sanitizeCssClass(tc.priority || 'medium')}">${getPriorityLabel(tc.priority)}</span></td>
            </tr>
        `;
    }).join('');
}

// 切换单条选择
function togglePlanTcSelect(id) {
    if (planTcTempSelectedIds.has(id)) {
        planTcTempSelectedIds.delete(id);
    } else {
        planTcTempSelectedIds.add(id);
    }
    renderPlanTcTable();
    updatePlanTcSelCount();
}

// 全选
function togglePlanTcSelectAll() {
    const checkbox = document.getElementById('plan-tc-select-all');
    if (checkbox?.checked) {
        planTcFilteredCases.forEach(tc => planTcTempSelectedIds.add(tc.id));
    } else {
        planTcFilteredCases.forEach(tc => planTcTempSelectedIds.delete(tc.id));
    }
    renderPlanTcTable();
    updatePlanTcSelCount();
}

// 更新已选计数
function updatePlanTcSelCount() {
    const el = document.getElementById('plan-tc-sel-count');
    if (el) el.textContent = planTcTempSelectedIds.size;
}

// 确定选择
function confirmPlanTcSelect() {
    planSelectedTcIds = new Set(planTcTempSelectedIds);
    planSelectedTcMode = planSelectedTcIds.size > 0 ? 'selected' : null;
    updatePlanTcSummary();
    closeModal('plan-tc-select-modal');
}

// 不关联
function planTcSelectNone() {
    planSelectedTcIds = new Set();
    planSelectedTcMode = null;
    updatePlanTcSummary();
    closeModal('plan-tc-select-modal');
}

// 更新表单回显
function updatePlanTcSummary() {
    const summaryEl = document.getElementById('plan-tc-selected-summary');
    const tagsEl = document.getElementById('plan-tc-selected-tags');
    
    if (planSelectedTcIds.size === 0) {
        if (summaryEl) summaryEl.textContent = '未选择（后续手动添加）';
        if (tagsEl) tagsEl.style.display = 'none';
        return;
    }
    
    if (summaryEl) summaryEl.textContent = `已选择 ${planSelectedTcIds.size} 条测试用例`;
    
    if (tagsEl) {
        // 显示前5个用例名称作为标签
        const selectedCases = planTcAllCases.filter(tc => planSelectedTcIds.has(tc.id));
        const showCases = selectedCases.slice(0, 5);
        let html = showCases.map(tc => 
            `<span class="tag-item">${escapeHtml(tc.name)} <span class="tag-remove" onclick="removePlanTcSelection(${tc.id})">×</span></span>`
        ).join('');
        if (selectedCases.length > 5) {
            html += `<span class="tag-item" style="background:var(--bg-secondary);color:var(--text-muted);">+${selectedCases.length - 5} 更多</span>`;
        }
        tagsEl.innerHTML = html;
        tagsEl.style.display = 'flex';
    }
}

// 移除单条选择
function removePlanTcSelection(id) {
    planSelectedTcIds.delete(id);
    if (planSelectedTcIds.size === 0) planSelectedTcMode = null;
    updatePlanTcSummary();
}

// 创建计划后自动关联测试用例
async function autoLinkTestCasesToPlan(planId) {
    try {
        // 先获取该计划的所有游戏ID
        const gamesResp = await authFetch(`${API_BASE}/plans/${planId}`);
        const planResult = await gamesResp.json();
        if (!planResult.success || !planResult.data?.games) return;

        const planGames = planResult.data.games;
        if (planGames.length === 0) return;

        // 使用弹窗选择的用例ID
        let tcIds = Array.from(planSelectedTcIds);

        if (tcIds.length === 0) return;

        // 为每个游戏批量关联测试用例
        let linkedCount = 0;
        for (const pg of planGames) {
            try {
                const linkResp = await authFetch(`${API_BASE}/test-cases/link`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        plan_id: planId,
                        plan_game_id: pg.id,
                        test_case_ids: tcIds
                    })
                });
                const linkResult = await linkResp.json();
                if (linkResult.success) linkedCount++;
            } catch (e) { console.error('游戏', pg.game_name, '关联失败:', e); }
        }

        console.log(`测试用例已关联：${tcIds.length}个用例 × ${linkedCount}个游戏`);
    } catch (e) {
        console.error('自动关联测试用例失败:', e);
    }
}

function showPlanListView() {
    editingPlanId = null;
    document.getElementById('plan-create-view').style.display = 'none';
    document.getElementById('plan-detail-view').style.display = 'none';
    document.getElementById('plan-list-view').style.display = 'block';
    // 恢复创建表单中被编辑模式隐藏的区域
    const gameSection = document.getElementById('plan-games-section');
    if (gameSection) gameSection.style.display = '';
    const assigneeSection = document.getElementById('plan-assignee-section');
    if (assigneeSection) assigneeSection.style.display = '';
}

function backToPlanList() {
    showPlanListView();
}

// ========== 创建计划表单 ==========

// 渲染已选机型标签
function renderPlanDeviceTags() {
    const container = document.getElementById('plan-devices-tags');
    container.innerHTML = planSelectedDevices.map((device, i) =>
        `<span class="tag-item">${escapeHtml(device.name)} <span class="tag-remove" onclick="removePlanDevice(${i})">×</span></span>`
    ).join('');
}

// 渲染已选游戏标签
function renderPlanGameTags() {
    const container = document.getElementById('plan-games-tags');
    container.innerHTML = planSelectedGames.map((game, i) =>
        `<span class="tag-item">${escapeHtml(game.name)}${game.ownerName ? `<span style="opacity:0.6;font-size:11px;margin-left:4px;">👤${escapeHtml(game.ownerName)}</span>` : ''} <span class="tag-remove" onclick="removePlanGame(${i})">×</span></span>`
    ).join('');
}

function removePlanDevice(index) {
    planSelectedDevices.splice(index, 1);
    renderPlanDeviceTags();
}

function removePlanGame(index) {
    planSelectedGames.splice(index, 1);
    renderPlanGameTags();
}

// 提交计划
async function submitPlan(event, planStatus) {
    if (event && event.preventDefault) event.preventDefault();
    planStatus = planStatus || 'draft';

    const title = document.getElementById('plan-title').value.trim();
    const date = document.getElementById('plan-date').value;
    const interlaceVersion = document.getElementById('plan-interlace-version').value.trim();
    const clientVersion = document.getElementById('plan-client-version').value.trim();
    const goal = document.getElementById('plan-goal').value.trim();

    if (!title || !date) {
        showToast('请填写标题和时间', 'warning');
        return;
    }

    if (planSelectedDevices.length === 0) {
        showToast('请至少选择一个机型', 'warning');
        return;
    }

    // 编辑模式：只更新元信息（PUT）
    if (editingPlanId) {
        const tabName = planSelectedDevices.map(d => d.name).join('+') + ' ' + date;
        const payload = {
            title,
            plan_date: date,
            devices_json: planSelectedDevices,
            interlace_version: interlaceVersion,
            client_version: clientVersion,
            goal,
            tab_name: tabName
        };
        try {
            const resp = await authFetch(`${API_BASE}/plans/${editingPlanId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await resp.json();
            if (result.success) {
                showToast('计划已更新', 'success');
                editingPlanId = null;
                await loadConfigPlans();
                showPlanListView();
            } else {
                showToast('更新失败: ' + (result.error || '未知错误'), 'danger');
            }
        } catch (e) {
            console.error('更新配置计划失败:', e);
            showToast('更新失败，请重试', 'danger');
        }
        return;
    }

    // 创建模式（POST）
    if (planSelectedGames.length === 0) {
        showToast('请至少选择一个游戏', 'warning');
        return;
    }

    // 获取默认负责人
    const defaultAssigneeSelect = document.getElementById('plan-default-assignee');
    const defaultAssigneeId = defaultAssigneeSelect ? defaultAssigneeSelect.value : '';
    const defaultAssigneeName = defaultAssigneeId ? (defaultAssigneeSelect.options[defaultAssigneeSelect.selectedIndex].text || '') : '';

    // 生成Tab名称: 机型+日期
    const tabName = planSelectedDevices.map(d => d.name).join('+') + ' ' + date;

    const payload = {
        title,
        plan_date: date,
        devices_json: planSelectedDevices,
        interlace_version: interlaceVersion,
        client_version: clientVersion,
        goal,
        tab_name: tabName,
        status: planStatus,
        requirement_id: window._pendingReqId || null,
        games: planSelectedGames.map((game, i) => ({
            game_id: game.id,
            game_name: game.name,
            game_platform: game.platform || '-',
            game_type: game.game_type || '-',
            // 优先用游戏自身负责人，没有则用默认负责人兜底
            owner_name: game.ownerName || defaultAssigneeName || '',
            assigned_to: (game.ownerId && !defaultAssigneeId) ? parseInt(game.ownerId)
                        : (defaultAssigneeId ? parseInt(defaultAssigneeId) : null),
            adapt_status: 'not_started',
            adapt_progress: 0,
            remark: '',
            sort_order: i
        }))
    };

    try {
        const resp = await authFetch(`${API_BASE}/plans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await resp.json();

        if (result.success) {
            const planId = result.data?.id;
            
            // 如果选择了测试用例模板，自动关联
            if (planSelectedTcMode && planId) {
                try {
                    await autoLinkTestCasesToPlan(planId);
                } catch (tcErr) {
                    console.error('关联测试用例失败:', tcErr);
                    showToast('计划创建成功，但测试用例关联可能不完整', 'warning');
                }
            }

            const statusText = planStatus === 'published' ? '创建并发布' : '保存草稿';
            showToast(`配置计划${statusText}成功`, 'success');
            window._pendingReqId = null; // 清除需求关联
            await loadConfigPlans();
            showPlanListView();
        } else {
            showToast('创建失败: ' + (result.error || '未知错误'), 'danger');
        }
    } catch (e) {
        console.error('创建配置计划失败:', e);
        showToast('创建失败，请重试', 'danger');
    }
}

// P0: 从后端加载所有配置计划
async function loadConfigPlans() {
    try {
        const resp = await authFetch(`${API_BASE}/plans`);
        const result = await resp.json();

        if (result.success && result.data) {
            configPlans = result.data.map(p => ({
                id: p.id,
                planNo: p.plan_no || '',
                title: p.title,
                date: p.plan_date,
                devices: (() => { try { return typeof p.devices_json === 'string' ? JSON.parse(p.devices_json || '[]') : (p.devices_json || []); } catch(e) { console.warn('配置计划设备数据解析失败, plan_id:', p.id, e); return []; } })(),
                interlaceVersion: p.interlace_version || '',
                clientVersion: p.client_version || '',
                goal: p.goal || '',
                tabName: p.tab_name || p.title,
                status: p.status || 'draft',
                creatorName: p.creator_name || '',
                requirementId: p.requirement_id || null,
                requirementTitle: p.requirement_title || '',
                requirementNo: p.requirement_no || '',
                createdAt: p.created_at,
                gameCount: p.game_count || 0,
                finishedCount: p.finished_count || 0,
                adaptingCount: p.adapting_count || 0,
                assigneeCount: p.assignee_count || 0,
                avgProgress: p.avg_progress || 0,
                games: [] // 详情按需加载
            }));
        } else {
            configPlans = [];
        }

        renderPlanCards();
    } catch (e) {
        console.error('加载配置计划失败:', e);
        configPlans = [];
    }
}

// 筛选计划
let planStatusFilter = '';
function filterPlans() {
    planStatusFilter = document.getElementById('plan-status-filter').value;
    renderPlanCards();
}

// 配置计划视图模式切换
let planViewMode = 'card'; // 'card' or 'list'

function togglePlanView(mode) {
    planViewMode = mode;
    document.querySelectorAll('#plan-view-toggle .view-toggle-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`#plan-view-toggle .view-toggle-btn[data-view="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderPlanCards();
}

// 渲染计划列表表格
function renderPlanListTable(filtered) {
    const tbody = document.getElementById('plan-list-table');
    if (!tbody) return;

    // 无参调用时（如字段设置应用后），重新计算筛选数据
    if (!filtered) {
        filtered = configPlans;
        if (typeof planStatusFilter !== 'undefined' && planStatusFilter) {
            filtered = filtered.filter(p => p.status === planStatusFilter);
        }
        filtered = filtered.slice().sort((a, b) => {
            const da = a.createdAt ? new Date(a.createdAt).getTime() : (a.date ? new Date(a.date).getTime() : 0);
            const db = b.createdAt ? new Date(b.createdAt).getTime() : (b.date ? new Date(b.date).getTime() : 0);
            return db - da;
        });
    }

    // 更新表头列顺序 + 可见性 + 拖拽
    if (typeof updateColumnHeaders === 'function') updateColumnHeaders('plan-list-table');
    if (typeof initHeaderDrag === 'function') initHeaderDrag('plan-list-table');

    const defaultOrder = ['number', 'title', 'status', 'date', 'game_count',
        'assignee_count', 'progress', 'requirement', 'creator'];
    const colOrder = typeof getColumnOrder === 'function' ? getColumnOrder('plan-list-table') : defaultOrder;

    if (!filtered.length) {
        // 动态 colspan
        let visCount = 1; // 序号
        colOrder.forEach(f => { if (typeof planListVisibleColumns === 'undefined' || planListVisibleColumns[f]) visCount++; });
        visCount += 1; // 操作
        tbody.innerHTML = `<tr><td colspan="${visCount}" class="empty-state"><div class="empty-icon">📋</div><div>${configPlans.length === 0 ? '暂无配置计划' : '没有符合筛选条件的计划'}</div></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((plan, i) => {
        const statusLabel = { published: '✅ 已发布', closed: '🏁 已完成', draft: '📝 草稿' }[plan.status] || plan.status;
        const progress = plan.avgProgress || 0;
        const idx = configPlans.indexOf(plan);

        let rowHtml = `<td class="text-center"><strong>${i + 1}</strong></td>`;

        colOrder.forEach(field => {
            if (typeof planListVisibleColumns !== 'undefined' && !planListVisibleColumns[field]) return;
            switch (field) {
                case 'number':
                    rowHtml += `<td style="font-size:12px;color:var(--text-muted);">${escapeHtml(plan.planNo)}</td>`;
                    break;
                case 'title':
                    rowHtml += `<td><a href="javascript:void(0)" onclick="openPlanDetail(${idx})" style="color:var(--primary);font-weight:500;">${escapeHtml(plan.title)}</a></td>`;
                    break;
                case 'status':
                    rowHtml += `<td>${statusLabel}</td>`;
                    break;
                case 'date':
                    rowHtml += `<td>${plan.date || '-'}</td>`;
                    break;
                case 'game_count':
                    rowHtml += `<td class="text-center">${plan.gameCount}</td>`;
                    break;
                case 'assignee_count':
                    rowHtml += `<td class="text-center">${plan.assigneeCount}</td>`;
                    break;
                case 'progress':
                    rowHtml += `<td>
                        <div class="plan-card-progress" style="margin:0;">
                            <div class="plan-card-progress-bar"><div class="plan-card-progress-fill" style="width:${progress}%"></div></div>
                            <span class="plan-card-pct" style="font-size:11px;">${progress}%</span>
                        </div>
                    </td>`;
                    break;
                case 'requirement':
                    rowHtml += `<td>${plan.requirementTitle ? `<a href="javascript:void(0)" onclick="switchTab('requirements');setTimeout(()=>openReqDetail(${plan.requirementId}),300);" style="color:var(--primary);font-size:12px;">${escapeHtml(plan.requirementTitle)}</a>` : '-'}</td>`;
                    break;
                case 'creator':
                    rowHtml += `<td style="font-size:12px;">${escapeHtml(plan.creatorName || '-')}</td>`;
                    break;
            }
        });

        rowHtml += `<td>
            <button class="btn btn-small btn-edit" onclick="editPlan(${idx})">编辑</button>
            ${plan.status === 'draft' ? `<button class="btn btn-small" style="background:var(--primary);color:#fff;" onclick="publishPlan(${idx})">发布</button>` : ''}
            <button class="btn btn-small btn-delete" onclick="deletePlan(${idx})">删除</button>
        </td>`;

        return `<tr>${rowHtml}</tr>`;
    }).join('');
}

// 渲染计划卡片列表
function renderPlanCards() {
    const container = document.getElementById('plan-cards-container');
    const summaryBar = document.getElementById('plans-summary-bar');
    
    // 筛选
    let filtered = configPlans;
    if (planStatusFilter) {
        filtered = filtered.filter(p => p.status === planStatusFilter);
    }

    // 排序：从新到旧（按创建时间/日期降序）
    filtered.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : (a.date ? new Date(a.date).getTime() : 0);
        const db = b.createdAt ? new Date(b.createdAt).getTime() : (b.date ? new Date(b.date).getTime() : 0);
        return db - da;
    });

    // 汇总
    const totalCount = configPlans.length;
    const draftCount = configPlans.filter(p => p.status === 'draft').length;
    const publishedCount = configPlans.filter(p => p.status === 'published').length;
    if (summaryBar) {
        summaryBar.innerHTML = `
            <span class="summary-item"><span class="summary-dot dot-total"></span>共 <strong>${totalCount}</strong> 个计划</span>
            <span class="summary-item"><span class="summary-dot dot-draft"></span>草稿 <strong>${draftCount}</strong></span>
            <span class="summary-item"><span class="summary-dot dot-published"></span>已发布 <strong>${publishedCount}</strong></span>
        `;
    }

    // 视图模式分流
    const tableContainer = document.getElementById('plan-table-container');
    if (planViewMode === 'list') {
        container.style.display = 'none';
        if (tableContainer) tableContainer.style.display = '';
        renderPlanListTable(filtered);
        return;
    } else {
        container.style.display = '';
        if (tableContainer) tableContainer.style.display = 'none';
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state-full">
            <div class="empty-icon">📋</div>
            <div class="empty-text">${configPlans.length === 0 ? '还没有适配计划' : '没有符合筛选条件的计划'}</div>
            <div class="empty-sub">${configPlans.length === 0 ? '创建配置计划以组织和管理团队的适配工作' : '请调整筛选条件'}</div>
            ${configPlans.length === 0 ? '<div class="empty-action"><button class="btn btn-primary" onclick="showPlanForm()">➕ 新增适配计划</button></div>' : ''}
        </div>`;
        return;
    }

    container.innerHTML = filtered.map((plan, i) => {
        const notStartedCount = plan.gameCount - plan.finishedCount - plan.adaptingCount;
        const progressPercent = plan.avgProgress || 0;
        const deviceNames = plan.devices.map(d => d.name || d).join('、');
        const dateDisplay = plan.date || '';
        
        return `
        <div class="plan-card status-${plan.status}" onclick="openPlanDetail(${configPlans.indexOf(plan)})">
            <div class="plan-card-top">
                <div class="plan-card-title-row">
                    <span class="plan-card-status status-${plan.status}">${plan.status === 'published' ? '✅ 已发布' : plan.status === 'closed' ? '🏁 已完成' : '📝 草稿'}</span>
                    <span class="plan-card-title">${escapeHtml(plan.title)}</span>
                    <span class="plan-card-no">${escapeHtml(plan.planNo)}</span>
                </div>
            </div>
            <div class="plan-card-meta">
                <span class="plan-card-meta-item"><span class="meta-icon">📅</span>${dateDisplay}</span>
                <span class="plan-card-meta-item"><span class="meta-icon">💻</span>${escapeHtml(deviceNames) || '未选机型'}</span>
                <span class="plan-card-meta-item"><span class="meta-icon">👤</span>${plan.assigneeCount} 人参与</span>
                ${plan.creatorName ? `<span class="plan-card-meta-item"><span class="meta-icon">✍️</span>${escapeHtml(plan.creatorName)}</span>` : ''}
                ${plan.requirementTitle ? `<span class="plan-card-meta-item"><span class="meta-icon">📄</span><a href="javascript:void(0)" onclick="event.stopPropagation(); switchTab('requirements'); setTimeout(()=>openReqDetail(${plan.requirementId}),300);" style="color:var(--primary);text-decoration:none;">${escapeHtml(plan.requirementTitle)}</a></span>` : ''}
            </div>
            <div class="plan-card-body">
                <div class="plan-card-progress">
                    <div class="plan-card-progress-bar"><div class="plan-card-progress-fill" style="width:${progressPercent}%"></div></div>
                    <span class="plan-card-pct">${progressPercent}%</span>
                </div>
                <div class="plan-card-stats">
                    <span class="plan-card-stat stat-total">🎮 ${plan.gameCount} 款游戏</span>
                    ${notStartedCount > 0 ? `<span class="plan-card-stat stat-not-started">⏳ ${notStartedCount}</span>` : ''}
                    ${plan.adaptingCount > 0 ? `<span class="plan-card-stat stat-adapting">🔄 ${plan.adaptingCount}</span>` : ''}
                    ${plan.finishedCount > 0 ? `<span class="plan-card-stat stat-finished">✅ ${plan.finishedCount}</span>` : ''}
                </div>
            </div>
            <div class="plan-card-actions" onclick="event.stopPropagation()">
                <button class="plan-card-action-btn" onclick="event.stopPropagation(); editPlan(${configPlans.indexOf(plan)})">✏️ 编辑</button>
                ${plan.status === 'draft' ? `<button class="plan-card-action-btn btn-publish" onclick="event.stopPropagation(); publishPlan(${configPlans.indexOf(plan)})">🚀 发布</button>` : ''}
                <button class="plan-card-action-btn" onclick="event.stopPropagation(); openPlanDetail(${configPlans.indexOf(plan)})">📋 详情</button>
                <button class="plan-card-action-btn btn-danger" onclick="event.stopPropagation(); deletePlan(${configPlans.indexOf(plan)})">🗑️ 删除</button>
            </div>
        </div>`;
    }).join('');
}

// 打开计划详情视图
async function openPlanDetail(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan) return;

    currentPlanIndex = planIndex;

    // 切换视图
    document.getElementById('plan-list-view').style.display = 'none';
    document.getElementById('plan-detail-view').style.display = 'flex';

    // 设置标题
    document.getElementById('plan-detail-title').innerHTML = `${escapeHtml(plan.title)} <span style="font-size:12px;color:var(--text-light);font-weight:400;margin-left:8px;">${escapeHtml(plan.planNo)}</span>`;

    // 操作按钮
    const actionsEl = document.getElementById('plan-detail-actions');
    let actionsHtml = `<button class="tool-btn" onclick="editPlan(${planIndex})">✏️ 编辑</button>`;
    actionsHtml += `<button class="tool-btn" onclick="addGamesToPlan(${planIndex})">＋ 添加游戏</button>`;
    if (plan.status === 'draft') {
        actionsHtml += `<button class="tool-btn tool-btn-primary" onclick="publishPlan(${planIndex})">🚀 发布计划</button>`;
    }
    if (plan.status === 'published') {
        actionsHtml += `<button class="tool-btn" style="background:var(--success);color:#fff;" onclick="closePlan(${planIndex})">✅ 完成计划</button>`;
    }
    actionsHtml += `<button class="btn btn-small btn-delete" onclick="deletePlan(${planIndex})">🗑️ 删除</button>`;
    actionsEl.innerHTML = actionsHtml;

    // 信息条
    const infoBar = document.getElementById('plan-detail-info-bar');
    const deviceNames = plan.devices.map(d => escapeHtml(d.name || d)).join('、');
    const statusLabel = plan.status === 'published' ? '<span class="status-badge status-online">已发布</span>' : plan.status === 'closed' ? '<span class="status-badge status-offline">已完成</span>' : '<span class="status-badge status-pending">草稿</span>';
    
    infoBar.innerHTML = `
        <span class="info-tag"><span class="tag-label">状态：</span>${statusLabel}</span>
        <span class="info-tag"><span class="tag-label">日期：</span><span class="tag-value">${escapeHtml(plan.date)}</span></span>
        <span class="info-tag"><span class="tag-label">机型：</span><span class="tag-value">${deviceNames || '-'}</span></span>
        ${plan.interlaceVersion ? `<span class="info-tag"><span class="tag-label">交织版本：</span><span class="tag-value">${escapeHtml(plan.interlaceVersion)}</span></span>` : ''}
        ${plan.clientVersion ? `<span class="info-tag"><span class="tag-label">客户端版本：</span><span class="tag-value">${escapeHtml(plan.clientVersion)}</span></span>` : ''}
        ${plan.goal ? `<span class="info-tag"><span class="tag-label">目标：</span><span class="tag-value">${escapeHtml(plan.goal)}</span></span>` : ''}
    `;

    // 加载游戏列表详情
    if (!plan.games || plan.games.length === 0) {
        await loadPlanDetail(plan.id);
    }

    renderPlanDetailGames(planIndex);
}

// P0: 从后端加载单个计划详情（含游戏列表）
async function loadPlanDetail(planId) {
    try {
        const resp = await authFetch(`${API_BASE}/plans/${planId}`);
        const result = await resp.json();

        if (result.success && result.data) {
            const plan = result.data;
            const planIndex = configPlans.findIndex(p => p.id === planId);
            if (planIndex >= 0) {
                configPlans[planIndex].games = (plan.games || []).map(g => ({
                    id: g.id,
                    gameId: g.game_id,
                    name: g.game_name || '未知',
                    platform: g.game_platform || '-',
                    gameType: g.game_type || '-',
                    ownerName: g.owner_name || g.assigned_name || '',
                    assignedTo: g.assigned_to || null,
                    assignedName: g.assigned_name || g.owner_name || '',
                    adaptStatus: g.adapt_status || 'not_started',
                    adaptProgress: g.adapt_progress || 0,
                    remark: g.remark || '',
                    bugs: g.bugs_json || []
                }));
            }
        }
    } catch (e) {
        console.error('加载计划详情失败:', e);
    }
}

// ========== 计划详情 - 游戏列表渲染 ==========

function renderPlanDetailGames(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan) return;

    const tbody = document.getElementById('plan-games-table');
    const statsItems = document.getElementById('plan-detail-stats-items');
    const totalGames = plan.games.length;

    if (totalGames === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-icon">📋</div><div>暂无游戏</div></td></tr>`;
        if (statsItems) statsItems.innerHTML = '';
        return;
    }

    tbody.innerHTML = plan.games.map((game, idx) => {
        return `
            <tr>
                <td class="text-center"><strong>${idx + 1}</strong></td>
                <td>${escapeHtml(game.name)}</td>
                <td>${escapeHtml(game.platform)}</td>
                <td>
                    <select class="adapt-status-select" onchange="updatePlanGameAssignee(${planIndex}, ${idx}, this)">
                        <option value="">未指派</option>
                        ${(allMembersData || []).map(m => 
                            `<option value="${m.id || ''}" ${(game.assignedTo == m.id || (!game.assignedTo && game.ownerName === m.name)) ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
                        ).join('')}
                    </select>
                </td>
                <td>
                    <select class="adapt-status-select" onchange="updatePlanGameAdaptStatus(${planIndex}, ${idx}, this.value)">
                        ${(getFieldOptionsByKey('plan_adapt_status').length > 0 
                            ? getFieldOptionsByKey('plan_adapt_status') 
                            : [{value:'not_started',label:'未开始'},{value:'adapting',label:'适配中'},{value:'finished',label:'已结束'}]
                        ).map(o => `<option value="${o.value}" ${game.adaptStatus === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
                    </select>
                </td>
                <td>
                    <div class="progress-bar-container" style="min-width:120px;">
                        <div class="progress-bar-track"><div class="progress-bar" style="width: ${game.adaptProgress || 0}%"></div></div>
                        <span class="progress-text">${game.adaptProgress || 0}%</span>
                    </div>
                </td>
                <td>
                    <input type="text" class="remark-input" value="${escapeHtml(game.remark || '')}"
                        placeholder="输入备注..."
                        onchange="updatePlanGameRemark(${planIndex}, ${idx}, this.value)">
                </td>
                <td class="text-center">
                    <button class="btn btn-small" onclick="openLinkTestCaseModal(${planIndex}, ${idx})" title="关联测试用例">📝用例</button>
                    <button class="btn btn-small btn-delete" onclick="deletePlanGame(${planIndex}, ${idx})">删除</button>
                </td>
            </tr>
        `;
    }).join('');

    // 统计
    if (statsItems) {
        const finished = plan.games.filter(g => g.adaptStatus === 'finished').length;
        const adapting = plan.games.filter(g => g.adaptStatus === 'adapting').length;
        const notStarted = totalGames - finished - adapting;
        const assigned = plan.games.filter(g => g.assignedTo).length;
        statsItems.innerHTML = `
            <span class="stat-item">共 <strong>${totalGames}</strong> 款游戏</span>
            <span class="stat-item">已指派 <strong>${assigned}</strong></span>
            <span class="stat-item">未开始 <strong>${notStarted}</strong></span>
            <span class="stat-item">适配中 <strong>${adapting}</strong></span>
            <span class="stat-item">已完成 <strong>${finished}</strong></span>
        `;
    }
}

// ========== 计划详情操作 ==========

// P0: 删除整个计划
function deletePlan(planIndex) {
    const plan = configPlans[planIndex];
    if (!plan) return;
    showConfirm(`确定要删除计划「${plan.title || plan.tabName}」吗？此操作不可撤销。`, async () => {
        try {
            const resp = await authFetch(`${API_BASE}/plans/${plan.id}`, { method: 'DELETE' });
            const result = await resp.json();
            if (result.success) {
                showToast('计划已删除', 'success');
                await loadConfigPlans();
                showPlanListView();
            } else {
                showToast('删除失败: ' + (result.error || '未知错误'), 'danger');
            }
        } catch (e) {
            console.error('删除计划失败:', e);
            showToast('删除失败，请重试', 'danger');
        }
    });
}

// P0: 同步计划游戏变更到后端
async function syncPlanGameChange(game, fields) {
    if (!game.id) return; // 无后端ID则跳过
    try {
        await authFetch(`${API_BASE}/plans/game/${game.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields)
        });
    } catch (e) {
        console.error('同步计划游戏变更失败:', e);
    }
}

// 更新适配进展状态
function updatePlanGameAdaptStatus(planIndex, gameIndex, value) {
    const game = configPlans[planIndex].games[gameIndex];
    game.adaptStatus = value;
    // P0: 同步到后端
    syncPlanGameChange(game, { adapt_status: value });
}

// 更新问题备注
function updatePlanGameRemark(planIndex, gameIndex, value) {
    const game = configPlans[planIndex].games[gameIndex];
    game.remark = value;
    // P0: 同步到后端
    syncPlanGameChange(game, { remark: value });
}

// P0: 删除游戏（调用后端API）
function deletePlanGame(planIndex, gameIndex) {
    const game = configPlans[planIndex].games[gameIndex];
    showConfirm(`确定要删除游戏「${game.name || ''}」吗？`, async () => {
        if (game.id) {
            try {
                await authFetch(`${API_BASE}/plans/game/${game.id}`, { method: 'DELETE' });
            } catch (e) {
                console.error('删除计划游戏失败:', e);
                showToast('删除失败，请重试', 'danger');
                return;
            }
        }
        configPlans[planIndex].games.splice(gameIndex, 1);
        renderPlanDetailGames(planIndex);
        showToast('游戏已删除', 'success');
    });
}

// 显示缺陷详情弹窗
function showPlanBugDetail(planIndex, gameIndex) {
    const game = configPlans[planIndex].games[gameIndex];
    const bugs = game.bugs || [];

    const tbody = document.getElementById('bug-detail-table');

    if (bugs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-text">无缺陷</div></td></tr>`;
    } else {
        tbody.innerHTML = bugs.map((bug, i) => `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td>${escapeHtml(bug.description)}</td>
                <td class="text-center"><span class="status-badge status-${sanitizeCssClass(bug.bug_status)}">${getBugStatusText(bug.bug_status)}</span></td>
                <td class="text-center"><span class="priority-badge priority-${sanitizeCssClass(bug.priority)}">${getPriorityText(bug.priority)}</span></td>
                <td>${escapeHtml(bug.owner || '-')}</td>
            </tr>
        `).join('');
    }

    document.getElementById('bug-detail-modal').style.display = 'block';
}

function closeBugDetailModal() {
    document.getElementById('bug-detail-modal').style.display = 'none';
}

// ========== 机型选择弹窗 ==========

function openDeviceSelectModal() {
    // 构建源列表：排除已选的机型
    const selectedIds = new Set(planSelectedDevices.map(d => d.id));
    deviceSelectSourceList = allDevicesData
        .filter(d => !selectedIds.has(d.id))
        .map(d => ({ id: d.id, name: d.name, manufacturer: d.manufacturer || '-', checked: false }));
    deviceSelectTargetList = [];

    renderDeviceSourceList();
    renderDeviceTargetList();

    document.getElementById('device-select-search').value = '';
    document.getElementById('device-target-search').value = '';
    document.getElementById('select-all-devices-src').checked = false;
    document.getElementById('select-all-devices-tgt').checked = false;

    document.getElementById('device-select-modal').style.display = 'block';
}

function closeDeviceSelectModal() {
    document.getElementById('device-select-modal').style.display = 'none';
}

function renderDeviceSourceList(filterText) {
    const container = document.getElementById('device-source-list');
    let items = deviceSelectSourceList;
    if (filterText) {
        const kw = filterText.toLowerCase();
        items = items.filter(d => d.name.toLowerCase().includes(kw));
    }
    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无可用机型</div>';
    } else {
        container.innerHTML = items.map(d => {
            const ri = deviceSelectSourceList.indexOf(d);
            return `<div class="game-select-item ${d.checked ? 'selected' : ''}" onclick="toggleDeviceSrc(${ri})" ondblclick="event.stopPropagation(); dblTransferDeviceSrc(${ri})">
                <input type="checkbox" ${d.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleDeviceSrc(${ri})">
                <div class="game-select-item-info">
                    <span class="game-select-item-name">${escapeHtml(d.name)}</span>
                    <span class="game-select-item-meta">${escapeHtml(d.manufacturer)}</span>
                </div>
            </div>`;
        }).join('');
    }
    const checked = deviceSelectSourceList.filter(d => d.checked).length;
    document.getElementById('device-src-count').textContent = `${checked}/${deviceSelectSourceList.length}`;
}

// 双击左框item → 移到右框
function dblTransferDeviceSrc(i) {
    const item = deviceSelectSourceList[i];
    if (!item) return;
    item.checked = false;
    deviceSelectTargetList.push(item);
    deviceSelectSourceList.splice(i, 1);
    document.getElementById('select-all-devices-src').checked = false;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function renderDeviceTargetList(filterText) {
    const container = document.getElementById('device-target-list');
    let items = deviceSelectTargetList;
    if (filterText) {
        const kw = filterText.toLowerCase();
        items = items.filter(d => d.name.toLowerCase().includes(kw));
    }
    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无数据</div>';
    } else {
        container.innerHTML = items.map(d => {
            const ri = deviceSelectTargetList.indexOf(d);
            return `<div class="game-select-item ${d.checked ? 'selected' : ''}" onclick="toggleDeviceTgt(${ri})" ondblclick="event.stopPropagation(); dblTransferDeviceTgt(${ri})">
                <input type="checkbox" ${d.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleDeviceTgt(${ri})">
                <div class="game-select-item-info">
                    <span class="game-select-item-name">${escapeHtml(d.name)}</span>
                    <span class="game-select-item-meta">${escapeHtml(d.manufacturer)}</span>
                </div>
            </div>`;
        }).join('');
    }
    const checked = deviceSelectTargetList.filter(d => d.checked).length;
    document.getElementById('device-tgt-count').textContent = `${checked}/${deviceSelectTargetList.length}`;
}

// 双击右框item → 移回左框
function dblTransferDeviceTgt(i) {
    const item = deviceSelectTargetList[i];
    if (!item) return;
    item.checked = false;
    deviceSelectSourceList.push(item);
    deviceSelectTargetList.splice(i, 1);
    document.getElementById('select-all-devices-tgt').checked = false;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function toggleDeviceSrc(i) {
    deviceSelectSourceList[i].checked = !deviceSelectSourceList[i].checked;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
}

function toggleDeviceTgt(i) {
    deviceSelectTargetList[i].checked = !deviceSelectTargetList[i].checked;
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function toggleSelectAllDevicesSrc() {
    const checked = document.getElementById('select-all-devices-src').checked;
    deviceSelectSourceList.forEach(d => d.checked = checked);
    renderDeviceSourceList(document.getElementById('device-select-search').value);
}

function toggleSelectAllDevicesTgt() {
    const checked = document.getElementById('select-all-devices-tgt').checked;
    deviceSelectTargetList.forEach(d => d.checked = checked);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function transferDevicesToTarget() {
    const toTransfer = deviceSelectSourceList.filter(d => d.checked);
    if (!toTransfer.length) return;
    toTransfer.forEach(d => { d.checked = false; deviceSelectTargetList.push(d); });
    deviceSelectSourceList = deviceSelectSourceList.filter(d => !toTransfer.includes(d));
    document.getElementById('select-all-devices-src').checked = false;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function transferDevicesFromTarget() {
    const toTransfer = deviceSelectTargetList.filter(d => d.checked);
    if (!toTransfer.length) return;
    toTransfer.forEach(d => { d.checked = false; deviceSelectSourceList.push(d); });
    deviceSelectTargetList = deviceSelectTargetList.filter(d => !toTransfer.includes(d));
    document.getElementById('select-all-devices-tgt').checked = false;
    renderDeviceSourceList(document.getElementById('device-select-search').value);
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function filterDeviceSelectList() {
    renderDeviceSourceList(document.getElementById('device-select-search').value);
}

function filterDeviceTargetList() {
    renderDeviceTargetList(document.getElementById('device-target-search').value);
}

function confirmDeviceSelect() {
    if (deviceSelectTargetList.length === 0) {
        showToast('请先选择机型', 'warning');
        return;
    }
    planSelectedDevices = [...planSelectedDevices, ...deviceSelectTargetList.map(d => ({ id: d.id, name: d.name }))];
    renderPlanDeviceTags();
    closeDeviceSelectModal();
}

// ========== 游戏选择弹窗（配置计划用） ==========

function openPlanGameSelectModal() {
    const selectedIds = new Set(planSelectedGames.map(g => g.id));
    planGameSelectSourceList = allGamesForProgress
        .filter(g => !selectedIds.has(g.id))
        .map(g => ({
            id: g.id,
            name: g.name,
            platform: g.platform || '-',
            gameType: g.game_type || '-',
            ownerName: g.owner_name || '',
            ownerId: g.owner_id || null,
            checked: false
        }));
    planGameSelectTargetList = [];

    renderPlanGameSourceList();
    renderPlanGameTargetList();

    document.getElementById('plan-game-select-search').value = '';
    document.getElementById('plan-game-target-search').value = '';
    document.getElementById('select-all-plan-games-src').checked = false;
    document.getElementById('select-all-plan-games-tgt').checked = false;

    document.getElementById('plan-game-select-modal').style.display = 'block';
}

function closePlanGameSelectModal() {
    document.getElementById('plan-game-select-modal').style.display = 'none';
}

function renderPlanGameSourceList(filterText) {
    const container = document.getElementById('plan-game-source-list');
    let items = planGameSelectSourceList;
    if (filterText) {
        const kw = filterText.toLowerCase();
        items = items.filter(g => g.name.toLowerCase().includes(kw));
    }
    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无可用游戏</div>';
    } else {
        container.innerHTML = items.map(g => {
            const ri = planGameSelectSourceList.indexOf(g);
            return `<div class="game-select-item ${g.checked ? 'selected' : ''}" onclick="togglePlanGameSrc(${ri})" ondblclick="event.stopPropagation(); dblTransferPlanGameSrc(${ri})">
                <input type="checkbox" ${g.checked ? 'checked' : ''} onclick="event.stopPropagation(); togglePlanGameSrc(${ri})">
                <div class="game-select-item-info">
                    <span class="game-select-item-name">${escapeHtml(g.name)}</span>
                    <span class="game-select-item-meta">${escapeHtml(g.platform)} · ${escapeHtml(g.gameType)}${g.ownerName ? ` · 👤 ${escapeHtml(g.ownerName)}` : ''}</span>
                </div>
            </div>`;
        }).join('');
    }
    const checked = planGameSelectSourceList.filter(g => g.checked).length;
    document.getElementById('plan-game-src-count').textContent = `${checked}/${planGameSelectSourceList.length}`;
}

// 双击左框游戏 → 移到右框
function dblTransferPlanGameSrc(i) {
    const item = planGameSelectSourceList[i];
    if (!item) return;
    item.checked = false;
    planGameSelectTargetList.push(item);
    planGameSelectSourceList.splice(i, 1);
    document.getElementById('select-all-plan-games-src').checked = false;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function renderPlanGameTargetList(filterText) {
    const container = document.getElementById('plan-game-target-list');
    let items = planGameSelectTargetList;
    if (filterText) {
        const kw = filterText.toLowerCase();
        items = items.filter(g => g.name.toLowerCase().includes(kw));
    }
    if (items.length === 0) {
        container.innerHTML = '<div class="game-select-empty">无数据</div>';
    } else {
        container.innerHTML = items.map(g => {
            const ri = planGameSelectTargetList.indexOf(g);
            return `<div class="game-select-item ${g.checked ? 'selected' : ''}" onclick="togglePlanGameTgt(${ri})" ondblclick="event.stopPropagation(); dblTransferPlanGameTgt(${ri})">
                <input type="checkbox" ${g.checked ? 'checked' : ''} onclick="event.stopPropagation(); togglePlanGameTgt(${ri})">
                <div class="game-select-item-info">
                    <span class="game-select-item-name">${escapeHtml(g.name)}</span>
                    <span class="game-select-item-meta">${escapeHtml(g.platform)} · ${escapeHtml(g.gameType)}${g.ownerName ? ` · 👤 ${escapeHtml(g.ownerName)}` : ''}</span>
                </div>
            </div>`;
        }).join('');
    }
    const checked = planGameSelectTargetList.filter(g => g.checked).length;
    document.getElementById('plan-game-tgt-count').textContent = `${checked}/${planGameSelectTargetList.length}`;
}

// 双击右框游戏 → 移回左框
function dblTransferPlanGameTgt(i) {
    const item = planGameSelectTargetList[i];
    if (!item) return;
    item.checked = false;
    planGameSelectSourceList.push(item);
    planGameSelectTargetList.splice(i, 1);
    document.getElementById('select-all-plan-games-tgt').checked = false;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function togglePlanGameSrc(i) {
    planGameSelectSourceList[i].checked = !planGameSelectSourceList[i].checked;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
}

function togglePlanGameTgt(i) {
    planGameSelectTargetList[i].checked = !planGameSelectTargetList[i].checked;
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function toggleSelectAllPlanGamesSrc() {
    const checked = document.getElementById('select-all-plan-games-src').checked;
    planGameSelectSourceList.forEach(g => g.checked = checked);
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
}

function toggleSelectAllPlanGamesTgt() {
    const checked = document.getElementById('select-all-plan-games-tgt').checked;
    planGameSelectTargetList.forEach(g => g.checked = checked);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function transferPlanGamesToTarget() {
    const toTransfer = planGameSelectSourceList.filter(g => g.checked);
    if (!toTransfer.length) return;
    toTransfer.forEach(g => { g.checked = false; planGameSelectTargetList.push(g); });
    planGameSelectSourceList = planGameSelectSourceList.filter(g => !toTransfer.includes(g));
    document.getElementById('select-all-plan-games-src').checked = false;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function transferPlanGamesFromTarget() {
    const toTransfer = planGameSelectTargetList.filter(g => g.checked);
    if (!toTransfer.length) return;
    toTransfer.forEach(g => { g.checked = false; planGameSelectSourceList.push(g); });
    planGameSelectTargetList = planGameSelectTargetList.filter(g => !toTransfer.includes(g));
    document.getElementById('select-all-plan-games-tgt').checked = false;
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

function filterPlanGameSelectList() {
    renderPlanGameSourceList(document.getElementById('plan-game-select-search').value);
}

function filterPlanGameTargetList() {
    renderPlanGameTargetList(document.getElementById('plan-game-target-search').value);
}

async function confirmPlanGameSelect() {
    if (planGameSelectTargetList.length === 0) {
        showToast('请先选择游戏', 'warning');
        return;
    }

    // 模式1：向已有计划添加游戏（从详情页触发）
    if (addGamesToPlanIndex !== null) {
        const plan = configPlans[addGamesToPlanIndex];
        if (!plan || !plan.id) return;

        const games = planGameSelectTargetList.map(g => ({
            game_id: g.id,
            game_name: g.name,
            game_platform: g.platform || '-',
            game_type: g.gameType || '-',
            adapt_status: 'not_started',
            adapt_progress: 0
        }));

        try {
            const resp = await authFetch(`${API_BASE}/plans/${plan.id}/games`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ games })
            });
            const result = await resp.json();
            if (result.success) {
                showToast(`已添加 ${result.count} 款游戏`, 'success');
                // 重新加载计划详情
                plan.games = []; // 清空缓存强制重载
                await loadPlanDetail(plan.id);
                renderPlanDetailGames(addGamesToPlanIndex);
                // 更新卡片中的游戏数量
                await loadConfigPlans();
            } else {
                showToast('添加失败: ' + (result.error || ''), 'danger');
            }
        } catch (e) {
            showToast('添加失败，请重试', 'danger');
        }
        addGamesToPlanIndex = null;
        closePlanGameSelectModal();
        return;
    }

    // 模式2：创建计划时选择游戏（原逻辑）
    planSelectedGames = [...planSelectedGames, ...planGameSelectTargetList.map(g => ({
        id: g.id,
        name: g.name,
        platform: g.platform,
        gameType: g.gameType,
        ownerName: g.ownerName || '',
        ownerId: g.ownerId || null
    }))];
    renderPlanGameTags();
    closePlanGameSelectModal();
}


// ==============================
// 字段设置模块
// ==============================

// 字段选项缓存
let fieldOptionsCache = {};    // { field_key: { field_key, field_label, field_group, options: [...] } }
let allFieldOptions = [];       // 完整列表
let currentFieldGroup = 'all';  // 当前筛选分组

// 加载字段选项数据
async function loadFieldOptions() {
    try {
        const response = await authFetch(`${API_BASE}/field-options`);
        const result = await response.json();
        if (result.success) {
            allFieldOptions = result.data;
            // 建立缓存
            fieldOptionsCache = {};
            allFieldOptions.forEach(field => {
                fieldOptionsCache[field.field_key] = field;
            });
            renderFieldCards();
            console.log('字段选项加载成功:', allFieldOptions.length, '个字段');
        }
    } catch (error) {
        console.error('加载字段选项失败:', error);
    }
}

// 获取指定字段的选项（供其他模块使用）
function getFieldOptionsByKey(fieldKey) {
    const field = fieldOptionsCache[fieldKey];
    return field ? field.options : [];
}

// 获取选项的显示文本
function getFieldOptionLabel(fieldKey, value) {
    const options = getFieldOptionsByKey(fieldKey);
    const option = options.find(o => o.value === value);
    return option ? option.label : value;
}

// 切换字段分组
function switchFieldGroup(group) {
    currentFieldGroup = group;
    document.querySelectorAll('.field-group-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.group === group);
    });
    renderFieldCards();
}

// 渲染字段卡片
function renderFieldCards() {
    const container = document.getElementById('field-cards-container');
    if (!container) return;

    let fields = allFieldOptions;
    if (currentFieldGroup !== 'all') {
        fields = fields.filter(f => f.field_group === currentFieldGroup);
    }

    if (fields.length === 0) {
        container.innerHTML = `
            <div class="field-empty-state">
                <div class="empty-icon">⚙️</div>
                <div class="empty-text">${currentFieldGroup === 'all' ? '暂无字段选项配置' : `"${currentFieldGroup}" 分组下暂无字段`}</div>
            </div>`;
        return;
    }

    container.innerHTML = fields.map(field => {
        const optionsHtml = field.options.map((opt, idx) => `
            <span class="field-option-tag" draggable="true" 
                  ondragstart="dragFieldOption(event, '${field.field_key}', ${idx})"
                  ondragover="dragOverFieldOption(event)"
                  ondrop="dropFieldOption(event, '${field.field_key}', ${idx})"
                  ondragleave="dragLeaveFieldOption(event)">
                <span class="option-label">${escapeHtml(opt.label)}</span>
                <span class="option-value">${escapeHtml(opt.value)}</span>
                <span class="option-remove" onclick="removeFieldOption('${field.field_key}', ${idx})" title="删除此选项">×</span>
            </span>
        `).join('');

        return `
            <div class="field-card" data-field-key="${field.field_key}">
                <div class="field-card-header">
                    <div class="field-card-title">
                        <h4>${escapeHtml(field.field_label)}</h4>
                        <span class="field-key">${escapeHtml(field.field_key)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="field-card-group">${escapeHtml(field.field_group)}</span>
                        <button class="btn btn-small btn-delete" onclick="deleteFieldConfig('${field.field_key}', '${escapeHtml(field.field_label)}')" title="删除此字段">🗑</button>
                    </div>
                </div>
                <div class="field-card-body">
                    <div class="field-options-list" id="options-${field.field_key}">
                        ${optionsHtml || '<span style="color:var(--text-muted);font-size:12px;">暂无选项</span>'}
                    </div>
                    <div class="field-add-option">
                        <input type="text" id="new-opt-value-${field.field_key}" placeholder="选项值(英文)" 
                               onkeydown="if(event.key==='Enter'){event.preventDefault();addFieldOption('${field.field_key}');}">
                        <input type="text" id="new-opt-label-${field.field_key}" placeholder="显示名称(中文)" 
                               onkeydown="if(event.key==='Enter'){event.preventDefault();addFieldOption('${field.field_key}');}">
                        <button class="btn btn-small btn-primary" onclick="addFieldOption('${field.field_key}')">添加</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 添加新选项
async function addFieldOption(fieldKey) {
    const valueInput = document.getElementById(`new-opt-value-${fieldKey}`);
    const labelInput = document.getElementById(`new-opt-label-${fieldKey}`);

    const value = valueInput.value.trim();
    const label = labelInput.value.trim();

    if (!value) {
        showToast('请输入选项值', 'warning');
        valueInput.focus();
        return;
    }
    if (!label) {
        showToast('请输入显示名称', 'warning');
        labelInput.focus();
        return;
    }

    const field = fieldOptionsCache[fieldKey];
    if (!field) return;

    // 检查重复
    if (field.options.some(o => o.value === value)) {
        showToast(`选项值 "${value}" 已存在`, 'warning');
        return;
    }

    const newOptions = [...field.options, { value, label }];

    try {
        const response = await authFetch(`${API_BASE}/field-options/${encodeURIComponent(fieldKey)}`, {
            method: 'PUT',
            body: JSON.stringify({ options: newOptions })
        });
        const result = await response.json();
        if (result.success) {
            field.options = newOptions;
            valueInput.value = '';
            labelInput.value = '';
            renderFieldCards();
            refreshAllSelectsFromFieldOptions();
        } else {
            showToast('保存失败: ' + (result.error || '未知错误'), 'danger');
        }
    } catch (error) {
        showToast('保存失败: ' + error.message, 'danger');
    }
}

// 删除选项
async function removeFieldOption(fieldKey, optIndex) {
    const field = fieldOptionsCache[fieldKey];
    if (!field) return;

    const opt = field.options[optIndex];
    showConfirm(`确定要删除选项「${opt.label}」(${opt.value}) 吗？\n\n注意：已使用此选项的数据不会受影响，但后续将无法再选择此选项。`, async () => {
        const newOptions = field.options.filter((_, i) => i !== optIndex);

        try {
            const response = await authFetch(`${API_BASE}/field-options/${encodeURIComponent(fieldKey)}`, {
                method: 'PUT',
                body: JSON.stringify({ options: newOptions })
            });
            const result = await response.json();
            if (result.success) {
                field.options = newOptions;
                renderFieldCards();
                refreshAllSelectsFromFieldOptions();
            }
        } catch (error) {
            showToast('删除失败: ' + error.message, 'danger');
        }
    });
}

// 拖拽排序
let dragFieldKey = null;
let dragOptionIndex = null;

function dragFieldOption(event, fieldKey, index) {
    dragFieldKey = fieldKey;
    dragOptionIndex = index;
    event.target.closest('.field-option-tag').classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
}

function dragOverFieldOption(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.target.closest('.field-option-tag')?.classList.add('drag-over');
}

function dragLeaveFieldOption(event) {
    event.target.closest('.field-option-tag')?.classList.remove('drag-over');
}

async function dropFieldOption(event, targetFieldKey, targetIndex) {
    event.preventDefault();
    event.target.closest('.field-option-tag')?.classList.remove('drag-over');

    if (dragFieldKey !== targetFieldKey || dragOptionIndex === targetIndex) return;

    const field = fieldOptionsCache[targetFieldKey];
    if (!field) return;

    // 执行排序
    const options = [...field.options];
    const [moved] = options.splice(dragOptionIndex, 1);
    options.splice(targetIndex, 0, moved);

    try {
        const response = await authFetch(`${API_BASE}/field-options/${targetFieldKey}`, {
            method: 'PUT',
            body: JSON.stringify({ options })
        });
        const result = await response.json();
        if (result.success) {
            field.options = options;
            renderFieldCards();
        }
    } catch (error) {
        console.error('排序保存失败:', error);
    }

    dragFieldKey = null;
    dragOptionIndex = null;
}

// 新增字段弹窗
function openAddFieldModal() {
    document.getElementById('field-modal-title').textContent = '新增字段';
    document.getElementById('field-edit-key').value = '';
    document.getElementById('field-key-input').value = '';
    document.getElementById('field-key-input').disabled = false;
    document.getElementById('field-label-input').value = '';
    document.getElementById('field-group-input').value = '游戏管理';
    document.getElementById('field-modal').style.display = 'block';
}

function closeFieldModal() {
    document.getElementById('field-modal').style.display = 'none';
}

async function submitField(event) {
    event.preventDefault();

    const editKey = document.getElementById('field-edit-key').value;
    const fieldKey = document.getElementById('field-key-input').value.trim();
    const fieldLabel = document.getElementById('field-label-input').value.trim();
    const fieldGroup = document.getElementById('field-group-input').value;

    if (!fieldKey || !fieldLabel) {
        showToast('请填写完整信息', 'warning');
        return;
    }

    // 校验key格式
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldKey)) {
        showToast('字段Key只能包含英文字母、数字和下划线，且不能以数字开头', 'warning');
        return;
    }

    try {
        let response;
        if (editKey) {
            // 编辑模式 - 只更新 label 和 group
            response = await authFetch(`${API_BASE}/field-options/${editKey}`, {
                method: 'PUT',
                body: JSON.stringify({
                    field_label: fieldLabel,
                    field_group: fieldGroup,
                    options: fieldOptionsCache[editKey]?.options || []
                })
            });
        } else {
            // 新增模式
            response = await authFetch(`${API_BASE}/field-options`, {
                method: 'POST',
                body: JSON.stringify({
                    field_key: fieldKey,
                    field_label: fieldLabel,
                    field_group: fieldGroup,
                    options: [],
                    sort_order: allFieldOptions.length + 1
                })
            });
        }

        const result = await response.json();
        if (result.success) {
            closeFieldModal();
            await loadFieldOptions();
        } else {
            showToast('保存失败: ' + (result.error || '未知错误'), 'danger');
        }
    } catch (error) {
        showToast('保存失败: ' + error.message, 'danger');
    }
}

// 删除字段配置
async function deleteFieldConfig(fieldKey, fieldLabel) {
    showConfirm(`确定要删除字段「${fieldLabel}」(${fieldKey}) 及其所有选项吗？此操作不可恢复。`, async () => {
        try {
            const response = await authFetch(`${API_BASE}/field-options/${encodeURIComponent(fieldKey)}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                showToast('字段已删除', 'success');
                await loadFieldOptions();
            } else {
                showToast('删除失败: ' + (result.error || '未知错误'), 'danger');
            }
        } catch (error) {
            showToast('删除失败: ' + error.message, 'danger');
        }
    });
}

// ========== 动态选项填充工具函数 ==========

// 动态填充 select 元素的选项（基于字段设置）
function populateSelectFromFieldOptions(selectId, fieldKey, defaultValue, includeEmpty, emptyLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const options = getFieldOptionsByKey(fieldKey);
    
    // 清空现有选项
    select.innerHTML = '';
    
    // 添加空选项
    if (includeEmpty) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = emptyLabel || '请选择';
        select.appendChild(emptyOpt);
    }
    
    // 添加字段选项
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === defaultValue) option.selected = true;
        select.appendChild(option);
    });
}

// 动态填充筛选下拉框（支持从字段设置获取）
function populateFilterFromFieldOptions(selectId, fieldKey) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // 保留第一个"全部"选项
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    const options = getFieldOptionsByKey(fieldKey);
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
    });
}

// 刷新所有表单中的动态下拉框
function refreshAllSelectsFromFieldOptions() {
    // 成员管理 - 角色
    populateSelectFromFieldOptions('member-role', 'member_role', '', true, '请选择角色');
    // 成员管理 - 状态
    populateSelectFromFieldOptions('member-status', 'member_status', 'active');
    
    // 设备管理 - 状态
    populateSelectFromFieldOptions('device-status', 'device_status', 'available');
    
    // 游戏管理 - 适配状态
    populateSelectFromFieldOptions('game-adaptation-status', 'adaptation_status', 'pending');
    // 游戏管理 - 上线状态
    populateSelectFromFieldOptions('game-online-status', 'online_status', 'pending');
    // 游戏管理 - 品质
    populateSelectFromFieldOptions('game-quality', 'quality', 'normal');
    // 游戏管理 - 存储位置
    populateSelectFromFieldOptions('game-storage-location', 'storage_location', '硬盘1号');
    
    // 测试管理 - 状态
    populateSelectFromFieldOptions('test-status', 'test_status', 'pending');
    // 测试管理 - 优先级
    populateSelectFromFieldOptions('test-priority', 'test_priority', 'medium');
    
    // 缺陷管理 - 缺陷状态
    populateSelectFromFieldOptions('bug-status', 'bug_status', 'open');
    // 缺陷管理 - 优先级
    populateSelectFromFieldOptions('bug-priority', 'bug_priority', 'medium');
    
    // 筛选器 - 适配状态
    populateFilterFromFieldOptions('status-filter', 'adaptation_status');
}


// 工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// CSS 类名 sanitize：只保留字母、数字、连字符
function sanitizeCssClass(str) {
    if (!str) return '';
    return String(str).replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '');
}

// 清理字符串使其安全用作 CSS 类名（只保留字母、数字、连字符、下划线）
function safeCssClass(str) {
    if (!str) return '';
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '');
}

function getStatusText(status) {
    // 优先从字段设置读取
    const dynamic = getFieldOptionLabel('member_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'active': '活跃',
        'inactive': '非活跃',
        'archived': '已归档'
    };
    return statusMap[status] || status;
}

function getDeviceStatusText(status) {
    const dynamic = getFieldOptionLabel('device_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'available': '可用',
        'assigned': '已分配',
        'maintenance': '维护中',
        'broken': '损坏'
    };
    return statusMap[status] || status;
}

function getTestStatusText(status) {
    const dynamic = getFieldOptionLabel('test_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'pending': '待测试',
        'in_progress': '测试中',
        'completed': '已完成',
        'failed': '失败'
    };
    return statusMap[status] || status;
}

function getPriorityText(priority) {
    const dynamic = getFieldOptionLabel('test_priority', priority);
    if (dynamic !== priority) return dynamic;
    const priorityMap = {
        'low': '低',
        'medium': '中',
        'high': '高',
        'urgent': '紧急'
    };
    return priorityMap[priority] || priority;
}

function getBugStatusText(status) {
    const dynamic = getFieldOptionLabel('bug_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'open': '待处理',
        'in_progress': '处理中',
        'fixed': '已修复',
        'closed': '已关闭',
        'reopened': '重新打开'
    };
    return statusMap[status] || status;
}

function getAdaptationStatusText(status) {
    const dynamic = getFieldOptionLabel('adaptation_status', status);
    if (dynamic !== status) return dynamic;
    const statusMap = {
        'pending': '待适配',
        'in_progress': '适配中',
        'completed': '已完成',
        'failed': '失败'
    };
    return statusMap[status] || status;
}


function getSeverityText(severity) {
    const dynamic = getFieldOptionLabel('severity', severity);
    if (dynamic !== severity) return dynamic;
    const severityMap = {
        'advice': '建议',
        'prompt': '提示',
        'normal': '一般',
        'serious': '严重',
        'fatal': '致命'
    };
    return severityMap[severity] || severity;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
}

function updateSelectOptions(selectId, data, valueField, textField, defaultText) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = `<option value="">${defaultText}</option>`;
    if (data && data.length > 0) {
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueField];
            option.textContent = item[textField];
            select.appendChild(option);
        });
    }
}

// ==================== 列宽手动拖拽调节 ====================

/**
 * 获取表格的列宽存储 key（基于 table id 或 index）
 */
function _getColWidthKey(table) {
    return 'colWidths_' + (table.id || 'table_' + Array.from(document.querySelectorAll('.data-table')).indexOf(table));
}

/**
 * 从 localStorage 读取已保存的列宽配置
 */
function getSavedColWidths(table) {
    try {
        const raw = localStorage.getItem(_getColWidthKey(table));
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

/**
 * 将当前列宽保存到 localStorage（拖拽结束时调用）
 */
function saveColWidths(table) {
    const ths = table.querySelectorAll('thead th');
    const widths = [];
    ths.forEach((th, i) => {
        // 序号列和操作列也记录，保持数组位置对应
        widths.push(th.offsetWidth);
    });
    try {
        localStorage.setItem(_getColWidthKey(table), JSON.stringify(widths));
    } catch(e) { /* storage full 等异常静默忽略 */ }
}

/**
 * 为所有 .data-table 的表头单元格添加拖拽 resize 手柄。
 * 拖拽只改当前列宽度，其他列不受影响，表格总宽度可增长/缩小。
 * 列宽会自动保存到 localStorage，刷新后自动恢复。
 */
function initColumnResize() {
    document.querySelectorAll('.data-table').forEach(table => {
        // 跳过隐藏表格（offsetWidth === 0 时无法计算列宽）
        if (table.offsetWidth === 0) return;

        const ths = table.querySelectorAll('thead th');
        if (!ths.length) return;

        // 第一步：快照每列实际宽度并锁定为 px 值
        if (!table.dataset.colLocked) {
            const savedWidths = getSavedColWidths(table);
            let totalWidth = 0;

            // 写入每列的 px 宽度（优先使用保存值）
            ths.forEach((th, i) => {
                const thText = th.textContent.trim();
                if (th.classList.contains('batch-th')) {
                    th.style.width = '36px';
                    th.style.minWidth = '36px';
                    th.style.maxWidth = '36px';
                    totalWidth += 36;
                    return;
                }
                if (thText === '序号') {
                    th.style.width = '50px';
                    th.style.minWidth = '50px';
                    th.style.maxWidth = '50px';
                    totalWidth += 50;
                    return;
                }

                // ★ 优先从 localStorage 恢复，否则用当前计算宽度
                const savedW = (savedWidths && savedWidths[i]) ? savedWidths[i] : th.offsetWidth;
                const w = Math.max(40, savedW);
                th.style.width = w + 'px';
                th.style.minWidth = '40px';
                totalWidth += w;
            });

            // 用 table-layout:fixed + 精确总宽，确保浏览器严格按 px 渲染
            table.style.tableLayout = 'fixed';
            table.style.width = totalWidth + 'px';
            table.dataset.colLocked = '1';
        }

        // 第二步：给每个 th 补全拖拽手柄
        ths.forEach(th => {
            if (th.querySelector('.col-resize-handle')) return;
            if (th.classList.contains('batch-th')) return;
            if (th.textContent.trim() === '序号') return;

            const handle = document.createElement('div');
            handle.className = 'col-resize-handle';
            th.appendChild(handle);

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const startX = e.pageX;
                const startColWidth = th.offsetWidth;
                const startTableWidth = table.offsetWidth;

                handle.classList.add('resizing');
                document.body.classList.add('col-resizing');

                const onMouseMove = (moveEvt) => {
                    const delta = moveEvt.pageX - startX;
                    const newColWidth = Math.max(40, startColWidth + delta);
                    const widthChange = newColWidth - startColWidth;

                    // 只改当前列的宽度
                    th.style.width = newColWidth + 'px';
                    th.style.minWidth = newColWidth + 'px';

                    // 同步调整表格总宽度，使其他列保持不变
                    table.style.width = (startTableWidth + widthChange) + 'px';
                };

                const onMouseUp = () => {
                    handle.classList.remove('resizing');
                    document.body.classList.remove('col-resizing');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    // ★ 持久化保存列宽
                    saveColWidths(table);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    });
}

/**
 * 重置指定表格的列宽锁定（用于视图切换后重新计算）
 */
function resetColumnLock(tableOrContainer) {
    const tables = tableOrContainer.classList?.contains('data-table')
        ? [tableOrContainer]
        : tableOrContainer.querySelectorAll('.data-table');
    tables.forEach(t => {
        delete t.dataset.colLocked;
        t.style.tableLayout = '';
        t.style.width = '';
        t.querySelectorAll('thead th').forEach(th => {
            if (!th.classList.contains('batch-th') && th.textContent.trim() !== '序号') {
                th.style.width = '';
                th.style.minWidth = '';
            }
        });
        t.querySelectorAll('.col-resize-handle').forEach(h => h.remove());
    });
}

// 用 MutationObserver 自动监测表格变化，补全 resize 手柄（防抖合并）
// 当 tbody 内容变化时，需重置列宽锁定再重新初始化
let _resizeTimer = null;
const _resizeObserver = new MutationObserver((mutations) => {
    clearTimeout(_resizeTimer);
    // 检查是否有 tbody 子节点变化（数据刷新），需重置锁定
    for (const m of mutations) {
        if (m.target.tagName === 'TBODY' || (m.target.closest && m.target.closest('tbody'))) {
            const table = m.target.closest('.data-table');
            if (table && table.dataset.colLocked) {
                delete table.dataset.colLocked;
                table.style.tableLayout = '';
                table.style.width = '';
                table.querySelectorAll('thead th').forEach(th => {
                    if (!th.classList.contains('batch-th') && th.textContent.trim() !== '序号') {
                        th.style.width = '';
                        th.style.minWidth = '';
                    }
                });
                table.querySelectorAll('.col-resize-handle').forEach(h => h.remove());
            }
            break;
        }
    }
    _resizeTimer = setTimeout(initColumnResize, 80);
});

// 在 DOM 加载完成后启动 observer
document.addEventListener('DOMContentLoaded', () => {
    // 初始化一次
    setTimeout(initColumnResize, 300);

    // 监测所有 table-container 区域的子树变化
    document.querySelectorAll('.table-container, .tab-content').forEach(container => {
        _resizeObserver.observe(container, { childList: true, subtree: true });
    });
});

