// Tasks Management
const TasksManager = {
    init: () => {
        TasksManager.render();
        TasksManager.bindEvents();
    },

    bindEvents: () => {
        const btnAdd = document.getElementById('btn-add-task');
        const modal = document.getElementById('task-modal');
        const viewModal = document.getElementById('task-view-modal');
        if (!modal || !btnAdd || !viewModal) {
            console.warn('TasksManager: Required DOM elements not found.');
            return;
        }
        const btnClose = modal.querySelector('.close-modal');
        const btnCancel = modal.querySelector('.cancel-modal');
        
        const btnCloseView = viewModal.querySelector('.close-modal');
        const btnCancelView = viewModal.querySelector('.cancel-modal');
        const btnEditView = document.getElementById('btn-edit-viewed-task');

        const openModal = () => {
            document.getElementById('task-id').value = '';
            document.getElementById('task-title').value = '';
            document.getElementById('task-desc').value = '';
            document.getElementById('task-priority').value = 'medium';
            document.getElementById('task-status').value = 'todo';
            document.getElementById('task-deadline').value = '';
            document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-plus-circle"></i> إضافة مهمة جديدة';
            TasksManager.currentSubtasks = [];
            TasksManager.renderSubtasksEditor();
            modal.classList.remove('hidden');
        };

        const closeModal = () => modal.classList.add('hidden');
        if (btnAdd) btnAdd.addEventListener('click', openModal);
        if (btnClose) btnClose.addEventListener('click', closeModal);
        if (btnCancel) btnCancel.addEventListener('click', closeModal);

        if (btnCloseView) btnCloseView.addEventListener('click', () => viewModal.classList.add('hidden'));
        if (btnCancelView) btnCancelView.addEventListener('click', () => viewModal.classList.add('hidden'));
        if (btnEditView) {
            btnEditView.addEventListener('click', () => {
                const id = btnEditView.dataset.id;
                viewModal.classList.add('hidden');
                TasksManager.editTask(id);
            });
        }

        const btnAddSubtask = document.getElementById('btn-add-subtask');
        if (btnAddSubtask) {
            btnAddSubtask.addEventListener('click', () => {
                const input = document.getElementById('new-subtask-input');
                if (!input) return;
                const title = input.value.trim();
                if(title) {
                    TasksManager.currentSubtasks.push({ title, done: false });
                    input.value = '';
                    TasksManager.renderSubtasksEditor();
                }
            });
        }
        const btnSave = document.getElementById('save-task');
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                const idEl = document.getElementById('task-id');
                const titleEl = document.getElementById('task-title');
                if (!titleEl) return;
                
                const id = idEl ? idEl.value : '';
                const title = titleEl.value.trim();
                if(!title) { showAlert('Title is required!'); return; }

                const task = {
                    id: id || Date.now().toString(),
                    title: title,
                    desc: document.getElementById('task-desc')?.value || '',
                    priority: document.getElementById('task-priority')?.value || 'medium',
                    status: document.getElementById('task-status')?.value || 'todo',
                    deadline: document.getElementById('task-deadline')?.value || '',
                    subtasks: TasksManager.currentSubtasks || [],
                    isRunning: false
                };

                const tasks = Store.get('tasks') || [];
                if(id) {
                    const index = tasks.findIndex(t => t.id === id);
                    if(index > -1) tasks[index] = task;
                } else {
                    tasks.push(task);
                }

                Store.set('tasks', tasks);
                closeModal();
                TasksManager.render();
                if(typeof App !== 'undefined') App.updateDashboardStats();
            });
        }


        // Setup drop zones once
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
    },

    currentSubtasks: [],

    renderSubtasksEditor: () => {
        const container = document.getElementById('subtasks-container');
        if (!container) return;
        container.innerHTML = '';
        TasksManager.currentSubtasks.forEach((st, idx) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.background = 'var(--bg-secondary)';
            div.style.padding = '0.5rem';
            div.style.borderRadius = 'var(--radius-sm)';
            div.innerHTML = `
                <span style="text-decoration: ${st.done ? 'line-through' : 'none'}">${st.title}</span>
                <div>
                    <button type="button" class="btn btn-icon" onclick="TasksManager.toggleSubtaskEditor(${idx})" style="color: ${st.done ? 'var(--success)' : 'var(--text-secondary)'}"><i class="fas fa-check-circle"></i></button>
                    <button type="button" class="btn btn-icon" onclick="TasksManager.removeSubtaskEditor(${idx})" style="color: var(--danger)"><i class="fas fa-trash"></i></button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    toggleSubtaskEditor: (idx) => {
        TasksManager.currentSubtasks[idx].done = !TasksManager.currentSubtasks[idx].done;
        TasksManager.renderSubtasksEditor();
    },

    removeSubtaskEditor: (idx) => {
        TasksManager.currentSubtasks.splice(idx, 1);
        TasksManager.renderSubtasksEditor();
    },


    toggleSubtaskInCard: (taskId, subtaskIdx) => {
        let tasks = Store.get('tasks') || [];
        const task = tasks.find(t => t.id === taskId);
        if(task && task.subtasks && task.subtasks[subtaskIdx]) {
            task.subtasks[subtaskIdx].done = !task.subtasks[subtaskIdx].done;
            Store.set('tasks', tasks);
            TasksManager.render();
        }
    },

    toggleSection: (status) => {
        const list = document.getElementById(`${status}-list`);
        const header = list.previousElementSibling;
        const arrow = header.querySelector('.section-arrow');
        
        const isActive = list.classList.contains('active');
        
        // Toggle current
        if (isActive) {
            list.classList.remove('active');
            arrow.style.transform = 'rotate(0deg)';
        } else {
            list.classList.add('active');
            arrow.style.transform = 'rotate(180deg)';
        }
    },

    render: () => {
        const tasks = Store.get('tasks') || [];
        
        const todoList = document.getElementById('todo-list');
        const inprogressList = document.getElementById('inprogress-list');
        const doneList = document.getElementById('done-list');
        
        todoList.innerHTML = '';
        inprogressList.innerHTML = '';
        doneList.innerHTML = '';

        let counts = { todo: 0, inprogress: 0, done: 0 };

        tasks.forEach(task => {
            counts[task.status] = (counts[task.status] || 0) + 1;
            
            const card = document.createElement('div');
            card.className = 'task-card';
            card.draggable = true;
            card.dataset.id = task.id;
            card.onclick = (e) => {
                // Don't open modal if clicking on buttons or checkboxes
                if (e.target.closest('.task-actions') || e.target.closest('.subtask-item') || e.target.type === 'checkbox') return;
                TasksManager.viewTask(task.id);
            };
            
            card.innerHTML = `
                <div class="task-card-header">
                    <h4>${task.title}</h4>
                    <div class="task-actions">
                        <button class="edit-task" onclick="event.stopPropagation(); TasksManager.editTask('${task.id}')"><i class="fas fa-edit"></i></button>
                        <button class="delete-task" onclick="event.stopPropagation(); TasksManager.deleteTask('${task.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="task-card-footer">
                    <span class="priority-badge priority-${task.priority}">${TasksManager.getPriorityLabel(task.priority)}</span>
                    ${task.deadline ? `<span class="task-deadline-pill"><i class="far fa-clock"></i> ${task.deadline}</span>` : ''}
                </div>
            `;

            if(task.status === 'todo') todoList.appendChild(card);
            else if(task.status === 'inprogress') inprogressList.appendChild(card);
            else doneList.appendChild(card);

            // Drag events
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', task.id);
                setTimeout(() => card.style.opacity = '0.5', 0);
            });
            card.addEventListener('dragend', () => card.style.opacity = '1');
        });

        document.getElementById('count-todo').textContent = counts.todo;
        document.getElementById('count-inprogress').textContent = counts.inprogress;
        document.getElementById('count-done').textContent = counts.done;
    },

    viewTask: (id) => {
        const tasks = Store.get('tasks') || [];
        const task = tasks.find(t => t.id === id);
        if(!task) return;

        const modal = document.getElementById('task-view-modal');
        const titleEl = document.getElementById('view-task-title');
        const bodyEl = document.getElementById('view-task-body');
        const editBtn = document.getElementById('btn-edit-viewed-task');

        titleEl.textContent = task.title;
        editBtn.dataset.id = task.id;

        bodyEl.innerHTML = `
            <div class="view-item">
                <label>الوصف:</label>
                <p>${task.desc || 'لا يوجد وصف'}</p>
            </div>
            <div class="view-row">
                <div class="view-item">
                    <label>الأولوية:</label>
                    <span class="priority-badge priority-${task.priority}">${TasksManager.getPriorityLabel(task.priority)}</span>
                </div>
                <div class="view-item">
                    <label>الموعد النهائي:</label>
                    <span>${task.deadline || 'غير محدد'}</span>
                </div>
            </div>
            ${task.subtasks && task.subtasks.length > 0 ? `
            <div class="view-item">
                <label>المهام الفرعية (${task.subtasks.filter(s=>s.done).length}/${task.subtasks.length}):</label>
                <div class="view-subtasks">
                    ${task.subtasks.map((st, i) => `
                        <div class="subtask-item">
                            <input type="checkbox" ${st.done ? 'checked' : ''} onclick="TasksManager.toggleSubtaskInCard('${task.id}', ${i}); TasksManager.viewTask('${task.id}')">
                            <span style="text-decoration: ${st.done ? 'line-through' : 'none'}">${st.title}</span>
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}
        `;

        modal.classList.remove('hidden');
    },

    editTask: (id) => {
        const tasks = Store.get('tasks');
        const task = tasks.find(t => t.id === id);
        if(!task) return;

        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.desc;
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-status').value = task.status;
        document.getElementById('task-deadline').value = task.deadline || '';
        
        TasksManager.currentSubtasks = task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : [];
        TasksManager.renderSubtasksEditor();

        document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-edit"></i> تعديل المهمة';
        document.getElementById('task-modal').classList.remove('hidden');
    },

    getPriorityLabel: (p) => {
        const labels = { 'low': 'منخفضة', 'medium': 'متوسطة', 'high': 'عالية' };
        return labels[p] || p;
    },

    deleteTask: (id) => {
        askConfirm('هل أنت متأكد من حذف هذه المهمة؟', () => {
            let tasks = Store.get('tasks');
            tasks = tasks.filter(t => t.id !== id);
            Store.set('tasks', tasks);
            TasksManager.render();
            if(typeof App !== 'undefined') App.updateDashboardStats();
        });
    },

    updateTaskStatus: (id, status) => {
        let tasks = Store.get('tasks');
        const index = tasks.findIndex(t => t.id === id);
        if(index > -1) {
            tasks[index].status = status;
            Store.set('tasks', tasks);
            TasksManager.render();
            if(typeof App !== 'undefined') App.updateDashboardStats();
            
            if (status === 'done') {
                TasksManager.celebrate();
                NotificationManager.add(`🎉 Task Completed: ${tasks[index].title}`, 'fa-trophy', 'task');
            }
        }
    },

    celebrate: () => {
        const count = 200;
        const defaults = { origin: { y: 0.7 } };

        function fire(particleRatio, opts) {
            if (typeof confetti === 'undefined') return;
            confetti({
                ...defaults,
                ...opts,
                particleCount: Math.floor(count * particleRatio)
            });
        }

        fire(0.25, { spread: 26, startVelocity: 55 });
        fire(0.2, { spread: 60 });
        fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
        fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
        fire(0.1, { spread: 120, startVelocity: 45 });
    },

    filterTasks: (query) => {
        const tasks = Store.get('tasks') || [];
        const filtered = tasks.filter(t => 
            t.title.toLowerCase().includes(query) || 
            (t.desc && t.desc.toLowerCase().includes(query))
        );
        
        // Re-render only filtered tasks
        const todoList = document.getElementById('todo-list');
        const inprogressList = document.getElementById('inprogress-list');
        const doneList = document.getElementById('done-list');
        
        todoList.innerHTML = '';
        inprogressList.innerHTML = '';
        doneList.innerHTML = '';

        filtered.forEach(task => {
            const card = document.createElement('div');
            card.className = 'task-card';
            card.draggable = true;
            card.dataset.id = task.id;
            
            card.innerHTML = `
                <h4>${task.title}</h4>
                <p>${task.desc || (typeof LangManager !== 'undefined' ? LangManager.t('No description') : 'No description')}</p>
                <div class="task-meta" style="margin-top: 0.5rem;">
                    <span class="priority-badge priority-${task.priority}">${typeof LangManager !== 'undefined' ? LangManager.t(task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) : task.priority}</span>
                    <div class="task-actions">
                        <button class="edit-task" onclick="TasksManager.editTask('${task.id}')"><i class="fas fa-edit"></i></button>
                        <button class="delete-task" onclick="TasksManager.deleteTask('${task.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;

            if(task.status === 'todo') todoList.appendChild(card);
            else if(task.status === 'inprogress') inprogressList.appendChild(card);
            else doneList.appendChild(card);
        });
    }
};
