/**
 * Al-Raed SaaS Platform - Expense Tracking Module
 * Manages employee reimbursement requests and approvals.
 */
const ExpenseManager = {
    init: () => {
        window.addEventListener('storeUpdated', (e) => {
            if (e.detail.key === 'expenses_requests') ExpenseManager.render();
        });
        ExpenseManager.render();
    },

    render: () => {
        const list = document.getElementById('expenses-list');
        if (!list) return;

        const requests = Store.get('expenses_requests') || [];
        const me = AuthManager.currentUser;
        const isAdmin = AuthManager.isSuperAdmin();

        // Filter: Admin sees all, employee sees only theirs
        const visible = isAdmin ? requests : requests.filter(r => r.employeeId === me.id);
        
        list.innerHTML = '';
        if (visible.length === 0) {
            list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; opacity:0.5;">لا توجد طلبات بعد</td></tr>';
            return;
        }

        // Update Stats
        const pending = visible.filter(r => r.status === 'pending').length;
        const approvedSum = visible.filter(r => r.status === 'approved').reduce((sum, r) => sum + parseFloat(r.amount), 0);
        
        const statPending = document.getElementById('exp-stat-pending');
        const statApproved = document.getElementById('exp-stat-approved');
        if (statPending) statPending.textContent = pending;
        if (statApproved) statApproved.textContent = approvedSum.toLocaleString() + (LangManager.currentLang==='ar'?' جنيه':' $');

        [...visible].sort((a, b) => b.timestamp - a.timestamp).forEach(req => {
            const tr = document.createElement('tr');
            const statusColor = req.status === 'approved' ? 'var(--success)' : (req.status === 'rejected' ? 'var(--danger)' : 'var(--warning)');
            const statusLabel = LangManager.t(req.status.charAt(0).toUpperCase() + req.status.slice(1));

            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <img src="${req.employeeAvatar || 'https://ui-avatars.com/api/?name='+req.employeeName}" style="width:30px;height:30px;border-radius:50%;">
                        <span>${req.employeeName}</span>
                    </div>
                </td>
                <td>${req.description}</td>
                <td style="font-weight:800;">${req.amount}</td>
                <td><span class="badge" style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor}40;">${statusLabel}</span></td>
                <td>
                    ${isAdmin && req.status === 'pending' ? `
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-primary" onclick="ExpenseManager.updateStatus('${req.id}', 'approved')" style="padding:4px 10px; font-size:0.75rem;"><i class="fas fa-check"></i></button>
                            <button class="btn btn-secondary" onclick="ExpenseManager.updateStatus('${req.id}', 'rejected')" style="padding:4px 10px; font-size:0.75rem; background:var(--danger); border-color:var(--danger); color:#fff;"><i class="fas fa-times"></i></button>
                        </div>
                    ` : (isAdmin || req.employeeId === me.id ? `
                        <button onclick="ExpenseManager.deleteRequest('${req.id}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
                    ` : '')}
                </td>
            `;
            list.appendChild(tr);
        });
    },

    showRequestModal: () => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:450px;">
                <div class="modal-header">
                    <h2><i class="fas fa-file-invoice-dollar" style="color:var(--primary-color)"></i> ${LangManager.t('Request Reimbursement')}</h2>
                    <button class="close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>${LangManager.t('Description')}</label>
                        <input type="text" id="exp-desc" placeholder="${LangManager.t('e.g., Office Supplies')}">
                    </div>
                    <div class="form-group">
                        <label>${LangManager.t('Amount')}</label>
                        <input type="number" id="exp-amount" placeholder="0.00">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary cancel-modal">${LangManager.t('Cancel')}</button>
                    <button class="btn btn-primary" id="btn-submit-exp">${LangManager.t('Submit Request')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-submit-exp').onclick = () => {
            const desc = modal.querySelector('#exp-desc').value.trim();
            const amount = modal.querySelector('#exp-amount').value.trim();
            if (!desc || !amount) return;

            const me = AuthManager.currentUser;
            const newReq = {
                id: 'exp_' + Date.now(),
                description: desc,
                amount: amount,
                employeeId: me.id,
                employeeName: me.name,
                employeeAvatar: me.avatar,
                status: 'pending',
                timestamp: Date.now()
            };

            const requests = Store.get('expenses_requests') || [];
            requests.push(newReq);
            Store.set('expenses_requests', requests);
            
            NotificationManager.add(LangManager.t('Request submitted'), 'fa-paper-plane', 'success');
            modal.remove();
        };

        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.querySelector('.cancel-modal').onclick = () => modal.remove();
    },

    updateStatus: (id, status) => {
        const requests = Store.get('expenses_requests') || [];
        const req = requests.find(r => r.id === id);
        if (req) {
            req.status = status;
            Store.set('expenses_requests', requests);
            NotificationManager.add(status === 'approved' ? 'تم اعتماد الصرف' : 'تم رفض الطلب', 'fa-info-circle', status==='approved'?'success':'warning');
        }
    },

    deleteRequest: (id) => {
        if (!confirm('حذف هذا الطلب؟')) return;
        const requests = (Store.get('expenses_requests') || []).filter(r => r.id !== id);
        Store.set('expenses_requests', requests);
    }
};

window.ExpenseManager = ExpenseManager;
