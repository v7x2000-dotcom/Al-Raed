/**
 * Al-Raed SaaS Platform - Attendance Management
 * Handles clock-in/out logic, tracking hours, and productivity.
 */
const AttendanceManager = {
    currentStatus: 'none', // 'none', 'in', 'out'
    currentSessionId: null,

    init: () => {
        // Find if user has an active session today
        const user = AuthManager.currentUser;
        if (!user) return;

        const logs = Store.get('attendance_logs') || [];
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        
        // Find today's log for this user
        const todayLogs = logs.filter(l => l.userId === user.id && l.date === today);
        const activeLog = todayLogs.find(l => !l.clockOut);

        if (activeLog) {
            AttendanceManager.currentStatus = 'in';
            AttendanceManager.currentSessionId = activeLog.id;
        } else if (todayLogs.length > 0) {
            AttendanceManager.currentStatus = 'out';
        } else {
            AttendanceManager.currentStatus = 'none';
        }

        AttendanceManager.updateUI();
    },

    updateUI: () => {
        const textEl = document.getElementById('attendance-status-text');
        const btnIn = document.getElementById('btn-clock-in');
        const btnOut = document.getElementById('btn-clock-out');

        if (!textEl || !btnIn || !btnOut) return;

        if (AttendanceManager.currentStatus === 'in') {
            textEl.textContent = 'داوم (نشط)';
            textEl.style.color = '#10b981'; // Green
            btnIn.classList.add('hidden');
            btnOut.classList.remove('hidden');
        } else if (AttendanceManager.currentStatus === 'out') {
            textEl.textContent = 'منصرف';
            textEl.style.color = '#ef4444'; // Red
            btnIn.classList.add('hidden');
            btnOut.classList.add('hidden'); // Cannot clock in again today (or maybe they can? let's keep it simple: no re-entry without admin)
        } else {
            textEl.textContent = 'غير مسجل';
            textEl.style.color = 'var(--text-primary)';
            btnIn.classList.remove('hidden');
            btnOut.classList.add('hidden');
        }
    },

    clockIn: () => {
        const user = AuthManager.currentUser;
        if (!user) return;

        const id = 'att_' + Date.now();
        const now = new Date();
        const log = {
            id: id,
            userId: user.id,
            userName: user.name,
            dept: user.dept || '',
            date: now.toLocaleDateString('en-CA'),
            clockIn: now.getTime(),
            clockOut: null,
            durationMins: 0,
            status: 'active'
        };

        const logs = Store.get('attendance_logs') || [];
        logs.push(log);
        Store.set('attendance_logs', logs);

        AttendanceManager.currentStatus = 'in';
        AttendanceManager.currentSessionId = id;
        AttendanceManager.updateUI();
        
        AuthManager.showToast('✅ تم تسجيل حضورك بنجاح. يوم عمل موفّق!');
        Store.log('Clock In', 'سجل حضوره اليوم.');
    },

    clockOut: () => {
        const user = AuthManager.currentUser;
        if (!user || !AttendanceManager.currentSessionId) return;

        const logs = Store.get('attendance_logs') || [];
        const idx = logs.findIndex(l => l.id === AttendanceManager.currentSessionId);
        
        if (idx > -1) {
            const now = new Date().getTime();
            logs[idx].clockOut = now;
            logs[idx].durationMins = Math.floor((now - logs[idx].clockIn) / 60000);
            logs[idx].status = 'completed';
            
            Store.set('attendance_logs', logs);

            AttendanceManager.currentStatus = 'out';
            AttendanceManager.currentSessionId = null;
            AttendanceManager.updateUI();
            
            AuthManager.showToast('👋 تم تسجيل الانصراف. شكراً لجهودك!');
            Store.log('Clock Out', \`سجل انصرافه. المجهود: \${(logs[idx].durationMins / 60).toFixed(1)} ساعة.\`);
        }
    }
};

window.AttendanceManager = AttendanceManager;

// Listen to store updates in case of external sync
window.addEventListener('storeUpdated', (e) => {
    if (e.detail.key === 'attendance_logs') {
        AttendanceManager.init();
    }
});

// Init when App is ready
window.addEventListener('storeReady', () => {
    setTimeout(AttendanceManager.init, 500);
});
