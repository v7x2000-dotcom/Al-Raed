/**
 * Al-Raed Platform - Intelligent Briefing Engine
 * Generates dynamic, context-aware reports for the dashboard.
 */
const BriefingAI = {
    generate: () => {
        const tasks = Store.get('tasks') || [];
        const events = Store.get('events') || [];
        const finance = Store.get('finance') || [];
        
        const isAr = (typeof LangManager !== 'undefined' && LangManager.currentLang === 'ar') || document.documentElement.dir === 'rtl';
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        let briefParts = [];

        // 1. Events Intelligence
        const todaysEvents = events.filter(e => e.date === todayStr);
        const tomorrowEvents = events.filter(e => e.date === tomorrowStr);
        
        if (todaysEvents.length > 0) {
            briefParts.push(isAr ? `📅 لديك اليوم <b>${todaysEvents.length}</b> مواعيد.` : `📅 You have <b>${todaysEvents.length}</b> events today.`);
        } else if (tomorrowEvents.length > 0) {
            briefParts.push(isAr ? `📅 غداً لديك <b>${tomorrowEvents.length}</b> مواعيد، استعد لها.` : `📅 You have <b>${tomorrowEvents.length}</b> events tomorrow.`);
        }

        // 2. Tasks Intelligence
        const pendingTasks = tasks.filter(t => t.status !== 'done');
        const urgentTasks = pendingTasks.filter(t => t.deadline === todayStr);
        const upcomingTasks = pendingTasks.filter(t => t.deadline === tomorrowStr);
        const overDueTasks = pendingTasks.filter(t => t.deadline && t.deadline < todayStr);
        
        if (overDueTasks.length > 0) {
            briefParts.push(isAr ? `🚨 تنبيه: لديك <b>${overDueTasks.length}</b> مهام متأخرة عن موعدها التسليم!` : `🚨 Alert: You have <b>${overDueTasks.length}</b> overdue tasks!`);
        }
        
        if (urgentTasks.length > 0) {
            briefParts.push(isAr ? `⚠️ احذر، هناك <b>${urgentTasks.length}</b> مهام تنتهي اليوم!` : `⚠️ <b>${urgentTasks.length}</b> tasks are due today!`);
        } else if (upcomingTasks.length > 0) {
            briefParts.push(isAr ? `📋 يوجد <b>${upcomingTasks.length}</b> مهام موعدها غداً.` : `📋 <b>${upcomingTasks.length}</b> tasks are due tomorrow.`);
        } else if (pendingTasks.length > 0 && overDueTasks.length === 0) {
             briefParts.push(isAr ? `⏳ لديك إجمالي <b>${pendingTasks.length}</b> مهام قيد التنفيذ والانتظار براحتك.` : `⏳ You have <b>${pendingTasks.length}</b> pending tasks in total.`);
        } else if (pendingTasks.length === 0) {
             briefParts.push(isAr ? `✨ إنجاز رائع! لا توجد أي مهام متأخرة أو مطلوبة.` : `✨ Great job! No pending tasks.`);
        }

        // 3. Finance Intelligence
        const unpaidDebts = finance.filter(r => r.type === 'debt' && r.status === 'Unpaid');
        if (unpaidDebts.length > 0) {
            const totalDebt = unpaidDebts.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
            briefParts.push(isAr ? `💰 لا تنسَ متابعة تحصيل ديون بقيمة <b>${totalDebt.toLocaleString()}</b> ج.م.` : `💰 Need to collect <b>${totalDebt.toLocaleString()}</b> in debts.`);
        }

        // Fallback if absolutely nothing is happening
        if (briefParts.length === 0) {
            return isAr ? "كل شيء تحت السيطرة، لا توجد أحداث قادمة.. ✨" : "Everything is under control, no upcoming events.. ✨";
        }

        // Combine all insights into a structured briefing
        return `<div style="display:flex; flex-direction:column; gap:0.5rem; text-align: ${isAr ? 'right' : 'left'}; line-height: 1.6;">
            ${briefParts.map(part => `<span>${part}</span>`).join('')}
        </div>`;
    }
};

window.BriefingAI = BriefingAI;

