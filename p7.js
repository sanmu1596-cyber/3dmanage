
function showEquipmentModal(eqId) {
    const isEdit = !!eqId;
    const data = isEdit ? equipmentData.find(r => r.id === eqId) : {};
    let html = '<div class="modal show" id="eq-modal"><div class="modal-content">' +
        '<div class="modal-header"><span class="modal-title">' + (isEdit?'编辑设备':'新增设备') + '</span><span class="modal-close" onclick="closeEquipmentModal()">&times;</span></div>' +
        '<div class="modal-body">' +
        '<input type="hidden" id="eq-id" value="' + (data.id||'') + '">' +
        '<label>设备名 *</label><input type="text" id="eq-name" value="' + escapeHtml(data.name||'') + '">' +
        '<label>设备编号</label><input type="text" id="eq-no" value="' + escapeHtml(data.equipment_no||'') + '">' +
        '<label>保管人</label><input type="text" id="eq-keeper" value="' + escapeHtml(data.keeper||'') + '">' +
        '<label>登记日期</label><input type="date" id="eq-date" value="' + (data.date||new Date().toISOString().slice(0,10)) + '">' +
        '<label>备注</label><textarea id="eq-remarks" rows="3">' + escapeHtml(data.remarks||'') + '</textarea>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button class="btn btn-primary" onclick="saveEquipment()">保存</button>' +
        '<button class="btn" onclick="closeEquipmentModal()">取消</button>' +
        '</div></div></div>';
    document.getElementById('content').insertAdjacentHTML('beforeend', html);
}
function closeEquipmentModal() { const m = document.getElementById('eq-modal'); if (m) m.remove(); }
