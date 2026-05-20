/**
 * Al-Raed — TeamManager v3.0
 * Full Hierarchy Tree + Directory View + Stats + CRUD
 */
const TeamManager = {

    /* ─── State ─────────────────────────────── */
    currentView: 'directory',  // 'directory' | 'hierarchy'
    zoom: 1,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    scrollStart: { x: 0, y: 0 },
    editingId: null,

    LEVEL_ORDER: ['CEO', 'General Manager', 'HR', 'Legal Accountant', 'Legal Advisor', 'Administrator', 'Trainer', 'Employee'],
    LEVEL_LABELS: {
        CEO: 'المدير التنفيذي',
        'General Manager': 'المدير العام',
        HR: 'موارد بشرية (HR)',
        'Legal Accountant': 'محاسب قانوني',
        'Legal Advisor': 'مستشار قانوني',
        Administrator: 'إداري',
        Trainer: 'مدرب',
        Employee: 'موظف'
    },

    /* ─── Init ──────────────────────────────── */
    init: () => {
        TeamManager.bindEvents();
        TeamManager.render();
        TeamManager.updateStats();
        TeamManager.populateDeptFilter();
    },

    /* ─── Events ────────────────────────────── */
    bindEvents: () => {
        // View toggles
        document.getElementById('btn-view-directory')?.addEventListener('click', () => TeamManager.switchView('directory'));
        document.getElementById('btn-view-hierarchy')?.addEventListener('click', () => TeamManager.switchView('hierarchy'));

        // Add member
        document.getElementById('btn-add-team-member')?.addEventListener('click', () => TeamManager.openAddEdit(null));

        // Search + filters
        document.getElementById('team-search')?.addEventListener('input', TeamManager.applyFilters);
        document.getElementById('filter-dept')?.addEventListener('change', TeamManager.applyFilters);
        document.getElementById('filter-level')?.addEventListener('change', TeamManager.applyFilters);
        document.getElementById('filter-status')?.addEventListener('change', TeamManager.applyFilters);



        // Modal close buttons
        document.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            });
        });

        // Save member
        document.getElementById('save-team-member')?.addEventListener('click', TeamManager.saveMember);
    },

    /* ─── View Switch ───────────────────────── */
    switchView: (view) => {
        TeamManager.currentView = view;
        document.getElementById('team-directory-view')?.classList.toggle('hidden', view !== 'directory');
        document.getElementById('team-hierarchy-view')?.classList.toggle('hidden', view !== 'hierarchy');
        document.getElementById('btn-view-directory')?.classList.toggle('active', view === 'directory');
        document.getElementById('btn-view-hierarchy')?.classList.toggle('active', view === 'hierarchy');
        if (view === 'hierarchy') TeamManager.renderHierarchy();
    },

    /* ─── Stats ─────────────────────────────── */
    updateStats: () => {
        const team = Store.get('team') || [];
        const depts = [...new Set(team.map(m => m.dept).filter(Boolean))];
        const active = team.filter(m => (m.status || 'Active') === 'Active');
        const top = team.filter(m => ['CEO', 'General Manager'].includes(m.jobLevel));

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('stat-total-members', team.length);
        set('stat-total-depts', depts.length || 1);
        set('stat-active-members', active.length);
        set('stat-top-execs', top.length);
    },

    /* ─── Populate dept filter ──────────────── */
    populateDeptFilter: () => {
        const sel = document.getElementById('filter-dept');
        if (!sel) return;
        const team = Store.get('team') || [];
        const depts = [...new Set(team.map(m => m.dept).filter(Boolean))];
        // Keep first option, replace rest
        while (sel.options.length > 1) sel.remove(1);
        depts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d;
            sel.appendChild(opt);
        });
    },

    /* ─── Filters / Search ──────────────────── */
    applyFilters: () => {
        const q = (document.getElementById('team-search')?.value || '').toLowerCase();
        const dept = document.getElementById('filter-dept')?.value || '';
        const level = document.getElementById('filter-level')?.value || '';
        const status = document.getElementById('filter-status')?.value || '';

        if (TeamManager.currentView === 'directory') {
            const cards = document.querySelectorAll('#team-grid .team-card');
            cards.forEach(card => {
                const name = (card.dataset.name || '').toLowerCase();
                const d = card.dataset.dept || '';
                const l = card.dataset.level || '';
                const s = card.dataset.status || '';
                const match = (!q || name.includes(q))
                    && (!dept || d === dept)
                    && (!level || l === level)
                    && (!status || s === status);
                card.style.display = match ? '' : 'none';
            });
        } else {
            const nodes = document.querySelectorAll('.org-node');
            const any = q || dept || level || status;
            nodes.forEach(node => {
                const name = (node.dataset.name || '').toLowerCase();
                const d = node.dataset.dept || '';
                const l = node.dataset.level || '';
                const s = node.dataset.status || '';
                const match = (!q || name.includes(q))
                    && (!dept || d === dept)
                    && (!level || l === level)
                    && (!status || s === status);
                node.classList.toggle('search-dim', any && !match);
                node.classList.toggle('search-match', any && match);
            });
        }
    },

    /* ─── Directory Render ──────────────────── */
    render: () => {
        const grid = document.getElementById('team-grid');
        if (!grid) return;
        const team = Store.get('team') || [];
        const me = AuthManager.currentUser;
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';

        grid.innerHTML = '';

        if (team.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-secondary);">
                <i class="fas fa-users" style="font-size:3rem;opacity:0.2;display:block;margin-bottom:1rem;"></i>
                <p>لا يوجد أعضاء بعد. أضف أول موظف في فريقك!</p>
            </div>`;
            TeamManager.updateStats();
            return;
        }

        team.forEach(member => {
            const avatar = member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=2563eb&color=fff&bold=true&size=256`;
            const isOnline = (Store._onlineUsers || []).some(p => (p.id || p) === member.id && (Date.now() - (p.timestamp || 0) < 60000));
            const statusColor = { Active: '#10b981', Inactive: '#9ca3af', 'On Leave': '#f59e0b' };
            const levelGradients = {
                CEO: 'linear-gradient(135deg,#f59e0b,#ef4444)',
                'General Manager': 'linear-gradient(135deg,#8b5cf6,#d946ef)',
                HR: 'linear-gradient(135deg,#0ea5e9,#3b82f6)',
                'Legal Accountant': 'linear-gradient(135deg,#10b981,#059669)',
                'Legal Advisor': 'linear-gradient(135deg,#6366f1,#4338ca)',
                Administrator: 'linear-gradient(135deg,#f97316,#ea580c)',
                Trainer: 'linear-gradient(135deg,#14b8a6,#0f766e)',
                Employee: 'linear-gradient(135deg,#64748b,#475569)'
            };
            const grad = levelGradients[member.jobLevel] || levelGradients.Employee;
            const card = document.createElement('div');
            card.className = 'team-card';
            card.dataset.id = member.id;
            card.dataset.name = member.name;
            card.dataset.dept = member.dept || '';
            card.dataset.level = member.jobLevel || '';
            card.dataset.status = member.status || 'Active';

            card.innerHTML = `
                <div class="team-card-header" style="background:${grad}"></div>
                <div class="team-card-avatar-wrapper">
                    <img src="${avatar}" alt="${member.name}" loading="lazy">
                    <span class="status-dot ${isOnline ? 'status-pulse' : ''}" style="background:${isOnline ? '#10b981' : statusColor[member.status || 'Active'] || '#9ca3af'};"></span>
                </div>
                <div class="team-card-body">
                    <h3>${member.name}</h3>
                    <div class="member-title">${member.title || member.jobLevel || 'موظف'}</div>
                    <div class="role-badge" style="background:rgba(37,99,235,0.1);color:#3b82f6;">
                        <i class="fas fa-building" style="font-size:0.6rem;"></i> ${member.dept || 'غير محدد'}
                    </div>
                    <div style="display:flex;gap:0.5rem;width:100%;margin-top:0.5rem;">
                        <button class="team-card-btn team-card-btn-primary" style="flex:1;" onclick="TeamManager.showDetail('${member.id}')">
                            <i class="fas fa-eye"></i> عرض
                        </button>
                        ${isAdmin ? `<button class="team-card-btn team-card-btn-outline" style="flex:1;" onclick="TeamManager.openAddEdit('${member.id}')">
                            <i class="fas fa-pen"></i> تعديل
                        </button>` : ''}
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        TeamManager.updateStats();
        TeamManager.populateDeptFilter();
    },

    /* ─── Hierarchy Render ──────────────────── */
    renderHierarchy: () => {
        const wrapper = document.getElementById('hierarchy-tree-wrapper');
        if (!wrapper) return;
        const team = Store.get('team') || [];

        if (team.length === 0) {
            wrapper.innerHTML = `<div class="hierarchy-empty"><i class="fas fa-sitemap"></i><h3>لا يوجد موظفون لعرض الهيكل التنظيمي</h3></div>`;
            return;
        }

        // Group by jobLevel
        const levels = TeamManager.LEVEL_ORDER;
        const grouped = {};
        levels.forEach(l => { grouped[l] = []; });

        team.forEach(m => {
            const lv = m.jobLevel || 'Employee';
            if (grouped[lv]) grouped[lv].push(m);
            else if (grouped['Employee']) grouped['Employee'].push(m);
        });

        // Define Tiers for Tree Rendering
        const tiers = [
            ['CEO'],
            ['General Manager'],
            ['HR', 'Legal Accountant', 'Legal Advisor', 'Administrator'],
            ['Trainer'],
            ['Employee']
        ];

        // Build tree HTML tier by tier
        let html = '<div class="org-tree-root">';

        tiers.forEach((tierLevels, idx) => {
            let members = [];
            tierLevels.forEach(l => {
                if (grouped[l]) members = members.concat(grouped[l]);
            });
            
            if (!members.length) return;

            html += `<div class="org-level${members.length > 1 ? ' has-siblings' : ''}">`;
            members.forEach(m => {
                html += TeamManager._nodeHTML(m, idx);
            });
            html += '</div>';
        });

        html += '</div>';
        wrapper.innerHTML = html;


    },

    _nodeHTML: (m, levelIdx) => {
        const avatar = m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=0f172a&color=fff&bold=true&size=128`;
        const isOnline = (Store._onlineUsers || []).some(p => (p.id || p) === m.id);
        const statusColor = { Active: '#10b981', Inactive: '#9ca3af', 'On Leave': '#f59e0b' };
        const sc = statusColor[m.status || 'Active'];
        return `
        <div class="org-node-wrap">
            ${levelIdx > 0 ? '<div class="org-connector-top"></div>' : ''}
            <div class="org-node" data-level="${levelIdx}" data-id="${m.id}"
                 data-name="${m.name}" data-dept="${m.dept || ''}"
                 data-level-name="${m.jobLevel || 'Employee'}" data-status="${m.status || 'Active'}"
                 onclick="TeamManager.showDetail('${m.id}')">
                <span class="node-status-dot" style="background:${sc};"></span>
                <img class="node-avatar" src="${avatar}" alt="${m.name}" loading="lazy">
                <div class="node-name">${m.name}</div>
                <div class="node-job">${m.title || TeamManager.LEVEL_LABELS[m.jobLevel] || 'موظف'}</div>
                <div class="node-dept-pill">${m.dept || 'عام'}</div>
                <button class="node-detail-btn" onclick="event.stopPropagation();TeamManager.showDetail('${m.id}')">
                    <i class="fas fa-info-circle"></i> تفاصيل
                </button>
            </div>
        </div>`;
    },



    /* ─── Employee Detail Modal ─────────────── */
    showDetail: (id) => {
        const team = Store.get('team') || [];
        const m = team.find(t => t.id === id);
        if (!m) return;

        const tasks = (Store.get('tasks') || []).filter(t => t.assignee === id || t.assigneeId === id);
        const avatar = m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=2563eb&color=fff&bold=true&size=256`;
        const me = AuthManager.currentUser;
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';
        const statusColor = { Active: '#10b981', Inactive: '#ef4444', 'On Leave': '#f59e0b' };
        const perms = m.permissions || {};
        const permKeys = Object.keys(perms).filter(k => perms[k] === true);

        const modal = document.getElementById('employee-detail-modal');
        if (!modal) return;

        document.getElementById('emp-detail-content').innerHTML = `
            <div class="emp-detail-wide">

                <!-- Left Panel: Avatar + Identity + Actions -->
                <div class="emp-detail-left">
                    <div class="emp-avatar-glow">
                        <img class="emp-detail-avatar-lg" src="${avatar}" alt="${m.name}">
                    </div>
                    <h2 class="emp-name-lg">${m.name}</h2>
                    <p class="emp-title-lg"><i class="fas fa-briefcase" style="color:var(--primary-color);"></i> ${m.title || m.jobLevel || 'موظف'}</p>
                    <span class="emp-status-badge" style="background:${statusColor[m.status||'Active']}22;color:${statusColor[m.status||'Active']};border:1px solid ${statusColor[m.status||'Active']}44;">
                        <span style="width:7px;height:7px;border-radius:50%;background:${statusColor[m.status||'Active']};display:inline-block;"></span>
                        ${m.status || 'Active'}
                    </span>
                    ${isAdmin ? `
                    <div class="emp-action-row">
                        <button class="btn btn-primary emp-modal-btn" onclick="document.getElementById('employee-detail-modal').classList.add('hidden');TeamManager.openAddEdit('${m.id}')">
                            <i class="fas fa-pen"></i> تعديل
                        </button>
                        <button class="btn emp-modal-btn emp-modal-btn-danger" onclick="document.getElementById('employee-detail-modal').classList.add('hidden');TeamManager.removeMember('${m.id}')">
                            <i class="fas fa-trash"></i> حذف
                        </button>
                    </div>` : ''}
                </div>

                <!-- Right Panel: Info Grid -->
                <div class="emp-detail-right">
                    <div class="emp-info-section-title"><i class="fas fa-id-card"></i> بيانات الموظف</div>
                    <div class="emp-detail-grid-wide">
                        <div class="emp-detail-item">
                            <label><i class="fas fa-tag"></i> المسمى الوظيفي</label>
                            <span>${m.title || '—'}</span>
                        </div>
                        <div class="emp-detail-item">
                            <label><i class="fas fa-layer-group"></i> الدرجة الوظيفية</label>
                            <span>${m.jobLevel || '—'}</span>
                        </div>
                        <div class="emp-detail-item">
                            <label><i class="fas fa-building"></i> الإدارة / القسم</label>
                            <span>${m.dept || '—'}</span>
                        </div>
                        <div class="emp-detail-item">
                            <label><i class="fas fa-shield-alt"></i> الصلاحية في النظام</label>
                            <span>${m.role || 'Member'}</span>
                        </div>
                        <div class="emp-detail-item">
                            <label><i class="fas fa-envelope"></i> البريد الإلكتروني</label>
                            <span style="font-size:0.8rem;word-break:break-all;">${m.email || '—'}</span>
                        </div>
                        <div class="emp-detail-item">
                            <label><i class="fas fa-coins"></i> الراتب الشهري</label>
                            <span>${m.salary ? m.salary + ' جنيه' : '—'}</span>
                        </div>
                        <div class="emp-detail-item">
                            <label><i class="fas fa-calendar-alt"></i> تاريخ التوظيف</label>
                            <span>${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('ar-EG') : '—'}</span>
                        </div>
                        <div class="emp-detail-item">
                            <label><i class="fas fa-tasks"></i> عدد المهام</label>
                            <span>${tasks.length} مهمة</span>
                        </div>
                    </div>
                    ${permKeys.length ? `
                    <div class="emp-info-section-title" style="margin-top:1rem;"><i class="fas fa-key"></i> صلاحيات الوصول</div>
                    <div class="emp-perms-grid">${permKeys.map(k => `<span class="emp-perm-tag">${k}</span>`).join('')}</div>` : ''}
                    ${m.notes ? `
                    <div class="emp-info-section-title" style="margin-top:1rem;"><i class="fas fa-sticky-note"></i> ملاحظات</div>
                    <p style="font-size:0.85rem;line-height:1.7;color:var(--text-secondary);margin:0;padding:0.75rem;background:var(--bg-primary);border-radius:10px;border:1px solid var(--border-color);">${m.notes}</p>` : ''}
                </div>

            </div>
        `;
        modal.classList.remove('hidden');
    },

    /* ─── Add / Edit Modal ──────────────────── */
    openAddEdit: (id) => {
        const me = AuthManager.currentUser;
        if (me?.role !== 'Super Admin' && me?.role !== 'Manager') {
            AuthManager.showToast('ليس لديك صلاحية لإضافة أو تعديل الموظفين', 'error'); return;
        }

        TeamManager.editingId = id;
        const team = Store.get('team') || [];
        const m = id ? team.find(t => t.id === id) : null;
        const modal = document.getElementById('team-add-edit-modal');
        if (!modal) return;

        document.getElementById('team-modal-title').textContent = m ? 'تعديل بيانات موظف' : 'إضافة موظف جديد';

        const fields = ['ae-name', 'ae-email', 'ae-title', 'ae-dept', 'ae-salary', 'ae-notes'];
        const vals = { 'ae-name': m?.name, 'ae-email': m?.email, 'ae-title': m?.title,
            'ae-dept': m?.dept, 'ae-salary': m?.salary, 'ae-notes': m?.notes };
        fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = vals[f] || ''; });

        const lvSel = document.getElementById('ae-job-level');
        if (lvSel) lvSel.value = m?.jobLevel || 'Employee';
        const stSel = document.getElementById('ae-status');
        if (stSel) stSel.value = m?.status || 'Active';
        const rlSel = document.getElementById('ae-role');
        if (rlSel) rlSel.value = m?.role || 'Member';

        modal.classList.remove('hidden');
    },

    saveMember: () => {
        const name  = document.getElementById('ae-name')?.value.trim();
        const email = document.getElementById('ae-email')?.value.trim();
        const title = document.getElementById('ae-title')?.value.trim();
        const dept  = document.getElementById('ae-dept')?.value.trim();
        const salary = document.getElementById('ae-salary')?.value.trim();
        const notes = document.getElementById('ae-notes')?.value.trim();
        const jobLevel = document.getElementById('ae-job-level')?.value || 'Employee';
        const status = document.getElementById('ae-status')?.value || 'Active';
        const role = document.getElementById('ae-role')?.value || 'Member';

        if (!name || !email) { AuthManager.showToast('الاسم والبريد الإلكتروني مطلوبان', 'error'); return; }

        const me = AuthManager.currentUser;
        let team = Store.get('team') || [];
        let users = Store.get('users') || [];

        if (TeamManager.editingId) {
            // Update
            const idx = team.findIndex(t => t.id === TeamManager.editingId);
            if (idx > -1) {
                team[idx] = { ...team[idx], name, email, title, dept, salary, notes, jobLevel, status, role };
                const uidx = users.findIndex(u => u.id === TeamManager.editingId);
                if (uidx > -1) users[uidx] = { ...users[uidx], name, email, title, dept, role };
            }
            Store.log('تعديل موظف', `${name}`);
            AuthManager.showToast(`✅ تم تحديث بيانات ${name}`);
        } else {
            // Check duplicate
            if (team.find(t => t.email === email)) { AuthManager.showToast('يوجد موظف بهذا البريد مسبقاً', 'error'); return; }
            const newMember = {
                id: 'user_' + Date.now(), name, email, title, dept, salary, notes,
                jobLevel, status, role: me?.role === 'Super Admin' ? role : 'Member',
                avatar: null, joinedAt: new Date().toISOString()
            };
            team.push(newMember);
            if (!users.find(u => u.email === email)) {
                users.push({ ...newMember, password: 'password123' });
            }
            Store.log('إضافة موظف', `${name} (${jobLevel})`);
            AuthManager.showToast(`✅ تمت إضافة ${name} بنجاح. كلمة المرور الافتراضية: password123`);
        }

        Store.set('team', team);
        Store.set('users', users);
        document.getElementById('team-add-edit-modal')?.classList.add('hidden');
        TeamManager.render();
        if (TeamManager.currentView === 'hierarchy') TeamManager.renderHierarchy();
        TeamManager.updateStats();
        TeamManager.populateDeptFilter();
        if (typeof App !== 'undefined') App.updateDashboardStats();
    },

    removeMember: (memberId) => {
        const me = AuthManager.currentUser;
        if (me?.role !== 'Super Admin') { AuthManager.showToast('فقط المدير العام يمكنه حذف الموظفين', 'error'); return; }

        askConfirm('هل تريد حذف هذا الموظف بشكل نهائي؟', () => {
            let team = Store.get('team') || [];
            const member = team.find(m => m.id === memberId);
            if (member?.role === 'Super Admin') { AuthManager.showToast('لا يمكن حذف المدير العام', 'error'); return; }
            team = team.filter(m => m.id !== memberId);
            Store.set('team', team);
            let users = Store.get('users') || [];
            users = users.filter(u => u.id !== memberId);
            Store.set('users', users);
            Store.log('حذف موظف', member?.name || memberId);
            TeamManager.render();
            if (TeamManager.currentView === 'hierarchy') TeamManager.renderHierarchy();
            TeamManager.updateStats();
            if (typeof App !== 'undefined') App.updateDashboardStats();
            AuthManager.showToast(`🗑️ تم حذف ${member?.name || 'الموظف'}`);
        });
    },

    openChat: (memberId) => {
        const navItem = document.querySelector('.nav-item[data-target="chat-section"]');
        if (navItem) navItem.click();
        setTimeout(() => {
            const privateTab = document.querySelector('.chat-tab[data-type="private"]');
            if (privateTab) privateTab.click();
            setTimeout(() => {
                const userItem = document.querySelector(`.chat-user-item[data-user-id="${memberId}"]`);
                if (userItem) userItem.click();
            }, 300);
        }, 300);
    },

    changeRole: (memberId, newRole) => {
        if (newRole === 'Super Admin') { showAlert('لا يمكن تعيين صلاحية المدير العام'); return; }
        const me = AuthManager.currentUser;
        if (me?.role !== 'Super Admin') { showAlert('فقط المدير العام يمكنه تغيير الصلاحيات'); return; }
        let team = Store.get('team') || [];
        const idx = team.findIndex(m => m.id === memberId);
        if (idx > -1) {
            team[idx].role = newRole;
            Store.set('team', team);
            let users = Store.get('users') || [];
            const uidx = users.findIndex(u => u.id === memberId);
            if (uidx > -1) { users[uidx].role = newRole; Store.set('users', users); }
            Store.log('تغيير صلاحية', `${team[idx].name} → ${newRole}`);
            TeamManager.render();
        }
    }
};

window.TeamManager = TeamManager;
