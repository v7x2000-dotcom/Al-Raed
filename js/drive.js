/**
 * Al-Raed Platform - Cloud Drive Manager
 */
const DriveManager = {
    currentCategory: 'all',
    pendingFiles: [],

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
    },

    getFilesMeta: () => {
        return Store.get('cloud_drive_meta') || [];
    },

    setCategory: (catId) => {
        DriveManager.currentCategory = catId;
        DriveManager.render();
    },

    showUploadModal: () => {
        DriveManager.pendingFiles = [];
        document.getElementById('drive-selected-file-name').textContent = 'لم يتم اختيار ملف';
        document.getElementById('drive-upload-input').value = '';
        document.getElementById('drive-upload-modal').classList.remove('hidden');
    },

    handleFileInput: (e) => {
        DriveManager.pendingFiles = Array.from(e.target.files);
        const nameLabel = document.getElementById('drive-selected-file-name');
        if (DriveManager.pendingFiles.length > 0) {
            nameLabel.textContent = DriveManager.pendingFiles.length === 1 
                ? DriveManager.pendingFiles[0].name 
                : `${DriveManager.pendingFiles.length} ملفات محددة`;
            nameLabel.style.color = 'var(--primary-color)';
            nameLabel.style.fontWeight = 'bold';
        } else {
            nameLabel.textContent = 'لم يتم اختيار ملف';
            nameLabel.style.color = 'var(--text-secondary)';
            nameLabel.style.fontWeight = 'normal';
        }
    },

    confirmUpload: () => {
        if (DriveManager.pendingFiles.length === 0) {
            AuthManager.showToast('يرجى اختيار ملف أولاً', 'error');
            return;
        }

        const category = document.getElementById('drive-upload-category').value;
        const metaList = DriveManager.getFilesMeta();
        let processed = 0;

        DriveManager.pendingFiles.forEach(file => {
            // Check size (max 700KB to avoid Firebase 1MB doc limit when base64 encoded)
            if (file.size > 700 * 1024) {
                AuthManager.showToast(`الملف ${file.name} كبير جداً. الحد الأقصى 700KB.`, 'error');
                processed++;
                if (processed === DriveManager.pendingFiles.length) {
                    document.getElementById('drive-upload-modal').classList.add('hidden');
                }
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const me = AuthManager.currentUser;
                const fileId = 'drive_file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                
                // Save actual file data in a SEPARATE key to avoid hitting array limits
                Store.set(fileId, event.target.result);

                // Add to metadata catalog
                const newFileMeta = {
                    id: fileId,
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    category: category,
                    uploadedBy: me ? me.name : 'Unknown',
                    uploadDate: new Date().toISOString()
                };

                metaList.push(newFileMeta);
                Store.set('cloud_drive_meta', metaList);
                Store.log('Uploaded File to Cloud', file.name);
                NotificationManager.add(`تم رفع: ${file.name}`, 'fa-check-circle', 'system');
                
                processed++;
                if (processed === DriveManager.pendingFiles.length) {
                    document.getElementById('drive-upload-modal').classList.add('hidden');
                    DriveManager.render();
                }
            };
            reader.readAsDataURL(file);
        });
    },

    deleteFile: (id) => {
        if (!confirm('هل أنت متأكد من حذف هذا الملف نهائياً؟')) return;
        const currentMeta = DriveManager.getFilesMeta().filter(f => f.id !== id);
        Store.set('cloud_drive_meta', currentMeta);
        Store.remove(id); // Delete the actual file data
        Store.log('Deleted File from Cloud', id);
        DriveManager.render();
    },

    downloadFile: (id, name) => {
        const dataUrl = Store.get(id);
        if (!dataUrl) {
            AuthManager.showToast('عفواً، لا يمكن العثور على محتوى الملف (قد يكون قيد المزامنة)', 'error');
            return;
        }

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    render: () => {
        const grid = document.getElementById('drive-grid');
        const usageEl = document.getElementById('drive-usage');
        const catList = document.getElementById('drive-categories');
        const currentTitle = document.getElementById('drive-current-category-title');
        if (!grid) return;

        // Render Categories
        if (catList) {
            catList.innerHTML = DriveManager.categories.map(c => `
                <li>
                    <button class="btn ${DriveManager.currentCategory === c.id ? 'btn-primary' : 'btn-outline'}" 
                            style="width:100%; justify-content:flex-start; padding:0.75rem; font-weight:600; text-align:right;" 
                            onclick="DriveManager.setCategory('${c.id}')">
                        <i class="fas ${c.icon}" style="margin-left:0.5rem; width:20px;"></i> ${c.name}
                    </button>
                </li>
            `).join('');
            
            const activeCat = DriveManager.categories.find(c => c.id === DriveManager.currentCategory);
            if (currentTitle && activeCat) {
                currentTitle.innerHTML = `<i class="fas ${activeCat.icon}"></i> ${activeCat.name}`;
            }
        }

        const allMeta = DriveManager.getFilesMeta();
        let totalBytes = 0;
        
        const filteredFiles = DriveManager.currentCategory === 'all' 
            ? allMeta 
            : allMeta.filter(f => f.category === DriveManager.currentCategory);

        allMeta.forEach(f => totalBytes += f.size);

        grid.innerHTML = '';

        if (filteredFiles.length === 0) {
            grid.style.display = 'block';
            grid.innerHTML = `
                <div style="text-align:center;color:var(--text-secondary);padding:3rem;opacity:0.6; width:100%;">
                    <i class="fas fa-folder-open" style="font-size:4rem;margin-bottom:1rem;"></i>
                    <p>هذا القسم فارغ حالياً.</p>
                </div>
            `;
            if (usageEl) usageEl.textContent = `${(totalBytes / 1024 / 1024).toFixed(2)} MB مستخدمة`;
            return;
        }

        grid.style.display = 'grid';

        filteredFiles.forEach(file => {
            const isImage = file.type.startsWith('image/');
            const icon = isImage ? 'fa-image' : 
                         file.type.includes('pdf') ? 'fa-file-pdf' :
                         file.type.includes('video') ? 'fa-file-video' : 'fa-file-alt';
            const iconColor = isImage ? '#3b82f6' : 
                              file.type.includes('pdf') ? '#ef4444' : '#10b981';

            // Try to get image preview if it's already in local storage (sync completed)
            let preview = `<div style="height:100px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.02);border-radius:var(--radius-sm);margin-bottom:0.5rem;"><i class="fas ${icon}" style="font-size:3rem;color:${iconColor};opacity:0.8;"></i></div>`;
            
            if (isImage) {
                const localData = Store.get(file.id);
                if (localData) {
                    preview = `<div style="height:100px;border-radius:var(--radius-sm);background-image:url(${localData});background-size:cover;background-position:center;margin-bottom:0.5rem;"></div>`;
                }
            }

            const catObj = DriveManager.categories.find(c => c.id === file.category) || DriveManager.categories[0];

            const card = document.createElement('div');
            card.style.background = 'var(--bg-primary)';
            card.style.border = '1px solid var(--border-color)';
            card.style.borderRadius = 'var(--radius-md)';
            card.style.padding = '1rem';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '0.75rem';
            card.style.position = 'relative';
            card.style.overflow = 'hidden';
            card.style.boxShadow = '0 2px 10px rgba(0,0,0,0.02)';
            card.style.transition = 'transform 0.2s';
            
            card.onmouseenter = () => card.style.transform = 'translateY(-2px)';
            card.onmouseleave = () => card.style.transform = 'translateY(0)';

            card.innerHTML = `
                ${preview}
                <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${file.name}">${file.name}</div>
                <div style="font-size:0.7rem;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center;">
                    <span style="background:rgba(37,99,235,0.1);color:var(--primary-color);padding:0.2rem 0.5rem;border-radius:4px;">${catObj.name}</span>
                    <span>${(file.size / 1024).toFixed(0)} KB</span>
                </div>
                <div style="font-size:0.7rem;color:var(--text-secondary);">
                    بواسطة: ${file.uploadedBy} | ${new Date(file.uploadDate).toLocaleDateString()}
                </div>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button class="btn btn-primary" style="flex:1;padding:0.5rem;font-size:0.85rem;" onclick="DriveManager.downloadFile('${file.id}', '${file.name.replace(/'/g, "\\'")}')"><i class="fas fa-download"></i></button>
                    <button class="btn btn-secondary admin-only" style="flex:1;padding:0.5rem;font-size:0.85rem;background:rgba(239,68,68,0.1);color:var(--danger);border-color:rgba(239,68,68,0.2);" onclick="DriveManager.deleteFile('${file.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
            grid.appendChild(card);
        });

        if (usageEl) usageEl.textContent = `${(totalBytes / 1024 / 1024).toFixed(2)} MB مستخدمة`;
    }
};
window.DriveManager = DriveManager;

