// Advanced Tasks Management System (ClickUp/Monday Style)
const TasksManager = {
    init: () => {
        TasksManager.render();
        TasksManager.bindEvents();
    },

    bindEvents: () => {
        // Modal toggles
        document.getElementById('btn-add-task')?.addEventListener('click', TasksManager.openCreateModal);
        
        // Form logic
        document.getElementById('task-assign-type')?.addEventListener('change', TasksManager.handleAssignTypeChange);
        document.getElementById('task-progress')?.addEventListener('input', (e) => {
            document.getElementById('task-progress-val').textContent = e.target.value + '%';
        });

        // Subtasks
        document.getElementById('btn-add-subtask')?.addEventListener('click', TasksManager.addSubtaskFromInput);
        document.getElementById('new-subtask-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                TasksManager.addSubtaskFromInput();
            }
        });

        // Attachments
        document.getElementById('task-file-upload')?.addEventListener('change', TasksManager.handleFileUpload);
        document.getElementById('save-task')?.addEventListener('click', TasksManager.saveTask);

        // View Modal actions
        document.getElementById('btn-add-task-comment')?.addEventListener('click', TasksManager.addComment);
        document.getElementById('btn-save-quick-progress')?.addEventListener('click', TasksManager.quickUpdateProgress);
        document.getElementById('btn-edit-viewed-task')?.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            document.getElementById('task-view-modal').classList.add('hidden');
            TasksManager.editTask(id);
        });

        // Drag & Drop for columns
        document.querySelectorAll('.task-list').forEach(list => {
            list.addEventListener('dragover', e => {
                e.preventDefault();
                list.style.background = 'rgba(0,0,0,0.05)';
            });
            list.addEventListener('dragleave', e => {
                list.style.background = 'transparent';
            });
            list.addEventListener('drop', e => {
                e.preventDefault();
                list.style.background = 'transparent';
                const id = e.dataTransfer.getData('text/plain');
                if(id) {
                    const newStatus = list.dataset.status;
                    TasksManager.updateTaskStatus(id, newStatus);
                }
            });
        });

        // Close custom dropdowns if clicked outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('custom-assignees-dropdown');
            const btn = document.getElementById('custom-assignees-btn');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    },

    currentSubtasks: [],
    currentAttachments: [],
    currentViewedTask: null,
    selectedAssignees: [],

    /* ─── CREATION & EDITING ───────────────────────────────── */
    
    openCreateModal: () => {
        if (!AuthManager.isAdmin()) {
            AuthManager.showToast('عذراً، فقط الإدارة يمكنها إنشاء مهام جديدة.', 'error');
            return;
        }

        document.getElementById('task-id').value = '';
        document.getElementById('task-title').value = '';
        document.getElementById('task-desc').value = '';
        document.getElementById('task-priority').value = 'medium';
        document.getElementById('task-status').value = 'todo';
        document.getElementById('task-start-date').value = '';
        document.getElementById('task-deadline').value = '';
        document.getElementById('task-progress').value = 0;
        document.getElementById('task-progress-val').textContent = '0%';
        document.getElementById('task-assign-type').value = 'specific';
        
        TasksManager.currentSubtasks = [];
        TasksManager.currentAttachments = [];
        TasksManager.selectedAssignees = [];
        TasksManager.renderSubtasksEditor();
        TasksManager.renderAttachmentsPreview();
        TasksManager.populateAssignees();
        TasksManager.handleAssignTypeChange();
        
        document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-layer-group" style="color: var(--primary-color);"></i> <span>إنشاء مهمة جديدة</span>';
        document.getElementById('task-modal').classList.remove('hidden');
    },

    populateAssignees: () => {
        const team = Store.get('team') || [];
        const list = document.getElementById('custom-assignees-list');
        const deptSelect = document.getElementById('task-dept');
        const label = document.getElementById('custom-assignees-label');
        
        if (list) {
            list.innerHTML = team.map(m => {
                const isSelected = TasksManager.selectedAssignees.includes(m.id);
                const av = m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=333&color=fff`;
                return `
                <div class="assignee-list-item" onclick="TasksManager.toggleAssignee('${m.id}', event)" style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; cursor: pointer; border-radius: var(--radius-sm); margin-bottom: 2px; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <img src="${av}" style="width: 24px; height: 24px; border-radius: 50%;">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">${m.name}</span>
                            <span style="font-size: 0.65rem; color: var(--text-secondary);">${m.title || 'موظف'}</span>
                        </div>
                    </div>
                    <div style="width: 16px; height: 16px; border-radius: 4px; border: 1px solid ${isSelected ? 'var(--primary-color)' : 'rgba(255,255,255,0.2)'}; display: flex; align-items: center; justify-content: center; background: ${isSelected ? 'var(--primary-color)' : 'transparent'};">
                        ${isSelected ? '<i class="fas fa-check" style="font-size: 10px; color: white;"></i>' : ''}
                    </div>
                </div>
                `;
            }).join('');
        }
        
        if (label) {
            if (TasksManager.selectedAssignees.length === 0) {
                label.textContent = 'اختر الموظفين...';
            } else if (TasksManager.selectedAssignees.length === 1) {
                const single = team.find(t => t.id === TasksManager.selectedAssignees[0]);
                label.textContent = single ? single.name : 'تم تحديد (1)';
            } else {
                label.textContent = `تم تحديد (${TasksManager.selectedAssignees.length}) موظف`;
            }
        }
        
        if (deptSelect) {
            const depts = [...new Set(team.map(m => m.dept).filter(Boolean))];
            deptSelect.innerHTML = depts.length ? depts.map(d => `<option value="${d}">${d}</option>`).join('') : '<option value="">لا توجد أقسام</option>';
        }

        // Also populate the filter assignee dropdown on tasks page
        const filterAssignee = document.getElementById('task-filter-assignee');
        if (filterAssignee && team.length > 0) {
            const currentVal = filterAssignee.value;
            filterAssignee.innerHTML = `<option value="">كل الموظفين</option>` +
                team.map(m => `<option value="${m.id}" ${currentVal === m.id ? 'selected' : ''}>${m.name}</option>`).join('');
        }
    },

    handleAssignTypeChange: () => {
        const type = document.getElementById('task-assign-type')?.value;
        document.getElementById('task-assign-specific-container').style.display = type === 'specific' ? 'block' : 'none';
        document.getElementById('task-assign-dept-container').style.display = type === 'department' ? 'block' : 'none';
    },

    toggleAssignee: (id, event) => {
        if(event) { event.stopPropagation(); }
        const idx = TasksManager.selectedAssignees.indexOf(id);
        if (idx > -1) {
            TasksManager.selectedAssignees.splice(idx, 1);
        } else {
            TasksManager.selectedAssignees.push(id);
        }
        TasksManager.populateAssignees(); // Re-render to update UI
    },

    addSubtaskFromInput: () => {
        const input = document.getElementById('new-subtask-input');
        const title = input?.value.trim();
        if (title) {
            TasksManager.currentSubtasks.push({ id: 'st_' + Date.now(), title, done: false });
            input.value = '';
            TasksManager.renderSubtasksEditor();
        }
    },

    renderSubtasksEditor: () => {
        const container = document.getElementById('subtasks-container');
        if (!container) return;
        container.innerHTML = TasksManager.currentSubtasks.map((st, idx) => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" ${st.done ? 'checked' : ''} onclick="TasksManager.toggleSubtaskEditor(${idx})" style="accent-color: var(--primary-color); width: 16px; height: 16px; cursor: pointer;">
                    <span style="text-decoration: ${st.done ? 'line-through' : 'none'}; color: ${st.done ? 'var(--text-secondary)' : 'var(--text-primary)'}">${st.title}</span>
                </div>
                <button type="button" class="btn btn-icon" onclick="TasksManager.removeSubtaskEditor(${idx})" style="color: var(--danger); padding: 0.25rem;"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
    },

    toggleSubtaskEditor: (idx) => {
        TasksManager.currentSubtasks[idx].done = !TasksManager.currentSubtasks[idx].done;
        TasksManager.renderSubtasksEditor();
    },

    removeSubtaskEditor: (idx) => {
        TasksManager.currentSubtasks.splice(idx, 1);
        TasksManager.renderSubtasksEditor();
    },

    handleFileUpload: (e) => {
        const files = Array.from(e.target.files);
        if(!files.length) return;
        
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                TasksManager.currentAttachments.push({
                    name: file.name,
                    type: file.type,
                    data: ev.target.result
                });
                TasksManager.renderAttachmentsPreview();
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    },

    renderAttachmentsPreview: () => {
        const container = document.getElementById('task-attachments-preview');
        if (!container) return;
        container.innerHTML = TasksManager.currentAttachments.map((att, idx) => `
            <div style="position: relative; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;" title="${att.name}">
                ${att.type.startsWith('image/') ? `<img src="${att.data}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i class="fas fa-file-alt" style="font-size: 1.5rem; color: var(--text-secondary);"></i>`}
                <button type="button" onclick="TasksManager.removeAttachment(${idx})" style="position: absolute; top: 2px; right: 2px; background: rgba(239,68,68,0.9); color: white; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 0.6rem; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
    },

    removeAttachment: (idx) => {
        TasksManager.currentAttachments.splice(idx, 1);
        TasksManager.renderAttachmentsPreview();
    },

    saveTask: () => {
        const titleEl = document.getElementById('task-title');
        const title = titleEl?.value.trim();
        if (!title) { AuthManager.showToast('اسم المهمة مطلوب!', 'error'); return; }

        const id = document.getElementById('task-id').value;
        const assignType = document.getElementById('task-assign-type').value;
        
        let assignees = [];
        if (assignType === 'specific') {
            assignees = TasksManager.selectedAssignees;
            if(assignees.length === 0) { AuthManager.showToast('يرجى اختيار موظف واحد على الأقل.', 'error'); return; }
        }

        const task = {
            id: id || 'task_' + Date.now(),
            title: title,
            desc: document.getElementById('task-desc')?.value || '',
            assignType: assignType,
            assignees: assignees,
            department: assignType === 'department' ? document.getElementById('task-dept').value : '',
            priority: document.getElementById('task-priority').value,
            status: document.getElementById('task-status').value,
            startDate: document.getElementById('task-start-date').value,
            deadline: document.getElementById('task-deadline').value,
            progress: parseInt(document.getElementById('task-progress').value) || 0,
            subtasks: TasksManager.currentSubtasks,
            attachments: TasksManager.currentAttachments,
            comments: id ? (Store.get('tasks')?.find(t => t.id === id)?.comments || []) : [],
            createdBy: AuthManager.currentUser.id,
            createdAt: id ? (Store.get('tasks')?.find(t => t.id === id)?.createdAt || Date.now()) : Date.now()
        };

        const tasks = Store.get('tasks') || [];
        if (id) {
            const idx = tasks.findIndex(t => t.id === id);
            if (idx > -1) tasks[idx] = task;
        } else {
            tasks.push(task);
            NotificationManager.add(`مهمة جديدة: ${task.title}`, 'fa-tasks', 'system');
        }

        Store.set('tasks', tasks);
        document.getElementById('task-modal').classList.add('hidden');
        AuthManager.showToast('✅ تم حفظ المهمة بنجاح.');
        TasksManager.render();
        if(typeof App !== 'undefined') App.updateDashboardStats();
    },

    editTask: (id) => {
        if (!AuthManager.isAdmin()) {
            AuthManager.showToast('عذراً، فقط الإدارة يمكنها تعديل المهام.', 'error');
            return;
        }
        
        const tasks = Store.get('tasks') || [];
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        TasksManager.selectedAssignees = task.assignees ? [...task.assignees] : [];
        TasksManager.populateAssignees();

        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.desc;
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-status').value = task.status;
        document.getElementById('task-start-date').value = task.startDate || '';
        document.getElementById('task-deadline').value = task.deadline || '';
        document.getElementById('task-progress').value = task.progress || 0;
        document.getElementById('task-progress-val').textContent = (task.progress || 0) + '%';
        
        document.getElementById('task-assign-type').value = task.assignType || 'specific';
        TasksManager.handleAssignTypeChange();
        
        if (task.assignType === 'department') {
            document.getElementById('task-dept').value = task.department;
        }

        TasksManager.currentSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));
        TasksManager.currentAttachments = JSON.parse(JSON.stringify(task.attachments || []));
        
        TasksManager.renderSubtasksEditor();
        TasksManager.renderAttachmentsPreview();

        document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-edit" style="color: var(--primary-color);"></i> <span>تعديل المهمة</span>';
        document.getElementById('task-modal').classList.remove('hidden');
    },

    deleteTask: (id) => {
        if (!AuthManager.isAdmin()) return;
        askConfirm('هل أنت متأكد من حذف هذه المهمة نهائياً؟', () => {
            let tasks = Store.get('tasks') || [];
            tasks = tasks.filter(t => t.id !== id);
            Store.set('tasks', tasks);
            TasksManager.render();
            if(typeof App !== 'undefined') App.updateDashboardStats();
            AuthManager.showToast('تم حذف المهمة.');
        });
    },

    /* ─── RENDERING & LISTS ────────────────────────────────── */

    canViewTask: (task) => {
        if (AuthManager.isAdmin()) return true;
        const u = AuthManager.currentUser;
        if (!u) return false;
        if (task.assignType === 'all') return true;
        if (task.assignType === 'specific' && task.assignees.includes(u.id)) return true;
        if (task.assignType === 'department' && task.department === u.dept) return true;
        return false;
    },

    filterTasks: () => {
        const search = (document.getElementById('task-search-input')?.value || '').toLowerCase().trim();
        const priority = document.getElementById('task-filter-priority')?.value || '';
        const assigneeId = document.getElementById('task-filter-assignee')?.value || '';

        const allTasks = Store.get('tasks') || [];
        const visible = allTasks.filter(task => {
            if (!TasksManager.canViewTask(task)) return false;
            if (search && !task.title.toLowerCase().includes(search) && !(task.desc || '').toLowerCase().includes(search)) return false;
            if (priority && task.priority !== priority) return false;
            if (assigneeId) {
                if (task.assignType === 'all') return true;
                if (task.assignType === 'department') {
                    const u = (Store.get('team') || []).find(m => m.id === assigneeId);
                    return u && u.dept === task.department;
                }
                if (!task.assignees?.includes(assigneeId)) return false;
            }
            return true;
        });

        const cols = { todo: [], inprogress: [], review: [], done: [] };
        visible.forEach(t => { if (cols[t.status]) cols[t.status].push(t); else cols.todo.push(t); });

        const getStatusColor = (s) => ({ todo: '#94a3b8', inprogress: '#3b82f6', review: '#f59e0b', done: '#10b981' }[s] || '#94a3b8');
        const getPriorityLabel = (p) => ({ urgent: '🔥 عاجل', high: '🔴 عالي', medium: '🟡 متوسط', low: '🟢 منخفض' }[p] || '⚪ عادي');
        const team = Store.get('team') || [];

        Object.keys(cols).forEach(status => {
            const listEl = document.getElementById(`${status}-list`);
            const countEl = document.getElementById(`count-${status}`);
            if (!listEl) return;
            listEl.innerHTML = '';
            if (countEl) countEl.textContent = cols[status].length;

            if (cols[status].length === 0) {
                listEl.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-secondary);opacity:0.5;"><i class="fas fa-ghost" style="font-size:2rem;margin-bottom:0.5rem;display:block;"></i>لا توجد مهام</div>`;
                return;
            }

            cols[status].forEach(task => {
                const isLate = task.deadline && new Date(task.deadline) < new Date() && status !== 'done';
                const subDone = (task.subtasks || []).filter(s => s.done).length;
                const subTotal = (task.subtasks || []).length;

                let assigneesHtml = '';
                if (task.assignType === 'all') assigneesHtml = `<span class="badge" style="background:rgba(37,99,235,0.1);color:#3b82f6;font-size:0.7rem;"><i class="fas fa-users"></i> للجميع</span>`;
                else if (task.assignType === 'department') assigneesHtml = `<span class="badge" style="background:rgba(139,92,246,0.1);color:#8b5cf6;font-size:0.7rem;"><i class="fas fa-building"></i> ${task.department}</span>`;
                else {
                    const au = team.filter(m => task.assignees?.includes(m.id)).slice(0, 3);
                    assigneesHtml = au.map(u => { const av = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=333&color=fff`; return `<img src="${av}" title="${u.name}" style="width:24px;height:24px;border-radius:50%;border:2px solid var(--bg-primary);margin-inline-end:-8px;">`; }).join('');
                    if (task.assignees?.length > 3) assigneesHtml += `<span style="font-size:0.7rem;color:var(--text-secondary);margin-inline-start:12px;">+${task.assignees.length - 3}</span>`;
                }

                const card = document.createElement('div');
                card.className = 'task-card glass-effect';
                card.style.cssText = `border-inline-start:4px solid ${getStatusColor(status)};cursor:pointer;transition:all 0.2s ease;position:relative;overflow:hidden;`;
                card.draggable = AuthManager.isAdmin();
                card.dataset.id = task.id;
                card.onclick = (e) => { if (e.target.closest('button')) return; TasksManager.viewTask(task.id); };
                card.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;align-items:flex-start;">
                        <h4 style="margin:0;font-size:0.95rem;line-height:1.4;color:var(--text-primary);${task.status==='done'?'text-decoration:line-through;opacity:0.7;':''}">${task.title}</h4>
                        ${AuthManager.isAdmin() ? `<div style="display:flex;gap:0.25rem;"><button class="btn btn-icon" onclick="TasksManager.editTask('${task.id}')" style="font-size:0.75rem;color:var(--text-secondary);"><i class="fas fa-pen"></i></button><button class="btn btn-icon" onclick="TasksManager.deleteTask('${task.id}')" style="font-size:0.75rem;color:var(--danger);"><i class="fas fa-trash"></i></button></div>` : ''}
                    </div>
                    ${task.desc ? `<p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${task.desc}</p>` : ''}
                    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
                        <span style="font-size:0.75rem;background:rgba(0,0,0,0.2);padding:0.2rem 0.5rem;border-radius:4px;">${getPriorityLabel(task.priority)}</span>
                        ${task.deadline ? `<span style="font-size:0.75rem;background:${isLate?'rgba(239,68,68,0.1)':'rgba(0,0,0,0.2)'};color:${isLate?'var(--danger)':'var(--text-secondary)'};padding:0.2rem 0.5rem;border-radius:4px;"><i class="fas fa-clock"></i> ${task.deadline}</span>` : ''}
                        ${subTotal > 0 ? `<span style="font-size:0.75rem;background:rgba(0,0,0,0.2);padding:0.2rem 0.5rem;border-radius:4px;color:${subDone===subTotal?'var(--success)':'var(--text-secondary)'};"><i class="fas fa-check-square"></i> ${subDone}/${subTotal}</span>` : ''}
                        ${task.attachments?.length > 0 ? `<span style="font-size:0.75rem;background:rgba(0,0,0,0.2);padding:0.2rem 0.5rem;border-radius:4px;"><i class="fas fa-paperclip"></i> ${task.attachments.length}</span>` : ''}
                    </div>
                    <div style="position:absolute;bottom:0;left:0;height:3px;background:var(--primary-color);width:${task.progress||0}%;transition:width 0.3s ease;"></div>
                `;
                if (AuthManager.isAdmin()) {
                    card.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('text/plain', task.id);
                        setTimeout(() => card.style.opacity = '0.5', 0);
                    });
                    card.addEventListener('dragend', () => card.style.opacity = '1');
                }

                listEl.appendChild(card);
            });
        });
    },

    render: () => TasksManager.filterTasks(),

    employeeChangeStatus: (newStatus) => {
        if (!TasksManager.currentViewedTask) return;
        let tasks = Store.get('tasks');
        const idx = tasks.findIndex(t => t.id === TasksManager.currentViewedTask.id);
        if (idx > -1) {
            tasks[idx].status = newStatus;
            Store.set('tasks', tasks);
            TasksManager.currentViewedTask = tasks[idx];
            TasksManager.filterTasks();
            if(typeof App !== 'undefined') App.updateDashboardStats();
            AuthManager.showToast('✅ تم تحديث حالة المهمة بنجاح');
        }
    },

    updateTaskStatus: (id, status) => {
        if (!AuthManager.isAdmin()) return; // Employee changes status via view modal
        let tasks = Store.get('tasks');
        const index = tasks.findIndex(t => t.id === id);
        if(index > -1) {
            tasks[index].status = status;
            if (status === 'done') tasks[index].progress = 100;
            Store.set('tasks', tasks);
            TasksManager.render();
            if(typeof App !== 'undefined') App.updateDashboardStats();
            
            if (status === 'done') {
                TasksManager.celebrate();
            }
        }
    },

    /* ─── VIEWING DETAILED TASK ────────────────────────────── */

    viewTask: (id) => {
        const tasks = Store.get('tasks') || [];
        const task = tasks.find(t => t.id === id);
        if(!task) return;
        
        TasksManager.currentViewedTask = task;

        const modal = document.getElementById('task-view-modal');
        document.getElementById('view-task-title').textContent = task.title;
        document.getElementById('btn-edit-viewed-task').dataset.id = task.id;

        const statusBadges = {
            todo: '<span style="background:rgba(148,163,184,0.1);color:#94a3b8;padding:0.25rem 0.75rem;border-radius:20px;font-size:0.8rem;font-weight:bold;">📋 قيد الانتظار</span>',
            inprogress: '<span style="background:rgba(59,130,246,0.1);color:#3b82f6;padding:0.25rem 0.75rem;border-radius:20px;font-size:0.8rem;font-weight:bold;">⚙️ قيد التنفيذ</span>',
            review: '<span style="background:rgba(245,158,11,0.1);color:#f59e0b;padding:0.25rem 0.75rem;border-radius:20px;font-size:0.8rem;font-weight:bold;">👀 مراجعة</span>',
            done: '<span style="background:rgba(16,185,129,0.1);color:#10b981;padding:0.25rem 0.75rem;border-radius:20px;font-size:0.8rem;font-weight:bold;">✅ مكتملة</span>'
        };
        document.getElementById('view-task-status-badge').innerHTML = statusBadges[task.status] || '';

        // Details
        document.getElementById('view-task-desc').textContent = task.desc || 'لا يوجد وصف للمهمة.';
        document.getElementById('view-task-start').textContent = task.startDate || 'غير محدد';
        document.getElementById('view-task-end').textContent = task.deadline || 'غير محدد';
        document.getElementById('view-task-progress-text').textContent = task.progress || 0;
        document.getElementById('view-task-progress-bar').style.width = `${task.progress || 0}%`;

        // Employee: show status change + progress update
        const pCont = document.getElementById('view-task-progress-update-container');
        if (!AuthManager.isAdmin()) {
            pCont.style.display = 'block';
            document.getElementById('quick-progress-update').value = task.progress || 0;
            // Add status change select for employees if not already present
            let empStatusEl = document.getElementById('employee-status-change');
            if (!empStatusEl) {
                const div = document.createElement('div');
                div.style.cssText = 'margin-top:0.75rem;';
                div.innerHTML = `<label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:0.4rem;">تغيير حالة المهمة</label>
                    <select id="employee-status-change" onchange="TasksManager.employeeChangeStatus(this.value)" style="width:100%;padding:0.5rem;border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.2);color:var(--text-primary);font-size:0.85rem;cursor:pointer;">
                        <option value="todo">📋 قيد الانتظار</option>
                        <option value="inprogress">⚙️ قيد التنفيذ</option>
                        <option value="review">👀 بحاجة مراجعة</option>
                    </select>`;
                pCont.appendChild(div);
            }
            const statusSel = document.getElementById('employee-status-change');
            if (statusSel) statusSel.value = task.status === 'done' ? 'review' : task.status;
        } else {
            pCont.style.display = 'none';
        }

        // Assignees
        const assigneesEl = document.getElementById('view-task-assignees');
        if (task.assignType === 'all') {
            assigneesEl.innerHTML = `<span class="badge" style="background: rgba(37,99,235,0.1); color: #3b82f6;"><i class="fas fa-users"></i> جميع الموظفين</span>`;
        } else if (task.assignType === 'department') {
            assigneesEl.innerHTML = `<span class="badge" style="background: rgba(139,92,246,0.1); color: #8b5cf6;"><i class="fas fa-building"></i> قسم ${task.department}</span>`;
        } else {
            const team = Store.get('team') || [];
            const assignedUsers = team.filter(m => task.assignees?.includes(m.id));
            if (assignedUsers.length > 0) {
                assigneesEl.innerHTML = assignedUsers.map(u => `
                    <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.25rem 0.75rem 0.25rem 0.25rem; border-radius: 20px;">
                        <img src="${u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=333&color=fff`}" style="width: 24px; height: 24px; border-radius: 50%;">
                        <span style="font-size: 0.8rem;">${u.name}</span>
                    </div>
                `).join('');
            } else {
                assigneesEl.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.85rem;">غير محدد</span>';
            }
        }

        // Subtasks
        const stList = document.getElementById('view-task-subtasks-list');
        if (task.subtasks && task.subtasks.length > 0) {
            document.getElementById('view-task-subtasks-section').style.display = 'block';
            stList.innerHTML = task.subtasks.map((st, idx) => `
                <div style="display: flex; align-items: center; gap: 0.75rem; background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: var(--radius-sm);">
                    <input type="checkbox" ${st.done ? 'checked' : ''} onchange="TasksManager.toggleSubtaskViewed(${idx})" style="accent-color: var(--primary-color); width: 18px; height: 18px; cursor: pointer;">
                    <span style="font-size: 0.95rem; text-decoration: ${st.done ? 'line-through' : 'none'}; color: ${st.done ? 'var(--text-secondary)' : 'var(--text-primary)'}">${st.title}</span>
                </div>
            `).join('');
        } else {
            document.getElementById('view-task-subtasks-section').style.display = 'none';
        }

        // Attachments
        const attList = document.getElementById('view-task-attachments-list');
        if (task.attachments && task.attachments.length > 0) {
            document.getElementById('view-task-attachments-section').style.display = 'block';
            attList.innerHTML = task.attachments.map(att => `
                <a href="${att.data}" download="${att.name}" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: var(--radius-sm); color: var(--text-primary); text-decoration: none; border: 1px solid rgba(255,255,255,0.1); transition: all 0.2s;">
                    <i class="${att.type.startsWith('image/') ? 'fas fa-image text-primary' : 'fas fa-file-alt text-secondary'}"></i>
                    <span style="font-size: 0.85rem; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${att.name}</span>
                    <i class="fas fa-download" style="margin-inline-start: 0.5rem; font-size: 0.7rem; color: var(--text-secondary);"></i>
                </a>
            `).join('');
        } else {
            document.getElementById('view-task-attachments-section').style.display = 'none';
        }

        TasksManager.renderComments();
        modal.classList.remove('hidden');
    },

    quickUpdateProgress: () => {
        if (!TasksManager.currentViewedTask) return;
        const val = parseInt(document.getElementById('quick-progress-update').value);
        
        let tasks = Store.get('tasks');
        const idx = tasks.findIndex(t => t.id === TasksManager.currentViewedTask.id);
        if (idx > -1) {
            tasks[idx].progress = val;
            if (val === 100) {
                tasks[idx].status = 'review'; // Send to review for admin instead of instant done
                AuthManager.showToast('تم إرسال المهمة للمراجعة!');
            } else if (tasks[idx].status === 'todo' && val > 0) {
                tasks[idx].status = 'inprogress';
            }
            Store.set('tasks', tasks);
            TasksManager.render();
            TasksManager.viewTask(tasks[idx].id); // refresh
        }
    },

    toggleSubtaskViewed: (idx) => {
        if (!TasksManager.currentViewedTask) return;
        let tasks = Store.get('tasks');
        const tIdx = tasks.findIndex(t => t.id === TasksManager.currentViewedTask.id);
        if (tIdx > -1) {
            tasks[tIdx].subtasks[idx].done = !tasks[tIdx].subtasks[idx].done;
            Store.set('tasks', tasks);
            TasksManager.render();
            TasksManager.viewTask(tasks[tIdx].id); // refresh modal
        }
    },

    /* ─── COMMENTS & ACTIVITY ──────────────────────────────── */

    renderComments: () => {
        const feed = document.getElementById('view-task-activity-feed');
        const task = TasksManager.currentViewedTask;
        if (!task || !task.comments) {
            feed.innerHTML = '<div style="text-align:center; color:var(--text-secondary); font-size:0.85rem; margin-top:2rem;">لا توجد تعليقات بعد.</div>';
            return;
        }

        if (task.comments.length === 0) {
            feed.innerHTML = '<div style="text-align:center; color:var(--text-secondary); font-size:0.85rem; margin-top:2rem;">كن أول من يعلق على هذه المهمة.</div>';
            return;
        }

        const team = Store.get('team') || [];
        feed.innerHTML = task.comments.map(c => {
            const u = team.find(m => m.id === c.senderId);
            const avatar = u?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.senderName)}&background=333&color=fff`;
            const isMe = c.senderId === AuthManager.currentUser.id;
            
            return `
                <div style="display: flex; gap: 0.75rem; flex-direction: ${isMe ? 'row-reverse' : 'row'};">
                    <img src="${avatar}" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.1);">
                    <div style="max-width: 80%;">
                        <div style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'}; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span style="font-size: 0.75rem; font-weight: bold; color: ${isMe ? 'var(--primary-color)' : 'var(--text-secondary)'};">${isMe ? 'أنت' : c.senderName}</span>
                            <span style="font-size: 0.65rem; color: rgba(255,255,255,0.3);">${new Date(c.timestamp).toLocaleString('ar-EG', {hour:'2-digit', minute:'2-digit', day:'numeric', month:'short'})}</span>
                        </div>
                        <div style="background: ${isMe ? 'rgba(37,99,235,0.2)' : 'rgba(0,0,0,0.3)'}; border: 1px solid ${isMe ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.05)'}; padding: 0.75rem 1rem; border-radius: 12px; ${isMe ? 'border-top-right-radius: 0' : 'border-top-left-radius: 0'}; font-size: 0.9rem; line-height: 1.5; color: var(--text-primary); white-space: pre-wrap;">${c.content}</div>
                        ${c.attachment ? `
                            <div style="margin-top: 0.5rem; text-align: ${isMe ? 'right' : 'left'};">
                                <img src="${c.attachment}" style="max-width: 150px; max-height: 150px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        feed.scrollTop = feed.scrollHeight;
    },

    addComment: () => {
        if (!TasksManager.currentViewedTask) return;
        const input = document.getElementById('task-comment-input');
        const content = input.value.trim();
        const fileInput = document.getElementById('comment-attachment');
        
        if (!content && (!fileInput.files || fileInput.files.length === 0)) return;

        const processComment = (attData) => {
            let tasks = Store.get('tasks');
            const idx = tasks.findIndex(t => t.id === TasksManager.currentViewedTask.id);
            if (idx > -1) {
                if (!tasks[idx].comments) tasks[idx].comments = [];
                tasks[idx].comments.push({
                    id: 'msg_' + Date.now(),
                    senderId: AuthManager.currentUser.id,
                    senderName: AuthManager.currentUser.name,
                    content: content,
                    attachment: attData,
                    timestamp: new Date().toISOString()
                });
                Store.set('tasks', tasks);
                TasksManager.currentViewedTask = tasks[idx]; // update local ref
                input.value = '';
                fileInput.value = ''; // clear
                TasksManager.renderComments();
                
                // Add activity log system wide if needed
                Store.log('Task Comment', `علق على مهمة: ${tasks[idx].title}`);
            }
        };

        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            if (!file.type.startsWith('image/')) {
                AuthManager.showToast('عذراً، يمكنك إرفاق صور فقط في التعليقات السريعة.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => processComment(e.target.result);
            reader.readAsDataURL(file);
        } else {
            processComment(null);
        }
    },

    /* ─── UTILS ───────────────────────────────────────────── */

    celebrate: () => {
        if (typeof confetti === 'undefined') return;
        confetti({ origin: { y: 0.7 }, particleCount: 150, spread: 80 });
    }
};

window.TasksManager = TasksManager;
document.addEventListener('DOMContentLoaded', TasksManager.init);
