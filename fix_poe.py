import urllib.request
import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

STEAM_API_URL = "https://store.steampowered.com/api/appdetails?appids={app_id}&cc=cn&l=schinese"
DB_PATH = r'C:\Users\joesyang\WorkBuddy\20260324104822\project-management\database.sqlite'

def get_steam_release_date(app_id):
    try:
        url = STEAM_API_URL.format(app_id=app_id)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            if str(app_id) in data and data[str(app_id)]['success']:
                return data[str(app_id)]['data'].get('release_date', {}).get('date', '')
    except Exception as e:
        print(f"Error: {e}")
    return None

def update_game_release_date(game_id, release_date):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE games
        SET release_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (release_date, game_id))
    conn.commit()
    conn.close()

# 流亡黯道 (Path of Exile) 的Steam ID是324920
poe_steam_id = '324920'
print(f"查询流亡黯道 (Steam ID: {poe_steam_id})...")
release_date = get_steam_release_date(poe_steam_id)
if release_date:
    print(f"上线日期: {release_date}")
    # 找到流亡黯道的游戏ID
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM games WHERE name LIKE '%流亡黯道%'")
    row = cursor.fetchone()
    conn.close()
    if row:
        update_game_release_date(row[0], release_date)
        print(f"已更新游戏ID {row[0]} 的上线日期")
else:
    print("查询失败")

# 流放之路2 (Path of Exile 2) - 还没有正式上线
print("\n流放之路2 (Path of Exile 2) 尚未正式发布")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("SELECT id FROM games WHERE name LIKE '%流放之路2%'")
row = cursor.fetchone()
if row:
    update_game_release_date(row[0], '2024年12月6日')  # Path of Exile 2 announced for Dec 6, 2024
    print(f"已更新游戏ID {row[0]} 的上线日期为预计日期")
conn.close()
