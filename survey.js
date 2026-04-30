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
            document.getElementById('errorMsg').textContent = '找不到對應的報名紀錄，請確認連結是否正確。';
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
        
        renderSurveyForm(registrationData.surveyFields);
        showState('form');

    } catch (err) {
        console.error("問卷初始化錯誤:", err);
        let errorDetail = "載入出錯，請稍後再試。";
        
        if (err.code === 'permission-denied') {
            errorDetail = "資料庫權限不足，請管理員檢查 Firebase Rules 設定。";
        } else {
            errorDetail = "系統錯誤: " + err.message;
        }
        
        document.getElementById('errorMsg').textContent = errorDetail;
        showState('error');
    }
}

function renderSurveyForm(fields) {
    const form = document.getElementById('surveyForm');
    
    // 如果沒有自訂欄位，使用預設模板
    if (!fields || fields.length === 0) {
        const defaultHtml = `
            <div class="form-group" style="text-align: center;">
                <label>您對本次活動的整體滿意度？</label>
                <div class="star-rating">
                    <input type="radio" id="star5" name="rating" value="5" required><label for="star5" title="5 stars"><i class="fas fa-star"></i></label>
                    <input type="radio" id="star4" name="rating" value="4"><label for="star4" title="4 stars"><i class="fas fa-star"></i></label>
                    <input type="radio" id="star3" name="rating" value="3"><label for="star3" title="3 stars"><i class="fas fa-star"></i></label>
                    <input type="radio" id="star2" name="rating" value="2"><label for="star2" title="2 stars"><i class="fas fa-star"></i></label>
                    <input type="radio" id="star1" name="rating" value="1"><label for="star1" title="1 star"><i class="fas fa-star"></i></label>
                </div>
            </div>
            <div class="form-group">
                <label>您最喜歡活動的哪個部分？</label>
                <textarea name="favoritePart" placeholder="例如：講師的講解、實作環節..."></textarea>
            </div>
            <div class="form-group">
                <label>其他建議或想對我們說的話？</label>
                <textarea name="suggestions" placeholder="您的寶貴意見是我們進步的動力"></textarea>
            </div>
        `;
        form.insertAdjacentHTML('afterbegin', defaultHtml);
        return;
    }

    // 動態生成自訂欄位
    const dynamicHtml = fields.map((f, index) => {
        const requiredAttr = f.required ? 'required' : '';
        const requiredMark = f.required ? ' *' : '';
        
        if (f.type === 'rating') {
            return `
                <div class="form-group" style="text-align: center;">
                    <label>${f.name}${requiredMark}</label>
                    <div class="star-rating">
                        <input type="radio" id="q${index}_5" name="q_${index}" value="5" ${requiredAttr}><label for="q${index}_5"><i class="fas fa-star"></i></label>
                        <input type="radio" id="q${index}_4" name="q_${index}" value="4"><label for="q${index}_4"><i class="fas fa-star"></i></label>
                        <input type="radio" id="q${index}_3" name="q_${index}" value="3"><label for="q${index}_3"><i class="fas fa-star"></i></label>
                        <input type="radio" id="q${index}_2" name="q_${index}" value="2"><label for="q${index}_2"><i class="fas fa-star"></i></label>
                        <input type="radio" id="q${index}_1" name="q_${index}" value="1"><label for="q${index}_1"><i class="fas fa-star"></i></label>
                    </div>
                </div>
            `;
        } else if (f.type === 'textarea') {
            return `
                <div class="form-group">
                    <label>${f.name}${requiredMark}</label>
                    <textarea name="q_${index}" ${requiredAttr} placeholder="請輸入您的看法..."></textarea>
                </div>
            `;
        } else if (f.type === 'text') {
            return `
                <div class="form-group">
                    <label>${f.name}${requiredMark}</label>
                    <input type="text" name="q_${index}" ${requiredAttr} style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border);" placeholder="請輸入...">
                </div>
            `;
        } else if (f.type === 'yesno') {
            return `
                <div class="form-group">
                    <label>${f.name}${requiredMark}</label>
                    <div style="display: flex; gap: 20px; margin-top: 10px; justify-content: center;">
                        <label style="font-weight: normal; cursor: pointer;"><input type="radio" name="q_${index}" value="願意" ${requiredAttr}> 願意</label>
                        <label style="font-weight: normal; cursor: pointer;"><input type="radio" name="q_${index}" value="再考慮" ${requiredAttr}> 再考慮</label>
                    </div>
                </div>
            `;
        }
        return '';
    }).join('');
    
    form.insertAdjacentHTML('afterbegin', dynamicHtml);
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

    const formData = new FormData(surveyForm);
    const answers = {};
    
    // 收集所有答案
    const fields = registrationData.surveyFields;
    if (!fields || fields.length === 0) {
        // 預設欄位處理
        answers['整體滿意度'] = formData.get('rating') + ' 顆星';
        answers['最喜歡的部分'] = formData.get('favoritePart');
        answers['其他建議'] = formData.get('suggestions');
    } else {
        fields.forEach((f, index) => {
            let val = formData.get(`q_${index}`);
            if (f.type === 'rating' && val) val += ' 顆星';
            answers[f.name] = val;
        });
    }

    try {
        await db.collection('event_surveys').add({
            registrationId: regId,
            eventId: registrationData.eventId,
            eventName: registrationData.eventName,
            userName: registrationData.userName,
            userEmail: registrationData.userEmail,
            answers: answers,
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
