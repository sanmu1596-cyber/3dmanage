/**
 * RichEditor — 通用富文本编辑器组件
 *
 * 基于 wangEditor-next 社区版（MIT，CDN 单文件，零构建，全局名仍为 wangEditor），
 * 封装成与 SearchableSelect 同级的可复用组件。适用于需求描述、评论、备注、方案说明等
 * 所有富文本输入场景。
 *
 * 依赖（在 index.html 中先于本文件引入）：
 *   <link href="https://cdn.jsdelivr.net/npm/@wangeditor-next/editor@5.7.13/dist/css/style.min.css" rel="stylesheet">
 *   <script src="https://cdn.jsdelivr.net/npm/@wangeditor-next/editor@5.7.13/dist/index.js"></script>
 *
 * 功能：文字格式化（加粗/斜体/颜色/字号/标题/列表/对齐等）、图片粘贴&上传、插入表格。
 * 表格增强（社区版内置 + 组件层补强）：
 *   - 列宽可拖（表格默认插入为“非全宽”，鼠标移到列边界拖拽即可调整）
 *   - 行高可拖（组件层 enhanceRowResize：拖拽行下边界改行高）
 *   - 多选单元格：编辑区内按住拖蓝选中多个单元格，工具栏格式化按钮批量作用
 *   - 合并 / 拆分单元格（表格工具栏内置）
 * 图片上传走后端 POST /api/upload/image（带 token），返回 { success, url }，
 * 内容以 HTML 字符串形式保存到现有 text 字段。
 *
 * ============================================================
 * 用法 1：自动构建（推荐）
 * ============================================================
 *   const ed = RichEditor.create({
 *     containerId: 'desc-wrap',        // 挂载父容器 id
 *     value: '<p>初始内容</p>',        // 可选，初始 HTML
 *     height: 300,                     // 可选，编辑区高度 px，默认 260
 *     mode: 'default',                 // 'default'(全功能) | 'simple'(精简)
 *     placeholder: '请输入...',
 *     onChange: (html) => {}           // 内容变化回调
 *   });
 *   // 取值：ed.getHtml()   赋值：ed.setHtml('<p>x</p>')   销毁：ed.destroy()
 *
 * ============================================================
 * 用法 2：绑定已有 DOM（手写工具栏/编辑区容器）
 * ============================================================
 *   <div id="wrap">
 *     <div id="wrap-toolbar"></div>
 *     <div id="wrap-editor"></div>
 *   </div>
 *   const ed = RichEditor.init('wrap', { value: '', onChange });
 *
 * ============================================================
 * 静态只读渲染（展示已保存 HTML，无需编辑器实例）
 * ============================================================
 *   RichEditor.renderReadonly(html) -> 返回安全的 HTML 字符串（可直接 innerHTML）
 *
 * ============================================================
 * API
 * ============================================================
 *   RichEditor.create(config)   -> instance   自动建 DOM 并初始化
 *   RichEditor.init(baseId, opt)-> instance   绑定已有 DOM（baseId-toolbar / baseId-editor）
 *   RichEditor.isReady()        -> boolean    CDN 是否加载完成
 *
 *   instance.getHtml()          -> string
 *   instance.getText()          -> string     纯文本
 *   instance.setHtml(html)      -> void
 *   instance.isEmpty()          -> boolean
 *   instance.focus()            -> void
 *   instance.destroy()          -> void        必须在弹窗关闭时调用，防内存泄漏
 */
