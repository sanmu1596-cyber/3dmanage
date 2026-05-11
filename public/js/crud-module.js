/**
 * crud-module.js — 通用CRUD模块基类
 * 职责：封装成员、设备、测试、缺陷等模块的通用CRUD操作
 * 减少重复代码，提供统一的load/render/save/delete/filter/export模式
 * 依赖：core.js (showToast, showConfirm, escapeHtml, authFetch, API_BASE)
 */
var App = window.App;

/**
 * CRUDModule 基类
 * 用法示例：
 * const membersModule = new CRUDModule({
 *   name: 'members',
 *   apiPath: '/api/members',
 *   tableId: 'members-table',
 *   rowIdField: 'id',
 *   columns: [...],
 *   formFields: [...],
 *   onLoadSuccess: (data) => { ... },
 *   onSaveSuccess: (result) => { ... }
 * });
 */
class CRUDModule {
    constructor(config) {
        this.name = config.name || 'unknown';           // 模块名称
        this.apiPath = config.apiPath || '';             // API路径
        this.tableId = config.tableId || '';             // 表格容器ID
        this.rowIdField = config.rowIdField || 'id';     // 行ID字段名
        this.columns = config.columns || [];             // 列配置
        this.formFields = config.formFields || [];       // 表单字段
        this.filterFields = config.filterFields || [];   // 筛选字段
        this.onLoadSuccess = config.onLoadSuccess || (() => {});  // 加载成功回调
        this.onSaveSuccess = config.onSaveSuccess || (() => {});  // 保存成功回调
        this.onDeleteSuccess = config.onDeleteSuccess || (() => {}); // 删除成功回调
        
        // 数据缓存
        this.data = [];
        this.filteredData = [];
        this.currentPage = 1;
        this.pageSize = 20;
        this.sortField = null;
        this.sortOrder = 'asc';
        this.filters = {};
    }

    // ========== 数据加载 ==========
    async load(params = {}) {
        try {
            const queryParams = new URLSearchParams(params).toString();
            const url = queryParams ? `${API_BASE}${this.apiPath}?${queryParams}` : `${API_BASE}${this.apiPath}`;
            const resp = await authFetch(url);
            const result = await resp.json();
            
            if (result.success) {
                this.data = result.data || [];
                this.filteredData = [...this.data];
                this.applyLocalFilters();
                this.onLoadSuccess(this.filteredData);
                return this.filteredData;
            } else {
                showToast(result.error || '加载数据失败', 'danger');
                return [];
            }
        } catch (e) {
            console.error(`[${this.name}] 加载失败:`, e);
            showToast(`加载${this.name}数据失败`, 'danger');
            return [];
        }
    }

    // ========== 本地筛选/排序 ==========
    applyLocalFilters() {
        let result = [...this.data];
        
        // 应用筛选条件
        if (Object.keys(this.filters).length > 0) {
            result = result.filter(item => {
                return Object.entries(this.filters).every(([key, value]) => {
                    if (!value) return true;
                    const itemValue = String(item[key] || '').toLowerCase();
                    return itemValue.includes(String(value).toLowerCase());
                });
            });
        }
        
        // 应用排序
        if (this.sortField) {
            result.sort((a, b) => {
                const aVal = a[this.sortField] || '';
                const bVal = b[this.sortField] || '';
                const comparison = String(aVal).localeCompare(String(bVal), 'zh-CN');
                return this.sortOrder === 'desc' ? -comparison : comparison;
            });
        }
        
        this.filteredData = result;
        this.currentPage = 1; // 重置到第一页
    }

    setFilter(field, value) {
        this.filters[field] = value;
        this.applyLocalFilters();
        this.render();
    }

    clearFilters() {
        this.filters = {};
        this.applyLocalFilters();
        this.render();
    }

