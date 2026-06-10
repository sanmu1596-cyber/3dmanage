// ==================== 近期关注事项（故事墙）模块 ====================
//
// 职责：大事列表渲染 / CRUD / 拖拽排序 / 评论区 / 富文本编辑
// 依赖：core.js (authFetch, API_BASE, showToast, escapeHtml)
//       index.html (#focus-items-board, #focus-editor-modal 等DOM)

// 全局状态（必须用 var，踩坑 #1）
var focusItemsData = [];           // 所有大事原始数据
var filteredFocusItems = [];       // 筛选后数据
var focusCurrentFilter = '';       // 当前筛选状态
var _focusDraggingEl = null;       // 拖拽中的元素
var _focusDragStartY = 0;
var _focusImagePreview = null;     // 图片预览 DOM

// ==================== 初始化 ====================

/**
 * 加载关注事项列表（在 dashboard.js 的 loadDashboard 中调用）
 */
function loadFocusItems() {
    authFetch(API_BASE + '/focus-items')
        .then(function(r) { return r.json(); })
        .then(function(result) {
            if (result.success) {
                focusItemsData = result.data || [];
                renderFocusBoard();
            }
        })
        .catch(function(err) {
            console.error('加载关注事项失败:', err);
        });
}

/**
 * 渲染故事墙
 */
function renderFocusBoard() {
    var board = document.getElementById('focus-items-board');
    var emptyState = document.getElementById('focus-empty-state');
    if (!board) return;

    // 应用筛选
    if (focusCurrentFilter) {
        filteredFocusItems = focusItemsData.filter(function(item) { return item.status === focusCurrentFilter; });
    } else {
        filteredFocusItems = focusItemsData.slice();
    }

    if (filteredFocusItems.length === 0) {
        board.innerHTML = '';
        emptyState.style.display = '';
        return;
    }
    emptyState.style.display = 'none';

    // 渲染卡片
    board.innerHTML = filteredFocusItems.map(function(item, idx) {
        return buildFocusCard(item, idx);
    }).join('');

    // 绑定拖拽事件
    initFocusDrag();
}

/**
 * 构建单张大事卡片 HTML
 */
function buildFocusCard(item, idx) {
    var isDone = item.status === 'done';
    var moduleIconMap = { '游戏': '🎮', '交织': '🔗', '客户端': '📱', '硬件': '🖥' };
    var icon = moduleIconMap[item.module] || '📌';
    var statusLabel = { 'new': '新建', 'in_progress': '进行中', 'done': '已结束' };
    var statusClass = { 'new': 'st-new', 'in_progress': 'st-progress', 'done': 'st-done' };

    var dateStr = formatFocusDate(item.created_at);
    var updateStr = item.updated_at && item.updated_at !== item.created_at ? ' · 更新 ' + formatFocusDate(item.updated_at) : '';

    return '<div class="focus-card status-' + (item.status || 'new') + '" data-id="' + item.id + '" draggable="true">' +
        '<div class="focus-card-header">' +
            '<span class="focus-module-tag mod-' + (item.module || '游戏') + '">' + icon + ' ' + (item.module || '游戏') + '</span>' +
            '<span class="focus-status-badge ' + (statusClass[item.status] || 'st-new') + '">' + (statusLabel[item.status] || '新建') + '</span>' +
        '</div>' +
        '<div class="focus-card-body">' +
            '<div class="focus-card-content" ondblclick="editFocusItem(' + item.id + ')">' + sanitizeContent(item.content || '') + '</div>' +
            '<div class="focus-card-date">' + dateStr + updateStr + '</div>' +
        '</div>' +
        '<div class="focus-card-actions">' +
            '<div class="focus-card-left-actions">' +
                '<span class="focus-drag-handle" title="拖拽排序">⋮⋮</span>' +
            '</div>' +
            '<div class="focus-card-right-actions">' +
                '<button class="focus-action-btn" onclick="toggleComments(' + item.id + ', this)" title="评论">💬 <span class="comment-count">' + (item.comment_count || 0) + '</span></button>' +
                '<button class="focus-action-btn" onclick="editFocusItem(' + item.id + ')" title="编辑">✏️</button>' +
                '<button class="focus-action-btn danger" onclick="deleteFocusItem(' + item.id + ')" title="删除">🗑</button>' +
            '</div>' +
        '</div>' +
        '<div class="focus-comments-section" id="comments-' + item.id + '">' +
            '<div class="comment-list-inner"></div>' +
            '<div class="focus-comment-input-area">' +
                '<textarea class="focus-comment-textarea" placeholder="写评论...（支持粘贴图片）" rows="2" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();submitComment(' + item.id + ',this)}"></textarea>' +
                '<div class="focus-comment-actions">' +
                    '<button class="btn btn-default btn-sm" onclick="hideCommentInput(' + item.id + ')">取消</button>' +
                    '<button class="btn btn-primary btn-sm" onclick="submitComment(' + item.id + ')">发送</button>' +
                '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// ==================== 筛选 ====================

function filterFocusItems(status) {
    focusCurrentFilter = status;

    // 更新按钮状态
    var buttons = document.querySelectorAll('.focus-filter-btn');
    buttons.forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-status') === (status || ''));
    });

    renderFocusBoard();
}

