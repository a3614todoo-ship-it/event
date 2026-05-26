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
                    document.getElementById('eventTime').textContent = `${registrationData.eventDateRange || registrationData.eventDate} ${registrationData.eventTime}`;
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
            await sendPromotionEmail(waitData, eventData);
            console.log(`已自動遞補候補者: ${waitData.userName}`);
        }
    } catch (err) {
        console.error("自動遞補過程出錯:", err);
    }
}

// ---------------------------------------------------------
// Email 遞補通知邏輯 (從 events.js 移植精簡版)
// ---------------------------------------------------------
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatEventDateRange(eventData, data) {
    const start = eventData?.startDate || eventData?.date || data?.eventDate || '';
    const end = eventData?.endDate || eventData?.startDate || eventData?.date || data?.eventDate || '';
    if (!start) return data?.eventDateRange || '';
    return end && end !== start ? `${start} ~ ${end}` : start;
}

function plainTextToEmailHtml(text) {
    return `
    <div style="background-color:#f5f1ea; padding:40px 20px; font-family:system-ui,-apple-system,sans-serif;">
        <div style="max-width:600px; margin:0 auto; background:#fdfbf7; border-radius:24px; overflow:hidden; border:1px solid #e5e0d8;">
            <div style="background:#fff; padding:36px 20px; text-align:center; border-bottom:1px solid #f1ece4;">
                <h1 style="margin:0; font-size:24px; color:#4a3728; letter-spacing:5px;">藝 境 空 間</h1>
            </div>
            <div style="padding:36px; color:#4a3728; line-height:1.8; font-size:15px;">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
        </div>
    </div>`;
}

function buildQrCodeHtml(data) {
    return `
    <div style="text-align:center; background:#ffffff; padding:30px; border-radius:16px; border:1px dashed #d97706; margin:24px 0;">
        <p style="margin:0 0 15px 0; font-size:15px; font-weight:bold; color:#d97706;">您的報到 QR Code</p>
        <img src="https://quickchart.io/chart?cht=qr&chs=180x180&chl=${encodeURIComponent(data.id)}&choe=UTF-8" width="180" height="180" alt="QR Code" style="display:block; margin:0 auto;">
        <p style="margin:15px 0 0 0; font-size:14px; color:#4a3728;">請於抵達現場時出示此 QR Code 報到</p>
    </div>`;
}

function buildEventInfoBlockHtml(data, eventData) {
    return `
    <div style="background-color:#ffffff; padding:25px; border-radius:16px; border:1px solid #eee; margin:24px 0 30px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
        <h3 style="margin:0 0 15px 0; font-size:18px; color:#4a3728; border-bottom:2px solid #d97706; display:inline-block; padding-bottom:5px;">📋 活動資訊</h3>
        <table style="width:100%; border-collapse:collapse; font-size:15px; margin-top:15px;">
            <tr><td style="padding:10px 0; color:#8d7a6b; width:100px;">目前狀態</td><td style="padding:10px 0; font-weight:bold; color:#d97706;">遞補成功 (Confirmed)</td></tr>
            <tr><td style="padding:10px 0; color:#8d7a6b;">活動名稱</td><td style="padding:10px 0; font-weight:bold;">${escapeHtml(eventData?.name || data.eventName)}</td></tr>
            <tr><td style="padding:10px 0; color:#8d7a6b;">活動日期</td><td style="padding:10px 0; font-weight:bold;">${escapeHtml(data.eventDateRange || formatEventDateRange(eventData, data))}</td></tr>
            <tr><td style="padding:10px 0; color:#8d7a6b;">活動時間</td><td style="padding:10px 0; font-weight:bold;">${escapeHtml(eventData?.time || data.eventTime || '')}</td></tr>
            <tr><td style="padding:10px 0; color:#8d7a6b;">報名序號</td><td style="padding:10px 0; font-family:monospace; font-size:18px; color:#4a3728;">${escapeHtml(data.id.substring(0, 8).toUpperCase())}</td></tr>
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

function buildEmailVars(data, eventData) {
    return {
        '姓名': data.userName || '',
        '活動名稱': eventData?.name || data.eventName || '',
        '活動日期': data.eventDateRange || formatEventDateRange(eventData, data),
        '活動時間': eventData?.time || data.eventTime || '',
        '活動地點': eventData?.location || data.eventLocation || '',
        '報名序號': (data.id || '').substring(0, 8).toUpperCase(),
        'QRCode': '__QR_CODE_BLOCK__',
        '活動資訊區塊': '__EVENT_INFO_BLOCK__',
        '報到須知區塊': '__CHECKIN_NOTICE_BLOCK__'
    };
}

function applyEmailTemplateText(text, vars) {
    return String(text || '').replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[String(key).trim()] ?? '');
}

function injectRichEmailBlocks(html, data, eventData) {
    return html
        .replace(/__QR_CODE_BLOCK__/g, buildQrCodeHtml(data))
        .replace(/__EVENT_INFO_BLOCK__/g, buildEventInfoBlockHtml(data, eventData))
        .replace(/__CHECKIN_NOTICE_BLOCK__/g, buildCheckinNoticeBlockHtml());
}

function normalizeWaitlistTemplate(template) {
    if (!template) return null;
    const updated = { ...template };
    const oldBodies = [
        '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n請留意報到資訊並準時出席。',
        '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n{{QRCode}}\n\n請留意報到資訊並準時出席。'
    ];
    if (oldBodies.includes(updated.body)) {
        updated.body = '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n請留意報到資訊並準時出席。';
    }
    return updated;
}

async function sendPromotionEmail(data, eventData = {}) {
    if (typeof emailjs === 'undefined') return;
    const customTemplate = normalizeWaitlistTemplate(eventData?.emailTemplates?.waitlistPromoted);
    if (customTemplate?.enabled === false) return;
    
    // 生成 Email HTML (此處使用簡化版發信邏輯)
    const emailHtml = `
    <div style="background-color: #fdfbf7; padding: 40px; font-family: sans-serif; border: 1px solid #e5e0d8; border-radius: 20px;">
        <h2 style="color: #d97706;">【遞補成功通知】${data.eventName}</h2>
        <p>親愛的 <strong>${data.userName}</strong> 您好，</p>
        <p>好消息！由於有人取消報名，我們已依照順位為您<strong>自動遞補</strong>為正式參與者。</p>
        ${buildEventInfoBlockHtml(data, eventData)}
        ${buildQrCodeHtml(data)}
        ${buildCheckinNoticeBlockHtml()}
        <p>您可以點擊下方連結查看詳細資訊並加入行事曆：</p>
        <a href="https://a3614todoo-ship-it.github.io/event/details.html?id=${data.eventId}" style="display: inline-block; padding: 12px 25px; background: #d97706; color: white; text-decoration: none; border-radius: 50px;">查看活動詳情</a>
    </div>`;

    const vars = buildEmailVars(data, eventData);
    const subject = customTemplate?.subject
        ? applyEmailTemplateText(customTemplate.subject, vars)
        : `【遞補成功】您已成功獲得《${data.eventName}》入場名額！`;
    const messageHtml = customTemplate?.body
        ? injectRichEmailBlocks(plainTextToEmailHtml(applyEmailTemplateText(customTemplate.body, vars)), data, eventData)
        : emailHtml;

    return emailjs.send("service_96agth6", "template_uz1rccd", {
        to_email: data.userEmail,
        to_name: data.userName,
        subject,
        message_html: messageHtml
    });
}

init();
