import urllib.request
import urllib.error
import json
import sqlite3
import time
import sys

# 设置输出编码为UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# Steam API基础URL
STEAM_API_URL = "https://store.steampowered.com/api/appdetails?appids={app_id}&cc=cn&l=schinese"

# 数据库路径
DB_PATH = r'C:\Users\joesyang\WorkBuddy\20260324104822\project-management\database.sqlite'

def get_steam_release_date(app_id):
    """通过Steam API获取游戏上线日期"""
    try:
        url = STEAM_API_URL.format(app_id=app_id)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))

            if str(app_id) in data and data[str(app_id)]['success']:
                game_data = data[str(app_id)]['data']
                release_date = game_data.get('release_date', {}).get('date', '')
                return release_date
    except Exception as e:
        print(f"获取AppID {app_id} 失败: {e}")
    return None

def update_game_release_date(db_path, game_id, release_date):
    """更新游戏的上线日期"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE games
        SET release_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (release_date, game_id))
    conn.commit()
    conn.close()

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 获取所有STEAM平台上没有上线日期的游戏
    cursor.execute('''
        SELECT id, name, game_id, platform
        FROM games
        WHERE platform = 'STEAM'
        AND (release_date IS NULL OR release_date = '')
        AND game_id IS NOT NULL AND game_id != ''
    ''')

    games = cursor.fetchall()
    conn.close()

    print(f"找到 {len(games)} 个游戏需要查询上线日期\n")

    success_count = 0
    fail_count = 0

    for game in games:
        game_id, name, steam_app_id, platform = game
        print(f"查询: {name} (AppID: {steam_app_id})...")

        release_date = get_steam_release_date(steam_app_id)

        if release_date:
            print(f"  -> 上线日期: {release_date}")
            update_game_release_date(DB_PATH, game_id, release_date)
            success_count += 1
        else:
            print(f"  -> 查询失败")
            fail_count += 1

        # 避免请求过快
        time.sleep(0.5)

    print(f"\n完成! 成功: {success_count}, 失败: {fail_count}")

if __name__ == "__main__":
    main()
