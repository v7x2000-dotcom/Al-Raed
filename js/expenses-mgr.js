/**
 * Al-Raed Platform - Expense Tracking Module v3.0
 * Manages employee reimbursement requests, cards display, approvals and sorting.
 */
const ExpenseManager = {
    viewMode: 'grid',
    statusFilter: 'all',
    searchTerm: '',
    sortBy: 'date-desc',

    init: () => {
        window.addEventListener('storeUpdated', (e) => {
            if (e.detail?.key === 'expenses_requests') ExpenseManager.render();
        });
        ExpenseManager.render();
    },

    setViewMode: (mode) => {
        ExpenseManager.viewMode = mode;
        const g = document.getElementById('exp-view-grid-btn');
        const l = document.getElementById('exp-view-list-btn');
        if (g) g.classList.toggle('active', mode === 'grid');
        if (l) l.classList.toggle('active', mode === 'list');

        const gridContainer = document.getElementById('expenses-grid-container');
        const tableWrapper = document.getElementById('expenses-table-wrapper');

        if (gridContainer && tableWrapper) {
            if (mode === 'grid') {
                gridContainer.classList.remove('hidden');
                tableWrapper.classList.add('hidden');
            } else {
                gridContainer.classList.add('hidden');
                tableWrapper.classList.remove('hidden');
            }
        }
        ExpenseManager.render();
    },

    setStatusFilter: (filter) => {
        ExpenseManager.statusFilter = filter;
        const tabs = document.querySelectorAll('#exp-status-tabs .exp-tab-btn-premium');
        const statuses = ['all', 'pending', 'approved', 'rejected'];
        tabs.forEach((tab, index) => {
            tab.classList.toggle('active', statuses[index] === filter);
        });
        ExpenseManager.render();
    },

    handleSearch: (term) => {
        ExpenseManager.searchTerm = term.toLowerCase().trim();
        ExpenseManager.render();
    },

    handleSort: (sortOption) => {
        ExpenseManager.sortBy = sortOption;
        ExpenseManager.render();
    },

    render: () => {
        const grid = document.getElementById('expenses-grid-container');
        const list = document.getElementById('expenses-list');
        if (!grid || !list) return;

        const requests = Store.get('expenses_requests') || [];
        const me = AuthManager.currentUser;
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';
        const isAr = typeof LangManager === 'undefined' || LangManager.currentLang === 'ar';

        // Filter by user role (admin sees all, employee only their own)
        let visible = isAdmin ? requests : requests.filter(r => r.employeeId === me.id);

        // Update stats BEFORE filters (based on visible requests for the user)
        const elTotal = document.getElementById('exp-stat-total');
        const elPending = document.getElementById('exp-stat-pending');
        const elApproved = document.getElementById('exp-stat-approved');
        const elRejected = document.getElementById('exp-stat-rejected');
        const elAmount = document.getElementById('exp-stat-amount');

        let pending = 0, approved = 0, rejected = 0, totalApprovedAmount = 0;
        visible.forEach(r => {
            if (r.status === 'pending') pending++;
            else if (r.status === 'approved') {
                approved++;
                totalApprovedAmount += parseFloat(r.amount) || 0;
            } else if (r.status === 'rejected') rejected++;
        });

        if (elTotal) elTotal.textContent = visible.length;
        if (elPending) elPending.textContent = pending;
        if (elApproved) elApproved.textContent = approved;
        if (elRejected) elRejected.textContent = rejected;
        if (elAmount) elAmount.textContent = totalApprovedAmount.toLocaleString() + ' ' + (isAr ? 'ج.م' : '$');

        // Apply filters
        // 1. Status Filter
        if (ExpenseManager.statusFilter !== 'all') {
            visible = visible.filter(r => r.status === ExpenseManager.statusFilter);
        }

        // 2. Search Term Filter
        if (ExpenseManager.searchTerm) {
            visible = visible.filter(r => 
                (r.employeeName || '').toLowerCase().includes(ExpenseManager.searchTerm) ||
                (r.description || '').toLowerCase().includes(ExpenseManager.searchTerm)
            );
        }

        // Apply sorting
        visible.sort((a, b) => {
            if (ExpenseManager.sortBy === 'date-desc') return b.timestamp - a.timestamp;
            if (ExpenseManager.sortBy === 'date-asc') return a.timestamp - b.timestamp;
            if (ExpenseManager.sortBy === 'amount-desc') return parseFloat(b.amount) - parseFloat(a.amount);
            if (ExpenseManager.sortBy === 'amount-asc') return parseFloat(a.amount) - parseFloat(b.amount);
            return 0;
        });

        // Update count badge
        const countEl = document.getElementById('exp-table-count');
        if (countEl) {
            countEl.textContent = visible.length + ' ' + (isAr ? 'طلب' : 'request(s)');
        }

        // Render empty state
        if (visible.length === 0) {
            const emptyMsg = `
                <div class="drive-empty-state" style="padding:4rem 2rem; grid-column: 1/-1;">
                    <div class="empty-icon-box" style="background:rgba(37,99,235,0.05); color:var(--primary-color);">
                        <i class="fas fa-file-invoice-dollar" style="font-size: 2.2rem;"></i>
                    </div>
                    <h3>${isAr ? 'لا توجد طلبات صرف حالياً' : 'No expense requests found'}</h3>
                    <p>${isAr ? 'لم نجد أي طلبات مطابقة لمعايير البحث أو التصفية الحالية.' : 'We could not find any requests matching your filters.'}</p>
                </div>`;
            
            grid.innerHTML = emptyMsg;
            list.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; opacity:0.6;">
                <i class="fas fa-file-invoice-dollar" style="font-size:2.5rem; margin-bottom:0.75rem; display:block; color:var(--text-secondary);"></i>
                <p style="font-size:0.9rem;">${isAr ? 'لا توجد طلبات صرف مطابقة حالياً' : 'No matching expense requests found'}</p>
            </td></tr>`;
            return;
        }

        // Clear contents
        grid.innerHTML = '';
        list.innerHTML = '';

        visible.forEach(req => {
            const statusColor = req.status === 'approved' ? 'var(--success)' : (req.status === 'rejected' ? 'var(--danger)' : 'var(--warning)');
            const statusLabel = isAr ? 
                (req.status === 'approved' ? 'معتمد' : req.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار') :
                (req.status.charAt(0).toUpperCase() + req.status.slice(1));
            
            const statusIcon = req.status === 'approved' ? 'fa-check-circle' : (req.status === 'rejected' ? 'fa-times-circle' : 'fa-hourglass-half');
            const dateStr = new Date(req.timestamp).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year:'numeric', month:'short', day:'numeric' });
            const avatarUrl = req.employeeAvatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(req.employeeName) + '&background=2563eb&color=fff';

            // --- Render Cards View ---
            const card = document.createElement('div');
            card.className = 'exp-card-premium';
            card.innerHTML = `
                <div class="exp-card-header">
                    <div class="exp-card-user">
                        <img class="exp-card-avatar" src="${avatarUrl}" alt="Avatar">
                        <div class="exp-card-usermeta">
                            <span class="exp-card-username">${req.employeeName}</span>
                            <span class="exp-card-userrole">${req.employeeId === 'admin' ? (isAr ? 'مدير عام' : 'Manager') : (isAr ? 'موظف' : 'Employee')}</span>
                        </div>
                    </div>
                    <span class="exp-card-badge ${req.status}">
                        <i class="fas ${statusIcon}"></i> ${statusLabel}
                    </span>
                </div>
                <div class="exp-card-body">${req.description}</div>
                <div class="exp-card-footer">
                    <span class="exp-card-amount">${parseFloat(req.amount).toLocaleString()} ${isAr ? 'ج.م' : '$'}</span>
                    <div class="exp-card-actions">
                        ${isAdmin && req.status === 'pending' && req.employeeId !== me.id ? `
                            <button class="exp-card-btn approve" onclick="ExpenseManager.updateStatus('${req.id}', 'approved')" title="${isAr ? 'قبول واعتماد' : 'Approve'}"><i class="fas fa-check"></i></button>
                            <button class="exp-card-btn reject" onclick="ExpenseManager.updateStatus('${req.id}', 'rejected')" title="${isAr ? 'رفض الطلب' : 'Reject'}"><i class="fas fa-times"></i></button>
                        ` : isAdmin && req.status === 'pending' && req.employeeId === me.id ? `
                            <span class="exp-card-warn">⚠️ ينتظر مدير آخر</span>
                        ` : `
                            <span class="exp-card-date"><i class="far fa-calendar-alt"></i> ${dateStr}</span>
                        `}
                        
                        ${isAdmin || req.employeeId === me.id ? `
                            <button class="exp-card-btn delete" onclick="ExpenseManager.deleteRequest('${req.id}')" title="${isAr ? 'حذف' : 'Delete'}"><i class="fas fa-trash-alt"></i></button>
                        ` : ''}
                    </div>
                </div>
            `;
            grid.appendChild(card);

            // --- Render Table View ---
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <img src="${avatarUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.05);box-shadow:0 2px 5px rgba(0,0,0,0.2);">
                        <span style="font-weight:700;color:var(--text-primary);">${req.employeeName}</span>
                    </div>
                </td>
                <td style="max-width:220px;color:var(--text-secondary);font-weight:500;">${req.description}</td>
                <td><span class="exp-amount-cell" style="font-size:1rem;">${parseFloat(req.amount).toLocaleString()} ${isAr ? 'ج.م' : '$'}</span></td>
                <td><span class="exp-status-badge ${req.status}"><i class="fas ${statusIcon}"></i> ${statusLabel}</span></td>
                <td style="font-size:0.825rem;color:var(--text-secondary);white-space:nowrap;font-weight:600;"><i class="far fa-calendar-alt"></i> ${dateStr}</td>
                <td style="text-align:center;">
                    <div style="display:flex;gap:6px;justify-content:center;align-items:center;">
                    ${isAdmin && req.status === 'pending' && req.employeeId !== me.id ? `
                        <button class="exp-action-btn approve" onclick="ExpenseManager.updateStatus('${req.id}', 'approved')"><i class="fas fa-check"></i> ${isAr ? 'قبول' : 'Approve'}</button>
                        <button class="exp-action-btn reject" onclick="ExpenseManager.updateStatus('${req.id}', 'rejected')" style="background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.25);"><i class="fas fa-times"></i> ${isAr ? 'رفض' : 'Reject'}</button>
                    ` : isAdmin && req.status === 'pending' && req.employeeId === me.id ? `
                        <span class="exp-warn-tag" style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); color:#f59e0b; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:600;">⚠️ ينتظر مدير آخر</span>
                    ` : ''}
                    
                    ${isAdmin || req.employeeId === me.id ? `
                        <button class="exp-action-btn delete" onclick="ExpenseManager.deleteRequest('${req.id}')" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:var(--text-secondary); width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:8px;"><i class="fas fa-trash-alt"></i></button>
                    ` : ''}
                    </div>
                </td>
            `;
            list.appendChild(tr);
        });
    },

    showRequestModal: () => {
        const isAr = typeof LangManager === 'undefined' || LangManager.currentLang === 'ar';
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10500';
        modal.innerHTML = `
            <div class="modal-content glass-panel-premium" style="max-width:450px;">
                <div class="modal-header">
                    <h2><i class="fas fa-file-invoice-dollar" style="color:var(--primary-color)"></i> ${isAr ? 'تقديم طلب صرف جديد' : 'Request Reimbursement'}</h2>
                    <button class="close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding:1.5rem 0;">
                    <div class="form-group-premium" style="margin-bottom:1.2rem;">
                        <label style="display:block; margin-bottom:0.5rem; font-weight:600;"><i class="fas fa-edit"></i> ${isAr ? 'وصف المصروف' : 'Description'}</label>
                        <input type="text" id="exp-desc" class="select-modern" style="width:100%; box-sizing:border-box;" placeholder="${isAr ? 'مثال: مستلزمات مكتبية، صيانة الطابعات...' : 'e.g., Office Supplies'}">
                    </div>
                    <div class="form-group-premium">
                        <label style="display:block; margin-bottom:0.5rem; font-weight:600;"><i class="fas fa-coins"></i> ${isAr ? 'المبلغ المطلوب' : 'Amount'}</label>
                        <input type="number" id="exp-amount" class="select-modern" style="width:100%; box-sizing:border-box;" placeholder="0.00">
                    </div>
                </div>
                <div class="modal-footer" style="padding-top:1rem; border-top:1px solid rgba(255,255,255,0.05);">
                    <button class="btn btn-glass-cancel cancel-modal">${isAr ? 'إلغاء' : 'Cancel'}</button>
                    <button class="glow-btn-primary" id="btn-submit-exp">${isAr ? 'إرسال الطلب للاعتماد' : 'Submit Request'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-submit-exp').onclick = () => {
            const desc = modal.querySelector('#exp-desc').value.trim();
            const amount = modal.querySelector('#exp-amount').value.trim();
            if (!desc || !amount || parseFloat(amount) <= 0) {
                if (window.showToast) showToast(isAr ? 'يرجى إدخال وصف ومبلغ صالحين' : 'Please enter valid description and amount', 'warning');
                return;
            }

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
            requests.unshift(newReq); // Add to the top
            Store.set('expenses_requests', requests);
            
            if (window.showToast) showToast(isAr ? 'تم تقديم الطلب بنجاح وهو بانتظار الاعتماد' : 'Request submitted successfully', 'success');
            modal.remove();
        };

        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.querySelector('.cancel-modal').onclick = () => modal.remove();
    },

    updateStatus: (id, status) => {
        const me = AuthManager.currentUser;
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';
        const isAr = typeof LangManager === 'undefined' || LangManager.currentLang === 'ar';

        if (!isAdmin) {
            if (window.showToast) showToast(isAr ? 'ليس لديك صلاحية لتعديل حالة الطلبات' : 'No permission to update request status', 'error');
            return;
        }

        const requests = Store.get('expenses_requests') || [];
        const req = requests.find(r => r.id === id);
        if (!req) return;

        // Prevent admin from approving their own request
        if (req.employeeId === me.id) {
            if (window.showToast) showToast(isAr ? 'لا يمكنك اعتماد طلبك الخاص — يجب مراجعته من مدير آخر' : 'You cannot approve your own request', 'warning');
            return;
        }

        req.status = status;
        req.approvedBy = me.name;
        req.approvedAt = new Date().toISOString();
        Store.set('expenses_requests', requests);
        
        const statusText = status === 'approved' ? (isAr ? 'اعتماد' : 'approved') : (isAr ? 'رفض' : 'rejected');
        const msg = isAr ? `تم ${statusText} طلب صرف الموظف (${req.employeeName})` : `Expense request of (${req.employeeName}) was ${statusText}`;
        
        if (window.showToast) showToast(msg, status === 'approved' ? 'success' : 'warning');
        if (window.NotificationManager) NotificationManager.add(msg, 'fa-info-circle', status === 'approved' ? 'success' : 'warning');
        else if (window.Notifications) Notifications.add(isAr ? 'تنبيه المصروفات' : 'Expense Alert', msg, status === 'approved' ? 'success' : 'warning');
    },

    deleteRequest: (id) => {
        const me = AuthManager.currentUser;
        const requests = Store.get('expenses_requests') || [];
        const req = requests.find(r => r.id === id);
        if (!req) return;

        const isAr = typeof LangManager === 'undefined' || LangManager.currentLang === 'ar';
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';

        if (!isAdmin && req.employeeId !== me.id) {
            if (window.showToast) showToast(isAr ? 'ليس لديك صلاحية حذف هذا الطلب' : 'No permission to delete this request', 'error');
            return;
        }

        // Cannot delete approved requests (unless super admin)
        if (req.status === 'approved' && me?.role !== 'Super Admin') {
            if (window.showToast) showToast(isAr ? 'لا يمكن حذف طلب معتمد — يرجى مراجعة الإدارة العليا' : 'Approved requests cannot be deleted', 'warning');
            return;
        }

        const proceedDelete = () => {
            const updated = (Store.get('expenses_requests') || []).filter(r => r.id !== id);
            Store.set('expenses_requests', updated);
            if (window.showToast) showToast(isAr ? 'تم حذف طلب الصرف نهائياً' : 'Request deleted successfully', 'success');
        };

        if (typeof DriveManager !== 'undefined' && DriveManager.showConfirm) {
            DriveManager.showConfirm(isAr ? 'هل أنت متأكد من حذف هذا طلب الصرف نهائياً؟' : 'Are you sure you want to delete this request permanently?', () => {
                proceedDelete();
            });
        } else {
            if (confirm(isAr ? 'حذف هذا الطلب؟' : 'Delete this request?')) {
                proceedDelete();
            }
        }
    }
};

window.ExpenseManager = ExpenseManager;
