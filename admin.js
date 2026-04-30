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
    
    // 圖表實例
    let trendChart = null;
    let popularChart = null;

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
                b.classList.remove('active');
            });
            btn.classList.add('active');
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
    const surveyFieldsContainer = document.getElementById('surveyFieldsContainer');
    const addSurveyFieldBtn = document.getElementById('addSurveyFieldBtn');
    const closeBtns = document.querySelectorAll('.close-modal, .close-modal-btn');
    
    let currentEditingCustomFields = [];
    let currentEditingSurveyFields = [];

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
        document.getElementById('editEventAutoPromote').checked = true;
        currentEditingCustomFields = [];
        currentEditingSurveyFields = [];
        renderCustomFieldEditors();
        renderSurveyFieldEditors();
        document.getElementById('eventModalTitle').textContent = '新增活動';
        eventEditModal.style.display = 'block';
    });

    if (addCustomFieldBtn) {
        addCustomFieldBtn.addEventListener('click', () => {
            currentEditingCustomFields.push({ name: '', type: 'text', required: true });
            renderCustomFieldEditors();
        });
    }

    if (addSurveyFieldBtn) {
        addSurveyFieldBtn.addEventListener('click', () => {
            currentEditingSurveyFields.push({ name: '', type: 'rating', required: true });
            renderSurveyFieldEditors();
        });
    }

    window.updateCustomField = function(index, key, value) {
        if (currentEditingCustomFields[index]) {
            currentEditingCustomFields[index][key] = value;
        }
    };

    window.updateSurveyField = function(index, key, value) {
        if (currentEditingSurveyFields[index]) {
            currentEditingSurveyFields[index][key] = value;
        }
    };

    window.removeCustomField = function(index) {
        currentEditingCustomFields.splice(index, 1);
        renderCustomFieldEditors();
    };

    window.removeSurveyField = function(index) {
        currentEditingSurveyFields.splice(index, 1);
        renderSurveyFieldEditors();
    };

    function renderCustomFieldEditors() {
        if (!customFieldsContainer) return;
        customFieldsContainer.innerHTML = currentEditingCustomFields.map((f, index) => `
            <div class="form-row" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
                <input type="text" placeholder="報名欄位 (如: 公司名稱)" value="${f.name}" onchange="updateCustomField(${index}, 'name', this.value)" style="flex: 2; min-width: 150px;">
                <select onchange="updateCustomField(${index}, 'type', this.value)" style="flex: 1; min-width: 120px;">
                    <option value="text" ${f.type === 'text' ? 'selected' : ''}>單行文字</option>
                    <option value="tel" ${f.type === 'tel' ? 'selected' : ''}>電話 (手機)</option>
                    <option value="checkbox" ${f.type === 'checkbox' ? 'selected' : ''}>勾選 (Yes/No)</option>
                </select>
                <label style="display: flex; align-items: center; gap: 5px; font-size: 0.85rem; white-space: nowrap; cursor: pointer; margin-right: auto;">
                    <input type="checkbox" ${f.required ? 'checked' : ''} onchange="updateCustomField(${index}, 'required', this.checked)"> 必填
                </label>
                <button type="button" class="btn-danger" onclick="removeCustomField(${index})" style="padding: 5px 12px; font-size: 1.2rem; line-height: 1; border-radius: 6px;">&times;</button>
            </div>
        `).join('');
    }

    function renderSurveyFieldEditors() {
        if (!surveyFieldsContainer) return;
        surveyFieldsContainer.innerHTML = currentEditingSurveyFields.map((f, index) => `
            <div class="form-row" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 15px;">
                <div style="flex: 1; min-width: 200px;">
                    <label style="font-size: 0.8rem; color: var(--text-muted);">題目名稱</label>
                    <input type="text" placeholder="例如：活動內容滿意度" value="${f.name}" onchange="updateSurveyField(${index}, 'name', this.value)" style="width: 100%;">
                </div>
                <div style="width: 150px;">
                    <label style="font-size: 0.8rem; color: var(--text-muted);">題型</label>
                    <select onchange="updateSurveyField(${index}, 'type', this.value)" style="width: 100%;">
                        <option value="rating" ${f.type === 'rating' ? 'selected' : ''}>星級評分</option>
                        <option value="text" ${f.type === 'text' ? 'selected' : ''}>單行文字</option>
                        <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>多行建議</option>
                        <option value="yesno" ${f.type === 'yesno' ? 'selected' : ''}>是否推薦</option>
                    </select>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 20px;">
                    <label style="display: flex; align-items: center; gap: 5px; font-size: 0.85rem; white-space: nowrap; cursor: pointer;">
                        <input type="checkbox" ${f.required ? 'checked' : ''} onchange="updateSurveyField(${index}, 'required', this.checked)"> 必填
                    </label>
                    <button type="button" class="btn-danger" onclick="removeSurveyField(${index})" style="padding: 5px 10px; border-radius: 6px;"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    }

    // ==========================================
    // 問卷結果統計邏輯
    // ==========================================
    const surveyResultsModal = document.getElementById('surveyResultsModal');
    const closeResultsBtns = document.querySelectorAll('.close-results-modal, .close-results-modal-btn');

    closeResultsBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            surveyResultsModal.style.display = 'none';
        });
    });

    window.openSurveyResults = async function(eventId) {
        const ev = events.find(e => e.id === eventId);
        if (!ev) return;

        document.getElementById('resultsEventName').textContent = `活動：${ev.name}`;
        document.getElementById('resultsDetailList').innerHTML = '<p style="text-align:center; padding:20px;">分析中...</p>';
        surveyResultsModal.style.display = 'block';

        try {
            const snapshot = await db.collection('event_surveys')
                .where('eventId', '==', eventId)
                .get();

            if (snapshot.empty) {
                renderEmptyStats();
                return;
            }

            let data = [];
            snapshot.forEach(doc => data.push(doc.data()));
            
            // 在程式端進行排序 (時間由新到舊)
            data.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

            // 計算統計數據
            let totalRating = 0;
            let ratingCount = 0;
            let recommendYes = 0;

            const listHtml = data.map(s => {
                let ratingHtml = '';
                // 處理可能存在的評分資料 (相容新舊格式)
                let r = s.rating;
                if (s.answers) {
                    Object.keys(s.answers).forEach(k => {
                        if (k.includes('滿意度') || k.includes('評分')) {
                            const val = parseInt(s.answers[k]);
                            if (!isNaN(val)) { r = val; }
                        }
                    });
                }

                if (r) {
                    totalRating += r;
                    ratingCount++;
                    ratingHtml = `<div style="color:#d97706; font-size:0.85rem; margin-bottom:5px;">${'★'.repeat(r)}${'☆'.repeat(5-r)}</div>`;
                }

                // 處理推薦意願 (相容新舊格式)
                let rec = s.recommend;
                if (s.answers) {
                    Object.keys(s.answers).forEach(k => {
                        if (k.includes('推薦')) {
                            if (s.answers[k].includes('願意')) rec = 'yes';
                        }
                    });
                }
                if (rec === 'yes') recommendYes++;

                // 組合答案清單
                let answersHtml = '';
                if (s.answers) {
                    answersHtml = Object.entries(s.answers).map(([q, a]) => `
                        <div style="margin-bottom:8px;">
                            <span style="color:var(--text-muted); font-size:0.8rem;">Q: ${q}</span><br>
                            <span style="font-size:0.95rem;">${a || '(未填寫)'}</span>
                        </div>
                    `).join('');
                } else {
                    // 舊資料格式
                    answersHtml = `
                        <p style="font-size:0.95rem;"><b>最喜歡：</b>${s.favoritePart || '無'}</p>
                        <p style="font-size:0.95rem;"><b>建議：</b>${s.suggestions || '無'}</p>
                    `;
                }

                return `
                    <div style="background:#fdfbf7; border:1px solid #eee; border-radius:10px; padding:15px; margin-bottom:15px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #f0f0f0; padding-bottom:8px;">
                            <span style="font-weight:bold;">${s.userName}</span>
                            <span style="font-size:0.75rem; color:#aaa;">${new Date(s.submittedAt).toLocaleDateString()}</span>
                        </div>
                        ${ratingHtml}
                        ${answersHtml}
                    </div>
                `;
            }).join('');

            // 更新 UI
            const avg = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : "0.0";
            document.getElementById('avgRating').textContent = avg;
            document.getElementById('avgStars').innerHTML = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));
            document.getElementById('totalResponses').textContent = data.length;
            document.getElementById('recommendRate').textContent = `${Math.round((recommendYes / data.length) * 100)}%`;
            document.getElementById('resultsDetailList').innerHTML = listHtml;

        } catch (err) {
            console.error("載入統計失敗:", err);
            document.getElementById('resultsDetailList').innerHTML = '<p style="color:red; text-align:center; padding:20px;">載入數據失敗，請確認 Firebase Rules 是否已發布。</p>';
        }
    };

    function renderEmptyStats() {
        document.getElementById('avgRating').textContent = "0.0";
        document.getElementById('avgStars').innerHTML = '☆☆☆☆☆';
        document.getElementById('totalResponses').textContent = "0";
        document.getElementById('recommendRate').textContent = "0%";
        document.getElementById('resultsDetailList').innerHTML = '<p style="text-align:center; padding:40px; color:#aaa;">目前尚無問卷回饋數據。</p>';
    }

    // ==========================================
    // 問卷設計 Modal 邏輯 (獨立於活動編輯)
    // ==========================================
    const surveyDesignModal = document.getElementById('surveyDesignModal');
    const surveyDesignForm = document.getElementById('surveyDesignForm');
    const closeSurveyBtns = document.querySelectorAll('.close-survey-modal, .close-survey-modal-btn');

    closeSurveyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            surveyDesignModal.style.display = 'none';
        });
    });

    window.openSurveyDesign = function(eventId) {
        const ev = events.find(e => e.id === eventId);
        if (!ev) return;

        document.getElementById('surveyEventId').value = eventId;
        document.getElementById('surveyEventName').textContent = `活動：${ev.name}`;
        
        // 如果還沒設定過問卷，則預填入三項標準題目
        if (!ev.surveyFields || ev.surveyFields.length === 0) {
            currentEditingSurveyFields = [
                { name: '您對本次活動的整體滿意度？', type: 'rating', required: true },
                { name: '對本次活動的意見與建議', type: 'textarea', required: false },
                { name: '您是否願意將此活動推薦給朋友？', type: 'yesno', required: true }
            ];
        } else {
            currentEditingSurveyFields = JSON.parse(JSON.stringify(ev.surveyFields));
        }
        
        renderSurveyFieldEditors();
        surveyDesignModal.style.display = 'block';
    };

    surveyDesignForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = document.getElementById('surveyEventId').value;
        const submitBtn = surveyDesignForm.querySelector('button[type="submit"]');
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 儲存中...';

        try {
            await db.collection('events').doc(eventId).update({
                surveyFields: currentEditingSurveyFields.filter(f => f.name.trim() !== '')
            });
            
            // 同步更新本地資料
            const evIndex = events.findIndex(ev => ev.id === eventId);
            if (evIndex !== -1) {
                events[evIndex].surveyFields = currentEditingSurveyFields.filter(f => f.name.trim() !== '');
            }

            alert('問卷設計已儲存！');
            surveyDesignModal.style.display = 'none';
        } catch (err) {
            console.error("儲存問卷失敗:", err);
            alert("儲存失敗，請重試。");
        }
        
        submitBtn.disabled = false;
        submitBtn.textContent = '儲存問卷設定';
    });

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
            autoPromote: document.getElementById('editEventAutoPromote').checked,
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
                <td>${regCount} / ${e.capacity} ${fullStr}</td>
                <td><i class="far fa-eye"></i> ${e.views || 0}</td>
                <td>${e.isActive ? '<span style="color:#10b981;">開放中</span>' : '<span style="color:#9ca3af;">已隱藏</span>'}</td>
                <td style="white-space: nowrap;">
                    <div style="display: flex; gap: 6px;">
                        <button class="btn-action-edit" onclick="editEvent('${e.id}')" title="編輯活動">
                            <i class="fas fa-edit"></i> 編輯
                        </button>
                        <button class="btn-action-survey" onclick="openSurveyDesign('${e.id}')" title="設計問卷">
                            <i class="fas fa-poll-h"></i> 問卷
                        </button>
                        <button class="btn-action-results" onclick="openSurveyResults('${e.id}')" title="問卷統計結果">
                            <i class="fas fa-chart-pie"></i> 結果
                        </button>
                        <button class="btn-action-delete" onclick="deleteEvent('${e.id}')" title="刪除活動">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
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
        document.getElementById('editEventAutoPromote').checked = ev.autoPromote !== false;
        
        currentEditingCustomFields = ev.customFields ? JSON.parse(JSON.stringify(ev.customFields)) : [];
        currentEditingSurveyFields = ev.surveyFields ? JSON.parse(JSON.stringify(ev.surveyFields)) : [];
        renderCustomFieldEditors();
        renderSurveyFieldEditors();

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
    // QR Code 掃描報到
    // ==========================================
    const openScannerBtn = document.getElementById('openScannerBtn');
    const qrScannerModal = document.getElementById('qrScannerModal');
    const closeScannerBtn = document.querySelector('.close-scanner');
    const scannerResult = document.getElementById('scannerResult');
    let html5QrCode = null;

    if (openScannerBtn) {
        openScannerBtn.addEventListener('click', () => {
            qrScannerModal.style.display = 'block';
            startScanner();
        });
    }

    if (closeScannerBtn) {
        closeScannerBtn.addEventListener('click', () => {
            stopScanner();
            qrScannerModal.style.display = 'none';
        });
    }

    function startScanner() {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }
        
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        html5QrCode.start(
            { facingMode: "environment" }, 
            config,
            onScanSuccess
        ).catch(err => {
            console.error("無法開啟相機:", err);
            alert("無法開啟相機，請檢查權限設定");
        });
    }

    function stopScanner() {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                console.log("掃描器已停止");
            }).catch(err => console.error("停止失敗:", err));
        }
        if (scannerResult) {
            scannerResult.style.display = 'none';
            scannerResult.innerHTML = '';
        }
    }

    async function onScanSuccess(decodedText) {
        // decodedText 即為 registrationId
        console.log("掃描到序號:", decodedText);
        
        // 播放成功音效 (可選)
        // 避免重複掃描
        if (scannerResult.style.display === 'block' && scannerResult.dataset.lastId === decodedText) return;

        try {
            const regRef = db.collection('event_registrations').doc(decodedText);
            const regDoc = await regRef.get();

            if (!regDoc.exists) {
                showScannerFeedback("無效的序號", "error");
                return;
            }

            const data = regDoc.data();
            
            // 檢查活動是否符合 (可選：限制只能掃描目前選取的活動)
            const selectedEventId = checkinSelect.value;
            if (selectedEventId && data.eventId !== selectedEventId) {
                showScannerFeedback(`序號正確，但活動不符：<br>${data.eventName}`, "warning");
                return;
            }

            if (data.status === 'checked-in') {
                showScannerFeedback(`此序號已於先前報到：<br><strong>${data.userName}</strong>`, "warning");
            } else if (data.status === 'registered') {
                await regRef.update({ status: 'checked-in' });
                showScannerFeedback(`報到成功！<br>歡迎您，<strong>${data.userName}</strong>`, "success");
            } else {
                showScannerFeedback(`此序號狀態不符 (${data.status})，無法報到。`, "error");
            }
            
            scannerResult.dataset.lastId = decodedText;

        } catch (err) {
            console.error("掃描處理出錯:", err);
            showScannerFeedback("讀取資料失敗", "error");
        }
    }

    function showScannerFeedback(msg, type) {
        scannerResult.style.display = 'block';
        scannerResult.innerHTML = msg;
        
        if (type === 'success') {
            scannerResult.style.background = '#d1fae5';
            scannerResult.style.color = '#065f46';
            scannerResult.style.border = '1px solid #10b981';
        } else if (type === 'warning') {
            scannerResult.style.background = '#fef3c7';
            scannerResult.style.color = '#92400e';
            scannerResult.style.border = '1px solid #f59e0b';
        } else {
            scannerResult.style.background = '#fee2e2';
            scannerResult.style.color = '#991b1b';
            scannerResult.style.border = '1px solid #ef4444';
        }
    }

    // ==========================================
    // 發送行前提醒
    // ==========================================
    const sendRemindersBtn = document.getElementById('sendRemindersBtn');
    if (sendRemindersBtn) {
        sendRemindersBtn.addEventListener('click', async () => {
            const selectedId = checkinSelect.value;
            if (!selectedId) { alert('請先選擇活動'); return; }

            const ev = events.find(e => e.id === selectedId);
            const list = eventRegistrations.filter(r => r.eventId === selectedId && r.status === 'registered');

            if (list.length === 0) {
                alert('目前沒有需要發送提醒的正式報名者 (可能已全部報到或尚未有人報名)。');
                return;
            }

            if (!confirm(`確定要發送「行前提醒信」給這 ${list.length} 位參加者嗎？\n這將會包含活動資訊與報到 QR Code。`)) return;

            sendRemindersBtn.disabled = true;
            let successCount = 0;

            for (let i = 0; i < list.length; i++) {
                const reg = list[i];
                sendRemindersBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 發送中 (${i + 1}/${list.length})`;
                
                try {
                    await sendReminderEmail(reg, ev);
                    successCount++;
                } catch (err) {
                    console.error(`發送給 ${reg.userName} 失敗:`, err);
                }
                
                // 稍微延遲避免頻率限制
                await new Promise(resolve => setTimeout(resolve, 800));
            }

            alert(`提醒信發送完成！\n成功：${successCount} 封\n失敗：${list.length - successCount} 封`);
            sendRemindersBtn.disabled = false;
            sendRemindersBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 發送提醒';
        });
    }

    async function sendReminderEmail(regData, eventData) {
        const mainFont = 'system-ui, -apple-system, sans-serif';
        const primaryBg = '#fdfbf7';
        const accentColor = '#d97706';
        const textMain = '#4a3728';

        const emailHtml = `
        <div style="background-color: #f5f1ea; padding: 40px 20px; font-family: ${mainFont};">
            <div style="max-width: 600px; margin: 0 auto; background-color: ${primaryBg}; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(74, 55, 40, 0.1); border: 1px solid #e5e0d8;">
                <div style="background: #ffffff; padding: 45px 20px; text-align: center; border-bottom: 1px solid #f1ece4;">
                    <h1 style="margin: 0; font-size: 26px; color: ${textMain}; letter-spacing: 6px; font-weight: bold;">藝 境 空 間</h1>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: ${accentColor}; letter-spacing: 2px; text-transform: uppercase;">Event Reminder</p>
                </div>
                <div style="padding: 40px; line-height: 1.8; color: ${textMain};">
                    <p style="margin-bottom: 20px; font-size: 16px;">親愛的 <strong>${regData.userName}</strong> 您好，</p>
                    <p style="margin-bottom: 25px;">這是一封行前提醒！我們非常期待與您在活動 <strong style="color: ${accentColor};">${eventData.name}</strong> 見面。</p>
                    
                    <div style="background-color: #ffffff; padding: 25px; border-radius: 16px; border: 1px solid #eee; margin-bottom: 30px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: ${textMain}; border-bottom: 2px solid ${accentColor}; display: inline-block; padding-bottom: 5px;">📅 活動資訊回顧</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-top: 15px;">
                            <tr><td style="padding: 8px 0; color: #8d7a6b; width: 100px;">日期</td><td style="padding: 8px 0; font-weight: bold;">${eventData.date}</td></tr>
                            <tr><td style="padding: 8px 0; color: #8d7a6b;">時間</td><td style="padding: 8px 0; font-weight: bold;">${eventData.time}</td></tr>
                            <tr><td style="padding: 8px 0; color: #8d7a6b;">地點</td><td style="padding: 8px 0; font-weight: bold;">${eventData.location}</td></tr>
                        </table>
                    </div>

                    <div style="text-align: center; background: #ffffff; padding: 30px; border-radius: 16px; border: 1px dashed #d97706; margin-bottom: 30px;">
                        <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: bold; color: #d97706;">📌 報到憑證</p>
                        <img src="https://quickchart.io/chart?cht=qr&chs=180x180&chl=${regData.id}&choe=UTF-8" width="180" height="180" alt="QR Code" style="display: block; margin: 0 auto;">
                        <p style="margin: 15px 0 0 0; font-size: 14px; color: #4a3728;">請於抵達現場時<strong>預先開啟此 QR Code</strong></p>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #8d7a6b;">(若無法開啟，憑手機末三碼亦可報到)</p>
                    </div>

                    <div style="text-align: center; border-top: 1px solid #f1ece4; padding-top: 30px; margin-top: 20px;">
                        <h4 style="margin: 0; font-size: 18px; color: ${textMain};">期待您的光臨！</h4>
                        <p style="margin: 10px 0 0 0; font-size: 13px; color: #bcae9e;">藝境空間 管理團隊 敬上</p>
                    </div>
                </div>
            </div>
        </div>`;

        return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { 
            to_email: regData.userEmail, 
            subject: `【行前提醒】${eventData.name}`, 
            message_html: emailHtml 
        });
    }

    // ==========================================
    // 發送滿意度問卷
    // ==========================================
    const sendSurveysBtn = document.getElementById('sendSurveysBtn');
    if (sendSurveysBtn) {
        sendSurveysBtn.addEventListener('click', async () => {
            const selectedId = checkinSelect.value;
            if (!selectedId) { alert('請先選擇活動'); return; }

            const ev = events.find(e => e.id === selectedId);
            // 只發送給「已報到」的參加者
            const list = eventRegistrations.filter(r => r.eventId === selectedId && r.status === 'checked-in');

            if (list.length === 0) {
                alert('目前沒有已報到的參加者，無法發送問卷。');
                return;
            }

            if (!confirm(`確定要對這 ${list.length} 位「已報到」的參加者發送滿意度問卷嗎？`)) return;

            sendSurveysBtn.disabled = true;
            let successCount = 0;

            for (let i = 0; i < list.length; i++) {
                const reg = list[i];
                sendSurveysBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 發送中 (${i + 1}/${list.length})`;
                try {
                    await sendSurveyEmail(reg, ev);
                    successCount++;
                } catch (err) {
                    console.error(`問卷發送失敗 (${reg.userName}):`, err);
                }
                await new Promise(resolve => setTimeout(resolve, 800));
            }

            alert(`問卷發送完成！\n成功：${successCount} 封`);
            sendSurveysBtn.disabled = false;
            sendSurveysBtn.innerHTML = '<i class="fas fa-poll-h"></i> 發送問卷';
        });
    }

    async function sendSurveyEmail(regData, eventData) {
        const emailHtml = `
        <div style="background-color: #fdfbf7; padding: 40px; font-family: sans-serif; border: 1px solid #e5e0d8; border-radius: 20px; text-align: center;">
            <h2 style="color: #d97706;">感謝您的參與！</h2>
            <p style="font-size: 16px; color: #4a3728;">親愛的 <strong>${regData.userName}</strong> 您好，</p>
            <p>感謝您參加活動《<strong>${eventData.name}</strong>》，希望能為您帶來一段美好的藝術時光。</p>
            <p>為了讓我們做得更好，誠摯邀請您填寫一份簡單的滿意度問卷：</p>
            <div style="margin: 30px 0;">
                <a href="https://a3614todoo-ship-it.github.io/event/survey.html?id=${regData.id}" 
                   style="display: inline-block; padding: 15px 35px; background: #4a3728; color: white; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px;">
                   填寫問卷回饋
                </a>
            </div>
            <p style="color: #8d7a6b; font-size: 14px;">(填寫時間約只需 1 分鐘，您的建議對我們非常重要)</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 13px; color: #bcae9e;">藝境空間 管理團隊 敬上</p>
        </div>`;

        return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: regData.userEmail,
            to_name: regData.userName,
            subject: `【活動回饋】期待聽到您對《${eventData.name}》的看法`,
            message_html: emailHtml
        });
    }

    // ==========================================
    // 匯出問卷結果
    // ==========================================
    const exportSurveysBtn = document.getElementById('exportSurveysBtn');
    if (exportSurveysBtn) {
        exportSurveysBtn.addEventListener('click', async () => {
            const selectedId = checkinSelect.value;
            if (!selectedId) { alert('請先選擇活動'); return; }

            exportSurveysBtn.disabled = true;
            exportSurveysBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 讀取中...';

            try {
                const snapshot = await db.collection('event_surveys')
                    .where('eventId', '==', selectedId)
                    .get();

                if (snapshot.empty) {
                    alert('目前尚無該活動的問卷回饋。');
                    exportSurveysBtn.disabled = false;
                    exportSurveysBtn.innerHTML = '<i class="fas fa-file-export"></i> 匯出問卷';
                    return;
                }

                let data = [];
                snapshot.forEach(doc => data.push(doc.data()));
                data.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

                // 動態獲取標題列：姓名、Email + 所有不重複的問題名稱
                let dynamicHeaders = [];
                data.forEach(s => {
                    if (s.answers) {
                        Object.keys(s.answers).forEach(k => {
                            if (!dynamicHeaders.includes(k)) dynamicHeaders.push(k);
                        });
                    }
                });

                // 如果完全沒有 answers 欄位 (舊資料相容)，使用預設標題
                if (dynamicHeaders.length === 0) {
                    dynamicHeaders = ["滿意度評分", "最喜歡的部分", "建議與留言", "推薦意願"];
                }

                const header = ["填寫時間", "姓名", "Email", ...dynamicHeaders];
                const rows = data.map(s => {
                    const base = [s.submittedAt, s.userName, s.userEmail];
                    const dynamicValues = dynamicHeaders.map(h => {
                        let val = "";
                        if (s.answers && s.answers[h] !== undefined) {
                            val = s.answers[h];
                        } else {
                            // 舊資料相容性處理
                            if (h === "滿意度評分") val = s.rating;
                            else if (h === "最喜歡的部分") val = s.favoritePart;
                            else if (h === "建議與留言") val = s.suggestions;
                            else if (h === "推薦意願") val = s.recommend === 'yes' ? '願意' : '考慮中';
                        }
                        return `"${String(val).replace(/"/g, '""')}"`;
                    });
                    return [...base, ...dynamicValues];
                });

                let csvContent = "\uFEFF" + header.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
                
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `問卷回饋_${data[0].eventName}_${new Date().toLocaleDateString()}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                alert(`成功匯出 ${data.length} 份問卷結果！`);
            } catch (err) {
                console.error("匯出問卷失敗:", err);
                alert("匯出失敗，請檢查權限或稍後再試。");
            }

            exportSurveysBtn.disabled = false;
            exportSurveysBtn.innerHTML = '<i class="fas fa-file-export"></i> 匯出問卷';
        });
    }

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
    function initCharts() {
        const trendCtx = document.getElementById('registrationTrendChart');
        const popularCtx = document.getElementById('popularEventsChart');
        if (!trendCtx || !popularCtx) return;

        trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '報名人數',
                    data: [],
                    borderColor: '#d97706',
                    backgroundColor: 'rgba(217, 119, 6, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });

        popularChart = new Chart(popularCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: '累計報名',
                    data: [],
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    function renderAnalytics() {
        if (!eventRegistrations || !events) return;
        const totalReg = eventRegistrations.length;
        const activeRegs = eventRegistrations.filter(r => r.status !== 'cancelled');
        const checkedIn = activeRegs.filter(r => r.status === 'checked-in').length;
        const waiting = activeRegs.filter(r => r.status === 'waiting').length;
        const checkInRate = activeRegs.length > 0 ? Math.round((checkedIn / activeRegs.length) * 100) : 0;

        // 更新舊版卡片
        const totalEl = document.getElementById('statTotalReg');
        const rateEl = document.getElementById('statCheckinRate');
        const waitEl = document.getElementById('statWaitingCount');
        if(totalEl) totalEl.textContent = activeRegs.length;
        if(rateEl) rateEl.textContent = checkInRate + '%';
        if(waitEl) waitEl.textContent = waiting;

        // 更新新版卡片 (v2)
        const totalV2 = document.getElementById('statTotalReg-v2');
        const checkV2 = document.getElementById('statCheckedIn-v2');
        const waitV2 = document.getElementById('statWaitingCount-v2');
        const rateV2 = document.getElementById('statCheckinRate-v2');
        if(totalV2) totalV2.textContent = activeRegs.length;
        if(checkV2) checkV2.textContent = checkedIn;
        if(waitV2) waitV2.textContent = waiting;
        if(rateV2) rateV2.textContent = checkInRate + '%';

        // 1. 近 7 日報名趨勢
        updateTrendChart();

        // 2. 熱門活動排行
        updatePopularChart();

        // 3. 活動報到率排行表格
        updateRankingTable();
    }

    function updateTrendChart() {
        if (!trendChart) return;
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last7Days.push(d.toISOString().split('T')[0]);
        }

        const counts = last7Days.map(dateStr => {
            return eventRegistrations.filter(r => r.timestamp.startsWith(dateStr)).length;
        });

        trendChart.data.labels = last7Days.map(d => d.split('-').slice(1).join('/'));
        trendChart.data.datasets[0].data = counts;
        trendChart.update();
    }

    function updatePopularChart() {
        if (!popularChart) return;
        const eventStats = events.map(e => {
            const count = eventRegistrations.filter(r => r.eventId === e.id && r.status !== 'cancelled').length;
            return { name: e.name, count: count };
        });

        eventStats.sort((a, b) => b.count - a.count);
        const top5 = eventStats.slice(0, 5);

        popularChart.data.labels = top5.map(s => s.name.length > 10 ? s.name.substring(0, 10) + '...' : s.name);
        popularChart.data.datasets[0].data = top5.map(s => s.count);
        popularChart.update();
    }

    function updateRankingTable() {
        const tbody = document.getElementById('rankingTableBody');
        if (!tbody) return;

        const rankings = events.map(e => {
            const regCount = eventRegistrations.filter(r => r.eventId === e.id && r.status !== 'cancelled').length;
            const checkedInCount = eventRegistrations.filter(r => r.eventId === e.id && r.status === 'checked-in').length;
            const views = e.views || 0;
            const checkinRate = regCount > 0 ? Math.round((checkedInCount / regCount) * 100) : 0;
            const conversionRate = views > 0 ? Math.round((regCount / views) * 100) : 0;
            
            return { 
                name: e.name, 
                views: views,
                conversionRate: conversionRate,
                rate: checkinRate, 
                detail: `${checkedInCount} / ${e.capacity}` 
            };
        });

        rankings.sort((a, b) => b.views - a.views); // 預設依點擊數排序

        tbody.innerHTML = rankings.map((r, i) => `
            <tr>
                <td><span class="rank-badge ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</span></td>
                <td style="font-weight: 500;">${r.name}</td>
                <td><i class="far fa-eye" style="color: #6366f1;"></i> ${r.views}</td>
                <td><strong style="color: #8b5cf6;">${r.conversionRate}%</strong></td>
                <td><strong style="color: ${r.rate > 70 ? '#10b981' : (r.rate > 30 ? '#f59e0b' : '#ef4444')}">${r.rate}%</strong></td>
                <td style="color: var(--text-muted); font-size: 0.9rem;">${r.detail}</td>
            </tr>
        `).join('');
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

                    <div style="text-align: center; background: #ffffff; padding: 30px; border-radius: 16px; border: 1px dashed #d97706; margin-bottom: 30px;">
                        <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: bold; color: #d97706;">📌 報到憑證</p>
                        <img src="https://quickchart.io/chart?cht=qr&chs=180x180&chl=${regData.id}&choe=UTF-8" width="180" height="180" alt="QR Code" style="display: block; margin: 0 auto;">
                        <p style="margin: 15px 0 0 0; font-size: 14px; color: #4a3728;">請於抵達現場時<strong>預先開啟此 QR Code</strong></p>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #8d7a6b;">(若無法開啟，憑手機末三碼亦可報到)</p>
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
    initCharts();
    setView();
});