// ==================== CRUD 操作 ====================

function openFocusItemEditor(id) {
    var modal = document.getElementById('focus-editor-modal');
    var titleEl = document.getElementById('focus-editor-title');
    var moduleId = document.getElementById('focus-edit-module');
    var contentEl = document.getElementById('focus-edit-content');
    var statusEl = document.getElementById('focus-edit-status');

    if (id) {
        // 编辑模式
        var item = focusItemsData.find(function(i) { return i.id == id; });
        if (!item) return;
        titleEl.textContent = '编辑大事';
        document.getElementById('focus-edit-id').value = id;
        moduleId.value = item.module || '游戏';
        contentEl.innerHTML = item.content || '';
        statusEl.value = item.status || 'new';
    } else {
        // 新建模式
        titleEl.textContent = '新增大事';
        document.getElementById('focus-edit-id').value = '';
        moduleId.value = '游戏';
        contentEl.innerHTML = '';
        statusEl.value = 'new';
        contentEl.focus();
    }

    modal.style.display = 'flex';

    // 注册粘贴事件
    contentEl.onpaste = handleContentPaste;
}

function closeFocusEditor(e) {
    if (e && e.target.id === 'focus-editor-modal') {
        document.getElementById('focus-editor-modal').style.display = 'none';
        document.getElementById('focus-edit-content').onpaste = null;
    } else if (!e) {
        document.getElementById('focus-editor-modal').style.display = 'none';
        document.getElementById('focus-edit-content').onpaste = null;
    }
}

function saveFocusItem() {
    var idVal = document.getElementById('focus-edit-id').value;
    var module = document.getElementById('focus-edit-module').value;
    var content = document.getElementById('focus-edit-content').innerHTML.trim();
    var status = document.getElementById('focus-edit-status').value;

    if (!content || content === '') {
        showToast('内容不能为空', 'warning'); return;
    }

    var url = API_BASE + '/focus-items';
    var method = 'POST';
    var body = { module: module, content: content, status: status };

    if (idVal) {
        url += '/' + idVal;
        method = 'PUT';
    }

    authFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(r) { return r.json(); }).then(function(result) {
        if (result.success) {
            closeFocusEditor();
            loadFocusItems();
            showToast(idVal ? '已更新' : '已添加', 'success');
        } else {
            showToast(result.error || '保存失败', 'warning');
        }
    }).catch(function() {
        showToast('保存失败（离线）', 'warning');
    });
}

function editFocusItem(id) {
    openFocusItemEditor(id);
}

function deleteFocusItem(id) {
    var item = focusItemsData.find(function(i) { return i.id == id; });
    var name = item ? (item.content || '').substring(0, 30) : '此事项';
    if (confirm('确定删除「' + name + '...」吗？')) {
        authFetch(API_BASE + '/focus-items/' + id, {
            method: 'DELETE'
        }).then(function(r) { return r.json(); }).then(function(result) {
            if (result.success) {
                loadFocusItems();
                showToast('已删除', 'success');
            }
        });
    }
}

// ==================== 评论功能 ====================

var _expandedCommentId = null;

function toggleComments(itemId, btnEl) {
    var section = document.getElementById('comments-' + itemId);
    if (!section) return;

    var isExpanding = !section.classList.contains('expanded');

    // 收起其他展开的评论
    if (_expandedCommentId && _expandedCommentId !== itemId) {
        var prev = document.getElementById('comments-' + _expandedCommentId);
        if (prev) {
            prev.classList.remove('expanded');
            var prevBtn = prev.closest('.focus-card')?.querySelector('.focus-comments-toggle');
            if (prevBtn) prevBtn.classList.remove('expanded');
        }
    }

    section.classList.toggle('expanded', isExpanding);
    if (btnEl) btnEl.classList.toggle('expanded', isExpanding);

    if (isExpanding) {
        _expandedCommentId = itemId;
        loadComments(itemId);
    } else {
        _expandedCommentId = null;
    }
}

