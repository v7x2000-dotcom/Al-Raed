/**
 * Al-Raed SaaS Platform - Audit Log Manager (Admin Only)
 * Tracks all sensitive operations across the platform.
 */
const AuditManager = {
    init: () => {
        window.addEventListener('storeUpdated', (e) => {
            if (e.detail.key === 'audit_logs') AuditManager.render();
        });
        AuditManager.render();
    },

    /**
     * Records a new audit entry
     * @param {string} action - Descriptive action (e.g., 'Deleted User')
     * @param {string} target - The item/user affected
     */
    log: (action, target = '-') => {
        const me = AuthManager.currentUser;
        if (!me) return;

        const entry = {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2,4),
            timestamp: Date.now(),
            userId: me.id,
            userName: me.name,
            action: action,
            target: target
        };

        const logs = Store.get('audit_logs') || [];
        // Keep only last 200 logs for performance
        logs.unshift(entry);
        if (logs.length > 200) logs.pop();
        
        Store.set('audit_logs', logs);
        console.log(`[Audit] ${action} -> ${target}`);
    },

    render: () => {
        const tbody = document.getElementById('audit-list');
        if (!tbody) return;
        
        const logs = Store.get('audit_logs') || [];

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding:3rem;text-align:center;color:var(--text-secondary);opacity:0.6;"><i class="fas fa-history" style="font-size:2rem;display:block;margin-bottom:1rem;"></i> لا توجد سجلات مراجعة بعد.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr style="border-bottom:1px solid var(--border-color); transition: background 0.2s;">
                <td style="padding:0.875rem 1rem;font-size:0.75rem;color:var(--text-secondary);">${new Date(log.timestamp).toLocaleString(LangManager.currentLang === 'ar' ? 'ar-EG' : 'en-US')}</td>
                <td style="padding:0.875rem 1rem;"><div style="display:flex;align-items:center;gap:8px;"><i class="fas fa-user-circle" style="opacity:0.4;"></i> <span>${log.userName}</span></div></td>
                <td style="padding:0.875rem 1rem;"><span class="badge" style="background:rgba(37,99,235,0.08);color:var(--primary-color);padding:4px 10px;border-radius:6px;font-size:0.8rem;">${log.action}</span></td>
                <td style="padding:0.875rem 1rem;color:var(--text-secondary);font-size:0.85rem;">${log.target || '-'}</td>
            </tr>
        `).join('');
    }
};

window.AuditManager = AuditManager;
