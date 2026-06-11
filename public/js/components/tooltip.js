/**
 * Tooltip 通用提示组件 — 统一全系统 hover 提示风格
 * ============================================================
 * 设计目标：替代浏览器原生 title（延迟慢、样式不可控、风格不一），
 * 提供统一的深色圆角浮层提示，淡入淡出，自动定位，跟随光标方向。
 *
 * 用法（三选一）：
 *   1. 自动接管：页面任何带 title 的元素（表格单元格、按钮等）
 *      默认被本组件接管为统一样式（原 title 被移到 data-tooltip 并清空 title 防止双提示）
 *   2. 显式声明：给元素加 data-tooltip="提示文字" 即可
 *   3. 编程式：Tooltip.show(el, text) / Tooltip.hide()
 *
 * 特性：
 *   - 单例浮层（全局只有一个 tooltip DOM，性能好）
 *   - 智能定位：默认在元素上方，空间不足自动翻转到下方/左右
 *   - 80ms 显示延迟（避免快速划过时闪烁），淡入淡出
 *   - 暗色模式自动适配（浮层本身就是深色，暗色下用浅色）
 *   - 支持多行（\n 换行）
 *   - 长文本最大宽度限制
 * ============================================================
 */
(function (global) {
    'use strict';

    var SHOW_DELAY = 80;      // hover 多久后显示（ms）
    var GAP = 8;              // tooltip 与目标元素的间距
    var _tip = null;          // 单例浮层 DOM
    var _showTimer = null;
    var _currentTarget = null;

    // 创建单例浮层
    function ensureTip() {
        if (_tip) return _tip;
        _tip = document.createElement('div');
        _tip.className = 'ui-tooltip';
        _tip.setAttribute('role', 'tooltip');
        document.body.appendChild(_tip);
        return _tip;
    }

    // 计算并设置位置（默认上方，空间不足翻转）
    function position(target) {
        var tip = ensureTip();
        var r = target.getBoundingClientRect();
        var tr = tip.getBoundingClientRect();
        var vw = window.innerWidth, vh = window.innerHeight;

        // 默认放上方居中
        var top = r.top - tr.height - GAP;
        var left = r.left + (r.width - tr.width) / 2;
        var placement = 'top';

        // 上方空间不足 → 翻到下方
        if (top < 4) {
            top = r.bottom + GAP;
            placement = 'bottom';
        }
        // 水平越界修正
        if (left < 4) left = 4;
        if (left + tr.width > vw - 4) left = vw - 4 - tr.width;
        // 下方也越界（极端）→ 收回视口内
        if (top + tr.height > vh - 4) top = vh - 4 - tr.height;

        tip.style.top = Math.round(top) + 'px';
        tip.style.left = Math.round(left) + 'px';
        tip.setAttribute('data-placement', placement);
    }

    function doShow(target, text) {
        if (!text) return;
        var tip = ensureTip();
        // 支持换行
        tip.textContent = text;
        tip.classList.add('show');
        _currentTarget = target;
        // 先渲染再量尺寸定位
        requestAnimationFrame(function () { position(target); });
    }

    function show(target, text) {
        clearTimeout(_showTimer);
        var t = text || target.getAttribute('data-tooltip') || target.getAttribute('title') || '';
        if (!t) return;
        _showTimer = setTimeout(function () { doShow(target, t); }, SHOW_DELAY);
    }

    function hide() {
        clearTimeout(_showTimer);
        if (_tip) _tip.classList.remove('show');
        _currentTarget = null;
    }

    // 取目标元素的提示文本：优先 data-tooltip，其次 title（并搬运 title 防止原生双提示）
    function resolveText(el) {
        if (el.hasAttribute('data-tooltip')) return el.getAttribute('data-tooltip');
        if (el.hasAttribute('title')) {
            var t = el.getAttribute('title');
            // 搬运到 data-tooltip 并清空 title，避免原生 tooltip 同时弹出
            el.setAttribute('data-tooltip', t);
            el.removeAttribute('title');
            return t;
        }
        return '';
    }

    // 事件委托：监听整个 document 的 mouseover/mouseout
    function findTooltipTarget(node) {
        // 向上找最近的带 title / data-tooltip 的元素
        while (node && node !== document.body) {
            if (node.nodeType === 1 &&
                (node.hasAttribute('data-tooltip') || node.hasAttribute('title'))) {
                // 编辑状态中的单元格不显示提示
                if (node.classList && node.classList.contains('editing')) return null;
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function onOver(e) {
        var target = findTooltipTarget(e.target);
        if (!target || target === _currentTarget) return;
        var text = resolveText(target);
        if (!text) return;
        show(target, text);
    }

    function onOut(e) {
        var target = findTooltipTarget(e.target);
        if (!target) return;
        // 移出当前目标才隐藏
        if (target === _currentTarget) hide();
    }

    // 滚动/失焦时隐藏，避免浮层残留
    function onScrollOrBlur() { hide(); }

    function init() {
        document.addEventListener('mouseover', onOver, true);
        document.addEventListener('mouseout', onOut, true);
        document.addEventListener('scroll', onScrollOrBlur, true);
        window.addEventListener('blur', onScrollOrBlur);
        // 点击任何地方也隐藏（如点击按钮后）
        document.addEventListener('click', hide, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Tooltip = {
        show: show,
        hide: hide,
        // 给容器内所有带 title 的元素预转换为 data-tooltip（可选，事件委托已能处理）
        scan: function (container) {
            var root = container || document;
            root.querySelectorAll('[title]').forEach(function (el) {
                if (el.classList && el.classList.contains('editing')) return;
                var t = el.getAttribute('title');
                if (t) { el.setAttribute('data-tooltip', t); el.removeAttribute('title'); }
            });
        }
    };
})(window);
