
async function saveEquipment() {
    const id = document.getElementById('eq-id').value;
    const body = {
        name: document.getElementById('eq-name').value.trim(),
        equipment_no: document.getElementById('eq-no').value.trim(),
        keeper: document.getElementById('eq-keeper').value.trim(),
        date: document.getElementById('eq-date').value,
        remarks: document.getElementById('eq-remarks').value.trim()
    };
    if (!body.name) { showToast('请填写设备名', 'warning'); return; }
    try {
        if (id) { await authFetch('/api/equipment/' + id, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
        else { await authFetch('/api/equipment', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); }
        showToast('保存成功', 'success'); closeEquipmentModal(); loadEquipment();
    } catch(e) { showToast('保存失败: ' + e.message, 'error'); }
}
function editEquipment(id) { showEquipmentModal(id); }
async function deleteEquipment(id) {
    if (!confirm('确定删除？')) return;
    try { await authFetch('/api/equipment/' + id, { method: 'DELETE' }); showToast('删除成功', 'success'); loadEquipment(); }
    catch(e) { showToast('删除失败: ' + e.message, 'error'); }
}
