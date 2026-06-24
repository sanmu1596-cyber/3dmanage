/**
 * a11y.js — 无障碍（键盘 Tab 导航）增强
 * ============================================================
 * 项目里大量交互元素用 <a onclick>（无 href）/ <div onclick> / .sidebar-item，
 * 这些元素默认不可被 Tab 聚焦，键盘用户无法操作。
 *
 * 本脚本自动增强（无需改 HTML）：
 *   1. 给可点击但非语义/不可聚焦的元素补 tabindex=0 + role=button
 *   2. 监听 Enter/Space 触发其 click（键盘等价于鼠标点击）
 *   3. 注入"跳到主内容"无障碍链接（Tab 第一下出现）
 *   4. 用 MutationObserver 持续增强动态渲染的元素（表格行操作按钮等）
 *
 * 配合 design-system.css 第19节的 :focus-visible 焦点环使用。
 * ============================================================
 */
(function () {
    'use strict';

    // 需要增强为可聚焦的选择器（可点击但默认不可 Tab 聚焦的）
    var SELECTORS = [
        'a[onclick]:not([href])',      // 无 href 的链接（onclick 跳转）
        '.sidebar-item',               // 侧栏菜单项
        'div[onclick]',                // 可点击 div
        'span[onclick]',               // 可点击 span
        '[role="button"]:not(button):not(a)'
    ];

    function enhance(el) {
        if (!el || el.dataset.a11yReady === '1') return;
        // 已是原生可聚焦元素（button/input/真正的链接）跳过
        if (el.matches('button, input, select, textarea, a[href]')) return;
        el.dataset.a11yReady = '1';
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    }

    function enhanceAll(root) {
        (root || document).querySelectorAll(SELECTORS.join(',')).forEach(enhance);
    }

    // 键盘激活：Enter / Space → 触发 click（事件委托，一次绑定）
    function onKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        var el = e.target;
        if (!el || el.dataset.a11yReady !== '1') return;
        // 原生可聚焦元素让浏览器处理
        if (el.matches('button, input, select, textarea, a[href]')) return;
        // 富文本编辑器内 Space/Enter 是正常输入，不拦截
        if (el.isContentEditable) return;
        e.preventDefault();
        el.click();
    }

    // 注入"跳到主内容"链接
    function injectSkipLink() {
        if (document.querySelector('.skip-to-main')) return;
        var main = document.querySelector('.content-area, .tab-content.active, main');
        if (main && !main.id) main.id = 'main-content';
        var targetId = main ? (main.id || 'main-content') : 'main-content';
        var link = document.createElement('a');
        link.className = 'skip-to-main';
        link.href = '#' + targetId;
        link.textContent = '跳到主内容';
        link.addEventListener('click', function (e) {
            var t = document.getElementById(targetId);
            if (t) {
                e.preventDefault();
                t.setAttribute('tabindex', '-1');
                t.focus();
            }
        });
        document.body.insertBefore(link, document.body.firstChild);
    }

    function init() {
        enhanceAll(document);
        injectSkipLink();
        document.addEventListener('keydown', onKeydown, true);

        // 持续增强动态渲染的元素（表格行按钮、弹窗等）
        var mo = new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                var m = muts[i];
                for (var j = 0; j < m.addedNodes.length; j++) {
                    var n = m.addedNodes[j];
                    if (n.nodeType !== 1) continue;
                    enhance(n);
                    if (n.querySelectorAll) enhanceAll(n);
                }
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
