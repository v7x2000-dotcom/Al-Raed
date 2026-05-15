/**
 * Al-Raed SaaS Platform - Authentication System
 * Handles registration (with job title), login, logout, profile management, and RBAC.
 */
const AuthManager = {
    currentUser: null,

    init: () => {
        // Safe start: Initialize sync and workspace
        if (typeof Store !== 'undefined') {
            Store.connectSync();
            Store.initWorkspace();
        }

        // 🔄 Clear 'Connecting to cloud' message when sync is done
        window.addEventListener('storeReady', () => {
            const loginErr = document.getElementById('login-error');
            const regErr = document.getElementById('register-error');
            if (loginErr && loginErr.textContent.includes('جاري الاتصال')) loginErr.classList.add('hidden');
            if (regErr && regErr.textContent.includes('جاري الاتصال')) regErr.classList.add('hidden');
        });

        AuthManager.bindEvents();
        AuthManager.checkAuth();
    },

    bindEvents: () => {
        // Form switches
        document.getElementById('switch-to-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('register-form').classList.remove('hidden');
            document.querySelector('.auth-header p').textContent = 'Create your account to get started';
        });

        document.getElementById('switch-to-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
            document.querySelector('.auth-header p').textContent = 'Login to access your workspace';
        });

        // Login
        document.getElementById('btn-login')?.addEventListener('click', AuthManager.handleLogin);
        document.getElementById('login-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') AuthManager.handleLogin();
        });

        // Register
        document.getElementById('btn-register')?.addEventListener('click', AuthManager.handleRegister);

        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', AuthManager.logout);

        // Profile section
        document.getElementById('btn-save-profile')?.addEventListener('click', AuthManager.saveProfile);
        document.getElementById('btn-save-pass')?.addEventListener('click', AuthManager.changePassword);

        // Avatar preview
        document.getElementById('setting-avatar-file')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('avatar-preview').src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    handleLogin: (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const emailInput = document.getElementById('login-email').value.trim().toLowerCase();
        const pass = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');

        // 🛑 Critical: Wait for Cloud Sync
        if (typeof Store !== 'undefined' && !Store._initialSyncDone) {
            errEl.textContent = 'جاري الاتصال بالسحابة... يرجى الانتظار ثانية واحدة.';
            errEl.classList.remove('hidden');
            return;
        }

        if (!emailInput || !pass) {
            errEl.textContent = 'يرجى إدخال البريد وكلمة السر.';
            errEl.classList.remove('hidden');
            return;
        }

        // Normal Login Logic

        const users = Store.get('users') || [];
        const user = users.find(u =>
            u.email.trim().toLowerCase() === emailInput &&
            u.password === pass
        );

        if (user) {
            errEl.classList.add('hidden');
            AuthManager.login(user);
        } else {
            errEl.textContent = 'بيانات الدخول غير صحيحة. يرجى التأكد من البريد وكلمة السر.';
            errEl.classList.remove('hidden');
        }
    },

    handleRegister: () => {
        const errEl = document.getElementById('register-error');
        
        // 🛑 Critical: Wait for Cloud Sync to finish to avoid data overwrites
        if (typeof Store !== 'undefined' && !Store._initialSyncDone) {
            errEl.textContent = 'جاري الاتصال بالسحابة... يرجى الانتظار ثانية واحدة.';
            errEl.classList.remove('hidden');
            return;
        }

        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim().toLowerCase();
        const pass = document.getElementById('reg-password').value;
        const title = document.getElementById('reg-title').value.trim();

        if (!name || !email || !pass) {
            errEl.textContent = 'يرجى ملء جميع الحقول المطلوبة.';
            errEl.classList.remove('hidden');
            return;
        }

        const users = Store.get('users') || [];

        if (users.find(u => u.email.toLowerCase() === email)) {
            errEl.textContent = 'هذا البريد الإلكتروني مسجل بالفعل. يرجى استخدام بريد آخر أو التواصل مع الإدارة.';
            errEl.classList.remove('hidden');
            return;
        }

        const banned = Store.get('bannedEmails') || [];
        if (banned.includes(email)) {
            errEl.textContent = 'هذا البريد الإلكتروني محظور نهائياً من المنصة.';
            errEl.classList.remove('hidden');
            return;
        }

        // CRITICAL: Ensure we don't accidentally make everyone Super Admin if sync is slow
        let role = 'Member';
        if (users.length === 0) {
            // First user ever becomes Super Admin
            role = 'Super Admin';
        }

        const defaultPermissions = {
            "dashboard": true,
            "tasks": true,
            "team": false,
            "chat-section": true,
            "calendar": true,
            "finance": false,
            "reports": false,
            "drive": true,
            "settings": true,
            "support": true,
            "profile": true,
            "projects": true,
            "clients": true,
            "inventory": false,
            "wiki": true,
            "feed-section": true,
            "expenses-section": true,
            "polls-section": true,
            "admin-panel": false
        };

        const newUser = {
            id: 'u_' + Date.now(),
            name,
            email,
            password: pass,
            role: role,
            title: title || 'Member',
            avatar: null,
            status: 'active',
            joinedAt: Date.now(),
            permissions: defaultPermissions
        };

        AuthManager.currentUser = newUser;

        // Add to existing users
        const updatedUsers = [...users, newUser];
        Store.set('users', updatedUsers);

        let team = Store.get('team') || [];
        const updatedTeam = [...team, newUser];
        Store.set('team', updatedTeam);

        errEl.classList.add('hidden');
        AuthManager.login(newUser);
    },

    presenceHeartbeat: null,

    startPresenceHeartbeat: () => {
        if (AuthManager.presenceHeartbeat) clearInterval(AuthManager.presenceHeartbeat);
        
        const updatePresence = () => {
            const user = AuthManager.currentUser;
            if (!user) return;
            if (typeof firebase !== 'undefined' && firebase.apps.length) {
                firebase.firestore().collection('presence').doc(user.id).set({
                    name: user.name,
                    userId: user.id,
                    timestamp: Date.now(),
                    status: 'online'
                }).catch(err => console.warn('Presence heartbeat failed', err));
            }
        };

        // Initial update
        updatePresence();
        // Update every 30 seconds
        AuthManager.presenceHeartbeat = setInterval(updatePresence, 30000);

        // Cleanup on window close
        window.addEventListener('beforeunload', () => {
            if (AuthManager.currentUser && typeof firebase !== 'undefined' && firebase.apps.length) {
                // We use a small trick: navigator.sendBeacon is for analytics, but for Firestore we can't easily wait.
                // However, deleting the doc might work in many browsers before they close.
                firebase.firestore().collection('presence').doc(AuthManager.currentUser.id).delete().catch(() => {});
            }
        });
    },

    stopPresenceHeartbeat: () => {
        if (AuthManager.presenceHeartbeat) {
            clearInterval(AuthManager.presenceHeartbeat);
            AuthManager.presenceHeartbeat = null;
        }
    },

    login: (user) => {
        // Always load fresh user data from store to get updates
        let users = Store.get('users') || [];
        let freshUser = users.find(u => u.id === user.id) || user;

        Store.log('Login', freshUser.name);

        AuthManager.currentUser = { ...freshUser };
        localStorage.setItem('currentUser', JSON.stringify(freshUser));

        const authWrap = document.getElementById('auth-wrapper');
        const appWrap = document.getElementById('app-wrapper');

        if (authWrap) {
            authWrap.classList.add('hidden');
            authWrap.style.setProperty('display', 'none', 'important');
        }
        if (appWrap) {
            appWrap.classList.remove('hidden');
            appWrap.style.setProperty('display', 'flex', 'important');
        }

        AuthManager.updateUserUI();
        AuthManager.applyRoleUI();

        // Init app modules after login
        if (typeof App !== 'undefined') App.init();

        // Start heartbeat
        AuthManager.startPresenceHeartbeat();

        // Notify welcome
        NotificationManager.add(`مرحباً بك، ${freshUser.name}! 👋`, 'fa-hand-wave', 'system');
    },

    logout: () => {
        // 0. Log action before clearing session
        if (AuthManager.currentUser) {
            Store.log('Logout', AuthManager.currentUser.name);
        }

        // 1. Stop Heartbeat & Remove online presence
        AuthManager.stopPresenceHeartbeat();
        if (typeof firebase !== 'undefined' && firebase.apps.length && AuthManager.currentUser) {
            firebase.firestore().collection('presence').doc(AuthManager.currentUser.id).delete().catch(() => {});
        }

        // 2. Sign out from Firebase if connected
        if (typeof firebase !== 'undefined' && firebase.apps.length) {
            firebase.auth().signOut().catch(err => console.warn("Logout: Firebase signout delayed", err));
        }

        // 3. Clear Local Session
        localStorage.removeItem('currentUser');
        AuthManager.currentUser = null;

        // 4. Force Reload for a clean state
        window.location.reload();
    },

    checkAuth: () => {
        const saved = localStorage.getItem('currentUser');
        if (saved) {
            try {
                const user = JSON.parse(saved);
                // Try to refresh user data from the store (in case role/avatar changed)
                const users = Store.get('users') || [];
                const fresh = users.find(u => u.id === user.id);

                if (fresh) {
                    // User still exists — restore session silently (no full App.init loop)
                    AuthManager.currentUser = { ...fresh };
                    // Update stored session with fresh data
                    localStorage.setItem('currentUser', JSON.stringify(fresh));
                    // Show app
                    document.getElementById('auth-wrapper').classList.add('hidden');
                    document.getElementById('app-wrapper').classList.remove('hidden');
                    AuthManager.updateUserUI();
                    AuthManager.applyRoleUI();
                    if (typeof App !== 'undefined') App.init();
                    
                    // Restart heartbeat on session restore
                    AuthManager.startPresenceHeartbeat();
                } else {
                    // User was deleted or not found
                    AuthManager.showLoginScreen();
                }
            } catch (e) {
                AuthManager.showLoginScreen();
            }
        } else {
            AuthManager.showLoginScreen();
        }
    },

    showLoginScreen: () => {
        const authWrap = document.getElementById('auth-wrapper');
        const appWrap = document.getElementById('app-wrapper');

        if (authWrap) {
            authWrap.classList.remove('hidden');
            authWrap.style.setProperty('display', 'flex', 'important');
        }
        if (appWrap) {
            appWrap.classList.add('hidden');
            appWrap.style.setProperty('display', 'none', 'important');
        }
    },

    updateUserUI: () => {
        const user = AuthManager.currentUser;
        if (!user) return;

        // Always load fresh avatar from store to handle persistence across refresh
        const users = Store.get('users') || [];
        const freshUser = users.find(u => u.id === user.id);
        const avatar = (freshUser?.avatar || user.avatar) || null;
        const avatarUrl = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=2563eb&color=fff&bold=true&size=128`;

        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const setSrc = (id, src) => { const el = document.getElementById(id); if (el) el.src = src; };
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

        setSrc('current-user-avatar', avatarUrl);
        setSrc('profile-display-avatar', avatarUrl);
        setSrc('avatar-preview', avatarUrl);
        setEl('current-user-name', user.name);
        setEl('current-user-role', typeof LangManager !== 'undefined' ? LangManager.t(user.role) : user.role);
        setEl('dash-user-name', user.name);
        setEl('dash-user-title', typeof LangManager !== 'undefined' ? LangManager.t(user.title || '') : (user.title || ''));
        setEl('profile-display-name', user.name);
        setEl('profile-display-title', typeof LangManager !== 'undefined' ? LangManager.t(user.title || 'No title set') : (user.title || 'No title set'));
        setEl('profile-display-role', typeof LangManager !== 'undefined' ? LangManager.t(user.role) : user.role);
        setVal('setting-name', user.name);
        setVal('setting-email', user.email);
        setVal('setting-title', user.title || '');

        // Sync fresh avatar into current session if different
        if (freshUser?.avatar && freshUser.avatar !== AuthManager.currentUser.avatar) {
            AuthManager.currentUser.avatar = freshUser.avatar;
            localStorage.setItem('currentUser', JSON.stringify(AuthManager.currentUser));
        }
    },

    isUserOnline: (userId) => {
        if (!userId) return false;
        if (userId === AuthManager.currentUser?.id) return true;
        const presence = Store._onlineUsers?.find(p => p.id === userId);
        if (!presence) return false;
        // Online if updated within last 60 seconds
        return (Date.now() - (presence.timestamp || 0)) < 60000;
    },

    getUserLastSeen: (userId) => {
        const presence = Store._onlineUsers?.find(p => p.id === userId);
        if (!presence || !presence.timestamp) return null;
        return presence.timestamp;
    },

    applyRoleUI: () => {
        // Refresh session data from Store to catch latest permissions sync
        if (AuthManager.currentUser) {
            const users = Store.get('users') || [];
            const fresh = users.find(u => u.id === AuthManager.currentUser.id);
            if (fresh) {
                AuthManager.currentUser = { ...AuthManager.currentUser, ...fresh };
            }
        }

        const user = AuthManager.currentUser;
        if (!user) return;
        
        const role = user.role;
        const isAdmin = role === 'Super Admin' || role === 'Manager';
        const isSuperAdmin = role === 'Super Admin';

        // 1. Class-based basic restrictions
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });

        document.querySelectorAll('.superadmin-only').forEach(el => {
            el.style.display = isSuperAdmin ? '' : 'none';
        });

        document.querySelectorAll('.member-only').forEach(el => {
            el.style.display = isAdmin ? 'none' : '';
        });

        // 2. Granular Permissions Enforcement for Navigation
        // Ensure legacy users have a permissions object
        const defaultPermissions = {
            "dashboard": true, "tasks": true, "team": false, "chat-section": true, "calendar": true,
            "finance": false, "reports": false, "drive": true, "settings": true, "support": true,
            "profile": true, "projects": true, "clients": true, "inventory": false, "wiki": true,
            "feed-section": true, "expenses-section": true, "polls-section": true, "admin-panel": false
        };
        const perms = user.permissions || defaultPermissions;

        document.querySelectorAll('.nav-item').forEach(item => {
            const target = item.getAttribute('data-target');
            if (!target) return;
            
            // Super Admin bypass for Admin Panel ONLY (to prevent self-lockout)
            if (isSuperAdmin && target === 'admin-panel') {
                item.style.display = '';
                return;
            }

            // Check if permission explicitly denied (applies to everyone, even Super Admin now)
            if (perms[target] === false) {
                item.style.display = 'none';
            } else if (!item.classList.contains('admin-only') && !item.classList.contains('superadmin-only')) {
                // If permission is true, and it's not restricted by hardcoded role classes
                item.style.display = '';
            }
        });

        // 3. Security: Kick user out of forbidden sections if they are currently viewing one
        const activeSection = document.querySelector('.view-section.active');
        if (activeSection) {
            const sectionId = activeSection.id;
            if (perms[sectionId] === false || (activeSection.classList.contains('admin-only') && !isAdmin) || (activeSection.classList.contains('superadmin-only') && !isSuperAdmin)) {
                if (typeof App !== 'undefined') App.navigateTo('dashboard');
            }
        }
    },

    saveProfile: () => {
        const name = document.getElementById('setting-name')?.value.trim();
        const title = document.getElementById('setting-title')?.value.trim();
        const email = document.getElementById('setting-email')?.value.trim();
        const fileInput = document.getElementById('setting-avatar-file');

        if (!name) { AuthManager.showToast('لا يمكن ترك الاسم فارغاً.', 'error'); return; }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            AuthManager.showToast('بريد إلكتروني غير صالح.', 'error'); return;
        }

        // Check email uniqueness if changed
        if (email && email !== AuthManager.currentUser.email) {
            const users = Store.get('users') || [];
            if (users.find(u => u.email === email && u.id !== AuthManager.currentUser.id)) {
                AuthManager.showToast('هذا البريد مستخدم بالفعل.', 'error'); return;
            }
        }

        const processUpdate = (avatarDataUrl) => {
            let users = Store.get('users') || [];
            const idx = users.findIndex(u => u.id === AuthManager.currentUser.id);
            if (idx > -1) {
                users[idx].name = name;
                users[idx].title = title || users[idx].title;
                if (email) users[idx].email = email;
                if (avatarDataUrl) users[idx].avatar = avatarDataUrl;
                Store.set('users', users);

                // Update team member too
                let team = Store.get('team') || [];
                const tidx = team.findIndex(t => t.id === AuthManager.currentUser.id);
                if (tidx > -1) {
                    team[tidx].name = name;
                    team[tidx].title = title || team[tidx].title;
                    if (email) team[tidx].email = email;
                    if (avatarDataUrl) team[tidx].avatar = avatarDataUrl;
                    Store.set('team', team);
                }

                // Update session
                AuthManager.currentUser = { ...users[idx] };
                localStorage.setItem('currentUser', JSON.stringify(AuthManager.currentUser));

                AuthManager.updateUserUI();
                if (typeof TeamManager !== 'undefined') TeamManager.render();
                if (typeof ChatManager !== 'undefined') ChatManager.render();
                AuthManager.showToast('✅ تم تحديث الملف الشخصي بنجاح!');
            }
        };

        if (fileInput?.files?.[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 256;
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    processUpdate(resizedDataUrl);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            processUpdate(null);
        }
    },

    submitExternalSupport: () => {
        const name = document.getElementById('ext-support-name').value.trim();
        const email = document.getElementById('ext-support-email').value.trim();
        const msg = document.getElementById('ext-support-msg').value.trim();

        if (!name || !email || !msg) {
            AuthManager.showToast('يرجى ملء جميع الحقول.', 'error');
            return;
        }

        const ticket = {
            id: 'tkt_' + Date.now() + Math.random().toString(36).substr(2, 5),
            userId: 'external',
            userName: name + ' (خارجي: ' + email + ')',
            title: 'مشكلة في الدخول / شكوى خارجية',
            category: 'Technical',
            status: 'Open',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [{
                id: 'smsg_' + Date.now(),
                senderId: 'external',
                senderName: name,
                senderRole: 'عضو خارجي',
                content: msg,
                timestamp: new Date().toISOString()
            }]
        };

        const tickets = Store.get('support_tickets') || [];
        tickets.push(ticket);
        Store.set('support_tickets', tickets);
        
        AuthManager.showToast('✅ تم إرسال رسالتك للإدارة بنجاح. سنتواصل معك قريباً.');
        document.getElementById('ext-support-name').value = '';
        document.getElementById('ext-support-email').value = '';
        document.getElementById('ext-support-msg').value = '';
        document.getElementById('ext-support-modal').classList.add('hidden');
    },

    checkExternalTicketStatus: () => {
        const email = document.getElementById('ext-check-email').value.trim().toLowerCase();
        if (!email) {
            AuthManager.showToast('يرجى إدخال البريد الإلكتروني.', 'error');
            return;
        }

        const tickets = Store.get('support_tickets') || [];
        // Filter tickets that have "email" in their userName or messages
        const myTickets = tickets.filter(t => t.userName.toLowerCase().includes(email));

        const list = document.getElementById('ext-ticket-list');
        if (!list) return;

        if (myTickets.length === 0) {
            list.innerHTML = `
                <div style="text-align:center; padding:2rem; color:var(--text-secondary);">
                    <i class="fas fa-search-minus" style="font-size:2.5rem; opacity:0.4; margin-bottom:1rem; display:block;"></i>
                    <p>عذراً، لم نجد أي شكاوى مسجلة لهذا البريد الإلكتروني.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = myTickets.map(t => `
            <div class="glass-effect" style="padding:1rem; margin-bottom:0.75rem; border-radius:10px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                    <span style="font-weight:700; color:var(--primary-color);">تذكرة #${t.id.substr(-5)}</span>
                    <span class="badge" style="background:rgba(16,185,129,0.1); color:#10b981;">${t.status}</span>
                </div>
                <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">
                    آخر تحديث: ${new Date(t.updatedAt).toLocaleString('ar-EG')}
                </div>
                <div style="background:rgba(0,0,0,0.2); padding:0.75rem; border-radius:8px; max-height:200px; overflow-y:auto;">
                    ${t.messages.map(m => `
                        <div style="margin-bottom:0.75rem; text-align:${m.senderId === 'external' ? 'right' : 'left'}">
                            <div style="font-size:0.75rem; font-weight:700; color:${m.senderId === 'external' ? 'var(--primary-color)' : '#8b5cf6'}">${m.senderName}</div>
                            <div style="font-size:0.85rem; background:${m.senderId === 'external' ? 'rgba(37,99,235,0.1)' : 'rgba(139,92,246,0.1)'}; padding:0.5rem; border-radius:8px; display:inline-block; margin-top:4px;">
                                ${m.content}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:1rem; display:flex; gap:8px;">
                    <input type="text" id="reply-${t.id}" placeholder="اكتب رداً..." style="flex:1; padding:0.5rem; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-primary); color:var(--text-primary); font-size:0.85rem;">
                    <button class="btn btn-primary" style="padding:0.5rem 1rem;" onclick="AuthManager.replyToExternalTicket('${t.id}')">رد</button>
                </div>
            </div>
        `).join('');
    },

    replyToExternalTicket: (ticketId) => {
        const input = document.getElementById(`reply-${ticketId}`);
        const content = input?.value.trim();
        if (!content) return;

        const tickets = Store.get('support_tickets') || [];
        const idx = tickets.findIndex(t => t.id === ticketId);
        if (idx === -1) return;

        const ticket = tickets[idx];
        const newMsg = {
            id: 'smsg_' + Date.now(),
            senderId: 'external',
            senderName: ticket.userName.split('(')[0].trim(),
            senderRole: 'عضو خارجي',
            content: content,
            timestamp: new Date().toISOString()
        };

        ticket.messages.push(newMsg);
        ticket.updatedAt = new Date().toISOString();
        ticket.status = 'Open'; // Re-open if closed

        tickets[idx] = ticket;
        Store.set('support_tickets', tickets);
        
        AuthManager.checkExternalTicketStatus(); // Refresh view
        AuthManager.showToast('✅ تم إرسال ردك بنجاح.');
    },

    changePassword: () => {
        const curr = document.getElementById('setting-curr-pass').value;
        const newP = document.getElementById('setting-new-pass').value;
        const confirm = document.getElementById('setting-confirm-pass')?.value;

        if (!curr || !newP) { alert('يرجى ملء جميع حقول كلمة المرور.'); return; }
        if (confirm && newP !== confirm) { alert('كلمات المرور الجديدة غير متطابقة.'); return; }

        let users = Store.get('users') || [];
        const idx = users.findIndex(u => u.id === AuthManager.currentUser.id);
        if (idx > -1) {
            if (users[idx].password !== curr) { alert('كلمة المرور الحالية غير صحيحة.'); return; }
            users[idx].password = newP;
            Store.set('users', users);
            AuthManager.currentUser.password = newP;
            localStorage.setItem('currentUser', JSON.stringify(AuthManager.currentUser));
            document.getElementById('setting-curr-pass').value = '';
            document.getElementById('setting-new-pass').value = '';
            if (document.getElementById('setting-confirm-pass')) document.getElementById('setting-confirm-pass').value = '';
            Store.log('Password Changed', AuthManager.currentUser.name);
            AuthManager.showToast('✅ تم تغيير كلمة المرور بنجاح!');
        }
    },

    showToast: (msg, type = 'success') => {
        let toast = document.getElementById('global-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'global-toast';
            toast.style.cssText = `
                position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
                background: ${type === 'success' ? '#10b981' : '#ef4444'};
                color: white; padding: 1rem 1.5rem; border-radius: 0.75rem;
                font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                transform: translateY(100px); opacity: 0;
                transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
                font-size: 0.95rem;
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.background = type === 'success' ? '#10b981' : '#ef4444';
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });
        setTimeout(() => {
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
        }, 3500);
    }
};

window.AuthManager = AuthManager;

document.addEventListener('DOMContentLoaded', () => {
    AuthManager.init();
});
