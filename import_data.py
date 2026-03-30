import sqlite3
import json

# 连接数据库
db_path = r'C:\Users\joesyang\WorkBuddy\20260324104822\project-management\database.sqlite'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 读取JSON数据
with open('members_data.json', 'r', encoding='utf-8') as f:
    members_data = json.load(f)

with open('devices_data.json', 'r', encoding='utf-8') as f:
    devices_data = json.load(f)

with open('games_data.json', 'r', encoding='utf-8') as f:
    games_data = json.load(f)

with open('bugs_data.json', 'r', encoding='utf-8') as f:
    bugs_data = json.load(f)

# 导入项目成员数据
print("=== 导入项目成员 ===")
for member in members_data:
    cursor.execute('''
        INSERT INTO members (name, role, department, phone, email, status)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        member.get('姓名', ''),
        member.get('角色', ''),
        member.get('职责', ''),
        member.get('企业微信ID', ''),
        '',
        'active'
    ))
print(f"已导入 {len(members_data)} 条成员记录")

# 导入设备数据
print("\n=== 导入设备 ===")
member_name_to_id = {}
cursor.execute('SELECT id, name FROM members')
for row in cursor.fetchall():
    member_name_to_id[row[1]] = row[0]

for device in devices_data:
    keeper = device.get('设备保管者', '')
    assigned_to_id = member_name_to_id.get(keeper, None) if keeper else None
    
    cursor.execute('''
        INSERT INTO devices (name, type, model, serial_number, status, assigned_to, location)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        device.get('设备名称', ''),
        device.get('设备类型', ''),
        device.get('设备需求', ''),
        device.get('厂商名称', ''),
        'available',
        assigned_to_id,
        device.get('备注', '')
    ))
print(f"已导入 {len(devices_data)} 条设备记录")

# 导入游戏数据
print("\n=== 导入游戏 ===")
for game in games_data:
    cursor.execute('''
        INSERT INTO games (name, game_type, adaptation_progress, version, developer, package_size, adaptation_status, adaptation_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        game.get('游戏名称', ''),
        game.get('游戏类型', ''),
        '0%',
        game.get('游戏平台', ''),
        game.get('游戏开发商', ''),
        '',
        'pending',
        game.get('游戏简介', '')
    ))
print(f"已导入 {len(games_data)} 条游戏记录")

# 导入缺陷数据
print("\n=== 导入缺陷 ===")
for bug in bugs_data:
    cursor.execute('''
        INSERT INTO bugs (test_id, title, severity, status, description, steps, assignee_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        None,  # test_id 先设为None
        bug.get('问题描述', ''),
        bug.get('优先级', 'medium').lower(),
        'open' if bug.get('缺陷状态', '') == '待处理' else 'in_progress',
        bug.get('问题类型', ''),
        '',
        None  # assignee_id
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
