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
        
        // Attendance stats for today
        const attendanceLogs = Store.get('attendance_logs') || [];
        const today = new Date().toLocaleDateString('en-CA');
        const presentToday = [...new Set(
            attendanceLogs
                .filter(l => l.date === today && !l.clockOut)
                .map(l => l.userId)
        )].length;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('stat-total-members', team.length);
        set('stat-total-depts', depts.length || 1);
        set('stat-active-members', active.length);
        set('stat-top-execs', top.length);
        set('stat-present-today', presentToday);
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
        const isAdmin = ['Super Admin', 'Admin', 'Manager'].includes(me?.role);
        const allTasks = Store.get('tasks') || [];
        const attendanceLogs = Store.get('attendance_logs') || [];
        const today = new Date().toLocaleDateString('en-CA');

        grid.innerHTML = '';

        if (team.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--text-secondary);">
                <div style="width:80px;height:80px;border-radius:50%;background:rgba(37,99,235,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
                    <i class="fas fa-users" style="font-size:2rem;color:#3b82f6;"></i>
                </div>
                <h3 style="font-size:1.1rem;margin-bottom:0.5rem;color:var(--text-primary);">لا يوجد أعضاء بعد</h3>
                <p style="font-size:0.85rem;">أضف أول موظف في فريقك للبدء!</p>
            </div>`;
            TeamManager.updateStats();
            return;
        }

        team.forEach((member, idx) => {
            const avatar = member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=1e40af&color=fff&bold=true&size=256`;
            const isOnline = (Store._onlineUsers || []).some(p => (p.id || p) === member.id && (Date.now() - (p.timestamp || 0) < 90000));
            
            // Attendance status for today
            const todayLogs = attendanceLogs.filter(l => l.userId === member.id && l.date === today);
            const activeLog = todayLogs.find(l => !l.clockOut);
            const isClockedIn = !!activeLog;
            const hasWorkedToday = todayLogs.length > 0;

            // Task stats for this member
            const memberTasks = allTasks.filter(t => 
                t.assignees?.includes(member.id) || 
                t.assignee === member.id ||
                t.assignType === 'all'
            );
            const doneTasks = memberTasks.filter(t => t.status === 'done').length;
            const activeTasks = memberTasks.filter(t => t.status === 'inprogress').length;

            const statusColors = { Active: '#10b981', Inactive: '#ef4444', 'On Leave': '#f59e0b' };
            const memberStatus = member.status || 'Active';
            
            const levelGradients = {
                CEO: 'linear-gradient(135deg, #f59e0b 0%, #dc2626 100%)',
                'General Manager': 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
                HR: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                'Legal Accountant': 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                'Legal Advisor': 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                Administrator: 'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)',
                Trainer: 'linear-gradient(135deg, #0f766e 0%, #0369a1 100%)',
                Employee: 'linear-gradient(135deg, #475569 0%, #334155 100%)'
            };
            const grad = levelGradients[member.jobLevel] || levelGradients.Employee;

            const roleColors = {
                'Super Admin': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', icon: 'fa-crown' },
                'Admin': { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', icon: 'fa-shield-alt' },
                'Manager': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', icon: 'fa-user-tie' },
                'Supervisor': { bg: 'rgba(20,184,166,0.15)', color: '#14b8a6', icon: 'fa-user-check' },
                'Employee': { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', icon: 'fa-user' },
                'Member': { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', icon: 'fa-user' },
            };
            const roleStyle = roleColors[member.role] || roleColors['Employee'];

            const card = document.createElement('div');
            card.className = 'team-card';
            card.style.animationDelay = `${idx * 0.05}s`;
            card.dataset.id = member.id;
            card.dataset.name = member.name;
            card.dataset.dept = member.dept || '';
            card.dataset.level = member.jobLevel || '';
            card.dataset.status = memberStatus;

            card.innerHTML = `
                <!-- Gradient Header Banner -->
                <div class="team-card-header" style="background:${grad};">
                    <div class="team-card-header-shine"></div>
                </div>
                
                <!-- Attendance Chip -->
                <div class="attendance-chip ${isClockedIn ? 'clocked-in' : (hasWorkedToday ? 'clocked-out' : '')}">
                    <span class="attendance-chip-dot"></span>
                    <span>${isClockedIn ? 'حاضر الآن' : (hasWorkedToday ? 'انصرف' : 'غير مسجل')}</span>
                </div>
                
                <!-- Avatar -->
                <div class="team-card-avatar-wrapper">
                    <img src="${avatar}" alt="${member.name}" loading="lazy">
                    <span class="status-dot ${isOnline ? 'status-pulse' : ''}" 
                          style="background:${isOnline ? '#10b981' : statusColors[memberStatus] || '#9ca3af'};
                                 box-shadow:${isOnline ? '0 0 0 3px rgba(16,185,129,0.3)' : 'none'};"></span>
                </div>
                
                <!-- Body -->
                <div class="team-card-body">
                    <h3>${member.name}</h3>
                    <div class="member-title">${member.title || member.jobLevel || 'موظف'}</div>
                    
                    <!-- Role Badge -->
                    <div class="role-badge" style="background:${roleStyle.bg};color:${roleStyle.color};border:1px solid ${roleStyle.color}33;">
                        <i class="fas ${roleStyle.icon}" style="font-size:0.6rem;"></i>
                        ${member.role || 'Employee'}
                    </div>
                    
                    <!-- Department -->
                    <div style="font-size:0.75rem;color:var(--text-secondary);margin:0.4rem 0;display:flex;align-items:center;gap:0.3rem;justify-content:center;">
                        <i class="fas fa-building" style="font-size:0.65rem;color:#3b82f6;"></i>
                        ${member.dept || 'غير محدد'}
                    </div>
                    
                    <!-- Task Mini-Stats -->
                    <div class="team-card-mini-stats">
                        <div class="mini-stat">
                            <span class="mini-stat-val" style="color:#3b82f6;">${activeTasks}</span>
                            <span class="mini-stat-lbl">نشطة</span>
                        </div>
                        <div class="mini-stat-divider"></div>
                        <div class="mini-stat">
                            <span class="mini-stat-val" style="color:#10b981;">${doneTasks}</span>
                            <span class="mini-stat-lbl">مكتملة</span>
                        </div>
                        <div class="mini-stat-divider"></div>
                        <div class="mini-stat">
                            <span class="mini-stat-val" style="color:#f59e0b;">${memberTasks.length}</span>
                            <span class="mini-stat-lbl">إجمالي</span>
                        </div>
                    </div>
                    
                    <!-- Actions -->
                    <div style="display:flex;gap:0.5rem;width:100%;margin-top:0.75rem;">
                        <button class="team-card-btn team-card-btn-primary" style="flex:2;" onclick="TeamManager.showDetail('${member.id}')">
                            <i class="fas fa-eye"></i> عرض الملف
                        </button>
                        ${isAdmin ? `<button class="team-card-btn team-card-btn-outline" onclick="TeamManager.openAddEdit('${member.id}')" title="تعديل">
                            <i class="fas fa-pen"></i>
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

        // All tasks for this member
        const allTasks = Store.get('tasks') || [];
        const tasks = allTasks.filter(t => 
            t.assignees?.includes(id) || t.assignee === id || t.assigneeId === id
        );
        const doneTasks = tasks.filter(t => t.status === 'done').length;
        const inProgressTasks = tasks.filter(t => t.status === 'inprogress').length;
        const overdueTasks = tasks.filter(t => 
            t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done'
        ).length;
        const productivity = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;

        // Attendance stats for last 30 days
        const attendanceLogs = Store.get('attendance_logs') || [];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const memberLogs = attendanceLogs.filter(l => 
            l.userId === id && l.clockOut && new Date(l.date) >= thirtyDaysAgo
        );
        const totalMins = memberLogs.reduce((sum, l) => sum + (l.durationMins || 0), 0);
        const totalHours = (totalMins / 60).toFixed(1);
        const daysWorked = memberLogs.length;
        const today = new Date().toLocaleDateString('en-CA');
        const isClockedIn = attendanceLogs.some(l => l.userId === id && l.date === today && !l.clockOut);
        const avatar = m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=2563eb&color=fff&bold=true&size=256`;
        const me = AuthManager.currentUser;
        const isAdmin = ['Super Admin', 'Admin', 'Manager'].includes(me?.role);
        const statusColor = { Active: '#10b981', Inactive: '#ef4444', 'On Leave': '#f59e0b' };
        const perms = m.permissions || {};
        const permKeys = Object.keys(perms).filter(k => perms[k] === true);

        const modal = document.getElementById('employee-detail-modal');
        if (!modal) return;

        document.getElementById('emp-detail-content').innerHTML = `
            <div class="emp-detail-wide">

                <!-- Left Panel: Avatar + Identity + Actions -->
                <div class="emp-detail-left">
                    <div class="emp-avatar-glow" style="position:relative;">
                        <img class="emp-detail-avatar-lg" src="${avatar}" alt="${m.name}">
                        ${isClockedIn ? '<div style="position:absolute;top:5px;right:5px;background:#10b981;border-radius:50%;width:16px;height:16px;border:2px solid var(--bg-secondary);animation:pulse-anim 2s infinite;"></div>' : ''}
                    </div>
                    <h2 class="emp-name-lg">${m.name}</h2>
                    <p class="emp-title-lg"><i class="fas fa-briefcase" style="color:var(--primary-color);"></i> ${m.title || m.jobLevel || 'موظف'}</p>
                    <span class="emp-status-badge" style="background:${statusColor[m.status||'Active']}22;color:${statusColor[m.status||'Active']};border:1px solid ${statusColor[m.status||'Active']}44;">
                        <span style="width:7px;height:7px;border-radius:50%;background:${statusColor[m.status||'Active']};display:inline-block;"></span>
                        ${m.status || 'Active'}
                    </span>
                    
                    <!-- Productivity Ring -->
                    <div style="margin-top:1rem;display:flex;flex-direction:column;align-items:center;gap:0.5rem;">
                        <div style="position:relative;width:80px;height:80px;">
                            <svg width="80" height="80" viewBox="0 0 80 80">
                                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
                                <circle cx="40" cy="40" r="32" fill="none" stroke="${productivity >= 70 ? '#10b981' : productivity >= 40 ? '#f59e0b' : '#ef4444'}" stroke-width="8"
                                    stroke-dasharray="${(productivity / 100) * 201} 201" stroke-linecap="round"
                                    transform="rotate(-90 40 40)" style="transition:stroke-dasharray 1s ease;"/>
                            </svg>
                            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:700;color:${productivity >= 70 ? '#10b981' : productivity >= 40 ? '#f59e0b' : '#ef4444'};">${productivity}%</div>
                        </div>
                        <span style="font-size:0.75rem;color:var(--text-secondary);">نسبة الإنجاز</span>
                    </div>
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
                    <!-- Tasks Stats Row -->
                    <div class="emp-info-section-title" style="margin-top:1.25rem;"><i class="fas fa-chart-bar"></i> إحصائيات المهام والحضور</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.75rem;">
                        <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:10px;padding:0.6rem;text-align:center;">
                            <div style="font-size:1.2rem;font-weight:700;color:#3b82f6;">${inProgressTasks}</div>
                            <div style="font-size:0.65rem;color:var(--text-secondary);">قيد التنفيذ</div>
                        </div>
                        <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:0.6rem;text-align:center;">
                            <div style="font-size:1.2rem;font-weight:700;color:#10b981;">${doneTasks}</div>
                            <div style="font-size:0.65rem;color:var(--text-secondary);">مكتملة</div>
                        </div>
                        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:0.6rem;text-align:center;">
                            <div style="font-size:1.2rem;font-weight:700;color:#ef4444;">${overdueTasks}</div>
                            <div style="font-size:0.65rem;color:var(--text-secondary);">متأخرة</div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
                        <div style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:10px;padding:0.6rem;text-align:center;">
                            <div style="font-size:1.1rem;font-weight:700;color:#06b6d4;">${daysWorked}</div>
                            <div style="font-size:0.65rem;color:var(--text-secondary);">يوم دوام (30 يوم)</div>
                        </div>
                        <div style="background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);border-radius:10px;padding:0.6rem;text-align:center;">
                            <div style="font-size:1.1rem;font-weight:700;color:#a855f7;">${totalHours}h</div>
                            <div style="font-size:0.65rem;color:var(--text-secondary);">إجمالي ساعات العمل</div>
                        </div>
                    </div>
                    
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
