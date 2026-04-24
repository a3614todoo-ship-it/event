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
let eventId = new URLSearchParams(window.location.search).get('id');

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
    setupForm();
});

async function loadEventData() {
    try {
        // 監聽活動資料
        db.collection("events").doc(eventId).onSnapshot((doc) => {
            if (!doc.exists) {
                alert("活動不存在");
                location.href = 'index.html';
                return;
            }
            currentEvent = { id: doc.id, ...doc.data() };
            renderUI();
        });

        // 監聽報名人數
        db.collection("event_registrations").where("eventId", "==", eventId).onSnapshot((snapshot) => {
            let list = [];
            snapshot.forEach(d => list.push(d.data()));
            registrationsCount = list.filter(r => r.status !== 'cancelled').length;
            
            const cap = currentEvent ? (parseInt(currentEvent.capacity) || 0) : 0;
            const allowWaitlist = currentEvent ? currentEvent.allowWaitlist !== false : true;
            const statusEl = document.getElementById('regStatus');
            const fullNotice = document.getElementById('fullNotice');
            const submitBtn = document.getElementById('submitBtn');
            
            if (statusEl) {
                statusEl.innerHTML = `<strong style="color:var(--accent); font-size:1.4rem;">${registrationsCount}</strong> / ${cap}`;
                
                // 額滿檢查
                if (registrationsCount >= cap && cap > 0) {
                    if (allowWaitlist) {
                        // 開放候補
                        if (fullNotice) {
                            fullNotice.style.display = 'block';
                            fullNotice.textContent = '目前名額已滿，報名將自動進入候補名單。';
                            fullNotice.style.color = '#b45309'; // 稍微加深橘色
                            fullNotice.style.fontWeight = '700';
                        }
                        submitBtn.textContent = '加入候補登記';
                        submitBtn.disabled = false;
                        submitBtn.style.background = 'linear-gradient(135deg, #64748b, #475569)';
                        submitBtn.style.cursor = 'pointer';
                        submitBtn.style.opacity = '1';
                    } else {
                        // 不開放候補
                        if (fullNotice) {
                            fullNotice.style.display = 'block';
                            fullNotice.textContent = '本活動報名名額已滿，暫不開放候補。';
                            fullNotice.style.color = '#dc2626'; // 加深紅色
                            fullNotice.style.fontWeight = '700';
                        }
                        submitBtn.textContent = '本活動已額滿';
                        submitBtn.disabled = true;
                        submitBtn.style.background = '#9ca3af';
                        submitBtn.style.cursor = 'not-allowed';
                        submitBtn.style.opacity = '0.7';
                    }
                } else {
                    // 未額滿
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
    document.getElementById('eventDate').textContent = currentEvent.date;
    document.getElementById('eventTime').textContent = currentEvent.time;
    document.getElementById('eventLocation').textContent = currentEvent.location;
    document.getElementById('eventDescription').innerHTML = (currentEvent.description || '暫無說明').replace(/\n/g, '<br>');
    
    // 處理擴充詳細資訊
    const extDetailsBlock = document.getElementById('eventExtendedDetails');
    const extDetailsList = document.getElementById('extDetailsList');
    
    // 智慧文字排版處理函數：自動辨識標題與內文
    function formatCustomText(text) {
        if (!text) return '';
        const lines = text.split('\n');
        let html = '';
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                html += '<div style="height: 12px;"></div>'; // 空行產生額外間距
                return;
            }
            
            // 偵測項目符號或數字標題 (例如: 1、 2. ● - )
            const listItemMatch = trimmed.match(/^(\d+[、\.]|[●■◆★-]\s*)(.+)$/);
            
            if (listItemMatch) {
                // 標題行：加粗、加大、加上左側飾條與上方間距
                html += `<div style="font-weight: 700; color: var(--text-main); margin-top: 20px; margin-bottom: 6px; font-size: 1.05rem; border-left: 3px solid var(--accent); padding-left: 10px; line-height: 1.4;">${trimmed}</div>`;
            } else {
                // 一般內文：使用深色粗體，提升重要資訊的呈現效果
                html += `<div style="color: var(--text-main); font-weight: 700; margin-bottom: 8px; line-height: 1.8; padding-left: 13px;">${trimmed}</div>`;
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
    if (currentEvent.image) {
        imgEl.src = currentEvent.image;
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

        const capacity = parseInt(currentEvent.capacity) || 0;
        const isWaitlist = (registrationsCount >= capacity);

        const regData = {
            eventId: eventId,
            eventName: currentEvent.name,
            eventDate: currentEvent.date,
            eventTime: currentEvent.time,
            userName: name,
            userPhone: phone,
            userEmail: email,
            status: isWaitlist ? 'waiting' : 'registered',
            timestamp: new Date().toISOString()
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
            
            // 只有正式報名成功才寄信，候補則不寄信 (做法 B)
            if (!isWaitlist) {
                sendRegistrationEmail({ id: docRef.id, ...regData });
            }

            // 顯示成功彈窗
            showSuccessModal(isWaitlist);
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
function showSuccessModal(isWaitlist) {
    const modal = document.getElementById('successModal');
    const titleEl = document.getElementById('successModalTitle');
    const descEl = document.getElementById('successModalDesc');
    
    if (isWaitlist) {
        titleEl.textContent = '候補登記成功！';
        descEl.innerHTML = '目前活動名額已滿，系統已成功記錄您的候補請求。<br><br><strong style="color:var(--accent);">請注意：</strong> 此階段暫不發送 Email，<br>若有名額釋出，系統將會立即發送「遞補成功通知」至您的信箱。';
    } else {
        titleEl.textContent = '報名成功！';
        descEl.innerHTML = '感謝您的參與，詳細資訊與報名序號已登錄。<br>系統已發送確認信至您的信箱，請查收。';
    }
    modal.style.display = 'flex';
}

function closeSuccessModal() {
    location.href = 'index.html';
}

// ---------------------------------------------------------
// 定案版：EmailJS 寄信邏輯與模板
// ---------------------------------------------------------
function sendRegistrationEmail(data) {
    if (typeof emailjs === 'undefined') return;

    const isWaitlist = (data.status === 'waitlist');
    const emailHtml = generateEventEmailHTML(data);

    const templateParams = {
        to_email: data.userEmail,
        to_name: data.userName,
        subject: isWaitlist ? `【候補登記成功通知】${data.eventName}` : `【活動報名成功通知】${data.eventName}`,
        message_html: emailHtml
    };

    emailjs.send('service_96agth6', 'template_uz1rccd', templateParams)
        .then(() => console.log("Email sent successfully"))
        .catch(err => console.error("Email failed:", err));
}

function generateEventEmailHTML(data) {
    const status = data.status; // 'registered' | 'waitlist' | 'cancelled'
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
                        <tr><td style="padding: 10px 0; color: #8d7a6b;">活動日期</td><td style="padding: 10px 0; font-weight: bold;">${data.eventDate || ''}</td></tr>
                        <tr><td style="padding: 10px 0; color: #8d7a6b;">活動時間</td><td style="padding: 10px 0; font-weight: bold;">${data.eventTime || ''}</td></tr>
                        ${status === 'cancelled' ? '' : `<tr><td style="padding: 10px 0; color: #8d7a6b;">報名序號</td><td style="padding: 10px 0; font-family: monospace; font-size: 18px; color: ${textMain};">${data.id.substring(0, 8).toUpperCase()}</td></tr>`}
                        ${customResponsesHtml}
                    </table>
                </div>

                ${status !== 'cancelled' ? `
                <!-- 報到須知 (取消時不顯示) -->
                <div style="border: 1px solid #e5e0d8; border-radius: 12px; padding: 20px; background-color: #ffffff; margin-bottom: 25px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 15px; color: ${textMain};">📍 報到須知</h4>
                    <p style="margin: 0; font-size: 14px; color: #6b5a4d;">
                        活動當天請憑「<strong>報名姓名</strong>」或「<strong>聯絡電話末三碼</strong>」向現場櫃檯人員報到即可。建議您提早於活動開始前 <strong>10 分鐘</strong> 抵達現場。
                    </p>
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

                <div style="text-align: center; border-top: 1px solid #f1ece4; padding-top: 30px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 14px; color: #8d7a6b; margin-bottom: 15px;">如果您對活動有任何疑問，歡迎隨時與我們聯繫。</p>
                    <h4 style="margin: 0; font-size: 18px; color: ${textMain};">${footerText}</h4>
                    <p style="margin: 10px 0 0 0; font-size: 13px; color: #bcae9e;">藝境空間 管理團隊 敬上</p>
                </div>
            </div>
        </div>
    </div>`;
}
