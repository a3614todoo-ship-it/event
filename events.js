/**
 * 藝境空間 | 活動報名站 - 詳情頁核心邏輯
 * 移植自「場地租借系統」之定案版本，確保報名體驗與信件完全一致。
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

// EmailJS 初始化 (使用定案版 Key)
const EMAILJS_PUBLIC_KEY = '2NlEiWtXcW05Awbjt';
if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

let currentEvent = null;
let registrationsCount = 0;
const urlParams = new URLSearchParams(window.location.search);
let eventId = urlParams.get('id');

// [行銷] UTM 來源追蹤擷取
const utmSource = urlParams.get('utm_source') || 'direct';
const utmMedium = urlParams.get('utm_medium') || '';
const utmCampaign = urlParams.get('utm_campaign') || '';

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

function formatCalendarDate(dateValue) {
    return (dateValue || '').replace(/-/g, '');
}

function getEventEndDateForCalendar(eventData) {
    return getEventEndDate(eventData) || getEventStartDate(eventData);
}

function buildPaymentDueAt(eventData) {
    const days = Math.max(parseInt(eventData?.paymentDueDays, 10) || 3, 1);
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + days);
    dueAt.setHours(23, 59, 59, 999);
    return dueAt.toISOString();
}

function copyTextToClipboard(text, successMessage = '已複製到剪貼簿') {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => alert(successMessage)).catch(() => {
            prompt('請手動複製以下資訊：', text);
        });
    } else {
        prompt('請手動複製以下資訊：', text);
    }
}

function getEmailTemplate(eventData, key) {
    return normalizeEmailTemplate(key, eventData?.emailTemplates?.[key] || null);
}

function normalizeEmailTemplate(key, template) {
    if (!template) return null;
    const updated = { ...template };
    const richDefaults = {
        registrationSuccess: '親愛的 {{姓名}} 您好，\n\n恭喜您！您已成功報名 {{活動名稱}}，以下是您的報名資訊：\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n請留意活動通知，期待與您相見。',
        pendingPayment: '親愛的 {{姓名}} 您好，\n\n感謝您的報名！本活動需繳交費用 {{應繳金額}}，請於 {{繳費期限}} 前完成匯款，並回報您的帳號後五碼以保留名額。\n\n{{活動資訊區塊}}\n\n{{報到須知區塊}}\n\n{{匯款資訊區塊}}\n\n{{回報連結}}',
        waitlistPromoted: '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n\n{{活動資訊區塊}}\n\n{{QRCode}}\n\n{{報到須知區塊}}\n\n請留意報到資訊並準時出席。'
    };
    const oldBodies = {
        registrationSuccess: [
            '親愛的 {{姓名}} 您好，\n\n您已成功報名 {{活動名稱}}。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n報名序號：{{報名序號}}\n請留意活動通知，期待與您相見。',
            '親愛的 {{姓名}} 您好，\n\n您已成功報名 {{活動名稱}}。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n報名序號：{{報名序號}}\n\n{{QRCode}}\n\n請留意活動通知，期待與您相見。'
        ],
        pendingPayment: [
            '親愛的 {{姓名}} 您好，\n\n您已完成 {{活動名稱}} 的報名保留。\n應繳金額：{{應繳金額}}\n繳費期限：{{繳費期限}}\n\n匯款資訊：\n{{匯款資訊}}\n\n注意事項：\n{{付款注意事項}}\n\n完成匯款後請回報後五碼：{{回報連結}}',
            '親愛的 {{姓名}} 您好，\n\n您已完成 {{活動名稱}} 的報名保留。\n應繳金額：{{應繳金額}}\n繳費期限：{{繳費期限}}\n\n匯款資訊：\n{{匯款資訊}}\n\n注意事項：\n{{付款注意事項}}\n\n完成匯款後，請點擊下方按鈕回報匯款帳號後五碼：\n{{回報連結}}'
        ],
        waitlistPromoted: [
            '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n請留意報到資訊並準時出席。',
            '親愛的 {{姓名}} 您好，\n\n您已成功遞補 {{活動名稱}} 的入場名額。\n活動日期：{{活動日期}}\n活動時間：{{活動時間}}\n活動地點：{{活動地點}}\n\n{{QRCode}}\n\n請留意報到資訊並準時出席。'
        ]
    };
    if (oldBodies[key]?.includes(updated.body)) {
        updated.body = richDefaults[key];
    }
    return updated;
}

function isEmailTemplateEnabled(eventData, key) {
    const template = getEmailTemplate(eventData, key);
    return template ? template.enabled !== false : true;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
    if (!data?.id) return '';
    return `
    <div style="text-align:center; background:#ffffff; padding:30px; border-radius:16px; border:1px dashed #d97706; margin:24px 0;">
        <p style="margin:0 0 15px 0; font-size:15px; font-weight:bold; color:#d97706;">您的報到 QR Code</p>
        <img src="https://quickchart.io/chart?cht=qr&chs=180x180&chl=${encodeURIComponent(data.id)}&choe=UTF-8" width="180" height="180" alt="QR Code" style="display:block; margin:0 auto;">
        <p style="margin:15px 0 0 0; font-size:14px; color:#4a3728;">請於抵達現場時出示此 QR Code 報到</p>
    </div>`;
}

function injectRichEmailBlocks(html, data, eventData = {}, templateKey = '') {
    return html
        .replace(/__QR_CODE_BLOCK__/g, buildQrCodeHtml(data))
        .replace(/__PAYMENT_REPORT_BUTTON__/g, buildPaymentReportButtonHtml(data))
        .replace(/__EVENT_INFO_BLOCK__/g, buildEventInfoBlockHtml(data, eventData, templateKey))
        .replace(/__CHECKIN_NOTICE_BLOCK__/g, buildCheckinNoticeBlockHtml())
        .replace(/__PAYMENT_INFO_BLOCK__/g, buildPaymentInfoBlockHtml(data, eventData));
}

function buildPaymentReportButtonHtml(data) {
    if (!data?.id) return '';
    const baseUrl = 'https://a3614todoo-ship-it.github.io/event';
    const reportUrl = `${baseUrl}/payment.html?id=${encodeURIComponent(data.id)}`;
    return `
    <div style="text-align:center; margin:28px 0;">
        <a href="${reportUrl}" style="display:inline-block; background:#d97706; color:#ffffff; text-decoration:none; padding:14px 26px; border-radius:999px; font-weight:700; letter-spacing:1px;">
            回報匯款後五碼
        </a>
        <p style="margin:12px 0 0 0; font-size:13px; color:#8d7a6b;">若按鈕無法開啟，請複製此連結：${reportUrl}</p>
    </div>`;
}

function getEmailStatusLabel(templateKey, data = {}) {
    const statusMap = {
        registrationSuccess: '報名成功 (Confirmed)',
        pendingPayment: '待繳費 (Pending)',
        waitlistPromoted: '遞補成功 (Confirmed)'
    };
    if (statusMap[templateKey]) return statusMap[templateKey];
    if (data.status === 'pending_payment') return '待繳費 (Pending)';
    if (data.status === 'waitlist') return '候補中 (Waitlist)';
    return '報名成功 (Confirmed)';
}

function buildEventInfoBlockHtml(data, eventData, templateKey) {
    const accentColor = '#d97706';
    const eventName = eventData?.name || data.eventName || '';
    const eventDate = data.eventDateRange || formatEventDateRange(eventData || data);
    const eventTime = eventData?.time || data.eventTime || '';
    const serial = (data.id || '').substring(0, 8).toUpperCase();
    return `
    <div style="background-color:#ffffff; padding:25px; border-radius:16px; border:1px solid #eee; margin:24px 0 30px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
        <h3 style="margin:0 0 15px 0; font-size:18px; color:#4a3728; border-bottom:2px solid ${accentColor}; display:inline-block; padding-bottom:5px;">📋 活動資訊</h3>
        <table style="width:100%; border-collapse:collapse; font-size:15px; margin-top:15px;">
            <tr><td style="padding:10px 0; color:#8d7a6b; width:100px;">目前狀態</td><td style="padding:10px 0; font-weight:bold; color:${accentColor};">${escapeHtml(getEmailStatusLabel(templateKey, data))}</td></tr>
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

function buildPaymentInfoBlockHtml(data, eventData) {
    const bankInfo = eventData?.bankInfo || '暫無匯款帳號資訊';
    const paymentNote = eventData?.paymentNote || '';
    return `
    <div style="border:1px dashed #d97706; border-radius:12px; padding:20px; background-color:#fefce8; margin:24px 0 25px;">
        <h4 style="margin:0 0 12px 0; font-size:15px; color:#d97706;">匯款帳號資訊</h4>
        <div style="font-size:14px; color:#6b5a4d; line-height:1.8; white-space:pre-wrap; font-family:monospace;">${escapeHtml(bankInfo)}</div>
        <p style="margin:12px 0 0 0; font-size:14px; color:#8a4b0f;"><strong>繳費期限：</strong>${escapeHtml(formatDateTimeTW(data.paymentDueAt))}</p>
        ${paymentNote ? `<p style="margin:12px 0 0 0; font-size:14px; color:#8a4b0f;"><strong>注意事項：</strong>${escapeHtml(paymentNote)}</p>` : ''}
    </div>`;
}

function buildEmailVars(data, eventData) {
    const baseUrl = 'https://a3614todoo-ship-it.github.io/event';
    return {
        '姓名': data.userName || '',
        '活動名稱': eventData?.name || data.eventName || '',
        '活動日期': data.eventDateRange || formatEventDateRange(eventData || data),
        '活動時間': eventData?.time || data.eventTime || '',
        '活動地點': eventData?.location || data.eventLocation || '',
        '報名序號': (data.id || '').substring(0, 8).toUpperCase(),
        '應繳金額': `NT$ ${((eventData?.fee || 0)).toLocaleString()}`,
        '繳費期限': formatDateTimeTW(data.paymentDueAt),
        '匯款資訊': eventData?.bankInfo || '',
        '付款注意事項': eventData?.paymentNote || '',
        '回報連結': '__PAYMENT_REPORT_BUTTON__',
        '回報網址': `${baseUrl}/payment.html?id=${data.id}`,
        '取消連結': `${baseUrl}/cancel.html?id=${data.id}&email=${data.userEmail || ''}`,
        'QRCode': '__QR_CODE_BLOCK__',
        'QR Code': '__QR_CODE_BLOCK__',
        '活動資訊區塊': '__EVENT_INFO_BLOCK__',
        '報到須知區塊': '__CHECKIN_NOTICE_BLOCK__',
        '匯款資訊區塊': '__PAYMENT_INFO_BLOCK__'
    };
}

function applyEmailTemplateText(text, vars) {
    return String(text || '').replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[String(key).trim()] ?? '');
}

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('isStandaloneEventAdmin') === 'true') {
        const adminBtn = document.getElementById('adminQuickLink');
        if (adminBtn) adminBtn.style.display = 'inline-block';
    }

    if (!eventId) {
        alert("找不到活動 ID");
        location.href = 'index.html';
        return;
    }
    loadEventData();
    trackView();
    setupForm();
});

// 追蹤活動瀏覽量
async function trackView() {
    if (!eventId) return;
    try {
        await db.collection("events").doc(eventId).update({
            views: firebase.firestore.FieldValue.increment(1)
        });
    } catch (err) {
        console.warn("無法更新瀏覽量:", err);
    }
}

async function loadEventData() {
    try {
        db.collection("events").doc(eventId).onSnapshot((doc) => {
            if (!doc.exists) {
                alert("活動不存在");
                location.href = 'index.html';
                return;
            }
            currentEvent = { id: doc.id, ...doc.data() };
            renderUI();
        });

        db.collection("event_registrations").where("eventId", "==", eventId).onSnapshot((snapshot) => {
            let list = [];
            snapshot.forEach(d => list.push(d.data()));
            registrationsCount = list.filter(r => r.status !== 'cancelled' && r.status !== 'payment_expired').length;
            
            const cap = currentEvent ? (parseInt(currentEvent.capacity) || 0) : 0;
            const allowWaitlist = currentEvent ? currentEvent.allowWaitlist !== false : true;
            const statusEl = document.getElementById('regStatus');
            const fullNotice = document.getElementById('fullNotice');
            const submitBtn = document.getElementById('submitBtn');
            const urgencyNotice = document.getElementById('urgencyNotice');
            const urgencyText = document.getElementById('urgencyText');
            
            if (statusEl) {
                statusEl.innerHTML = `<strong style="color:var(--accent); font-size:1.4rem;">${registrationsCount}</strong> / ${cap}`;
                
                const availableSpots = cap - registrationsCount;

                // [行銷] 飢餓行銷：即將額滿提示
                if (urgencyNotice && cap > 0) {
                    // 若剩餘名額 <= 5 或低於 20%，且尚未額滿時顯示
                    if (availableSpots > 0 && (availableSpots <= 5 || availableSpots <= cap * 0.2)) {
                        urgencyNotice.style.display = 'block';
                        urgencyText.textContent = `即將額滿！最後剩餘 ${availableSpots} 個名額`;
                    } else {
                        urgencyNotice.style.display = 'none';
                    }
                }

                // 額滿檢查
                if (registrationsCount >= cap && cap > 0) {
                    if (allowWaitlist) {
                        if (fullNotice) {
                            fullNotice.style.display = 'block';
                            fullNotice.textContent = '目前名額已滿，報名將自動進入候補名單。';
                            fullNotice.style.color = '#b45309'; 
                            fullNotice.style.fontWeight = '700';
                        }
                        submitBtn.textContent = '加入候補登記';
                        submitBtn.disabled = false;
                        submitBtn.style.background = 'linear-gradient(135deg, #64748b, #475569)';
                        submitBtn.style.cursor = 'pointer';
                        submitBtn.style.opacity = '1';
                    } else {
                        if (fullNotice) {
                            fullNotice.style.display = 'block';
                            fullNotice.textContent = '本活動報名名額已滿，暫不開放候補。';
                            fullNotice.style.color = '#dc2626'; 
                            fullNotice.style.fontWeight = '700';
                        }
                        submitBtn.textContent = '本活動已額滿';
                        submitBtn.disabled = true;
                        submitBtn.style.background = '#9ca3af';
                        submitBtn.style.cursor = 'not-allowed';
                        submitBtn.style.opacity = '0.7';
                    }
                } else {
                    if (fullNotice) fullNotice.style.display = 'none';
                    submitBtn.textContent = '確認報名';
                    submitBtn.disabled = false;
                    submitBtn.style.background = 'linear-gradient(135deg, #d97706, #f59e0b)';
                    submitBtn.style.cursor = 'pointer';
                    submitBtn.style.opacity = '1';
                }
            }
        });

    } catch (error) {
        console.error("載入失敗:", error);
    }
}

function renderUI() {
    document.title = `${currentEvent.name} | 藝境空間`;
    document.getElementById('eventName').textContent = currentEvent.name;
    document.getElementById('eventDate').textContent = formatEventDateRange(currentEvent);
    document.getElementById('eventTime').textContent = currentEvent.time;
    document.getElementById('eventLocation').textContent = currentEvent.location;
    
    const feeEl = document.getElementById('eventFee');
    if (feeEl) {
        if (currentEvent.fee > 0) {
            feeEl.textContent = `NT$ ${currentEvent.fee.toLocaleString()}`;
        } else {
            feeEl.textContent = '免費';
        }
    }

    document.getElementById('eventDescription').innerHTML = (currentEvent.description || '暫無說明').replace(/\n/g, '<br>');
    
    // 處理擴充詳細資訊
    const extDetailsBlock = document.getElementById('eventExtendedDetails');
    const extDetailsList = document.getElementById('extDetailsList');
    
    // 智慧文字排版處理函數：自動辨識標題與內文
    function formatCustomText(text) {
        if (!text) return '';
        const lines = text.split('\n');
        let html = '';
        
        // 智慧檢查：如果整個區塊都沒出現項目符號 (1. ● -)，則視為單一的「固定欄位值」
        const hasListItems = lines.some(line => line.trim().match(/^(\d+[、\.]|[●■◆★-]\s*)(.+)$/));
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                html += '<div style="height: 12px;"></div>'; // 空行產生額外間距
                return;
            }
            
            // 偵測項目符號或數字標題 (例如: 1、 2. ● - )
            const listItemMatch = trimmed.match(/^(\d+[、\.]|[●■◆★-]\s*)(.+)$/);
            
            if (listItemMatch) {
                // 標題行：永遠加粗、加大
                html += `<div style="font-weight: 700; color: var(--text-main); margin-top: 20px; margin-bottom: 6px; font-size: 1.05rem; border-left: 3px solid var(--accent); padding-left: 10px; line-height: 1.4;">${trimmed}</div>`;
            } else {
                // 一般內文判斷：
                // 1. 若該區塊有標題(hasListItems)，則內文使用一般字重 (400) 與柔和顏色
                // 2. 若該區塊無標題，則視為固定欄位資訊，使用深色粗體 (700)
                const isFieldVal = !hasListItems;
                const color = isFieldVal ? 'var(--text-main)' : 'var(--text-muted)';
                const weight = isFieldVal ? '700' : '400';
                
                html += `<div style="color: ${color}; font-weight: ${weight}; margin-bottom: 8px; line-height: 1.8; padding-left: 13px;">${trimmed}</div>`;
            }
        });
        
        return html;
    }

    if (currentEvent.extDetails && Array.isArray(currentEvent.extDetails) && currentEvent.extDetails.length > 0) {
        extDetailsList.innerHTML = currentEvent.extDetails.map(ext => 
            `<li style="margin-bottom: 25px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 20px;">
                <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-bookmark" style="color: var(--accent); font-size: 1.2rem;"></i>
                    <strong style="color: var(--accent); font-size: 1.15rem; letter-spacing: 1px;">${ext.name}</strong>
                </div>
                <div style="padding-left: 5px;">
                    ${formatCustomText(ext.value)}
                </div>
            </li>`
        ).join('');
        extDetailsBlock.style.display = 'block';
    } else {
        extDetailsBlock.style.display = 'none';
        if(extDetailsList) extDetailsList.innerHTML = '';
    }
    
    const imgEl = document.getElementById('eventImage');
    if (imgEl) {
        const imageUrl = currentEvent.image || 'assets/hero_events_bg.png';
        
        // 必須在設定 src 之前先綁定監聽器
        imgEl.onload = () => {
            imgEl.style.opacity = '1';
        };
        
        imgEl.onerror = () => {
            console.warn("圖片載入失敗，顯示預設圖");
            imgEl.src = 'assets/hero_events_bg.png';
            imgEl.style.opacity = '1';
        };

        imgEl.src = imageUrl;

        // 處理快取情況
        if (imgEl.complete) {
            imgEl.style.opacity = '1';
        }
    }
    // 渲染自訂表單欄位
    const dynamicFieldsContainer = document.getElementById('dynamicFieldsContainer');
    if (dynamicFieldsContainer) {
        if (currentEvent.customFields && Array.isArray(currentEvent.customFields) && currentEvent.customFields.length > 0) {
            dynamicFieldsContainer.innerHTML = currentEvent.customFields.map((f, index) => {
                const isRequired = f.required ? 'required' : '';
                const star = f.required ? '<span style="color: #ef4444; margin-left: 3px;">*</span>' : '';

                if (f.type === 'checkbox') {
                    return `
                    <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin: 15px 0;">
                        <input type="checkbox" id="customField_${index}" name="${f.name}" ${isRequired} style="width: 20px; height: 20px; cursor: pointer;">
                        <label for="customField_${index}" style="margin: 0; cursor: pointer; font-weight: 500;">${f.name}${star}</label>
                    </div>
                    `;
                }
                
                const inputType = (f.type === 'select') ? 'text' : (f.type || 'text');
                return `
                <div class="form-group">
                    <label for="customField_${index}">${f.name}${star}</label>
                    <input type="${inputType}" id="customField_${index}" name="${f.name}" placeholder="請輸入${f.name}" ${isRequired}>
                </div>
                `;
            }).join('');
        } else {
            dynamicFieldsContainer.innerHTML = '';
        }
    }
}

function setupForm() {
    const form = document.getElementById('regForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';

        const name = document.getElementById('userName').value.trim();
        const phone = document.getElementById('userPhone').value.trim();
        const email = document.getElementById('userEmail').value.trim();

        // [資安] 1. Honeypot 檢查 (防機器人)
        const hpField = document.getElementById('userMiddleName').value;
        if (hpField) {
            console.warn("Spam detected via honeypot.");
            location.href = 'index.html';
            return;
        }

        // [資安] 2. 頻率限制 (防短時間大量提交)
        const lastSubmit = localStorage.getItem(`last_submit_${eventId}`);
        const now = Date.now();
        if (lastSubmit && (now - lastSubmit < 30000)) { // 30秒冷卻
            alert("提交過於頻繁，請稍候 30 秒再試。");
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
        }

        // [資安] 3. 重複報名檢查 (Email)
        try {
            // 改用僅根據 eventId 查詢，避免需要手動建立複合索引 (Composite Index)
            const dupCheck = await db.collection("event_registrations")
                .where("eventId", "==", eventId)
                .get();
            
            // 在前端進行 Email 過濾，確保 100% 攔截
            const isAlreadyReg = dupCheck.docs.some(doc => {
                const data = doc.data();
                return data.userEmail === email && data.status !== 'cancelled' && data.status !== 'payment_expired';
            });

            if (isAlreadyReg) {
                alert("此電子郵件已報名過本活動（或已在候補名單中），請勿重複報名。");
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
        } catch (err) {
            console.warn("Duplicate check failed, proceeding anyway:", err);
        }

        const capacity = parseInt(currentEvent.capacity) || 0;
        const isWaitlist = (registrationsCount >= capacity);
        let finalStatus = isWaitlist ? 'waiting' : 'registered';
        const isPaidEvent = currentEvent.fee && parseInt(currentEvent.fee) > 0;
        
        if (!isWaitlist && isPaidEvent) {
            finalStatus = 'pending_payment';
        }

        const paymentDueAt = finalStatus === 'pending_payment' ? buildPaymentDueAt(currentEvent) : '';
        const regData = {
            eventId: eventId,
            eventName: currentEvent.name,
            eventDate: getEventStartDate(currentEvent),
            eventEndDate: getEventEndDate(currentEvent),
            eventDateRange: formatEventDateRange(currentEvent),
            eventTime: currentEvent.time,
            userName: name,
            userPhone: phone,
            userEmail: email,
            status: finalStatus,
            timestamp: new Date().toISOString(),
            utmSource: utmSource,
            utmMedium: utmMedium,
            utmCampaign: utmCampaign,
            paymentDueAt: paymentDueAt
        };

        // 收集自訂欄位資料
        if (currentEvent.customFields && Array.isArray(currentEvent.customFields)) {
            const customData = {};
            currentEvent.customFields.forEach((f, index) => {
                const el = document.getElementById(`customField_${index}`);
                if (el) {
                    if (f.type === 'checkbox') {
                        customData[f.name] = el.checked ? '是' : '否';
                    } else {
                        customData[f.name] = el.value.trim();
                    }
                }
            });
            regData.customResponses = customData;
        }

        try {
            const docRef = await db.collection("event_registrations").add(regData);
            
            // 紀錄提交時間 (用於防灌水冷卻)
            localStorage.setItem(`last_submit_${eventId}`, Date.now().toString());

            // 只有正式報名或待繳費才寄信，候補則不寄信
            if (!isWaitlist) {
                const fullData = { id: docRef.id, ...regData };
                sendRegistrationEmail(fullData, currentEvent);
                // 顯示成功彈窗 (帶入完整的報名資料以利產生 QR/行事曆)
                showSuccessModal(isWaitlist, fullData, currentEvent);
            } else {
                showSuccessModal(isWaitlist, regData, currentEvent);
            }
        } catch (err) {
            console.error(err);
            alert("報名失敗，請稍後再試。");
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// ---------------------------------------------------------
// 定案版：成功彈窗控制
// ---------------------------------------------------------
// ---------------------------------------------------------
// 定案版：成功彈窗控制
// ---------------------------------------------------------
function showSuccessModal(isWaitlist, data) {
    const modal = document.getElementById('successModal');
    const titleEl = document.getElementById('successModalTitle');
    const descEl = document.getElementById('successModalDesc');
    const qrContainer = document.getElementById('qrCodeContainer');
    const calButtons = document.getElementById('calendarButtons');
    const qrcodeDiv = document.getElementById('qrcode');
    
    if (isWaitlist) {
        titleEl.textContent = '候補登記成功！';
        descEl.innerHTML = '目前活動名額已滿，系統已成功記錄您的候補請求。<br><br>請注意：若有名額釋出，系統將會立即發送「遞補成功通知」至您的信箱，請留意。';
        if (qrContainer) qrContainer.style.display = 'none';
        if (calButtons) calButtons.style.display = 'none';
    } else if (data.status === 'pending_payment') {
        titleEl.textContent = '報名保留中 (待繳費)';
        const paymentCopyText = [
            `活動：${currentEvent.name}`,
            `應繳金額：NT$ ${(currentEvent.fee || 0).toLocaleString()}`,
            `繳費期限：${formatDateTimeTW(data.paymentDueAt)}`,
            `匯款資訊：${currentEvent.bankInfo || '請依通知信中的匯款資訊辦理'}`
        ].join('\n');
        descEl.innerHTML = `
            感謝您的報名！本活動費用為 <strong>NT$ ${currentEvent.fee.toLocaleString()}</strong>。<br>
            請於 <strong>${formatDateTimeTW(data.paymentDueAt)}</strong> 前完成繳費並回報，以保留您的名額。
            <div style="margin:18px 0; padding:16px; background:#fff7ed; border:1px dashed #d97706; border-radius:14px; text-align:left; line-height:1.7;">
                <p style="margin:0 0 8px 0; font-weight:700; color:#d97706;">匯款資訊</p>
                <div style="white-space:pre-wrap; word-break:break-word; color:#4a3728;">${currentEvent.bankInfo || '請依通知信中的匯款資訊辦理'}</div>
                ${currentEvent.paymentNote ? `<p style="margin:10px 0 0 0; color:#8a4b0f;"><strong>注意事項：</strong>${currentEvent.paymentNote}</p>` : ''}
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-bottom:10px;">
                <button onclick="copyTextToClipboard(${JSON.stringify(paymentCopyText).replace(/"/g, '&quot;')})" style="padding:10px 14px; border:1px solid #d97706; background:#fff; color:#d97706; border-radius:999px; font-weight:700; cursor:pointer;">複製匯款資訊</button>
                <button onclick="location.href='payment.html?id=${data.id}'" style="padding:10px 14px; border:0; background:#10b981; color:#fff; border-radius:999px; font-weight:700; cursor:pointer;">前往回報後五碼</button>
            </div>
            <span style="color:#d97706; font-size:0.9rem;">正式報到用 QR Code 將於確認收款後發送</span>`;
        if (qrContainer) qrContainer.style.display = 'none';
        if (calButtons) calButtons.style.display = 'none';
    } else {
        titleEl.textContent = '報名成功！';
        descEl.innerHTML = '感謝您的參與，詳細資訊與報名序號已登錄。<br>系統已發送確認信至您的信箱，請查收。';
        
        // 顯示 QR Code (正式名額)
        if (qrContainer && qrcodeDiv && typeof QRCode !== 'undefined') {
            qrcodeDiv.innerHTML = ''; // 清空舊的
            new QRCode(qrcodeDiv, {
                text: data.id,
                width: 160,
                height: 160,
                colorDark : "#4a3728",
                colorLight : "#fdfbf7",
                correctLevel : QRCode.CorrectLevel.H
            });
            qrContainer.style.display = 'block';
        }

        // 顯示行事曆按鈕
        if (calButtons) {
            calButtons.style.display = 'block';
            
            // 綁定 Google Calendar
            document.getElementById('btnGoogleCal').onclick = () => {
                const url = generateGoogleCalendarUrl(data);
                window.open(url, '_blank');
            };
            
            // 綁定 iCal
            document.getElementById('btnICal').onclick = () => {
                downloadICal(data);
            };
        }
    }
    modal.style.display = 'flex';
}

function generateGoogleCalendarUrl(data) {
    const startDate = data.eventDate || getEventStartDate(currentEvent);
    const endDate = data.eventEndDate || getEventEndDateForCalendar(currentEvent);
    const startTime = formatCalendarDate(startDate) + 'T' + data.eventTime.split('~')[0].replace(':', '') + '00';
    const endTime = formatCalendarDate(endDate) + 'T' + data.eventTime.split('~')[1].replace(':', '') + '00';
    const title = encodeURIComponent(`【活動】${data.eventName}`);
    const details = encodeURIComponent(`您的報名序號：${data.id.substring(0, 8).toUpperCase()}\n地點：${currentEvent.location}`);
    const location = encodeURIComponent(currentEvent.location);
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&details=${details}&location=${location}&sf=true&output=xml`;
}

function downloadICal(data) {
    const startDate = data.eventDate || getEventStartDate(currentEvent);
    const endDate = data.eventEndDate || getEventEndDateForCalendar(currentEvent);
    const startTime = formatCalendarDate(startDate) + 'T' + data.eventTime.split('~')[0].replace(':', '') + '00';
    const endTime = formatCalendarDate(endDate) + 'T' + data.eventTime.split('~')[1].replace(':', '') + '00';
    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        `DTSTART:${startTime}`,
        `DTEND:${endTime}`,
        `SUMMARY:【活動】${data.eventName}`,
        `DESCRIPTION:您的報名序號：${data.id.substring(0, 8).toUpperCase()}\\n地點：${currentEvent.location}`,
        `LOCATION:${currentEvent.location}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `event_${data.id.substring(0,8)}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function closeSuccessModal() {
    location.href = 'index.html';
}

// ---------------------------------------------------------
// 定案版：EmailJS 寄信邏輯與模板
// ---------------------------------------------------------
function sendRegistrationEmail(data, eventData) {
    if (typeof emailjs === 'undefined') return;

    const isWaitlist = (data.status === 'waitlist');
    const isPendingPayment = (data.status === 'pending_payment');
    const templateKey = isPendingPayment ? 'pendingPayment' : (isWaitlist ? 'waitlistPromoted' : 'registrationSuccess');
    if (!isEmailTemplateEnabled(eventData, templateKey)) return;
    let emailHtml = generateEventEmailHTML(data, eventData);

    let subjectLine = `【活動報名成功通知】${data.eventName}`;
    if (isWaitlist) subjectLine = `【候補登記成功通知】${data.eventName}`;
    if (isPendingPayment) subjectLine = `【繳費通知】請完成《${data.eventName}》活動報名繳費`;

    const customTemplate = getEmailTemplate(eventData, templateKey);
    if (customTemplate?.subject) {
        subjectLine = applyEmailTemplateText(customTemplate.subject, buildEmailVars(data, eventData));
    }
    if (customTemplate?.body) {
        emailHtml = injectRichEmailBlocks(plainTextToEmailHtml(applyEmailTemplateText(customTemplate.body, buildEmailVars(data, eventData))), data, eventData, templateKey);
    }

    const templateParams = {
        to_email: data.userEmail,
        to_name: data.userName,
        subject: subjectLine,
        message_html: emailHtml
    };

    emailjs.send('service_96agth6', 'template_uz1rccd', templateParams)
        .then(() => console.log("Email sent successfully"))
        .catch(err => console.error("Email failed:", err));
}

function generateEventEmailHTML(data, eventData) {
    const status = data.status; // 'registered' | 'waitlist' | 'cancelled' | 'pending_payment'
    const mainFont = 'system-ui, -apple-system, sans-serif';
    const primaryBg = '#fdfbf7';
    const accentColor = (status === 'cancelled') ? '#8d7a6b' : '#d97706';
    const textMain = '#4a3728';
    
    // 根據狀態決定標題與描述
    let titleText, subTitle, mainDesc, statusLabel, footerText;
    if (status === 'cancelled') {
        titleText = '報名取消確認';
        subTitle = 'Registration Cancellation';
        mainDesc = `您好，我們已收到您的取消申請，活動 <strong style="color: ${accentColor};">${data.eventName}</strong> 的報名已正式取消。感謝您主動告知，讓名額能及時釋出給其他參與者。`;
        statusLabel = '已取消參加';
        footerText = '期待未來能在其他活動見到您！';
    } else if (status === 'waitlist') {
        titleText = '進入候補名單';
        subTitle = 'Waitlist Confirmation';
        mainDesc = `感謝您的參與！由於目前報名人數較多，您已進入活動 <strong style="color: ${accentColor};">${data.eventName}</strong> 的<strong>候補名單</strong>。若有名額釋出，我們將優先為您安排。`;
        statusLabel = '候補中 (Waitlist)';
        footerText = '期待在藝境空間見到您！';
    } else if (status === 'pending_payment') {
        titleText = '待繳費通知';
        subTitle = 'Pending Payment';
        mainDesc = `感謝您的報名！本活動需繳交費用 <strong>NT$ ${(eventData?.fee || 0).toLocaleString()}</strong>，請於 <strong>${formatDateTimeTW(data.paymentDueAt)}</strong> 前完成匯款，並回報您的帳號後五碼以保留名額。`;
        statusLabel = '待繳費 (Pending)';
        footerText = '完成繳款後，系統將會發送正式報名成功信件。';
    } else {
        titleText = '報名成功確認';
        subTitle = 'Registration Confirmed';
        mainDesc = `恭喜您！您已成功報名活動 <strong style="color: ${accentColor};">${data.eventName}</strong>。我們非常期待您的參與，以下是您的報名資訊：`;
        statusLabel = '報名成功 (Confirmed)';
        footerText = '期待在藝境空間見到您！';
    }

    let customResponsesHtml = '';
    if (data.customResponses && Object.keys(data.customResponses).length > 0) {
        customResponsesHtml = Object.entries(data.customResponses).map(([key, val]) => 
            `<tr><td style="padding: 10px 0; color: #8d7a6b;">${key}</td><td style="padding: 10px 0; font-weight: bold;">${val}</td></tr>`
        ).join('');
    }

    return `
    <div style="background-color: #f5f1ea; padding: 40px 20px; font-family: ${mainFont};">
        <div style="max-width: 600px; margin: 0 auto; background-color: ${primaryBg}; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(74, 55, 40, 0.1); border: 1px solid #e5e0d8;">
            <!-- 標頭區 -->
            <div style="background: #ffffff; padding: 45px 20px; text-align: center; border-bottom: 1px solid #f1ece4;">
                <h1 style="margin: 0; font-size: 26px; color: ${textMain}; letter-spacing: 6px; font-weight: bold;">藝 境 空 間</h1>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: ${accentColor}; letter-spacing: 2px; text-transform: uppercase;">${subTitle}</p>
            </div>
            
            <div style="padding: 40px; line-height: 1.8; color: ${textMain};">
                <p style="margin-bottom: 20px; font-size: 16px;">親愛的 <strong>${data.userName}</strong> 您好，</p>
                <p style="margin-bottom: 30px;">${mainDesc}</p>
                
                <!-- 報名明細卡片 -->
                <div style="background-color: #ffffff; padding: 25px; border-radius: 16px; border: 1px solid #eee; margin-bottom: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: ${textMain}; border-bottom: 2px solid ${accentColor}; display: inline-block; padding-bottom: 5px;">
                        ${status === 'cancelled' ? '📋 活動資訊參考' : '📋 活動資訊'}
                    </h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 15px; margin-top: 15px;">
                        <tr><td style="padding: 10px 0; color: #8d7a6b; width: 100px;">目前狀態</td><td style="padding: 10px 0; font-weight: bold; color: ${accentColor};">${statusLabel}</td></tr>
                        <tr><td style="padding: 10px 0; color: #8d7a6b;">活動名稱</td><td style="padding: 10px 0; font-weight: bold;">${data.eventName}</td></tr>
                        <tr><td style="padding: 10px 0; color: #8d7a6b;">活動日期</td><td style="padding: 10px 0; font-weight: bold;">${data.eventDateRange || data.eventDate || ''}</td></tr>
                        <tr><td style="padding: 10px 0; color: #8d7a6b;">活動時間</td><td style="padding: 10px 0; font-weight: bold;">${data.eventTime || ''}</td></tr>
                        ${status === 'cancelled' ? '' : `<tr><td style="padding: 10px 0; color: #8d7a6b;">報名序號</td><td style="padding: 10px 0; font-family: monospace; font-size: 18px; color: ${textMain};">${data.id.substring(0, 8).toUpperCase()}</td></tr>`}
                        ${customResponsesHtml}
                    </table>
                </div>

                ${status === 'registered' ? `
                <!-- QR Code 區塊 (使用 QuickChart API) -->
                <div style="text-align: center; background: #ffffff; padding: 30px; border-radius: 16px; border: 1px dashed #d97706; margin-bottom: 30px;">
                    <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: bold; color: #d97706;">您的專屬報到 QR Code</p>
                    <img src="https://quickchart.io/chart?cht=qr&chs=180x180&chl=${data.id}&choe=UTF-8" width="180" height="180" alt="QR Code" style="display: block; margin: 0 auto;">
                    <p style="margin: 15px 0 0 0; font-size: 13px; color: #8d7a6b;">活動當天請出示此碼以完成快速報到</p>
                </div>

                <!-- 行事曆連結 -->
                <div style="text-align: center; margin-bottom: 30px;">
                    <a href="${generateGoogleCalendarUrl(data)}" 
                       style="display: inline-block; padding: 10px 20px; background: #ffffff; border: 1px solid #ddd; border-radius: 8px; color: #4285f4; text-decoration: none; font-size: 14px; font-weight: bold; margin-right: 10px;">
                       + 加入 Google 日曆
                    </a>
                </div>
                ` : ''}

                ${status !== 'cancelled' ? `
                <!-- 報到須知 (取消時不顯示) -->
                <div style="border: 1px solid #e5e0d8; border-radius: 12px; padding: 20px; background-color: #ffffff; margin-bottom: 25px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 15px; color: ${textMain};">📍 報到須知</h4>
                    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #6b5a4d; line-height: 1.8;">
                        <li style="margin-bottom: 5px;">活動當天請<strong>預先開啟並準備好此 QR Code</strong>，或憑「報名姓名」及「手機末三碼」報到即可。</li>
                        <li style="margin-bottom: 5px;">建議您提早於活動開始前 <strong>10 分鐘</strong> 抵達現場。</li>
                        <li>為了維護活動品質，活動開始 15 分鐘後將停止報到。</li>
                    </ul>
                </div>
                ` : ''}

                <!-- 溫馨提醒 (僅在正式報名成功時顯示) -->
                ${status === 'registered' ? `
                <div style="background-color: #fdfaf5; border: 1px solid rgba(217, 119, 6, 0.1); border-radius: 16px; padding: 25px; margin-bottom: 30px;">
                    <h4 style="margin: 0 0 10px 0; color: #d97706; font-size: 15px;">⚠️ 溫馨提醒</h4>
                    <p style="margin: 0; font-size: 14px; color: #8d7a6b; line-height: 1.6;">
                        為了讓更多喜愛藝文的朋友能參與活動，若您因故不克出席，請務必於活動開始 <strong>2 天前</strong> 聯繫我們。感謝您的配合與體諒！
                    </p>
                </div>
                ` : ''}

                <!-- 匯款資訊 (僅待繳費時顯示) -->
                ${status === 'pending_payment' ? `
                <div style="border: 1px dashed #d97706; border-radius: 12px; padding: 20px; background-color: #fefce8; margin-bottom: 25px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 15px; color: #d97706;"><i class="fas fa-money-bill-wave"></i> 匯款帳號資訊</h4>
                    <div style="font-size: 14px; color: #6b5a4d; line-height: 1.8; white-space: pre-wrap; font-family: monospace;">${eventData?.bankInfo || '暫無匯款帳號資訊'}</div>
                    <p style="margin: 12px 0 0 0; font-size: 14px; color: #8a4b0f;"><strong>繳費期限：</strong>${formatDateTimeTW(data.paymentDueAt)}</p>
                    ${eventData?.paymentNote ? `<p style="margin: 12px 0 0 0; font-size: 14px; color: #8a4b0f;"><strong>注意事項：</strong>${eventData.paymentNote}</p>` : ''}
                </div>
                <div style="text-align: center; margin-bottom: 30px;">
                    <a href="https://a3614todoo-ship-it.github.io/event/payment.html?id=${data.id}" 
                       style="display: inline-block; padding: 12px 25px; background: #d97706; color: white; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: bold;">
                       我要回報匯款後五碼
                    </a>
                </div>
                ` : ''}

                <!-- 取消報名連結 (僅限正式報名與候補顯示) -->
                ${status !== 'cancelled' ? `
                <div style="text-align: center; margin-bottom: 20px;">
                    <p style="font-size: 13px; color: #bcae9e; margin-bottom: 8px;">若您因故不克參加，請點擊下方連結取消：</p>
                    <a href="https://a3614todoo-ship-it.github.io/event/cancel.html?id=${data.id}&email=${data.userEmail}" 
                       style="color: #ef4444; text-decoration: underline; font-size: 13px;">
                       我要取消報名 (無法撤回)
                    </a>
                </div>
                ` : ''}

                <div style="text-align: center; border-top: 1px solid #f1ece4; padding-top: 30px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 14px; color: #8d7a6b; margin-bottom: 15px;">如果您對活動有任何疑問，歡迎隨時與我們聯繫。</p>
                    <h4 style="margin: 0; font-size: 18px; color: ${textMain};">${footerText}</h4>
                    <p style="margin: 10px 0 0 0; font-size: 13px; color: #bcae9e;">藝境空間 管理團隊 敬上</p>
                </div>
            </div>
        </div>
    </div>`;
}

// ==========================================
// 行銷分享邏輯
// ==========================================
window.shareToLine = function() {
    const cleanUrl = window.location.origin + window.location.pathname + "?id=" + eventId;
    const shareUrl = cleanUrl + "&utm_source=line_share";
    
    // 自動帶入活動名稱與邀請文字
    const eventName = currentEvent ? currentEvent.name : "精選活動";
    const text = `【藝境空間 | 活動推薦】\n${eventName}\n誠摯邀請您一起來參加！報名詳情請看👇\n${shareUrl}`;
    
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank');
};

window.shareToFB = function() {
    const cleanUrl = window.location.origin + window.location.pathname + "?id=" + eventId;
    const shareUrl = cleanUrl + "&utm_source=facebook_share";
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
};

window.nativeShareOrCopy = async function() {
    const cleanUrl = window.location.origin + window.location.pathname + "?id=" + eventId;
    const shareUrl = cleanUrl + "&utm_source=native_share";
    
    const eventName = currentEvent ? currentEvent.name : "精選活動";
    const shareTitle = "藝境空間 | 精彩活動報名";
    const shareText = `【${eventName}】活動報名中！立刻查看詳情👇\n`;

    // 判斷瀏覽器是否支援原生 Web Share API (手機瀏覽器通常支援，包含 IG/FB/Message 等選項)
    if (navigator.share) {
        try {
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl
            });
            console.log('原生分享成功');
        } catch (err) {
            console.log('使用者取消分享或發生錯誤:', err);
            fallbackToCopy(shareText + shareUrl);
        }
    } else {
        // 桌機或不支援的瀏覽器，退回傳統的複製連結
        fallbackToCopy(shareText + shareUrl);
    }
};

function fallbackToCopy(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("活動介紹與連結已複製！請手動貼到 IG 或其他社群平台與朋友分享。");
    }).catch(err => {
        console.error('複製失敗: ', err);
    });
}
