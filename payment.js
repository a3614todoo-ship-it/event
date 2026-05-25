// 匯款回報頁獨立使用，需自行完成 Firebase 初始化，避免依賴不存在的共用設定檔。
const firebaseConfig = {
    apiKey: "AIzaSyBmymCsLnheBKGunfZGskM1Ut_Swb13ZhA",
    authDomain: "company-events-620bd.firebaseapp.com",
    projectId: "company-events-620bd",
    storageBucket: "company-events-620bd.firebasestorage.app",
    messagingSenderId: "484682651822",
    appId: "1:484682651822:web:1a7d612263f470c020353f",
    measurementId: "G-7YNHQYDXPZ"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const EMAILJS_PUBLIC_KEY = '2NlEiWtXcW05Awbjt';
const EMAILJS_SERVICE_ID = 'service_96agth6';
const EMAILJS_TEMPLATE_ID = 'template_uz1rccd';

if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

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

function isPastDue(isoString) {
    if (!isoString) return false;
    const dueAt = new Date(isoString);
    return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now();
}

function sendPaymentReportReceivedEmail(regData, eventData, last5Digits) {
    if (typeof emailjs === 'undefined') return Promise.resolve();
    const eventName = eventData.name || regData.eventName || '活動';

    const emailHtml = `
    <div style="background-color:#f5f1ea; padding:40px 20px; font-family:system-ui,-apple-system,sans-serif;">
        <div style="max-width:600px; margin:0 auto; background:#fdfbf7; border-radius:24px; overflow:hidden; border:1px solid #e5e0d8;">
            <div style="background:#fff; padding:36px 20px; text-align:center; border-bottom:1px solid #f1ece4;">
                <h1 style="margin:0; font-size:24px; color:#4a3728; letter-spacing:5px;">藝 境 空 間</h1>
                <p style="margin:10px 0 0 0; color:#d97706; letter-spacing:2px;">Payment Report Received</p>
            </div>
            <div style="padding:36px; color:#4a3728; line-height:1.8;">
                <p>親愛的 <strong>${regData.userName}</strong> 您好，</p>
                <p>我們已收到您針對 <strong style="color:#d97706;">${eventName}</strong> 的匯款回報，後五碼為 <strong>${last5Digits}</strong>。</p>
                <p>目前狀態為「等待對帳」。管理員確認收款後，系統會寄出包含報到 QR Code 的正式報名成功信。</p>
                <div style="background:#fff; border:1px solid #eee; border-radius:14px; padding:18px; margin-top:22px;">
                    <p style="margin:0;"><strong>應繳金額：</strong>NT$ ${(eventData.fee || 0).toLocaleString()}</p>
                    <p style="margin:8px 0 0 0;"><strong>繳費期限：</strong>${formatDateTimeTW(regData.paymentDueAt)}</p>
                </div>
                <p style="font-size:13px; color:#8d7a6b; margin-top:24px;">藝境空間 管理團隊 敬上</p>
            </div>
        </div>
    </div>`;

    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: regData.userEmail,
        to_name: regData.userName,
        subject: `【已收到匯款回報】${eventName}`,
        message_html: emailHtml
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const regId = urlParams.get('id');

    const loadingState = document.getElementById('loadingState');
    const formState = document.getElementById('formState');
    const successState = document.getElementById('successState');
    const errorState = document.getElementById('errorState');
    const errorMsg = document.getElementById('errorMsg');
    
    if (!regId) {
        showError('連結缺少必要參數，請從您的信箱中點擊正確的連結。');
        return;
    }

    try {
        // 讀取報名資料
        const regDoc = await db.collection('event_registrations').doc(regId).get();
        if (!regDoc.exists) {
            showError('找不到對應的報名紀錄。');
            return;
        }

        const regData = regDoc.data();
        
        // 檢查狀態
        if (regData.status === 'payment_reported') {
            showError('您已經回報過匯款資訊了！我們正在為您對帳中，請耐心等候。');
            return;
        } else if (regData.status === 'registered' || regData.status === 'checked-in') {
            showError('此報名紀錄已確認收款成功，無須再次回報。');
            return;
        } else if (regData.status === 'cancelled') {
            showError('此報名已取消。');
            return;
        } else if (regData.status === 'payment_expired') {
            showError('此報名已超過繳費期限，保留名額已釋出。若仍想參加，請回到活動頁重新報名或聯繫主辦單位。');
            return;
        } else if (regData.status !== 'pending_payment') {
            showError(`此紀錄狀態無法回報匯款 (${regData.status})。`);
            return;
        }

        // 讀取活動資料，顯示參加者核對所需資訊。
        let eventData = null;
        const eventDoc = await db.collection('events').doc(regData.eventId).get();
        if (eventDoc.exists) {
            eventData = eventDoc.data();
            document.getElementById('eventName').textContent = eventData.name;
            document.getElementById('eventFee').textContent = `NT$ ${(eventData.fee || 0).toLocaleString()}`;
            document.getElementById('bankInfo').textContent = eventData.bankInfo || '請依通知信中的匯款資訊辦理';
            const noteEl = document.getElementById('paymentNote');
            if (eventData.paymentNote) {
                noteEl.textContent = `備註：${eventData.paymentNote}`;
                noteEl.style.display = 'block';
            }
        } else {
            document.getElementById('eventName').textContent = regData.eventName || '未知活動';
            document.getElementById('eventFee').textContent = '';
            document.getElementById('bankInfo').textContent = '請依通知信中的匯款資訊辦理';
        }

        document.getElementById('paymentDueAt').textContent = formatDateTimeTW(regData.paymentDueAt);
        
        document.getElementById('regName').textContent = `報名者：${regData.userName}`;

        if (isPastDue(regData.paymentDueAt)) {
            await db.collection('event_registrations').doc(regId).update({
                status: 'payment_expired',
                paymentExpiredAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showError('此報名已超過繳費期限，保留名額已釋出。若仍想參加，請回到活動頁重新報名或聯繫主辦單位。');
            return;
        }

        const copyBtn = document.getElementById('copyBankInfoBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const copyText = [
                    `活動：${eventData?.name || regData.eventName || ''}`,
                    `應繳金額：NT$ ${(eventData?.fee || 0).toLocaleString()}`,
                    `繳費期限：${formatDateTimeTW(regData.paymentDueAt)}`,
                    `匯款資訊：${eventData?.bankInfo || ''}`
                ].join('\n');
                try {
                    await navigator.clipboard.writeText(copyText);
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> 已複製';
                    setTimeout(() => copyBtn.innerHTML = '<i class="fas fa-copy"></i> 複製匯款資訊', 1800);
                } catch (err) {
                    alert('無法自動複製，請手動選取匯款資訊。');
                }
            });
        }
        
        // 顯示表單
        loadingState.style.display = 'none';
        formState.style.display = 'block';

        // 處理表單提交
        const paymentForm = document.getElementById('paymentForm');
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submitBtn');
            const last5Digits = document.getElementById('last5Digits').value.trim();

            if (!/^\d{5}$/.test(last5Digits)) {
                alert('請輸入正確的 5 碼數字');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送出中...';

            try {
                // 更新狀態與後五碼，後台會依此顯示「等待對帳」與確認收款按鈕。
                await db.collection('event_registrations').doc(regId).update({
                    status: 'payment_reported',
                    paymentLast5: last5Digits,
                    paymentReportTime: new Date().toISOString(),
                    paymentUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                sendPaymentReportReceivedEmail(regData, eventData || {}, last5Digits).catch(err => {
                    console.warn('匯款回報確認信寄送失敗:', err);
                });

                // 顯示成功畫面
                formState.style.display = 'none';
                successState.style.display = 'block';
            } catch (err) {
                console.error('Update failed:', err);
                alert('系統錯誤，請稍後再試。');
                submitBtn.disabled = false;
                submitBtn.textContent = '送出回報';
            }
        });

    } catch (err) {
        console.error("Initialization error:", err);
        showError('系統連線發生錯誤，請稍後再試。');
    }

    function showError(msg) {
        loadingState.style.display = 'none';
        formState.style.display = 'none';
        successState.style.display = 'none';
        errorState.style.display = 'block';
        if (msg) errorMsg.textContent = msg;
    }
});
