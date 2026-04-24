document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // EmailJS 設定
    // ==========================================
    const EMAILJS_PUBLIC_KEY = '2NlEiWtXcW05Awbjt'; 
    const EMAILJS_SERVICE_ID = 'service_96agth6'; 
    const EMAILJS_TEMPLATE_ID = 'template_uz1rccd'; 

    if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY) {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }

    // ==========================================
    // Firebase 設定
    // ==========================================
    const firebaseConfig = {
        apiKey: "AIzaSyBmymCsLnheBKGunfZGskM1Ut_Swb13ZhA",
        authDomain: "company-events-620bd.firebaseapp.com",
        projectId: "company-events-620bd",
        storageBucket: "company-events-620bd.firebasestorage.app",
        messagingSenderId: "484682651822",
        appId: "1:484682651822:web:1a7d612263f470c020353f",
        measurementId: "G-7YNHQYDXPZ"
    };

    let db = null;
    let events = [];
    let eventRegistrations = [];

    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        console.log("Firebase 初始化成功");

        // 監聽活動
        db.collection("events").orderBy("date", "asc").onSnapshot((snapshot) => {
            events = [];
            snapshot.forEach((doc) => {
                events.push({ id: doc.id, ...doc.data() });
            });
            if (isAdminLoggedIn) {
                renderAdminEventsList();
                updateCheckinSelect();
            }
        });

        // 監聽報名
        db.collection("event_registrations").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
            eventRegistrations = [];
            snapshot.forEach((doc) => {
                eventRegistrations.push({ id: doc.id, ...doc.data() });
            });
            if (isAdminLoggedIn) {
                renderCheckinList();
                renderAnalytics();
            }
        });

    } catch (e) {
        console.error("Firebase 初始化失敗", e);
    }

    // ==========================================
    // 管理員登入與 UI 切換
    // ==========================================
    const loginScreen = document.getElementById('loginScreen');
    const adminPanel = document.getElementById('adminPanel');
    const adminUsernameInput = document.getElementById('adminUsername');
    const adminPasswordInput = document.getElementById('adminPassword');
    const adminLoginSubmit = document.getElementById('adminLoginSubmit');
    const logoutBtn = document.getElementById('logoutBtn');

    let isAdminLoggedIn = localStorage.getItem('isStandaloneEventAdmin') === 'true';

    function setView() {
        if (isAdminLoggedIn) {
            loginScreen.style.display = 'none';
            adminPanel.style.display = 'block';
            if (typeof renderAdminEventsList === 'function') renderAdminEventsList();
            if (typeof updateCheckinSelect === 'function') updateCheckinSelect();
            if (typeof renderCheckinList === 'function') renderCheckinList();
            if (typeof renderAnalytics === 'function') renderAnalytics();
        } else {
            loginScreen.style.display = 'flex';
            adminPanel.style.display = 'none';
        }
    }

    adminLoginSubmit.addEventListener('click', async () => {
        const user = adminUsernameInput.value.trim();
        const pass = adminPasswordInput.value.trim();

        if (!user || !pass) { alert('請輸入帳號與密碼'); return; }

        try {
            const authRef = db.collection('admin_access').doc('auth');
            const authDoc = await authRef.get();
            
            if (authDoc.exists) {
                const authData = authDoc.data();
                if (user === authData.username && pass === authData.password) {
                    isAdminLoggedIn = true;
                    localStorage.setItem('isStandaloneEventAdmin', 'true');
                    adminUsernameInput.value = '';
                    adminPasswordInput.value = '';
                    setView();
                } else {
                    alert('帳號或密碼錯誤');
                }
            } else {
                if (confirm('偵測到系統尚未設定管理員帳號。\n您剛剛輸入的帳號與密碼，是否要設定為系統的「初始管理員帳號」？')) {
                    await authRef.set({
                        username: user,
                        password: pass
                    });
                    alert('初始管理員帳號設定成功！請妥善保管您的密碼。');
                    isAdminLoggedIn = true;
                    localStorage.setItem('isStandaloneEventAdmin', 'true');
                    adminUsernameInput.value = '';
                    adminPasswordInput.value = '';
                    setView();
                }
            }
        } catch (error) {
            console.error("驗證失敗:", error);
            alert("驗證系統連線失敗");
        }
    });

    logoutBtn.addEventListener('click', () => {
        isAdminLoggedIn = false;
        localStorage.removeItem('isStandaloneEventAdmin');
        location.href = 'index.html';
    });

    // 頁籤切換
    const adminTabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    adminTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            adminTabs.forEach(b => {
                b.classList.remove('active', 'btn-primary');
                b.classList.add('btn-secondary');
            });
            btn.classList.add('active', 'btn-primary');
            btn.classList.remove('btn-secondary');
            tabContents.forEach(tc => tc.classList.remove('active'));
            document.getElementById(target).classList.add('active');
        });
    });

    // ==========================================
    // 活動上架管理 (CRUD)
    // ==========================================
    const eventEditModal = document.getElementById('eventEditModal');
    const addEventBtn = document.getElementById('addEventBtn');
    const eventEditForm = document.getElementById('eventEditForm');
    const addCustomFieldBtn = document.getElementById('addCustomFieldBtn');
    const customFieldsContainer = document.getElementById('customFieldsContainer');
    const closeBtns = document.querySelectorAll('.close-modal, .close-modal-btn');
    
    let currentEditingCustomFields = [];

    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            eventEditModal.style.display = 'none';
        });
    });

    addEventBtn.addEventListener('click', () => {
        document.getElementById('editEventId').value = '';
        document.getElementById('editEventName').value = '';
        document.getElementById('editEventCapacity').value = '15';
        document.getElementById('editEventDate').value = '';
        document.getElementById('editEventTime').value = '';
        document.getElementById('editEventLocation').value = '';
        document.getElementById('editEventDesc').value = '';
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`extName${i}`).value = '';
            document.getElementById(`extVal${i}`).value = '';
        }
        document.getElementById('editEventImage').value = '';
        document.getElementById('editEventIsActive').checked = true;
        document.getElementById('editEventAllowWaitlist').checked = true;
        currentEditingCustomFields = [];
        renderCustomFieldEditors();
        document.getElementById('eventModalTitle').textContent = '新增活動';
        eventEditModal.style.display = 'block';
    });

    if (addCustomFieldBtn) {
        addCustomFieldBtn.addEventListener('click', () => {
            currentEditingCustomFields.push({ name: '', type: 'text', required: true });
            renderCustomFieldEditors();
        });
    }

    window.updateCustomField = function(index, key, value) {
        if (currentEditingCustomFields[index]) {
            currentEditingCustomFields[index][key] = value;
        }
    };

    window.removeCustomField = function(index) {
        currentEditingCustomFields.splice(index, 1);
        renderCustomFieldEditors();
    };

    function renderCustomFieldEditors() {
        if (!customFieldsContainer) return;
        customFieldsContainer.innerHTML = currentEditingCustomFields.map((f, index) => `
            <div class="form-row" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
                <input type="text" placeholder="欄位名稱 (如: 公司名稱)" value="${f.name}" onchange="updateCustomField(${index}, 'name', this.value)" style="flex: 2; min-width: 150px;">
                <select onchange="updateCustomField(${index}, 'type', this.value)" style="flex: 1; min-width: 120px;">
                    <option value="text" ${f.type === 'text' ? 'selected' : ''}>單行文字</option>
                    <option value="tel" ${f.type === 'tel' ? 'selected' : ''}>電話 (手機)</option>
                    <option value="checkbox" ${f.type === 'checkbox' ? 'selected' : ''}>勾選 (Yes/No)</option>
                    <option value="select" ${f.type === 'select' ? 'selected' : ''}>下拉選單 (待開發)</option>
                </select>
                <label style="display: flex; align-items: center; gap: 5px; font-size: 0.85rem; white-space: nowrap; cursor: pointer; margin-right: auto;">
                    <input type="checkbox" ${f.required ? 'checked' : ''} onchange="updateCustomField(${index}, 'required', this.checked)"> 必填
                </label>
                <button type="button" class="btn-danger" onclick="removeCustomField(${index})" style="padding: 5px 12px; font-size: 1.2rem; line-height: 1; border-radius: 6px;">&times;</button>
            </div>
        `).join('');
    }

    eventEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editEventId').value;
        const extDetails = [];
        for (let i = 1; i <= 5; i++) {
            const name = document.getElementById(`extName${i}`).value.trim();
            const val = document.getElementById(`extVal${i}`).value.trim();
            if (name || val) {
                extDetails.push({ name, value: val });
            }
        }

        const data = {
            name: document.getElementById('editEventName').value.trim(),
            capacity: parseInt(document.getElementById('editEventCapacity').value) || 0,
            date: document.getElementById('editEventDate').value,
            time: document.getElementById('editEventTime').value.trim(),
            location: document.getElementById('editEventLocation').value.trim(),
            description: document.getElementById('editEventDesc').value.trim(),
            extDetails: extDetails,
            image: document.getElementById('editEventImage').value.trim(),
            isActive: document.getElementById('editEventIsActive').checked,
            allowWaitlist: document.getElementById('editEventAllowWaitlist').checked,
            customFields: currentEditingCustomFields.filter(f => f.name.trim() !== '')
        };

        try {
            if (id) {
                await db.collection('events').doc(id).update(data);
                alert("活動更新成功");
            } else {
                await db.collection('events').add(data);
                alert("活動新增成功");
            }
            eventEditModal.style.display = 'none';
        } catch (error) {
            console.error(error);
            alert("儲存失敗：" + error.message);
        }
    });

    function renderAdminEventsList() {
        const tbody = document.getElementById('adminEventsList');
        if (!tbody) return;

        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">目前沒有任何活動</td></tr>';
            return;
        }

        tbody.innerHTML = events.map(e => {
            const regCount = eventRegistrations.filter(r => r.eventId === e.id && r.status !== 'cancelled').length;
            const fullStr = (regCount >= e.capacity) ? '<span style="color:#ef4444; font-size:0.85rem; font-weight:bold;">[已滿]</span>' : '';
            return `
            <tr style="${e.isActive ? '' : 'opacity: 0.6;'}">
                <td><strong><a href="details.html?id=${e.id}" target="_blank" style="color: var(--text-main); text-decoration: none; transition: color 0.3s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-main)'">${e.name} <i class="fas fa-external-link-alt" style="font-size: 0.8rem; margin-left: 5px; color: var(--text-muted);"></i></a></strong></td>
                <td>${e.date} ${e.time}</td>
                <td>${e.location}</td>
                <td>${regCount} / ${e.capacity} ${fullStr}</td>
                <td>${e.isActive ? '<span style="color:#10b981;">開放中</span>' : '<span style="color:#9ca3af;">已隱藏</span>'}</td>
                <td>
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 0.85rem; margin-right: 5px;" onclick="editEvent('${e.id}')">編輯</button>
                    <button class="btn-secondary" style="padding: 5px 10px; font-size: 0.85rem; border-color: #ef4444; color: #ef4444;" onclick="deleteEvent('${e.id}')">刪除</button>
                </td>
            </tr>
            `;
        }).join('');
    }

    window.editEvent = function(id) {
        const ev = events.find(e => e.id === id);
        if (!ev) return;
        document.getElementById('editEventId').value = ev.id;
        document.getElementById('editEventName').value = ev.name || '';
        document.getElementById('editEventCapacity').value = ev.capacity || '';
        document.getElementById('editEventDate').value = ev.date || '';
        document.getElementById('editEventTime').value = ev.time || '';
        document.getElementById('editEventLocation').value = ev.location || '';
        document.getElementById('editEventDesc').value = ev.description || '';
        
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`extName${i}`).value = '';
            document.getElementById(`extVal${i}`).value = '';
        }
        if (ev.extDetails && Array.isArray(ev.extDetails)) {
            ev.extDetails.forEach((ext, index) => {
                if (index < 5) {
                    document.getElementById(`extName${index+1}`).value = ext.name || '';
                    document.getElementById(`extVal${index+1}`).value = ext.value || '';
                }
            });
        }

        document.getElementById('editEventImage').value = ev.image || '';
        document.getElementById('editEventIsActive').checked = ev.isActive !== false;
        document.getElementById('editEventAllowWaitlist').checked = ev.allowWaitlist !== false;
        
        currentEditingCustomFields = ev.customFields ? JSON.parse(JSON.stringify(ev.customFields)) : [];
        renderCustomFieldEditors();

        document.getElementById('eventModalTitle').textContent = '編輯活動';
        eventEditModal.style.display = 'block';
    };

    window.deleteEvent = function(id) {
        if (confirm('確定要刪除此活動嗎？這不會刪除已報名的紀錄，但前台將不會再顯示該活動。')) {
            db.collection('events').doc(id).delete().then(() => alert('已刪除活動'));
        }
    };

    // ==========================================
    // 報到與名單管理
    // ==========================================
    const checkinSelect = document.getElementById('checkinEventSelect');
    const checkinSearch = document.getElementById('checkinSearchInput');

    function updateCheckinSelect() {
        if (!checkinSelect) return;
        const currentVal = checkinSelect.value;
        checkinSelect.innerHTML = '<option value="">請選擇活動...</option>' + events.map(e => 
            `<option value="${e.id}">${e.name} (${e.date})</option>`
        ).join('');
        if (currentVal && events.find(e => e.id === currentVal)) {
            checkinSelect.value = currentVal;
        }
    }

    function renderCheckinList() {
        const tbody = document.getElementById('checkinListBody');
        if (!tbody || !checkinSelect) return;

        const selectedId = checkinSelect.value;
        if (!selectedId) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">請先選擇一個活動</td></tr>';
            document.getElementById('checkinCount').textContent = '0';
            document.getElementById('checkinCapacity').textContent = '0';
            return;
        }

        const ev = events.find(e => e.id === selectedId);
        let list = eventRegistrations.filter(r => r.eventId === selectedId);
        
        const capacity = ev ? parseInt(ev.capacity) || 0 : 0;
        const activeRegs = list.filter(r => r.status === 'registered' || r.status === 'checked-in');
        const checkedInCount = list.filter(r => r.status === 'checked-in').length;
        const availableSpots = capacity - activeRegs.length;

        document.getElementById('checkinCapacity').textContent = capacity;
        document.getElementById('checkinCount').textContent = checkedInCount;

        const progressBar = document.getElementById('checkinProgressBar');
        if (progressBar) {
            progressBar.style.width = capacity > 0 ? (checkedInCount / capacity * 100) + '%' : '0%';
        }

        const keyword = checkinSearch ? checkinSearch.value.trim().toLowerCase() : '';
        if (keyword) {
            list = list.filter(r => 
                (r.userName && r.userName.toLowerCase().includes(keyword)) || 
                (r.userPhone && r.userPhone.includes(keyword)) ||
                (r.id && r.id.toLowerCase().substring(0, 8).includes(keyword))
            );
        }

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">沒有符合條件的名單</td></tr>';
            return;
        }

        list.sort((a, b) => {
            if (a.status === 'cancelled' && b.status !== 'cancelled') return 1;
            if (b.status === 'cancelled' && a.status !== 'cancelled') return -1;
            return a.timestamp > b.timestamp ? 1 : -1;
        });

        let promoteCount = 0;
        tbody.innerHTML = list.map(r => {
            let statusDisplay = `<span style="color:#9ca3af;">未知 (${r.status || '無'})</span>`;
            let actionBtn = '';
            const serialNo = (r.id || '').substring(0, 8).toUpperCase();
            const s = (r.status || '').toLowerCase().trim();

            if (s === 'checked-in') {
                statusDisplay = '<span style="color:#10b981; font-weight:bold;">已報到</span>';
                actionBtn = `<button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem;" onclick="toggleCheckin('${r.id}', 'registered')">取消報到</button>`;
            } else if (s === 'registered') {
                statusDisplay = '<span style="color:var(--text-muted);">未報到</span>';
                actionBtn = `
                    <button class="btn-primary" style="padding:4px 10px; font-size:0.85rem; background:#10b981; border:none; margin-right:5px;" onclick="toggleCheckin('${r.id}', 'checked-in')">報到</button>
                    <button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem; color:#ef4444; border-color:#ef4444;" onclick="cancelRegistration('${r.id}')">取消參加</button>
                `;
            } else if (s === 'waiting' || s === 'waitlist') {
                statusDisplay = '<span style="color:#f59e0b; font-weight:bold;">候補中</span>';
                if (availableSpots > promoteCount) {
                    promoteCount++;
                    actionBtn = `
                        <button class="btn-primary" style="padding:4px 10px; font-size:0.85rem; background:#3b82f6; border:none; margin-right:5px;" onclick="promoteWaitlist('${r.id}', '${selectedId}')">發送遞補通知</button>
                        <button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem; color:#ef4444; border-color:#ef4444;" onclick="cancelRegistration('${r.id}')">取消參加</button>
                    `;
                } else {
                    actionBtn = `
                        <span style="color:var(--text-muted); font-size:0.85rem; margin-right:10px;">等待名額中</span>
                        <button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem; color:#ef4444; border-color:#ef4444;" onclick="cancelRegistration('${r.id}')">取消參加</button>
                    `;
                }
            } else if (s === 'cancelled') {
                statusDisplay = '<span style="color:#9ca3af;">已取消</span>';
                actionBtn = `<span style="color:#9ca3af; font-size:0.85rem;">無操作</span>`;
            }

            return `
            <tr ${s === 'cancelled' ? 'style="opacity: 0.5;"' : ''}>
                <td style="font-family:monospace; color:var(--accent); font-weight:bold;">${serialNo}</td>
                <td style="color:var(--text-main); font-weight:bold;">${r.userName}</td>
                <td>${r.userPhone}</td>
                <td style="font-size:0.85rem; color:var(--text-muted);">${new Date(r.timestamp).toLocaleString('zh-TW')}</td>
                <td>${statusDisplay}</td>
                <td>${actionBtn}</td>
            </tr>
            `;
        }).join('');
    }

    if (checkinSelect) checkinSelect.addEventListener('change', renderCheckinList);
    if (checkinSearch) checkinSearch.addEventListener('input', renderCheckinList);

    window.toggleCheckin = function(regId, newStatus) {
        db.collection('event_registrations').doc(regId).update({ status: newStatus });
    };

    window.cancelRegistration = function(regId) {
        if (confirm("確定取消此報名？將會寄出取消通知信。")) {
            const userReg = eventRegistrations.find(r => r.id === regId);
            const ev = events.find(e => e.id === userReg?.eventId);
            db.collection('event_registrations').doc(regId).update({ status: 'cancelled' }).then(() => {
                if (userReg && ev) sendCancelEmail(userReg, ev);
            });
        }
    };

    window.promoteWaitlist = function(regId, eventId) {
        if (confirm("確定遞補此報名者？將會寄出遞補成功信件。")) {
            const userReg = eventRegistrations.find(r => r.id === regId);
            const ev = events.find(e => e.id === eventId);
            db.collection('event_registrations').doc(regId).update({ status: 'registered' }).then(() => {
                if (userReg && ev) sendWaitlistSuccessEmail(userReg, ev);
            });
        }
    };

    // ==========================================
    // 匯出名冊
    // ==========================================
    const exportCheckinCsvBtn = document.getElementById('exportCheckinCsvBtn');
    if (exportCheckinCsvBtn) {
        exportCheckinCsvBtn.addEventListener('click', () => {
            const selectedId = checkinSelect ? checkinSelect.value : null;
            if (!selectedId) { alert('請先選擇活動'); return; }

            const ev = events.find(e => e.id === selectedId);
            const list = eventRegistrations.filter(r => r.eventId === selectedId);

            let csvContent = "\uFEFF"; // BOM
            csvContent += "表單流水號,姓名,電話,信箱,報名時間,報名狀態\n";
            list.forEach(r => {
                let s = r.status;
                if(s==='checked-in') s='已報到'; else if(s==='registered') s='未報到'; else if(s==='waiting') s='候補中'; else s='已取消';
                csvContent += `"${r.id}","${r.userName}","${r.userPhone}","${r.userEmail}","${new Date(r.timestamp).toLocaleString('zh-TW')}","${s}"\n`;
            });
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `活動名冊_${ev.name}.csv`;
            link.click();
        });
    }

    // ==========================================
    // 儀表板與 Analytics
    // ==========================================
    function renderAnalytics() {
        if (!eventRegistrations) return;
        const totalReg = eventRegistrations.length;
        const checkedIn = eventRegistrations.filter(r => r.status === 'checked-in').length;
        const waiting = eventRegistrations.filter(r => r.status === 'waiting').length;
        const checkInRate = totalReg > 0 ? Math.round((checkedIn / (totalReg - waiting)) * 100) : 0;

        const totalEl = document.getElementById('statTotalReg');
        const rateEl = document.getElementById('statCheckinRate');
        const waitEl = document.getElementById('statWaitingCount');
        
        if(totalEl) totalEl.textContent = totalReg;
        if(rateEl) rateEl.textContent = checkInRate + '%';
        if(waitEl) waitEl.textContent = waiting;
    }

    // ==========================================
    // Email 寄信模組
    // ==========================================
    function sendWaitlistSuccessEmail(regData, eventData) {
        const mainFont = 'system-ui, -apple-system, sans-serif';
        const primaryBg = '#fdfbf7';
        const accentColor = '#d97706';
        const textMain = '#4a3728';

        const emailHtml = `
        <div style="background-color: #f5f1ea; padding: 40px 20px; font-family: ${mainFont};">
            <div style="max-width: 600px; margin: 0 auto; background-color: ${primaryBg}; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(74, 55, 40, 0.1); border: 1px solid #e5e0d8;">
                <div style="background: #ffffff; padding: 45px 20px; text-align: center; border-bottom: 1px solid #f1ece4;">
                    <h1 style="margin: 0; font-size: 26px; color: ${textMain}; letter-spacing: 6px; font-weight: bold;">藝 境 空 間</h1>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: ${accentColor}; letter-spacing: 2px; text-transform: uppercase;">Waitlist Success Notification</p>
                </div>
                <div style="padding: 40px; line-height: 1.8; color: ${textMain};">
                    <p style="margin-bottom: 20px; font-size: 16px;">親愛的 <strong>${regData.userName}</strong> 您好，</p>
                    <p style="margin-bottom: 25px;">好消息！您所候補的活動 <strong style="color: ${accentColor};">${eventData.name}</strong> 已釋出名額，我們已為您轉為正式報名。</p>
                    <div style="background-color: #ffffff; padding: 25px; border-radius: 16px; border: 1px solid #eee; margin-bottom: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: ${textMain}; border-bottom: 2px solid ${accentColor}; display: inline-block; padding-bottom: 5px;">📋 活動資訊</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-top: 15px;">
                            <tr><td style="padding: 10px 0; color: #8d7a6b; width: 100px;">目前狀態</td><td style="padding: 10px 0; font-weight: bold; color: ${accentColor};">報名成功 (Confirmed)</td></tr>
                            <tr><td style="padding: 10px 0; color: #8d7a6b;">活動名稱</td><td style="padding: 10px 0; font-weight: bold;">${eventData.name}</td></tr>
                            <tr><td style="padding: 10px 0; color: #8d7a6b;">活動日期</td><td style="padding: 10px 0; font-weight: bold;">${eventData.date}</td></tr>
                            <tr><td style="padding: 10px 0; color: #8d7a6b;">活動時間</td><td style="padding: 10px 0; font-weight: bold;">${eventData.time}</td></tr>
                            <tr><td style="padding: 10px 0; color: #8d7a6b;">報名序號</td><td style="padding: 10px 0; font-family: monospace; font-size: 18px; color: ${textMain};">${(regData.id || '').substring(0, 8).toUpperCase()}</td></tr>
                        </table>
                    </div>
                    <div style="background-color: #fdfaf5; border: 1px solid rgba(217, 119, 6, 0.1); border-radius: 16px; padding: 25px; margin-bottom: 30px;">
                        <h4 style="margin: 0 0 10px 0; color: #d97706; font-size: 15px;">⚠️ 溫馨提醒</h4>
                        <p style="margin: 0; font-size: 14px; color: #8d7a6b; line-height: 1.6;">
                            為了讓更多喜愛藝文的朋友能參與活動，若您因故不克出席，請務必於活動開始 <strong>2 天前</strong> 聯繫我們。感謝您的配合與體諒！
                        </p>
                    </div>
                    <div style="text-align: center; border-top: 1px solid #f1ece4; padding-top: 30px; margin-top: 20px;">
                        <p style="margin: 0; font-size: 14px; color: #8d7a6b; margin-bottom: 15px;">如果您對活動有任何疑問，歡迎隨時與我們聯繫。</p>
                        <h4 style="margin: 0; font-size: 18px; color: ${textMain};">期待在藝境空間見到您！</h4>
                        <p style="margin: 10px 0 0 0; font-size: 13px; color: #bcae9e;">藝境空間 管理團隊 敬上</p>
                    </div>
                </div>
            </div>
        </div>`;
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: regData.userEmail, subject: `【遞補成功通知】${eventData.name}`, message_html: emailHtml }).catch(console.error);
    }

    function sendCancelEmail(regData, eventData) {
        const mainFont = 'system-ui, -apple-system, sans-serif';
        const primaryBg = '#fdfbf7';
        const accentColor = '#8d7a6b';
        const textMain = '#4a3728';

        const emailHtml = `
        <div style="background-color: #f5f1ea; padding: 40px 20px; font-family: ${mainFont};">
            <div style="max-width: 600px; margin: 0 auto; background-color: ${primaryBg}; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(74, 55, 40, 0.1); border: 1px solid #e5e0d8;">
                <div style="background: #ffffff; padding: 45px 20px; text-align: center; border-bottom: 1px solid #f1ece4;">
                    <h1 style="margin: 0; font-size: 26px; color: ${textMain}; letter-spacing: 6px; font-weight: bold;">藝 境 空 間</h1>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: ${accentColor}; letter-spacing: 2px; text-transform: uppercase;">Registration Cancellation</p>
                </div>
                <div style="padding: 40px; line-height: 1.8; color: ${textMain};">
                    <p style="margin-bottom: 20px; font-size: 16px;">親愛的 <strong>${regData.userName}</strong> 您好，</p>
                    <p style="margin-bottom: 25px;">您好，我們已收到您的取消申請，活動 <strong style="color: ${accentColor};">${eventData.name}</strong> 的報名已正式取消。感謝您主動告知，讓名額能及時釋出給其他參與者。</p>
                    <div style="background-color: #ffffff; padding: 25px; border-radius: 16px; border: 1px solid #eee; margin-bottom: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: ${textMain}; border-bottom: 2px solid ${accentColor}; display: inline-block; padding-bottom: 5px;">📋 活動資訊參考</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-top: 15px;">
                            <tr><td style="padding: 10px 0; color: #8d7a6b; width: 100px;">目前狀態</td><td style="padding: 10px 0; font-weight: bold; color: ${accentColor};">已取消參加</td></tr>
                            <tr><td style="padding: 10px 0; color: #8d7a6b;">活動名稱</td><td style="padding: 10px 0; font-weight: bold;">${eventData.name}</td></tr>
                            <tr><td style="padding: 10px 0; color: #8d7a6b;">活動日期</td><td style="padding: 10px 0; font-weight: bold;">${eventData.date}</td></tr>
                        </table>
                    </div>
                    <div style="text-align: center; border-top: 1px solid #f1ece4; padding-top: 30px; margin-top: 20px;">
                        <p style="margin: 0; font-size: 14px; color: #8d7a6b; margin-bottom: 15px;">如果您對活動有任何疑問，歡迎隨時與我們聯繫。</p>
                        <h4 style="margin: 0; font-size: 18px; color: ${textMain};">期待未來能在其他活動見到您！</h4>
                        <p style="margin: 10px 0 0 0; font-size: 13px; color: #bcae9e;">藝境空間 管理團隊 敬上</p>
                    </div>
                </div>
            </div>
        </div>`;
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: regData.userEmail, subject: `【報名取消確認】${eventData.name}`, message_html: emailHtml }).catch(console.error);
    }

    // 初始化畫面
    setView();
});