function loadComments(itemId) {
    var section = document.getElementById('comments-' + itemId);
    var listInner = section?.querySelector('.comment-list-inner');
    if (!listInner) return;

    listInner.innerHTML = '<div style="padding:8px;color:#b0b3b8;font-size:12px;">加载中...</div>';

    authFetch(API_BASE + '/focus-items/' + itemId + '/comments')
        .then(function(r) { return r.json(); })
        .then(function(result) {
            if (!result.success) { listInner.innerHTML = '<div style="padding:8px;color:#ef4444;">加载失败</div>'; return; }

            var comments = result.data || [];
            if (comments.length === 0) {
                listInner.innerHTML = '<div style="padding:12px;text-align:center;color:#b0b3b8;font-size:13px;">暂无评论</div>';
                return;
            }

            listInner.innerHTML = comments.map(function(c) {
                var imagesHtml = '';
                if (c.imageList && c.imageList.length > 0) {
                    imagesHtml = '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;">' +
                        c.imageList.map(function(imgSrc) {
                            return '<img src="' + imgSrc + '" style="width:80px;height:60px;object-fit:cover;border-radius:4px;cursor:pointer;" onclick="previewFocusImage(this.src,event)" alt="">';
                        }).join('') + '</div>';
                }
                return '<div class="focus-comment-item">' +
                    '<div class="focus-comment-meta">' +
                        '<span class="focus-comment-author">' + escapeHtml(c.author || '-') + '</span>' +
                        '<span class="focus-comment-time">' + formatFocusDate(c.created_at) + '</span>' +
                    '</div>' +
                    '<div class="focus-comment-text">' + sanitizeContent(c.content || '') + '</div>' +
                    imagesHtml +
                    '<div style="margin-top:4px;text-align:right;">' +
                        '<button class="focus-action-btn danger" style="font-size:11px;" onclick="deleteComment(' + c.id + ',' + itemId + ')">删除</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        });
}

function showCommentInput(itemId) {
    var area = document.querySelector('#comments-' + itemId + ' .focus-comment-input-area');
    if (area) area.classList.add('visible');
}

function hideCommentInput(itemId) {
    var area = document.querySelector('#comments-' + itemId + ' .focus-comment-input-area');
    var ta = area?.querySelector('.focus-comment-textarea');
    if (ta) ta.value = '';
    if (area) area.classList.remove('visible');
}

function submitComment(itemId, textareaEl) {
    var area = document.querySelector('#comments-' + itemId + ' .focus-comment-input-area');
    var ta = textareaEl || area?.querySelector('.focus-comment-textarea');
    if (!ta) return;

    var content = ta.value.trim();
    if (!content) { showToast('评论不能为空', 'warning'); return; }

    // 提取 base64 图片
    var images = [];
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    var imgs = tempDiv.querySelectorAll('img[src^="data:"]');
    imgs.forEach(function(img) { images.push(img.src); });

    authFetch(API_BASE + '/focus-items/' + itemId + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content, images: images })
    }).then(function(r) { return r.json(); }).then(function(result) {
        if (result.success) {
            ta.value = '';
            loadComments(itemId); // 刷新评论列表
            loadFocusItems();      // 刷新计数
        } else {
            showToast(result.error || '发送失败', 'warning');
        }
    });
}

function deleteComment(commentId, itemId) {
    if (!confirm('确定删除此条评论吗？')) return;
    authFetch(API_BASE + '/focus-comments/' + commentId, { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(result) {
            if (result.success) {
                loadComments(itemId);
                loadFocusItems();
            }
        });
}

// ==================== 富文本编辑：图片处理 ====================

function handleContentPaste(e) {
    // 捕获粘贴的图片（Ctrl+V 截图）
    var items = e.clipboardData?.items;
    if (!items) return;

    for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            var file = items[i].getAsFile();
            var reader = new FileReader();
            reader.onload = function(ev) {
                insertImgToEditor(ev.target.result);
            };
            reader.readAsDataURL(file);
            return;
        }
    }
}

function insertImageToEditor() {
    document.getElementById('focus-image-input').click();
}

function handleFocusImageUpload(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            insertImgToEditor(e.target.result);
        };
        reader.readAsDataURL(input.files[0]);
        input.value = ''; // reset
    }
}

