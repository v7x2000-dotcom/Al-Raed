/**
 * Al-Raed Platform - Advanced Chat System
 * - Separated Group / Channel Creation
 * - Invitation System: Invite -> Notify -> Accept -> Join
 * - Permissions & Real-time sync
 */
const ChatManager = {
    currentType: 'private',
    currentReceiverId: null,
    currentReceiverName: null,
    _pendingAttachment: null,
    _pendingRoomImg: null,
    _isSelfChat: false,
    _isSending: false,
    _typingTimeout: null,
    _otherTypingTimeout: null,
    _replyTo: null,

    // --- مفاتيح التخزين (Storage Keys) ---
    _getPrivateKey: (me, otherId) => `pm_${[me.id, otherId].sort().join('_')}`,
    _getSelfKey: (me) => `savedMessages_${me.id}`,
    _getRoomKey: (roomId) => `room_msgs_${roomId}`,

    _knownMessageIds: new Set(),
    init: () => {
        ChatManager.bindTabEvents();
        ChatManager.bindSendEvent();
        ChatManager.bindEmojiEvents();

        const activeTab = document.querySelector('.chat-tab.active');
        if (activeTab) {
            ChatManager.currentType = activeTab.dataset.type;
            ChatManager._styleActiveTab(activeTab);
        }

        ChatManager.render();
        setTimeout(() => { if (ChatManager._updateNavBadge) ChatManager._updateNavBadge(); }, 200);

        // Populate known message IDs to prevent notification flood on load
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('pm_') || k.startsWith('room_msgs_')) {
                try {
                    const msgs = JSON.parse(localStorage.getItem(k) || '[]');
                    msgs.forEach(m => ChatManager._knownMessageIds.add(m.id));
                } catch (e) { }
            }
        });

        window.addEventListener('storeUpdated', (e) => {
            const key = e.detail?.key;
            const value = e.detail?.value;

            if (key === 'chat_rooms' || key === 'chat_invitations' || key === 'team') {
                ChatManager.render();
            }

            // Typing indicator
            if (key?.startsWith('typing_')) {
                const me = AuthManager.currentUser;
                if (!me) { console.error('ChatManager: No current user found'); return; }
                const convKey = key.replace('typing_', '');
                const myConvKey = ChatManager.currentReceiverId
                    ? ChatManager._getPrivateKey(me, ChatManager.currentReceiverId)
                    : null;
                const tyEl = document.getElementById('chat-typing-indicator');
                const tyText = document.getElementById('chat-typing-text');

                if (tyEl && myConvKey === convKey && value && value.userId !== me.id) {
                    tyEl.style.display = 'flex';
                    if (tyText) tyText.textContent = (value.userName || 'المستخدم') + ' يكتب الالآنن...';
                    clearTimeout(ChatManager._otherTypingTimeout);
                    ChatManager._otherTypingTimeout = setTimeout(() => { tyEl.style.display = 'none'; }, 3000);
                } else if (tyEl && myConvKey === convKey) {
                    tyEl.style.display = 'none';
                }
            }


            // Read Receipts Live Update
            if (key?.startsWith('read_')) {
                if (ChatManager.currentType === 'private' && ChatManager.currentReceiverId && document.getElementById('chat-section')?.classList.contains('active')) {
                    ChatManager.renderMessages(); // Re-render to update checkmarks
                }
            }

            // Real-Time Messages & Notifications
            if (key?.startsWith('pm_') || key?.startsWith('room_msgs_')) {
                const me = AuthManager.currentUser;
                if (!me) return;
                const msgs = value || [];

                let hasNewForMe = false;
                let latestMsg = null;

                msgs.forEach(msg => {
                    if (!ChatManager._knownMessageIds.has(msg.id)) {
                        ChatManager._knownMessageIds.add(msg.id);
                        if (msg.senderId !== me.id) {
                            hasNewForMe = true;
                            latestMsg = msg;
                        }
                    }
                });

                const isPrivate = key.startsWith('pm_');
                let isActiveConv = false;
                if (ChatManager.currentReceiverId && document.getElementById('chat-section')?.classList.contains('active')) {
                    if (isPrivate && !ChatManager._isSelfChat && ChatManager._getPrivateKey(me, ChatManager.currentReceiverId) === key) {
                        isActiveConv = true;
                    } else if (!isPrivate && ChatManager._getRoomKey(ChatManager.currentReceiverId) === key) {
                        isActiveConv = true;
                    }
                }

                if (isActiveConv) {
                    ChatManager._clearUnread(key);
                    ChatManager.renderMessages();
                } else if (hasNewForMe && latestMsg) {
                    ChatManager._updateNavBadge();
                    ChatManager._playSound();
                    const roomName = isPrivate ? latestMsg.senderName : ((Store.get('chat_rooms') || []).find(r => r.id === key.replace('room_msgs_', ''))?.name || 'مجموعة');
                    NotificationManager.add('💬 رسالة جديدة من ' + latestMsg.senderName + (isPrivate ? '' : ' في ' + roomName), 'fa-comment', 'chat', isPrivate ? latestMsg.senderId : key.replace('room_msgs_', ''));
                }

                if (ChatManager.currentType === 'private') ChatManager.loadUsers();
                else if (ChatManager.currentType === 'financial') ChatManager.loadFinancials();
                else ChatManager.loadRooms();
            }
        });

        // Listen for online users changes
        window.addEventListener('onlineUsersUpdated', () => {
            if (ChatManager.currentType === 'private' && ChatManager.currentReceiverId) {
                // Just update the status bar in the header
                const member = (Store.get('team') || []).find(m => m.id === ChatManager.currentReceiverId);
                if (member) {
                    const statusEl = document.getElementById('chat-active-status');
                    if (statusEl) {
                        const isOnline = AuthManager.isUserOnline(member.id);
                        const lastSeen = AuthManager.getUserLastSeen(member.id);
                        const lastSeenText = isOnline ? (document.documentElement.dir === 'rtl' ? 'متصل الالآنن' : 'Online') :
                            (lastSeen ? (document.documentElement.dir === 'rtl' ? 'الآنخر ظهور ' : 'Last seen ') + App.formatTimeAgo(lastSeen) : (document.documentElement.dir === 'rtl' ? 'غير متصل' : 'Offline'));
                        statusEl.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${isOnline ? 'var(--success)' : 'var(--text-secondary)'};display:inline-block;"></span> ${lastSeenText}`;
                    }
                }
                // Also refresh sidebar list for status dots
                ChatManager.loadUsers();
            }
        });

        // Global Avatar Error Handler
        document.addEventListener('error', (e) => {
            if (e.target.tagName === 'IMG' && (e.target.classList.contains('chat-header-avatar') || e.target.closest('.chat-container'))) {
                const name = ChatManager.currentReceiverName || 'User';
                e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=6366f1&color=fff';
            }
        }, true);

        // Periodically refresh the online status UI every minute to update the "Last seen X mins ago" text
        setInterval(() => {
            if (ChatManager.currentType === 'private' && document.querySelector('.chat-container')) {
                window.dispatchEvent(new CustomEvent('onlineUsersUpdated'));
            }
        }, 60000);
    },

    render: () => {
        ChatManager.renderInvitations(); // Show pending invites
        if (ChatManager.currentType === 'private') {
            ChatManager.loadUsers();
        } else {
            ChatManager.loadRooms();
        }
        ChatManager.renderMessages();
    },

    _styleActiveTab: (btn) => {
        if (!btn) return;
        document.querySelectorAll('.chat-tab').forEach(b => {
            b.classList.remove('active');
        });
        btn.classList.add('active');
    },

    bindTabEvents: () => {
        document.querySelectorAll('.chat-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                ChatManager.currentType = btn.dataset.type;
                ChatManager._styleActiveTab(btn);
                ChatManager.currentReceiverId = null;
                ChatManager.currentReceiverName = null;
                ChatManager._isSelfChat = false;
                ChatManager.render();

                const header = document.getElementById('chat-active-name');
                const addBtn = document.getElementById('chat-dynamic-add-btn');
                const headerAvatar = document.getElementById('chat-active-avatar');
                const statusEl = document.getElementById('chat-active-status');

                if (headerAvatar) headerAvatar.style.display = 'none';
                if (statusEl) statusEl.innerHTML = '';

                if (ChatManager.currentType === 'group') {
                    header.textContent = LangManager.t('Groups');
                    if (addBtn) addBtn.style.display = 'flex';
                } else if (ChatManager.currentType === 'broadcast') {
                    header.textContent = LangManager.t('Channels');
                    if (addBtn) addBtn.style.display = 'flex';
                } else {
                    header.textContent = LangManager.t('Choose a chat to start');
                    if (addBtn) addBtn.style.display = 'none';
                }

                // Hide chat UI until a specific item is selected in the new tab
                const mainHeader = document.querySelector('.chat-main-header');
                const inputWrapper = document.querySelector('.chat-input-wrapper');
                if (mainHeader) {
                    mainHeader.style.opacity = '0';
                    mainHeader.style.pointerEvents = 'none';
                }
                if (inputWrapper) {
                    inputWrapper.style.opacity = '0';
                    inputWrapper.style.pointerEvents = 'none';
                }
                const msgContainer = document.getElementById('chat-messages');
                if (msgContainer) msgContainer.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;opacity:0.4;gap:1rem;text-align:center;"><i class="fas fa-comments" style="font-size:4rem;"></i><p>اختر �&حادثة ��بدء</p></div>';
            });
        });
    },

    handleCreateAction: () => {
        ChatManager.showCreateRoomModal(ChatManager.currentType);
    },

    renderInvitations: () => {
        const sidebar = document.getElementById('chat-users-sidebar');
        const me = AuthManager.currentUser;
        if (!me) return;

        const allInvites = Store.get('chat_invitations') || [];
        const myInvites = allInvites.filter(inv => inv.toId === me.id && inv.status === 'pending');

        if (myInvites.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = 'padding:0.6rem 1rem;font-size:0.75rem;font-weight:700;color:var(--warning);background:rgba(245,158,11,0.1);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;';
            header.innerHTML = `<span>دعوات جديدة (${myInvites.length})</span> <i class="fas fa-envelope-open-text"></i>`;
            sidebar.prepend(header);

            const team = Store.get('team') || [];
            myInvites.forEach(inv => {
                const div = document.createElement('div');
                div.style.cssText = 'padding:0.8rem 1rem;background:rgba(245,158,11,0.05);border-bottom:1px solid var(--border-color);';
                const sender = team.find(t => t.id === inv.fromId) || { name: 'مجهول' };
                div.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><img src="${sender.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(sender.name)}" style="width:36px;height:36px;border-radius:50%;"><span style="font-weight:700;font-size:0.85rem;">${sender.name}</span></div><p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;">يدعوك للانضمام إلى <strong>${inv.roomName || 'مجموعة'}</strong></p><div style="display:flex;gap:6px;"><button onclick="ChatManager.acceptInvite('${inv.id}')" style="flex:1;padding:6px;background:var(--success);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;font-weight:600;">قبول</button><button onclick="ChatManager.rejectInvite('${inv.id}')" style="flex:1;padding:6px;background:rgba(239,68,68,0.1);color:var(--danger);border:1px solid var(--danger);border-radius:8px;cursor:pointer;font-size:0.8rem;">رفض</button></div>`;
                sidebar.appendChild(div);
            });
        }
    },

    loadUsers: () => {
        const sidebar = document.getElementById('chat-users-sidebar');
        if (!sidebar) return;
        sidebar.innerHTML = '';
        const me = AuthManager.currentUser;
        if (!me) return;
        const team = (Store.get('team') || []).filter(m => m.id !== me.id);

        // Self-chat first
        const selfDiv = document.createElement('div');
        selfDiv.className = 'chat-user-item' + (ChatManager._isSelfChat && ChatManager.currentReceiverId === me.id ? ' selected' : '');
        selfDiv.onclick = (e) => ChatManager._selectUser(me, true, e);
        const selfKey = ChatManager._getSelfKey(me);
        const selfMsgs = JSON.parse(localStorage.getItem(selfKey) || '[]');

        // Filter out deleted messages for preview
        const selfDeletedKey = 'chat_deleted_' + selfKey;
        const selfDeletedIds = JSON.parse(localStorage.getItem(selfDeletedKey) || '[]');
        const validSelfMsgs = selfMsgs.filter(m => !m.isDeletedForEveryone && !selfDeletedIds.includes(m.id));
        const selfLast = validSelfMsgs[validSelfMsgs.length - 1];

        selfDiv.innerHTML = `<div style="position:relative;flex-shrink:0;"><img src="${me.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(me.name)}" style="width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid var(--primary-color);"><span style="position:absolute;bottom:1px;right:1px;width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid var(--bg-primary);"></span></div><div style="flex:1;overflow:hidden;"><div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(me && me.name) ? me.name : "User"} (أنت)</div><div style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${selfLast ? selfLast.content.substring(0, 30) : 'لا توجد رسائل'}</div></div>`;
        sidebar.appendChild(selfDiv);

        if (team.length === 0) {
            const emptyHint = document.createElement('div');
            emptyHint.style.cssText = 'padding:2rem;text-align:center;opacity:0.5;font-size:0.8rem;';
            emptyHint.textContent = 'لا يوجد موظفون آخرون متاحون حالياً';
            sidebar.appendChild(emptyHint);
        }
        team.forEach(member => {
            if (!member || !member.id) return;
            const key = ChatManager._getPrivateKey(me, member.id);
            const msgs = Store.get(key) || [];

            // Filter out deleted messages for preview
            const deletedKey = 'chat_deleted_' + key;
            const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
            const validMsgs = msgs.filter(m => !m.isDeletedForEveryone && !deletedIds.includes(m.id));
            const lastMsg = validMsgs[validMsgs.length - 1];

            const unread = ChatManager._getConvUnread(key);
            const isOnline = AuthManager.isUserOnline(member.id);
            const isSelected = !ChatManager._isSelfChat && ChatManager.currentReceiverId === member.id;
            const div = document.createElement('div');
            div.className = 'chat-user-item' + (isSelected ? ' selected' : '');
            div.onclick = (e) => ChatManager._selectUser(member, false, e);
            div.innerHTML = `<div style="position:relative;flex-shrink:0;"><img src="${member.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.name)}" style="width:46px;height:46px;border-radius:50%;object-fit:cover;"><span style="position:absolute;bottom:1px;right:1px;width:10px;height:10px;background:${isOnline ? '#22c55e' : 'var(--text-secondary)'};border-radius:50%;border:2px solid var(--bg-primary);"></span></div><div style="flex:1;overflow:hidden;"><div style="display:flex;justify-content:space-between;"><span style="font-weight:700;font-size:0.9rem;">${member.name}</span><span style="font-size:0.7rem;color:var(--text-secondary);">${lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span></div><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${lastMsg ? lastMsg.content.substring(0, 35) : 'ابدأ المحادثة'}</span>${unread > 0 ? `<span style="background:#ef4444;color:#fff;border-radius:50%;min-width:18px;height:18px;font-size:0.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;">${unread}</span>` : ''}</div></div>`;
            sidebar.appendChild(div);
        });
    },

    loadRooms: () => {
        const sidebar = document.getElementById('chat-users-sidebar');
        if (!sidebar) return;
        sidebar.innerHTML = '';
        const me = AuthManager.currentUser;
        if (!me) return;
        const rooms = (Store.get('chat_rooms') || []).filter(r => r.type === ChatManager.currentType && (r.members?.includes(me.id) || r.type === 'broadcast'));
        if (!rooms.length) {
            sidebar.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary);font-size:0.85rem;">لا توجد ' + (ChatManager.currentType === 'group' ? 'مجموعات' : 'قنوات') + ' بعد</div>';
            return;
        }
        rooms.forEach(room => {
            if (!room || !room.id) return;
            const key = ChatManager._getRoomKey(room.id);
            const msgs = Store.get(key) || [];

            // Filter out deleted messages for preview
            const deletedKey = 'chat_deleted_' + key;
            const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
            const validMsgs = msgs.filter(m => !m.isDeletedForEveryone && !deletedIds.includes(m.id));
            const lastMsg = validMsgs[validMsgs.length - 1];

            const unread = ChatManager._getConvUnread(key);
            const isSelected = ChatManager.currentReceiverId === room.id;
            const div = document.createElement('div');
            div.className = 'chat-user-item' + (isSelected ? ' selected' : '');
            div.onclick = (e) => ChatManager._selectRoom(room, e);
            div.innerHTML = `<div style="flex-shrink:0;"><img src="${room.image || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(room.name) + '&background=3b82f6&color=fff'}" style="width:46px;height:46px;border-radius:12px;object-fit:cover;"></div><div style="flex:1;overflow:hidden;"><div style="display:flex;justify-content:space-between;"><span style="font-weight:700;font-size:0.9rem;">${room.name}</span><span style="font-size:0.7rem;color:var(--text-secondary);">${lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span></div><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${lastMsg ? lastMsg.senderName + ': ' + lastMsg.content.substring(0, 25) : 'لا توجد رسائلل'}</span>${unread > 0 ? `<span style="background:#ef4444;color:#fff;border-radius:50%;min-width:18px;height:18px;font-size:0.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;">${unread}</span>` : ''}</div></div>`;
            sidebar.appendChild(div);
        });
    },

    _selectUser: (member, isSelf) => {
        const me = AuthManager.currentUser;
        ChatManager.currentReceiverId = member.id;
        ChatManager.currentReceiverName = member.name;
        ChatManager._isSelfChat = isSelf;
        document.querySelector('.chat-container')?.classList.add('chat-mobile-active');
        const header = document.querySelector('.chat-main-header');
        const inputWrapper = document.querySelector('.chat-input-wrapper');
        if (header) { header.style.opacity = '1'; header.style.pointerEvents = 'auto'; header.style.cursor = 'pointer'; header.onclick = ChatManager.toggleProfileSidebar; }
        if (inputWrapper) { inputWrapper.style.opacity = '1'; inputWrapper.style.pointerEvents = 'auto'; }

        // Hide Smart Link Button in Private Chats
        const btnSmartLink = document.getElementById('btn-chat-smart-link');
        if (btnSmartLink) btnSmartLink.style.display = 'none';

        document.getElementById('chat-active-name').textContent = isSelf ? `${member.name} (أنت)` : member.name;
        const av = document.getElementById('chat-active-avatar');
        if (av) { av.src = member.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.name); av.style.display = 'block'; }
        const statusEl = document.getElementById('chat-active-status');
        if (statusEl) {
            const isOnline = AuthManager.isUserOnline(member.id);
            const lastSeen = AuthManager.getUserLastSeen(member.id);
            const lastSeenText = isOnline ? (document.documentElement.dir === 'rtl' ? 'متصل الالآنن' : 'Online') :
                (lastSeen ? (document.documentElement.dir === 'rtl' ? 'الآنخر ظهور ' : 'Last seen ') + App.formatTimeAgo(lastSeen) : (document.documentElement.dir === 'rtl' ? 'غير متصل' : 'Offline'));

            statusEl.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${isOnline ? 'var(--success)' : 'var(--text-secondary)'};display:inline-block;"></span> ${lastSeenText}`;
        }
        const convKey = isSelf ? ChatManager._getSelfKey(me) : ChatManager._getPrivateKey(me, member.id);
        ChatManager._clearUnread(convKey);
        ChatManager.loadUsers();
        ChatManager.renderMessages();
    },

    _selectRoom: (room, e) => {
        const me = AuthManager.currentUser;
        ChatManager.currentReceiverId = room.id;
        ChatManager.currentReceiverName = room.name;
        ChatManager._isSelfChat = false;
        document.querySelector('.chat-container')?.classList.add('chat-mobile-active');
        const header = document.querySelector('.chat-main-header');
        const inputWrapper = document.querySelector('.chat-input-wrapper');
        if (header) { header.style.opacity = '1'; header.style.pointerEvents = 'auto'; header.style.cursor = 'pointer'; header.onclick = ChatManager.toggleProfileSidebar; }
        if (inputWrapper) { inputWrapper.style.opacity = '1'; inputWrapper.style.pointerEvents = 'auto'; }
        document.getElementById('chat-active-name').textContent = room.name;
        const av = document.getElementById('chat-active-avatar');
        if (av) { av.src = room.image || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(room.name) + '&background=3b82f6&color=fff'; av.style.display = 'block'; }
        const statusEl = document.getElementById('chat-active-status');
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-users" style="font-size:0.75rem;opacity:0.6;"></i> ${room.members?.length || 0} أعضواء`;
        const key = ChatManager._getRoomKey(room.id);
        ChatManager._clearUnread(key);

        // Handle Lock Status in UI
        const input = document.getElementById('chat-input');
        const btn = document.getElementById('btn-send-msg');
        if (input && btn) {
            const isAdmin = (room.admins || [room.createdBy]).includes(me.id);
            if (room.isLocked && !isAdmin) {
                input.placeholder = 'ا��&ج�&��عة �&غ��ة حا��ا�9 - ا��&د�ر ف�ط �`�&ْ� �! ا�ْتابة';
                input.disabled = true;
                btn.disabled = true;
                btn.style.opacity = '0.5';
            } else {
                input.placeholder = 'ايكتب رسا�تْ �!� ا...';
                input.disabled = false;
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }

        ChatManager.renderSmartWidget(room);
        ChatManager.loadRooms();
        ChatManager.renderMessages();
    },

    // Public API for external navigation (e.g. Notifications)
    selectUser: (userId) => {
        const team = Store.get('team') || [];
        const me = AuthManager.currentUser;
        const member = team.find(m => m.id === userId) || (userId === me?.id ? me : null);
        if (member) {
            ChatManager._selectUser(member, userId === me?.id);
        }
    },

    selectRoom: (roomId) => {
        const rooms = Store.get('chat_rooms') || [];
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            ChatManager._selectRoom(room);
        }
    },

    renderSmartWidget: (room) => {
        const btn = document.getElementById('btn-chat-smart-link');
        if (!btn) return;

        if (!room.linkedSection) {
            btn.style.display = 'none';
            return;
        }

        btn.style.display = 'flex';
        btn.onclick = () => ChatManager.showSmartPopup(room);

        // Update icon based on section
        const icon = btn.querySelector('i');
        if (icon) {
            if (room.linkedSection === 'finance') icon.className = 'fas fa-wallet';
            else if (room.linkedSection === 'tasks') icon.className = 'fas fa-tasks';
            else if (room.linkedSection === 'support') icon.className = 'fas fa-headset';
            else icon.className = 'fas fa-magic';
        }
    },

    showSmartPopup: (room) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(10px); display:flex; justify-content:center; align-items:center; z-index:100000; animation: fadeIn 0.3s ease;';

        let content = '';
        if (room.linkedSection === 'finance') {
            const expenses = Store.get('expenses') || [];
            const totalExp = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
            const income = Store.get('income') || [];
            const totalInc = income.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
            const debts = Store.get('debts') || [];
            const totalDebts = debts.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

            content = `
                <div style="padding:1.5rem;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:1.5rem;">
                        <div style="background:var(--success); color:#fff; width:45px; height:45px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.4rem;"><i class="fas fa-wallet"></i></div>
                        <div>
                            <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);">الإدارة المالية الذكية</h3>
                            <p style="margin:0; font-size:0.75rem; opacity:0.6; color:var(--text-secondary);">تحكم كامل في ميزانية المجموعة</p>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:1.5rem;">
                        <div style="background:rgba(34,197,94,0.05); padding:10px; border-radius:12px; border:1px solid rgba(34,197,94,0.1); text-align:center;">
                            <div style="font-size:0.6rem; opacity:0.6; color:var(--success); font-weight:800;">الدخل</div>
                            <div style="font-size:0.85rem; font-weight:800; color:var(--success);">$${totalInc.toLocaleString()}</div>
                        </div>
                        <div style="background:rgba(239,68,68,0.05); padding:10px; border-radius:12px; border:1px solid rgba(239,68,68,0.1); text-align:center;">
                            <div style="font-size:0.6rem; opacity:0.6; color:var(--danger); font-weight:800;">المصروفات</div>
                            <div style="font-size:0.85rem; font-weight:800; color:var(--danger);">$${totalExp.toLocaleString()}</div>
                        </div>
                        <div style="background:rgba(245,158,11,0.05); padding:10px; border-radius:12px; border:1px solid rgba(245,158,11,0.1); text-align:center;">
                            <div style="font-size:0.6rem; opacity:0.6; color:var(--warning); font-weight:800;">الديون</div>
                            <div style="font-size:0.85rem; font-weight:800; color:var(--warning);">$${totalDebts.toLocaleString()}</div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <button onclick="ChatManager._handleSmartAction('finance', 'expense')" style="width:100%; padding:0.9rem; background:var(--primary-gradient); color:#fff; border:none; border-radius:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;"><i class="fas fa-minus-circle"></i> إضافة مصروف</button>
                        <button onclick="ChatManager._handleSmartAction('finance', 'income')" style="width:100%; padding:0.9rem; background:rgba(34,197,94,0.1); color:var(--success); border:1px solid var(--success); border-radius:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;"><i class="fas fa-plus-circle"></i> إضافة دخل</button>
                        <button onclick="ChatManager._handleSmartAction('finance', 'debt')" style="width:100%; padding:0.9rem; background:rgba(245,158,11,0.1); color:var(--warning); border:1px solid var(--warning); border-radius:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;"><i class="fas fa-hand-holding-usd"></i> إضافة دين</button>
                        <button onclick="ChatManager._handleSmartAction('finance', 'view')" style="width:100%; padding:0.7rem; background:none; color:var(--text-primary); border:1px solid var(--border-color); border-radius:12px; font-size:0.8rem; cursor:pointer; margin-top:5px;"><i class="fas fa-external-link-alt"></i> السجل المالي الكامل</button>
                    </div>
                </div>
            `;
        } else if (room.linkedSection === 'tasks') {
            const tasks = Store.get('tasks') || [];
            const pending = tasks.filter(t => t.status === 'todo').length;
            content = `
                <div style="padding:1.5rem;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:1.5rem;">
                        <div style="background:var(--warning); color:#fff; width:45px; height:45px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.4rem;"><i class="fas fa-tasks"></i></div>
                        <div>
                            <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);">�&�!ا�& ا��&ج�&��عة</h3>
                            <p style="margin:0; font-size:0.75rem; opacity:0.6; color:var(--text-secondary);">�&تابعة ��إس� اد ا��&�!ا�& ��فريق�`�</p>
                        </div>
                    </div>
                    <div style="background:var(--bg-primary); padding:1.25rem; border-radius:15px; border:1px solid var(--border-color); text-align:center; margin-bottom:1.5rem;">
                        <div style="font-size:2rem; font-weight:900; color:var(--warning);">${pending}</div>
                        <div style="font-size:0.8rem; opacity:0.7; color:var(--text-secondary);">�&�!�&ة ��د ا�ا� تظار</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <button onclick="ChatManager._handleSmartAction('tasks', 'add')" style="width:100%; padding:0.9rem; background:var(--primary-gradient); color:#fff; border:none; border-radius:12px; font-weight:700; cursor:pointer;"><i class="fas fa-plus-circle"></i> إضافة �&�!�&ة جد�دة</button>
                        <button onclick="ChatManager._handleSmartAction('tasks', 'view')" style="width:100%; padding:0.8rem; background:none; color:var(--text-primary); border:1px solid var(--border-color); border-radius:12px; font-size:0.85rem; cursor:pointer;"><i class="fas fa-th-large"></i> فتح ���حة ا��&�!ا�&</button>
                    </div>
                </div>
            `;
        } else if (room.linkedSection === 'support') {
            content = `
                <div style="padding:1.5rem;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:1.5rem;">
                        <div style="background:var(--danger); color:#fff; width:45px; height:45px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.4rem;"><i class="fas fa-headset"></i></div>
                        <div>
                            <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);">دع�& ا�فريق�`�</h3>
                            <p style="margin:0; font-size:0.75rem; opacity:0.6; color:var(--text-secondary);">تذاْر ا�دع�& ا�ف� �` ��ا��&ساعدة</p>
                        </div>
                    </div>
                    <button onclick="ChatManager._handleSmartAction('support', 'view')" style="width:100%; padding:1rem; background:var(--primary-gradient); color:#fff; border:none; border-radius:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;"><i class="fas fa-ticket-alt"></i> فتح �&رْز ا�دع�&</button>
                </div>
            `;
        }

        modal.innerHTML = `
            <div style="background:var(--bg-secondary); border-radius:24px; width:95%; max-width:400px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); border:1px solid var(--border-color); position:relative; overflow:hidden; animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);">
                <div style="padding:1rem; text-align:right;">
                    <button class="close-modal" style="background:none; border:none; color:var(--text-secondary); font-size:1.2rem; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
                ${content}
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.remove();
        ChatManager._currentSmartModal = modal;
    },

    _handleSmartAction: (section, action) => {
        if (ChatManager._currentSmartModal) ChatManager._currentSmartModal.remove();

        if (section === 'finance') {
            document.querySelector('.nav-item[data-target=\'finance-section\']')?.click();
            setTimeout(() => {
                if (action === 'view') return;
                FinanceManager.openModal(action);
            }, 200);
        } else if (section === 'tasks') {
            document.querySelector('.nav-item[data-target=\'tasks-section\']')?.click();
            setTimeout(() => {
                if (action === 'add') document.getElementById('btn-add-task')?.click();
            }, 200);
        } else if (section === 'support') {
            document.querySelector('.nav-item[data-target=\'support-section\']')?.click();
        }
    },
    getMessages: () => {
        const me = AuthManager.currentUser;
        if (!me || !ChatManager.currentReceiverId) return [];

        const convKey = ChatManager.currentType === 'private'
            ? (ChatManager._isSelfChat ? ChatManager._getSelfKey(me) : ChatManager._getPrivateKey(me, ChatManager.currentReceiverId))
            : ChatManager._getRoomKey(ChatManager.currentReceiverId);

        const deletedIds = JSON.parse(localStorage.getItem('chat_deleted_' + convKey) || '[]');

        let msgs = [];
        if (ChatManager.currentType === 'private') {
            if (ChatManager._isSelfChat) msgs = JSON.parse(localStorage.getItem(ChatManager._getSelfKey(me)) || '[]');
            else {
                const key = ChatManager._getPrivateKey(me, ChatManager.currentReceiverId);
                msgs = Store.get(key) || JSON.parse(localStorage.getItem(key) || '[]');
            }
        } else {
            msgs = Store.get(ChatManager._getRoomKey(ChatManager.currentReceiverId)) || [];
        }

        return msgs.filter(m => !deletedIds.includes(m.id));
    },

    renderMessages: () => {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const me = AuthManager.currentUser;
        if (!me || !ChatManager.currentReceiverId) return;
        const messages = ChatManager.getMessages();

        // Hide empty state if there are messages
        const emptyState = document.getElementById('chat-empty-state');
        if (emptyState) emptyState.style.display = messages.length > 0 ? 'none' : 'flex';

        const convKey = ChatManager.currentType === 'private'
            ? (ChatManager._isSelfChat ? ChatManager._getSelfKey(me) : ChatManager._getPrivateKey(me, ChatManager.currentReceiverId))
            : ChatManager._getRoomKey(ChatManager.currentReceiverId);
        const otherReadTime = Store.get('read_' + convKey + '_' + ChatManager.currentReceiverId) || 0;

        container.innerHTML = '';
        if (!messages.length) {
            container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;opacity:0.6;gap:1rem;text-align:center;padding:2rem;"><i class="fas fa-comment-dots" style="font-size:3rem;color:var(--primary-color);"></i><p style="font-size:1rem;font-weight:600;">لا توجد رسائلل بعد. قل مرحباً! 👋</p></div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        messages.forEach((msg, index) => {
            const isMe = msg.senderId === me?.id;
            const time = new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            const div = document.createElement('div');
            div.className = `msg-wrapper ${isMe ? 'msg-sent' : 'msg-received'}`;

            let attachmentHtml = '';
            if (msg.attachment) {
                const att = msg.attachment;
                if (att.mimeType?.startsWith('image/')) {
                    attachmentHtml = `<img src="${att.dataUrl}" loading="lazy" style="max-width:100%;border-radius:12px;margin-bottom:8px;display:block;cursor:pointer;" onclick="window.open('${att.dataUrl}')">`;
                } else {
                    attachmentHtml = `<a href="${att.dataUrl}" download="${att.name}" style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(255,255,255,0.05);border-radius:10px;text-decoration:none;color:inherit;margin-bottom:8px;border:1px solid rgba(255,255,255,0.1);"><i class="fas fa-file-download"></i><span style="font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${att.name}</span></a>`;
                }
            }

            let checkmarks = '';
            if (isMe) {
                if (ChatManager.currentType === 'private') {
                    const isRead = new Date(msg.timestamp).getTime() <= otherReadTime;
                    checkmarks = `<i class="fas fa-check-double" style="color:${isRead ? '#3b82f6' : 'rgba(255,255,255,0.4)'};font-size:0.7rem;"></i>`;
                } else {
                    checkmarks = '<i class="fas fa-check-double" style="color:rgba(255,255,255,0.4);font-size:0.7rem;"></i>';
                }
            }

            let contentHtml = `<div class="msg-text">${msg.content || ''}</div>`;
            if (msg.isDeletedForEveryone) {
                attachmentHtml = '';
                const deletedText = isMe ? LangManager.t('You deleted this message') : LangManager.t('This message was deleted');
                contentHtml = `<div class="msg-text" style="font-style:italic;opacity:0.6;display:flex;align-items:center;gap:6px;"><i class="fas fa-ban" style="font-size:0.7rem;"></i> ${deletedText}</div>`;
            }

            let replyHtml = '';
            if (msg.replyTo) {
                const replyMsg = messages.find(m => m.id === msg.replyTo.id) || msg.replyTo;
                replyHtml = `
                    <div class="reply-quote" onclick="ChatManager.scrollToMessage('${replyMsg.id}')" style="cursor:pointer;background:rgba(255,255,255,0.05);border-right:3px solid var(--primary-color);padding:6px 10px;border-radius:8px;margin-bottom:8px;font-size:0.75rem;">
                        <div class="reply-quote-name" style="font-weight:800;color:var(--primary-color);margin-bottom:2px;">${replyMsg.senderName === me.name ? (document.documentElement.dir === 'rtl' ? 'أنت' : 'You') : replyMsg.senderName}</div>
                        <div class="reply-quote-text" style="opacity:0.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${replyMsg.content || (replyMsg.attachment ? (document.documentElement.dir === 'rtl' ? '📎 مرفق' : '📎 Attachment') : '')}</div>
                    </div>
                `;
            }

            div.innerHTML = `
                <div class="swipe-reply-indicator"><i class="fas fa-reply"></i></div>
                <img src="${msg.senderAvatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(msg.senderName)}" loading="lazy" class="msg-avatar">
                <div class="msg-bubble-container">
                    <div class="msg-bubble" 
                         onclick="ChatManager.showMsgMenu(event, '${msg.id}', ${isMe})"
                         onmousedown="ChatManager._handleSwipeStart(event, '${msg.id}')"
                         ontouchstart="ChatManager._handleSwipeStart(event, '${msg.id}')">
                        ${!isMe && ChatManager.currentType !== 'private' ? `<div class="msg-sender-name">${msg.senderName}</div>` : ''}
                        ${replyHtml}
                        ${attachmentHtml}
                        ${contentHtml}
                        <div class="msg-meta">
                            <span class="msg-time">${time}</span>
                            ${isMe && !msg.isDeletedForEveryone ? checkmarks : ''}
                        </div>
                    </div>
                </div>
            `;
            fragment.appendChild(div);
        });
        container.appendChild(fragment);

        // Apply Twemoji with Apple style for consistent look in messages
        if (window.twemoji) {
            twemoji.parse(container, {
                base: 'https://cdn.jsdelivr.net/gh/iamcal/emoji-data@master/img-apple-64/',
                folder: '',
                callback: (iconId) => iconId + '.png'
            });
        }

        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    },

    toggleProfileSidebar: () => {
        let sidebar = document.getElementById('chat-profile-sidebar');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.id = 'chat-profile-sidebar';
            sidebar.style.cssText = 'position:absolute;top:0;right:0;width:min(320px,100%);height:100%;background:var(--bg-secondary);border-left:1px solid var(--border-color);z-index:100;transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.2,0.8,0.2,1);overflow-y:auto;display:flex;flex-direction:column;box-shadow:-10px 0 30px rgba(0,0,0,0.2);';
            const chatMain = document.querySelector('.chat-main');
            if (chatMain) { chatMain.style.position = 'relative'; chatMain.style.overflow = 'hidden'; chatMain.appendChild(sidebar); }
        }
        const isVisible = sidebar.style.transform === 'translateX(0px)';
        if (isVisible) { sidebar.style.transform = 'translateX(100%)'; return; }

        const me = AuthManager.currentUser;
        const team = Store.get('team') || [];
        const isPrivate = ChatManager.currentType === 'private';
        let avatar, name, subtitle, body = '';

        if (isPrivate) {
            const m = ChatManager._isSelfChat ? me : (team.find(t => t.id === ChatManager.currentReceiverId) || me);
            const isOnline = AuthManager.isUserOnline(m.id);
            avatar = m.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(m.name);
            name = m.name; subtitle = m.role || 'عضو�� با�فريق�`�';
            body = `<div style="background:var(--bg-primary);border-radius:12px;padding:1rem;margin-bottom:1rem;border:1px solid var(--border-color);"><div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;">حا�ة ا�اتصا�</div><div style="font-weight:600;display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${isOnline ? 'var(--success)' : 'var(--text-secondary)'};display:inline-block;"></span> ${isOnline ? '�متصل� ا�الآن� ' : 'غ�ر �متصل�'}</div></div><div style="background:var(--bg-primary);border-radius:12px;padding:1rem;border:1px solid var(--border-color);"><div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;">ا�بر�د ا�إ�ْتر��� �`</div><div style="font-weight:600;font-size:0.85rem;word-break:break-all;">${m.email || 'غ�ر �&ت��فريق'}</div></div>`;
        } else {
            const rooms = Store.get('chat_rooms') || [];
            const room = rooms.find(r => r.id === ChatManager.currentReceiverId);
            if (!room) return;
            avatar = room.image || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(room.name) + '&background=3b82f6&color=fff';
            name = room.name; subtitle = ChatManager.currentType === 'group' ? '�&ج�&��عة ع�&�' : '�� اة';

            const isActualAdmin = (room.admins || [room.createdBy]).includes(me.id);
            const canEdit = !room.isInfoRestricted || isActualAdmin;

            let adminTools = '';
            if (canEdit || isActualAdmin) {
                adminTools = `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:1rem;">
                        <button onclick="ChatManager.showRoomEditModal('${room.id}')" style="background:rgba(37,99,235,0.1);color:var(--primary-color);border:1px solid rgba(37,99,235,0.2);padding:8px;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;"><i class="fas fa-edit"></i> تعد�`�</button>
                        ${isActualAdmin ? `<button onclick="ChatManager.showAddMembersModal('${room.id}')" style="background:rgba(16,185,129,0.1);color:var(--success);border:1px solid rgba(16,185,129,0.2);padding:8px;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;"><i class="fas fa-user-plus"></i> إضافة</button>` : ''}
                        ${isActualAdmin ? `<button onclick="ChatManager.showPrivacySettingsModal('${room.id}')" style="background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.2);padding:8px;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;grid-column: span 2;"><i class="fas fa-shield-alt"></i> إعدادات ا�خص��ص�ة</button>` : ''}
                    </div>`;
            }

            const memberItems = (room.members || []).map(mid => {
                const m = team.find(t => t.id === mid) || { name: '�&ستخد�&', avatar: '' };
                const on = AuthManager.isUserOnline(m.id);
                const isRoomAdmin = (room.admins || [room.createdBy]).includes(m.id);
                const canManage = (room.admins || [room.createdBy]).includes(me.id) && m.id !== me.id;

                return `
                    <div class="member-item" 
                         onclick="${canManage ? `ChatManager.showMemberActionsModal('${room.id}', '${m.id}')` : ''}"
                         style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:${canManage ? 'pointer' : 'default'};transition:background 0.2s;border-radius:8px;"
                         onmouseenter="${canManage ? "this.style.background='rgba(255,255,255,0.05)'" : ''}"
                         onmouseleave="this.style.background='transparent'">
                        <div style="position:relative;">
                            <img src="${m.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(m.name)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
                            ${on ? '<span style="position:absolute;bottom:0;right:0;width:9px;height:9px;background:var(--success);border-radius:50%;border:2px solid var(--bg-primary);"></span>' : ''}
                        </div>
                        <span style="font-size:0.88rem;font-weight:600;flex:1;">${m.name}</span>
                        ${isRoomAdmin ? '<span style="font-size:0.6rem;background:rgba(37,99,235,0.15);color:var(--primary-color);padding:2px 7px;border-radius:10px;">�&شرف</span>' : ''}
                    </div>`;
            }).join('');
            body = `
                ${adminTools}
                <div style="background:var(--bg-primary);border-radius:12px;padding:1rem;margin-bottom:1rem;border:1px solid var(--border-color);">
                    <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;">ا���صف</div>
                    <div style="font-size:0.85rem;">${room.desc || '�ا �`��جد ��صف'}</div>
                </div>
                <div style="background:var(--bg-primary);border-radius:12px;padding:1rem;border:1px solid var(--border-color);">
                    <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:8px;">ا�أعضواء (${room.members?.length || 0})</div>
                    <div class="members-list-scroll">${memberItems}</div>
                </div>`;
        }

        sidebar.innerHTML = `<div style="padding:1rem 1.25rem;display:flex;align-items:center;gap:1rem;border-bottom:1px solid var(--border-color);position:sticky;top:0;background:var(--bg-secondary);z-index:2;"><button onclick="document.getElementById('chat-profile-sidebar').style.transform='translateX(100%)'" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:1.1rem;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-times"></i></button><h3 style="margin:0;font-size:1rem;font-weight:700;">�&ع����&ات ا��&حادثة</h3></div><div style="padding:2rem 1.25rem 1.5rem;text-align:center;border-bottom:1px solid var(--border-color);"><img src="${avatar}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid var(--bg-secondary);box-shadow:0 10px 20px rgba(0,0,0,0.2);margin-bottom:1rem;"><h2 style="margin:0 0 0.35rem;font-size:1.25rem;font-weight:800;">${name}</h2><div style="color:var(--primary-color);font-size:0.85rem;background:rgba(37,99,235,0.1);padding:3px 12px;border-radius:20px;display:inline-block;">${subtitle}</div></div><div style="padding:1.25rem;">${body}</div>`;
        sidebar.style.transform = 'translateX(0px)';
    },

    // ������ Room Management Modals ����������������������������������������������������������������������������������

    showRoomEditModal: (roomId) => {
        const room = (Store.get('chat_rooms') || []).find(r => r.id === roomId);
        if (!room) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10050';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:450px;">
                <div class="modal-header">
                    <h2>تعد�`� �&ع����&ات ا��&ج�&��عة</h2>
                    <button class="close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div style="text-align:center;margin-bottom:1.5rem;">
                        <div style="position:relative;display:inline-block;">
                            <img id="edit-room-img-preview" src="${room.image || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(room.name) + '&background=3b82f6&color=fff'}" style="width:100px;height:100px;border-radius:24px;object-fit:cover;border:3px solid var(--primary-color);">
                            <label for="edit-room-img-input" style="position:absolute;bottom:-5px;right:-5px;background:var(--primary-color);color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
                                <i class="fas fa-camera" style="font-size:0.8rem;"></i>
                            </label>
                            <input type="file" id="edit-room-img-input" accept="image/*" style="display:none;" onchange="ChatManager.handleRoomEditImg(this)">
                        </div>
                        <input type="hidden" id="edit-room-image-data" value="${room.image || ''}">
                    </div>
                    <div class="form-group">
                        <label>اس�& ا��&ج�&��عة</label>
                        <input type="text" id="edit-room-name" value="${room.name}">
                    </div>
                    <div class="form-group">
                        <label>ا���صف</label>
                        <textarea id="edit-room-desc" rows="3">${room.desc || ''}</textarea>
                    </div>
                    <div class="form-group" style="background:rgba(37,99,235,0.05); padding:12px; border-radius:12px; border:1px solid rgba(37,99,235,0.1); margin-top:10px;">
                        <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--primary-color);">�x ربط ذْ�` ب�س�& (Smart Link)</label>
                        <select id="edit-room-linked-section" style="width:100%; padding:0.6rem; border-radius:10px; background:var(--bg-primary); border:1px solid var(--border-color); color:var(--text-primary); font-size:0.8rem; outline:none; cursor:pointer;">
                            <option value="" ${!room.linkedSection ? 'selected' : ''}>بد���  ربط</option>
                            <option value="finance" ${room.linkedSection === 'finance' ? 'selected' : ''}>�س�& ا��&ا��ة (Financial Dashboard)</option>
                            <option value="tasks" ${room.linkedSection === 'tasks' ? 'selected' : ''}>���حة ا��&�!ا�& (Task Board)</option>
                            <option value="support" ${room.linkedSection === 'support' ? 'selected' : ''}>�&رْز ا�دع�& (Support Center)</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary cancel-modal">إ�غاء</button>
                    <button class="btn btn-primary" id="btn-save-room">حفظ ا�تغ�`�رات</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-save-room').onclick = () => {
            const name = modal.querySelector('#edit-room-name').value.trim();
            const desc = modal.querySelector('#edit-room-desc').value.trim();
            const image = modal.querySelector('#edit-room-image-data').value;
            const linkedSection = modal.querySelector('#edit-room-linked-section').value;
            if (!name) return;

            const rooms = Store.get('chat_rooms') || [];
            const r = rooms.find(i => i.id === roomId);
            if (r) {
                r.name = name;
                r.desc = desc;
                r.image = image;
                r.linkedSection = linkedSection;
                Store.set('chat_rooms', rooms);
                NotificationManager.add('ت�& تحد�ث ب�ا� ات ا��&ج�&��عة', 'fa-check', 'success');
                modal.remove();
                ChatManager.toggleProfileSidebar(); // Refresh sidebar
                ChatManager.loadRooms(); // Refresh list
            }
        };

        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.querySelector('.cancel-modal').onclick = () => modal.remove();
    },

    handleRoomEditImg: (input) => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const preview = document.getElementById('edit-room-img-preview');
            const dataInput = document.getElementById('edit-room-image-data');
            if (preview) preview.src = dataUrl;
            if (dataInput) dataInput.value = dataUrl;
        };
        reader.readAsDataURL(file);
    },

    showMemberActionsModal: (roomId, memberId) => {
        const team = Store.get('team') || [];
        const member = team.find(t => t.id === memberId);
        if (!member) return;

        const rooms = Store.get('chat_rooms') || [];
        const room = rooms.find(r => r.id === roomId);
        if (!room) return;

        const me = AuthManager.currentUser;
        const isTargetAdmin = (room.admins || [room.createdBy]).includes(memberId);
        const isMeAdmin = (room.admins || [room.createdBy]).includes(me.id);

        if (!isMeAdmin) return; // Should not happen but for safety

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10060';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:320px;text-align:center;padding:2rem;background:var(--bg-secondary);border:1px solid var(--primary-color);">
                <img src="${member.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.name)}" style="width:80px;height:80px;border-radius:50%;margin-bottom:1rem;border:3px solid var(--primary-color);object-fit:cover;">
                <h3 style="margin:0 0 0.5rem;color:var(--text-primary);">${member.name}</h3>
                <p style="font-size:0.8rem;opacity:0.6;margin-bottom:1.5rem;color:var(--text-secondary);">إدارة ص�اح�ات ا�عضو�� ف�` �!ذ�! ا��&ج�&��عة</p>
                
                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${isTargetAdmin ?
                `<button class="btn btn-secondary" onclick="ChatManager.demoteFromAdmin('${roomId}', '${memberId}', this.closest('.modal'))" style="width:100%;justify-content:center;"><i class="fas fa-user-minus"></i> إزا�ة �&�  ا�إشراف</button>` :
                `<button class="btn btn-primary" onclick="ChatManager.promoteToAdmin('${roomId}', '${memberId}', this.closest('.modal'))" style="width:100%;justify-content:center;"><i class="fas fa-user-shield"></i> تع�`�`�  ْ�&شرف</button>`
            }
                    <button class="btn btn-outline" onclick="ChatManager.removeMember('${roomId}', '${memberId}', this.closest('.modal'))" style="width:100%;color:#f43f5e;border-color:#f43f5e;justify-content:center;"><i class="fas fa-user-times"></i> حذف �&�  ا��&ج�&��عة</button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" style="width:100%;background:rgba(255,255,255,0.05);color:#fff;justify-content:center;">إغ�ا�</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    promoteToAdmin: (roomId, memberId, modalElement) => {
        const rooms = Store.get('chat_rooms') || [];
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            if (!room.admins) room.admins = [room.createdBy];
            if (!room.admins.includes(memberId)) {
                room.admins.push(memberId);
                Store.set('chat_rooms', rooms);
                NotificationManager.add('ت�& ا�تع�`�`�  ْ�&شرف ب� جاح', 'fa-user-shield', 'success');
                Store.log('Promoted Member', `${memberId} in ${room.name}`);
                modalElement.remove();
                ChatManager.toggleProfileSidebar();
            }
        }
    },

    demoteFromAdmin: (roomId, memberId, modalElement) => {
        const rooms = Store.get('chat_rooms') || [];
        const room = rooms.find(r => r.id === roomId);
        if (room && room.admins) {
            if (memberId === room.createdBy) {
                NotificationManager.add('�ا �`�&ْ�  إزا�ة ا��&� شئ �&�  ا�إشراف', 'fa-exclamation-triangle', 'warning');
                return;
            }
            room.admins = room.admins.filter(id => id !== memberId);
            Store.set('chat_rooms', rooms);
            NotificationManager.add('ت�&ت ا�إزا�ة �&�  ا�إشراف ب� جاح', 'fa-user-minus', 'info');
            modalElement.remove();
            ChatManager.toggleProfileSidebar();
        }
    },

    // ������ Reply & Swipe Logic ������������������������������������������������������������������������������������
    prepareReply: (msgId) => {
        const { msg } = ChatManager._getMsgAndKey(msgId);
        if (!msg) return;

        ChatManager._replyTo = msg;
        const container = document.getElementById('chat-reply-preview');
        const nameEl = document.getElementById('reply-preview-name');
        const textEl = document.getElementById('reply-preview-text');

        if (container && nameEl && textEl) {
            nameEl.textContent = msg.senderName;
            textEl.textContent = msg.content || (msg.attachment ? (document.documentElement.dir === 'rtl' ? '�x} �&رف�' : '�x} Attachment') : '');
            container.style.display = 'flex';
            document.getElementById('chat-input')?.focus();
        }
    },

    cancelReply: () => {
        ChatManager._replyTo = null;
        const container = document.getElementById('chat-reply-preview');
        if (container) container.style.display = 'none';
    },

    scrollToMessage: (msgId) => {
        const el = document.querySelector(`.msg-bubble[onclick*="${msgId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.animation = 'highlight 1.5s ease';
            setTimeout(() => { el.style.animation = ''; }, 1500);
        }
    },

    _swipeData: { startX: 0, startY: 0, msgId: null, threshold: 50, isDragging: false },
    _handleSwipeStart: (e, msgId) => {
        const touch = e.type === 'touchstart' ? e.touches[0] : e;
        ChatManager._swipeData.startX = touch.clientX;
        ChatManager._swipeData.startY = touch.clientY;
        ChatManager._swipeData.msgId = msgId;
        ChatManager._swipeData.isDragging = false;

        const el = e.currentTarget.closest('.msg-wrapper');
        if (!el) return;

        const isSent = el.classList.contains('msg-sent');
        const indicator = el.querySelector('.swipe-reply-indicator');

        // Instant response: remove transition during drag
        el.style.transition = 'none';

        const handleMove = (moveEvent) => {
            const moveTouch = moveEvent.type === 'touchmove' ? moveEvent.touches[0] : moveEvent;
            const diffX = moveTouch.clientX - ChatManager._swipeData.startX;
            const diffY = moveTouch.clientY - ChatManager._swipeData.startY;

            if (!ChatManager._swipeData.isDragging) {
                if (Math.abs(diffY) > 8) { cleanup(); return; } // Vertical scroll detected
                if (Math.abs(diffX) > 8) ChatManager._swipeData.isDragging = true;
            }

            if (ChatManager._swipeData.isDragging) {
                if (moveEvent.cancelable) moveEvent.preventDefault();

                const drag = isSent ? Math.min(0, Math.max(-80, diffX)) : Math.max(0, Math.min(80, diffX));
                const absDrag = Math.abs(drag);

                el.style.transform = `translateX(${drag}px)`;
                if (indicator) {
                    indicator.style.opacity = Math.min(1, absDrag / ChatManager._swipeData.threshold);
                    indicator.style.transform = `translateY(-50%) scale(${Math.min(1.2, 0.5 + absDrag / 80)})`;
                    if (absDrag >= ChatManager._swipeData.threshold) {
                        indicator.style.color = 'var(--primary-color)';
                    } else {
                        indicator.style.color = 'inherit';
                    }
                }
            }
        };

        const handleEnd = () => {
            const currentTranslate = parseInt(el.style.transform.replace('translateX(', '').replace('px)', '') || 0);

            el.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
            el.style.transform = '';

            if (indicator) {
                indicator.style.opacity = 0;
                indicator.style.transform = 'translateY(-50%) scale(0.5)';
            }

            if (ChatManager._swipeData.isDragging && Math.abs(currentTranslate) >= ChatManager._swipeData.threshold) {
                ChatManager.prepareReply(msgId);
                if (window.navigator.vibrate) window.navigator.vibrate(20);
            }
            cleanup();
        };

        const cleanup = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);
    },


    removeMember: (roomId, memberId, modalElement) => {
        askConfirm('هل أنت متأكد من حذف هذا العضوو من المجموعة؟', () => {
            const rooms = Store.get('chat_rooms') || [];
            const room = rooms.find(r => r.id === roomId);
            if (room) {
                room.members = (room.members || []).filter(id => id !== memberId);
                if (room.admins) room.admins = room.admins.filter(id => id !== memberId);
                Store.set('chat_rooms', rooms);
                NotificationManager.add('تم حذف العضوو من المجموعة', 'fa-user-times', 'success');
                Store.log('Removed Member', `${memberId} from ${room.name}`);
                modalElement.remove();
                ChatManager.toggleProfileSidebar();
            }
        });
    },

    showAddMembersModal: (roomId) => {
        const room = (Store.get('chat_rooms') || []).find(r => r.id === roomId);
        if (!room) return;

        const team = Store.get('team') || [];
        const me = AuthManager.currentUser;
        const nonMembers = team.filter(u => u.id !== me.id && !room.members?.includes(u.id));

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10050';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:450px;">
                <div class="modal-header">
                    <h2>إضافة أعضواء جدد</h2>
                    <button class="close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div style="max-height:300px;overflow-y:auto;padding-right:5px;">
                        ${nonMembers.length === 0 ? '<p style="text-align:center;opacity:0.6;">ج�&�ع أعضواء ا�فريق�`� �&��ج��د���  با�فع�</p>' : nonMembers.map(u => `
                            <div class="member-check-item" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border-color);border-radius:12px;margin-bottom:8px;cursor:pointer;">
                                <input type="checkbox" class="add-member-cb" data-id="${u.id}" style="width:18px;height:18px;cursor:pointer;">
                                <img src="${u.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.name)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                                <div>
                                    <div style="font-weight:700;font-size:0.9rem;">${u.name}</div>
                                    <div style="font-size:0.75rem;opacity:0.6;">${u.role || 'عضو��'}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary cancel-modal">إ�غاء</button>
                    <button class="btn btn-primary" id="btn-confirm-add" ${nonMembers.length === 0 ? 'disabled' : ''}>إضافة ا�أعضواء ا��المحددين�`� </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-confirm-add').onclick = () => {
            const selectedIds = Array.from(modal.querySelectorAll('.add-member-cb:checked')).map(cb => cb.getAttribute('data-id'));
            if (selectedIds.length === 0) return;

            const rooms = Store.get('chat_rooms') || [];
            const r = rooms.find(i => i.id === roomId);
            if (r) {
                r.members = [...(r.members || []), ...selectedIds];
                Store.set('chat_rooms', rooms);

                // Notify added members
                selectedIds.forEach(mid => {
                    const invId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                    const inv = { id: invId, fromId: me.id, toId: mid, roomId: roomId, roomName: r.name, status: 'pending', timestamp: Date.now() };
                    const invites = Store.get('chat_invitations') || [];
                    invites.push(inv);
                    Store.set('chat_invitations', invites);
                });

                NotificationManager.add(ت�&ت إضافة ${selectedIds.length} أعضواء ب� جاح, 'fa-user-plus', 'success');
                modal.remove();
                ChatManager.toggleProfileSidebar();
            }
        };

        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.querySelector('.cancel-modal').onclick = () => modal.remove();
    },

    showPrivacySettingsModal: (roomId) => {
        const room = (Store.get('chat_rooms') || []).find(r => r.id === roomId);
        if (!room) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(10px); display:flex; justify-content:center; align-items:center; z-index:100000; animation: fadeIn 0.3s ease;';

        modal.innerHTML = `
            <div style="background:var(--bg-secondary); border-radius:24px; width:95%; max-width:450px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); border:1px solid var(--primary-color); position:relative; overflow:hidden; animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); color:var(--text-primary);">
                <div style="padding:1.5rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.25rem; display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-shield-alt" style="color:var(--primary-color);"></i>
                        إعدادات ا�خص��ص�ة
                    </h2>
                    <button class="close-modal" style="background:none; border:none; color:var(--text-secondary); font-size:1.5rem; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
                <div style="padding:2rem;">
                    <div style="display:flex; flex-direction:column; gap:1.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-primary); padding:1rem; border-radius:15px; border:1px solid var(--border-color);">
                            <div>
                                <div style="font-weight:800; margin-bottom:4px; font-size:0.9rem;">�ف� ا�ْتابة (ReadOnly)</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">ا��&د�ر ف�ط �`�&ْ� �! إرسا� رسائل� ف�` �!ذ�! ا�غيرفة.</div>
                            </div>
                            <label class="switch" style="position:relative; display:inline-block; width:50px; height:26px;">
                                <input type="checkbox" id="privacy-lock" ${room.isLocked ? 'checked' : ''} style="opacity:0; width:0; height:0;">
                                <span class="slider round" style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:34px;"></span>
                            </label>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-primary); padding:1rem; border-radius:15px; border:1px solid var(--border-color);">
                            <div>
                                <div style="font-weight:800; margin-bottom:4px; font-size:0.9rem;">ت��`�د تعد�`� ا��&ع����&ات</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">ا��&د�ر ف�ط �`�&ْ� �! تغ�`�ر ا�اس�& ��ا�ص��رة ��ا���صف.</div>
                            </div>
                            <label class="switch" style="position:relative; display:inline-block; width:50px; height:26px;">
                                <input type="checkbox" id="privacy-info" ${room.isInfoRestricted ? 'checked' : ''} style="opacity:0; width:0; height:0;">
                                <span class="slider round" style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:34px;"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div style="padding:1.5rem; background:var(--bg-primary); border-top:1px solid var(--border-color); display:flex; gap:10px;">
                    <button class="cancel-modal" style="flex:1; padding:0.8rem; background:none; border:1px solid var(--border-color); border-radius:12px; cursor:pointer; font-weight:600; color:var(--text-primary);">إ�غاء</button>
                    <button id="btn-save-privacy" style="flex:2; padding:0.8rem; background:var(--primary-gradient); color:#fff; border:none; border-radius:12px; cursor:pointer; font-weight:800; box-shadow:0 4px 12px rgba(37,99,235,0.2);">حفظ ا�تغ�`�رات</button>
                </div>
            </div>
            <style>
                #privacy-lock:checked + .slider, #privacy-info:checked + .slider { background-color: var(--primary-color) !important; }
                .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
                #privacy-lock:checked + .slider:before, #privacy-info:checked + .slider:before { transform: translateX(24px); }
            </style>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-save-privacy').onclick = () => {
            const isLocked = modal.querySelector('#privacy-lock').checked;
            const isInfoRestricted = modal.querySelector('#privacy-info').checked;
            const rooms = Store.get('chat_rooms') || [];
            const r = rooms.find(i => i.id === roomId);
            if (r) {
                r.isLocked = isLocked;
                r.isInfoRestricted = isInfoRestricted;
                Store.set('chat_rooms', rooms);
                NotificationManager.add('ت�& تحد�ث إعدادات ا�خص��ص�ة', 'fa-shield-alt', 'success');
                modal.remove();
            }
        };

        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.querySelector('.cancel-modal').onclick = () => modal.remove();
    },


    bindSendEvent: () => {
        const btn = document.getElementById('btn-send-msg');
        const input = document.getElementById('chat-input');
        if (!btn || !input) return;

        const send = () => {
            if (ChatManager._isSending) return;
            const content = input.value.trim();
            const att = ChatManager._pendingAttachment;
            if (!content && !att) return;
            if (!ChatManager.currentReceiverId) return;

            // Check Privacy/Lock Status for Groups/Channels
            if (ChatManager.currentType !== 'private') {
                const room = (Store.get('chat_rooms') || []).find(r => r.id === ChatManager.currentReceiverId);
                const isAdmin = room && (room.admins || [room.createdBy]).includes(AuthManager.currentUser.id);
                if (room && room.isLocked && !isAdmin) {
                    NotificationManager.add('ا��&ج�&��عة �&غ��ة حا��ا�9�R ا��&د�ر ف�ط �`�&ْ� �! ا�ْتابة', 'fa-lock', 'warning');
                    return;
                }
            }

            ChatManager._isSending = true;
            btn.disabled = true;
            const me = AuthManager.currentUser;
            const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const msg = {
                id: msgId,
                senderId: me.id || '',
                senderName: me.name || 'Unknown',
                senderAvatar: me.avatar || '',
                content: content || '',
                attachment: att || null,
                replyTo: ChatManager._replyTo ? {
                    id: ChatManager._replyTo.id,
                    senderName: ChatManager._replyTo.senderName,
                    content: ChatManager._replyTo.content
                } : null,
                timestamp: new Date().toISOString()
            };

            // Reset reply state
            ChatManager.cancelReply();

            // Clear typing indicator
            if (ChatManager.currentType === 'private' && !ChatManager._isSelfChat && ChatManager.currentReceiverId) {
                const convKey = ChatManager._getPrivateKey(me, ChatManager.currentReceiverId);
                Store.set('typing_' + convKey, null);
            }

            const msgs = ChatManager.getMessages();
            // Dedup: don't add if same id already exists
            if (!msgs.find(m => m.id === msgId)) {
                msgs.push(msg);

                if (ChatManager.currentType === 'private' && ChatManager._isSelfChat) {
                    localStorage.setItem(ChatManager._getSelfKey(me), JSON.stringify(msgs));
                } else {
                    const key = ChatManager.currentType === 'private'
                        ? ChatManager._getPrivateKey(me, ChatManager.currentReceiverId)
                        : ChatManager._getRoomKey(ChatManager.currentReceiverId);

                    // Fast local cache update
                    localStorage.setItem(key, JSON.stringify(msgs));

                    // Safe Cloud Update using arrayUnion
                    if (typeof firebase !== 'undefined' && firebase.apps.length) {
                        try {
                            firebase.firestore().collection('messages').doc(key).set({
                                value: firebase.firestore.FieldValue.arrayUnion(msg),
                                updatedBy: me.id || 'anonymous',
                                userName: me.name || 'Unknown',
                                timestamp: Date.now()
                            }, { merge: true });
                        } catch (err) {
                            console.error('Firebase save error:', err);
                        }
                    }
                }
            }

            input.value = '';
            ChatManager._pendingAttachment = null;

            const prev = document.getElementById('chat-attachment-preview');
            if (prev) prev.style.display = 'none';
            ChatManager.renderMessages();

            // Instantly update the sidebar list
            if (ChatManager.currentType === 'private') ChatManager.loadUsers();
            else ChatManager.loadRooms();

            setTimeout(() => {
                ChatManager._isSending = false;
                btn.disabled = false;
            }, 500);
        };

        // Typing indicator emit
        input.addEventListener('input', () => {
            const me = AuthManager.currentUser;
            if (!me || ChatManager.currentType !== 'private' || ChatManager._isSelfChat || !ChatManager.currentReceiverId) return;
            const convKey = ChatManager._getPrivateKey(me, ChatManager.currentReceiverId);
            Store.set('typing_' + convKey, { userId: me.id, userName: me.name, timestamp: Date.now() });
            clearTimeout(ChatManager._typingTimeout);
            ChatManager._typingTimeout = setTimeout(() => {
                Store.set('typing_' + convKey, null);
            }, 3000);
        });

        btn.onclick = send;
        input.onkeydown = (e) => {
            const isMobile = window.innerWidth < 768;

            if (e.key === 'Enter') {
                if (isMobile) {
                    // On mobile, Enter always adds a new line for better formatting
                    // The user must click the send button to send
                    return;
                } else {
                    // On desktop, Enter sends, Shift+Enter adds new line
                    if (!e.shiftKey) {
                        e.preventDefault();
                        send();
                        // Reset height after sending
                        setTimeout(() => {
                            input.style.height = '45px';
                        }, 10);
                    }
                }
            }

            // Auto-resize textarea logic
            setTimeout(() => {
                input.style.height = 'auto';
                const newHeight = Math.min(input.scrollHeight, 150);
                input.style.height = (newHeight > 45 ? newHeight : 45) + 'px';
            }, 0);
        };
    },

    handleFileSelect: (input) => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            ChatManager._pendingAttachment = { dataUrl: e.target.result, name: file.name, mimeType: file.type };
            const prev = document.getElementById('chat-attachment-preview');
            const thumb = document.getElementById('chat-attachment-thumb');
            prev.style.display = 'flex';
            thumb.innerHTML = `�x} ${file.name}`;
        };
        reader.readAsDataURL(file);
    },

    clearAttachment: () => {
        ChatManager._pendingAttachment = null;
        document.getElementById('chat-attachment-preview').style.display = 'none';
    },

    filterSidebar: (query) => {
        const items = document.querySelectorAll('.chat-user-item');
        const q = query.toLowerCase().trim();
        items.forEach(item => {
            const name = item.innerText.toLowerCase();
            item.style.display = name.includes(q) ? 'flex' : 'none';
        });
    },

    deleteConversation: () => {
        if (!ChatManager.currentReceiverId) return;
        const me = AuthManager.currentUser;
        if (!me) return;

        const isPrivate = ChatManager.currentType === 'private';
        const isGroup = ChatManager.currentType === 'group' || ChatManager.currentType === 'broadcast';

        // Find room if group
        let room = null;
        if (isGroup) {
            room = (Store.get('chat_rooms') || []).find(r => r.id === ChatManager.currentReceiverId);
        }

        const isAdmin = isGroup && room && (room.admins || [room.createdBy]).includes(me.id);

        // Show Modal for choices
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10100';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:380px; text-align:center; padding:2rem;">
                <div style="width:60px; height:60px; border-radius:50%; background:rgba(239,68,68,0.1); color:var(--danger); display:flex; align-items:center; justify-content:center; margin:0 auto 1.5rem; font-size:1.5rem;">
                    <i class="fas fa-trash-alt"></i>
                </div>
                <h3 style="margin-bottom:0.5rem;">${LangManager.t('حذف ا��&حادثة')}</h3>
                <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:2rem;">
                    ${isPrivate ? '�!� تر�د �&سح �!ذ�! ا��&حادثة �&�  ج�!ازْ�x' : 'اختر � ��ع ا�حذف ا��&فض� ��!ذ�! ا��&ج�&��عة'}
                </p>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <button class="btn btn-primary" id="btn-del-me" style="width:100%; justify-content:center; background:rgba(37,99,235,0.1); color:var(--primary-color); border:1px solid var(--primary-color);">
                        <i class="fas fa-user"></i> ${LangManager.t('Delete for me')}
                    </button>
                    ${(isPrivate || isAdmin) ? `
                    <button class="btn btn-primary" id="btn-del-all" style="width:100%; justify-content:center; background:var(--danger); border-color:var(--danger); color:#fff;">
                        <i class="fas fa-users"></i> ${LangManager.t('Delete for everyone')}
                    </button>
                    ` : ''}
                    <button class="btn btn-secondary cancel-modal" style="width:100%; justify-content:center;">${LangManager.t('Cancel')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-del-me').onclick = () => {
            const convKey = isPrivate
                ? (ChatManager._isSelfChat ? ChatManager._getSelfKey(me) : ChatManager._getPrivateKey(me, ChatManager.currentReceiverId))
                : ChatManager._getRoomKey(ChatManager.currentReceiverId);

            // For "Delete for me" (Conversation), we add all current IDs to the deleted list
            const currentMsgs = ChatManager.getMessages();
            const deletedKey = 'chat_deleted_' + convKey;
            const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
            currentMsgs.forEach(m => {
                if (!deletedIds.includes(m.id)) deletedIds.push(m.id);
            });
            localStorage.setItem(deletedKey, JSON.stringify(deletedIds));

            ChatManager.renderMessages();
            NotificationManager.add('ت�& �&سح ا��&حادثة �&�  ج�!ازْ ب� جاح', 'fa-check-circle', 'info');
            modal.remove();
        };

        if (modal.querySelector('#btn-del-all')) {
            modal.querySelector('#btn-del-all').onclick = () => {
                askConfirm('�!� أ� ت �&تأْد �&�  حذف �!ذ�! ا��&حادثة �د�0 ج�&�ع ا�أطراف�x �ا �`�&ْ�  ا�تراجع ع�  �!ذا ا�إجراء.', () => {
                    const convKey = isPrivate
                        ? (ChatManager._isSelfChat ? ChatManager._getSelfKey(me) : ChatManager._getPrivateKey(me, ChatManager.currentReceiverId))
                        : ChatManager._getRoomKey(ChatManager.currentReceiverId);

                    if (isPrivate) {
                        Store.set(convKey, []);
                    } else {
                        Store.set(convKey, []);
                    }

                    ChatManager.renderMessages();
                    NotificationManager.add('ت�& حذف ا��&حادثة �د�0 ا�ج�&�ع ب� جاح', 'fa-trash', 'success');
                    modal.remove();
                });
            };
        }

        modal.querySelector('.cancel-modal').onclick = () => modal.remove();
    },


    // ������ Message Context Menu & Actions ��������������������������������������������������
    showMsgMenu: (e, msgId, isMe) => {
        const { msg } = ChatManager._getMsgAndKey(msgId);
        if (!msg) return;

        document.querySelectorAll('.chat-msg-menu').forEach(m => m.remove());

        let top = e.clientY;
        let left = e.clientX;
        const menuHeight = 220;
        const menuWidth = 180; // slightly larger than min-width to be safe

        if (top + menuHeight > window.innerHeight) {
            top = window.innerHeight - menuHeight - 10;
        }
        if (left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 10;
        }
        if (left < 10) left = 10;

        const menu = document.createElement('div');
        menu.className = 'chat-msg-menu glass-effect';
        menu.style.cssText = `
            position: fixed; top: ${top}px; left: ${left}px;
            background: var(--bg-secondary); border: 1px solid var(--border-color);
            border-radius: 12px; padding: 0.6rem; z-index: 10005;
            box-shadow: 0 15px 35px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 4px; min-width: 170px;
            animation: msgFadeIn 0.2s ease-out;
        `;

        const createBtn = (icon, text, color, onclick) => {
            const btn = document.createElement('button');
            btn.innerHTML = `<i class="fas ${icon}" style="width:20px;"></i> ${LangManager.t(text)}`;
            btn.style.cssText = `
                background: transparent; border: none; color: ${color}; text-align: right;
                padding: 0.5rem 0.75rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem;
                display: flex; align-items: center; gap: 8px; transition: background 0.2s;
            `;
            btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.05)';
            btn.onmouseout = () => btn.style.background = 'transparent';
            btn.onclick = () => { onclick(); menu.remove(); };
            return btn;
        };

        if (msg.isDeletedForEveryone) {
            menu.appendChild(createBtn('fa-trash', 'حذف �د�`', 'var(--danger)', () => ChatManager.deleteMessageForMe(msgId)));
        } else {
            menu.appendChild(createBtn('fa-reply', 'رد ع��0 ا�رسا�ة', 'var(--primary-color)', () => ChatManager.prepareReply(msgId)));
            menu.appendChild(createBtn('fa-copy', '� سخ ا�� ص', 'var(--text-primary)', () => ChatManager.copyMessage(msgId)));
            menu.appendChild(createBtn('fa-share', 'ت��ج�`�! ا�رسا�ة', 'var(--primary-color)', () => ChatManager.forwardMessage(msgId)));

            if (isMe) {
                menu.appendChild(createBtn('fa-pen', 'تعد�`� ا�رسا�ة', 'var(--warning)', () => ChatManager.editMessage(msgId)));
                menu.appendChild(createBtn('fa-trash-alt', 'حذف �د�0 ا�ج�&�ع', 'var(--danger)', () => ChatManager.deleteMessageForEveryone(msgId)));
            }

            menu.appendChild(createBtn('fa-trash', 'حذف �د�`', 'var(--danger)', () => ChatManager.deleteMessageForMe(msgId)));
        }

        document.body.appendChild(menu);

        setTimeout(() => {
            document.addEventListener('click', function closeMenu(ev) {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 10);
    },

    _getMsgAndKey: (msgId) => {
        const me = AuthManager.currentUser;
        const key = ChatManager.currentType === 'private'
            ? (ChatManager._isSelfChat ? ChatManager._getSelfKey(me) : ChatManager._getPrivateKey(me, ChatManager.currentReceiverId))
            : ChatManager._getRoomKey(ChatManager.currentReceiverId);

        const msgs = Store.get(key) || JSON.parse(localStorage.getItem(key) || '[]');
        const msg = msgs.find(m => m.id === msgId);
        return { msg, msgs, key };
    },

    copyMessage: (msgId) => {
        const { msg } = ChatManager._getMsgAndKey(msgId);
        if (msg && msg.content) {
            navigator.clipboard.writeText(msg.content);
            NotificationManager.add(LangManager.t('ت�& � سخ ا�رسا�ة ب� جاح'), 'fa-copy', 'system');
        }
    },

    deleteMessageForMe: (msgId) => {
        askConfirm(LangManager.t('Are you sure you want to delete this message?'), () => {
            const me = AuthManager.currentUser;
            const convKey = ChatManager.currentType === 'private'
                ? (ChatManager._isSelfChat ? ChatManager._getSelfKey(me) : ChatManager._getPrivateKey(me, ChatManager.currentReceiverId))
                : ChatManager._getRoomKey(ChatManager.currentReceiverId);

            const deletedKey = 'chat_deleted_' + convKey;
            const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
            if (!deletedIds.includes(msgId)) {
                deletedIds.push(msgId);
                localStorage.setItem(deletedKey, JSON.stringify(deletedIds));
            }
            ChatManager.render(); // Full re-render to update sidebar preview
        });
    },

    deleteMessageForEveryone: (msgId) => {
        askConfirm(LangManager.t('Are you sure you want to delete this message?'), () => {
            const { msgs, key } = ChatManager._getMsgAndKey(msgId);
            const msg = msgs.find(m => m.id === msgId);
            if (msg) {
                msg.isDeletedForEveryone = true;
                msg.content = '';
                msg.attachment = null;
                ChatManager._updateFirebaseMessages(key, msgs);
                ChatManager.render(); // Full re-render to update sidebar preview
            }
        });
    },

    deleteMessageForBoth: (msgId) => {
        askConfirm(LangManager.t('Are you sure you want to delete this message for everyone and yourself?'), () => {
            const { msgs, key } = ChatManager._getMsgAndKey(msgId);
            const msg = msgs.find(m => m.id === msgId);
            if (msg) {
                // Delete for everyone (global)
                msg.isDeletedForEveryone = true;
                msg.content = '';
                msg.attachment = null;
                ChatManager._updateFirebaseMessages(key, msgs);

                // Delete for me (local hide)
                const me = AuthManager.currentUser;
                const convKey = ChatManager.currentType === 'private'
                    ? (ChatManager._isSelfChat ? ChatManager._getSelfKey(me) : ChatManager._getPrivateKey(me, ChatManager.currentReceiverId))
                    : ChatManager._getRoomKey(ChatManager.currentReceiverId);

                const deletedKey = 'chat_deleted_' + convKey;
                const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
                if (!deletedIds.includes(msgId)) {
                    deletedIds.push(msgId);
                    localStorage.setItem(deletedKey, JSON.stringify(deletedIds));
                }

                ChatManager.render(); // Full re-render
                NotificationManager.add('ت�& ا�حذف �د�0 ا�ج�&�ع ����دْ', 'fa-check-circle', 'success');
            }
        });
    },

    editMessage: (msgId) => {
        const { msg, msgs, key } = ChatManager._getMsgAndKey(msgId);
        if (!msg || !msg.content) return;
        askPrompt('تعد�`� ا�رسا�ة:', msg.content.replace(' (�&عد�ة)', ''), (newText) => {
            if (newText !== null && newText.trim() !== '') {
                msg.content = newText.trim() + ' (�&عد�ة)';
                ChatManager._updateFirebaseMessages(key, msgs);
                ChatManager.renderMessages();
            }
        });
    },

    _updateFirebaseMessages: (key, newMsgs) => {
        localStorage.setItem(key, JSON.stringify(newMsgs));
        if (!key.startsWith('savedMessages_') && typeof firebase !== 'undefined' && firebase.apps.length) {
            const me = AuthManager.currentUser;
            firebase.firestore().collection('messages').doc(key).set({
                value: newMsgs,
                updatedBy: me.id,
                userName: me.name,
                timestamp: Date.now()
            });
        }
    },

    forwardMessage: (msgId) => {
        const { msg } = ChatManager._getMsgAndKey(msgId);
        if (!msg) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10005';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:400px;">
                <div class="modal-header">
                    <h2><i class="fa fa-share"></i> ت��ج�`�! ا�رسا�ة إ��0...</h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="max-height:400px; overflow-y:auto;">
                    <div id="forward-list" style="display:flex;flex-direction:column;gap:8px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const list = modal.querySelector('#forward-list');
        const team = Store.get('team') || [];
        const me = AuthManager.currentUser;

        team.filter(m => m.id !== me.id).forEach(member => {
            const btn = document.createElement('div');
            btn.style.cssText = 'padding:12px; background:rgba(255,255,255,0.05); border-radius:12px; display:flex; align-items:center; gap:12px; cursor:pointer; border:1px solid var(--border-color); transition:background 0.2s;';
            btn.onmouseover = () => btn.style.background = 'rgba(37,99,235,0.1)';
            btn.onmouseout = () => btn.style.background = 'rgba(255,255,255,0.05)';
            btn.innerHTML = `<img src="${member.avatar || 'https://ui-avatars.com/api/?name=' + member.name}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;"> <span style="font-weight:600;font-size:0.9rem;">${member.name}</span>`;
            btn.onclick = () => {
                ChatManager._doForward(msg, ChatManager._getPrivateKey(me, member.id), member.name);
                modal.remove();
            };
            list.appendChild(btn);
        });
    },

    _doForward: (originalMsg, targetKey, targetName) => {
        const me = AuthManager.currentUser;
        const newMsg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            senderId: me.id,
            senderName: me.name,
            senderAvatar: me.avatar,
            content: (originalMsg.content || '') + '<br><br><span style="font-size:0.7rem;opacity:0.6;background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px;"><i class="fas fa-share"></i> رسا�ة �&��ج�!ة</span>',
            attachment: originalMsg.attachment,
            timestamp: new Date().toISOString()
        };

        const msgs = JSON.parse(localStorage.getItem(targetKey) || '[]');
        msgs.push(newMsg);
        localStorage.setItem(targetKey, JSON.stringify(msgs));

        if (typeof firebase !== 'undefined' && firebase.apps.length) {
            firebase.firestore().collection('messages').doc(targetKey).set({
                value: firebase.firestore.FieldValue.arrayUnion(newMsg),
                updatedBy: me.id,
                userName: me.name,
                timestamp: Date.now()
            }, { merge: true });
        }
        NotificationManager.add('ت�& ت��ج�`�! ا�رسا�ة ب� جاح إ��0 ' + targetName, 'fa-check-circle', 'system');
    },

    // ������ Unread Counter (Timestamp-based) ��������������������������������������������������
    _clearUnread: (convKey) => {
        const data = JSON.parse(localStorage.getItem('chat_last_read') || '{}');
        data[convKey] = Date.now();
        localStorage.setItem('chat_last_read', JSON.stringify(data));
        ChatManager._updateNavBadge();

        // Sync Read Receipt to Firebase so other users know we read it
        const me = AuthManager.currentUser;
        if (me && typeof firebase !== 'undefined' && firebase.apps.length) {
            const readKey = 'read_' + convKey + '_' + me.id;
            Store.set(readKey, Date.now());
        }
    },

    _getTotalUnread: () => {
        const me = AuthManager.currentUser;
        if (!me) return 0;
        let total = 0;
        const lastRead = JSON.parse(localStorage.getItem('chat_last_read') || '{}');

        (Store.get('team') || []).filter(m => m.id !== me.id).forEach(m => {
            const k = ChatManager._getPrivateKey(me, m.id);
            const lr = lastRead[k] || 0;
            total += (Store.get(k) || []).filter(msg => msg.senderId !== me.id && new Date(msg.timestamp).getTime() > lr).length;
        });

        (Store.get('chat_rooms') || []).filter(r => r.members?.includes(me.id)).forEach(r => {
            const k = ChatManager._getRoomKey(r.id);
            const lr = lastRead[k] || 0;
            total += (Store.get(k) || []).filter(msg => msg.senderId !== me.id && new Date(msg.timestamp).getTime() > lr).length;
        });

        return total;
    },

    _getConvUnread: (convKey) => {
        const me = AuthManager.currentUser;
        if (!me) return 0;
        const lr = JSON.parse(localStorage.getItem('chat_last_read') || '{}')[convKey] || 0;
        return (Store.get(convKey) || []).filter(msg => msg.senderId !== me.id && new Date(msg.timestamp).getTime() > lr).length;
    },

    // ������ Nav Badge ��������������������������������������������������������������������������������������������������������
    _updateNavBadge: () => {
        const me = AuthManager.currentUser;
        if (!me) return;

        let total = 0;
        let privateUnread = 0;
        let groupUnread = 0;
        let broadcastUnread = 0;

        const lastRead = JSON.parse(localStorage.getItem('chat_last_read') || '{}');

        // Private
        (Store.get('team') || []).filter(m => m.id !== me.id).forEach(m => {
            const k = ChatManager._getPrivateKey(me, m.id);
            const lr = lastRead[k] || 0;
            const unread = (Store.get(k) || []).filter(msg => msg.senderId !== me.id && new Date(msg.timestamp).getTime() > lr).length;
            privateUnread += unread;
            total += unread;
        });

        // Groups and Broadcasts
        (Store.get('chat_rooms') || []).filter(r => r.members?.includes(me.id)).forEach(r => {
            const k = ChatManager._getRoomKey(r.id);
            const lr = lastRead[k] || 0;
            const unread = (Store.get(k) || []).filter(msg => msg.senderId !== me.id && new Date(msg.timestamp).getTime() > lr).length;
            if (r.type === 'group') groupUnread += unread;
            if (r.type === 'broadcast') broadcastUnread += unread;
            total += unread;
        });

        // Main App Sidebar Badge
        const navItem = document.querySelector('.nav-item[data-target="chat-section"]');
        if (navItem) {
            let badge = navItem.querySelector('.chat-nav-badge');
            if (total > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'chat-nav-badge';
                    badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#ef4444;color:#fff;font-size:0.65rem;font-weight:700;border-radius:50%;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 3px;';
                    navItem.style.position = 'relative';
                    navItem.appendChild(badge);
                }
                badge.textContent = total > 99 ? '99+' : total;
            } else if (badge) {
                badge.remove();
            }
        }

        // Chat Tabs Badges (Private, Groups, Broadcast)
        const updateTabBadge = (type, count) => {
            const tab = document.querySelector(`.chat-tab[data-type="${type}"]`);
            if (!tab) return;
            let badge = tab.querySelector('.chat-tab-badge');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'chat-tab-badge';
                    badge.style.cssText = 'background:#ef4444;color:#fff;font-size:0.65rem;font-weight:700;border-radius:50%;min-width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;padding:0 3px;margin-inline-start:5px;';
                    tab.appendChild(badge);
                }
                badge.textContent = count > 99 ? '99+' : count;
            } else if (badge) {
                badge.remove();
            }
        };

        updateTabBadge('private', privateUnread);
        updateTabBadge('group', groupUnread);
        updateTabBadge('broadcast', broadcastUnread);
    },

    // ������ Sound Notification ��������������������������������������������������������������������������������������������
    _playSound: () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) { /* audio blocked until first user gesture */ }
    },

    handleRoomImg: (input) => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const preview = document.getElementById('new-room-img-preview');
            const dataInput = document.getElementById('new-room-image-data');
            if (preview) {
                preview.src = dataUrl;
                preview.style.display = 'block';
            }
            if (dataInput) dataInput.value = dataUrl;
        };
        reader.readAsDataURL(file);
    },

    showCreateRoomModal: (type) => {
        const isGroup = type === 'group';
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10010';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:500px; padding:0; border-radius:20px; overflow:hidden;">
                <div style="padding:1.5rem; background:linear-gradient(135deg, var(--primary-color), var(--accent-color)); color:#fff; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.2rem;"><i class="fas ${isGroup ? 'fa-users' : 'fa-bullhorn'}"></i> ${isGroup ? 'إ� شاء �&ج�&��عة جد�دة' : 'إ� شاء �� اة جد�دة'}</h2>
                    <button class="close-modal" style="background:none; border:none; color:#fff; font-size:1.2rem; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding:1.5rem; display:flex; flex-direction:column; gap:1.2rem;">
                    <div style="text-align:center;">
                        <div style="position:relative;display:inline-block;">
                            <img id="new-room-img-preview" src="https://ui-avatars.com/api/?name=Room&background=3b82f6&color=fff&bold=true" style="width:90px;height:90px;border-radius:20px;object-fit:cover;border:3px solid var(--primary-color);">
                            <label for="new-room-img-input" style="position:absolute;bottom:-5px;right:-5px;background:var(--primary-color);color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
                                <i class="fas fa-camera" style="font-size:0.7rem;"></i>
                            </label>
                            <input type="file" id="new-room-img-input" accept="image/*" style="display:none;" onchange="ChatManager.handleRoomImg(this)">
                        </div>
                        <input type="hidden" id="new-room-image-data" value="">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:6px; opacity:0.8;">اس�& ${isGroup ? 'ا��&ج�&��عة' : 'ا��� اة'}</label>
                        <input type="text" id="new-room-name" placeholder="�&ث�ا�9: فريق�`� ا�تط���ر" style="width:100%; padding:0.8rem; border-radius:12px; background:var(--bg-primary); border:1.5px solid var(--border-color); color:var(--text-primary); outline:none; transition:border 0.3s;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:6px; opacity:0.8;">ا���صف</label>
                        <textarea id="new-room-desc" placeholder="ت��ض�ح �&��جز ���!دف..." style="width:100%; padding:0.8rem; border-radius:12px; background:var(--bg-primary); border:1.5px solid var(--border-color); color:var(--text-primary); height:80px; outline:none; resize:none;"></textarea>
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:8px; opacity:0.8;">دع��ة ا�أعضواء (ا�خص��ص�ة)</label>
                        <div id="room-member-selector" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; max-height:180px; overflow-y:auto; padding-right:5px; scrollbar-width:thin;">
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px; background:rgba(37,99,235,0.05); padding:15px; border-radius:15px; border:1px solid rgba(37,99,235,0.1);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
                            <input type="checkbox" id="new-room-locked" style="width:18px; height:18px; cursor:pointer;">
                            <label for="new-room-locked" style="font-size:0.85rem; font-weight:700; cursor:pointer;">�ف� ا�شات (ا��&د�ر ف�ط �`�&ْ� �! ا�ْتابة)</label>
                        </div>
                        <div style="border-top:1px solid rgba(37,99,235,0.1); padding-top:10px;">
                            <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--primary-color);">�x ربط ذْ�` ب�س�& (Smart Link)</label>
                            <select id="new-room-linked-section" style="width:100%; padding:0.6rem; border-radius:10px; background:var(--bg-primary); border:1px solid var(--border-color); color:var(--text-primary); font-size:0.8rem; outline:none; cursor:pointer;">
                                <option value="">بد���  ربط</option>
                                <option value="finance">�س�& ا��&ا��ة (Financial Dashboard)</option>
                                <option value="tasks">���حة ا��&�!ا�& (Task Board)</option>
                                <option value="support">�&رْز ا�دع�& (Support Center)</option>
                            </select>
                        </div>
                    </div>
                    <button id="btn-confirm-room" style="width:100%; padding:1rem; border:none; border-radius:15px; background:var(--primary-gradient); color:#fff; font-weight:800; font-size:1rem; cursor:pointer; box-shadow:0 10px 20px rgba(37,99,235,0.3); transition:all 0.3s;">تأْ�د ��إ� شاء</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const selector = modal.querySelector('#room-member-selector');
        const team = Store.get('team') || [];
        const me = AuthManager.currentUser;
        const selectedIds = new Set([me.id]);

        team.filter(m => m.id !== me.id).forEach(member => {
            const item = document.createElement('div');
            item.className = 'member-check-item';
            item.style.cssText = 'padding:10px; border-radius:12px; border:1.5px solid var(--border-color); display:flex; align-items:center; gap:10px; cursor:pointer; transition:all 0.2s;';
            item.innerHTML = `<img src="${member.avatar || 'https://ui-avatars.com/api/?name=' + member.name}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;"><span style="font-size:0.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${member.name}</span>`;
            item.onclick = () => {
                if (selectedIds.has(member.id)) {
                    selectedIds.delete(member.id);
                    item.style.borderColor = 'var(--border-color)';
                    item.style.background = 'transparent';
                } else {
                    selectedIds.add(member.id);
                    item.style.borderColor = 'var(--primary-color)';
                    item.style.background = 'rgba(37,99,235,0.08)';
                }
            };
            selector.appendChild(item);
        });

        modal.querySelector('#btn-confirm-room').onclick = () => {
            const name = modal.querySelector('#new-room-name').value.trim();
            const desc = modal.querySelector('#new-room-desc').value.trim();
            const image = modal.querySelector('#new-room-image-data').value;
            const isLocked = modal.querySelector('#new-room-locked').checked;
            const linkedSection = modal.querySelector('#new-room-linked-section').value;

            if (!name) { NotificationManager.add('�رج�0 ْتابة اس�&!', 'fa-exclamation-triangle', 'warning'); return; }

            const roomId = 'room_' + Date.now();
            const newRoom = {
                id: roomId,
                name: name,
                desc: desc,
                image: image,
                type: type,
                createdBy: me.id,
                admins: [me.id],
                members: Array.from(selectedIds),
                isLocked: isLocked,
                linkedSection: linkedSection,
                timestamp: Date.now()
            };

            const rooms = Store.get('chat_rooms') || [];
            rooms.push(newRoom);
            Store.set('chat_rooms', rooms);

            // Notify members
            Array.from(selectedIds).forEach(mid => {
                if (mid === me.id) return;
                const invId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                const inv = { id: invId, fromId: me.id, toId: mid, roomId: roomId, roomName: name, status: 'pending', timestamp: Date.now() };
                const invites = Store.get('chat_invitations') || [];
                invites.push(inv);
                Store.set('chat_invitations', invites);
            });

            NotificationManager.add('ت�& إ� شاء ' + (isGroup ? 'ا��&ج�&��عة' : 'ا��� اة') + ' ب� جاح', 'fa-check-circle', 'success');
            modal.remove();
            ChatManager.loadRooms();
        };

        modal.querySelector('.close-modal').onclick = () => modal.remove();
    },

    bindEmojiEvents: () => {
        const btn = document.getElementById('btn-chat-emoji');
        if (!btn) return;

        btn.onclick = (e) => {
            e.stopPropagation();
            ChatManager.toggleEmojiPicker();
        };

        document.addEventListener('click', (e) => {
            const picker = document.getElementById('emoji-picker');
            if (picker && picker.style.display !== 'none' && !picker.contains(e.target) && e.target !== btn) {
                picker.style.display = 'none';
            }
        });

        ChatManager.filterEmojis('smile');
    },

    toggleEmojiPicker: () => {
        const picker = document.getElementById('emoji-picker');
        if (!picker) return;
        const isHidden = picker.style.display === 'none';
        picker.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) ChatManager.filterEmojis('smile');
    },

    filterEmojis: (category) => {
        const list = document.getElementById('emoji-list');
        const picker = document.getElementById('emoji-picker');
        if (!list || !picker) return;

        picker.querySelectorAll('.cat-icon').forEach(icon => {
            icon.classList.remove('active');
            if (icon.getAttribute('onclick')?.includes(category)) icon.classList.add('active');
        });

        list.innerHTML = '';
        const emojis = ChatManager._emojis[category] || [];
        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'emoji-item';
            span.innerHTML = emoji;
            span.onclick = (e) => {
                e.stopPropagation();
                ChatManager.addEmoji(emoji);
            };
            list.appendChild(span);
        });

        if (window.twemoji) {
            twemoji.parse(list, {
                base: 'https://cdn.jsdelivr.net/gh/iamcal/emoji-data@master/img-apple-64/',
                folder: '',
                callback: (iconId) => iconId + '.png'
            });
        }
    },

    addEmoji: (emoji) => {
        const input = document.getElementById('chat-input');
        if (!input) return;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
        input.selectionStart = input.selectionEnd = start + emoji.length;
        input.focus();
        input.dispatchEvent(new Event('input'));
    },

    _emojis: {
        smile: ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😮‍💨','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫣','🫡','🫢','🫥','🫤','🥹','🫠','🫨'],
        gestures: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🫶','🫦','👄','👅','🦷','🦴','👀','👁','🧠','🫀','🫁'],
        animal: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','豬','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦢','🦉','🦚','🦜','🐦‍🔥','🕊','🦅','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','鯊','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','豬','🐏','羊','山羊','鹿','狗','🐩','🦮','🐕‍🦺','貓','🐈‍⬛','🐓','🦃','🐇','🐁','🐀','🐿','🦔','🦦','🦥','🦨','🦡'],
        food: ['🍏','🍎','🍐','🍊','🍋','🍋‍🟩','🍌','🍉','🍇','🍓','🫐','🍈','🍒','桃','芒果','🍍','🥥','奇異果','番茄','茄子','酪梨','花椰菜','葉菜','黃瓜','玉米','胡蘿蔔','🫑','🥔','🍠','🥐','麵包','法棍','椒鹽捲餅','貝果','起司','蛋','煎蛋','鬆餅','培根','肉','雞腿','肉','熱狗','漢堡','薯條','披薩','三明治','捲餅','墨西哥夾餅','墨西哥捲餅','🫔','沙拉','燉鍋','義大利麵','拉麵','燉鍋','咖哩','壽司','便當','餃子','炸蝦','飯糰','米飯','仙貝','魚板','幸運餅乾','月餅','關東煮','糰子','刨冰','冰淇 لوبی','霜淇淋','派','蛋糕','蛋糕','布丁','棒棒糖','糖果','巧克力','爆米花','甜甜圈','餅乾','栗子','花生','蜂蜜','牛奶','咖啡','茶','汽水','🧋','🧃','🧉','🍶','啤酒','啤酒','乾杯','葡萄酒','威士忌','雞尾酒','飲料','香檳','🍄','🍄‍🟫'],
        travel: ['🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🚲','奧','🛵','🏍','🚨','🚔','🚍','🚘','🚖','🚡','纜車','纜車','火車','電車','火車','單軌火車','高速火車','高速火車','輕軌','火車頭','火車','地鐵','電車','車站','飛機','起飛','降落','飛機','座位','衛星','火箭','飛碟','直升機','獨木舟','帆船','快艇','遊艇','郵輪','渡輪','船','錨','施工','加油站','巴士站','地圖','摩艾','自由女神','東京鐵塔','城堡','城堡','體育場','摩天輪','雲霄飛車','旋轉木馬','噴泉','遮陽傘','海灘','島嶼','沙漠','火山','山','雪山','❄️','🌨','🌦','🌤','☀️','🌤','⛅️','🌥','雲','🌦','雨','⛈','雷','雷','🌀','彩虹','日出','🌆','🌇','🌉','🌃','🌌','🏙','🏘'],
        object: ['⌚️','📱','📲','電腦','鍵盤','滑鼠','🖲','搖桿','夾鉗','光碟','磁碟','光碟','錄影帶','相機','相機','攝影機','電影','投影機','底片','電話','電話','呼叫器','傳真','電視','無線電','麥克風','混音器','控制台','指南針','秒表','定時器','鬧鐘','鐘','沙漏','時間','天線','電池','插頭','燈泡','手電筒','蠟燭','燈籠','滅火器','桶','錢','錢','錢','錢','錢','錢','錢','鑽石','秤','工具箱','扳手','錘子','錘子','工具','鎬','螺栓','齒輪','磚','🔗‍💥','鏈','磁鐵','槍','炸彈','爆竹','斧頭','刀','短劍','劍','盾','煙','棺材','骨灰盒','瓶','水晶球','念珠','護身符','理髮店','蒸餾器','望遠鏡','顯微鏡','洞','繃帶','聽診器','藥丸','注射器','血','DNA','微生物','培養皿','試管','溫度計','掃帚','籃子','衛生紙','馬桶','水龍頭','淋浴','浴缸','洗澡','肥皂','剃鬚刀','海綿','乳液','鈴','鑰匙','舊鑰匙','門','椅子','沙發','床','睡覺','泰دي熊','相框','購物袋','購物車','禮物','氣球','鯉魚旗','絲帶','紙屑','聚會','玩偶','燈籠','風鈴','紅包','信','信','信','信','信','信','信','箱子','標籤','信箱','信箱','信箱','信箱','郵筒','號角','捲軸','文件','文件','文件','收據','圖表','圖表','圖表','記事本','日曆','日曆','垃圾桶','索引','檔案盒','選票','檔案櫃','剪貼板','檔案夾','檔案夾','檔案夾','報紙','報紙','記事本','記事本','記事本','書','書','書','書','書','書','書','書','書','大頭針','迴紋針','迴紋針','迴紋針','三角尺','直尺','算盤','圖釘','圖釘','剪刀','筆','筆','筆','筆','蠟筆','筆記','放大鏡','放大鏡','鎖','鎖','鎖','🔒']
    }
};

