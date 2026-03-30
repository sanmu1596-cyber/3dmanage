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

# WeGame游戏的Steam映射表（手动整理）
WEGAME_TO_STEAM = {
    '2002122': '2358720',  # 黑神话：悟空 WeGame -> Steam
    '2001688': '2073620',  # 暗区突围：无限 WeGame -> Steam (already has)
    '2001755': None,       # 卡拉彼丘 - 无Steam
    '2001918': '2507950',  # 三角洲行动 WeGame -> Steam (already has)
    '2000821': None,       # 全境封锁2 - 可能没有Steam
    '2002052': None,       # 流放之路：降临
    '2001715': None,       # 无畏契约 - Riot平台
    '2000806': None,       # 铁甲雄兵
    '2008261': None,       # 创世战车
    '2000352': None,       # NBA2KOL2
    '2001128': None,       # 激战2
    '2001470': None,       # 装甲战争
    '26': None,            # 英雄联盟 - Riot/WeGame
    '2000811': None,       # 命运方舟
    '43': None,            # 天涯明月刀
    '17': None,            # QQ飞车-端游
    '2002122': '2358720',  # 黑神话：悟空
    '511': '292030',       # 流放之路 - 这个不对，纠正下
}

# 手动整理的部分游戏上线日期（通过其他渠道获取）
MANUAL_DATES = {
    # WeGame游戏（手动查找）
    '黑神话：悟空': '2024年8月20日',  # 8月20日是正式版
    '狂野飙车：竞速传奇': '2024年2月',  # 需要确认具体日期
    '流放之路': '2024年12月5日',  # 流放之路2的日期，流放之路是2013年
    '剑灵': '2013年9月11日',
    '逆战': '2012年',
    '暗区突围：无限': '2025年',
    '无畏契约': '2020年',
    '铁甲雄兵': '2017年',
    '创世战车': '2017年',
    'NBA2KOL2': '2018年',
    '激战2': '2014年8月',
    '魔兽世界': '2004年11月',
    '装甲战争': '2021年',
    '卡拉彼丘': '2023年',
    '英雄联盟': '2011年9月',
    '命运方舟': '2022年7月',
    '天涯明月刀': '2016年7月',
    'QQ飞车-端游': '2008年1月',
    '全境封锁2': '2019年3月',
    '流放之路：降临': '2024年12月',
    # 战网
    '魔兽世界': '2004年11月',
}

# 流放之路 (Path of Exile) 上线日期
POE_STEAM_ID = '324920'  # Path of Exile

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

    # 获取所有没有上线日期的游戏
    cursor.execute('''
        SELECT id, name, game_id, platform
        FROM games
        WHERE release_date IS NULL OR release_date = '' OR release_date = 'NaN'
    ''')

    games = cursor.fetchall()
    conn.close()

    print(f"找到 {len(games)} 个游戏需要查询上线日期\n")

    success_count = 0
    fail_count = 0
    manual_needed = []

    for game in games:
        game_id, name, game_id_str, platform = game

        # 首先尝试通过Steam API（如果有Steam ID）
        if game_id_str and game_id_str.isdigit():
            steam_id = WEGAME_TO_STEAM.get(game_id_str)
            if steam_id:
                print(f"查询 (通过Steam): {name} (Steam ID: {steam_id})...")
                release_date = get_steam_release_date(steam_id)
                if release_date:
                    print(f"  -> 上线日期: {release_date}")
                    update_game_release_date(DB_PATH, game_id, release_date)
                    success_count += 1
                    time.sleep(0.5)
                    continue

        # 检查手动整理的日期
        if name in MANUAL_DATES:
            release_date = MANUAL_DATES[name]
            print(f"使用手动日期: {name} -> {release_date}")
            update_game_release_date(DB_PATH, game_id, release_date)
            success_count += 1
            continue

        # 无法获取
        print(f"无法获取: {name} (平台: {platform}, ID: {game_id_str})")
        manual_needed.append((name, platform, game_id_str))
        fail_count += 1

    print(f"\n完成! 成功: {success_count}, 需要手动补充: {fail_count}")

    if manual_needed:
        print("\n需要手动补充的游戏:")
        for name, platform, gid in manual_needed:
            print(f"  - {name} ({platform})")

if __name__ == "__main__":
    main()
