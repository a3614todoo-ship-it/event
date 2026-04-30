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
        const oldStatus = registrationData.status;
        const eventId = registrationData.eventId;

        // 1. 更新取消者狀態
        await db.collection('event_registrations').doc(regId).update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'user'
        });

        // 2. 如果取消的是正式名額，嘗試自動遞補
        if (oldStatus === 'registered') {
            await tryAutoPromote(eventId);
        }
        
        showState('success');
    } catch (err) {
        console.error(err);
        alert('取消失敗，請稍後再試或聯繫管理員。');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '確認取消報名';
    }
});

async function tryAutoPromote(eventId) {
    try {
        // 先讀取活動設定
        const eventDoc = await db.collection('events').doc(eventId).get();
        if (!eventDoc.exists) return;
        
        const eventData = eventDoc.data();
        // 如果管理者關閉了自動遞補，則直接跳過
        if (eventData.autoPromote === false) {
            console.log("此活動已關閉自動遞補功能。");
            return;
        }

        // 搜尋該活動最早的候補者
        const snapshot = await db.collection('event_registrations')
            .where('eventId', '==', eventId)
            .where('status', '==', 'waitlist')
            .orderBy('timestamp', 'asc')
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const waitDoc = snapshot.docs[0];
            const waitData = { id: waitDoc.id, ...waitDoc.data() };
            
            // 更新狀態為正式報名
            await db.collection('event_registrations').doc(waitDoc.id).update({
                status: 'registered',
                promotedAt: new Date().toISOString()
            });

            // 發送遞補成功通知信
            waitData.status = 'registered'; // 暫時修改供模板使用
            await sendPromotionEmail(waitData);
            console.log(`已自動遞補候補者: ${waitData.userName}`);
        }
    } catch (err) {
        console.error("自動遞補過程出錯:", err);
    }
}

// ---------------------------------------------------------
// Email 遞補通知邏輯 (從 events.js 移植精簡版)
// ---------------------------------------------------------
async function sendPromotionEmail(data) {
    if (typeof emailjs === 'undefined') return;
    
    // 生成 Email HTML (此處使用簡化版發信邏輯)
    const emailHtml = `
    <div style="background-color: #fdfbf7; padding: 40px; font-family: sans-serif; border: 1px solid #e5e0d8; border-radius: 20px;">
        <h2 style="color: #d97706;">【遞補成功通知】${data.eventName}</h2>
        <p>親愛的 <strong>${data.userName}</strong> 您好，</p>
        <p>好消息！由於有人取消報名，我們已依照順位為您<strong>自動遞補</strong>為正式參與者。</p>
        <div style="background: #ffffff; padding: 20px; border: 1px solid #eee; border-radius: 12px; margin: 20px 0;">
            <p><strong>活動名稱：</strong>${data.eventName}</p>
            <p><strong>報名序號：</strong>${data.id.substring(0, 8).toUpperCase()}</p>
            <p style="color: #d97706; font-weight: bold;">請務必妥善保管您的 QR Code 憑證。</p>
        </div>
        <p>您可以點擊下方連結查看詳細資訊並加入行事曆：</p>
        <a href="https://a3614todoo-ship-it.github.io/event/details.html?id=${data.eventId}" style="display: inline-block; padding: 12px 25px; background: #d97706; color: white; text-decoration: none; border-radius: 50px;">查看活動詳情</a>
    </div>`;

    return emailjs.send("service_96agth6", "template_uz1rccd", {
        to_email: data.userEmail,
        to_name: data.userName,
        subject: `【遞補成功】您已成功獲得《${data.eventName}》入場名額！`,
        message_html: emailHtml
    });
}

init();
