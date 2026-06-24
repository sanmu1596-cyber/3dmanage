/**
 * MediaViewer — 图片/视频查看器组件
 *
 * 参考主流：Element Plus 图片预览、Ant Design Image.PreviewGroup、PhotoSwipe、微信图片预览
 *
 * 特性：
 * - 黑色半透明遮罩，沉浸式查看
 * - 鼠标滚轮缩放、按钮缩放（25% ~ 400%）
 * - 拖拽平移
 * - 旋转（90°）
 * - 重置
 * - 多媒体导航（上/下一张）
 * - 键盘：Esc 关闭、←/→ 切换、+/- 缩放、0 重置、R 旋转
 * - 视频原生 controls
 * - 下载按钮
 * - 双击放大/还原
 * - 空白处点击关闭
 *
 * ============================================================
 * 用法 1: 单张图片
 * ============================================================
 *   MediaViewer.show('https://example.com/img.png');
 *
 * ============================================================
 * 用法 2: 多张图片（前后切换）
 * ============================================================
 *   MediaViewer.show([url1, url2, url3], { initialIndex: 1 });
 *
 * ============================================================
 * 用法 3: 自动绑定容器（推荐）
 * ============================================================
 *   MediaViewer.bind(containerEl, 'img, video');
 *   // 之后该容器内所有 img/video 点击都会唤起查看器，且自动收集列表前后切换
 *
 * @author 大神 for 乔老师
 * @since 2026-06-10
 */

