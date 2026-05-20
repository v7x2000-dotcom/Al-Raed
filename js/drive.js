/**
 * Al-Raed Platform - Cloud Drive Manager v2.0
 * Features: Subfolders, Category Access Permissions
 */
const DriveManager = {
    currentCategory: 'all',
    currentSubFolder: null,
    viewMode: 'grid',
    pendingFileRaw: null,
    searchTerm: '',

    categories: [
        { id: 'all',       name: 'كل الملفات',         icon: 'fa-folder-open' },
        { id: 'general',   name: 'عام (General)',        icon: 'fa-folder' },
        { id: 'finance',   name: 'المالية والمحاسبة',   icon: 'fa-file-invoice-dollar' },
        { id: 'contracts', name: 'عقود واتفاقيات',      icon: 'fa-file-signature' },
        { id: 'hr',        name: 'الموارد البشرية',      icon: 'fa-users' },
        { id: 'designs',   name: 'صور وتصميمات',        icon: 'fa-images' }
    ],

    /* ─── Permissions ─────────────────────── */
    getCatSettings: () => Store.get('drive_cat_settings') || {},

    canAccess: (catId) => {
        if (catId === 'all') return true;
        const me = AuthManager?.currentUser;
        if (!me) return false;
        if (me.role === 'Super Admin' || me.role === 'Manager') return true;
        const s = DriveManager.getCatSettings()[catId];
        if (!s || !s.restricted) return true;
        return (s.allowedUsers || []).includes(me.id || me.email);
    },

    isAdmin: () => {
        const me = AuthManager?.currentUser;
        return me?.role === 'Super Admin' || me?.role === 'Manager';
    },

    showPrompt: (message, defaultValue, callback) => {
        const modal = document.createElement('div');
        modal.className = 'modal drive-custom-modal';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>${message}</h3>
                    <button class="close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <input type="text" id="drive-prompt-input" class="select-modern" value="${defaultValue || ''}" style="width: 100%; box-sizing: border-box;" />
                </div>
                <div class="modal-footer">
                    <button class="btn-glass-cancel" id="drive-prompt-cancel">إلغاء</button>
                    <button class="btn-glow-action" id="drive-prompt-ok">موافق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector('#drive-prompt-input');
        input.focus();
        if (defaultValue) input.select();
        const close = () => modal.remove();
        const submit = () => { const val = input.value; close(); callback(val); };
        modal.querySelector('.close-modal').onclick = close;
        modal.querySelector('#drive-prompt-cancel').onclick = close;
        modal.querySelector('#drive-prompt-ok').onclick = submit;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') close();
        };
    },

    showConfirm: (message, callback) => {
        const modal = document.createElement('div');
        modal.className = 'modal drive-custom-modal';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>تأكيد</h3>
                    <button class="close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-secondary); font-size: 1.05rem; line-height: 1.5;">${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn-glass-cancel" id="drive-confirm-cancel">إلغاء</button>
                    <button class="btn-glow-action" id="drive-confirm-ok" style="background: var(--danger); box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);">تأكيد</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        const submit = () => { close(); callback(true); };
        modal.querySelector('.close-modal').onclick = close;
        modal.querySelector('#drive-confirm-cancel').onclick = close;
        modal.querySelector('#drive-confirm-ok').onclick = submit;
    },

    showPermModal: (catId) => {
        const cat = DriveManager.categories.find(c => c.id === catId);
        if (!cat || catId === 'all') return;
        const team = Store.get('team') || [];
        const s = DriveManager.getCatSettings()[catId] || { restricted: false, allowedUsers: [] };

        const existing = document.getElementById('drive-perm-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'drive-perm-modal';
        modal.className = 'modal';
        modal.innerHTML = `
        <div class="modal-content glass-effect" style="max-width:480px;">
            <div class="modal-header">
                <h2><i class="fas fa-lock"></i> صلاحيات: ${cat.name}</h2>
                <button class="close-modal" onclick="document.getElementById('drive-perm-modal').remove()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <label style="display:flex;align-items:center;gap:10px;margin-bottom:1rem;cursor:pointer;">
                    <input type="checkbox" id="perm-restricted" ${s.restricted ? 'checked' : ''} style="width:18px;height:18px;">
                    <span>تقييد الوصول (أخفِ عن غير المصرح لهم)</span>
                </label>
                <div id="perm-users-list" style="${s.restricted ? '' : 'display:none;'}">
                    <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;">اختر أعضاء الفريق المسموح لهم بالوصول:</p>
                    ${team.map(m => `
                    <label style="display:flex;align-items:center;gap:8px;padding:0.5rem;border-radius:8px;cursor:pointer;margin-bottom:4px;background:var(--bg-primary);">
                        <input type="checkbox" value="${m.id || m.email}" ${(s.allowedUsers||[]).includes(m.id || m.email) ? 'checked' : ''}>
                        <span style="font-size:0.9rem;">${m.name} <span style="color:var(--text-secondary);font-size:0.75rem;">${m.jobLevel||''}</span></span>
                    </label>`).join('')}
                </div>
                <button class="btn btn-primary" style="margin-top:1rem;width:100%;" onclick="DriveManager.savePermissions('${catId}')">
                    <i class="fas fa-save"></i> حفظ الصلاحيات
                </button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        document.getElementById('perm-restricted').addEventListener('change', function() {
            document.getElementById('perm-users-list').style.display = this.checked ? '' : 'none';
        });
    },

    savePermissions: (catId) => {
        const restricted = document.getElementById('perm-restricted').checked;
        const checks = document.querySelectorAll('#perm-users-list input[type=checkbox]:checked');
        const allowedUsers = Array.from(checks).map(c => c.value);
        const all = DriveManager.getCatSettings();
        all[catId] = { restricted, allowedUsers };
        Store.set('drive_cat_settings', all);
        document.getElementById('drive-perm-modal').remove();
        DriveManager.render();
        if (window.showToast) showToast('تم حفظ الصلاحيات بنجاح', 'success');
    },

    /* ─── Subfolders ──────────────────────── */
    getSubFolders: (catId) => {
        return (Store.get('drive_subfolders') || []).filter(sf => sf.parentCategory === catId);
    },

    createSubFolder: () => {
        const catId = DriveManager.currentCategory;
        if (catId === 'all') { if(window.showToast) showToast('اختر فولدر رئيسي أولاً','warning'); return; }
        DriveManager.showPrompt('اسم المجلد الفرعي الجديد:', '', (name) => {
            if (!name || !name.trim()) return;
            const all = Store.get('drive_subfolders') || [];
            const me = AuthManager?.currentUser;
            all.push({ id: 'sf_' + Date.now(), name: name.trim(), parentCategory: catId, createdAt: new Date().toISOString(), createdBy: me?.name || 'Admin' });
            Store.set('drive_subfolders', all);
            DriveManager.render();
        });
    },

    deleteSubFolder: (sfId) => {
        DriveManager.showConfirm('حذف هذا المجلد الفرعي؟ ستُنقل ملفاته للفولدر الرئيسي.', () => {
            const subs = (Store.get('drive_subfolders') || []).filter(sf => sf.id !== sfId);
            Store.set('drive_subfolders', subs);
            const meta = DriveManager.getFilesMeta().map(f => f.subFolder === sfId ? { ...f, subFolder: null } : f);
            Store.set('cloud_drive_meta', meta);
            if (DriveManager.currentSubFolder === sfId) DriveManager.currentSubFolder = null;
            DriveManager.render();
        });
    },

    /* ─── Core ────────────────────────────── */
    setViewMode: (mode) => {
        DriveManager.viewMode = mode;
        const g = document.getElementById('view-grid-btn');
        const l = document.getElementById('view-list-btn');
        if (g) g.classList.toggle('active', mode === 'grid');
        if (l) l.classList.toggle('active', mode === 'list');
        DriveManager.render();
    },

    init: () => {
        window.addEventListener('storeUpdated', (e) => {
            if (e.detail?.key === 'cloud_drive_meta') DriveManager.render();
        });
        const uploadInput = document.getElementById('drive-upload-input');
        if (uploadInput) uploadInput.addEventListener('change', DriveManager.handleFileInput);
        const dropZone = document.getElementById('drive-drop-zone');
        if (dropZone) {
            ['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
            ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('drag-active')));
            ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-active')));
            dropZone.addEventListener('drop', (e) => {
                const files = e.dataTransfer?.files;
                if (files?.length) DriveManager.handleFileInput({ target: { files } });
            });
        }
        DriveManager.render();
    },

    handleSearch: (term) => { DriveManager.searchTerm = term.toLowerCase(); DriveManager.render(); },
    getFilesMeta: () => Store.get('cloud_drive_meta') || [],

    setCategory: (catId) => {
        if (!DriveManager.canAccess(catId)) return;
        DriveManager.currentCategory = catId;
        DriveManager.currentSubFolder = null;
        DriveManager.render();
    },

    setSubFolder: (sfId) => {
        DriveManager.currentSubFolder = sfId;
        DriveManager.render();
    },

    showUploadModal: () => {
        const modal = document.getElementById('drive-upload-modal');
        if (modal) {
            DriveManager._populateUploadSubFolders();
            modal.classList.remove('hidden');
        }
    },

    _populateUploadSubFolders: () => {
        const catSel = document.getElementById('drive-upload-category');
        const sfSel = document.getElementById('drive-upload-subfolder');
        if (!catSel || !sfSel) return;

        const updateSubs = () => {
            const cat = catSel.value;
            const subs = DriveManager.getSubFolders(cat);
            sfSel.innerHTML = '<option value="">— بدون مجلد فرعي —</option>' +
                subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            if (DriveManager.currentSubFolder && DriveManager.currentCategory === cat) {
                sfSel.value = DriveManager.currentSubFolder;
            }
        };
        catSel.removeEventListener('change', updateSubs);
        catSel.addEventListener('change', updateSubs);
        if (DriveManager.currentCategory !== 'all') catSel.value = DriveManager.currentCategory;
        updateSubs();
    },

    handleFileInput: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 100 * 1024 * 1024) { showAlert('حجم الملف كبير جداً. الحد الأقصى 100MB'); e.target.value = ''; return; }
        DriveManager.pendingFileRaw = file;
        const el = document.getElementById('drive-selected-file-name');
        if (el) el.textContent = file.name;
    },

    confirmUpload: () => {
        const file = DriveManager.pendingFileRaw;
        if (!file) { showAlert('يرجى اختيار ملف أولاً'); return; }
        const category = document.getElementById('drive-upload-category')?.value || 'general';
        const subFolder = document.getElementById('drive-upload-subfolder')?.value || null;
        const user = AuthManager?.currentUser || { name: 'Admin' };
        const fileId = 'file_' + Date.now();
        const totalMB = (file.size / (1024 * 1024)).toFixed(2);

        document.getElementById('drive-upload-modal').classList.add('hidden');
        DriveManager.showUploadProgress(file.name, totalMB);

        const reader = new FileReader();
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                DriveManager.updateUploadProgress(pct, (e.loaded/(1024*1024)).toFixed(2), totalMB, file.name);
            }
        };
        reader.onload = (event) => {
            DriveManager.updateUploadProgress(100, totalMB, totalMB, file.name);
            const meta = { id: fileId, name: file.name, type: file.type, size: file.size, category, subFolder: subFolder || null, uploadDate: new Date().toISOString(), uploadedBy: user.name };
            const allMeta = DriveManager.getFilesMeta();
            allMeta.unshift(meta);
            Store.set('cloud_drive_meta', allMeta);
            Store.set(fileId, event.target.result);
            DriveManager.pendingFileRaw = null;
            const el = document.getElementById('drive-selected-file-name');
            if (el) el.textContent = 'لم يتم اختيار ملف';
            setTimeout(() => {
                DriveManager.hideUploadProgress();
                if (window.Notifications) Notifications.add('نجاح', `تم رفع "${file.name}" بنجاح ✓`, 'success');
                DriveManager.render();
            }, 800);
        };
        reader.readAsDataURL(file);
    },

    showUploadProgress: (fileName, totalMB) => {
        let bar = document.getElementById('drive-upload-progress-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'drive-upload-progress-bar';
            bar.innerHTML = `<div class="dupb-inner"><div class="dupb-icon"><i class="fas fa-cloud-upload-alt"></i></div><div class="dupb-info"><div class="dupb-name" id="dupb-filename"></div><div class="dupb-track"><div class="dupb-fill" id="dupb-fill"></div></div><div class="dupb-stats" id="dupb-stats"></div></div><div class="dupb-pct" id="dupb-pct">0%</div></div>`;
            document.body.appendChild(bar);
        }
        document.getElementById('dupb-filename').textContent = fileName;
        document.getElementById('dupb-fill').style.width = '0%';
        document.getElementById('dupb-stats').textContent = `0.00 MB / ${totalMB} MB`;
        document.getElementById('dupb-pct').textContent = '0%';
        bar.classList.add('visible');
    },

    updateUploadProgress: (pct, loadedMB, totalMB) => {
        const fill = document.getElementById('dupb-fill');
        const stats = document.getElementById('dupb-stats');
        const pctEl = document.getElementById('dupb-pct');
        if (fill) fill.style.width = pct + '%';
        if (stats) stats.textContent = `${loadedMB} MB / ${totalMB} MB`;
        if (pctEl) pctEl.textContent = pct + '%';
    },

    hideUploadProgress: () => { const bar = document.getElementById('drive-upload-progress-bar'); if (bar) bar.classList.remove('visible'); },

    deleteFile: (fileId) => {
        DriveManager.showConfirm('هل أنت متأكد من حذف هذا الملف نهائياً؟', () => DriveManager.performDelete(fileId));
    },

    performDelete: (fileId) => {
        Store.set('cloud_drive_meta', DriveManager.getFilesMeta().filter(f => f.id !== fileId));
        Store.remove(fileId);
        DriveManager.render();
    },

    downloadFile: async (fileId, fileName) => {
        const data = Store.get(fileId);
        if (!data) { if (window.showToast) showToast('الملف غير موجود', 'error'); return; }
        try {
            let url = data;
            if (data.startsWith('data:')) {
                const arr = data.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]);
                let n = bstr.length; const u8 = new Uint8Array(n);
                while(n--) u8[n] = bstr.charCodeAt(n);
                url = URL.createObjectURL(new Blob([u8], { type: mime }));
            }
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.style.display = 'none';
            document.body.appendChild(a); a.click();
            setTimeout(() => { document.body.removeChild(a); if (url !== data) URL.revokeObjectURL(url); }, 100);
            if (window.showToast) showToast('جاري تحميل الملف...', 'success');
        } catch(e) { if (window.showToast) showToast('خطأ أثناء التحميل', 'error'); }
    },

    /* ─── Render ──────────────────────────── */
    render: () => {
        const grid = document.getElementById('drive-grid');
        const catList = document.getElementById('drive-categories');
        const currentTitle = document.getElementById('drive-current-category-title');
        const usageEl = document.getElementById('drive-usage');
        const usageBar = document.getElementById('drive-usage-bar');
        const usagePercent = document.getElementById('drive-usage-percent');
        if (!grid) return;

        const isAdmin = DriveManager.isAdmin();
        const allCats = DriveManager.categories.filter(c => DriveManager.canAccess(c.id));

        /* Sidebar categories */
        if (catList) {
            catList.innerHTML = allCats.map(c => `
                <li class="drive-cat-item ${DriveManager.currentCategory === c.id ? 'active' : ''}"
                    onclick="DriveManager.setCategory('${c.id}')">
                    <i class="fas ${c.icon}"></i>
                    <span>${c.name}</span>
                    ${isAdmin && c.id !== 'all' ? `<button class="drive-perm-btn" title="صلاحيات" onclick="event.stopPropagation();DriveManager.showPermModal('${c.id}')"><i class="fas fa-lock"></i></button>` : ''}
                </li>
            `).join('');
            const activeCat = allCats.find(c => c.id === DriveManager.currentCategory);
            if (currentTitle && activeCat) {
                if (DriveManager.currentSubFolder) {
                    const subs = DriveManager.getSubFolders(activeCat.id);
                    const sf = subs.find(s => s.id === DriveManager.currentSubFolder);
                    currentTitle.textContent = activeCat.name + (sf ? ` / ${sf.name}` : '');
                } else {
                    currentTitle.textContent = activeCat.name;
                }
            }
        }

        /* Sub-folder strip */
        let subFolderBar = document.getElementById('drive-subfolder-bar');
        if (!subFolderBar) {
            subFolderBar = document.createElement('div');
            subFolderBar.id = 'drive-subfolder-bar';
            grid.parentNode.insertBefore(subFolderBar, grid);
        }

        const cat = DriveManager.currentCategory;
        if (cat !== 'all') {
            const subs = DriveManager.getSubFolders(cat);
            subFolderBar.innerHTML = `
                <div class="drive-sf-bar">
                    <button class="drive-sf-item ${!DriveManager.currentSubFolder ? 'active' : ''}" onclick="DriveManager.setSubFolder(null)">
                        <i class="fas fa-folder-open"></i> كل الملفات
                    </button>
                    ${subs.map(sf => `
                    <div class="drive-sf-item-wrap">
                        <button class="drive-sf-item ${DriveManager.currentSubFolder === sf.id ? 'active' : ''}" onclick="DriveManager.setSubFolder('${sf.id}')">
                            <i class="fas fa-folder"></i> ${sf.name}
                        </button>
                        ${isAdmin ? `<button class="drive-sf-del" title="حذف" onclick="DriveManager.deleteSubFolder('${sf.id}')"><i class="fas fa-times"></i></button>` : ''}
                    </div>`).join('')}
                    ${isAdmin ? `<button class="drive-sf-add" onclick="DriveManager.createSubFolder()"><i class="fas fa-plus"></i> مجلد فرعي</button>` : ''}
                </div>`;
            subFolderBar.style.display = '';
        } else {
            subFolderBar.style.display = 'none';
        }

        /* Storage stats */
        const allMeta = DriveManager.getFilesMeta();
        let totalBytes = allMeta.reduce((s, f) => s + f.size, 0);
        const maxStorage = 15 * 1024 * 1024 * 1024;
        const usedText = totalBytes < 1024*1024 ? (totalBytes/1024).toFixed(0)+' KB' :
                         totalBytes < 1024*1024*1024 ? (totalBytes/(1024*1024)).toFixed(1)+' MB' :
                         (totalBytes/(1024*1024*1024)).toFixed(2)+' GB';
        const percent = Math.min(100, (totalBytes/maxStorage)*100);
        if (usageEl) usageEl.textContent = `${usedText} مستخدم من 15 GB`;
        if (usageBar) usageBar.style.width = `${percent}%`;
        if (usagePercent) usagePercent.textContent = `${percent.toFixed(1)}%`;
        const countEl = document.getElementById('drive-file-count');
        if (countEl) countEl.textContent = allMeta.length;

        /* Filter files */
        let files = allMeta;
        if (cat !== 'all') files = files.filter(f => f.category === cat);
        if (DriveManager.currentSubFolder) files = files.filter(f => f.subFolder === DriveManager.currentSubFolder);
        else if (cat !== 'all' && DriveManager.currentSubFolder === null) { /* show all files in category */ }
        if (DriveManager.searchTerm) files = files.filter(f => f.name.toLowerCase().includes(DriveManager.searchTerm));

        /* Render grid */
        grid.className = DriveManager.viewMode === 'grid' ? 'drive-grid' : 'drive-list';
        grid.innerHTML = '';

        if (!files.length) {
            grid.classList.add('is-empty');
            grid.innerHTML = `<div class="drive-empty-state"><div class="empty-icon-box"><i class="fas fa-cloud-upload-alt"></i><div class="icon-glow"></div></div><h3>سحابتك بانتظار ملفاتك</h3><p>ابدأ برفع ملفاتك الآن للوصول إليها من أي مكان وفي أي وقت</p></div>`;
            return;
        }
        grid.classList.remove('is-empty');

        files.forEach(file => {
            const isImage = file.type.startsWith('image/');
            const lastDot = file.name.lastIndexOf('.');
            const nameOnly = lastDot > 0 ? file.name.substring(0, lastDot) : file.name;
            const extOnly  = lastDot > 0 ? file.name.substring(lastDot+1).toUpperCase() : 'FILE';
            const icon = isImage ? 'fa-image' : file.type.includes('pdf') ? 'fa-file-pdf' : file.type.includes('video') ? 'fa-file-video' : file.type.includes('word') ? 'fa-file-word' : file.type.includes('excel')||file.type.includes('sheet') ? 'fa-file-excel' : 'fa-file-alt';
            const iconColor = isImage ? 'var(--primary-color)' : file.type.includes('pdf') ? '#ef4444' : file.type.includes('excel')||file.type.includes('sheet') ? '#10b981' : '#6366f1';
            let preview = `<i class="fas ${icon}" style="color:${iconColor}"></i>`;
            if (isImage) { const d = Store.get(file.id); if (d) preview = `<img src="${d}" alt="${file.name}">`; }

            const sfName = file.subFolder ? (DriveManager.getSubFolders(file.category).find(s => s.id === file.subFolder)?.name || '') : '';

            const card = document.createElement('div');
            card.className = 'drive-card';
            card.innerHTML = `
                <div class="dc-icon-panel" style="background:${iconColor}18;border-left:2px solid ${iconColor}40;">
                    <div class="dc-icon-wrap" style="color:${iconColor}">${preview}</div>
                </div>
                <div class="dc-info-panel">
                    <div class="dc-title-area"><p class="dc-name" title="${file.name}">${nameOnly}</p></div>
                    <div class="dc-details-grid">
                        <div class="dc-detail-item">
                            <span class="dc-ext-badge" style="background:${iconColor}25;color:${iconColor}">${extOnly}</span>
                            <span class="dc-detail-text"><i class="fas fa-hdd"></i> ${(file.size/1024).toFixed(0)} KB</span>
                        </div>
                        <div class="dc-detail-item">
                            <span class="dc-detail-text"><i class="far fa-calendar-alt"></i> ${new Date(file.uploadDate).toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'})}</span>
                        </div>
                        ${sfName ? `<div class="dc-detail-item" style="grid-column:1/-1;"><span class="dc-detail-text" style="color:#8b5cf6;"><i class="fas fa-folder"></i> ${sfName}</span></div>` : ''}
                    </div>
                </div>`;
            card.addEventListener('click', (e) => { e.stopPropagation(); DriveManager.showFilePopup(file, e.currentTarget); });
            grid.appendChild(card);
        });
    },

    showFilePopup: (file, cardEl) => {
        DriveManager.hideFilePopup();
        const isAdmin = DriveManager.isAdmin();
        const popup = document.createElement('div');
        popup.id = 'drive-file-popup';
        popup.innerHTML = `
            <div class="dfp-header"><i class="fas fa-file dfp-icon"></i><span class="dfp-name" title="${file.name}">${file.name}</span></div>
            <div class="dfp-actions">
                <button class="dfp-btn dfp-download" id="dfp-download-btn"><i class="fas fa-download"></i> تحميل</button>
                ${isAdmin ? `<button class="dfp-btn dfp-rename" id="dfp-rename-btn"><i class="fas fa-pen"></i> إعادة تسمية</button>` : ''}
                ${isAdmin ? `<button class="dfp-btn dfp-delete admin-only" id="dfp-delete-btn"><i class="fas fa-trash"></i> حذف</button>` : ''}
            </div>`;
        document.body.appendChild(popup);
        const rect = cardEl.getBoundingClientRect();
        const pH = popup.offsetHeight || 120; // fallback height if not rendered yet
        const vH = window.innerHeight;
        const sY = window.scrollY;
        let top = rect.bottom + sY + 8;
        if (rect.bottom + pH + 10 > vH) top = rect.top + sY - pH - 8;
        top = Math.max(sY+10, Math.min(top, sY+vH-pH-10));
        popup.style.top = top + 'px';
        popup.style.left = (rect.left + window.scrollX) + 'px';
        popup.querySelector('#dfp-download-btn').onclick = (e) => { e.stopPropagation(); DriveManager.downloadFile(file.id, file.name); DriveManager.hideFilePopup(); };
        const ren = popup.querySelector('#dfp-rename-btn');
        if (ren) ren.onclick = (e) => { e.stopPropagation(); DriveManager.renameFile(file.id, file.name); DriveManager.hideFilePopup(); };
        const del = popup.querySelector('#dfp-delete-btn');
        if (del) del.onclick = (e) => { e.stopPropagation(); DriveManager.deleteFile(file.id); DriveManager.hideFilePopup(); };
        popup.addEventListener('click', e => e.stopPropagation());
        const close = () => { DriveManager.hideFilePopup(); document.removeEventListener('click', close); };
        setTimeout(() => document.addEventListener('click', close), 10);
    },

    hideFilePopup: () => { const p = document.getElementById('drive-file-popup'); if (p) p.remove(); },

    renameFile: (fileId, oldName) => {
        const lastDot = oldName.lastIndexOf('.');
        const nameOnly = lastDot > 0 ? oldName.substring(0, lastDot) : oldName;
        const ext = lastDot > 0 ? oldName.substring(lastDot) : '';
        DriveManager.showPrompt('أدخل الاسم الجديد للملف:', nameOnly, (newName) => {
            if (!newName || !newName.trim() || newName.trim() === nameOnly) return;
            const meta = DriveManager.getFilesMeta();
            const file = meta.find(f => f.id === fileId);
            if (file) {
                file.name = newName.trim() + ext;
                Store.set('cloud_drive_meta', meta);
                DriveManager.render();
                if (window.showToast) showToast('تم تغيير اسم الملف بنجاح', 'success');
                else if (window.Notifications) Notifications.add('نجاح', 'تم تغيير اسم الملف بنجاح', 'success');
            }
        });
    }
};

window.DriveManager = DriveManager;
