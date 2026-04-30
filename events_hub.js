/**
 * 藝境空間 | 活動門戶核心邏輯
 * 串接 Firebase 動態載入活動列表
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

let allEvents = [];
let allRegistrations = [];

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('isStandaloneEventAdmin') === 'true') {
        const adminBtn = document.getElementById('adminQuickLink');
        if (adminBtn) adminBtn.style.display = 'inline-block';
    }

    fetchData();
    initSearch();
    initViewToggle();
});

let calendar = null;

// 初始化視圖切換
function initViewToggle() {
    const listBtn = document.getElementById('listViewBtn');
    const calBtn = document.getElementById('calendarViewBtn');
    const grid = document.getElementById('eventGrid');
    const calView = document.getElementById('calendarView');
    const searchSection = document.querySelector('.search-container');

    if (!listBtn || !calBtn) return;

    listBtn.addEventListener('click', () => {
        listBtn.classList.add('active');
        listBtn.style.background = 'var(--text-main)';
        listBtn.style.color = 'white';
        calBtn.classList.remove('active');
        calBtn.style.background = 'transparent';
        calBtn.style.color = 'var(--text-muted)';
        
        grid.style.display = 'grid';
        calView.style.display = 'none';
        if (searchSection) searchSection.style.display = 'block';
    });

    calBtn.addEventListener('click', () => {
        calBtn.classList.add('active');
        calBtn.style.background = 'var(--text-main)';
        calBtn.style.color = 'white';
        listBtn.classList.remove('active');
        listBtn.style.background = 'transparent';
        listBtn.style.color = 'var(--text-muted)';
        
        grid.style.display = 'none';
        calView.style.display = 'block';
        if (searchSection) searchSection.style.display = 'none'; // 月曆視圖下暫時隱藏搜尋以保簡潔
        
        initCalendar();
    });
}

// 初始化月曆
function initCalendar() {
    const calEl = document.getElementById('calendarView');
    if (!calEl || typeof FullCalendar === 'undefined') return;

    // 將活動轉換為 FullCalendar 格式
    const events = allEvents.filter(e => e.isActive !== false).map(e => ({
        id: e.id,
        title: e.name,
        start: e.date,
        backgroundColor: 'var(--accent)',
        borderColor: 'var(--accent)',
        extendedProps: {
            time: e.time,
            location: e.location
        }
    }));

    if (calendar) {
        calendar.destroy();
    }

    calendar = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridMonth',
        locale: 'zh-tw',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        buttonText: {
            today: '今天'
        },
        events: events,
        eventClick: function(info) {
            location.href = `details.html?id=${info.event.id}`;
        },
        eventDidMount: function(info) {
            // 自訂事件顯示內容
            const dot = info.el.querySelector('.fc-daygrid-event-dot');
            if (dot) dot.style.borderColor = 'var(--accent)';
            
            // 加上滑鼠懸停提示
            info.el.title = `${info.event.title}\n時間：${info.event.extendedProps.time}\n地點：${info.event.extendedProps.location}`;
        },
        height: 'auto',
        aspectRatio: 1.35
    });

    calendar.render();
}

// 獲取活動與報名數據
async function fetchData() {
    try {
        // 監聽活動資料
        db.collection("events").orderBy("date", "asc").onSnapshot((snapshot) => {
            allEvents = [];
            snapshot.forEach((doc) => {
                allEvents.push({ id: doc.id, ...doc.data() });
            });
            renderEvents(allEvents);
        });

        // 監聽報名資料 (用於顯示剩餘名額)
        db.collection("event_registrations").onSnapshot((snapshot) => {
            allRegistrations = [];
            snapshot.forEach((doc) => {
                allRegistrations.push(doc.data());
            });
            renderEvents(allEvents); // 重新渲染以更新人數
        });
    } catch (error) {
        console.error("資料載入出錯:", error);
        document.getElementById('eventGrid').innerHTML = '<p class="error-msg">暫時無法連線至資料庫，請稍後再試。</p>';
    }
}

// 渲染活動卡片
function renderEvents(eventsToRender) {
    const grid = document.getElementById('eventGrid');
    if (!grid) return;

    const activeEvents = eventsToRender.filter(e => e.isActive !== false);

    // 處理熱門活動 (僅在非搜尋狀態下顯示)
    const isSearching = document.getElementById('eventSearch')?.value.trim().length > 0;
    if (!isSearching) {
        renderPopularEvents(activeEvents);
    } else {
        const popSection = document.getElementById('popularEventsSection');
        if (popSection) popSection.style.display = 'none';
    }

    if (activeEvents.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>目前暫無公開活動，敬請期待！</p></div>';
        return;
    }

    grid.innerHTML = activeEvents.map(e => generateEventCardHTML(e)).join('');
}

// 渲染熱門活動特選
function renderPopularEvents(activeEvents) {
    const popSection = document.getElementById('popularEventsSection');
    const popGrid = document.getElementById('popularEventsGrid');
    if (!popSection || !popGrid) return;

    // 計算熱度：以報名人數排序，取前 3 名
    const eventStats = activeEvents.map(e => {
        const regCount = allRegistrations.filter(r => r.eventId === e.id && r.status !== 'cancelled').length;
        return { ...e, regCount };
    });

    // 只選取報名人數 > 0 且排名前三的活動
    const popularOnes = eventStats
        .filter(e => e.regCount > 0)
        .sort((a, b) => b.regCount - a.regCount)
        .slice(0, 3);

    if (popularOnes.length > 0) {
        popSection.style.display = 'block';
        popGrid.innerHTML = popularOnes.map(e => generateEventCardHTML(e, true)).join('');
    } else {
        popSection.style.display = 'none';
    }
}

// 生成活動卡片 HTML
function generateEventCardHTML(e, isPopular = false) {
    const regCount = allRegistrations.filter(r => r.eventId === e.id && r.status !== 'cancelled').length;
    const capacity = parseInt(e.capacity) || 0;
    const isFull = regCount >= capacity && capacity > 0;
    const popularBadge = isPopular ? '<div class="popular-tag"><i class="fas fa-fire"></i> 熱門</div>' : '';

    return `
    <div class="event-card ${isPopular ? 'popular-card' : ''}" onclick="location.href='details.html?id=${e.id}'">
        <div class="event-img-wrapper">
            <img src="${e.image || 'assets/hero_events_bg.png'}" class="event-img" alt="${e.name}">
            ${popularBadge}
            ${isFull ? (e.allowWaitlist !== false 
                ? '<div class="event-badge" style="background: #d97706; color: #fff; border: none;">候補登記中</div>' 
                : '<div class="event-badge">已額滿</div>') 
            : ''}
        </div>
        <div class="event-info">
            <h3 style="${isPopular ? 'font-size: 1.5rem;' : ''}">${e.name}</h3>
            <ul class="event-meta">
                <li style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px;"><i class="far fa-calendar-alt"></i> ${e.date}</li>
                <li style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px;"><i class="far fa-clock"></i> ${e.time}</li>
                <li style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-map-marker-alt"></i> ${e.location}</li>
                <li style="margin-top:15px; color:var(--accent); font-weight:bold; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-users"></i> 已報名 ${regCount} / ${capacity} 人
                </li>
            </ul>
        </div>
    </div>
    `;
}

// 搜尋功能
function initSearch() {
    const searchInput = document.getElementById('eventSearch');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        const filtered = allEvents.filter(ev => 
            ev.name.toLowerCase().includes(keyword) || 
            (ev.description && ev.description.toLowerCase().includes(keyword)) ||
            ev.location.toLowerCase().includes(keyword)
        );
        renderEvents(filtered);
    });
}
