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
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';
        const isAr = LangManager.currentLang === 'ar';

        const visible = isAdmin ? requests : requests.filter(r => r.employeeId === me.id);
        
        // Update Stats
        const elTotal = document.getElementById('exp-stat-total');
        const elPending = document.getElementById('exp-stat-pending');
        const elApproved = document.getElementById('exp-stat-approved');
        const elAmount = document.getElementById('exp-stat-amount');
        
        let pending = 0, approved = 0, totalAmount = 0;
        visible.forEach(r => {
            if (r.status === 'pending') pending++;
            if (r.status === 'approved') {
                approved++;
                totalAmount += parseFloat(r.amount) || 0;
            }
        });
        
        if (elTotal) elTotal.textContent = visible.length;
        if (elPending) elPending.textContent = pending;
        if (elApproved) elApproved.textContent = approved;
        if (elAmount) elAmount.textContent = totalAmount.toLocaleString() + ' ' + (typeof LangManager !== 'undefined' ? LangManager.t('Currency Symbol') : '$');

        list.innerHTML = '';
        const countEl = document.getElementById('exp-table-count');
        if (countEl) countEl.textContent = visible.length + ' ' + (isAr ? 'طلب' : 'request(s)');

        if (visible.length === 0) {
            list.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; opacity:0.5;">
                <i class="fas fa-file-invoice-dollar" style="font-size:2.5rem; margin-bottom:0.75rem; display:block;"></i>
                <p style="font-size:0.9rem;">${isAr ? 'لا توجد طلبات صرف حالياً' : 'No expense requests found'}</p>
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
                            ${isAdmin && req.status === 'pending' && req.employeeId !== me.id ? `
                                <button class="btn btn-primary" onclick="ExpenseManager.updateStatus('${req.id}', 'approved')" style="padding:6px 12px;" title="قبول"><i class="fas fa-check"></i></button>
                                <button class="btn" onclick="ExpenseManager.updateStatus('${req.id}', 'rejected')" style="padding:6px 12px; background:rgba(239,68,68,0.1); color:var(--danger); border:1px solid var(--danger);" title="رفض"><i class="fas fa-times"></i></button>
                            ` : isAdmin && req.status === 'pending' && req.employeeId === me.id ? `
                                <span style="font-size:0.75rem; color:var(--warning); padding:4px 8px; border-radius:8px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3);">⁠⚠️ ينتظر مدير آخر</span>
                            ` : `
                                <button onclick="ExpenseManager.deleteRequest('${req.id}')" style="background:rgba(255,255,255,0.05); border:none; color:var(--text-secondary); cursor:pointer; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fas fa-trash-alt"></i></button>
                            `}
                        </div>
                    </div>
                `;
                list.appendChild(card);
            } else {
                const tr = document.createElement('tr');
                const statusClass = req.status === 'approved' ? 'approved' : req.status === 'rejected' ? 'rejected' : 'pending';
                const statusIcon = req.status === 'approved' ? '✔' : req.status === 'rejected' ? '✖' : '⏳';
                const dateStr = new Date(req.timestamp).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year:'numeric', month:'short', day:'numeric' });
                tr.innerHTML = `
                    <td>
                        <div style="display:flex;align-items:center;gap:9px;">
                            <img src="${req.employeeAvatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(req.employeeName) + '&background=2563eb&color=fff'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--border-color);">
                            <span style="font-weight:600;">${req.employeeName}</span>
                        </div>
                    </td>
                    <td style="max-width:180px;color:var(--text-secondary);font-size:0.85rem;">${req.description}</td>
                    <td><span class="exp-amount-cell">${parseFloat(req.amount).toLocaleString()} ${isAr ? 'ج.م' : '$'}</span></td>
                    <td><span class="exp-status-badge ${statusClass}">${statusIcon} ${statusLabel}</span></td>
                    <td style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;">${dateStr}</td>
                    <td style="text-align:center;">
                        <div style="display:flex;gap:5px;justify-content:center;align-items:center;flex-wrap:wrap;">
                        ${isAdmin && req.status === 'pending' && req.employeeId !== me.id ? `
                            <button class="exp-action-btn approve" onclick="ExpenseManager.updateStatus('${req.id}', 'approved')"><i class="fas fa-check"></i> قبول</button>
                            <button class="exp-action-btn reject" onclick="ExpenseManager.updateStatus('${req.id}', 'rejected')"><i class="fas fa-times"></i> رفض</button>
                        ` : isAdmin && req.status === 'pending' && req.employeeId === me.id ? `
                            <span class="exp-warn-tag">⚠️ ينتظر مدير آخر</span>
                        ` : (isAdmin || req.employeeId === me.id ? `
                            <button class="exp-action-btn delete" onclick="ExpenseManager.deleteRequest('${req.id}')"><i class="fas fa-trash-alt"></i></button>
                        ` : '')}
                        </div>
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
        // ─── Security Gate: Admin/Manager only, cannot approve own request ───
        const me = AuthManager.currentUser;
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';
        if (!isAdmin) {
            if (window.showToast) showToast('ليس لديك صلاحية للاعتماد', 'error');
            return;
        }

        const requests = Store.get('expenses_requests') || [];
        const req = requests.find(r => r.id === id);
        if (!req) return;

        // Prevent admin from approving their own request
        if (req.employeeId === me.id) {
            if (window.showToast) showToast('لا يمكنك اعتماد طلبك الخاص — يجب مراجعته من مدير آخر', 'warning');
            return;
        }

        req.status = status;
        req.approvedBy = me.name;
        req.approvedAt = new Date().toISOString();
        Store.set('expenses_requests', requests);
        
        const msg = status === 'approved' ? `✔ تم اعتماد طلب صرف (${req.employeeName})` : `✖ تم رفض طلب صرف (${req.employeeName})`;
        if (window.showToast) showToast(msg, status === 'approved' ? 'success' : 'warning');
        NotificationManager.add(msg, 'fa-info-circle', status === 'approved' ? 'success' : 'warning');
    },

    deleteRequest: (id) => {
        const me = AuthManager.currentUser;
        const requests = Store.get('expenses_requests') || [];
        const req = requests.find(r => r.id === id);
        if (!req) return;

        // Only the owner or an admin can delete
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';
        if (!isAdmin && req.employeeId !== me.id) {
            if (window.showToast) showToast('ليس لديك صلاحية حذف هذا الطلب', 'error');
            return;
        }

        // Cannot delete already approved requests (unless super admin)
        if (req.status === 'approved' && me?.role !== 'Super Admin') {
            if (window.showToast) showToast('لا يمكن حذف طلب معتمد — تواصل مع المدير العام', 'warning');
            return;
        }

        if (typeof DriveManager !== 'undefined' && DriveManager.showConfirm) {
            DriveManager.showConfirm('حذف هذا الطلب نهائياً؟', () => {
                Store.set('expenses_requests', (Store.get('expenses_requests') || []).filter(r => r.id !== id));
            });
        } else {
            if (!confirm('حذف هذا الطلب؟')) return;
            Store.set('expenses_requests', (Store.get('expenses_requests') || []).filter(r => r.id !== id));
        }
    }
};

window.ExpenseManager = ExpenseManager;
