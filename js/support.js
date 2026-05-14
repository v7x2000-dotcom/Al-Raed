/**
 * Al-Raed Platform - Support & Help Desk Manager
 * Handles creating tickets, replying, and viewing tickets.
 */
const SupportManager = {
    currentTicketId: null,

    init: () => {
        let lastTicketsState = JSON.stringify(Store.get('support_tickets') || []);
        window.addEventListener('storeUpdated', (e) => {
            if (e.detail?.key === 'support_tickets') {
                const me = AuthManager.currentUser;
                const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';
                const currentTicketsStr = JSON.stringify(Store.get('support_tickets') || []);
                
                if (lastTicketsState !== currentTicketsStr) {
                    const oldT = JSON.parse(lastTicketsState);
                    const newT = JSON.parse(currentTicketsStr);
                    
                    if (newT.length > oldT.length && isAdmin) {
                        // New ticket created
                        const latest = newT[newT.length - 1];
                        if (latest.userId !== me.id) {
                            NotificationManager.add(`🎫 تذكرة دعم جديدة من ${latest.userName}`, 'fa-ticket-alt', 'system');
                        }
                    } else if (newT.length === oldT.length) {
                        // Check for new messages
                        for (let i = 0; i < newT.length; i++) {
                            if (newT[i].messages.length > oldT[i].messages.length) {
                                const latestMsg = newT[i].messages[newT[i].messages.length - 1];
                                if (latestMsg.senderId !== me.id) {
                                    if (isAdmin || newT[i].userId === me.id) {
                                        NotificationManager.add(`💬 رد جديد على تذكرة: ${newT[i].title}`, 'fa-headset', 'system');
                                    }
                                }
                            }
                        }
                    }
                    
                    lastTicketsState = currentTicketsStr;
                    SupportManager.renderTicketsList();
                    if (SupportManager.currentTicketId) {
                        SupportManager.viewTicket(SupportManager.currentTicketId);
                    }
                }
            }
        });
        
        // Listen for enter key in reply
        const replyInput = document.getElementById('support-reply-input');
        const adminReplyInput = document.getElementById('admin-support-reply-input');
        const handler = (e) => {
            if (e.key === 'Enter') SupportManager.sendReply();
        };
        if (replyInput) replyInput.addEventListener('keydown', handler);
        if (adminReplyInput) adminReplyInput.addEventListener('keydown', handler);
    },

    getPrefix: () => {
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel && adminPanel.classList.contains('active')) return 'admin-';
        return '';
    },

    render: () => {
        SupportManager.renderTicketsList();
        SupportManager.currentTicketId = null;
        const p = SupportManager.getPrefix();
        
        const header = document.getElementById(p + 'support-ticket-header');
        const messages = document.getElementById(p + 'support-ticket-messages');
        const replyArea = document.getElementById(p + 'support-reply-area');
        
        if(header) header.innerHTML = '<div style="font-weight:700;color:var(--text-secondary);">اختر تذكرة لعرضها</div>';
        if(messages) messages.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);opacity:0.5;">
                <i class="fas fa-headset" style="font-size:4rem;margin-bottom:1rem;"></i>
                <p>مركز الدعم الفني في خدمتك</p>
            </div>
        `;
        if(replyArea) replyArea.style.display = 'none';
        
        // Ensure ticket list title is correct
        const isAdmin = p === 'admin-';
        const titleEl = isAdmin ? document.querySelector('#admin-panel .support-grid > div:first-child > div:first-child') : document.querySelector('#support .support-grid > div:first-child > div:first-child');
        if (titleEl) {
            titleEl.innerHTML = isAdmin ? '<i class="fas fa-ticket-alt"></i> كافة التذاكر' : '<i class="fas fa-ticket-alt"></i> التذاكر الخاصة بي';
        }
    },

    getTickets: () => {
        return Store.get('support_tickets') || [];
    },

    saveTickets: (tickets) => {
        Store.set('support_tickets', tickets);
    },

    renderTicketsList: () => {
        const p = SupportManager.getPrefix();
        const listEl = document.getElementById(p + 'support-tickets-list');
        if (!listEl) return;
        
        const me = AuthManager.currentUser;
        if (!me) return;

        const isAdmin = me.role === 'Super Admin' || me.role === 'Manager';
        let tickets = SupportManager.getTickets();
        
        // Filter: Admin sees all, User sees only theirs
        if (!isAdmin) {
            tickets = tickets.filter(t => t.userId === me.id);
        }

        // Sort: Open first, then by date desc
        tickets.sort((a, b) => {
            if (a.status !== b.status) return a.status === 'Open' ? -1 : 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        listEl.innerHTML = '';

        if (tickets.length === 0) {
            listEl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary);font-size:0.9rem;">لا توجد تذاكر حالياً</div>';
            return;
        }

        tickets.forEach(ticket => {
            const div = document.createElement('div');
            const isActive = ticket.id === SupportManager.currentTicketId;
            const statusColor = ticket.status === 'Open' ? '#10b981' : '#6b7280';
            const statusText = ticket.status === 'Open' ? 'مفتوحة' : 'مغلقة';
            
            div.style.cssText = `
                padding: 1rem;
                border-bottom: 1px solid var(--border-color);
                cursor: pointer;
                border-radius: 8px;
                margin-bottom: 0.25rem;
                transition: background 0.2s;
                background: ${isActive ? 'rgba(37,99,235,0.1)' : 'transparent'};
                border-left: ${isActive ? '4px solid var(--primary-color)' : '4px solid transparent'};
            `;
            
            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                    <strong style="font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${ticket.title}</strong>
                    <span style="font-size:0.7rem;color:${statusColor};background:${statusColor}22;padding:2px 6px;border-radius:12px;">${statusText}</span>
                </div>
                <div style="display:flex;justify-content:space-between;color:var(--text-secondary);font-size:0.75rem;">
                    <span>${ticket.category}</span>
                    <span>${new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
                ${isAdmin ? `<div style="font-size:0.75rem;margin-top:0.3rem;color:var(--primary-color);"><i class="fas fa-user"></i> ${ticket.userName}</div>` : ''}
            `;
            
            div.addEventListener('click', () => SupportManager.viewTicket(ticket.id));
            div.addEventListener('mouseenter', () => { if(!isActive) div.style.background = 'rgba(37,99,235,0.05)'; });
            div.addEventListener('mouseleave', () => { if(!isActive) div.style.background = 'transparent'; });
            
            listEl.appendChild(div);
        });
    },

    viewTicket: (ticketId) => {
        const p = SupportManager.getPrefix();
        const tickets = SupportManager.getTickets();
        const ticket = tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        SupportManager.currentTicketId = ticketId;
        SupportManager.renderTicketsList(); // update active state

        const me = AuthManager.currentUser;
        const isAdmin = me?.role === 'Super Admin' || me?.role === 'Manager';

        // Update header
        const header = document.getElementById(p + 'support-ticket-header');
        if(!header) return;
        
        const statusColor = ticket.status === 'Open' ? '#10b981' : '#6b7280';
        const statusText = ticket.status === 'Open' ? 'مفتوحة' : 'مغلقة';
        
        header.innerHTML = `
            <div>
                <div style="font-weight:700;font-size:1.1rem;margin-bottom:0.2rem;">${ticket.title}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">بواسطة: ${ticket.userName} | القسم: ${ticket.category}</div>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;">
                <span style="font-size:0.85rem;color:${statusColor};background:${statusColor}22;padding:4px 10px;border-radius:12px;font-weight:600;"><i class="fas fa-circle" style="font-size:0.5rem;margin-right:4px;"></i> ${statusText}</span>
                ${isAdmin ? `<button class="btn btn-icon" style="color:var(--danger);" onclick="SupportManager.deleteTicket('${ticket.id}')" title="حذف التذكرة"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        `;

        // Render messages
        const msgContainer = document.getElementById(p + 'support-ticket-messages');
        if(!msgContainer) return;
        
        msgContainer.innerHTML = '';
        
        ticket.messages.forEach(msg => {
            const isMe = msg.senderId === me.id;
            const isSupportReply = msg.senderRole === 'Super Admin' || msg.senderRole === 'Manager';
            
            const div = document.createElement('div');
            div.style.cssText = `
                display:flex;flex-direction:column;max-width:80%; margin-bottom:1rem;
                ${isMe ? 'align-self:flex-end;align-items:flex-end;' : 'align-self:flex-start;align-items:flex-start;'}
            `;
            
            const bg = isMe ? 'var(--primary-color)' : (isSupportReply ? '#10b981' : 'var(--bg-secondary)');
            const color = (isMe || isSupportReply) ? '#fff' : 'var(--text-primary)';
            const borderRadius = isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px';

            div.innerHTML = `
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">${msg.senderName} ${isSupportReply ? '<i class="fas fa-check-circle" style="color:#10b981;" title="دعم فني"></i>' : ''}</div>
                <div class="support-msg-bubble" style="background:${bg};color:${color};padding:0.8rem 1rem;border-radius:${borderRadius};font-size:0.9rem;box-shadow:0 2px 5px rgba(0,0,0,0.05);line-height:1.5;cursor:pointer;position:relative;">
                    ${msg.content.replace(/\n/g, '<br>')}
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.3rem;">
                    <div style="font-size:0.7rem;color:var(--text-secondary);">
                        ${new Date(msg.timestamp).toLocaleString()}
                    </div>
                </div>
            `;

            // Add context menu listener for admins
            if (isAdmin) {
                const bubble = div.querySelector('.support-msg-bubble');
                bubble.addEventListener('click', (e) => {
                    e.stopPropagation();
                    SupportManager.showMsgMenu(e, ticket.id, msg.id);
                });
            }

            msgContainer.appendChild(div);
        });

        // Scroll to bottom
        msgContainer.scrollTop = msgContainer.scrollHeight;

        // Reply area
        const replyArea = document.getElementById(p + 'support-reply-area');
        if(!replyArea) return;
        
        if (ticket.status === 'Open') {
            replyArea.style.display = 'flex';
            const closeBtn = document.getElementById(p === 'admin-' ? 'admin-btn-close-ticket' : 'btn-close-ticket');
            if (closeBtn) {
                closeBtn.style.display = isAdmin ? 'block' : 'none';
            }
        } else {
            replyArea.style.display = 'none';
        }
    },

    sendReply: () => {
        if (!SupportManager.currentTicketId) return;
        const p = SupportManager.getPrefix();
        const input = document.getElementById(p + 'support-reply-input');
        if (!input) return;
        const content = input.value.trim();
        if (!content) {
            console.warn('SupportManager: Empty reply content.');
            return;
        }

        const me = AuthManager.currentUser;
        const tickets = SupportManager.getTickets();
        const ticketIndex = tickets.findIndex(t => t.id === SupportManager.currentTicketId);
        
        if (ticketIndex === -1 || tickets[ticketIndex].status !== 'Open') return;

        tickets[ticketIndex].messages.push({
            id: 'smsg_' + Date.now(),
            senderId: me.id,
            senderName: me.name,
            senderRole: me.role,
            content: content,
            timestamp: new Date().toISOString()
        });

        tickets[ticketIndex].updatedAt = new Date().toISOString();
        SupportManager.saveTickets(tickets);
        input.value = '';
        SupportManager.viewTicket(SupportManager.currentTicketId);
    },

    closeTicket: () => {
        if (!SupportManager.currentTicketId) return;
        askConfirm('هل أنت متأكد من إغلاق هذه التذكرة؟', () => {
            const tickets = SupportManager.getTickets();
            const ticketIndex = tickets.findIndex(t => t.id === SupportManager.currentTicketId);
            
            if (ticketIndex > -1) {
                tickets[ticketIndex].status = 'Closed';
                tickets[ticketIndex].updatedAt = new Date().toISOString();
                SupportManager.saveTickets(tickets);
                SupportManager.viewTicket(SupportManager.currentTicketId);
            }
        }, 'إغلاق التذكرة', 'check-circle');
    },

    showMsgMenu: (e, ticketId, msgId) => {
        // Remove existing menus
        document.querySelectorAll('.support-context-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'support-context-menu glass-effect';
        menu.style.cssText = `
            position: fixed;
            top: ${e.clientY}px;
            left: ${e.clientX}px;
            z-index: 10000;
            padding: 0.5rem;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            min-width: 120px;
        `;

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> حذف الرسالة';
        deleteBtn.style.cssText = `
            width: 100%;
            padding: 0.5rem 1rem;
            border: none;
            background: none;
            color: var(--danger);
            cursor: pointer;
            text-align: right;
            border-radius: 4px;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: flex-end;
        `;
        deleteBtn.onmouseover = () => deleteBtn.style.background = 'rgba(239,68,68,0.1)';
        deleteBtn.onmouseout = () => deleteBtn.style.background = 'none';
        deleteBtn.onclick = () => {
            SupportManager.deleteMessage(ticketId, msgId);
            menu.remove();
        };

        menu.appendChild(deleteBtn);
        document.body.appendChild(menu);

        // Close on click outside
        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    },

    deleteTicket: (ticketId) => {
        askConfirm('هل أنت متأكد من حذف هذه التذكرة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.', () => {
            let tickets = SupportManager.getTickets();
            tickets = tickets.filter(t => t.id !== ticketId);
            SupportManager.saveTickets(tickets);
            if (SupportManager.currentTicketId === ticketId) {
                SupportManager.render(); // Reset the view to empty
            } else {
                SupportManager.renderTicketsList();
            }
            if (typeof AuthManager !== 'undefined') AuthManager.showToast('✅ تم حذف التذكرة بنجاح.');
        }, 'حذف التذكرة');
    },

    deleteMessage: (ticketId, msgId) => {
        askConfirm('هل أنت متأكد من حذف هذه الرسالة؟', () => {
            const tickets = SupportManager.getTickets();
            const tIdx = tickets.findIndex(t => t.id === ticketId);
            if (tIdx > -1) {
                tickets[tIdx].messages = tickets[tIdx].messages.filter(m => m.id !== msgId);
                tickets[tIdx].updatedAt = new Date().toISOString();
                SupportManager.saveTickets(tickets);
                if (SupportManager.currentTicketId === ticketId) {
                    SupportManager.viewTicket(ticketId);
                }
            }
        }, 'حذف الرسالة');
    },

    showNewTicketModal: () => {
        document.getElementById('ticket-title').value = '';
        document.getElementById('ticket-desc').value = '';
        document.getElementById('ticket-category').value = 'Technical';
        document.getElementById('ticket-modal').classList.remove('hidden');
    },

    closeModal: () => {
        document.getElementById('ticket-modal').classList.add('hidden');
    },

    createTicket: () => {
        const title = document.getElementById('ticket-title').value.trim();
        const desc = document.getElementById('ticket-desc').value.trim();
        const category = document.getElementById('ticket-category').value;
        const me = AuthManager.currentUser;

        if (!title || !desc) {
            showAlert('يرجى ملء جميع الحقول المطلوبة');
            return;
        }

        const ticket = {
            id: 'tkt_' + Date.now() + Math.random().toString(36).substr(2, 5),
            userId: me.id,
            userName: me.name,
            title: title,
            category: category,
            status: 'Open', // Open | Closed
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [{
                id: 'smsg_' + Date.now(),
                senderId: me.id,
                senderName: me.name,
                senderRole: me.role,
                content: desc,
                timestamp: new Date().toISOString()
            }]
        };

        const tickets = SupportManager.getTickets();
        tickets.push(ticket);
        SupportManager.saveTickets(tickets);
        
        SupportManager.closeModal();
        SupportManager.renderTicketsList();
        SupportManager.viewTicket(ticket.id);
    },

    // Refresh everything for the active view
    refresh: () => {
        SupportManager.renderTicketsList();
        if (SupportManager.currentTicketId) {
            SupportManager.viewTicket(SupportManager.currentTicketId);
        }
    }
};

window.SupportManager = SupportManager;
