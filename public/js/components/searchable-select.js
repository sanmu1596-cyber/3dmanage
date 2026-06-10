/**
 * SearchableSelect — 可搜索下拉选择器组件
 *
 * 学习 TAPD / Element Plus 风格的可筛选 select。
 * 适用于游戏选择、成员选择、设备选择等所有需要从大量选项中搜索的场景。
 *
 * ============================================================
 * 用法 1: 字符串数组
 * ============================================================
 * HTML:
 *   <div class="searchable-select" id="my-wrap">
 *     <input class="searchable-select-input" id="my-input" placeholder="搜索...">
 *     <span class="searchable-select-arrow">▾</span>
 *     <div class="searchable-select-dropdown" id="my-dropdown"></div>
 *     <input type="hidden" id="my">
 *   </div>
 *
 * JS:
 *   SearchableSelect.init('my', ['Palworld', 'Cyberpunk 2077', 'GTA V'], '');
 *   // 之后可通过 document.getElementById('my').value 拿到选中值
 *
 * ============================================================
 * 用法 2: 对象数组（推荐 — 解耦显示与值）
 * ============================================================
 *   SearchableSelect.init('my', [
 *     { value: 1, label: 'Palworld', sub: 'Steam | RPG' },
 *     { value: 2, label: 'Cyberpunk 2077', sub: 'PS5 | RPG' }
 *   ], 1);
 *
 *   // hidden.value = 1（数字ID），但显示 label
 *
 * ============================================================
 * 用法 3: 监听变化
 * ============================================================
 *   SearchableSelect.init('my', items, '', {
 *     onChange: (value, item) => {
 *       console.log('选中', value, item);
 *     },
 *     onClear: () => console.log('已清空')
 *   });
 *
 * ============================================================
 * 用法 4: 自动构建 HTML（无需手写容器）
 * ============================================================
 *   SearchableSelect.create({
 *     containerId: 'parent-div',     // 父容器
 *     name: 'gameId',                // 隐藏域 name
 *     placeholder: '选择游戏...',
 *     items: gameList,
 *     value: '',
 *     allowClear: true,              // 显示清空按钮
 *     onChange: (v, i) => {}
 *   });
 *
 * ============================================================
 * API
 * ============================================================
 *   SearchableSelect.init(baseId, items, value, options?)  → 初始化已有DOM
 *   SearchableSelect.create(config)                        → 创建并插入
 *   SearchableSelect.update(baseId, items)                 → 更新选项数据
 *   SearchableSelect.setValue(baseId, value)               → 程序设值
 *   SearchableSelect.getValue(baseId)                      → 读当前值
 *   SearchableSelect.destroy(baseId)                       → 解绑事件
 *
 * @author 大神 for 乔老师
 * @since 2026-06-10
 */

