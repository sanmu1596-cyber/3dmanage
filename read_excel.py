import pandas as pd
import json
import sys

# 设置输出编码为UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# 读取Excel文件
file_path = r'C:\Users\joesyang\Downloads\裸眼3D游戏适配项目管理 (1).xlsx'
xlsx = pd.ExcelFile(file_path)

print("=== 工作表列表 ===")
print(xlsx.sheet_names)
print("\n")

# 项目成员列表
print("=== 项目成员列表字段 ===")
members_df = pd.read_excel(file_path, sheet_name='项目成员列表')
print(json.dumps(members_df.columns.tolist(), ensure_ascii=False, indent=2))
with open('members_data.json', 'w', encoding='utf-8') as f:
    json.dump(members_df.to_dict('records'), f, ensure_ascii=False, indent=2)
print(f"\n项目成员记录数: {len(members_df)}\n")

# 设备列表
print("=== 设备列表字段 ===")
devices_df = pd.read_excel(file_path, sheet_name='设备列表')
print(json.dumps(devices_df.columns.tolist(), ensure_ascii=False, indent=2))
with open('devices_data.json', 'w', encoding='utf-8') as f:
    json.dump(devices_df.to_dict('records'), f, ensure_ascii=False, indent=2)
print(f"\n设备记录数: {len(devices_df)}\n")

# 游戏列表
print("=== 游戏列表字段 ===")
games_df = pd.read_excel(file_path, sheet_name='游戏列表')
print(json.dumps(games_df.columns.tolist(), ensure_ascii=False, indent=2))
with open('games_data.json', 'w', encoding='utf-8') as f:
    json.dump(games_df.to_dict('records'), f, ensure_ascii=False, indent=2)
print(f"\n游戏记录数: {len(games_df)}\n")

# 缺陷列表
print("=== 缺陷列表字段 ===")
bugs_df = pd.read_excel(file_path, sheet_name='缺陷列表')
print(json.dumps(bugs_df.columns.tolist(), ensure_ascii=False, indent=2))
with open('bugs_data.json', 'w', encoding='utf-8') as f:
    json.dump(bugs_df.to_dict('records'), f, ensure_ascii=False, indent=2)
print(f"\n缺陷记录数: {len(bugs_df)}\n")
