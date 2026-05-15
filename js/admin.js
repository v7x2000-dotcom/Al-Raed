/**
 * Al-Raed SaaS Platform - Admin Panel
 * Super Admin only: view all users, reset passwords, change roles, delete users.
 */
const AdminPanel = {
    _resetTargetId: null,

    init: () => {
        AdminPanel.refresh();
        // Auto-refresh the admin panel data every 3 seconds to sync automatically
        setInterval(() => {
            // Only refresh if the admin panel is visible to save resources
            const adminPanel = document.getElementById('admin-panel');
            if (adminPanel && adminPanel.classList.contains('active')) {
                AdminPanel.refresh();
            }
        }, 3000);
        // Close modal buttons
        document.querySelectorAll('#admin-reset-modal .close-modal, #admin-reset-modal .cancel-modal, #admin-manage-user-modal .close-modal, #admin-permissions-modal .close-modal, #admin-permissions-modal .cancel-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('admin-reset-modal').classList.add('hidden');
                document.getElementById('admin-manage-user-modal').classList.add('hidden');
                document.getElementById('admin-permissions-modal').classList.add('hidden');
            });
        });

        // Event listener for Role change inside modal
        const roleSelect = document.getElementById('manage-user-role');
        if(roleSelect) {
            roleSelect.addEventListener('change', (e) => {
                if(AdminPanel._manageTargetId) {
                    AdminPanel.changeRole(AdminPanel._manageTargetId, e.target.value);
                }
            });
        }
    },

    refresh: () => {
        const users = Store.get('users') || [];
        const tasks = Store.get('tasks') || [];

        // Update stats
        const totalEl  = document.getElementById('admin-stat-total');
        const adminsEl = document.getElementById('admin-stat-admins');
        const tasksEl  = document.getElementById('admin-stat-tasks');
        if (totalEl)  totalEl.textContent  = users.length;
        if (adminsEl) adminsEl.textContent = users.filter(u => u.role === 'Super Admin' || u.role === 'Manager').length;
        if (tasksEl)  tasksEl.textContent  = tasks.length;

        AdminPanel.renderTable(users);
    },

    renderTable: (users) => {
        const tbody = document.getElementById('admin-users-table');
        if (!tbody) return;
        const me = AuthManager.currentUser;

        if (!users || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-secondary);">${LangManager.t('No users found.')}</td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(user => {
            const avatar = user.avatar
                ? `<img src="${user.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:0.5rem;">`
                : `<img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=2563eb&color=fff&bold=true&size=64" style="width:32px;height:32px;border-radius:50%;vertical-align:middle;margin-right:0.5rem;">`;

            const joined = (user.createdAt || user.joinedAt) ? new Date(user.createdAt || user.joinedAt).toLocaleDateString() : '—';
            const isSuperAdmin = user.role === 'Super Admin';
            const isMe = user.id === me?.id;

            return `
                <tr style="border-bottom:1px solid var(--border-color);transition:background 0.2s;" 
                    onmouseenter="this.style.background='var(--bg-primary)'" 
                    onmouseleave="this.style.background='transparent'">
                    <td style="padding:0.875rem 0.75rem; cursor:pointer; text-align:right;" onclick="AdminPanel.openManageModal('${user.id}')">
                        ${avatar}
                        <span style="font-weight:600;">${user.name}${isMe ? ' <span style="font-size:0.7rem;background:rgba(16,185,129,0.1);color:#10b981;padding:2px 6px;border-radius:10px;">You</span>' : ''}</span>
                    </td>
                    <td data-label="البريد" style="padding:0.875rem 0.75rem;color:var(--text-secondary);font-size:0.85rem; cursor:pointer; text-align:right;" onclick="AdminPanel.openManageModal('${user.id}')">${user.email}</td>
                    <td data-label="الرتبة" style="padding:0.875rem 0.75rem; cursor:pointer; text-align:right;" onclick="AdminPanel.openManageModal('${user.id}')">
                        ${isSuperAdmin
                            ? '<span style="background:rgba(139,92,246,0.1);color:#8b5cf6;padding:0.2rem 0.6rem;border-radius:10px;font-size:0.8rem;font-weight:600;">Super Admin</span>'
                            : `<span style="font-size:0.85rem;padding:0.2rem 0.6rem;border-radius:10px;background:rgba(37,99,235,0.1);color:#2563eb;">${typeof LangManager !== 'undefined' ? LangManager.t(user.role) : user.role}</span>`
                        }
                    </td>
                    <td data-label="المسمى" style="padding:0.875rem 0.75rem;color:var(--text-secondary);font-size:0.85rem; cursor:pointer; text-align:right;" onclick="AdminPanel.openManageModal('${user.id}')">${user.title || '—'}</td>
                    <td data-label="الانضمام" style="padding:0.875rem 0.75rem;color:var(--text-secondary);font-size:0.85rem; cursor:pointer; text-align:right;" onclick="AdminPanel.openManageModal('${user.id}')">${joined}</td>
                    <td data-label="الإجراءات" style="padding:0.875rem 0.75rem;text-align:center;">
                        ${!isMe ? `
                        <button class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.75rem; border-radius:8px;" onclick="AdminPanel.openPermissionsModal('${user.id}')" title="إدارة الصلاحيات">
                            <i class="fas fa-user-lock"></i> الصلاحيات
                        </button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    },

    _permissionsTargetId: null,

    openPermissionsModal: (userId) => {
        const users = Store.get('users') || [];
        const user = users.find(u => u.id === userId);
        if (!user) return;

        AdminPanel._permissionsTargetId = userId;
        document.getElementById('admin-permissions-target-name').textContent = user.name;

        const defaultPermissions = { "dashboard": true, "tasks": true, "team": false, "chat-section": true, "calendar": true, "finance": false, "reports": false, "drive": true, "settings": true, "support": true, "profile": true, "projects": true, "clients": true, "inventory": false, "wiki": true, "feed-section": true, "expenses-section": true, "polls-section": true, "admin-panel": false };
        const perms = user.permissions || defaultPermissions;

        const modules = [
            { id: 'dashboard', icon: 'fa-chart-line', name: 'لوحة القيادة' },
            { id: 'tasks', icon: 'fa-tasks', name: 'المهام' },
            { id: 'chat-section', icon: 'fa-comments', name: 'المحادثات' },
            { id: 'drive', icon: 'fa-cloud', name: 'السحابة والأرشيف' },
            { id: 'finance', icon: 'fa-wallet', name: 'المالية' },
            { id: 'calendar', icon: 'fa-calendar-alt', name: 'التقويم' },
            { id: 'reports', icon: 'fa-file-alt', name: 'التقارير' },
            { id: 'team', icon: 'fa-users', name: 'إدارة الفريق' },
            { id: 'projects', icon: 'fa-project-diagram', name: 'المشاريع' },
            { id: 'clients', icon: 'fa-user-tie', name: 'العملاء' },
            { id: 'wiki', icon: 'fa-book-open', name: 'قاعدة المعرفة' },
            { id: 'feed-section', icon: 'fa-newspaper', name: 'أخبار الشركة' },
            { id: 'expenses-section', icon: 'fa-file-invoice-dollar', name: 'طلبات الصرف' },
            { id: 'polls-section', icon: 'fa-poll-h', name: 'التصويتات' },
            { id: 'inventory', icon: 'fa-boxes', name: 'المخزن' },
            { id: 'admin-panel', icon: 'fa-shield-alt', name: 'لوحة التحكم (المدير)' }
        ];

        const list = document.getElementById('admin-permissions-list');
        list.innerHTML = modules.map(m => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary); padding:0.8rem; border-radius:var(--radius-md); border:1px solid var(--border-color);">
                <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; font-weight:600;">
                    <i class="fas ${m.icon}" style="color:var(--primary-color); width:20px; text-align:center;"></i> ${m.name}
                </div>
                <label style="position:relative; display:inline-block; width:40px; height:20px;">
                    <input type="checkbox" id="perm-${m.id}" style="opacity:0; width:0; height:0;" ${perms[m.id] !== false ? 'checked' : ''}>
                    <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:${perms[m.id] !== false ? '#10b981' : 'var(--text-secondary)'}; transition:.4s; border-radius:20px;">
                        <span style="position:absolute; content:''; height:14px; width:14px; left:${perms[m.id] !== false ? '23px' : '3px'}; bottom:3px; background-color:white; transition:.4s; border-radius:50%;"></span>
                    </span>
                </label>
            </div>
        `).join('');

        // Handle toggle visual switch
        modules.forEach(m => {
            const chk = document.getElementById(`perm-${m.id}`);
            if (chk) {
                chk.addEventListener('change', (e) => {
                    const spanBg = e.target.nextElementSibling;
                    const spanCircle = spanBg.querySelector('span');
                    if (e.target.checked) {
                        spanBg.style.backgroundColor = '#10b981';
                        spanCircle.style.left = '23px';
                    } else {
                        spanBg.style.backgroundColor = 'var(--text-secondary)';
                        spanCircle.style.left = '3px';
                    }
                });
            }
        });

        document.getElementById('admin-permissions-modal').classList.remove('hidden');
    },

    savePermissions: () => {
        if (!AdminPanel._permissionsTargetId) return;

        let users = Store.get('users') || [];
        const idx = users.findIndex(u => u.id === AdminPanel._permissionsTargetId);
        if (idx === -1) return;

        const modules = ['dashboard', 'tasks', 'team', 'chat-section', 'calendar', 'finance', 'reports', 'drive', 'settings', 'support', 'profile', 'projects', 'clients', 'inventory', 'wiki', 'feed-section', 'expenses-section', 'polls-section', 'admin-panel'];
        
        let newPerms = {};
        modules.forEach(m => {
            const chk = document.getElementById(`perm-${m}`);
            newPerms[m] = chk ? chk.checked : false;
        });

        users[idx].permissions = newPerms;
        Store.set('users', users);

        // Update team store as well
        let team = Store.get('team') || [];
        const tidx = team.findIndex(t => t.id === AdminPanel._permissionsTargetId);
        if (tidx !== -1) {
            team[tidx].permissions = newPerms;
            Store.set('team', team);
        }

        // If editing self, update current session and UI immediately
        if (AuthManager.currentUser && AuthManager.currentUser.id === AdminPanel._permissionsTargetId) {
            AuthManager.currentUser.permissions = newPerms;
            localStorage.setItem('currentUser', JSON.stringify(AuthManager.currentUser));
            AuthManager.applyRoleUI();
        }

        AuthManager.showToast('✅ تم حفظ الصلاحيات بنجاح!');
        document.getElementById('admin-permissions-modal').classList.add('hidden');
    },

    filterUsers: (query) => {
        const users = Store.get('users') || [];
        const q = query.toLowerCase();
        const filtered = q
            ? users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.title || '').toLowerCase().includes(q))
            : users;
        AdminPanel.renderTable(filtered);
    },

    changeRole: (userId, newRole) => {
        let users = Store.get('users') || [];
        const idx = users.findIndex(u => u.id === userId);
        if (idx > -1) {
            users[idx].role = newRole;
            Store.set('users', users);
            // Sync team
            let team = Store.get('team') || [];
            const tidx = team.findIndex(t => t.id === userId);
            if (tidx > -1) { team[tidx].role = newRole; Store.set('team', team); }
            Store.log('المسؤول: تغيير الرتبة', `${users[idx].name} ← ${newRole}`);
            AuthManager.showToast(`✅ Role updated to ${newRole}`);
            AdminPanel.refresh();
        }
    },

    openManageModal: (userId) => {
        const users = Store.get('users') || [];
        const user = users.find(u => u.id === userId);
        if(!user) return;

        AdminPanel._manageTargetId = user.id;
        const isMe = user.id === AuthManager.currentUser?.id;
        const isSuperAdmin = user.role === 'Super Admin';

        const avatarUrl = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=2563eb&color=fff&bold=true&size=128`;
        document.getElementById('manage-user-avatar').src = avatarUrl;
        document.getElementById('manage-user-name').textContent = user.name;
        document.getElementById('manage-user-email').textContent = user.email;
        
        const roleSelect = document.getElementById('manage-user-role');
        roleSelect.value = user.role;
        // Only allow changing roles if it's not you, or if you are SuperAdmin managing someone else
        roleSelect.disabled = isMe;

        // Reset Options text (in case language changed)
        Array.from(roleSelect.options).forEach(opt => {
            opt.textContent = typeof LangManager !== 'undefined' ? LangManager.t(opt.value) : opt.value;
        });

        // Setup Buttons
        const chatBtn = document.getElementById('manage-btn-chat');
        const resetBtn = document.getElementById('manage-btn-reset');
        const deleteBtn = document.getElementById('manage-btn-delete');
        const banBtn = document.getElementById('manage-btn-ban');

        if (chatBtn) {
            chatBtn.onclick = () => {
                document.getElementById('admin-manage-user-modal').classList.add('hidden');
                if (typeof TeamManager !== 'undefined') TeamManager.openChat(user.id);
            };
        }

        resetBtn.onclick = () => {
            document.getElementById('admin-manage-user-modal').classList.add('hidden');
            AdminPanel.openResetModal(user.id, user.name);
        };

        if(isMe || user.email === 'mod18hk@gmail.com') {
            // Cannot delete/ban yourself or the master platform owner
            deleteBtn.style.display = 'none';
            banBtn.style.display = 'none';
        } else {
            deleteBtn.style.display = 'block';
            banBtn.style.display = 'block';
            deleteBtn.onclick = () => {
                document.getElementById('admin-manage-user-modal').classList.add('hidden');
                AdminPanel.deleteUser(user.id);
            };
            banBtn.onclick = () => {
                document.getElementById('admin-manage-user-modal').classList.add('hidden');
                AdminPanel.banUser(user.id);
            };
        }

        document.getElementById('admin-manage-user-modal').classList.remove('hidden');
    },

    openResetModal: (userId, userName) => {
        AdminPanel._resetTargetId = userId;
        document.getElementById('admin-reset-target-name').textContent = userName;
        document.getElementById('admin-new-password').value = '';
        document.getElementById('admin-reset-modal').classList.remove('hidden');
    },

    confirmReset: () => {
        const newPass = document.getElementById('admin-new-password').value.trim();
        if (!newPass || newPass.length < 4) { 
            showAlert('Password must be at least 4 characters.'); 
            return; 
        }

        let users = Store.get('users') || [];
        const idx = users.findIndex(u => u.id === AdminPanel._resetTargetId);
        if (idx > -1) {
            users[idx].password = newPass;
            Store.set('users', users);
            document.getElementById('admin-reset-modal').classList.add('hidden');
            Store.log('المسؤول: إعادة تعيين كلمة المرور', users[idx].name);
            AuthManager.showToast(`✅ Password reset successfully for ${users[idx].name}`);
        }
    },

    deleteUser: (userId) => {
        const users = Store.get('users') || [];
        const user = users.find(u => u.id === userId);
        if (!user) return;
        
        // Master Admin protection
        if (user.email === 'mod18hk@gmail.com') { 
            showAlert(typeof LangManager !== 'undefined' ? LangManager.t('Cannot delete the Master Admin.') : 'لا يمكن حذف المسؤول الأساسي.'); 
            return; 
        }

        const confirmMsg = typeof LangManager !== 'undefined' 
            ? `هل أنت متأكد من حذف "${user.name}" نهائياً؟ سيتمكن من إنشاء حساب جديد بنفس البريد لاحقاً.`
            : `Are you sure you want to permanently delete "${user.name}"? They will be able to register again.`;

        askConfirm(confirmMsg, () => {
            // 1. Remove from users list
            const updatedUsers = users.filter(u => u.id !== userId);
            Store.set('users', updatedUsers);

            // 2. Remove from team list (sync)
            let team = Store.get('team') || [];
            Store.set('team', team.filter(t => t.id !== userId));

            // 3. Optional: Remove from banned list if they were banned before
            let banned = Store.get('bannedEmails') || [];
            if (banned.includes(user.email)) {
                Store.set('bannedEmails', banned.filter(e => e !== user.email));
            }

            Store.log('المسؤول: حذف مستخدم', user.name);
            AuthManager.showToast(typeof LangManager !== 'undefined' ? `✅ تم حذف المستخدم "${user.name}" بنجاح.` : `✅ User "${user.name}" deleted.`);
            
            AdminPanel.refresh();
            if (typeof TeamManager !== 'undefined') TeamManager.render();
        });
    },

    banUser: (userId) => {
        const users = Store.get('users') || [];
        const user = users.find(u => u.id === userId);
        if (!user) return;
        
        if (user.email === 'mod18hk@gmail.com') { 
            showAlert(typeof LangManager !== 'undefined' ? LangManager.t('Cannot ban the Master Admin.') : 'لا يمكن حظر المسؤول الأساسي.'); 
            return; 
        }

        const confirmMsg = typeof LangManager !== 'undefined'
            ? `هل أنت متأكد من حظر البريد "${user.email}" نهائياً؟ لن يتمكن من التسجيل مرة أخرى أبداً.`
            : `Are you sure you want to PERMANENTLY BAN "${user.email}"? They will never be able to register again.`;

        askConfirm(confirmMsg, () => {
            // Add to banned emails
            let banned = Store.get('bannedEmails') || [];
            if(!banned.includes(user.email)) {
                banned.push(user.email);
                Store.set('bannedEmails', banned);
            }

            // Delete the user data
            Store.set('users', users.filter(u => u.id !== userId));
            let team = Store.get('team') || [];
            Store.set('team', team.filter(t => t.id !== userId));
            
            Store.log('المسؤول: حظر مستخدم', user.email);
            AuthManager.showToast(typeof LangManager !== 'undefined' ? `🚫 تم حظر البريد "${user.email}" نهائياً.` : `🚫 Email "${user.email}" has been permanently banned.`);
            AdminPanel.refresh();
            if (typeof TeamManager !== 'undefined') TeamManager.render();
        });
    }
};

window.AdminPanel = AdminPanel;
