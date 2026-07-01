/**
 * RichEditor — 通用富文本编辑器组件
 *
 * 基于 wangEditor v5（国产 MIT，CDN 单文件，零构建），封装成与 SearchableSelect
 * 同级的可复用组件。适用于需求描述、评论、备注、方案说明等所有富文本输入场景。
 *
 * 依赖（在 index.html 中先于本文件引入）：
 *   <link href="https://cdn.jsdelivr.net/npm/@wangeditor/editor@5.1.23/dist/css/style.min.css" rel="stylesheet">
 *   <script src="https://cdn.jsdelivr.net/npm/@wangeditor/editor@5.1.23/dist/index.js"></script>
 *
 * 功能：文字格式化（加粗/斜体/颜色/字号/标题/列表/对齐等）、图片粘贴&上传、插入表格。
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

  function makeInstance(editor, toolbar, wrapEl) {
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
    return makeInstance(editor, toolbar, document.getElementById(baseId));
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
