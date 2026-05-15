/**
 * Al-Raed SaaS Platform - Quick Polls Module
 * Engages team members with real-time voting and results.
 */
const PollsManager = {
    init: () => {
        window.addEventListener('storeUpdated', (e) => {
            if (e.detail.key === 'company_polls') PollsManager.render();
        });
        PollsManager.render();
    },

    render: () => {
        const container = document.getElementById('polls-container');
        if (!container) return;

        const polls = Store.get('company_polls') || [];
        container.innerHTML = '';

        if (polls.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; padding:5rem 2rem; border-radius:24px;" class="glass-effect">
                    <i class="fas fa-poll-h" style="font-size:4rem; background:var(--primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom:1.5rem; display:block;"></i>
                    <h3 style="margin-bottom:0.5rem; font-size:1.25rem;">${LangManager.currentLang==='ar'?'لا توجد استطلاعات نشطة':'No Active Polls'}</h3>
                    <p style="color:var(--text-secondary); max-width:300px; margin:0 auto; font-size:0.9rem;">${LangManager.currentLang==='ar'?'شارك رأيك في مستقبل الشركة! ستظهر الاستطلاعات الجديدة هنا.':'Your voice matters! New company polls will be shown here for team voting.'}</p>
                </div>
            `;
            return;
        }

        const me = AuthManager.currentUser;

        [...polls].sort((a, b) => b.timestamp - a.timestamp).forEach(poll => {
            const card = document.createElement('div');
            card.className = 'card glass-effect poll-card';
            card.style.cssText = 'padding:1.5rem; border-radius:20px;';
            
            const totalVotes = Object.values(poll.votes || {}).length;
            const hasVoted = poll.votes?.[me.id] !== undefined;

            let optionsHtml = '';
            poll.options.forEach((opt, idx) => {
                const optVotes = Object.values(poll.votes || {}).filter(v => v === idx).length;
                const percent = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                const isSelected = poll.votes?.[me.id] === idx;

                optionsHtml += `
                    <div class="poll-option" onclick="PollsManager.vote('${poll.id}', ${idx})" style="position:relative; padding:12px; border:1.5px solid ${isSelected?'var(--primary-color)':'var(--border-color)'}; border-radius:12px; cursor:pointer; margin-bottom:10px; transition:all 0.3s; overflow:hidden; background:${isSelected?'rgba(37,99,235,0.05)':'transparent'}">
                        <div style="position:absolute; top:0; left:0; height:100%; width:${percent}%; background:var(--primary-color); opacity:0.1; transition:width 0.6s cubic-bezier(0.4,0,0.2,1);"></div>
                        <div style="display:flex; justify-content:space-between; position:relative; z-index:1; font-weight:${isSelected?'700':'500'}">
                            <span>${opt} ${isSelected?' <i class="fas fa-check-circle" style="color:var(--primary-color)"></i>':''}</span>
                            <span style="opacity:0.8;">${percent}%</span>
                        </div>
                    </div>
                `;
            });

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1.2rem;">
                    <h3 style="margin:0; font-size:1.1rem; line-height:1.4;">${poll.question}</h3>
                    ${AuthManager.isSuperAdmin() ? `
                        <button onclick="PollsManager.deletePoll('${poll.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; opacity:0.4;"><i class="fas fa-trash"></i></button>
                    ` : ''}
                </div>
                <div class="poll-options-list">${optionsHtml}</div>
                <div style="margin-top:1rem; font-size:0.75rem; opacity:0.6; display:flex; justify-content:space-between;">
                    <span><i class="fas fa-vote-yea"></i> ${totalVotes} ${LangManager.t('Total Votes')}</span>
                    <span>${new Date(poll.timestamp).toLocaleDateString()}</span>
                </div>
            `;
            container.appendChild(card);
        });
    },

    showCreatePollModal: () => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content glass-effect" style="max-width:500px;">
                <div class="modal-header">
                    <h2><i class="fas fa-poll" style="color:var(--primary-color)"></i> ${LangManager.t('New Poll')}</h2>
                    <button class="close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1rem;">
                    <div class="form-group">
                        <label>${LangManager.t('Poll Question')}</label>
                        <input type="text" id="poll-q" placeholder="مثلاً: ما رأيكم في الموعد الجديد؟">
                    </div>
                    <div id="poll-options-input" style="display:flex; flex-direction:column; gap:8px;">
                        <label>${LangManager.t('Options')}</label>
                        <input type="text" class="poll-opt-val" placeholder="الاختيار الأول">
                        <input type="text" class="poll-opt-val" placeholder="الاختيار الثاني">
                    </div>
                    <button class="btn btn-secondary" onclick="PollsManager.addOptionInput()" style="width:fit-content; padding:5px 12px; font-size:0.8rem;"><i class="fas fa-plus"></i> ${LangManager.t('Add Option')}</button>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary cancel-modal">${LangManager.t('Cancel')}</button>
                    <button class="btn btn-primary" id="btn-create-poll">${LangManager.t('Create Poll')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-create-poll').onclick = () => {
            const q = modal.querySelector('#poll-q').value.trim();
            const opts = Array.from(modal.querySelectorAll('.poll-opt-val')).map(i => i.value.trim()).filter(v => v);
            
            if (!q || opts.length < 2) {
                NotificationManager.add('يرجى كتابة سؤال واختيارين على الأقل', 'fa-warning', 'warning');
                return;
            }

            const newPoll = {
                id: 'poll_' + Date.now(),
                question: q,
                options: opts,
                votes: {}, // userId: optionIndex
                timestamp: Date.now(),
                createdBy: AuthManager.currentUser.id
            };

            const polls = Store.get('company_polls') || [];
            polls.push(newPoll);
            Store.set('company_polls', polls);
            
            NotificationManager.add(LangManager.t('Poll started'), 'fa-poll', 'success');
            modal.remove();
        };

        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.querySelector('.cancel-modal').onclick = () => modal.remove();
    },

    addOptionInput: () => {
        const container = document.getElementById('poll-options-input');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'poll-opt-val';
        input.placeholder = 'اختيار إضافي...';
        container.appendChild(input);
        input.focus();
    },

    vote: (pollId, optionIndex) => {
        const polls = Store.get('company_polls') || [];
        const poll = polls.find(p => p.id === pollId);
        if (!poll) return;

        const me = AuthManager.currentUser;
        if (!poll.votes) poll.votes = {};

        // Single vote logic: if clicking same option, remove vote; if other, change vote.
        if (poll.votes[me.id] === optionIndex) {
            delete poll.votes[me.id];
        } else {
            poll.votes[me.id] = optionIndex;
        }

        Store.set('company_polls', polls);
        PollsManager._playVoteSound();
    },

    deletePoll: (id) => {
        if (!confirm('حذف هذا التصويت؟')) return;
        const polls = (Store.get('company_polls') || []).filter(p => p.id !== id);
        Store.set('company_polls', polls);
    },

    _playVoteSound: () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.setValueAtTime(660, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start(); osc.stop(ctx.currentTime + 0.1);
        } catch(e) {}
    }
};

window.PollsManager = PollsManager;
