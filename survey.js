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

const urlParams = new URLSearchParams(window.location.search);
const regId = urlParams.get('id');

const loadingState = document.getElementById('loadingState');
const formState = document.getElementById('formState');
const successState = document.getElementById('successState');
const errorState = document.getElementById('errorState');
const surveyForm = document.getElementById('surveyForm');

let registrationData = null;

async function init() {
    if (!regId) {
        showState('error');
        return;
    }

    try {
        // 1. 檢查報名紀錄是否存在
        const regDoc = await db.collection('event_registrations').doc(regId).get();
        if (!regDoc.exists) {
            showState('error');
            return;
        }
        registrationData = regDoc.data();

        // 2. 檢查是否已經填寫過
        const surveyCheck = await db.collection('event_surveys').where('registrationId', '==', regId).get();
        if (!surveyCheck.empty) {
            document.getElementById('errorMsg').textContent = '您已經填寫過此活動的問卷，謝謝您的支持！';
            showState('error');
            return;
        }

        // 3. 顯示活動名稱
        document.getElementById('eventName').textContent = registrationData.eventName;
        showState('form');

    } catch (err) {
        console.error(err);
        showState('error');
    }
}

function showState(state) {
    loadingState.style.display = 'none';
    formState.style.display = (state === 'form' ? 'block' : 'none');
    successState.style.display = (state === 'success' ? 'block' : 'none');
    errorState.style.display = (state === 'error' ? 'block' : 'none');
}

surveyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = surveyForm.querySelector('.btn-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';

    const rating = document.querySelector('input[name="rating"]:checked')?.value;
    const recommend = document.querySelector('input[name="recommend"]:checked')?.value;
    const favoritePart = document.getElementById('favoritePart').value.trim();
    const suggestions = document.getElementById('suggestions').value.trim();

    try {
        await db.collection('event_surveys').add({
            registrationId: regId,
            eventId: registrationData.eventId,
            eventName: registrationData.eventName,
            userName: registrationData.userName,
            userEmail: registrationData.userEmail,
            rating: parseInt(rating),
            recommend: recommend,
            favoritePart: favoritePart,
            suggestions: suggestions,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            submittedAt: new Date().toISOString()
        });

        showState('success');
    } catch (err) {
        console.error(err);
        alert('提交失敗，請檢查網路連線或稍後再試。');
        submitBtn.disabled = false;
        submitBtn.textContent = '提交回饋';
    }
});

init();
