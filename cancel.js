// ==========================================
// Firebase 設定 (與 admin.js/events.js 一致)
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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 從網址讀取參數
const urlParams = new URLSearchParams(window.location.search);
const regId = urlParams.get('id');
const regEmail = urlParams.get('email');

const loadingState = document.getElementById('loadingState');
const confirmState = document.getElementById('confirmState');
const successState = document.getElementById('successState');
const errorState = document.getElementById('errorState');
const confirmBtn = document.getElementById('confirmBtn');

let registrationData = null;

// 頁面初始化
async function init() {
    if (!regId || !regEmail) {
        showState('error');
        return;
    }

    try {
        const doc = await db.collection('event_registrations').doc(regId).get();
        if (doc.exists) {
            registrationData = doc.data();
            
            // 驗證 Email 是否匹配 (基本安全檢查)
            if (registrationData.userEmail.toLowerCase() === regEmail.toLowerCase()) {
                if (registrationData.status === 'cancelled') {
                    document.getElementById('errorMsg').textContent = '此報名紀錄先前已取消。';
                    showState('error');
                } else {
                    document.getElementById('eventName').textContent = registrationData.eventName;
                    document.getElementById('eventTime').textContent = `${registrationData.eventDate} ${registrationData.eventTime}`;
                    showState('confirm');
                }
            } else {
                showState('error');
            }
        } else {
            showState('error');
        }
    } catch (err) {
        console.error(err);
        showState('error');
    }
}

function showState(state) {
    loadingState.style.display = 'none';
    confirmState.style.display = (state === 'confirm' ? 'block' : 'none');
    successState.style.display = (state === 'success' ? 'block' : 'none');
    errorState.style.display = (state === 'error' ? 'block' : 'none');
}

// 執行取消
confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 處理中...';
    
    try {
        await db.collection('event_registrations').doc(regId).update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'user'
        });
        
        showState('success');
    } catch (err) {
        console.error(err);
        alert('取消失敗，請稍後再試或聯繫管理員。');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '確認取消報名';
    }
});

init();
