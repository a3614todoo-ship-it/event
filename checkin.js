/**
 * 藝境空間 | 現場獨立報到系統 核心邏輯
 * 專為現場工作人員設計，僅限掃描 QR Code 報到與手動名單搜尋與報到。
 */

const firebaseConfig = {
    apiKey: "AIzaSyBmymCsLnheBKGunfZGskM1Ut_Swb13ZhA",
    authDomain: "company-events-620bd.firebaseapp.com",
    projectId: "company-events-620bd",
    storageBucket: "company-events-620bd.firebasestorage.app",
    messagingSenderId: "484682651822",
    appId: "1:484682651822:web:1a7d612263f470c020353f",
    measurementId: "G-7YNHQYDXPZ"
};

// 初始化 Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// 全域變數
let currentEventId = '';
let currentEvent = null;
let registrations = [];
let eventsList = [];
let html5QrcodeScanner = null;
let eventsUnsubscribe = null;
let registrationsUnsubscribe = null;

// DOM 元素
const loginScreen = document.getElementById('loginScreen');
const checkinPanel = document.getElementById('checkinPanel');
const userInfo = document.getElementById('userInfo');
const userEmailSpan = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');

const adminUsernameInput = document.getElementById('adminUsername');
const adminPasswordInput = document.getElementById('adminPassword');
const loginSubmitBtn = document.getElementById('loginSubmit');

const eventSelect = document.getElementById('eventSelect');
const totalCapSpan = document.getElementById('totalCap');
const totalRegSpan = document.getElementById('totalReg');
const totalCheckinSpan = document.getElementById('totalCheckin');

const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const checkinListBody = document.getElementById('checkinListBody');

// 彈出視窗
const feedbackModal = document.getElementById('feedbackModal');
const modalIcon = document.getElementById('modalIcon');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');

// ==========================================
// 1. 身分驗證與狀態監聽
// ==========================================

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // 使用者已登入
        console.log("Firebase Auth：工作人員已登入", user.email);
        userEmailSpan.textContent = user.email;
        loginScreen.style.display = 'none';
        checkinPanel.style.display = 'block';
        userInfo.style.display = 'flex';
        
        loadEvents();
        startCameraScanner();
    } else {
        // 未登入，重設 UI 與清理監聽
        console.log("Firebase Auth：未登入");
        loginScreen.style.display = 'flex';
        checkinPanel.style.display = 'none';
        userInfo.style.display = 'none';
        
        if (eventsUnsubscribe) eventsUnsubscribe();
        if (registrationsUnsubscribe) registrationsUnsubscribe();
        stopCameraScanner();
    }
});

// 手動登入
loginSubmitBtn.addEventListener('click', async () => {
    const email = adminUsernameInput.value.trim();
    const pass = adminPasswordInput.value.trim();

    if (!email || !pass) {
        alert('請輸入登入帳號與密碼');
        return;
    }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = '驗證中...';

    try {
        await firebase.auth().signInWithEmailAndPassword(email, pass);
        adminUsernameInput.value = '';
        adminPasswordInput.value = '';
    } catch (error) {
        console.error("登入失敗:", error);
        alert(`驗證失敗: 帳號密碼錯誤或權限不足`);
    } finally {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = '登入系統';
    }
});

// 登出
logoutBtn.addEventListener('click', async () => {
    try {
        await firebase.auth().signOut();
    } catch (err) {
        console.error("登出失敗:", err);
    }
});

// ==========================================
// 2. 資料載入與監聽
// ==========================================

// 載入活動清單
function loadEvents() {
    if (eventsUnsubscribe) eventsUnsubscribe();
    
    eventsUnsubscribe = db.collection("events").orderBy("date", "desc").onSnapshot((snapshot) => {
        eventsList = [];
        let html = '<option value="">-- 請選擇一個活動項目 --</option>';
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            eventsList.push({ id: doc.id, ...data });
            html += `<option value="${doc.id}">${data.name} (${data.startDate || data.date || ''})</option>`;
        });
        
        eventSelect.innerHTML = html;
        
        // 保持之前選取的活動狀態
        if (currentEventId && eventsList.some(e => e.id === currentEventId)) {
            eventSelect.value = currentEventId;
            updateEventDetails();
        }
    }, (error) => {
        console.error("加載活動項目失敗:", error);
    });
}

// 選擇活動變更事件
eventSelect.addEventListener('change', (e) => {
    currentEventId = e.target.value;
    updateEventDetails();
});

