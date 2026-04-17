/**
 * 迁移脚本：批量填充游戏引擎数据
 * 运行方式：node migration_fill_game_engine.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

// 游戏引擎映射表 (id → engine)
const engineData = {
  1:  'Unreal Engine 4',         // 皇牌空战7
  2:  'AnvilNext 2.0',           // 刺客信条 奥德赛
  3:  'AnvilNext 2.0',           // 刺客信条 英灵殿
  4:  'Divinity 4.0',            // 博德之门 3
  5:  'Decima',                  // 死亡搁浅 导演剪辑版
  6:  'Blizzard Engine',         // 暗黑破坏神 IV
  7:  'C-Engine',                // 消逝的光芒2
  8:  'KOEI Warrior Engine',     // 真三国无双8
  9:  'Unreal Engine 4',         // 霍格沃茨之遗
  10: 'Unity',                   // 茧中蚕 Hollow Cocoon
  11: 'AnvilNext 2.0',           // 渡神纪 芬尼斯崛起
  12: 'Unity',                   // 最后纪元 Last Epoch
  13: 'Unreal Engine 5',         // 幻兽帕鲁
  14: 'FromSoftware Engine',     // 只狼：影逝二度
  15: 'Foundation Engine',       // 古墓丽影：暗影
  16: 'Creation Engine',         // 上古卷轴5
  17: 'Asura Engine',            // 奇异小队 Strange Brigade
  18: 'Unity',                   // 深海迷航
  19: 'REDengine 3',             // 巫师3：狂猎
  20: 'Unity',                   // 仙剑奇侠传七
  21: 'Unreal Engine 5',         // 黑神话：悟空
  22: 'Unreal Engine 5',         // 黑神话：悟空 (duplicate)
  23: 'Unreal Engine 4',         // 狂野飙车：竞速传奇
  24: 'Asura Engine',            // 狙击精英4
  25: 'Unreal Engine 4',         // 碧波之下 Under The Waves
  26: 'Unreal Engine 4',         // 收获日3
  27: 'Creation Engine',         // 辐射4
  28: 'Frostbite',               // 极品飞车：宿敌
  29: 'Insomniac Engine',        // 漫威蜘蛛侠重制版
  30: 'Creation Engine 2',       // 星空 Starfield
  31: 'Unreal Engine 4',         // Kena：精神之桥
  32: 'FromSoftware Engine',     // 机战佣兵VI
  33: 'Unreal Engine 4',         // 死亡回归 Returnal
  34: 'Naughty Dog Engine',      // UNCHARTED 盗贼传奇合辑
  35: 'Frostbite',               // 镜之边缘 Catalyst
  36: 'LithTech',                // 中土世界：战争之影
  37: 'Unreal Engine 3',         // 不义联盟2
  38: 'Unreal Engine 4',         // 匹诺曹的谎言
  39: 'Asura Engine',            // 僵尸部队4
  40: 'RE Engine',               // 怪物猎人：崛起
  41: 'Unreal Engine 4',         // 食人鲨 Maneater
  42: 'Unity',                   // 森林之子
  43: 'Creation Engine',         // 辐射76
  44: 'Unity',                   // 链在一起 Chained Together
  45: 'Unreal Engine 4',         // 暗喻幻想 ReFantazio
  46: 'Unreal Engine 4',         // 小小梦魇2
  47: 'Unreal Engine 4',         // 原子之心
  48: 'Custom (Frozenbyte)',     // 三位一体5
  49: 'FromSoftware Engine',     // 艾尔登法环
  50: 'Unreal Engine 4',         // 高能人生 High On Life
  51: 'Unity',                   // 永劫无间
  52: 'Custom',                  // 流放之路
  53: 'Custom',                  // 流亡黯道
  54: 'Unreal Engine 3',         // 剑灵
  55: 'Unreal Engine 3',         // 逆战
  56: 'Unreal Engine 4',         // 暗区突围：无限
  57: 'Unreal Engine 4',         // 暗区突围：无限 (dup)
  58: 'Unreal Engine 4',         // 暗区突围：无限 (dup)
  59: 'Unreal Engine 4',         // 无畏契约 VALORANT
  60: 'Evolution Engine',        // 铁甲雄兵
  61: 'Dagor Engine',            // 创世战车 CrossOut
  62: 'Custom (2K)',             // NBA2KOL2
  63: 'Custom (ArenaNet)',       // 激战2
  64: 'Custom (Blizzard)',       // 魔兽世界
  65: 'Custom',                  // 流放之路2
  66: 'CryEngine',               // 装甲战争
  67: 'Unity',                   // 嗜血印
  68: 'Unreal Engine 4',         // 无主之地3
  69: 'Unreal Engine 4',         // 卡拉彼丘
  70: 'Source 2',                // 反恐精英2
  71: 'REDengine 4',             // 赛博朋克 2077
  72: 'FromSoftware Engine',     // 黑暗之魂3
  73: 'Custom (Eagle Dynamics)', // DCS World
  74: 'Frostbite',               // 死亡空间 (2023)
  75: 'Unreal Engine 5',         // 三角洲行动 Delta Force
  76: 'Unreal Engine 5',         // 三角洲行动 (dup)
  77: 'Decima',                  // 底特律：化身为人
  78: 'RE Engine',               // 鬼泣5
  79: 'RE Engine',               // 龙之信条2
  80: 'ForzaTech',               // 极限竞速：地平线5
  81: 'Sucker Punch Engine',     // Ghost of Tsushima
  82: 'Santa Monica Engine',     // 战神4
  83: 'Cygames Engine',          // 碧蓝幻想 Relink
  84: 'EGO Engine',              // GRID (2019)
  85: 'Decima',                  // 地狱潜兵2
  86: 'RE Engine',               // 完美音浪 Hi-Fi RUSH (id Tech based at Tango)
  87: 'Custom (Riot)',           // 英雄联盟
  88: 'NTT Engine',              // 乐高星战
  89: 'Unreal Engine 3',         // 命运方舟
  90: 'Frostbite',               // 微软模拟飞行 (Asobo custom)
  91: 'MT Framework',            // 怪物猎人：世界
  92: 'QuickSilver',             // 天涯明月刀
  93: 'Custom (2K)',             // NBA 2K23
  94: 'Platinum Engine',         // 尼尔：机械纪元
  95: 'Custom (Hello Games)',    // 无人深空
  96: 'Unreal Engine 4',         // 七日世界 Once Human
  97: 'Unity',                   // 猛兽派对 Party Animals
  98: 'Unreal Engine 4',         // 女神异闻录5 战略版
  99: 'Unreal Engine 4',         // 冲就完事模拟器 PowerWash Simulator
  100: 'PhysX Engine',           // QQ飞车端游
  101: 'Insomniac Engine',       // 瑞奇与叮当
  102: 'RAGE',                   // 荒野大镖客2
  103: 'Unreal Engine 4',        // 遗迹：灰烬重生
  104: 'RE Engine',              // 生化危机4
  105: 'Unreal Engine 4',        // 星球大战 绝地
  106: 'Naughty Dog Engine',     // 最后生还者 1
  107: 'Snowdrop',               // 全境封锁2
  108: 'Source',                  // 泰坦陨落2
  109: 'Custom',                 // 流放之路：降临
  110: null                      // 测试游戏（跳过）
};

console.log('开始批量填充游戏引擎数据...');

const stmt = db.prepare('UPDATE games SET game_engine = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
let count = 0;
let errors = 0;

db.serialize(() => {
  for (const [id, engine] of Object.entries(engineData)) {
    if (engine === null) continue;
    stmt.run([engine, parseInt(id)], function(err) {
      if (err) {
        console.error(`  ✗ ID ${id}: ${err.message}`);
        errors++;
      } else {
        count++;
      }
    });
  }
  stmt.finalize(() => {
    console.log(`\n✓ 完成：更新 ${count} 款游戏的引擎数据，${errors} 个错误`);
    db.close(() => console.log('数据库已关闭。'));
  });
});
