/**
 * Al-Raed Platform - Cloud Drive Manager
 */
const DriveManager = {
    currentCategory: 'all',
    viewMode: 'grid', // 'grid' or 'list'
    pendingFiles: [],

    setViewMode: (mode) => {
        DriveManager.viewMode = mode;
        
        // Update UI buttons
        const gridBtn = document.getElementById('view-grid-btn');
        const listBtn = document.getElementById('view-list-btn');
        if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
        if (listBtn) listBtn.classList.toggle('active', mode === 'list');
        
        DriveManager.render();
    },

    categories: [
        { id: 'all', name: 'كل الملفات', icon: 'fa-folder-open' },
        { id: 'general', name: 'عام (General)', icon: 'fa-folder' },
        { id: 'finance', name: 'المالية والمحاسبة', icon: 'fa-file-invoice-dollar' },
        { id: 'contracts', name: 'عقود واتفاقيات', icon: 'fa-file-signature' },
        { id: 'hr', name: 'الموارد البشرية', icon: 'fa-users' },
        { id: 'designs', name: 'صور وتصميمات', icon: 'fa-images' }
    ],

    init: () => {
        window.addEventListener('storeUpdated', (e) => {
            if (e.detail?.key === 'cloud_drive_meta') {
                DriveManager.render();
            }
        });

        const uploadInput = document.getElementById('drive-upload-input');
        if (uploadInput) {
            uploadInput.addEventListener('change', DriveManager.handleFileInput);
        }

        // Drag and Drop Logic
        const dropZone = document.getElementById('drive-drop-zone');
        if (dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.add('drag-active');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.remove('drag-active');
                }, false);
            });

            dropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files && files.length > 0) {
                    DriveManager.handleFileInput({ target: { files: files } });
                }
            }, false);
        }
        
        DriveManager.render();
    },

    searchTerm: '',
    handleSearch: (term) => {
        DriveManager.searchTerm = term.toLowerCase();
        DriveManager.render();
    },

    getFilesMeta: () => {
        return Store.get('cloud_drive_meta') || [];
    },

    setCategory: (catId) => {
        DriveManager.currentCategory = catId;
        DriveManager.render();
    },

    showUploadModal: () => {
        const modal = document.getElementById('drive-upload-modal');
        if (modal) modal.classList.remove('hidden');
    },

    handleFileInput: (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 100 * 1024 * 1024) {
            showAlert('حجم الملف كبير جداً. الحد الأقصى 100MB للملف الواحد');
            e.target.value = '';
            return;
        }

        // Store file reference for confirmUpload
        DriveManager.pendingFileRaw = file;
        document.getElementById('drive-selected-file-name').textContent = file.name;
    },

    confirmUpload: () => {
        const file = DriveManager.pendingFileRaw;
        if (!file) {
            showAlert('يرجى اختيار ملف أولاً');
            return;
        }

        const category = document.getElementById('drive-upload-category').value;
        const user = Store.get('currentUser') || { name: 'Admin' };
        const fileId = 'file_' + Date.now();
        const totalMB = (file.size / (1024 * 1024)).toFixed(2);

        // Close modal immediately
        document.getElementById('drive-upload-modal').classList.add('hidden');

        // Show progress bar
        DriveManager.showUploadProgress(file.name, totalMB);

        const reader = new FileReader();

        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                const loadedMB = (e.loaded / (1024 * 1024)).toFixed(2);
                DriveManager.updateUploadProgress(pct, loadedMB, totalMB, file.name);
            }
        };

        reader.onload = (event) => {
            DriveManager.updateUploadProgress(100, totalMB, totalMB, file.name);

            const meta = {
                id: fileId,
                name: file.name,
                type: file.type,
                size: file.size,
                category: category,
                uploadDate: new Date().toISOString(),
                uploadedBy: user.name
            };

            const allMeta = DriveManager.getFilesMeta();
            allMeta.unshift(meta);
            Store.set('cloud_drive_meta', allMeta);
            Store.set(fileId, event.target.result);

            DriveManager.pendingFileRaw = null;
            document.getElementById('drive-selected-file-name').textContent = 'لم يتم اختيار ملف';

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
            bar.innerHTML = `
                <div class="dupb-inner">
                    <div class="dupb-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                    <div class="dupb-info">
                        <div class="dupb-name" id="dupb-filename"></div>
                        <div class="dupb-track">
                            <div class="dupb-fill" id="dupb-fill"></div>
                        </div>
                        <div class="dupb-stats" id="dupb-stats"></div>
                    </div>
                    <div class="dupb-pct" id="dupb-pct">0%</div>
                </div>
            `;
            document.body.appendChild(bar);
        }
        document.getElementById('dupb-filename').textContent = fileName;
        document.getElementById('dupb-fill').style.width = '0%';
        document.getElementById('dupb-stats').textContent = `0.00 MB / ${totalMB} MB`;
        document.getElementById('dupb-pct').textContent = '0%';
        bar.classList.add('visible');
    },

    updateUploadProgress: (pct, loadedMB, totalMB, fileName) => {
        const fill = document.getElementById('dupb-fill');
        const stats = document.getElementById('dupb-stats');
        const pctEl = document.getElementById('dupb-pct');
        if (fill) fill.style.width = pct + '%';
        if (stats) stats.textContent = `${loadedMB} MB / ${totalMB} MB`;
        if (pctEl) pctEl.textContent = pct + '%';
    },

    hideUploadProgress: () => {
        const bar = document.getElementById('drive-upload-progress-bar');
        if (bar) bar.classList.remove('visible');
    },

    deleteFile: (fileId) => {
        if (typeof askConfirm === 'function') {
            askConfirm('هل أنت متأكد من حذف هذا الملف نهائياً؟', () => {
                DriveManager.performDelete(fileId);
            });
        } else if (confirm('هل أنت متأكد من حذف هذا الملف؟')) {
            DriveManager.performDelete(fileId);
        }
    },

    performDelete: (fileId) => {
        let allMeta = DriveManager.getFilesMeta();
        allMeta = allMeta.filter(f => f.id !== fileId);
        Store.set('cloud_drive_meta', allMeta);
        Store.remove(fileId);
        DriveManager.render();
    },

    downloadFile: (fileId, fileName) => {
        const data = Store.get(fileId);
        if (!data) {
            if (window.showToast) showToast('الملف غير موجود أو تالف', 'error');
            return;
        }

        try {
            let downloadUrl = data;
            // Convert Base64 Data URI to Blob for reliable downloading
            if (data.startsWith('data:')) {
                const arr = data.split(',');
                const mime = arr[0].match(/:(.*?);/)[1];
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while(n--){
                    u8arr[n] = bstr.charCodeAt(n);
                }
                const blob = new Blob([u8arr], {type:mime});
                downloadUrl = URL.createObjectURL(blob);
            }

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(link);
                if (downloadUrl !== data) {
                    URL.revokeObjectURL(downloadUrl);
                }
            }, 100);
            
            if (window.showToast) showToast('جاري تحميل الملف...', 'success');
        } catch (e) {
            console.error('Download error:', e);
            if (window.showToast) showToast('حدث خطأ أثناء التجهيز للتحميل', 'error');
        }
    },

    render: () => {
        const grid = document.getElementById('drive-grid');
        const usageEl = document.getElementById('drive-usage');
        const usageBar = document.getElementById('drive-usage-bar');
        const usagePercent = document.getElementById('drive-usage-percent');
        const catList = document.getElementById('drive-categories');
        const currentTitle = document.getElementById('drive-current-category-title');
        
        if (!grid) return;

        // Render Categories
        if (catList) {
            catList.innerHTML = DriveManager.categories.map(c => `
                <li class="drive-cat-item ${DriveManager.currentCategory === c.id ? 'active' : ''}" 
                    onclick="DriveManager.setCategory('${c.id}')">
                    <i class="fas ${c.icon}"></i>
                    <span>${c.name}</span>
                </li>
            `).join('');
            
            const activeCat = DriveManager.categories.find(c => c.id === DriveManager.currentCategory);
            if (currentTitle && activeCat) {
                currentTitle.textContent = activeCat.name;
            }
        }

        const allMeta = DriveManager.getFilesMeta();
        let totalBytes = 0;
        const maxStorage = 3 * 1024 * 1024 * 1024 * 1024; // 3TB limit

        // Filter by Category AND Search Term
        let filteredFiles = allMeta;
        if (DriveManager.currentCategory !== 'all') {
            filteredFiles = filteredFiles.filter(f => f.category === DriveManager.currentCategory);
        }
        if (DriveManager.searchTerm) {
            filteredFiles = filteredFiles.filter(f => f.name.toLowerCase().includes(DriveManager.searchTerm));
        }

        allMeta.forEach(f => totalBytes += f.size);

        // Update Storage UI
        const usedGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
        const percent = Math.min(100, (totalBytes / maxStorage) * 100);
        
        if (usageEl) usageEl.textContent = `${usedGB} GB مستخدم من 3 TB`;
        if (usageBar) usageBar.style.width = `${percent}%`;
        if (usagePercent) usagePercent.textContent = `${percent.toFixed(1)}%`;

        const fileCountEl = document.getElementById('drive-file-count');
        if (fileCountEl) fileCountEl.textContent = allMeta.length;

        // Handle View Mode Classes
        grid.className = DriveManager.viewMode === 'grid' ? 'drive-grid' : 'drive-list';
        grid.innerHTML = '';

        if (filteredFiles.length === 0) {
            grid.classList.add('is-empty');
            grid.innerHTML = `
                <div class="drive-empty-state">
                    <div class="empty-icon-box">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <div class="icon-glow"></div>
                    </div>
                    <h3>سحابتك بانتظار ملفاتك</h3>
                    <p>ابدأ برفع ملفاتك الآن للوصول إليها من أي مكان وفي أي وقت</p>
                </div>
            `;
            return;
        }

        filteredFiles.forEach(file => {
            const isImage = file.type.startsWith('image/');
            const lastDot = file.name.lastIndexOf('.');
            const nameOnly = lastDot > 0 ? file.name.substring(0, lastDot) : file.name;
            const extOnly = lastDot > 0 ? file.name.substring(lastDot + 1).toUpperCase() : 'FILE';

            const icon = isImage ? 'fa-image' : 
                         file.type.includes('pdf') ? 'fa-file-pdf' :
                         file.type.includes('video') ? 'fa-file-video' : 
                         file.type.includes('word') ? 'fa-file-word' : 
                         file.type.includes('excel') || file.type.includes('sheet') ? 'fa-file-excel' : 'fa-file-alt';
            
            const iconColor = isImage ? 'var(--primary-color)' : 
                              file.type.includes('pdf') ? '#ef4444' : 
                              file.type.includes('excel') || file.type.includes('sheet') ? '#10b981' : '#6366f1';

            let preview = `<i class="fas ${icon}" style="color:${iconColor}"></i>`;
            if (isImage) {
                const localData = Store.get(file.id);
                if (localData) {
                    preview = `<img src="${localData}" alt="${file.name}">`;
                }
            }

            const card = document.createElement('div');
            card.className = 'drive-card';
            card.innerHTML = `
                <div class="dc-icon-panel" style="background: ${iconColor}18; border-left: 2px solid ${iconColor}40;">
                    <div class="dc-icon-wrap" style="color:${iconColor}">
                        ${preview}
                    </div>
                </div>
                <div class="dc-info-panel">
                    <div class="dc-title-area">
                        <p class="dc-name" title="${file.name}">${nameOnly}</p>
                    </div>
                    <div class="dc-details-grid">
                        <div class="dc-detail-item">
                            <span class="dc-ext-badge" style="background: ${iconColor}25; color:${iconColor}">${extOnly}</span>
                            <span class="dc-detail-text"><i class="fas fa-hdd"></i> ${(file.size / 1024).toFixed(0)} KB</span>
                        </div>
                        <div class="dc-detail-item">
                            <span class="dc-detail-text"><i class="far fa-calendar-alt"></i> ${new Date(file.uploadDate).toLocaleDateString('ar-EG', {day:'numeric', month:'short', year:'numeric'})}</span>
                        </div>
                    </div>
                </div>
            `;

            // Click → show context popup
            card.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent document listener from firing immediately
                DriveManager.showFilePopup(file, e.currentTarget);
            });

            grid.appendChild(card);
        });
    },

    showFilePopup: (file, cardEl) => {
        DriveManager.hideFilePopup();

        const popup = document.createElement('div');
        popup.id = 'drive-file-popup';
        popup.innerHTML = `
            <div class="dfp-header">
                <i class="fas fa-file dfp-icon"></i>
                <span class="dfp-name" title="${file.name}">${file.name}</span>
            </div>
            <div class="dfp-actions">
                <button class="dfp-btn dfp-download" onclick="DriveManager.downloadFile('${file.id}', '${file.name.replace(/'/g, "\\'")}'); DriveManager.hideFilePopup();">
                    <i class="fas fa-download"></i> تحميل
                </button>
                <button class="dfp-btn dfp-delete admin-only" onclick="DriveManager.deleteFile('${file.id}'); DriveManager.hideFilePopup();">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </div>
        `;

        // Position near card
        const rect = cardEl.getBoundingClientRect();
        popup.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        popup.style.left = (rect.left + window.scrollX) + 'px';

        // Prevent clicking inside the popup from closing it
        popup.addEventListener('click', (e) => e.stopPropagation());

        document.body.appendChild(popup);

        // Close on outside click - only if not clicking another card
        const closeHandler = () => {
            DriveManager.hideFilePopup();
            document.removeEventListener('click', closeHandler);
        };
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
        }, 10);
    },

    hideFilePopup: () => {
        const existing = document.getElementById('drive-file-popup');
        if (existing) existing.remove();
    },
};

window.DriveManager = DriveManager;