const _chatStyles = document.createElement('style');
_chatStyles.textContent = `
    .chat-user-item { display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.25rem;cursor:pointer;transition:background 0.15s;border-bottom:1px solid var(--border-color);border-inline-end:3px solid transparent; }
    .chat-user-item:hover { background:rgba(37,99,235,0.04); }
    .chat-user-item.selected { background:rgba(37,99,235,0.09) !important; border-inline-end-color:var(--primary-color); }
    .member-check-item:hover { background:rgba(37,99,235,0.05) !important; border-color:var(--primary-color) !important; }
    @keyframes msgFadeIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
    
    /* Global Chat Layout Fix */
    .chat-main {
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        overflow: hidden;
        flex: 1;
        height: 100%;
        position: relative;
    }

    .chat-main-header {
        padding: 0.9rem 1.5rem;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 10;
        flex-shrink: 0;
        transition: opacity 0.3s ease;
        gap: 1rem;
    }

    .chat-header-avatar {
        width: 45px !important;
        height: 45px !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        border: 2px solid var(--border-color) !important;
        flex-shrink: 0 !important;
    }

    .chat-messages-area {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden !important;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        background-color: var(--bg-primary) !important;
        background-image: none !important;
        scrollbar-width: thin;
        scrollbar-color: var(--border-color) transparent;
    }

    /* Global Chat Layout Fix */
    #chat-messages {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 20px;
        width: 100%;
        box-sizing: border-box;
    }

    /* Input Bar Modern */
    .chat-input-wrapper {
        padding: 1rem 1.25rem;
        background: var(--bg-secondary);
        border-top: 1px solid var(--border-color);
        flex-shrink: 0;
        transition: opacity 0.3s ease;
    }

    @media (max-width: 768px) {
        .chat-input-wrapper {
            padding: 0.75rem 1rem;
        }
    }

    .chat-input-container {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: var(--bg-primary);
        padding: 0.5rem 0.75rem;
        border-radius: 30px;
        border: 1.5px solid var(--border-color);
        transition: all 0.3s;
    }

    .chat-input-container:focus-within {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 4px rgba(37,99,235,0.05);
    }

    .chat-input-container input {
        flex: 1;
        border: none;
        background: none;
        color: var(--text-primary);
        font-size: 0.95rem;
        padding: 0.5rem;
        outline: none;
    }

    .chat-action-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        background: transparent;
        color: var(--text-secondary);
        flex-shrink: 0;
    }

    #btn-send-msg {
        background: linear-gradient(135deg, var(--primary-color), var(--accent-color)) !important;
        color: white !important;
        width: 42px !important;
        height: 42px !important;
        box-shadow: 0 4px 12px rgba(37,99,235,0.3);
    }

    .chat-encryption-badge {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.85rem;
        background: rgba(16,185,129,0.1);
        border: 1px solid rgba(16,185,129,0.2);
        border-radius: 30px;
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--success);
    }

    .msg-wrapper {
        display: flex;
        max-width: 100%;
        gap: 12px;
        align-items: flex-end;
        position: relative;
        width: fit-content;
    }
    
    /* LTR / Default */
    .msg-sent {
        flex-direction: row-reverse;
        align-self: flex-end !important;
        margin-right: 1rem !important;
    }
    
    .msg-received {
        flex-direction: row;
        align-self: flex-start !important;
        margin-left: 1rem !important;
    }

    /* RTL Explicit Anchoring via Flex Alignment */
    html[dir="rtl"] .msg-sent {
        flex-direction: row !important; /* Avatar on Right */
        align-self: flex-start !important; /* Pins to RIGHT in RTL */
        margin-right: 1rem !important;
    }
    html[dir="rtl"] .msg-received {
        flex-direction: row-reverse !important; /* Avatar on Left */
        align-self: flex-end !important; /* Pins to LEFT in RTL */
        margin-left: 1rem !important;
    }

    html[dir="rtl"] .msg-sent .msg-bubble {
        border-bottom-right-radius: 4px !important;
        border-bottom-left-radius: 16px !important;
    }
    html[dir="rtl"] .msg-received .msg-bubble {
        border-bottom-left-radius: 4px !important;
        border-bottom-right-radius: 16px !important;
    }
    
    .msg-avatar { 
        width: 40px !important; 
        height: 40px !important; 
        border-radius: 12px !important; 
        flex-shrink: 0;
        box-shadow: 0 4px 10px rgba(0,0,0,0.15);
        border: 2px solid var(--bg-secondary);
        object-fit: cover;
    }
    
    .msg-bubble-container {
        max-width: 70%;
        display: flex;
        flex-direction: column;
    }
    
    .msg-bubble {
        padding: 10px 14px !important;
        border-radius: 16px !important;
        position: relative !important;
        font-size: 0.95rem !important;
        line-height: 1.5 !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05) !important;
        transition: transform 0.2s ease;
        max-width: 100%;
        min-width: 40px;
        width: fit-content;
    }

    .msg-sent .msg-bubble {
        background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
        color: #fff !important;
        border-bottom-right-radius: 4px !important;
    }
    html[dir="rtl"] .msg-sent .msg-bubble {
        border-bottom-right-radius: 4px !important;
        border-bottom-left-radius: 16px !important;
        text-align: right;
    }
    
    .msg-received .msg-bubble {
        background: var(--bg-secondary) !important;
        color: var(--text-primary) !important;
        border: 1px solid var(--border-color) !important;
        border-bottom-left-radius: 4px !important;
    }
    html[dir="rtl"] .msg-received .msg-bubble {
        border-bottom-left-radius: 4px !important;
        border-bottom-right-radius: 16px !important;
        text-align: right;
    }
    
    .msg-text {
        word-break: break-word;
        white-space: pre-wrap;
    }
    
    .msg-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        font-size: 0.68rem;
        opacity: 0.7;
        justify-content: flex-end;
    }

    .typing-dots span { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--text-secondary);margin:0 1px;animation:typingBounce 1s infinite ease-in-out; }
    .typing-dots span:nth-child(2){animation-delay:.15s} .typing-dots span:nth-child(3){animation-delay:.3s}
    @keyframes typingBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
    #chat-typing-indicator{display:none;padding:0.4rem 1.25rem;align-items:center;gap:6px;min-height:24px;}
    
    @keyframes highlight {
        0% { background: rgba(59, 130, 246, 0.4); }
        100% { background: transparent; }
    }

    /* Twemoji Style Reset */
    img.emoji {
        height: 1.25em;
        width: 1.25em;
        margin: 0 .05em 0 .1em;
        vertical-align: -0.1em;
        display: inline-block;
    }
    .emoji-item img.emoji {
        width: 26px !important;
        height: 26px !important;
        margin: 0;
    }
`;
document.head.appendChild(_chatStyles);

window.ChatManager = ChatManager;
// ChatManager.init() is now called from App.init() to ensure proper order
