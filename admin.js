document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 郵件發送設定 (Google Apps Script API & EmailJS 雙軌相容)
    // ==========================================
    const EMAILJS_PUBLIC_KEY = '2NlEiWtXcW05Awbjt'; 
    const EMAILJS_SERVICE_ID = 'service_96agth6'; 
    const EMAILJS_TEMPLATE_ID = 'template_uz1rccd'; 
    
    // 2026-05-29 新增：Google Apps Script 代理發信服務 API 網址
    // ⚠️ 部署後請將下方網址替換為您的 Apps Script 部署 URL
    const GAS_EMAIL_API_URL = 'https://script.google.com/macros/s/AKfycbzcYc6qmA2MjxRcPb-YrQDCyNCsfAN_rY_v6Sigs_bsQx0BlgNzpFHNzSPll2wiqosp/exec';

    if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY) {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }

    // 核心中繼發信函數 (優先使用 GAS，如無設定或失敗則降級為 EmailJS)
    async function sendMailThroughAgent(toEmail, toName, subject, htmlContent) {
        // 如果有設定 GAS API 且不是預設的佔位符，則優先嘗試使用 GAS 發送
        if (GAS_EMAIL_API_URL && !GAS_EMAIL_API_URL.includes('AKfycbyXXXXXXXXXXXXXXXX')) {
            try {
                console.log(`[GAS] 正在透過 Apps Script 發信給 ${toEmail}...`);
                // 為了避開 CORS 限制，使用簡單請求（simple request）格式傳送
                const response = await fetch(GAS_EMAIL_API_URL, {
                    method: 'POST',
                    mode: 'no-cors', 
                    headers: {
                        // 使用 text/plain 避免觸發 CORS preflight 檢查
                        'Content-Type': 'text/plain'
                    },
                    body: JSON.stringify({
                        toEmail: toEmail,
                        toName: toName,
                        subject: subject,
                        htmlContent: htmlContent
                    })
                });
                console.log("[GAS] 郵件發送指令已遞交至 Google Apps Script 伺服器！");
                return { status: 200, text: "OK" };
            } catch (err) {
                console.warn("[GAS] 連線 GAS 發生網路錯誤，降級使用 EmailJS...", err);
            }
        }

        // Fallback: 既有 EmailJS 方案
        if (typeof emailjs === 'undefined') {
            throw new Error("EmailJS 未載入且 GAS 服務未配置");
        }
        return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: toEmail,
            to_name: toName,
            subject: subject,
            message_html: htmlContent
        });
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
    let utmSourceChart = null;

    let eventsUnsubscribe = null;
    let registrationsUnsubscribe = null;

    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        console.log("Firebase 初始化成功");

        // 使用 Auth 狀態變更監聽器，確保取得使用者 Token 後才訂閱 Firestore 資料
        firebase.auth().onAuthStateChanged((user) => {
            // 取消先前的訂閱以防重複監聽
            if (eventsUnsubscribe) eventsUnsubscribe();
            if (registrationsUnsubscribe) registrationsUnsubscribe();

            if (user) {
                console.log("Firebase Auth：管理員已登入", user.email);
                isAdminLoggedIn = true;
                localStorage.setItem('isStandaloneEventAdmin', 'true');
                setView();

                // 1. 監聽活動
                eventsUnsubscribe = db.collection("events").orderBy("date", "asc").onSnapshot((snapshot) => {
                    events = [];
                    snapshot.forEach((doc) => {
                        events.push({ id: doc.id, ...doc.data() });
                    });
                    renderAdminEventsList();
                    updateCheckinSelect();
                }, (error) => {
                    console.error("載入活動資料失敗:", error);
                });

                // 2. 監聽報名
                registrationsUnsubscribe = db.collection("event_registrations").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
                    eventRegistrations = [];
                    snapshot.forEach((doc) => {
                        eventRegistrations.push({ id: doc.id, ...doc.data() });
                    });
                    renderCheckinList();
                    renderAnalytics();
                    // 在活動列表重新渲染，確保更新報名人數/總量狀態
                    renderAdminEventsList();
                }, (error) => {
                    console.error("載入報名名單失敗:", error);
                });
            } else {
                console.log("Firebase Auth：未登入");
                isAdminLoggedIn = false;
                localStorage.removeItem('isStandaloneEventAdmin');
                setView();
            }
        });

    } catch (e) {
        console.error("Firebase 初始化失敗", e);
    }

    // ==========================================
    // 多圖藝廊管理：即時預覽與本機智慧壓縮邏輯 (2026-05-28)
    // ==========================================
    window.updateImagePreview = function(value, index) {
        const previewImg = document.getElementById(`imagePreview${index}`);
        const placeholder = document.getElementById(`imagePlaceholder${index}`);
        if (!previewImg || !placeholder) return;

        const url = String(value || '').trim();
        if (url) {
            previewImg.src = url;
            previewImg.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            previewImg.src = '';
            previewImg.style.display = 'none';
            placeholder.style.display = 'block';
        }
    };

    window.compressAndUploadImage = function(fileInput, index) {
        const file = fileInput.files[0];
        const statusSpan = document.getElementById(`uploadStatus${index}`);
        if (!file) return;

        if (statusSpan) {
            statusSpan.textContent = '讀取中...';
            statusSpan.style.color = '#d97706';
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                // 開始利用 Canvas 進行智慧壓縮
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // 強制轉換為 JPEG 並將畫質壓縮為 0.6
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                
                // 寫入對應的輸入框與預覽
                const pathInput = document.getElementById(`eventImage${index}`);
                if (pathInput) {
                    pathInput.value = compressedBase64;
                    // 手動發送 input 事件觸發相關 UI 綁定
                    pathInput.dispatchEvent(new Event('input'));
                }
                window.updateImagePreview(compressedBase64, index);

                // 計算壓縮比率回報使用者
                const origSize = file.size;
                const newSize = Math.round(compressedBase64.length * 0.75);
                const ratio = Math.round(((origSize - newSize) / origSize) * 100);

                if (statusSpan) {
                    statusSpan.textContent = `已成功壓縮 ${ratio > 0 ? ratio : 0}% (${(newSize / 1024).toFixed(1)}KB)`;
                    statusSpan.style.color = '#10b981';
                }
            };
            img.onerror = function() {
                if (statusSpan) {
                    statusSpan.textContent = '圖片解析失敗';
                    statusSpan.style.color = '#ef4444';
                }
            };
            img.src = e.target.result;
        };
        reader.onerror = function() {
            if (statusSpan) {
                statusSpan.textContent = '讀取檔案失敗';
                statusSpan.style.color = '#ef4444';
            }
        };
        reader.readAsDataURL(file);
    };

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

    // 升級：使用安全的 Firebase Authentication 進行管理員登入驗證
    adminLoginSubmit.addEventListener('click', async () => {
        const email = adminUsernameInput.value.trim();
        const pass = adminPasswordInput.value.trim();

        if (!email || !pass) { 
            alert('請輸入管理員 Email 與密碼'); 
            return; 
        }

        adminLoginSubmit.disabled = true;
        adminLoginSubmit.textContent = '驗證中...';

        try {
            // 調用 Firebase Auth API 進行安全認證
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, pass);
            
            // 登入成功
            isAdminLoggedIn = true;
            localStorage.setItem('isStandaloneEventAdmin', 'true');
            
            adminUsernameInput.value = '';
            adminPasswordInput.value = '';
            setView();
            alert('管理員登入成功！');
        } catch (error) {
            console.error("Firebase 登入失敗:", error);
            // 顯示易懂的資安防禦提示
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                alert('帳號或密碼錯誤，請重新輸入。');
            } else if (error.code === 'auth/invalid-email') {
                alert('請輸入格式正確的 Email 帳號！\n(自 2026-05-29 起後台安全升級，帳號格式為 Email)');
            } else {
                alert(`登入失敗: ${error.message}`);
            }
        } finally {
            adminLoginSubmit.disabled = false;
            adminLoginSubmit.textContent = '登入管理系統';
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
    let currentEditingEmailTemplates = {};

    const EMAIL_TEMPLATE_CONFIG = [
        { key: 'registrationSuccess', label: '報名成功信', subject: '【活動報名成功通知】{{活動名稱}}', body: '親愛的 {{姓名}} 您好，\n\n恭喜您！您已成功報名 {{活動名稱}}，以下是您的報名資訊：\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n{{取消連結}}\n\n{{信件尾巴區塊}}' },
        { key: 'pendingPayment', label: '待繳費通知信', subject: '【繳費通知】請完成《{{活動名稱}}》活動報名繳費', body: '親愛的 {{姓名}} 您好，\n\n感謝您的報名！本活動需繳交費用 {{應繳金額}}，請於 {{繳費期限}} 前完成匯款，並回報您的帳號後五碼以保留名額。\n\n{{活動資訊區塊}}\n\n{{報到須知區塊}}\n\n{{匯款資訊區塊}}\n\n{{回報連結}}\n\n{{取消連結}}\n\n{{信件尾巴區塊}}' },
        { key: 'paymentReported', label: '匯款回報收到信', subject: '【已收到匯款回報】{{活動名稱}}', body: '親愛的 {{姓名}} 您好，\n\n我們已收到您針對 {{活動名稱}} 的匯款回報，後五碼為 {{後五碼}}。\n目前狀態為等待對帳。\n\n{{信件尾巴區塊}}' },
        { key: 'paymentConfirmed', label: '收款確認信', subject: '【收款確認】{{活動名稱}} 報名成功！', body: '親愛的 {{姓名}} 您好，\n\n我們已收到您的款項，{{活動名稱}} 報名已正式成功。\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n{{取消連結}}\n\n{{信件尾巴區塊}}' },
        { key: 'paymentReminder', label: '繳費提醒信', subject: '【繳費提醒】{{活動名稱}}', body: '親愛的 {{姓名}} 您好，\n\n提醒您完成 {{活動名稱}} 的繳費。\n應繳金額：{{應繳金額}}\n繳費期限：{{繳費期限}}\n\n{{活動資訊區塊}}\n\n{{匯款資訊區塊}}\n\n{{回報連結}}\n\n{{取消連結}}\n\n{{信件尾巴區塊}}' },
        { key: 'preEventReminder', label: '行前提醒信', subject: '【行前提醒】{{活動名稱}}', body: '親愛的 {{姓名}} 您好，\n\n提醒您即將參加 {{活動名稱}}。\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n{{信件尾巴區塊}}' },
        { key: 'surveyInvite', label: '滿意度問卷信', subject: '【活動回饋】期待聽到您對《{{活動名稱}}》的看法', body: '親愛的 {{姓名}} 您好，\n\n感謝您參加 {{活動名稱}}。\n誠摯邀請您填寫滿意度問卷：{{問卷連結}}\n\n{{信件尾巴區塊}}' },
        { key: 'waitlistPromoted', label: '遞補成功信', subject: '【遞補成功通知】{{活動名稱}}', body: '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n{{取消連結}}\n\n{{信件尾巴區塊}}' },
        { key: 'cancelled', label: '取消報名信', subject: '【報名取消確認】{{活動名稱}}', body: '親愛的 {{姓名}} 您好，\n\n我們已收到您的取消申請，{{活動名稱}} 的報名已取消。\n感謝您主動告知。\n\n{{信件尾巴區塊}}' }
    ];
    const PAYMENT_ONLY_EMAIL_TEMPLATE_KEYS = new Set(['pendingPayment', 'paymentReported', 'paymentConfirmed', 'paymentReminder']);

    function getEventStartDate(eventData) {
        return eventData?.startDate || eventData?.date || '';
    }

    function getEventEndDate(eventData) {
        return eventData?.endDate || eventData?.startDate || eventData?.date || '';
    }

    function formatEventDateRange(eventData) {
        const start = getEventStartDate(eventData);
        const end = getEventEndDate(eventData);
        if (!start) return '';
        return end && end !== start ? `${start} ~ ${end}` : start;
    }

    function normalizeRegistrationStatus(status) {
        return String(status || '')
            .toLowerCase()
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function createDefaultEmailTemplates() {
        return EMAIL_TEMPLATE_CONFIG.reduce((acc, item) => {
            acc[item.key] = {
                enabled: true,
                subject: item.subject,
                body: item.body
            };
            return acc;
        }, {});
    }

    function mergeEmailTemplates(savedTemplates = {}) {
        const defaults = createDefaultEmailTemplates();
        Object.keys(savedTemplates || {}).forEach(key => {
            defaults[key] = { ...defaults[key], ...savedTemplates[key] };
        });
        const oldRegistrationBody = '親愛的 {{姓名}} 您好，\n\n您已成功報名 {{活動名稱}}。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n報名序號：{{報名序號}}\n請留意活動通知，期待與您相見。';
        const oldRegistrationBodyWithQr = '親愛的 {{姓名}} 您好，\n\n您已成功報名 {{活動名稱}}。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n報名序號：{{報名序號}}\n\n{{QRCode}}\n\n請留意活動通知，期待與您相見。';
        const oldRegistrationBodyRich = '親愛的 {{姓名}} 您好，\n\n恭喜您！您已成功報名 {{活動名稱}}，以下是您的報名資訊：\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n請留意活動通知，期待與您相見。';
        const oldPaymentConfirmedBody = '親愛的 {{姓名}} 您好，\n\n我們已收到您的款項，{{活動名稱}} 報名已正式成功。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n活動當天請出示信件中的 QR Code 完成報到。';
        const oldPaymentConfirmedBodyWithQr = '親愛的 {{姓名}} 您好，\n\n我們已收到您的款項，{{活動名稱}} 報名已正式成功。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n{{QRCode}}\n\n活動當天請出示信件中的 QR Code 完成報到。';
        const oldPaymentConfirmedBodyRich = '親愛的 {{姓名}} 您好，\n\n我們已收到您的款項，{{活動名稱}} 報名已正式成功。\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n活動當天請出示信件中的 QR Code 完成報到。';
        const oldPreEventReminderBody = '親愛的 {{姓名}} 您好，\n\n提醒您即將參加 {{活動名稱}}。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n活動當天請預先準備 QR Code 報到。';
        const oldPreEventReminderBodyWithQr = '親愛的 {{姓名}} 您好，\n\n提醒您即將參加 {{活動名稱}}。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n{{QRCode}}\n\n活動當天請預先準備 QR Code 報到。';
        if ([oldRegistrationBody, oldRegistrationBodyWithQr, oldRegistrationBodyRich].includes(defaults.registrationSuccess?.body)) {
            defaults.registrationSuccess.body = EMAIL_TEMPLATE_CONFIG.find(item => item.key === 'registrationSuccess').body;
        }
        if ([oldPaymentConfirmedBody, oldPaymentConfirmedBodyWithQr, oldPaymentConfirmedBodyRich].includes(defaults.paymentConfirmed?.body)) {
            defaults.paymentConfirmed.body = EMAIL_TEMPLATE_CONFIG.find(item => item.key === 'paymentConfirmed').body;
        }
        if (defaults.preEventReminder?.body === oldPreEventReminderBody || defaults.preEventReminder?.body === oldPreEventReminderBodyWithQr) {
            defaults.preEventReminder.body = EMAIL_TEMPLATE_CONFIG.find(item => item.key === 'preEventReminder').body;
        }
        const oldPendingPaymentBody = '親愛的 {{姓名}} 您好，\n\n您已完成 {{活動名稱}} 的報名保留。\n應繳金額：{{應繳金額}}\n繳費期限：{{繳費期限}}\n\n匯款資訊：\n{{匯款資訊}}\n\n注意事項：\n{{付款注意事項}}\n\n完成匯款後請回報後五碼：{{回報連結}}';
        const oldPendingPaymentBodyWithButton = '親愛的 {{姓名}} 您好，\n\n您已完成 {{活動名稱}} 的報名保留。\n應繳金額：{{應繳金額}}\n繳費期限：{{繳費期限}}\n\n匯款資訊：\n{{匯款資訊}}\n\n注意事項：\n{{付款注意事項}}\n\n完成匯款後，請點擊下方按鈕回報匯款帳號後五碼：\n{{回報連結}}';
        const oldPendingPaymentBodyRich = '親愛的 {{姓名}} 您好，\n\n感謝您的報名！本活動需繳交費用 {{應繳金額}}，請於 {{繳費期限}} 前完成匯款，並回報您的帳號後五碼以保留名額。\n\n{{活動資訊區塊}}\n\n{{報到須知區塊}}\n\n{{匯款資訊區塊}}\n\n{{回報連結}}';
        const oldPaymentReminderBody = '親愛的 {{姓名}} 您好，\n\n提醒您完成 {{活動名稱}} 的繳費。\n應繳金額：{{應繳金額}}\n繳費期限：{{繳費期限}}\n\n匯款資訊：\n{{匯款資訊}}\n\n注意事項：\n{{付款注意事項}}\n\n回報連結：{{回報連結}}';
        const oldPaymentReminderBodyWithButton = '親愛的 {{姓名}} 您好，\n\n提醒您完成 {{活動名稱}} 的繳費。\n應繳金額：{{應繳金額}}\n繳費期限：{{繳費期限}}\n\n匯款資訊：\n{{匯款資訊}}\n\n注意事項：\n{{付款注意事項}}\n\n完成匯款後，請點擊下方按鈕回報匯款帳號後五碼：\n{{回報連結}}';
        const oldPaymentReminderBodyRich = '親愛的 {{姓名}} 您好，\n\n提醒您完成 {{活動名稱}} 的繳費。\n應繳金額：{{應繳金額}}\n繳費期限：{{繳費期限}}\n\n{{活動資訊區塊}}\n\n{{匯款資訊區塊}}\n\n{{回報連結}}';
        const oldWaitlistPromotedBody = '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n請留意報到資訊並準時出席。';
        const oldWaitlistPromotedBodyWithQr = '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n{{QRCode}}\n\n請留意報到資訊並準時出席。';
        const oldWaitlistPromotedBodyRich = '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n請留意報到資訊並準時出席。';
        if ([oldPendingPaymentBody, oldPendingPaymentBodyWithButton, oldPendingPaymentBodyRich].includes(defaults.pendingPayment?.body)) {
            defaults.pendingPayment.body = EMAIL_TEMPLATE_CONFIG.find(item => item.key === 'pendingPayment').body;
        }
        if ([oldPaymentReminderBody, oldPaymentReminderBodyWithButton, oldPaymentReminderBodyRich].includes(defaults.paymentReminder?.body)) {
            defaults.paymentReminder.body = EMAIL_TEMPLATE_CONFIG.find(item => item.key === 'paymentReminder').body;
        }
        if ([oldWaitlistPromotedBody, oldWaitlistPromotedBodyWithQr, oldWaitlistPromotedBodyRich].includes(defaults.waitlistPromoted?.body)) {
            defaults.waitlistPromoted.body = EMAIL_TEMPLATE_CONFIG.find(item => item.key === 'waitlistPromoted').body;
        }
        Object.keys(defaults).forEach(key => {
            if (defaults[key]?.body && !defaults[key].body.includes('{{信件尾巴區塊}}')) {
                defaults[key].body = `${defaults[key].body}\n\n{{信件尾巴區塊}}`;
            }
        });
        return defaults;
    }

    function getEditingEventFee() {
        const feeInput = document.getElementById('editEventFee');
        return Math.max(parseInt(feeInput?.value, 10) || 0, 0);
    }

    function shouldShowEmailTemplateEditor(item) {
        return getEditingEventFee() > 0 || !PAYMENT_ONLY_EMAIL_TEMPLATE_KEYS.has(item.key);
    }

    function renderEmailTemplateEditors() {
        const container = document.getElementById('emailTemplatesContainer');
        if (!container) return;
        const visibleTemplates = EMAIL_TEMPLATE_CONFIG.filter(shouldShowEmailTemplateEditor);
        const feeNotice = getEditingEventFee() > 0 ? '' : `
            <div style="background:#fdfaf5; border:1px solid var(--border-color); border-radius:12px; padding:12px 14px; color:var(--text-muted); margin-bottom:12px; line-height:1.6;">
                免費活動不會顯示「待繳費通知信」、「匯款回報收到信」、「繳費提醒信」與「收款確認信」。
            </div>
        `;
        container.innerHTML = feeNotice + visibleTemplates.map(item => {
            const tpl = currentEditingEmailTemplates[item.key] || {};
            return `
                <details style="border:1px solid var(--border-color); border-radius:12px; padding:14px; margin-bottom:12px; background:#fff;">
                    <summary style="cursor:pointer; font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" ${tpl.enabled !== false ? 'checked' : ''} onchange="updateEmailTemplate('${item.key}', 'enabled', this.checked)" onclick="event.stopPropagation()">
                        ${item.label}
                    </summary>
                    <div style="margin-top:14px;">
                        <label style="font-size:0.9rem; color:var(--text-muted);">信件主旨</label>
                        <input type="text" value="${escapeHtml(tpl.subject || '')}" oninput="updateEmailTemplate('${item.key}', 'subject', this.value)" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-color); margin:6px 0 12px;">
                        <label style="font-size:0.9rem; color:var(--text-muted);">信件內容</label>
                        <textarea rows="6" oninput="updateEmailTemplate('${item.key}', 'body', this.value)" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-color); line-height:1.6;">${escapeHtml(tpl.body || '')}</textarea>
                        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                            <button type="button" class="btn-secondary" onclick="previewEmailTemplate('${item.key}')" style="padding:7px 12px; font-size:0.85rem;">
                                <i class="fas fa-eye"></i> 預覽信件
                            </button>
                            <button type="button" class="btn-secondary" onclick="sendTestEmailTemplate('${item.key}')" style="padding:7px 12px; font-size:0.85rem; border-color:#10b981; color:#10b981;">
                                <i class="fas fa-paper-plane"></i> 寄測試信給自己
                            </button>
                        </div>
                    </div>
                </details>
            `;
        }).join('');
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    window.updateEmailTemplate = function(key, field, value) {
        if (!currentEditingEmailTemplates[key]) {
            currentEditingEmailTemplates[key] = { enabled: true, subject: '', body: '' };
        }
        currentEditingEmailTemplates[key][field] = value;
    };

    function getEmailTemplate(eventData, key) {
        const templates = mergeEmailTemplates(eventData?.emailTemplates || {});
        return templates[key] || null;
    }

    function buildEmailVars(regData, eventData, extra = {}) {
        const baseUrl = 'https://a3614todoo-ship-it.github.io/event';
        return {
            '姓名': regData.userName || '',
            '活動名稱': eventData?.name || regData.eventName || '',
            '活動日期': formatEventDateRange(eventData || regData),
            '活動時間': eventData?.time || regData.eventTime || '',
            '活動地點': eventData?.location || regData.eventLocation || '',
            '報名序號': (regData.id || '').substring(0, 8).toUpperCase(),
            '應繳金額': `NT$ ${((eventData?.fee || 0)).toLocaleString()}`,
            '繳費期限': formatDateTimeTW(regData.paymentDueAt),
            '匯款資訊': eventData?.bankInfo || '',
            '付款注意事項': eventData?.paymentNote || '',
            '回報連結': '__PAYMENT_REPORT_BUTTON__',
            '回報網址': `${baseUrl}/payment.html?id=${regData.id}`,
            '取消連結': '__CANCEL_REGISTRATION_BLOCK__',
            '取消網址': `${baseUrl}/cancel.html?id=${encodeURIComponent(regData.id || '')}&email=${encodeURIComponent(regData.userEmail || '')}`,
            '問卷連結': `${baseUrl}/survey.html?id=${regData.id}`,
            '後五碼': regData.paymentLast5 || extra.paymentLast5 || '',
            'QRCode': '__QR_CODE_BLOCK__',
            'QR Code': '__QR_CODE_BLOCK__',
            '活動資訊區塊': '__EVENT_INFO_BLOCK__',
            '報到須知區塊': '__CHECKIN_NOTICE_BLOCK__',
            '匯款資訊區塊': '__PAYMENT_INFO_BLOCK__',
            '信件尾巴區塊': '__EMAIL_FOOTER_BLOCK__',
            ...extra
        };
    }

    function applyEmailTemplateText(text, vars) {
        return String(text || '').replace(/\{\{([^}]+)\}\}/g, (_, key) => {
            return vars[String(key).trim()] ?? '';
        });
    }

    function plainTextToEmailHtml(text) {
        const escaped = escapeHtml(text).replace(/\n/g, '<br>');
        return `
        <div style="background-color:#f5f1ea; padding:40px 20px; font-family:system-ui,-apple-system,sans-serif;">
            <div style="max-width:600px; margin:0 auto; background:#fdfbf7; border-radius:24px; overflow:hidden; border:1px solid #e5e0d8;">
                <div style="background:#fff; padding:36px 20px; text-align:center; border-bottom:1px solid #f1ece4;">
                    <h1 style="margin:0; font-size:24px; color:#4a3728; letter-spacing:5px;">藝 境 空 間</h1>
                </div>
                <div style="padding:36px; color:#4a3728; line-height:1.8; font-size:15px;">${escaped}</div>
            </div>
        </div>`;
    }

    function buildQrCodeHtml(regData) {
        if (!regData?.id) return '';
        const eventName = regData.eventName || '藝境空間精選活動';
        const userName = regData.userName || '貴賓';
        const serial = (regData.id || '').substring(0, 8).toUpperCase();
        
        return `
        <div style="max-width: 500px; margin: 24px auto; background-color: #fdfbf7; border: 2px solid #d97706; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(74, 55, 40, 0.08); font-family: system-ui, -apple-system, sans-serif; text-align: left;">
            <table style="width: 100%; border-collapse: collapse; margin: 0; padding: 0;">
                <tr>
                    <!-- 左側存根聯 -->
                    <td style="padding: 24px; vertical-align: top; border-right: 2px dashed rgba(217, 119, 6, 0.3); background-color: #fdfbf7;">
                        <div style="font-size: 11px; letter-spacing: 2px; color: #d97706; font-weight: bold; margin-bottom: 8px;">藝境空間 ‧ ADMISSION TICKET</div>
                        <div style="font-size: 16px; font-weight: bold; color: #4a3728; line-height: 1.4; margin: 10px 0;">${escapeHtml(eventName)}</div>
                        <table style="width: 100%; margin-top: 15px; font-size: 13px; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 0 10px 0 0; vertical-align: top; width: 50%;">
                                    <span style="font-size: 10px; color: #8c7361; display: block; margin-bottom: 2px;">貴賓姓名</span>
                                    <strong style="color: #4a3728; font-size: 14px;">${escapeHtml(userName)}</strong>
                                </td>
                                <td style="padding: 0; vertical-align: top; width: 50%;">
                                    <span style="font-size: 10px; color: #8c7361; display: block; margin-bottom: 2px;">席次序號</span>
                                    <strong style="color: #4a3728; font-size: 14px; font-family: monospace;">${escapeHtml(serial)}</strong>
                                </td>
                            </tr>
                        </table>
                        <div style="font-size: 10px; color: #8c7361; margin-top: 20px; line-height: 1.4;">* 本憑證作為入場唯一識別，請妥善保管。</div>
                    </td>
                    <!-- 右側報到聯 -->
                    <td style="width: 150px; padding: 20px 15px; text-align: center; vertical-align: middle; background-color: #fef3c7;">
                        <div style="background-color: #ffffff; padding: 8px; border-radius: 8px; display: inline-block; border: 1px solid #d97706; box-shadow: 0 4px 10px rgba(0,0,0,0.02);">
                            <img src="https://quickchart.io/chart?cht=qr&chs=110x110&chl=${encodeURIComponent(regData.id)}&choe=UTF-8" width="110" height="110" alt="QR Code" style="display: block; margin: 0 auto; border: none;">
                        </div>
                        <div style="font-size: 10px; font-weight: bold; color: #b45309; margin-top: 8px; letter-spacing: 1px;">現場對準掃描</div>
                    </td>
                </tr>
            </table>
        </div>`;
    }

    function injectRichEmailBlocks(html, regData, eventData = {}, templateKey = '') {
        return html
            .replace(/__QR_CODE_BLOCK__/g, buildQrCodeHtml(regData))
            .replace(/__PAYMENT_REPORT_BUTTON__/g, buildPaymentReportButtonHtml(regData))
            .replace(/__CANCEL_REGISTRATION_BLOCK__/g, buildCancelRegistrationBlockHtml(regData))
            .replace(/__EVENT_INFO_BLOCK__/g, buildEventInfoBlockHtml(regData, eventData, templateKey))
            .replace(/__CHECKIN_NOTICE_BLOCK__/g, buildCheckinNoticeBlockHtml())
            .replace(/__PAYMENT_INFO_BLOCK__/g, buildPaymentInfoBlockHtml(regData, eventData))
            .replace(/__EMAIL_FOOTER_BLOCK__/g, buildEmailFooterBlockHtml(templateKey));
    }

    function buildPaymentReportButtonHtml(regData) {
        if (!regData?.id) return '';
        const baseUrl = 'https://a3614todoo-ship-it.github.io/event';
        const reportUrl = `${baseUrl}/payment.html?id=${encodeURIComponent(regData.id)}`;
        return `
        <div style="text-align:center; margin:28px 0;">
            <a href="${reportUrl}" style="display:inline-block; background:#d97706; color:#ffffff; text-decoration:none; padding:14px 26px; border-radius:999px; font-weight:700; letter-spacing:1px;">
                回報匯款後五碼
            </a>
            <p style="margin:12px 0 0 0; font-size:13px; color:#8d7a6b;">若按鈕無法開啟，請複製此連結：${reportUrl}</p>
        </div>`;
    }

    function buildCancelRegistrationBlockHtml(regData) {
        if (!regData?.id) return '';
        const baseUrl = 'https://a3614todoo-ship-it.github.io/event';
        const cancelUrl = `${baseUrl}/cancel.html?id=${encodeURIComponent(regData.id || '')}&email=${encodeURIComponent(regData.userEmail || '')}`;
        return `
        <div style="text-align:center; border-top:1px solid #f1ece4; padding-top:24px; margin-top:28px;">
            <p style="font-size:14px; color:#bcae9e; margin:0 0 10px 0;">若您因故不克參加，請點擊下方連結取消：</p>
            <a href="${cancelUrl}" style="color:#ef4444; text-decoration:underline; font-size:14px;">
                我要取消報名 (無法撤回)
            </a>
        </div>`;
    }

    function getEmailStatusLabel(templateKey, regData = {}) {
        const status = normalizeRegistrationStatus(regData.status);
        const labelMap = {
            registrationSuccess: '報名成功 (Confirmed)',
            pendingPayment: '待繳費 (Pending)',
            paymentReported: '等待對帳',
            paymentConfirmed: '報名成功 (Confirmed)',
            paymentReminder: status === 'payment_expired' ? '已逾期' : '待繳費 (Pending)',
            preEventReminder: '報名成功 (Confirmed)',
            surveyInvite: '已參加',
            waitlistPromoted: '遞補成功 (Confirmed)',
            cancelled: '已取消參加'
        };
        return labelMap[templateKey] || regData.statusLabel || status || '已報名';
    }

    function buildEventInfoBlockHtml(regData, eventData, templateKey) {
        const accentColor = '#d97706';
        const eventName = eventData?.name || regData.eventName || '';
        const eventDate = regData.eventDateRange || formatEventDateRange(eventData || regData);
        const eventTime = eventData?.time || regData.eventTime || '';
        const serial = (regData.id || '').substring(0, 8).toUpperCase();
        const statusLabel = getEmailStatusLabel(templateKey, regData);
        return `
        <div style="background-color:#ffffff; padding:25px; border-radius:16px; border:1px solid #eee; margin:24px 0 30px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
            <h3 style="margin:0 0 15px 0; font-size:18px; color:#4a3728; border-bottom:2px solid ${accentColor}; display:inline-block; padding-bottom:5px;">📋 活動資訊</h3>
            <table style="width:100%; border-collapse:collapse; font-size:15px; margin-top:15px;">
                <tr><td style="padding:10px 0; color:#8d7a6b; width:100px;">目前狀態</td><td style="padding:10px 0; font-weight:bold; color:${accentColor};">${escapeHtml(statusLabel)}</td></tr>
                <tr><td style="padding:10px 0; color:#8d7a6b;">活動名稱</td><td style="padding:10px 0; font-weight:bold;">${escapeHtml(eventName)}</td></tr>
                <tr><td style="padding:10px 0; color:#8d7a6b;">活動日期</td><td style="padding:10px 0; font-weight:bold;">${escapeHtml(eventDate)}</td></tr>
                <tr><td style="padding:10px 0; color:#8d7a6b;">活動時間</td><td style="padding:10px 0; font-weight:bold;">${escapeHtml(eventTime)}</td></tr>
                <tr><td style="padding:10px 0; color:#8d7a6b;">報名序號</td><td style="padding:10px 0; font-family:monospace; font-size:18px; color:#4a3728;">${escapeHtml(serial)}</td></tr>
            </table>
        </div>`;
    }

    function buildCheckinNoticeBlockHtml() {
        return `
        <div style="border:1px solid #e5e0d8; border-radius:12px; padding:20px; background-color:#ffffff; margin:24px 0 25px;">
            <h4 style="margin:0 0 12px 0; font-size:15px; color:#4a3728;">📍 報到須知</h4>
            <ul style="margin:0; padding-left:20px; font-size:14px; color:#6b5a4d; line-height:1.8;">
                <li style="margin-bottom:5px;">活動當天請<strong>預先開啟並準備好此 QR Code</strong>，或憑「報名姓名」及「手機末三碼」報到即可。</li>
                <li style="margin-bottom:5px;">建議您提早於活動開始前 <strong>10 分鐘</strong> 抵達現場。</li>
                <li>為了維護活動品質，活動開始 15 分鐘後將停止報到。</li>
            </ul>
        </div>`;
    }

    function buildPaymentInfoBlockHtml(regData, eventData) {
        const bankInfo = eventData?.bankInfo || '暫無匯款帳號資訊';
        const paymentNote = eventData?.paymentNote || '';
        return `
        <div style="border:1px dashed #d97706; border-radius:12px; padding:20px; background-color:#fefce8; margin:24px 0 25px;">
            <h4 style="margin:0 0 12px 0; font-size:15px; color:#d97706;">匯款帳號資訊</h4>
            <div style="font-size:14px; color:#6b5a4d; line-height:1.8; white-space:pre-wrap; font-family:monospace;">${escapeHtml(bankInfo)}</div>
            <p style="margin:12px 0 0 0; font-size:14px; color:#8a4b0f;"><strong>繳費期限：</strong>${escapeHtml(formatDateTimeTW(regData.paymentDueAt))}</p>
            ${paymentNote ? `<p style="margin:12px 0 0 0; font-size:14px; color:#8a4b0f;"><strong>注意事項：</strong>${escapeHtml(paymentNote)}</p>` : ''}
        </div>`;
    }

    function buildEmailFooterBlockHtml(templateKey) {
        const footerMap = {
            registrationSuccess: '期待在藝境空間與您相見！',
            pendingPayment: '完成繳款並成功對帳後，系統將會發送正式報名成功信件。',
            paymentReported: '管理員確認收款後，系統將會發送正式報名成功信件。',
            paymentConfirmed: '活動當天請出示 QR Code 完成報到。',
            paymentReminder: '請於期限內完成繳費並回報匯款後五碼。',
            preEventReminder: '活動當天請預先準備 QR Code 報到。',
            surveyInvite: '您的回饋對我們非常重要。',
            waitlistPromoted: '請留意報到資訊並準時出席。',
            cancelled: '期待未來能在其他活動見到您。'
        };
        return `
        <div style="text-align:center; border-top:1px solid #f1ece4; padding-top:30px; margin-top:28px;">
            <p style="margin:0 0 18px 0; font-size:14px; color:#8d7a6b;">如果您對活動有任何疑問，歡迎隨時與我們聯繫。</p>
            <h4 style="margin:0; font-size:18px; color:#4a3728; line-height:1.6;">${escapeHtml(footerMap[templateKey] || '期待在藝境空間與您相見！')}</h4>
            <p style="margin:16px 0 0 0; font-size:13px; color:#bcae9e;">藝境空間 管理團隊 敬上</p>
        </div>`;
    }

    function buildTemplatedEmail(key, regData, eventData, fallbackSubject, fallbackHtml, extra = {}) {
        const tpl = getEmailTemplate(eventData, key);
        if (tpl && tpl.enabled === false) return null;
        const vars = buildEmailVars(regData, eventData, extra);
        const subject = tpl?.subject ? applyEmailTemplateText(tpl.subject, vars) : fallbackSubject;
        const messageHtml = tpl?.body ? injectRichEmailBlocks(plainTextToEmailHtml(applyEmailTemplateText(tpl.body, vars)), regData, eventData, key) : fallbackHtml;
        return { subject, messageHtml };
    }

    function getEmailTemplateLabel(key) {
        return EMAIL_TEMPLATE_CONFIG.find(item => item.key === key)?.label || key;
    }

    function buildEventDraftFromForm() {
        return {
            id: document.getElementById('editEventId')?.value || 'test-event',
            name: document.getElementById('editEventName')?.value || '測試活動',
            date: document.getElementById('editEventStartDate')?.value || new Date().toISOString().slice(0, 10),
            startDate: document.getElementById('editEventStartDate')?.value || new Date().toISOString().slice(0, 10),
            endDate: document.getElementById('editEventEndDate')?.value || document.getElementById('editEventStartDate')?.value || new Date().toISOString().slice(0, 10),
            time: document.getElementById('editEventTime')?.value || '14:00-16:00',
            location: document.getElementById('editEventLocation')?.value || '藝境空間',
            fee: parseInt(document.getElementById('editEventFee')?.value, 10) || 0,
            bankInfo: document.getElementById('editEventBankInfo')?.value || '匯款銀行：測試銀行\n匯款帳號：000-000-000',
            paymentNote: document.getElementById('editEventPaymentNote')?.value || '此為測試信件，請勿實際匯款。',
            emailTemplates: currentEditingEmailTemplates
        };
    }

    function buildSampleRegistrationData(eventData) {
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + 3);
        return {
            id: 'TEST20260526',
            userName: '測試收件人',
            userEmail: '',
            userPhone: '0912345678',
            eventId: eventData.id || 'test-event',
            eventName: eventData.name || '測試活動',
            eventDateRange: formatEventDateRange(eventData),
            eventTime: eventData.time || '14:00-16:00',
            eventLocation: eventData.location || '藝境空間',
            paymentDueAt: dueAt.toISOString(),
            paymentLast5: '12345'
        };
    }

    function buildEmailTemplatePreview(key) {
        const eventData = buildEventDraftFromForm();
        const regData = buildSampleRegistrationData(eventData);
        const tpl = currentEditingEmailTemplates[key] || createDefaultEmailTemplates()[key] || {};
        const vars = buildEmailVars(regData, eventData, { paymentLast5: '12345' });
        const subject = applyEmailTemplateText(tpl.subject || '', vars);
        const messageHtml = injectRichEmailBlocks(plainTextToEmailHtml(applyEmailTemplateText(tpl.body || '', vars)), regData, eventData, key);
        return { subject, messageHtml };
    }

    window.previewEmailTemplate = function(key) {
        const preview = buildEmailTemplatePreview(key);
        const previewWindow = window.open('', '_blank', 'width=760,height=820');
        if (!previewWindow) {
            alert('瀏覽器阻擋了預覽視窗，請允許彈出視窗後再試一次。');
            return;
        }
        previewWindow.document.write(`
            <!doctype html>
            <html lang="zh-Hant">
            <head>
                <meta charset="utf-8">
                <title>${escapeHtml(getEmailTemplateLabel(key))}預覽</title>
                <style>
                    body { margin:0; background:#f5f1ea; font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif; color:#4a3728; }
                    .preview-bar { position:sticky; top:0; z-index:1; background:#fff; border-bottom:1px solid #e5e0d8; padding:14px 18px; }
                    .preview-bar strong { color:#d97706; }
                    .subject { margin-top:6px; font-size:14px; color:#6b5a4d; }
                </style>
            </head>
            <body>
                <div class="preview-bar">
                    <strong>${escapeHtml(getEmailTemplateLabel(key))}</strong>
                    <div class="subject">主旨：${escapeHtml(preview.subject)}</div>
                </div>
                ${preview.messageHtml}
            </body>
            </html>
        `);
        previewWindow.document.close();
    };

    window.sendTestEmailTemplate = async function(key) {
        const savedEmail = localStorage.getItem('emailTemplateTestEmail') || '';
        const toEmail = prompt('請輸入要接收測試信的 Email：', savedEmail);
        if (!toEmail) return;
        localStorage.setItem('emailTemplateTestEmail', toEmail);
        const preview = buildEmailTemplatePreview(key);
        try {
            await sendMailThroughAgent(
                toEmail,
                '測試收件人',
                `[測試] ${preview.subject}`,
                preview.messageHtml
            );
            alert(`已寄出「${getEmailTemplateLabel(key)}」測試信到 ${toEmail}`);
        } catch (err) {
            console.error('寄送測試信失敗', err);
            alert('測試信寄送失敗，請確認郵件發送服務設定。');
        }
    };

    window.resetEmailTemplatesToDefault = function() {
        if (!confirm('確定要把此活動的所有信件模板恢復成系統預設嗎？目前尚未儲存的模板修改會被覆蓋。')) return;
        currentEditingEmailTemplates = createDefaultEmailTemplates();
        renderEmailTemplateEditors();
        alert('已恢復預設模板，請記得儲存活動。');
    };

    window.applyEmailTemplatesToAllEvents = async function() {
        if (!confirm('確定要把目前這組信件模板套用到所有活動嗎？此動作會更新所有活動的信件模板設定。')) return;
        try {
            const snapshot = await db.collection('events').get();
            if (snapshot.empty) {
                alert('目前沒有可套用的活動。');
                return;
            }
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { emailTemplates: currentEditingEmailTemplates });
            });
            await batch.commit();
            alert(`已套用到 ${snapshot.size} 個活動。`);
        } catch (err) {
            console.error('套用模板到所有活動失敗', err);
            alert('套用失敗，請稍後再試或查看 Console。');
        }
    };

    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            eventEditModal.style.display = 'none';
        });
    });

    addEventBtn.addEventListener('click', () => {
        document.getElementById('editEventId').value = '';
        document.getElementById('editEventName').value = '';
        document.getElementById('editEventCapacity').value = '15';
        document.getElementById('editEventStartDate').value = '';
        document.getElementById('editEventEndDate').value = '';
        document.getElementById('editEventTime').value = '';
        document.getElementById('editEventLocation').value = '';
        document.getElementById('editEventDesc').value = '';
        document.getElementById('editEventFee').value = '0';
        document.getElementById('editEventBankInfo').value = '';
        document.getElementById('editEventPaymentDueDays').value = '3';
        document.getElementById('editEventPaymentNote').value = '';
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`extName${i}`).value = '';
            document.getElementById(`extVal${i}`).value = '';
        }
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`eventImage${i}`).value = '';
            document.getElementById(`uploadStatus${i}`).textContent = '';
            updateImagePreview('', i);
        }
        document.getElementById('editEventIsActive').checked = true;
        document.getElementById('editEventAllowWaitlist').checked = true;
        document.getElementById('editEventAutoPromote').checked = true;
        currentEditingCustomFields = [];
        currentEditingSurveyFields = [];
        currentEditingEmailTemplates = createDefaultEmailTemplates();
        renderCustomFieldEditors();
        renderSurveyFieldEditors();
        renderEmailTemplateEditors();
        document.getElementById('eventModalTitle').textContent = '新增活動';
        eventEditModal.style.display = 'block';
    });

    const editEventFeeInput = document.getElementById('editEventFee');
    if (editEventFeeInput) {
        editEventFeeInput.addEventListener('input', renderEmailTemplateEditors);
        editEventFeeInput.addEventListener('change', renderEmailTemplateEditors);
    }

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
            if (key === 'type' && value === 'select') {
                if (!currentEditingCustomFields[index].optionsWithFollowup) {
                    // 初始化時預設有兩個選項：現場自取、寄送
                    currentEditingCustomFields[index].optionsWithFollowup = [
                        { value: '現場自取', hasExtra: false, extraLabel: '', extraRequired: false },
                        { value: '寄送', hasExtra: true, extraLabel: '寄送地址', extraRequired: true }
                    ];
                }
            }
        }
    };

    window.updateCustomFieldAndRender = function(index, key, value) {
        window.updateCustomField(index, key, value);
        renderCustomFieldEditors();
    };

    // 新增：更新特定單選選項的設定
    window.updateSelectOptionDetail = function(fieldIndex, optionIndex, key, value) {
        const field = currentEditingCustomFields[fieldIndex];
        if (field && field.optionsWithFollowup && field.optionsWithFollowup[optionIndex]) {
            field.optionsWithFollowup[optionIndex][key] = value;
            // 如果修改了選項文字，我們不渲染整個編輯器，避免 input 失去焦點，除非有必要
        }
    };

    window.updateSelectOptionDetailAndRender = function(fieldIndex, optionIndex, key, value) {
        window.updateSelectOptionDetail(fieldIndex, optionIndex, key, value);
        renderCustomFieldEditors();
    };

    // 新增：選項的動態增刪
    window.addSelectOption = function(fieldIndex) {
        const field = currentEditingCustomFields[fieldIndex];
        if (field) {
            if (!field.optionsWithFollowup) field.optionsWithFollowup = [];
            field.optionsWithFollowup.push({ value: '', hasExtra: false, extraLabel: '', extraRequired: false });
            renderCustomFieldEditors();
        }
    };

    window.removeSelectOption = function(fieldIndex, optionIndex) {
        const field = currentEditingCustomFields[fieldIndex];
        if (field && field.optionsWithFollowup) {
            field.optionsWithFollowup.splice(optionIndex, 1);
            renderCustomFieldEditors();
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
        customFieldsContainer.innerHTML = currentEditingCustomFields.map((f, index) => {
            let selectSettings = '';
            if (f.type === 'select') {
                // 如果是舊的 select 資料結構，自動將 options 升級轉換為 optionsWithFollowup 物件陣列格式
                if (!f.optionsWithFollowup) {
                    let oldOptions = [];
                    if (Array.isArray(f.options)) {
                        oldOptions = f.options;
                    } else if (f.optionsText) {
                        oldOptions = f.optionsText.split(/\r?\n/).map(o => o.trim()).filter(Boolean);
                    } else {
                        oldOptions = ['現場自取', '寄送'];
                    }

                    f.optionsWithFollowup = oldOptions.map(opt => {
                        // 相容舊的 followupTrigger 欄位
                        const isTrigger = String(opt).trim() === String(f.followupTrigger || '寄送').trim();
                        return {
                            value: opt,
                            hasExtra: isTrigger,
                            extraLabel: isTrigger ? (f.followupLabel || '寄送地址') : '',
                            extraRequired: isTrigger ? (f.followupRequired !== false) : false
                        };
                    });
                }

                // 渲染選項動態列表編輯器
                const optionsHtml = f.optionsWithFollowup.map((opt, optIdx) => {
                    const extraFieldConfig = opt.hasExtra ? `
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; padding-left: 24px; width: 100%;">
                            <i class="fas fa-level-up-alt fa-rotate-90" style="color: var(--text-muted); font-size: 0.85rem;"></i>
                            <input type="text" placeholder="補充欄位標題，如: 寄送地址" value="${escapeHtml(opt.extraLabel || '')}" onchange="updateSelectOptionDetail(${index}, ${optIdx}, 'extraLabel', this.value)" style="flex: 2; padding: 6px 10px; font-size: 0.85rem; border-radius: 6px; border: 1px solid var(--border-color);">
                            <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; cursor: pointer;">
                                <input type="checkbox" ${opt.extraRequired ? 'checked' : ''} onchange="updateSelectOptionDetail(${index}, ${optIdx}, 'extraRequired', this.checked)"> 必填
                            </label>
                        </div>
                    ` : '';

                    return `
                    <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px; border: 1px dashed var(--border-color); border-radius: 8px; background: #fffcf8; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: bold; width: 45px; flex-shrink: 0;">選項 ${optIdx + 1}</span>
                            <input type="text" placeholder="輸入選項名稱" value="${escapeHtml(opt.value || '')}" onchange="updateSelectOptionDetail(${index}, ${optIdx}, 'value', this.value)" style="flex: 1; padding: 6px 10px; font-size: 0.88rem; border-radius: 6px; border: 1px solid var(--border-color);">
                            <label style="display: flex; align-items: center; gap: 4px; font-size: 0.82rem; color: var(--text-main); font-weight: 500; cursor: pointer; white-space: nowrap;">
                                <input type="checkbox" ${opt.hasExtra ? 'checked' : ''} onchange="updateSelectOptionDetailAndRender(${index}, ${optIdx}, 'hasExtra', this.checked)"> 啟用補充欄位
                            </label>
                            <button type="button" class="btn-danger" onclick="removeSelectOption(${index}, ${optIdx})" style="padding: 3px 8px; font-size: 0.9rem; border-radius: 4px;">&times;</button>
                        </div>
                        ${extraFieldConfig}
                    </div>
                    `;
                }).join('');

                selectSettings = `
                <div style="width:100%; margin-top:10px; background: #faf8f5; padding: 15px; border-radius: 12px; border: 1px solid var(--border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <span style="font-size: 0.85rem; font-weight: bold; color: var(--text-main);"><i class="fas fa-list-ul text-accent"></i> 選項一對一補充欄位配置</span>
                        <button type="button" class="btn-secondary" onclick="addSelectOption(${index})" style="padding: 4px 12px; font-size: 0.8rem; border-radius: 6px; background: var(--accent); color: #fff; border: none; font-weight: bold;"><i class="fas fa-plus"></i> 新增選項</button>
                    </div>
                    <div style="max-height: 260px; overflow-y: auto; padding-right: 4px;">
                        ${optionsHtml}
                    </div>
                </div>
                `;
            }

            return `
            <div class="form-row" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; align-items: flex-start; border-bottom: 1px solid rgba(0,0,0,0.08); padding-bottom: 15px;">
                <input type="text" placeholder="報名欄位 (如: 贈品取件方式)" value="${escapeHtml(f.name || '')}" onchange="updateCustomField(${index}, 'name', this.value)" style="flex: 2; min-width: 190px;">
                <select onchange="updateCustomFieldAndRender(${index}, 'type', this.value)" style="flex: 1; min-width: 150px;">
                    <option value="text" ${f.type === 'text' ? 'selected' : ''}>單行文字</option>
                    <option value="tel" ${f.type === 'tel' ? 'selected' : ''}>電話 (手機)</option>
                    <option value="checkbox" ${f.type === 'checkbox' ? 'selected' : ''}>勾選 (Yes/No)</option>
                    <option value="select" ${f.type === 'select' ? 'selected' : ''}>單選選項</option>
                </select>
                <label style="display: flex; align-items: center; gap: 5px; font-size: 0.85rem; white-space: nowrap; cursor: pointer; margin-right: auto; padding-top:8px;">
                    <input type="checkbox" ${f.required ? 'checked' : ''} onchange="updateCustomField(${index}, 'required', this.checked)"> 必填
                </label>
                <button type="button" class="btn-danger" onclick="removeCustomField(${index})" style="padding: 5px 12px; font-size: 1.2rem; line-height: 1; border-radius: 6px;">&times;</button>
                ${selectSettings}
            </div>
            `;
        }).join('');
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

    function normalizeCustomFieldsForSave(fields = []) {
        return fields
            .filter(f => String(f.name || '').trim() !== '')
            .map(f => {
                const normalized = { ...f, name: String(f.name || '').trim() };
                if (normalized.type === 'select') {
                    if (Array.isArray(normalized.optionsWithFollowup)) {
                        // 過濾掉空選項並標準化文字
                        normalized.optionsWithFollowup = normalized.optionsWithFollowup
                            .map(o => ({
                                value: String(o.value || '').trim(),
                                hasExtra: !!o.hasExtra,
                                extraLabel: String(o.extraLabel || '').trim(),
                                extraRequired: !!o.extraRequired
                            }))
                            .filter(o => o.value !== '');
                        
                        // 同步保留相容舊版的單一選項欄位 (供舊版前台或分析讀取)
                        normalized.options = normalized.optionsWithFollowup.map(o => o.value);
                        normalized.optionsText = normalized.options.join('\n');
                        
                        // 找到第一個有啟用補充欄位的選項作為舊版 fallback
                        const firstFollowup = normalized.optionsWithFollowup.find(o => o.hasExtra);
                        if (firstFollowup) {
                            normalized.followupTrigger = firstFollowup.value;
                            normalized.followupLabel = firstFollowup.extraLabel;
                            normalized.followupRequired = firstFollowup.extraRequired;
                        } else {
                            normalized.followupTrigger = '';
                            normalized.followupLabel = '';
                            normalized.followupRequired = false;
                        }
                    }
                }
                return normalized;
            });
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
        const startDate = document.getElementById('editEventStartDate').value;
        const endDate = document.getElementById('editEventEndDate').value || startDate;

        if (startDate && endDate && endDate < startDate) {
            alert('結束日期不可早於開始日期。');
            return;
        }

        const extDetails = [];
        for (let i = 1; i <= 5; i++) {
            const name = document.getElementById(`extName${i}`).value.trim();
            const val = document.getElementById(`extVal${i}`).value.trim();
            if (name || val) {
                extDetails.push({ name, value: val });
            }
        }

        // 收集多圖藝廊資料
        const imagesList = [];
        for (let i = 1; i <= 5; i++) {
            const imgPath = document.getElementById(`eventImage${i}`).value.trim();
            if (imgPath) {
                imagesList.push(imgPath);
            }
        }

        if (imagesList.length === 0) {
            alert('請至少填寫或上傳一張活動圖片 (圖片 1)');
            return;
        }

        const data = {
            name: document.getElementById('editEventName').value.trim(),
            capacity: parseInt(document.getElementById('editEventCapacity').value) || 0,
            date: startDate,
            startDate: startDate,
            endDate: endDate,
            time: document.getElementById('editEventTime').value.trim(),
            location: document.getElementById('editEventLocation').value.trim(),
            description: document.getElementById('editEventDesc').value.trim(),
            extDetails: extDetails,
            image: imagesList[0] || '', // 相容舊有單圖封面欄位
            images: imagesList,         // 儲存完整多圖陣列 (最多5張)
            isActive: document.getElementById('editEventIsActive').checked,
            allowWaitlist: document.getElementById('editEventAllowWaitlist').checked,
            autoPromote: document.getElementById('editEventAutoPromote').checked,
            customFields: normalizeCustomFieldsForSave(currentEditingCustomFields),
            emailTemplates: currentEditingEmailTemplates,
            fee: parseInt(document.getElementById('editEventFee').value) || 0,
            bankInfo: document.getElementById('editEventBankInfo').value.trim(),
            paymentDueDays: parseInt(document.getElementById('editEventPaymentDueDays').value) || 3,
            paymentNote: document.getElementById('editEventPaymentNote').value.trim()
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
            const regCount = eventRegistrations.filter(r => r.eventId === e.id && normalizeRegistrationStatus(r.status) !== 'cancelled').length;
            const fullStr = (regCount >= e.capacity) ? '<span style="color:#ef4444; font-size:0.85rem; font-weight:bold;">[已滿]</span>' : '';
            return `
            <tr style="${e.isActive ? '' : 'opacity: 0.6;'}">
                <td><strong><a href="details.html?id=${e.id}" target="_blank" style="color: var(--text-main); text-decoration: none; transition: color 0.3s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-main)'">${e.name} <i class="fas fa-external-link-alt" style="font-size: 0.8rem; margin-left: 5px; color: var(--text-muted);"></i></a></strong></td>
                <td>${formatEventDateRange(e)} ${e.time}</td>
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
        document.getElementById('editEventStartDate').value = getEventStartDate(ev);
        document.getElementById('editEventEndDate').value = getEventEndDate(ev);
        document.getElementById('editEventTime').value = ev.time || '';
        document.getElementById('editEventLocation').value = ev.location || '';
        document.getElementById('editEventDesc').value = ev.description || '';
        document.getElementById('editEventFee').value = ev.fee || '0';
        document.getElementById('editEventBankInfo').value = ev.bankInfo || '';
        document.getElementById('editEventPaymentDueDays').value = ev.paymentDueDays || '3';
        document.getElementById('editEventPaymentNote').value = ev.paymentNote || '';
        
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

        // 清空並載入 5 個圖片槽
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`eventImage${i}`).value = '';
            document.getElementById(`uploadStatus${i}`).textContent = '';
            updateImagePreview('', i);
        }
        
        if (ev.images && Array.isArray(ev.images)) {
            ev.images.forEach((imgUrl, idx) => {
                if (idx < 5) {
                    const slotNum = idx + 1;
                    document.getElementById(`eventImage${slotNum}`).value = imgUrl || '';
                    updateImagePreview(imgUrl, slotNum);
                }
            });
        } else if (ev.image) {
            // 舊活動資料相容
            document.getElementById('eventImage1').value = ev.image || '';
            updateImagePreview(ev.image, 1);
        }
        document.getElementById('editEventIsActive').checked = ev.isActive !== false;
        document.getElementById('editEventAllowWaitlist').checked = ev.allowWaitlist !== false;
        document.getElementById('editEventAutoPromote').checked = ev.autoPromote !== false;
        
        currentEditingCustomFields = ev.customFields ? JSON.parse(JSON.stringify(ev.customFields)) : [];
        currentEditingSurveyFields = ev.surveyFields ? JSON.parse(JSON.stringify(ev.surveyFields)) : [];
        currentEditingEmailTemplates = mergeEmailTemplates(ev.emailTemplates || {});
        renderCustomFieldEditors();
        renderSurveyFieldEditors();
        renderEmailTemplateEditors();

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
    const paymentStatusFilter = document.getElementById('paymentStatusFilter');
    const batchConfirmPaymentBtn = document.getElementById('batchConfirmPaymentBtn');
    const sendPaymentRemindersBtn = document.getElementById('sendPaymentRemindersBtn');
    const selectedPaymentIds = new Set();

    function formatDateTimeTW(isoString) {
        if (!isoString) return '未設定';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '未設定';
        return date.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    function isPaymentOverdue(reg) {
        if (normalizeRegistrationStatus(reg.status) !== 'pending_payment' || !reg.paymentDueAt) return false;
        const dueAt = new Date(reg.paymentDueAt);
        return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now();
    }

    function buildPaymentDueAt(eventData) {
        const days = Math.max(parseInt(eventData?.paymentDueDays, 10) || 3, 1);
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + days);
        dueAt.setHours(23, 59, 59, 999);
        return dueAt.toISOString();
    }

    function expireOverduePayments(list) {
        list.filter(isPaymentOverdue).forEach(r => {
            db.collection('event_registrations').doc(r.id).update({
                status: 'payment_expired',
                paymentExpiredAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(err => console.warn('更新逾期付款狀態失敗:', err));
            r.status = 'payment_expired';
        });
    }

    function updateCheckinSelect() {
        if (!checkinSelect) return;
        const currentVal = checkinSelect.value;
        checkinSelect.innerHTML = '<option value="">請選擇活動...</option>' + events.map(e => 
            `<option value="${e.id}">${e.name} (${formatEventDateRange(e)})</option>`
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
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">請先選擇一個活動</td></tr>';
            document.getElementById('checkinCount').textContent = '0';
            document.getElementById('checkinCapacity').textContent = '0';
            if (batchConfirmPaymentBtn) batchConfirmPaymentBtn.style.display = 'none';
            return;
        }

        const ev = events.find(e => e.id === selectedId);
        let list = eventRegistrations.filter(r => r.eventId === selectedId);
        expireOverduePayments(list);
        
        const capacity = ev ? parseInt(ev.capacity) || 0 : 0;
        const activeRegs = list.filter(r => ['registered', 'checked-in', 'pending_payment', 'payment_reported'].includes(normalizeRegistrationStatus(r.status)));
        const checkedInCount = list.filter(r => normalizeRegistrationStatus(r.status) === 'checked-in').length;
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

        const filterValue = paymentStatusFilter ? paymentStatusFilter.value : 'all';
        if (filterValue !== 'all') {
            list = list.filter(r => {
                const s = normalizeRegistrationStatus(r.status);
                if (filterValue === 'paid') return s === 'registered' || s === 'checked-in';
                return s === filterValue;
            });
        }

        const visibleReportedIds = list.filter(r => normalizeRegistrationStatus(r.status) === 'payment_reported').map(r => r.id);
        selectedPaymentIds.forEach(id => {
            if (!visibleReportedIds.includes(id)) selectedPaymentIds.delete(id);
        });
        if (batchConfirmPaymentBtn) {
            batchConfirmPaymentBtn.style.display = selectedPaymentIds.size > 0 ? 'inline-flex' : 'none';
            batchConfirmPaymentBtn.innerHTML = `<i class="fas fa-check-double"></i> 批次確認收款 (${selectedPaymentIds.size})`;
        }

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">沒有符合條件的名單</td></tr>';
            return;
        }

        list.sort((a, b) => {
            if (normalizeRegistrationStatus(a.status) === 'cancelled' && normalizeRegistrationStatus(b.status) !== 'cancelled') return 1;
            if (normalizeRegistrationStatus(b.status) === 'cancelled' && normalizeRegistrationStatus(a.status) !== 'cancelled') return -1;
            return a.timestamp > b.timestamp ? 1 : -1;
        });

        let promoteCount = 0;
        const reportedLast5Counts = list.reduce((acc, item) => {
            if (normalizeRegistrationStatus(item.status) === 'payment_reported' && item.paymentLast5) {
                acc[item.paymentLast5] = (acc[item.paymentLast5] || 0) + 1;
            }
            return acc;
        }, {});

        tbody.innerHTML = list.map(r => {
            const ev = events.find(e => e.id === r.eventId);
            const isPaidEvent = ev && ev.fee > 0;
            
            let statusDisplay = `<span style="color:#9ca3af;">未知 (${r.status || '無'})</span>`;
            let paymentDisplay = isPaidEvent ? '<span style="color:#9ca3af;">-</span>' : '<span style="color:#10b981;">免費</span>';
            let paymentActionDisplay = r.paymentLast5 ? `<span style="font-family:monospace; font-weight:bold; color:var(--accent);">${r.paymentLast5}</span>` : '<span style="color:var(--text-muted);">-</span>';
            let actionBtn = '';
            
            const serialNo = (r.id || '').substring(0, 8).toUpperCase();
            const s = normalizeRegistrationStatus(r.status);
            const dueText = r.paymentDueAt ? `<div style="font-size:0.75rem; color:#8d7a6b; margin-top:4px;">期限：${formatDateTimeTW(r.paymentDueAt)}</div>` : '';
            const duplicateLast5Warning = r.paymentLast5 && reportedLast5Counts[r.paymentLast5] > 1
                ? '<div style="font-size:0.75rem; color:#ef4444; margin-top:4px;">同活動後五碼重複，請核對姓名與金額</div>'
                : '';

            if (s === 'pending_payment') {
                statusDisplay = '<span style="color:var(--text-muted);">等待繳費中</span>';
                paymentDisplay = `<span style="color:#ef4444; font-weight:bold;">待付款</span>${dueText}`;
                actionBtn = `<button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem; color:#ef4444; border-color:#ef4444;" onclick="cancelRegistration('${r.id}')">取消報名</button>`;
            } else if (s === 'payment_reported') {
                statusDisplay = '<span style="color:#f59e0b; font-weight:bold;">等待對帳</span>';
                paymentDisplay = `<span style="color:#f59e0b; font-weight:bold;">已回報</span>${dueText}`;
                paymentActionDisplay = `<label style="display:inline-flex; align-items:center; gap:5px; margin-right:6px;"><input type="checkbox" ${selectedPaymentIds.has(r.id) ? 'checked' : ''} onchange="togglePaymentSelection('${r.id}', this.checked)"> ${paymentActionDisplay}</label>`;
                paymentActionDisplay += ` <button class="btn-primary" style="padding:2px 8px; font-size:0.75rem; background:#10b981; border:none; margin-left:5px; margin-top:3px;" onclick="confirmPayment('${r.id}', '${r.eventId}')">確認收款</button>`;
                paymentActionDisplay += duplicateLast5Warning;
                actionBtn = `<button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem; color:#ef4444; border-color:#ef4444;" onclick="cancelRegistration('${r.id}')">取消報名</button>`;
            } else if (s === 'payment_expired') {
                statusDisplay = '<span style="color:#ef4444; font-weight:bold;">繳費逾期</span>';
                paymentDisplay = `<span style="color:#ef4444; font-weight:bold;">已逾期</span>${dueText}`;
                actionBtn = `
                    <button class="btn-primary" style="padding:4px 10px; font-size:0.85rem; background:#d97706; border:none; margin-right:5px;" onclick="reopenPayment('${r.id}', '${r.eventId}')">重開繳費</button>
                    <button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem; color:#ef4444; border-color:#ef4444;" onclick="cancelRegistration('${r.id}')">取消紀錄</button>
                `;
            } else if (s === 'checked-in') {
                statusDisplay = '<span style="color:#10b981; font-weight:bold;">已報到</span>';
                if (isPaidEvent) paymentDisplay = '<span style="color:#10b981; font-weight:bold;">已收款</span>';
                actionBtn = `<button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem;" onclick="toggleCheckin('${r.id}', 'registered')">取消報到</button>`;
            } else if (s === 'registered') {
                statusDisplay = '<span style="color:var(--text-muted);">未報到</span>';
                if (isPaidEvent) paymentDisplay = '<span style="color:#10b981; font-weight:bold;">已收款</span>';
                actionBtn = `
                    <button class="btn-primary" style="padding:4px 10px; font-size:0.85rem; background:#10b981; border:none; margin-right:5px;" onclick="toggleCheckin('${r.id}', 'checked-in')">報到</button>
                    <button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem; color:#ef4444; border-color:#ef4444;" onclick="cancelRegistration('${r.id}')">取消參加</button>
                `;
            } else if (s === 'waiting' || s === 'waitlist') {
                statusDisplay = '<span style="color:#f59e0b; font-weight:bold;">候補中</span>';
                if (isPaidEvent) paymentDisplay = '<span style="color:var(--text-muted);">尚未繳費</span>';
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
                if (isPaidEvent) paymentDisplay = '<span style="color:#9ca3af;">-</span>';
                actionBtn = `<span style="color:#9ca3af; font-size:0.85rem;">無操作</span>`;
            }

            return `
            <tr ${s === 'cancelled' ? 'style="opacity: 0.5;"' : ''}>
                <td style="font-family:monospace; color:var(--accent); font-weight:bold;">${serialNo}</td>
                <td style="color:var(--text-main); font-weight:bold;">${r.userName}</td>
                <td>${r.userPhone}</td>
                <td style="font-size:0.85rem; color:var(--text-muted);">${new Date(r.timestamp).toLocaleString('zh-TW')}</td>
                <td>${statusDisplay}</td>
                <td>${paymentDisplay}</td>
                <td>${paymentActionDisplay}</td>
                <td>${actionBtn}</td>
            </tr>
            `;
        }).join('');
    }

    if (checkinSelect) checkinSelect.addEventListener('change', renderCheckinList);
    if (checkinSearch) checkinSearch.addEventListener('input', renderCheckinList);
    if (paymentStatusFilter) paymentStatusFilter.addEventListener('change', renderCheckinList);

    window.togglePaymentSelection = function(regId, checked) {
        if (checked) {
            selectedPaymentIds.add(regId);
        } else {
            selectedPaymentIds.delete(regId);
        }
        renderCheckinList();
    };

    window.toggleCheckin = function(regId, newStatus) {
        db.collection('event_registrations').doc(regId).update({ status: newStatus });
    };

    window.confirmPayment = function(regId, eventId) {
        if (confirm("確認已收到款項？系統將會更改狀態為「已收款」，並自動寄送包含 QR Code 的正式報名成功信件給參加者。")) {
            const userReg = eventRegistrations.find(r => r.id === regId);
            const ev = events.find(e => e.id === eventId);
            db.collection('event_registrations').doc(regId).update({
                status: 'registered',
                paymentConfirmedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                if (userReg && ev) sendPaymentSuccessEmail(userReg, ev);
                alert("已確認收款，正式報名憑證信件已寄出！");
            }).catch(err => {
                console.error("更新狀態失敗:", err);
                alert("更新狀態失敗，請重試");
            });
        }
    };

    window.reopenPayment = function(regId, eventId) {
        const ev = events.find(e => e.id === eventId);
        const userReg = eventRegistrations.find(r => r.id === regId);
        if (!ev || !userReg) {
            alert('找不到活動或報名資料，請重新整理後再試。');
            return;
        }
        if (!confirm(`確定要重新開放 ${userReg.userName} 的繳費期限？系統會重新計算期限並寄出繳費提醒。`)) return;

        const paymentDueAt = buildPaymentDueAt(ev);
        db.collection('event_registrations').doc(regId).update({
            status: 'pending_payment',
            paymentDueAt,
            paymentReopenedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            return sendPaymentReminderEmail({ ...userReg, status: 'pending_payment', paymentDueAt }, ev, true);
        }).then(() => {
            alert('已重開繳費期限並寄出提醒信。');
        }).catch(err => {
            console.error('重開繳費失敗:', err);
            alert('重開繳費失敗，請稍後再試。');
        });
    };

    if (batchConfirmPaymentBtn) {
        batchConfirmPaymentBtn.addEventListener('click', async () => {
            const ids = Array.from(selectedPaymentIds);
            if (ids.length === 0) return;
            if (!confirm(`確認已收到這 ${ids.length} 筆款項？系統會批次改為正式報名並寄出 QR Code 信件。`)) return;

            batchConfirmPaymentBtn.disabled = true;
            batchConfirmPaymentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 處理中...';

            try {
                for (const regId of ids) {
                    const userReg = eventRegistrations.find(r => r.id === regId);
                    const ev = events.find(e => e.id === userReg?.eventId);
                    await db.collection('event_registrations').doc(regId).update({
                        status: 'registered',
                        paymentConfirmedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    if (userReg && ev) await sendPaymentSuccessEmail(userReg, ev);
                }
                selectedPaymentIds.clear();
                alert('批次確認收款完成，正式報名憑證信件已寄出。');
                renderCheckinList();
            } catch (err) {
                console.error('批次確認收款失敗:', err);
                alert('批次確認收款失敗，請稍後再試。');
            } finally {
                batchConfirmPaymentBtn.disabled = false;
                renderCheckinList();
            }
        });
    }

    if (sendPaymentRemindersBtn) {
        sendPaymentRemindersBtn.addEventListener('click', async () => {
            const selectedId = checkinSelect ? checkinSelect.value : '';
            if (!selectedId) {
                alert('請先選擇活動。');
                return;
            }
            const ev = events.find(e => e.id === selectedId);
            const list = eventRegistrations.filter(r => r.eventId === selectedId && normalizeRegistrationStatus(r.status) === 'pending_payment');
            if (list.length === 0) {
                alert('目前沒有待繳費名單需要提醒。');
                return;
            }
            if (!confirm(`確定要寄送繳費提醒給這 ${list.length} 位待繳費參加者嗎？`)) return;

            sendPaymentRemindersBtn.disabled = true;
            sendPaymentRemindersBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 寄送中...';
            try {
                for (const reg of list) {
                    await sendPaymentReminderEmail(reg, ev, false);
                    await db.collection('event_registrations').doc(reg.id).update({
                        paymentReminderSentAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                alert('繳費提醒已寄出。');
            } catch (err) {
                console.error('寄送繳費提醒失敗:', err);
                alert('寄送繳費提醒失敗，請稍後再試。');
            } finally {
                sendPaymentRemindersBtn.disabled = false;
                sendPaymentRemindersBtn.innerHTML = '<i class="fas fa-envelope"></i> 繳費提醒';
            }
        });
    }

    function sendPaymentReminderEmail(regData, eventData, isReopen) {
        if (typeof emailjs === 'undefined') return Promise.resolve();
        const actionText = isReopen ? '已重新開放繳費期限' : '提醒您完成繳費';
        const emailHtml = `
        <div style="background-color:#f5f1ea; padding:40px 20px; font-family:system-ui,-apple-system,sans-serif;">
            <div style="max-width:600px; margin:0 auto; background:#fdfbf7; border-radius:24px; overflow:hidden; border:1px solid #e5e0d8;">
                <div style="background:#fff; padding:40px 20px; text-align:center; border-bottom:1px solid #f1ece4;">
                    <h1 style="margin:0; font-size:26px; color:#4a3728; letter-spacing:6px;">藝 境 空 間</h1>
                    <p style="margin:10px 0 0 0; color:#d97706; letter-spacing:2px;">Payment Reminder</p>
                </div>
                <div style="padding:38px; color:#4a3728; line-height:1.8;">
                    <p>親愛的 <strong>${regData.userName}</strong> 您好，</p>
                    <p>${actionText}：您報名的 <strong style="color:#d97706;">${eventData.name}</strong> 目前仍為待繳費狀態。</p>
                    <div style="background:#fff; border:1px solid #eee; border-radius:14px; padding:20px; margin:20px 0;">
                        <p style="margin:0 0 8px 0;"><strong>應繳金額：</strong>NT$ ${(eventData.fee || 0).toLocaleString()}</p>
                        <p style="margin:0 0 8px 0;"><strong>繳費期限：</strong>${formatDateTimeTW(regData.paymentDueAt)}</p>
                        <p style="margin:0;"><strong>匯款資訊：</strong></p>
                        <div style="white-space:pre-wrap; font-family:monospace; color:#6b5a4d;">${eventData.bankInfo || '請依主辦單位提供資訊辦理'}</div>
                        ${eventData.paymentNote ? `<p style="margin:12px 0 0 0; color:#8a4b0f;"><strong>注意事項：</strong>${eventData.paymentNote}</p>` : ''}
                    </div>
                    <div style="text-align:center;">
                        <a href="https://a3614todoo-ship-it.github.io/event/payment.html?id=${regData.id}" style="display:inline-block; padding:12px 24px; background:#d97706; color:#fff; text-decoration:none; border-radius:10px; font-weight:bold;">回報匯款後五碼</a>
                    </div>
                    <p style="font-size:13px; color:#8d7a6b; margin-top:24px;">若您已完成回報，請忽略此信。藝境空間 管理團隊 敬上</p>
                </div>
            </div>
        </div>`;

        const templated = buildTemplatedEmail(
            'paymentReminder',
            regData,
            eventData,
            `【繳費提醒】${eventData.name}`,
            emailHtml
        );
        if (!templated) return Promise.resolve('paymentReminder disabled');

        return sendMailThroughAgent(
            regData.userEmail,
            regData.userName,
            templated.subject,
            templated.messageHtml
        );
    }

    async function sendPaymentSuccessEmail(regData, eventData) {
        const mainFont = 'system-ui, -apple-system, sans-serif';
        const primaryBg = '#fdfbf7';
        const accentColor = '#d97706';
        const textMain = '#4a3728';

        const emailHtml = `
        <div style="background-color: #f5f1ea; padding: 40px 20px; font-family: ${mainFont};">
            <div style="max-width: 600px; margin: 0 auto; background-color: ${primaryBg}; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(74, 55, 40, 0.1); border: 1px solid #e5e0d8;">
                <div style="background: #ffffff; padding: 45px 20px; text-align: center; border-bottom: 1px solid #f1ece4;">
                    <h1 style="margin: 0; font-size: 26px; color: ${textMain}; letter-spacing: 6px; font-weight: bold;">藝 境 空 間</h1>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: ${accentColor}; letter-spacing: 2px; text-transform: uppercase;">Payment Confirmed</p>
                </div>
                <div style="padding: 40px; line-height: 1.8; color: ${textMain};">
                    <p style="margin-bottom: 20px; font-size: 16px;">親愛的 <strong>${regData.userName}</strong> 您好，</p>
                    <p style="margin-bottom: 25px;">我們已經收到您的款項，您的活動 <strong style="color: ${accentColor};">${eventData.name}</strong> 報名已正式成功！</p>
                    
                    <div style="background-color: #ffffff; padding: 25px; border-radius: 16px; border: 1px solid #eee; margin-bottom: 30px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: ${textMain}; border-bottom: 2px solid ${accentColor}; display: inline-block; padding-bottom: 5px;">📅 活動資訊</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-top: 15px;">
                            <tr><td style="padding: 8px 0; color: #8d7a6b; width: 100px;">日期</td><td style="padding: 8px 0; font-weight: bold;">${formatEventDateRange(eventData)}</td></tr>
                            <tr><td style="padding: 8px 0; color: #8d7a6b;">時間</td><td style="padding: 8px 0; font-weight: bold;">${eventData.time}</td></tr>
                            <tr><td style="padding: 8px 0; color: #8d7a6b;">地點</td><td style="padding: 8px 0; font-weight: bold;">${eventData.location}</td></tr>
                        </table>
                    </div>

                    <div style="text-align: center; background: #ffffff; padding: 30px; border-radius: 16px; border: 1px dashed #d97706; margin-bottom: 30px;">
                        <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: bold; color: #d97706;">📌 您的報到憑證</p>
                        <img src="https://quickchart.io/chart?cht=qr&chs=180x180&chl=${regData.id}&choe=UTF-8" width="180" height="180" alt="QR Code" style="display: block; margin: 0 auto;">
                        <p style="margin: 15px 0 0 0; font-size: 14px; color: #4a3728;">請於抵達現場時<strong>出示此 QR Code 報到</strong></p>
                    </div>

                    <div style="text-align: center; border-top: 1px solid #f1ece4; padding-top: 30px; margin-top: 20px;">
                        <h4 style="margin: 0; font-size: 18px; color: ${textMain};">非常感謝您的參與！</h4>
                        <p style="margin: 10px 0 0 0; font-size: 13px; color: #bcae9e;">藝境空間 管理團隊 敬上</p>
                    </div>
                </div>
            </div>
        </div>`;

        const templated = buildTemplatedEmail(
            'paymentConfirmed',
            regData,
            eventData,
            `【收款確認】${eventData.name} 報名成功！`,
            emailHtml
        );
        if (!templated) return Promise.resolve('paymentConfirmed disabled');

        return sendMailThroughAgent(
            regData.userEmail,
            regData.userName,
            templated.subject,
            templated.messageHtml
        );
    }

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

            const scanStatus = normalizeRegistrationStatus(data.status);
            if (scanStatus === 'checked-in') {
                showScannerFeedback(`此序號已於先前報到：<br><strong>${data.userName}</strong>`, "warning");
            } else if (scanStatus === 'registered') {
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
            const list = eventRegistrations.filter(r => r.eventId === selectedId && normalizeRegistrationStatus(r.status) === 'registered');

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
                            <tr><td style="padding: 8px 0; color: #8d7a6b; width: 100px;">日期</td><td style="padding: 8px 0; font-weight: bold;">${formatEventDateRange(eventData)}</td></tr>
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

                    <!-- 報到須知區塊 -->
                    <div style="border: 1px solid #e5e0d8; border-radius: 12px; padding: 20px; background-color: #ffffff; margin-bottom: 25px;">
                        <h4 style="margin: 0 0 12px 0; font-size: 15px; color: ${textMain};">📍 報到須知</h4>
                        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #6b5a4d; line-height: 1.8;">
                            <li style="margin-bottom: 5px;">活動當天請<strong>預先開啟並準備好此 QR Code</strong>，或憑「報名姓名」及「手機末三碼」報到即可。</li>
                            <li style="margin-bottom: 5px;">建議您提早於活動開始前 <strong>10 分鐘</strong> 抵達現場。</li>
                            <li>為了維護活動品質，活動開始 15 分鐘後將停止報到。</li>
                        </ul>
                    </div>

                    <div style="text-align: center; border-top: 1px solid #f1ece4; padding-top: 30px; margin-top: 20px;">
                        <h4 style="margin: 0; font-size: 18px; color: ${textMain};">期待您的光臨！</h4>
                        <p style="margin: 10px 0 0 0; font-size: 13px; color: #bcae9e;">藝境空間 管理團隊 敬上</p>
                    </div>
                </div>
            </div>
        </div>`;

        const templated = buildTemplatedEmail(
            'preEventReminder',
            regData,
            eventData,
            `【行前提醒】${eventData.name}`,
            emailHtml
        );
        if (!templated) return Promise.resolve('preEventReminder disabled');

        return sendMailThroughAgent(
            regData.userEmail,
            regData.userName,
            templated.subject,
            templated.messageHtml
        );
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
            const list = eventRegistrations.filter(r => r.eventId === selectedId && normalizeRegistrationStatus(r.status) === 'checked-in');

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

        const templated = buildTemplatedEmail(
            'surveyInvite',
            regData,
            eventData,
            `【活動回饋】期待聽到您對《${eventData.name}》的看法`,
            emailHtml
        );
        if (!templated) return Promise.resolve('surveyInvite disabled');

        return sendMailThroughAgent(
            regData.userEmail,
            regData.userName,
            templated.subject,
            templated.messageHtml
        );
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
                let s = normalizeRegistrationStatus(r.status);
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
        const utmCtx = document.getElementById('utmSourceChart');
        if (!trendCtx || !popularCtx || !utmCtx) return;

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

        utmSourceChart = new Chart(utmCtx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#ec4899', '#14b8a6'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
    }

    function renderAnalytics() {
        if (!eventRegistrations || !events) return;
        const totalReg = eventRegistrations.length;
        const activeRegs = eventRegistrations.filter(r => normalizeRegistrationStatus(r.status) !== 'cancelled');
        const checkedIn = activeRegs.filter(r => normalizeRegistrationStatus(r.status) === 'checked-in').length;
        const waiting = activeRegs.filter(r => normalizeRegistrationStatus(r.status) === 'waiting').length;
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

        // 4. UTM 來源分析圓餅圖
        updateUtmChart();
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
            const count = eventRegistrations.filter(r => r.eventId === e.id && normalizeRegistrationStatus(r.status) !== 'cancelled').length;
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
            const regCount = eventRegistrations.filter(r => r.eventId === e.id && normalizeRegistrationStatus(r.status) !== 'cancelled').length;
            const checkedInCount = eventRegistrations.filter(r => r.eventId === e.id && normalizeRegistrationStatus(r.status) === 'checked-in').length;
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

    function updateUtmChart() {
        if (!utmSourceChart) return;

        const activeRegs = eventRegistrations.filter(r => normalizeRegistrationStatus(r.status) !== 'cancelled');
        const sourceMap = {};

        activeRegs.forEach(r => {
            const src = r.utmSource || 'direct';
            // 美化顯示名稱
            let displayName = src;
            if (src === 'direct') displayName = '直接來源/未追蹤';
            else if (src === 'facebook_share') displayName = 'FB 分享';
            else if (src === 'line_share') displayName = 'LINE 分享';
            else if (src === 'copy_link') displayName = '連結分享';

            sourceMap[displayName] = (sourceMap[displayName] || 0) + 1;
        });

        const labels = Object.keys(sourceMap);
        const data = Object.values(sourceMap);

        if (labels.length === 0) {
            utmSourceChart.data.labels = ['暫無資料'];
            utmSourceChart.data.datasets[0].data = [1];
            utmSourceChart.data.datasets[0].backgroundColor = ['#e2e8f0'];
        } else {
            utmSourceChart.data.labels = labels;
            utmSourceChart.data.datasets[0].data = data;
            utmSourceChart.data.datasets[0].backgroundColor = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#ec4899', '#14b8a6'];
        }

        utmSourceChart.update();
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
                            <tr><td style="padding: 10px 0; color: #8d7a6b;">活動日期</td><td style="padding: 10px 0; font-weight: bold;">${formatEventDateRange(eventData)}</td></tr>
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

                    <!-- 報到須知區塊 -->
                    <div style="border: 1px solid #e5e0d8; border-radius: 12px; padding: 20px; background-color: #ffffff; margin-bottom: 25px;">
                        <h4 style="margin: 0 0 12px 0; font-size: 15px; color: ${textMain};">📍 報到須知</h4>
                        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #6b5a4d; line-height: 1.8;">
                            <li style="margin-bottom: 5px;">活動當天請<strong>預先開啟並準備好此 QR Code</strong>，或憑「報名姓名」及「手機末三碼」報到即可。</li>
                            <li style="margin-bottom: 5px;">建議您提早於活動開始前 <strong>10 分鐘</strong> 抵達現場。</li>
                            <li>為了維護活動品質，活動開始 15 分鐘後將停止報到。</li>
                        </ul>
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
        const templated = buildTemplatedEmail(
            'waitlistPromoted',
            regData,
            eventData,
            `【遞補成功通知】${eventData.name}`,
            emailHtml
        );
        if (!templated) return;
        sendMailThroughAgent(
            regData.userEmail,
            regData.userName,
            templated.subject,
            templated.messageHtml
        ).catch(console.error);
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
                            <tr><td style="padding: 10px 0; color: #8d7a6b;">活動日期</td><td style="padding: 10px 0; font-weight: bold;">${formatEventDateRange(eventData)}</td></tr>
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
        const templated = buildTemplatedEmail(
            'cancelled',
            regData,
            eventData,
            `【報名取消確認】${eventData.name}`,
            emailHtml
        );
        if (!templated) return;
        sendMailThroughAgent(
            regData.userEmail,
            regData.userName,
            templated.subject,
            templated.messageHtml
        ).catch(console.error);
    }

    // 初始化畫面
    initCharts();
    setView();
});