(function (global) {
    'use strict';

    let _root = null;
    let _state = {
        items: [],       // [{src, type:'image'|'video', alt}]
        index: 0,
        scale: 1,
        rotate: 0,
        translateX: 0,
        translateY: 0,
        dragging: false,
        startX: 0,
        startY: 0,
        startTx: 0,
        startTy: 0
    };

    function ensureRoot() {
        if (_root) return _root;
        _root = document.createElement('div');
        _root.className = 'media-viewer';
        _root.style.display = 'none';
        _root.innerHTML = `
            <div class="mv-mask"></div>
            <div class="mv-stage">
                <div class="mv-canvas">
                    <img class="mv-img" alt="" draggable="false" style="display:none;" />
                    <video class="mv-video" controls style="display:none;"></video>
                </div>
            </div>
            <button class="mv-btn mv-btn-prev" title="上一张 (←)">‹</button>
            <button class="mv-btn mv-btn-next" title="下一张 (→)">›</button>
            <div class="mv-toolbar">
                <button class="mv-tool" data-action="zoom-out" title="缩小 (-)">−</button>
                <span class="mv-zoom-info">100%</span>
                <button class="mv-tool" data-action="zoom-in" title="放大 (+)">+</button>
                <button class="mv-tool" data-action="reset" title="重置 (0)">⟳</button>
                <button class="mv-tool" data-action="rotate" title="旋转 (R)">↻</button>
                <button class="mv-tool" data-action="download" title="下载">⤓</button>
                <span class="mv-counter"></span>
                <button class="mv-tool mv-close" data-action="close" title="关闭 (Esc)">✕</button>
            </div>
        `;
        document.body.appendChild(_root);

        // 事件绑定
        _root.querySelector('.mv-mask').addEventListener('click', close);
        _root.querySelector('.mv-btn-prev').addEventListener('click', (e) => { e.stopPropagation(); prev(); });
        _root.querySelector('.mv-btn-next').addEventListener('click', (e) => { e.stopPropagation(); next(); });
        _root.querySelector('.mv-toolbar').addEventListener('click', (e) => {
            const btn = e.target.closest('.mv-tool');
            if (!btn) return;
            e.stopPropagation();
            const act = btn.dataset.action;
            if (act === 'zoom-in') zoom(1.2);
            else if (act === 'zoom-out') zoom(0.8);
            else if (act === 'reset') resetTransform();
            else if (act === 'rotate') rotate();
            else if (act === 'download') download();
            else if (act === 'close') close();
        });

        // 滚轮缩放
        const stage = _root.querySelector('.mv-stage');
        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            zoom(e.deltaY < 0 ? 1.15 : 0.87);
        }, { passive: false });

        // 拖拽
        const img = _root.querySelector('.mv-img');
        img.addEventListener('mousedown', startDrag);
        img.addEventListener('dblclick', () => {
            if (_state.scale === 1) zoom(2);
            else resetTransform();
        });
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', endDrag);

        return _root;
    }

    function startDrag(e) {
        e.preventDefault();
        _state.dragging = true;
        _state.startX = e.clientX;
        _state.startY = e.clientY;
        _state.startTx = _state.translateX;
        _state.startTy = _state.translateY;
        _root.querySelector('.mv-img').style.cursor = 'grabbing';
    }
    function onDrag(e) {
        if (!_state.dragging) return;
        _state.translateX = _state.startTx + (e.clientX - _state.startX);
        _state.translateY = _state.startTy + (e.clientY - _state.startY);
        applyTransform();
    }
    function endDrag() {
        if (!_state.dragging) return;
        _state.dragging = false;
        const img = _root?.querySelector('.mv-img');
        if (img) img.style.cursor = _state.scale > 1 ? 'grab' : 'zoom-in';
    }

    function applyTransform() {
        const img = _root.querySelector('.mv-img');
        img.style.transform = `translate(${_state.translateX}px, ${_state.translateY}px) scale(${_state.scale}) rotate(${_state.rotate}deg)`;
        _root.querySelector('.mv-zoom-info').textContent = Math.round(_state.scale * 100) + '%';
        img.style.cursor = _state.scale > 1 ? 'grab' : 'zoom-in';
    }

    function resetTransform() {
        _state.scale = 1;
        _state.rotate = 0;
        _state.translateX = 0;
        _state.translateY = 0;
        applyTransform();
    }

    function zoom(factor) {
        const newScale = Math.max(0.25, Math.min(4, _state.scale * factor));
        _state.scale = newScale;
        applyTransform();
    }

    function rotate() {
        _state.rotate = (_state.rotate + 90) % 360;
        applyTransform();
    }

    function download() {
        const item = _state.items[_state.index];
        if (!item) return;
        const a = document.createElement('a');
        a.href = item.src;
        a.download = item.alt || ('media-' + Date.now());
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function loadCurrent() {
        const item = _state.items[_state.index];
        if (!item) return;
        const img = _root.querySelector('.mv-img');
        const video = _root.querySelector('.mv-video');
        const counter = _root.querySelector('.mv-counter');

        if (item.type === 'video') {
            img.style.display = 'none';
            video.style.display = 'block';
            video.src = item.src;
            video.play().catch(() => {}); // 浏览器策略可能阻止自动播放
        } else {
            video.style.display = 'none';
            video.src = '';
            img.style.display = 'block';
            img.src = item.src;
            img.alt = item.alt || '';
        }
        resetTransform();

        // 计数器
        if (_state.items.length > 1) {
            counter.textContent = `${_state.index + 1} / ${_state.items.length}`;
            _root.querySelector('.mv-btn-prev').style.display = '';
            _root.querySelector('.mv-btn-next').style.display = '';
        } else {
            counter.textContent = '';
            _root.querySelector('.mv-btn-prev').style.display = 'none';
            _root.querySelector('.mv-btn-next').style.display = 'none';
        }
    }

    function prev() {
        if (_state.index > 0) {
            _state.index--;
            loadCurrent();
        }
    }
    function next() {
        if (_state.index < _state.items.length - 1) {
            _state.index++;
            loadCurrent();
        }
    }

    function open() {
        ensureRoot();
        _root.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKeyDown);
    }

    function close() {
        if (!_root) return;
        _root.style.display = 'none';
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onKeyDown);
        // 暂停视频
        const video = _root.querySelector('.mv-video');
        if (video) { video.pause(); video.src = ''; }
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.2); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(0.8); }
        else if (e.key === '0') { e.preventDefault(); resetTransform(); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotate(); }
    }

    /**
     * 显示查看器
     * @param {string|string[]|Object|Object[]} sources — 可以是单个 URL、URL 数组、或 {src, type, alt} 对象/数组
     * @param {Object} options — { initialIndex }
     */
    function show(sources, options) {
        ensureRoot();
        options = options || {};
        const arr = Array.isArray(sources) ? sources : [sources];
        _state.items = arr.map(s => {
            if (typeof s === 'string') {
                return { src: s, type: detectType(s), alt: '' };
            }
            return { src: s.src, type: s.type || detectType(s.src), alt: s.alt || '' };
        });
        _state.index = Math.max(0, Math.min(options.initialIndex || 0, _state.items.length - 1));
        loadCurrent();
        open();
    }

    function detectType(src) {
        if (!src) return 'image';
        // data URL: data:video/mp4;base64,...
        const dataMatch = String(src).match(/^data:([^;,]+)/i);
        if (dataMatch) {
            return dataMatch[1].startsWith('video/') ? 'video' : 'image';
        }
        // 后缀判断
        if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(src)) return 'video';
        return 'image';
    }

    /**
     * 把容器内所有 img/video 自动绑定查看器
     * @param {HTMLElement|string} container
     * @param {string} selector — 默认 'img, video'
     */
    function bind(container, selector) {
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el) return;
        selector = selector || 'img, video';
        el.addEventListener('click', (e) => {
            const target = e.target.closest(selector);
            if (!target) return;
            // 视频如果已经在播放且点的是 controls，不拦截
            if (target.tagName === 'VIDEO' && target.controls) {
                // 只有点击视频的 poster/海报区域时才唤起；不影响 controls 操作
                const rect = target.getBoundingClientRect();
                const yFromBottom = rect.bottom - e.clientY;
                if (yFromBottom < 50) return; // 视频底部 50px 是 controls，不拦截
            }
            e.preventDefault();
            e.stopPropagation();
            // 收集容器内所有同类型媒体作为列表
            const all = Array.from(el.querySelectorAll(selector));
            const sources = all.map(node => ({
                src: node.tagName === 'VIDEO' ? (node.currentSrc || node.src) : node.src,
                type: node.tagName === 'VIDEO' ? 'video' : 'image',
                alt: node.alt || node.title || ''
            })).filter(it => it.src);
            const idx = all.indexOf(target);
            show(sources, { initialIndex: idx >= 0 ? idx : 0 });
        });
    }

    global.MediaViewer = { show, close, bind };
})(window);