// 更新活動詳情與訂閱報名名單
function updateEventDetails() {
    if (registrationsUnsubscribe) registrationsUnsubscribe();
    checkinListBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">載入名單中...</td></tr>';
    
    if (!currentEventId) {
        totalCapSpan.textContent = '0';
        totalRegSpan.textContent = '0';
        totalCheckinSpan.textContent = '0';
        checkinListBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">請先選擇一個活動項目以載入報到名單</td></tr>';
        return;
    }
    
    currentEvent = eventsList.find(e => e.id === currentEventId);
    if (!currentEvent) return;
    
    // 更新活動限額
    totalCapSpan.textContent = currentEvent.capacity || '不限';
    
    // 訂閱名單即時更新
    registrationsUnsubscribe = db.collection("event_registrations")
        .where("eventId", "==", currentEventId)
        .onSnapshot((snapshot) => {
            registrations = [];
            snapshot.forEach((doc) => {
                registrations.push({ id: doc.id, ...doc.data() });
            });
            
            // 排序：名單依姓名排序，方便手動核對
            registrations.sort((a, b) => (a.userName || '').localeCompare(b.userName || '', 'zh-Hant'));
            
            renderStatsAndList();
        }, (error) => {
            console.error("訂閱報名名單失敗:", error);
            checkinListBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ef4444; padding: 30px;">無權限讀取名單，請確認該帳戶已加入 Firestore 的 isAdmin 授權中。</td></tr>`;
        });
}

// 渲染進度數據與表格名單
function renderStatsAndList() {
    const activeRegs = registrations.filter(r => r.status !== 'cancelled' && r.status !== 'payment_expired');
    const checkedInRegs = activeRegs.filter(r => r.status === 'checkedin' || r.checkedIn === true);
    
    totalRegSpan.textContent = activeRegs.length;
    totalCheckinSpan.textContent = checkedInRegs.length;
    
    const query = searchInput.value.trim().toLowerCase();
    const filter = statusFilter.value;
    
    let filtered = activeRegs;
    
    // 狀態過濾
    if (filter === 'registered') {
        filtered = activeRegs.filter(r => r.status !== 'checkedin' && !r.checkedIn);
    } else if (filter === 'checkedin') {
        filtered = activeRegs.filter(r => r.status === 'checkedin' || r.checkedIn);
    } else if (filter === 'waiting') {
        filtered = registrations.filter(r => r.status === 'waiting');
    }
    
    // 關鍵字搜尋 (姓名、手機、序號)
    if (query) {
        filtered = filtered.filter(r => 
            (r.userName || '').toLowerCase().includes(query) ||
            (r.userPhone || '').toLowerCase().includes(query) ||
            (r.id || '').toLowerCase().includes(query)
        );
    }
    
    if (filtered.length === 0) {
        checkinListBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">找不到符合條件的報名資料</td></tr>';
        return;
    }
    
    checkinListBody.innerHTML = filtered.map(r => {
        const isChecked = r.status === 'checkedin' || r.checkedIn === true;
        const phone = r.userPhone || '無';
        const serial = (r.id || '').substring(0, 8).toUpperCase();
        
        let statusBadge = `<span class="badge badge-registered">已報名</span>`;
        if (isChecked) statusBadge = `<span class="badge badge-checkedin">已報到</span>`;
        if (r.status === 'waiting') statusBadge = `<span class="badge badge-waiting">候補中</span>`;
        
        const checkinTime = r.checkinTime ? new Date(r.checkinTime).toLocaleTimeString('zh-TW', {hour12:false, hour:'2-digit', minute:'2-digit'}) : '-';
        
        const button = isChecked 
            ? `<button class="action-btn btn-uncheck" onclick="updateCheckinStatus('${r.id}', false)"><i class="fa-solid fa-rotate-left"></i> 取消報到</button>`
            : `<button class="action-btn btn-checkin" onclick="updateCheckinStatus('${r.id}', true)"><i class="fa-solid fa-check"></i> 點擊報到</button>`;
            
        return `
            <tr>
                <td style="font-family: monospace; font-weight: 700; color: #555;">${serial}</td>
                <td style="font-weight: 500;">${escapeHtml(r.userName)}</td>
                <td>${escapeHtml(phone)}</td>
                <td>${statusBadge}</td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${checkinTime}</td>
                <td style="text-align: right;">${r.status === 'waiting' ? '-' : button}</td>
            </tr>
        `;
    }).join('');
}

// 監聽關鍵字與篩選切換
searchInput.addEventListener('input', renderStatsAndList);
statusFilter.addEventListener('change', renderStatsAndList);

// ==========================================
// 3. 報到寫入與異動
// ==========================================

