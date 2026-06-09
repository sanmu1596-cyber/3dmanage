-- =============================================
-- hook开发状态 值迁移脚本
-- 将旧值统一迁移为新值体系，默认改为'开发中'(developing)
-- 执行方式: sqlite3 database.sqlite < migrate_hook_status.sql
-- 或在 sqlite3 命令行中直接粘贴执行
-- =============================================

-- 旧值 → 新值映射
UPDATE games SET online_status = 'developing' WHERE online_status = 'pending';      -- 待上线 → 开发中
UPDATE games SET online_status = 'developing' WHERE online_status = 'pending_dev';  -- 自定义值 → 开发中
UPDATE games SET online_status = 'developing' WHERE online_status = 'online';       -- 已上线 → 开发中
UPDATE games SET online_status = 'developing' WHERE online_status = '' OR online_status IS NULL;  -- 空值 → 开发中

-- 验证结果
SELECT online_status as status_value, COUNT(*) as count FROM games GROUP BY online_status ORDER BY count DESC;
