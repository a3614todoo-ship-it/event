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
    // 正常有效的報名名單（不含已取消、已逾期等失效狀態的報名）
    const activeRegs = registrations.filter(r => !isStatusCancelled(r.status));
    const checkedInRegs = registrations.filter(r => isStatusCheckedIn(r));
    
    totalRegSpan.textContent = activeRegs.length;
    totalCheckinSpan.textContent = checkedInRegs.length;
    
    const query = searchInput.value.trim().toLowerCase();
    const filter = statusFilter.value;
    
    // 預設列出所有人（包含已取消與逾期以求資料一致）
    let filtered = [...registrations];
    
    // 狀態過濾
    if (filter === 'registered') {
        // 未報到的有效名單
        filtered = registrations.filter(r => !isStatusCheckedIn(r) && !isStatusCancelled(r.status) && r.status !== 'waiting');
    } else if (filter === 'checkedin') {
        // 已報到的名單
        filtered = registrations.filter(r => isStatusCheckedIn(r));
    } else if (filter === 'waiting') {
        // 候補中名單
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
        const isChecked = isStatusCheckedIn(r);
        const phone = r.userPhone || '無';
        const serial = (r.id || '').substring(0, 8).toUpperCase();
        
        let statusBadge = `<span class="badge badge-registered">已報名</span>`;
        if (isChecked) statusBadge = `<span class="badge badge-checkedin">已報到</span>`;
        if (r.status === 'waiting') statusBadge = `<span class="badge badge-waiting">候補中</span>`;
        if (r.status === 'cancelled') statusBadge = `<span class="badge" style="background-color: #fca5a5; color: #b91c1c;">已取消</span>`;
        if (r.status === 'payment_expired') statusBadge = `<span class="badge" style="background-color: #e5e7eb; color: #374151;">已逾期</span>`;
        if (r.status === 'pending_payment') statusBadge = `<span class="badge" style="background-color: #fef3c7; color: #b45309;">待繳費</span>`;
        if (r.status === 'payment_reported') statusBadge = `<span class="badge" style="background-color: #dbeafe; color: #1e40af;">待對帳</span>`;
        
        const checkinTime = r.checkinTime ? new Date(r.checkinTime).toLocaleTimeString('zh-TW', {hour12:false, hour:'2-digit', minute:'2-digit'}) : '-';
        
        // 失效的報名不能進行報到操作
        const isExpiredOrCancelled = isStatusCancelled(r.status);
        
        let button = '';
        if (!isExpiredOrCancelled && r.status !== 'waiting') {
            button = isChecked 
                ? `<button class="action-btn btn-uncheck" onclick="updateCheckinStatus('${r.id}', false)"><i class="fa-solid fa-rotate-left"></i> 取消報到</button>`
                : `<button class="action-btn btn-checkin" onclick="updateCheckinStatus('${r.id}', true)"><i class="fa-solid fa-check"></i> 點擊報到</button>`;
        }
            
        return `
            <tr>
                <td style="font-family: monospace; font-weight: 700; color: #555;">${serial}</td>
                <td style="font-weight: 500;">${escapeHtml(r.userName)}</td>
                <td>${escapeHtml(phone)}</td>
                <td>${statusBadge}</td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${checkinTime}</td>
                <td style="text-align: right;">${button}</td>
            </tr>
        `;
    }).join('');
}

// 監聽關鍵字與篩選切換
searchInput.addEventListener('input', renderStatsAndList);
statusFilter.addEventListener('change', renderStatsAndList);

// ==========================================
// 3. 狀態判定輔助函數（相容 admin.js 的 checked-in 與 checkedin 兩種格式）
// ==========================================

// 判斷報名狀態是否為「已報到」
function isStatusCheckedIn(reg) {
    const s = normalizeStatus(reg.status);
    return s === 'checked-in' || s === 'checkedin' || reg.checkedIn === true;
}

// 判斷報名狀態是否為「已失效」（取消或逾期）
function isStatusCancelled(status) {
    return status === 'cancelled' || status === 'payment_expired';
}

// 標準化狀態字串（去除空白、隱藏字元）
function normalizeStatus(status) {
    return String(status || '')
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
}

// ==========================================
// 4. 報到寫入與異動
// ==========================================

// 執行報到 / 取消報到狀態寫入（使用與 admin.js 一致的 checked-in 格式）
window.updateCheckinStatus = async function(regId, checkInBool) {
    if (!regId) return;
    try {
        const updateData = {
            status: checkInBool ? 'checked-in' : 'registered',
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
// 5. 相機鏡頭 QR Code 掃描模組（直接啟動後鏡頭，與後台掃描方式一致）
// ==========================================

function startCameraScanner() {
    // 延遲一下確保 DOM 元素已載入渲染
    setTimeout(() => {
        if (html5QrcodeScanner) return;
        
        // 使用 Html5Qrcode（非 Scanner），直接啟動相機，無多餘 UI
        html5QrcodeScanner = new Html5Qrcode("reader");
        
        const config = { fps: 10, qrbox: { width: 220, height: 220 } };
        
        // 優先使用後鏡頭（environment），與後台報到掃描一致
        html5QrcodeScanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess
        ).catch(err => {
            console.warn("後鏡頭啟動失敗，嘗試前鏡頭...", err);
            // 若後鏡頭失敗（例如桌機），嘗試啟動前鏡頭
            html5QrcodeScanner.start(
                { facingMode: "user" },
                config,
                onScanSuccess
            ).catch(err2 => {
                console.error("無法開啟任何相機:", err2);
                const feedback = document.getElementById('scanFeedback');
                if (feedback) {
                    feedback.className = 'scan-feedback error';
                    feedback.textContent = '無法啟動相機，請檢查瀏覽器的相機權限設定。';
                    feedback.style.display = 'block';
                }
            });
        });
    }, 500);
}

function stopCameraScanner() {
    if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
            console.log("掃描器已停止");
        }).catch(err => {
            console.error("相機停止發生錯誤:", err);
            html5QrcodeScanner = null;
        });
    }
}

// 成功掃描到 QR Code 後的處理
async function onScanSuccess(decodedText) {
    if (!currentEventId) {
        showFeedback(false, "請先選取活動", "必須先在控制列選擇今天的活動，才能進行掃描報到。");
        return;
    }
    
    // 預防重疊掃描：先暫停相機
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
        if (isStatusCancelled(data.status)) {
            showFeedback(false, "此報名已失效", `此報名已於系統中辦理「取消」或「逾期未繳費」，狀態為: ${data.status}。`);
            startCameraScanner();
            return;
        }

        // 檢查是否已經完成報到（相容兩種格式）
        if (isStatusCheckedIn(data)) {
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

// ==========================================
// 6. 掃描彈出回饋 UI
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

