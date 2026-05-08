/**
 * validator.js — 轻量级输入校验中间件
 *
 * 设计原则：
 * 1. 零依赖，纯函数实现
 * 2. 统一错误格式 { error: "字段说明: 具体原因" }
 * 3. 支持链式调用，按需组合规则
 * 4. 自动 trim 字符串，防御空字符串/超长输入
 *
 * 使用方式：
 *   const { validate, rules } = require('./validator');
 *   app.post('/api/xxx', validate({
 *     title: rules.required().maxLen(200),
 *     priority: rules.enum(['low','medium','high']),
 *     email: rules.optional().email(),
 *   }), handler);
 */

// ==================== 校验规则工厂 ====================

/**
 * 创建一个规则链对象
 */
function createRule() {
  const chain = {
    _required: false,
    _type: null,
    _min: null,
    _max: null,
    _pattern: null,
    _patternMsg: '',
    _enumValues: null,
    _custom: null,

    /** 标记为必填 */
    required(msg) {
      chain._required = true;
      chain._reqMsg = msg || '此字段为必填项';
      return chain;
    },

    /** 标记为可选（默认） */
    optional() {
      chain._required = false;
      return chain;
    },

    /** 限制最小长度/值 */
    min(n, msg) {
      chain._min = n;
      chain._minMsg = msg;
      return chain;
    },

    /** 限制最大长度/值 */
    max(n, msg) {
      chain._max = n;
      chain._maxMsg = msg;
      return chain;
    },

    /** 长度限制快捷方法 */
    maxLen(n, msg) {
      chain._max = n;
      chain._maxMsg = msg || `长度不能超过${n}个字符`;
      return chain;
    },

    minLen(n, msg) {
      chain._min = n;
      chain._minMsg = msg || `至少需要${n}个字符`;
      return chain;
    },

    /** 类型约束 */
    isInt(msg) {
      chain._type = 'int';
      chain._typeMsg = msg || '必须为整数';
      return chain;
    },

    isNumber(msg) {
      chain._type = 'number';
      chain._typeMsg = msg || '必须为数字';
      return chain;
    },

    isBool() {
      chain._type = 'bool';
      return chain;
    },

    /** 正则匹配 */
    pattern(regex, msg) {
      chain._pattern = regex;
      chain._patternMsg = msg || '格式不正确';
      return chain;
    },

    /** 枚举白名单 */
    enum(arr, msg) {
      chain._enumValues = arr;
      chain._enumMsg = msg || `必须为以下值之一: ${arr.join(', ')}`;
      return chain;
    },

    /** Email 格式 */
    email(msg) {
      chain._pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      chain._patternMsg = msg || '邮箱格式不正确';
      return chain;
    },

    /** 自定义校验函数 */
    custom(fn, msg) {
      chain._custom = { fn, msg };
      return chain;
    },

    /**
     * 执行校验，返回错误信息或null（通过）
     * @param {*} value 待校验的值
     * @param {string} fieldName 字段名（用于错误提示）
     * @returns {string|null} 错误信息或null
     */
    run(value, fieldName) {
      const name = fieldName || '字段';

      // 必填检查
      if (chain._required) {
        if (value === undefined || value === null || value === '') {
          return `${name}: ${chain._reqMsg || '不能为空'}`;
        }
        if (typeof value === 'string' && value.trim() === '') {
          return `${name}: 不能为空白字符`;
        }
      }

      // 可选字段 + 空值 → 跳过后续检查
      if (!chain._required && (value === undefined || value === null || value === '')) {
        return null; // 通过
      }

      // 统一处理字符串：trim
      let val = value;
      if (typeof val === 'string') val = val.trim();

      // 类型检查
      if (chain._type === 'int') {
        if (!Number.isInteger(val) && !/^-?\d+$/.test(String(val))) {
          return `${name}: ${chain._typeMsg || '必须为整数'}`;
        }
        val = parseInt(val, 10);
      }
      if (chain._type === 'number') {
        if (isNaN(Number(val))) {
          return `${name}: ${chain._typeMsg || '必须为数字'}`;
        }
        val = Number(val);
      }
      if (chain._type === 'bool') {
        // 不做严格类型检查，JS会自动转换
      }

      // 范围检查（数字）
      if (chain._min !== null && (typeof val === 'number' || chain._type)) {
        if (val < chain._min) {
          return `${name}: ${chain._minMsg || `不能小于${chain._min}`}`;
        }
      }
      if (chain._max !== null && (typeof val === 'number' || chain._type)) {
        if (val > chain._max) {
          return `${name}: ${chain._maxMsg || `不能大于${chain._max}`}`;
        }
      }

      // 长度检查（字符串）
      if (typeof val === 'string' || (typeof value === 'string' && !chain._type)) {
        const strVal = typeof val === 'string' ? val : String(value);
        if (chain._min !== null && strVal.length < chain._min) {
          return `${name}: ${chain._minMsg || `至少${chain._min}个字符`}`;
        }
        if (chain._max !== null && strVal.length > chain._max) {
          return `${name}: ${chain._maxMsg || `不能超过${chain._max}个字符`}`;
        }
      }

      // 正则检查
      if (chain._pattern && typeof val === 'string') {
        if (!chain._pattern.test(val)) {
          return `${name}: ${chain._patternMsg}`;
        }
      }

      // 枚举检查
      if (chain._enumValues) {
        if (!chain._enumValues.includes(val)) {
          return `${name}: ${chain._enumMsg || `无效的取值`}`;
        }
      }

      // 自定义检查
      if (chain._custom) {
        const customErr = chain._custom.fn(val, name);
        if (customErr) return `${name}: ${customErr}`;
      }

      return null; // 全部通过
    }
  };

  return chain;
}