function insertImgToEditor(src) {
    var editor = document.getElementById('focus-edit-content');
    editor.focus();

    // 插入 <img> 标签
    var img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:100%;border-radius:6px;margin:6px 0;';
    img.onclick = function() { previewFocusImage(this.src, event); };

    // 在光标位置插入或追加
    var selection = window.getSelection();
    if (selection.rangeCount > 0) {
        var range = selection.getRangeAt(0);
        range.insertNode(img);
        range.setStartAfter(img);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        editor.appendChild(img);
    }
}

function previewFocusImage(src, e) {
    if (e) e.stopPropagation();
    // ★ 优先使用通用 MediaViewer 组件（支持缩放/旋转/键盘导航/下载）
    if (window.MediaViewer) {
        MediaViewer.show(src);
        return;
    }
    // 兜底：旧实现（仅当 MediaViewer 未加载时）
    closeImagePreview();
    var overlay = document.createElement('div');
    overlay.className = 'focus-image-preview-overlay';
    overlay.onclick = closeImagePreview;
    overlay.onkeydown = function(evt) { if (evt.key === 'Escape') closeImagePreview(); };
    var img = document.createElement('img');
    img.src = src;
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    _focusImagePreview = overlay;
    setTimeout(function() { overlay.focus(); }, 50);
}

function closeImagePreview() {
    if (_focusImagePreview) {
        _focusImagePreview.remove();
        _focusImagePreview = null;
    }
}

// ESC 关闭预览
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeImagePreview();
        if (document.getElementById('focus-editor-modal').style.display === 'flex') {
            closeFocusEditor();
        }
    }
});

// ==================== 拖拽排序 ====================

function initFocusDrag() {
    var cards = document.querySelectorAll('.focus-card[draggable]');
    cards.forEach(function(card) {
        card.ondragstart = function(e) {
            _focusDraggingEl = this;
            _focusDragStartY = e.clientY;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
        };
        card.ondragover = function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        card.ondragenter = function(e) {
            if (_focusDraggingEl && _focusDraggingEl !== this) {
                this.style.borderTop = '3px solid #2680eb';
            }
        };
        card.ondragleave = function() {
            this.style.borderTop = '';
        };
        card.ondrop = function(e) {
            e.preventDefault();
            this.style.borderTop = '';

            if (!_focusDraggingEl || _focusDraggingEl === this) return;

            var board = document.getElementById('focus-items-board');
            var cardsArr = Array.from(board.querySelectorAll('.focus-card'));
            var fromIdx = cardsArr.indexOf(_focusDraggingEl);
            var toIdx = cardsArr.indexOf(this);

            if (fromIdx >= 0 && toIdx >= 0) {
                // DOM 重排
                if (fromIdx < toIdx) {
                    this.parentNode.insertBefore(_focusDraggingEl, this.nextSibling);
                } else {
                    this.parentNode.insertBefore(_focusDraggingEl, this);
                }

                // 提交到后端
                var order = Array.from(board.querySelectorAll('.focus-card')).map(function(el) {
                    return { id: parseInt(el.getAttribute('data-id')) };
                });

                authFetch(API_BASE + '/focus-items/reorder', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order: order })
                }).catch(function(err) { console.error('Reorder failed:', err); });
            }
        };
        card.ondragend = function() {
            this.classList.remove('dragging');
            _focusDraggingEl = null;
            // 清除所有 border-top
            document.querySelectorAll('.focus-card').forEach(function(c) { c.style.borderTop = ''; });
        };
    });
}

// ==================== 工具函数 ====================

/** 格式化日期为友好显示 */
function formatFocusDate(dateStr) {
    if (!dateStr) return '';
    try {
        var d = new Date(dateStr);
        var now = new Date();
        var diffMs = now - d;
        var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return '今天 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
        if (diffDays === 1) return '昨天';
        if (diffDays < 7) return diffDays + '天前';
        if (d.getFullYear() === now.getFullYear())
            return (d.getMonth() + 1) + '/' + d.getDate();
        return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
    } catch(e) {
        return String(dateStr).substring(0, 10);
    }
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/** 清理富文本内容（防XSS） */
function sanitizeContent(html) {
    if (!html) return '';
    // 允许的标签白名单
    var div = document.createElement('div');
    div.textContent = html; // 如果是纯文本，直接转义
    // 但如果是HTML，保留安全标签
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    // 移除 script/iframe/style 等
    var dangerous = tmp.querySelectorAll('script,iframe,style,object,embed');
    dangerous.forEach(function(el) { el.remove(); });
    return tmp.innerHTML;
}
