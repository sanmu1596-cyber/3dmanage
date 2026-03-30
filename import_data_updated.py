import sqlite3
import json
import pandas as pd
from datetime import datetime

# 连接数据库
db_path = r'C:\Users\joesyang\WorkBuddy\20260324104822\project-management\database.sqlite'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 导入项目成员数据
print("=== 导入项目成员 ===")
with open('members_data.json', 'r', encoding='utf-8') as f:
    members_data = json.load(f)

for member in members_data:
    cursor.execute('''
        INSERT INTO members (name, wechat_id, role, duty, status)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        member.get('姓名', ''),
        member.get('企业微信ID', ''),
        member.get('角色', ''),
        member.get('职责', ''),
        'active'
    ))
print(f"已导入 {len(members_data)} 条成员记录")

# 导入设备数据
print("\n=== 导入设备 ===")
with open('devices_data.json', 'r', encoding='utf-8') as f:
    devices_data = json.load(f)

member_name_to_id = {}
cursor.execute('SELECT id, name FROM members')
for row in cursor.fetchall():
    member_name_to_id[row[1]] = row[0]

for device in devices_data:
    keeper = device.get('设备保管者', '')
    assigned_to_id = member_name_to_id.get(keeper, None) if keeper else None

    # 处理数值字段
    quantity = device.get('设备数量', 1)
    if pd.isna(quantity):
        quantity = 1
    try:
        quantity = int(quantity)
    except:
        quantity = 1

    completion_rate = device.get('适配完成率', '0%')
    if pd.isna(completion_rate) or completion_rate == '':
        completion_rate = '0%'

    total_bugs = device.get('总BUG数', 0)
    if pd.isna(total_bugs) or total_bugs == '':
        total_bugs = 0
    try:
        total_bugs = int(total_bugs)
    except:
        total_bugs = 0

    completed_adaptations = device.get('适配完成数', 0)
    if pd.isna(completed_adaptations) or completed_adaptations == '':
        completed_adaptations = 0
    try:
        completed_adaptations = int(completed_adaptations)
    except:
        completed_adaptations = 0

    total_games = device.get('适配游戏数', 0)
    if pd.isna(total_games) or total_games == '':
        total_games = 0
    try:
        total_games = int(total_games)
    except:
        total_games = 0

    cursor.execute('''
        INSERT INTO devices (manufacturer, device_type, name, requirements, quantity,
                            keeper, notes, adapter_completion_rate, total_bugs,
                            completed_adaptations, total_games, status, assigned_to)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        device.get('厂商名称', ''),
        device.get('设备类型', ''),
        device.get('设备名称', ''),
        device.get('设备需求', ''),
        quantity,
        keeper,
        device.get('备注', ''),
        str(completion_rate),
        total_bugs,
        completed_adaptations,
        total_games,
        'available',
        assigned_to_id
    ))
print(f"已导入 {len(devices_data)} 条设备记录")

# 导入游戏数据
print("\n=== 导入游戏 ===")
with open('games_data.json', 'r', encoding='utf-8') as f:
    games_data = json.load(f)