    setSort(field) {
        if (this.sortField === field) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortOrder = 'asc';
        }
        this.applyLocalFilters();
        this.render();
    }

    // ========== 渲染表格 ==========
    render() {
        const container = document.getElementById(this.tableId);
        if (!container) return;
        
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = this.filteredData.slice(start, end);
        
        if (pageData.length === 0) {
            container.innerHTML = this.renderEmptyState();
            return;
        }
        
        container.innerHTML = pageData.map(item => this.renderRow(item)).join('');
        this.renderPagination();
    }

    renderRow(item) {
        const cells = this.columns.map(col => {
            const value = item[col.key];
            const displayValue = col.render ? col.render(value, item) : this.escapeHtml(String(value || '-'));
            return `<td class="${col.className || ''}" title="${this.escapeHtml(String(value || ''))}">${displayValue}</td>`;
        }).join('');
        
        const rowId = item[this.rowIdField];
        return `<tr data-id="${rowId}" class="data-row">${cells}</tr>`;
    }

    renderEmptyState() {
        return `
            <tr>
                <td colspan="${this.columns.length}" class="empty-state">
                    <div class="empty-state-content">
                        <div class="empty-icon">📋</div>
                        <div class="empty-text">暂无数据</div>
                        <div class="empty-hint">点击上方"新增"按钮创建第一条记录</div>
                    </div>
                </td>
            </tr>
        `;
    }

    renderPagination() {
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        const paginationEl = document.getElementById(this.tableId.replace('table', 'pagination'));
        if (!paginationEl) return;
        
        let html = `<div class="pagination-info">共 ${this.filteredData.length} 条，第 ${this.currentPage}/${totalPages} 页</div>`;
        html += '<div class="pagination-controls">';
        html += `<button ${this.currentPage <= 1 ? 'disabled' : ''} onclick="${this.name}Module.prevPage()">上一页</button>`;
        html += `<input type="number" min="1" max="${totalPages}" value="${this.currentPage}" onchange="${this.name}Module.goToPage(this.value)">`;
        html += `<button ${this.currentPage >= totalPages ? 'disabled' : ''} onclick="${this.name}Module.nextPage()">下一页</button>`;
        html += '</div>';
        
        paginationEl.innerHTML = html;
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.render();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.render();
        }
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        const pageNum = Math.max(1, Math.min(totalPages, parseInt(page) || 1));
        this.currentPage = pageNum;
        this.render();
    }

    setPageSize(size) {
        this.pageSize = size;
        this.currentPage = 1;
        this.render();
    }

    // ========== 保存数据 ==========
    async save(data, id = null) {
        const isEdit = id !== null;
        const method = isEdit ? 'PUT' : 'POST';
        const url = isEdit ? `${API_BASE}${this.apiPath}/${id}` : `${API_BASE}${this.apiPath}`;
        
        try {
            const resp = await safeApiCall(
                isEdit ? `更新${this.name}` : `创建${this.name}`,
                async () => {
                    const result = await authFetch(url, {
                        method,
                        body: JSON.stringify(data)
                    });
                    return result.json();
                }
            );
            
            if (result && result.success) {
                showToast(isEdit ? '更新成功' : '创建成功', 'success');
                this.onSaveSuccess(result);
                await this.load(); // 重新加载数据
                return result;
            } else {
                showToast(result.error || '保存失败', 'danger');
                return null;
            }
        } catch (e) {
            console.error(`[${this.name}] 保存失败:`, e);
            return null;
        }
    }

    // ========== 删除数据 ==========
    async delete(id) {
        const confirmed = await showConfirm('确认删除？此操作不可撤销。', '删除确认');
        if (!confirmed) return false;
        
        try {
            const resp = await safeApiCall(
                `删除${this.name}`,
                async () => {
                    return await authFetch(`${API_BASE}${this.apiPath}/${id}`, { method: 'DELETE' });
                }
            );
            const result = await resp.json();
            
            if (result.success) {
                showToast('删除成功', 'success');
                this.onDeleteSuccess(id);
                await this.load();
                return true;
            } else {
                showToast(result.error || '删除失败', 'danger');
                return false;
            }
        } catch (e) {
            console.error(`[${this.name}] 删除失败:`, e);
            return false;
        }
    }

    // ========== 批量操作 ==========
    async batchDelete(ids) {
        if (!ids || ids.length === 0) {
            showToast('请先选择要删除的记录', 'warning');
            return false;
        }
        
        const confirmed = await showConfirm(`确认删除选中的 ${ids.length} 条记录？此操作不可撤销。`, '批量删除确认');
        if (!confirmed) return false;
        
        try {
            const resp = await safeApiCall(
                `批量删除${this.name}`,
                async () => {
                    return await authFetch(`${API_BASE}${this.apiPath}/batch`, {
                        method: 'DELETE',
                        body: JSON.stringify({ ids })
                    });
                }
            );
            const result = await resp.json();
            
            if (result.success) {
                showToast(`成功删除 ${ids.length} 条记录`, 'success');
                await this.load();
                return true;
            } else {
                showToast(result.error || '批量删除失败', 'danger');
                return false;
            }
        } catch (e) {
            console.error(`[${this.name}] 批量删除失败:`, e);
            return false;
        }
    }

    // ========== 导出Excel ==========
    exportToExcel() {
        if (this.filteredData.length === 0) {
            showToast('没有数据可导出', 'warning');
            return;
        }
        
        const headers = this.columns.map(c => c.label);
        const rows = this.filteredData.map(item => 
            this.columns.map(col => {
                const val = item[col.key];
                return col.render ? col.render(val, item) : val || '';
            })
        );
        
        // 使用已有的exportToExcel逻辑
        if (typeof exportToExcel === 'function') {
            exportToExcel(headers, rows, `${this.name}_导出_${new Date().toLocaleDateString()}`);
        } else {
            // 简单实现
            const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${this.name}_导出_${new Date().toLocaleDateString()}.csv`;
            link.click();
            showToast('导出成功', 'success');
        }
    }

    // ========== 工具方法 ==========
    escapeHtml(text) {
        if (typeof escapeHtml === 'function') return escapeHtml(text);
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getById(id) {
        return this.data.find(item => item[this.rowIdField] == id);
    }

    getSelectedIds() {
        const checkboxes = document.querySelectorAll(`#${this.tableId} .row-checkbox:checked`);
        return Array.from(checkboxes).map(cb => cb.value);
    }
}

// 导出到全局
window.CRUDModule = CRUDModule;
console.log('[CRUDModule] 通用CRUD基类已加载');
