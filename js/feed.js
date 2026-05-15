/**
 * Al-Raed SaaS Platform - Company Feed Module
 * Handles news, announcements, and team interaction.
 */
const FeedManager = {
    init: () => {
        window.addEventListener('storeUpdated', (e) => {
            if (e.detail.key === 'company_posts') FeedManager.render();
        });
        FeedManager.render();
    },

    render: () => {
        const container = document.getElementById('feed-container');
        if (!container) return;

        const posts = Store.get('company_posts') || [];
        container.innerHTML = '';

        if (posts.length === 0) {
            container.innerHTML = `
                <div class="card glass-effect" style="text-align:center; padding:5rem 2rem; border-radius:24px;">
                    <i class="fas fa-newspaper" style="font-size:4rem; background:var(--primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom:1.5rem; display:block;"></i>
                    <h3 style="margin-bottom:0.5rem; font-size:1.25rem;">${LangManager.currentLang==='ar'?'لا توجد أخبار حالياً':'No News Available'}</h3>
                    <p style="color:var(--text-secondary); max-width:300px; margin:0 auto; font-size:0.9rem;">${LangManager.currentLang==='ar'?'سيتم عرض آخر مستجدات وفعاليات الشركة هنا بمجرد نشرها.':'Stay tuned! Company news and updates will appear here once published.'}</p>
                </div>
            `;
            return;
        }

        // Sort by newest
        [...posts].sort((a, b) => b.timestamp - a.timestamp).forEach(post => {
            const card = document.createElement('div');
            card.className = 'card glass-effect post-card';
            card.style.cssText = 'animation: msgFadeIn 0.3s ease-out;';
            
            const dateStr = new Date(post.timestamp).toLocaleString(LangManager.currentLang === 'ar' ? 'ar-EG' : 'en-US');
            const me = AuthManager.currentUser;
            const hasLiked = post.likes?.includes(me.id);

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1rem;">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <img src="${post.authorAvatar || 'https://ui-avatars.com/api/?name='+post.authorName}" style="width:45px; height:45px; border-radius:50%; object-fit:cover; border:2px solid var(--primary-color);">
                        <div>
                            <div style="font-weight:700; font-size:1rem;">${post.authorName}</div>
                            <div style="font-size:0.75rem; opacity:0.6;">${dateStr}</div>
                        </div>
                    </div>
                    ${AuthManager.isSuperAdmin() ? `
                        <button onclick="FeedManager.deletePost('${post.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; opacity:0.4;"><i class="fas fa-trash"></i></button>
                    ` : ''}
                </div>
                <div style="font-size:1rem; line-height:1.6; white-space:pre-wrap; margin-bottom:1.5rem;">${post.content}</div>
                <div style="border-top:1px solid var(--border-color); padding-top:1rem; display:flex; gap:1.5rem;">
                    <button onclick="FeedManager.toggleLike('${post.id}')" style="background:none; border:none; color:${hasLiked?'var(--primary-color)':'var(--text-secondary)'}; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:600; transition:all 0.2s;">
                        <i class="${hasLiked?'fas':'far'} fa-thumbs-up"></i> ${post.likes?.length || 0}
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    },

    showCreatePostModal: () => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10001';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:550px;">
                <div class="modal-header">
                    <h2><i class="fas fa-edit" style="color:var(--primary-color)"></i> ${LangManager.t('Create Post')}</h2>
                    <button class="close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>${LangManager.t('Post Content')}</label>
                        <textarea id="post-content-input" rows="6" placeholder="${LangManager.t('Write your news here...')}" style="width:100%; padding:1rem; border-radius:15px; border:1px solid var(--border-color); background:var(--bg-primary); color:var(--text-primary); resize:none; outline:none; font-family:inherit;"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary cancel-modal">${LangManager.t('Cancel')}</button>
                    <button class="btn btn-primary" id="btn-publish-post"><i class="fas fa-paper-plane"></i> ${LangManager.t('Post News')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-publish-post').onclick = () => {
            const content = modal.querySelector('#post-content-input').value.trim();
            if (!content) return;

            const me = AuthManager.currentUser;
            const newPost = {
                id: 'post_' + Date.now(),
                content: content,
                authorId: me.id,
                authorName: me.name,
                authorAvatar: me.avatar,
                timestamp: Date.now(),
                likes: []
            };

            const posts = Store.get('company_posts') || [];
            posts.push(newPost);
            Store.set('company_posts', posts);
            
            NotificationManager.add(LangManager.t('Post published successfully'), 'fa-check', 'success');
            modal.remove();
        };

        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.querySelector('.cancel-modal').onclick = () => modal.remove();
    },

    toggleLike: (postId) => {
        const posts = Store.get('company_posts') || [];
        const post = posts.find(p => p.id === postId);
        if (!post) return;

        const me = AuthManager.currentUser;
        if (!post.likes) post.likes = [];

        const index = post.likes.indexOf(me.id);
        if (index === -1) {
            post.likes.push(me.id);
        } else {
            post.likes.splice(index, 1);
        }

        Store.set('company_posts', posts);
    },

    deletePost: (postId) => {
        if (!confirm(LangManager.t('Delete this post?'))) return;
        const posts = (Store.get('company_posts') || []).filter(p => p.id !== postId);
        Store.set('company_posts', posts);
        NotificationManager.add(LangManager.t('Post deleted'), 'fa-trash', 'chat');
    }
};

window.FeedManager = FeedManager;
