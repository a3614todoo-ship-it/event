// 後台信件紀錄分頁：顯示 email_logs 最近 200 筆寄送狀態。
(function () {
    const TAB_ID = 'tab-email-logs';

    function formatTime(value) {
        try {
            const date = value?.toDate ? value.toDate() : new Date(value || '');
            if (!value || Number.isNaN(date.getTime())) return '-';
            return date.toLocaleString('zh-TW', { hour12: false });
        } catch (err) {
            return '-';
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function statusLabel(status) {
        const labels = {
            requested: '<span style="color:#d97706; font-weight:700;">已送出請求</span>',
            sent: '<span style="color:#10b981; font-weight:700;">已寄出</span>',
            failed: '<span style="color:#ef4444; font-weight:700;">失敗</span>'
        };
        return labels[status] || `<span style="color:#6b7280;">${escapeHtml(status || '-')}</span>`;
    }

    function ensureTab() {
        const tabs = document.querySelector('.admin-tabs');
        const container = document.querySelector('.container');
        if (!tabs || !container || document.getElementById(TAB_ID)) return;

        tabs.insertAdjacentHTML('beforeend', `
            <button class="tab-btn" data-tab="${TAB_ID}"><i class="fas fa-envelope-open-text"></i> 信件紀錄</button>
        `);

        container.insertAdjacentHTML('beforeend', `
            <div id="${TAB_ID}" class="tab-content">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
                    <div>
                        <h2 style="font-family:'Noto Serif TC', serif; margin:0 0 6px 0;">信件寄送紀錄</h2>
                        <p style="margin:0; color:var(--text-muted);">保留最近 200 筆寄送紀錄，包含 EmailJS 與 Google Apps Script 請求。</p>
                    </div>
                    <button type="button" id="refreshEmailLogsBtn" class="btn-secondary"><i class="fas fa-sync-alt"></i> 重新整理</button>
                </div>
                <div style="margin-bottom:12px; color:var(--text-muted);">目前載入 <strong id="emailLogsTotal" style="color:var(--accent);">0</strong> 筆</div>
                <div style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>時間</th>
                                <th>來源</th>
                                <th>收件人</th>
                                <th>主旨</th>
                                <th>模板</th>
                                <th>管道</th>
                                <th>狀態</th>
                                <th>錯誤</th>
                            </tr>
                        </thead>
                        <tbody id="emailLogsTableBody">
                            <tr><td colspan="8" style="text-align:center; color:var(--text-muted);">讀取中...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `);

        if (!tabs.dataset.emailLogsDelegated) {
            tabs.dataset.emailLogsDelegated = 'true';
            tabs.addEventListener('click', event => {
                const tabButton = event.target.closest('.tab-btn');
                if (!tabButton) return;

                const targetId = tabButton.getAttribute('data-tab');
                const targetPanel = document.getElementById(targetId);
                if (!targetId || !targetPanel) return;

                document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
                tabButton.classList.add('active');
                targetPanel.classList.add('active');
            });
        }
    }

    function renderLogs(logs) {
        const tbody = document.getElementById('emailLogsTableBody');
        const total = document.getElementById('emailLogsTotal');
        if (!tbody) return;
        if (total) total.textContent = String(logs.length);

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">目前尚無信件寄送紀錄。</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const recipient = `${escapeHtml(log.toName || '')}<br><span style="font-size:0.85rem; color:var(--text-muted);">${escapeHtml(log.toEmail || '-')}</span>`;
            const source = escapeHtml(log.source || '-');
            const error = log.errorMessage
                ? `<span title="${escapeHtml(log.errorMessage)}" style="color:#ef4444;">${escapeHtml(String(log.errorMessage).slice(0, 42))}</span>`
                : '<span style="color:var(--text-muted);">-</span>';
            return `
                <tr>
                    <td style="white-space:nowrap;">${formatTime(log.createdAt || log.clientCreatedAt)}</td>
                    <td>${source}</td>
                    <td>${recipient}</td>
                    <td>${escapeHtml(log.subject || '-')}</td>
                    <td>${escapeHtml(log.templateKey || '-')}</td>
                    <td>${escapeHtml(log.channel || '-')}</td>
                    <td>${statusLabel(log.status)}</td>
                    <td>${error}</td>
                </tr>
            `;
        }).join('');
    }

    function showError(message) {
        const tbody = document.getElementById('emailLogsTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ef4444;">${escapeHtml(message)}</td></tr>`;
        }
    }

    function subscribeLogs() {
        try {
            if (!window.firebase || !firebase.apps.length) return;
            const db = firebase.firestore();
            const refreshBtn = document.getElementById('refreshEmailLogsBtn');
            let unsubscribe = null;

            function start() {
                if (unsubscribe) unsubscribe();
                unsubscribe = db.collection('email_logs')
                    .orderBy('createdAt', 'desc')
                    .limit(200)
                    .onSnapshot(snapshot => {
                        const logs = [];
                        snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
                        renderLogs(logs);
                    }, err => {
                        console.error('讀取信件寄送紀錄失敗', err);
                        showError('讀取信件紀錄失敗，請確認 Firestore 規則是否已部署。');
                    });
            }

            if (refreshBtn) refreshBtn.addEventListener('click', start);
            firebase.auth().onAuthStateChanged(user => {
                if (user) start();
                if (!user && unsubscribe) unsubscribe();
            });
        } catch (err) {
            console.error('初始化信件紀錄分頁失敗', err);
            showError('初始化信件紀錄分頁失敗。');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        ensureTab();
        subscribeLogs();
    });
})();