for game in games_data:
    # 处理日期字段
    release_date = game.get('游戏上线日期')
    if pd.isna(release_date) or release_date == '':
        release_date = None
    else:
        # 处理日期格式
        try:
            if isinstance(release_date, str):
                release_date = datetime.strptime(release_date, '%Y/%m/%d').strftime('%Y-%m-%d')
            elif isinstance(release_date, datetime):
                release_date = release_date.strftime('%Y-%m-%d')
        except:
            release_date = None

    # 处理适配进度
    adapter_progress = '0%'
    if pd.isna(adapter_progress) or adapter_progress == '':
        adapter_progress = '0%'

    cursor.execute('''
        INSERT INTO games (name, english_name, platform, game_id, game_type,
                          description, developer, operator, release_date,
                          config_path, adapter_progress, adaptation_status, adaptation_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        game.get('游戏名称', ''),
        game.get('英文名称', ''),
        game.get('游戏平台', ''),
        game.get('游戏ID', ''),
        game.get('游戏类型', ''),
        game.get('游戏简介', ''),
        game.get('游戏开发商', ''),
        game.get('游戏运营商', ''),
        release_date,
        game.get('配置文件路径', ''),
        adapter_progress,
        'pending',
        game.get('适配备注', '')
    ))
print(f"已导入 {len(games_data)} 条游戏记录")

# 导入缺陷数据
print("\n=== 导入缺陷 ===")
with open('bugs_data.json', 'r', encoding='utf-8') as f:
    bugs_data = json.load(f)

# 建立设备名称到ID的映射
device_name_to_id = {}
cursor.execute('SELECT id, name FROM devices')
for row in cursor.fetchall():
    device_name_to_id[row[1]] = row[0]

# 建立负责人到ID的映射
owner_name_to_id = member_name_to_id

for bug in bugs_data:
    # 处理日期字段
    discovery_time = bug.get('发现时间')
    if pd.isna(discovery_time) or discovery_time == '':
        discovery_time = None
    else:
        try:
            if isinstance(discovery_time, str):
                discovery_time = datetime.strptime(discovery_time, '%Y/%m/%d').strftime('%Y-%m-%d')
            elif isinstance(discovery_time, datetime):
                discovery_time = discovery_time.strftime('%Y-%m-%d')
        except:
            discovery_time = None

    planned_fix_time = bug.get('计划修复时间')
    if pd.isna(planned_fix_time) or planned_fix_time == '':
        planned_fix_time = None
    else:
        try:
            if isinstance(planned_fix_time, str):
                planned_fix_time = datetime.strptime(planned_fix_time, '%Y/%m/%d').strftime('%Y-%m-%d')
            elif isinstance(planned_fix_time, datetime):
                planned_fix_time = planned_fix_time.strftime('%Y-%m-%d')
        except:
            planned_fix_time = None

    actual_fix_time = bug.get('实际修复时间')
    if pd.isna(actual_fix_time) or actual_fix_time == '':
        actual_fix_time = None
    else:
        try:
            if isinstance(actual_fix_time, str):
                actual_fix_time = datetime.strptime(actual_fix_time, '%Y/%m/%d').strftime('%Y-%m-%d')
            elif isinstance(actual_fix_time, datetime):
                actual_fix_time = actual_fix_time.strftime('%Y-%m-%d')
        except:
            actual_fix_time = None

    # 处理缺陷状态
    bug_status = bug.get('缺陷状态', '')
    if bug_status == '已关闭':
        status = 'closed'
    elif bug_status == '已修复':
        status = 'fixed'
    elif bug_status == '待处理':
        status = 'open'
    elif bug_status == '处理中':
        status = 'in_progress'
    else:
        status = 'open'

    # 处理优先级
    priority = bug.get('优先级', '中')
    if priority == '高':
        priority = 'high'
    elif priority == '中':
        priority = 'medium'
    elif priority == '低':
        priority = 'low'
    else:
        priority = 'medium'

    # 获取负责人ID
    owner = bug.get('负责人', '')
    assignee_id = owner_name_to_id.get(owner, None) if owner else None

    cursor.execute('''
        INSERT INTO bugs (versions, actual_fix_time, planned_fix_time, device_name,
                        discovery_time, owner, bug_status, priority, problem_type,
                        description, steps, test_id, assignee_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        bug.get('涉及版本', ''),
        actual_fix_time,
        planned_fix_time,
        bug.get('设备名称', ''),
        discovery_time,
        owner,
        bug_status,
        priority,
        bug.get('问题类型', ''),
        bug.get('问题描述', ''),
        '',
        None,
        assignee_id
    ))
print(f"已导入 {len(bugs_data)} 条缺陷记录")

# 提交事务
conn.commit()
print("\n=== 数据导入完成 ===")

# 查询导入结果
cursor.execute('SELECT COUNT(*) FROM members')
print(f"成员总数: {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM devices')
print(f"设备总数: {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM games')
print(f"游戏总数: {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM bugs')
print(f"缺陷总数: {cursor.fetchone()[0]}")

# 关闭连接
conn.close()