// ==================== 中间件工厂 ====================

/**
 * 校验中间件生成器
 * @param {Object} ruleMap - { 字段名: RuleChain }
 * @returns {Function} Express中间件
 *
 * 示例:
 *   app.post('/api/games', validate({
 *     name: rules.required().maxLen(100),
 *     platform: rules.enum(['Android','iOS','PC']),
 *     priority: rules.default('normal').enum(['low','normal','high']),
 *   }), handler);
 */
function validate(ruleMap) {
  return function validationMiddleware(req, res, next) {
    const errors = [];

    for (const [fieldName, ruleChain] of Object.entries(ruleMap)) {
      const value = req.body[fieldName];
      // 支持嵌套路径如 "device.name"
      let actualValue = value;
      if (fieldName.includes('.')) {
        const parts =fieldName.split('.');
        actualValue = req.body;
        for (const part of parts) {
          actualValue = actualValue?.[part];
        }
      }

      const err = ruleChain.run(actualValue, fieldName);
      if (err) errors.push(err);
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], details: errors });
    }

    next();
  };
}

// ==================== 常用预置规则集 ====================

const rules = {
  // 快捷创建必填字符串
  required: (maxLen = 200) => createRule().required().maxLen(maxLen),

  // 快捷创建可选字符串
  optional: (maxLen = 500) => createRule().optional().maxLen(maxLen),

  // 必填ID
  id: () => createRule().required().isInt().min(1),

  // 可选ID
  optionalId: () => createRule().optional().isInt().min(0),

  // 必填整数范围
  intRange: (min, max) => createRule().required().isInt().min(min).max(max),

  // 可选枚举
  statusEnum: (validStatuses) => createRule().optional().enum(validStatuses),

  // 必填枚举
  requiredEnum: (validValues, fieldName) =>
    createRule().required().enum(validValues, `${fieldName || '状态'}必须为: ${validValues.join('/')}`),

  // 文本域（允许长文本）
  textArea: (maxLen = 5000) => createRule().optional().maxLen(maxLen),
  requiredText: (maxLen = 5000) => createRule().required().maxLen(maxLen),

  // 名称类（常见短文本）
  name: (maxLen = 100) => createRule().required().maxLen(maxLen).minLen(1),

  // URL
  url: () => createRule().optional().pattern(/^https?:\/\/.+$/, 'URL格式不正确'),
};

module.exports = { validate, rules, createRule };
