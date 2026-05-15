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
        const isAr = LangManager.currentLang === 'ar';

        const visible = isAdmin ? requests : requests.filter(r => r.employeeId === me.id);
        
        list.innerHTML = '';
        if (visible.length === 0) {
            list.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:4rem; opacity:0.5;">
                <i class="fas fa-file-invoice-dollar" style="font-size:3rem; margin-bottom:1rem; display:block;"></i>
                ${isAr ? 'لا توجد طلبات مصروفات حالياً' : 'No expense requests found'}
            </td></tr>`;
            return;
        }

        // Mobile Handling
        const isMobile = window.innerWidth <= 768;
        const table = list.closest('table');
        const container = list.closest('.table-container');

        if (isMobile) {
            list.classList.add('mobile-view');
            if (table) table.classList.add('mobile-cards');
            if (container) container.style.overflowX = 'visible'; // Allow cards to stack
        } else {
            list.classList.remove('mobile-view');
            if (table) {
                table.classList.remove('mobile-cards');
                table.style.display = ''; 
                const thead = table.querySelector('thead');
                if (thead) thead.style.display = '';
            }
            if (container) container.style.overflowX = 'auto';
        }

        [...visible].sort((a, b) => b.timestamp - a.timestamp).forEach(req => {
            const statusColor = req.status === 'approved' ? 'var(--success)' : (req.status === 'rejected' ? 'var(--danger)' : 'var(--warning)');
            const statusLabel = LangManager.t(req.status.charAt(0).toUpperCase() + req.status.slice(1));

            if (isMobile) {
                const card = document.createElement('div');
                card.className = 'expense-mobile-card glass-effect';
                card.innerHTML = `
                    <div class="card-row">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${req.employeeAvatar || 'https://ui-avatars.com/api/?name='+req.employeeName}" style="width:36px;height:36px;border-radius:50%;">
                            <div>
                                <div style="font-weight:700; font-size:0.9rem;">${req.employeeName}</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">${new Date(req.timestamp).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <span class="badge" style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor}40;">${statusLabel}</span>
                    </div>
                    <div style="font-size:0.95rem; line-height:1.4; margin:0.75rem 0;">${req.description}</div>
                    <div class="card-row" style="margin-top:0.5rem; padding-top:0.75rem; border-top:1px solid var(--border-color);">
                        <div style="font-weight:800; font-size:1.1rem; color:var(--primary-color);">${req.amount} ${isAr ? 'ج.م' : '$'}</div>
                        <div style="display:flex; gap:8px;">
                            ${isAdmin && req.status === 'pending' ? `
                                <button class="btn btn-primary" onclick="ExpenseManager.updateStatus('${req.id}', 'approved')" style="padding:6px 12px;"><i class="fas fa-check"></i></button>
                                <button class="btn" onclick="ExpenseManager.updateStatus('${req.id}', 'rejected')" style="padding:6px 12px; background:rgba(239,68,68,0.1); color:var(--danger); border:1px solid var(--danger);"><i class="fas fa-times"></i></button>
                            ` : `
                                <button onclick="ExpenseManager.deleteRequest('${req.id}')" style="background:rgba(255,255,255,0.05); border:none; color:var(--text-secondary); cursor:pointer; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fas fa-trash-alt"></i></button>
                            `}
                        </div>
                    </div>
                `;
                list.appendChild(card);
            } else {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:1rem;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${req.employeeAvatar || 'https://ui-avatars.com/api/?name='+req.employeeName}" style="width:32px;height:32px;border-radius:50%;">
                            <span>${req.employeeName}</span>
                        </div>
                    </td>
                    <td style="padding:1rem;">${req.description}</td>
                    <td style="padding:1rem; font-weight:800;">${req.amount}</td>
                    <td style="padding:1rem;"><span class="badge" style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor}40;">${statusLabel}</span></td>
                    <td style="padding:1rem;">${new Date(req.timestamp).toLocaleDateString()}</td>
                    <td style="padding:1rem; text-align:center;">
                        ${isAdmin && req.status === 'pending' ? `
                            <div style="display:flex; gap:5px; justify-content:center;">
                                <button class="btn btn-primary" onclick="ExpenseManager.updateStatus('${req.id}', 'approved')" style="padding:4px 10px; font-size:0.75rem;"><i class="fas fa-check"></i></button>
                                <button class="btn" onclick="ExpenseManager.updateStatus('${req.id}', 'rejected')" style="padding:4px 10px; font-size:0.75rem; background:rgba(239,68,68,0.1); color:var(--danger); border:1px solid var(--danger);"><i class="fas fa-times"></i></button>
                            </div>
                        ` : (isAdmin || req.employeeId === me.id ? `
                            <button onclick="ExpenseManager.deleteRequest('${req.id}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
                        ` : '')}
                    </td>
                `;
                list.appendChild(tr);
            }
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