// 執行報到 / 取消報到狀態寫入
window.updateCheckinStatus = async function(regId, checkInBool) {
    if (!regId) return;
    try {
        const updateData = {
            status: checkInBool ? 'checkedin' : 'registered',
            checkedIn: checkInBool,
            checkinTime: checkInBool ? new Date().toISOString() : firebase.firestore.FieldValue.delete()
        };
        
        await db.collection("event_registrations").doc(regId).update(updateData);
        console.log(`報名件 ${regId} 報到狀態已更新為: ${checkInBool}`);
    } catch (err) {
        console.error("更新報到狀態失敗:", err);
        alert("無法更新報到狀態，請確認網路連線或是否具備管理員權限");
    }
};

// ==========================================
// 4. 相機鏡頭 QR Code 掃描模組
// ==========================================

function startCameraScanner() {
    // 延遲一下確保 DOM 元素已載入渲染
    setTimeout(() => {
        if (html5QrcodeScanner) return;
        
        html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
            fps: 10, 
            qrbox: { width: 220, height: 220 },
            rememberLastUsedCamera: true
        });
        
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    }, 500);
}

function stopCameraScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().then(() => {
            html5QrcodeScanner = null;
        }).catch(err => {
            console.error("相機停止發生錯誤:", err);
        });
    }
}

// 成功掃描到 QR Code 後的處理
async function onScanSuccess(decodedText) {
    if (!currentEventId) {
        showFeedback(false, "請先選取活動", "必須先在控制列選擇今天的活動，才能進行掃描報到。");
        return;
    }
    
    // 預防重疊掃描
    stopCameraScanner();
    
    // 解析掃到的 ID (我們的連結格式通常為 cancel.html?id=DOCUMENT_ID&...)
    let targetRegId = decodedText.trim();
    
    // 如果掃到的是取消連結網址，自動抓取 URL 中的 id 參數
    if (decodedText.includes('id=')) {
        try {
            const url = new URL(decodedText);
            targetRegId = url.searchParams.get('id');
        } catch(e) {
            console.warn("無法以網址方式解析 QR Code，嘗試直接當作報名 ID");
        }
    }

    if (!targetRegId) {
        showFeedback(false, "無效的條碼", "條碼格式錯誤，無法解析報名識別碼。");
        startCameraScanner(); // 重啟相機
        return;
    }

    try {
        const docRef = db.collection("event_registrations").doc(targetRegId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) {
            showFeedback(false, "查無此報名資料", `查無序號為 "${targetRegId.substring(0,8)}" 的報名，請手動輸入關鍵字搜尋核對。`);
            startCameraScanner();
            return;
        }

        const data = docSnap.data();
        
        // 檢查是否屬於當前活動
        if (data.eventId !== currentEventId) {
            showFeedback(false, "活動項目不符", `此報名為別場活動《${data.eventName || '其他活動'}》之憑證。<br>當前選擇活動為《${currentEvent.name}》。`);
            startCameraScanner();
            return;
        }

        // 檢查狀態是否已被取消
        if (data.status === 'cancelled' || data.status === 'payment_expired') {
            showFeedback(false, "此報名已失效", `此報名已於系統中辦理「取消」或「逾期未繳費」，狀態為: ${data.status}。`);
            startCameraScanner();
            return;
        }

        // 檢查是否已經完成報到
        if (data.status === 'checkedin' || data.checkedIn === true) {
            showFeedback(true, "已重複報到", `報名人：<strong>${escapeHtml(data.userName)}</strong><br>此帳號先前已於 ${data.checkinTime ? new Date(data.checkinTime).toLocaleTimeString('zh-TW', {hour12:false}) : ''} 完成報到，請勿重複掃描。`);
            startCameraScanner();
            return;
        }

        // 執行自動報到
        await updateCheckinStatus(targetRegId, true);
        showFeedback(true, "報到成功！", `歡迎 <strong>${escapeHtml(data.userName)}</strong> 蒞臨！<br>報名序號：${targetRegId.substring(0,8).toUpperCase()}`);
        startCameraScanner();

    } catch (err) {
        console.error("掃描報到程序發生錯誤:", err);
        showFeedback(false, "報到失敗", "資料庫連線錯誤，請改用名單手動點擊報到。");
        startCameraScanner();
    }
}

// 掃描失敗 (每秒數次，通常忽略)
function onScanFailure(error) {
    // 一般不對頻繁的失敗拋出提示，避免干擾使用
}

// ==========================================
// 5. 掃描彈出回饋 UI
// ==========================================

function showFeedback(isSuccess, title, desc) {
    modalIcon.innerHTML = isSuccess 
        ? `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i>`
        : `<i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i>`;
        
    modalTitle.textContent = title;
    modalDesc.innerHTML = desc;
    feedbackModal.classList.add('active');
    
    // 如果成功，3 秒後自動關閉
    if (isSuccess) {
        setTimeout(closeFeedbackModal, 3000);
    }
}

window.closeFeedbackModal = function() {
    feedbackModal.classList.remove('active');
};

// 安全過濾 Html 預防 XSS
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