(function (global) {
    'use strict';

    // 内部存储：每个组件的状态
    const _instances = {};

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    /**
     * 规范化 items —— 统一为 [{value, label, sub}] 格式
     */
    function normalizeItems(items) {
        if (!Array.isArray(items)) return [];
        return items.map(it => {
            if (it == null) return null;
            if (typeof it === 'string' || typeof it === 'number') {
                return { value: it, label: String(it), sub: '' };
            }
            // 对象：兼容 {value/id, label/name/title, sub/desc}
            return {
                value: it.value !== undefined ? it.value : (it.id !== undefined ? it.id : it.label || it.name || ''),
                label: it.label !== undefined ? it.label : (it.name || it.title || String(it.value || '')),
                sub: it.sub || it.desc || ''
            };
        }).filter(Boolean);
    }

    /**
     * 创建容器 DOM（用于 SearchableSelect.create）
     */
    function buildDom(config) {
        const baseId = config.id || ('ssel-' + Math.random().toString(36).slice(2, 8));
        const wrap = document.createElement('div');
        wrap.className = 'searchable-select';
        wrap.id = baseId + '-wrap';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'searchable-select-input';
        input.id = baseId + '-input';
        input.placeholder = config.placeholder || '搜索...';
        input.autocomplete = 'off';
        if (config.required) input.required = true;

        const arrow = document.createElement('span');
        arrow.className = 'searchable-select-arrow';
        arrow.textContent = '▾';

        const dropdown = document.createElement('div');
        dropdown.className = 'searchable-select-dropdown';
        dropdown.id = baseId + '-dropdown';

        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id = baseId;
        if (config.name) hidden.name = config.name;

        wrap.appendChild(input);
        wrap.appendChild(arrow);
        wrap.appendChild(dropdown);
        wrap.appendChild(hidden);

        // 清空按钮（可选）
        if (config.allowClear) {
            const clearBtn = document.createElement('span');
            clearBtn.className = 'searchable-select-clear';
            clearBtn.innerHTML = '✕';
            clearBtn.title = '清空';
            wrap.appendChild(clearBtn);
        }

        return { wrap, baseId };
    }

    /**
     * 初始化已有 DOM
     */
    function init(baseId, items, currentValue, options) {
        options = options || {};
        const wrap = document.getElementById(baseId + '-wrap');
        const input = document.getElementById(baseId + '-input');
        const dropdown = document.getElementById(baseId + '-dropdown');
        const hidden = document.getElementById(baseId);
        if (!wrap || !input || !dropdown || !hidden) {
            console.warn('[SearchableSelect] 找不到容器:', baseId);
            return;
        }

        const normalized = normalizeItems(items);

        // 复用已有实例
        let inst = _instances[baseId];
        if (inst) {
            inst.items = normalized;
            inst.options = Object.assign(inst.options || {}, options);
            setValue(baseId, currentValue == null ? hidden.value : currentValue);
            return inst;
        }

        // 新建实例
        inst = {
            baseId,
            wrap, input, dropdown, hidden,
            items: normalized,
            options,
            highlightIdx: -1,
            handlers: {}
        };
        _instances[baseId] = inst;

        // 渲染下拉
        inst.render = function () {
            const q = (input.value || '').trim().toLowerCase();
            const all = inst.items;
            // 过滤：value/label/sub 任一包含关键字
            const filtered = q ? all.filter(it =>
                String(it.label).toLowerCase().includes(q) ||
                String(it.sub).toLowerCase().includes(q) ||
                String(it.value).toLowerCase().includes(q)
            ) : all;
            inst.highlightIdx = -1;

            if (filtered.length === 0) {
                dropdown.innerHTML = `<div class="searchable-select-empty">${q ? `未找到「${escapeHtml(q)}」` : '暂无可选项'}</div>`;
                return;
            }
            dropdown.innerHTML = filtered.map((it, i) => {
                let display = escapeHtml(it.label);
                let subDisplay = it.sub ? `<span class="ssel-sub">${escapeHtml(it.sub)}</span>` : '';
                if (q) {
                    const lower = String(it.label).toLowerCase();
                    const idx = lower.indexOf(q);
                    if (idx >= 0) {
                        display = escapeHtml(String(it.label).slice(0, idx))
                            + '<mark>' + escapeHtml(String(it.label).slice(idx, idx + q.length)) + '</mark>'
                            + escapeHtml(String(it.label).slice(idx + q.length));
                    }
                }
                const sel = String(it.value) === String(hidden.value) ? ' selected' : '';
                return `<div class="searchable-select-option${sel}" data-value="${escapeHtml(it.value)}" data-idx="${i}">${display}${subDisplay}</div>`;
            }).join('');
        };

        // 选中
        inst.select = function (val) {
            const item = inst.items.find(x => String(x.value) === String(val));
            hidden.value = item ? item.value : '';
            input.value = item ? item.label : '';
            wrap.classList.remove('open');
            // 触发原生 change（兼容表单序列化和监听）
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof inst.options.onChange === 'function') {
                inst.options.onChange(hidden.value, item || null);
            }
        };

        // 清空
        inst.clear = function () {
            hidden.value = '';
            input.value = '';
            inst.render();
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof inst.options.onClear === 'function') inst.options.onClear();
        };

        // 打开
        const open = () => {
            wrap.classList.add('open');
            inst.render();
            requestAnimationFrame(() => {
                const sel = dropdown.querySelector('.searchable-select-option.selected');
                if (sel) sel.scrollIntoView({ block: 'nearest' });
            });
        };
        inst.handlers.focus = open;
        inst.handlers.click = open;
        input.addEventListener('focus', inst.handlers.focus);
        input.addEventListener('click', inst.handlers.click);

        // 输入
        inst.handlers.input = () => {
            wrap.classList.add('open');
            inst.render();
        };
        input.addEventListener('input', inst.handlers.input);

        // 键盘
        inst.handlers.keydown = (e) => {
            const opts = dropdown.querySelectorAll('.searchable-select-option');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!wrap.classList.contains('open')) { open(); return; }
                inst.highlightIdx = Math.min(inst.highlightIdx + 1, opts.length - 1);
                opts.forEach((o, i) => o.classList.toggle('highlighted', i === inst.highlightIdx));
                opts[inst.highlightIdx]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                inst.highlightIdx = Math.max(inst.highlightIdx - 1, 0);
                opts.forEach((o, i) => o.classList.toggle('highlighted', i === inst.highlightIdx));
                opts[inst.highlightIdx]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (inst.highlightIdx >= 0 && opts[inst.highlightIdx]) {
                    inst.select(opts[inst.highlightIdx].dataset.value);
                } else if (opts.length === 1) {
                    inst.select(opts[0].dataset.value);
                }
            } else if (e.key === 'Escape') {
                wrap.classList.remove('open');
                input.blur();
            }
        };
        input.addEventListener('keydown', inst.handlers.keydown);

        // 点选项
        inst.handlers.dropdownDown = (e) => {
            const opt = e.target.closest('.searchable-select-option');
            if (!opt) return;
            e.preventDefault();
            inst.select(opt.dataset.value);
        };
        dropdown.addEventListener('mousedown', inst.handlers.dropdownDown);

        // 清空按钮
        const clearBtn = wrap.querySelector('.searchable-select-clear');
        if (clearBtn) {
            inst.handlers.clear = (e) => {
                e.preventDefault();
                e.stopPropagation();
                inst.clear();
            };
            clearBtn.addEventListener('mousedown', inst.handlers.clear);
        }

        // 点外部关闭
        inst.handlers.docDown = (e) => {
            if (!wrap.contains(e.target)) {
                wrap.classList.remove('open');
                // 失焦时如果input值不在 items 中且不为空，恢复为当前 hidden 值的 label
                if (input.value) {
                    const matchedItem = inst.items.find(it => String(it.label) === input.value);
                    if (!matchedItem) {
                        const cur = inst.items.find(it => String(it.value) === String(hidden.value));
                        input.value = cur ? cur.label : '';
                    }
                }
            }
        };
        document.addEventListener('mousedown', inst.handlers.docDown);

        // 设置初始值
        setValue(baseId, currentValue);
        return inst;
    }

    /**
     * 自动建 DOM 并初始化
     */
    function create(config) {
        const container = typeof config.containerId === 'string'
            ? document.getElementById(config.containerId)
            : config.container;
        if (!container) {
            console.warn('[SearchableSelect.create] 找不到 container');
            return null;
        }
        const { wrap, baseId } = buildDom(config);
        container.appendChild(wrap);
        return init(baseId, config.items || [], config.value, config);
    }

    function update(baseId, items) {
        const inst = _instances[baseId];
        if (!inst) return;
        inst.items = normalizeItems(items);
        // 如果当前 hidden value 不在新 items 中，清空显示
        const cur = inst.items.find(it => String(it.value) === String(inst.hidden.value));
        if (!cur) {
            inst.hidden.value = '';
            inst.input.value = '';
        }
        inst.render();
    }

    function setValue(baseId, value) {
        const inst = _instances[baseId];
        if (!inst) return;
        if (value == null || value === '') {
            inst.hidden.value = '';
            inst.input.value = '';
        } else {
            const item = inst.items.find(it => String(it.value) === String(value));
            inst.hidden.value = item ? item.value : value;
            inst.input.value = item ? item.label : String(value);
        }
        inst.render();
    }

    function getValue(baseId) {
        const inst = _instances[baseId];
        return inst ? inst.hidden.value : '';
    }

    function destroy(baseId) {
        const inst = _instances[baseId];
        if (!inst) return;
        const { input, dropdown, wrap, handlers } = inst;
        input.removeEventListener('focus', handlers.focus);
        input.removeEventListener('click', handlers.click);
        input.removeEventListener('input', handlers.input);
        input.removeEventListener('keydown', handlers.keydown);
        dropdown.removeEventListener('mousedown', handlers.dropdownDown);
        if (handlers.clear) {
            wrap.querySelector('.searchable-select-clear')?.removeEventListener('mousedown', handlers.clear);
        }
        document.removeEventListener('mousedown', handlers.docDown);
        delete _instances[baseId];
    }

    // 导出
    const api = { init, create, update, setValue, getValue, destroy };
    global.SearchableSelect = api;

    // 兼容旧调用：initSearchableSelect(baseId, items, value)
    if (typeof global.initSearchableSelect === 'undefined') {
        global.initSearchableSelect = function (baseId, items, value, options) {
            return init(baseId, items, value, options);
        };
    }
})(window);