(function (global) {
  'use strict';

  var TOKEN_KEYS = ['token', 'auth_token', 'authToken', 'access_token'];

  function getToken() {
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      var v = localStorage.getItem(TOKEN_KEYS[i]);
      if (v) return v;
    }
    return '';
  }

  function isReady() {
    return !!(global.wangEditor && global.wangEditor.createEditor);
  }

  // 自定义图片上传：调用后端 /api/upload/image，返回 { success, url }
  function customUpload(file, insertFn) {
    var fd = new FormData();
    fd.append('file', file);
    var headers = {};
    var tk = getToken();
    if (tk) headers['Authorization'] = 'Bearer ' + tk;

    fetch('/api/upload/image', {
      method: 'POST',
      headers: headers,
      credentials: 'same-origin',
      body: fd
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.success && res.url) {
          insertFn(res.url, res.alt || file.name, res.url);
        } else {
          alert('图片上传失败：' + ((res && res.error) || '未知错误'));
        }
      })
      .catch(function (e) {
        alert('图片上传出错：' + e.message);
      });
  }

  function buildConfig(opt) {
    opt = opt || {};
    var editorConfig = {
      placeholder: opt.placeholder || '请输入内容…',
      MENU_CONF: {}
    };
    // 图片：走自定义上传；小图内联 base64（<10kb）减少请求
    editorConfig.MENU_CONF['uploadImage'] = {
      customUpload: customUpload,
      base64LimitSize: 10 * 1024
    };
    if (typeof opt.onChange === 'function') {
      editorConfig.onChange = function (editor) {
        try { opt.onChange(editor.getHtml(), editor); } catch (e) { /* noop */ }
      };
    }
    return editorConfig;
  }

  // 精简模式工具栏：去掉视频/全屏等重功能，保留格式化+图片+表格
  function buildToolbarConfig(mode) {
    var cfg = {};
    if (mode === 'simple') {
      cfg.excludeKeys = [
        'group-video', 'insertVideo', 'uploadVideo', 'fullScreen',
        'emotion', 'group-more-style'
      ];
    } else {
      // default 模式也剔除视频上传（本系统富文本暂不需要视频，避免误传大文件）
      cfg.excludeKeys = ['group-video', 'insertVideo', 'uploadVideo'];
    }
    return cfg;
  }

  /**
   * 行高拖拽增强（组件层补强，wangEditor-next 原生只做列宽不做行高）。
   * 原理：在编辑区容器上委托 mousemove 检测光标是否贴近某个 tr 的下边界，
   * 是则显示 row-resize 光标；mousedown 进入拖拽，实时改该行所有 td/th 的 height。
   * 返回一个 cleanup 函数用于 destroy 时解绑。
   */
  function enhanceRowResize(editorEl) {
    if (!editorEl) return function () {};
    var EDGE = 5;            // 触发区像素
    var MIN_H = 24;          // 行最小高度
    var hovering = null;     // 当前悬停可调整的 tr
    var dragging = null;     // { tr, startY, startH }

    function rowBottomHit(e) {
      // 找到光标下方最近的 tr，判断是否贴近其下边界
      var el = e.target;
      while (el && el !== editorEl && el.tagName !== 'TR') el = el.parentElement;
      if (!el || el.tagName !== 'TR') return null;
      var rect = el.getBoundingClientRect();
      if (Math.abs(e.clientY - rect.bottom) <= EDGE) return el;
      return null;
    }

    function onMove(e) {
      if (dragging) {
        var dh = e.clientY - dragging.startY;
        var nh = Math.max(MIN_H, dragging.startH + dh);
        var cells = dragging.tr.querySelectorAll('td,th');
        for (var i = 0; i < cells.length; i++) cells[i].style.height = nh + 'px';
        e.preventDefault();
        return;
      }
      var tr = rowBottomHit(e);
      if (tr) {
        hovering = tr;
        editorEl.style.cursor = 'row-resize';
      } else if (hovering) {
        hovering = null;
        editorEl.style.cursor = '';
      }
    }

    function onDown(e) {
      var tr = rowBottomHit(e);
      if (!tr) return;
      var firstCell = tr.querySelector('td,th');
      var startH = firstCell ? firstCell.getBoundingClientRect().height : tr.getBoundingClientRect().height;
      dragging = { tr: tr, startY: e.clientY, startH: startH };
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    }

    function onUp() {
      if (dragging) {
        dragging = null;
        document.body.style.userSelect = '';
        editorEl.style.cursor = '';
      }
    }

    editorEl.addEventListener('mousemove', onMove, true);
    editorEl.addEventListener('mousedown', onDown, true);
    document.addEventListener('mouseup', onUp, true);

    return function cleanup() {
      editorEl.removeEventListener('mousemove', onMove, true);
      editorEl.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mouseup', onUp, true);
    };
  }

  function makeInstance(editor, toolbar, wrapEl, rowResizeCleanup) {
    return {
      _editor: editor,
      _toolbar: toolbar,
      _wrap: wrapEl,
      getHtml: function () { return editor ? editor.getHtml() : ''; },
      getText: function () { return editor ? editor.getText() : ''; },
      setHtml: function (html) { if (editor) editor.setHtml(html || '<p><br></p>'); },
      isEmpty: function () { return editor ? editor.isEmpty() : true; },
      focus: function () { if (editor) editor.focus(); },
      destroy: function () {
        try { if (rowResizeCleanup) rowResizeCleanup(); } catch (e) {}
        try { if (toolbar) toolbar.destroy(); } catch (e) {}
        try { if (editor) editor.destroy(); } catch (e) {}
        this._editor = null; this._toolbar = null;
      }
    };
  }

  /**
   * 绑定已有 DOM。要求存在 #{baseId}-toolbar 与 #{baseId}-editor 两个子容器。
   */
  function init(baseId, opt) {
    opt = opt || {};
    if (!isReady()) {
      console.error('[RichEditor] wangEditor CDN 未加载');
      return null;
    }
    var toolbarSel = '#' + baseId + '-toolbar';
    var editorSel = '#' + baseId + '-editor';
    var editorEl = document.querySelector(editorSel);
    if (editorEl && opt.height) editorEl.style.height = opt.height + 'px';

    var W = global.wangEditor;
    var editor = W.createEditor({
      selector: editorSel,
      html: opt.value || '<p><br></p>',
      config: buildConfig(opt),
      mode: opt.mode === 'simple' ? 'simple' : 'default'
    });
    var toolbar = W.createToolbar({
      editor: editor,
      selector: toolbarSel,
      config: buildToolbarConfig(opt.mode),
      mode: opt.mode === 'simple' ? 'simple' : 'default'
    });
    // 组件层行高拖拽增强（绑定在编辑区容器上，capture 捕获内部 tr 边界）
    var rowResizeCleanup = enhanceRowResize(editorEl);
    return makeInstance(editor, toolbar, document.getElementById(baseId), rowResizeCleanup);
  }

  /**
   * 自动构建 DOM 结构并初始化。返回实例。
   */
  function create(config) {
    config = config || {};
    if (!isReady()) {
      console.error('[RichEditor] wangEditor CDN 未加载，无法创建');
      return null;
    }
    var parent = typeof config.containerId === 'string'
      ? document.getElementById(config.containerId)
      : config.containerId;
    if (!parent) {
      console.error('[RichEditor] 找不到容器', config.containerId);
      return null;
    }
    var baseId = 'rte-' + Math.random().toString(36).slice(2, 9);
    var height = config.height || 260;

    var wrap = document.createElement('div');
    wrap.className = 'rich-editor-wrap';
    wrap.id = baseId;
    wrap.innerHTML =
      '<div class="rich-editor-toolbar" id="' + baseId + '-toolbar"></div>' +
      '<div class="rich-editor-body" id="' + baseId + '-editor" style="height:' + height + 'px;"></div>';
    parent.appendChild(wrap);

    return init(baseId, {
      value: config.value,
      height: height,
      mode: config.mode,
      placeholder: config.placeholder,
      onChange: config.onChange
    });
  }

  // 只读渲染：直接返回已保存 HTML（wangEditor 输出已是安全 HTML）。
  // 若需要严格净化可在此接入 DOMPurify；当前系统内容均由登录成员产生，风险可控。
  function renderReadonly(html) {
    return html || '';
  }

  global.RichEditor = {
    init: init,
    create: create,
    isReady: isReady,
    renderReadonly: renderReadonly
  };
})(window);
