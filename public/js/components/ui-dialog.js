/**
 * UIDialog — 统一确认弹窗 + 全局加载态组件
 * ============================================================
 * 替代浏览器原生 confirm()（样式丑、阻塞、不可定制、风格不一）
 * 提供统一的 TAPD 风格确认/提示弹窗 + 全局加载遮罩。
 *
 * 用法：
 *   1. 确认（返回 Promise<boolean>）：
 *      if (await UIDialog.confirm('确定删除这条记录吗？')) { ... }
 *      await UIDialog.confirm({ title:'删除确认', message:'...', okText:'删除', danger:true })
 *
 *   2. 提示（只有一个确定按钮，返回 Promise<void>）：
 *      await UIDialog.alert('操作成功')
 *
 *   3. 全局加载遮罩：
 *      UIDialog.showLoading('保存中...')
 *      UIDialog.hideLoading()
 *      // 或包裹一个 async 任务，自动开关：
 *      await UIDialog.withLoading('保存中...', async () => { await saveData() })
 *
 * 特性：
 *   - Promise 化（替代同步 confirm，支持 await）
 *   - 基准 A 弹窗结构（.modal > .modal-content），与全系统一致
 *   - 危险操作（danger）红色主按钮
 *   - 键盘：Enter 确认、Esc 取消
 *   - 点击遮罩取消
 *   - 焦点自动落在主按钮
 *   - 暗色模式自动适配（复用 design-system 变量）
 * ============================================================
 */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ---------------- 确认 / 提示弹窗 ----------------
    function openDialog(opts) {
        return new Promise(function (resolve) {
            var o = typeof opts === 'string' ? { message: opts } : (opts || {});
            var isAlert = o._alert === true;
            var title = o.title || (isAlert ? '提示' : '确认操作');
            var message = o.message || '';
            var okText = o.okText || (isAlert ? '知道了' : '确定');
            var cancelText = o.cancelText || '取消';
            var danger = !!o.danger;
            var icon = o.icon || (danger ? '⚠️' : (isAlert ? 'ℹ️' : '❓'));

            // 移除残留
            var old = document.getElementById('ui-dialog-modal');
            if (old) old.remove();

            var overlay = document.createElement('div');
            overlay.className = 'modal ui-dialog-modal';
            overlay.id = 'ui-dialog-modal';
            overlay.style.display = 'flex';

            overlay.innerHTML =
                '<div class="modal-content ui-dialog-content" role="dialog" aria-modal="true">' +
                    '<div class="ui-dialog-body">' +
                        '<div class="ui-dialog-icon ' + (danger ? 'danger' : '') + '">' + icon + '</div>' +
                        '<div class="ui-dialog-texts">' +
                            '<div class="ui-dialog-title">' + esc(title) + '</div>' +
                            '<div class="ui-dialog-message">' + esc(message) + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ui-dialog-footer">' +
                        (isAlert ? '' : '<button class="btn" data-act="cancel">' + esc(cancelText) + '</button>') +
                        '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' + esc(okText) + '</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            function cleanup(result) {
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                resolve(result);
            }
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
                else if (e.key === 'Enter') { e.preventDefault(); cleanup(true); }
            }

            overlay.addEventListener('click', function (e) {
                var act = e.target.getAttribute && e.target.getAttribute('data-act');
                if (act === 'ok') cleanup(true);
                else if (act === 'cancel') cleanup(false);
                else if (e.target === overlay) cleanup(false); // 点遮罩取消
            });
            document.addEventListener('keydown', onKey, true);

            // 焦点落主按钮
            requestAnimationFrame(function () {
                var okBtn = overlay.querySelector('[data-act="ok"]');
                if (okBtn) okBtn.focus();
            });
        });
    }

    function confirm(opts) { return openDialog(opts); }
    function alert(opts) {
        var o = typeof opts === 'string' ? { message: opts } : (opts || {});
        o._alert = true;
        return openDialog(o).then(function () {});
    }

    // ---------------- 全局加载遮罩 ----------------
    var _loadingEl = null;
    var _loadingCount = 0;

    function showLoading(text) {
        _loadingCount++;
        if (!_loadingEl) {
            _loadingEl = document.createElement('div');
            _loadingEl.className = 'ui-loading-overlay';
            _loadingEl.innerHTML =
                '<div class="ui-loading-box">' +
                    '<div class="ui-loading-spinner"></div>' +
                    '<div class="ui-loading-text"></div>' +
                '</div>';
            document.body.appendChild(_loadingEl);
        }
        var t = _loadingEl.querySelector('.ui-loading-text');
        if (t) t.textContent = text || '加载中...';
        requestAnimationFrame(function () { _loadingEl.classList.add('show'); });
    }

    function hideLoading() {
        _loadingCount = Math.max(0, _loadingCount - 1);
        if (_loadingCount === 0 && _loadingEl) {
            _loadingEl.classList.remove('show');
            // 动画结束后移除
            var el = _loadingEl;
            setTimeout(function () { if (_loadingCount === 0 && el) el.remove(); }, 200);
            _loadingEl = null;
        }
    }

    function withLoading(text, task) {
        // 支持 withLoading(taskFn) 或 withLoading('文本', taskFn)
        if (typeof text === 'function') { task = text; text = '加载中...'; }
        showLoading(text);
        var p;
        try { p = task(); } catch (e) { hideLoading(); throw e; }
        return Promise.resolve(p).finally(hideLoading);
    }

    global.UIDialog = {
        confirm: confirm,
        alert: alert,
        showLoading: showLoading,
        hideLoading: hideLoading,
        withLoading: withLoading
    };
})(window);
