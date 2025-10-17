// متغيرات عامة محسّنة للأداء
let currentEMDData = []; // بيانات EMD الحالية للفلترة
let currentTicketData = []; // بيانات التذاكر الحالية
let currentViewType = null; // 'tickets' | 'emds'

// متغيرات التخزين المؤقت لتحسين الأداء
let cachedElements = new Map(); // تخزين العناصر المستخدمة بشكل متكرر
let lastSearchResults = new Map(); // تخزين نتائج البحث المؤقتة
let performanceMetrics = {
  lastSearchTime: 0,
  averageSearchTime: 0,
  searchCount: 0
};

// إضافة أزرار التحكم في النافذة المنفصلة
function addWindowControls() {
  try {
    // إنشاء شريط التحكم في النافذة
    const header = document.querySelector('.header') || document.querySelector('header') || document.body.firstElementChild;

    if (document.getElementById('windowControls')) return; // لا تضف الأزرار مرتين

    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'windowControls';
    controlsDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 10000;
      display: flex;
      gap: 8px;
      background: rgba(255, 255, 255, 0.9);
      padding: 8px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      backdrop-filter: blur(10px);
    `;

    // زر إغلاق النافذة
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '❌';
    closeBtn.title = 'إغلاق النافذة';
    closeBtn.style.cssText = `
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      width: 32px;
      height: 32px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    `;

    // زر تصغير النافذة
    const minimizeBtn = document.createElement('button');
    minimizeBtn.innerHTML = '➖';
    minimizeBtn.title = 'تصغير النافذة';
    minimizeBtn.style.cssText = `
      background: #ff9800;
      color: white;
      border: none;
      border-radius: 4px;
      width: 32px;
      height: 32px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    `;

    // زر تكبير النافذة
    const maximizeBtn = document.createElement('button');
    maximizeBtn.innerHTML = '⛶';
    maximizeBtn.title = 'تكبير النافذة';
    maximizeBtn.style.cssText = `
      background: #4caf50;
      color: white;
      border: none;
      border-radius: 4px;
      width: 32px;
      height: 32px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    `;

    // إضافة hover effects
    [closeBtn, minimizeBtn, maximizeBtn].forEach(btn => {
      btn.addEventListener('mouseenter', function() {
        this.style.opacity = '0.8';
      });
      btn.addEventListener('mouseleave', function() {
        this.style.opacity = '1';
      });
    });

    // وظائف الأزرار
    closeBtn.addEventListener('click', async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'closeCurrentWindow' });
        if (response && response.success) {
          window.close();
        }
      } catch (error) {
        console.log('🔒 إغلاق النافذة مباشرة');
        window.close();
      }
    });

    minimizeBtn.addEventListener('click', async () => {
      try {
        const currentWindow = await chrome.runtime.sendMessage({ action: 'getCurrentWindow' });
        if (currentWindow && currentWindow.windowId) {
          await chrome.windows.update(currentWindow.windowId, { state: 'minimized' });
        }
      } catch (error) {
        console.log('⚠️ لا يمكن تصغير النافذة');
      }
    });

    maximizeBtn.addEventListener('click', async () => {
      try {
        const currentWindow = await chrome.runtime.sendMessage({ action: 'getCurrentWindow' });
        if (currentWindow && currentWindow.windowId) {
          const isMaximized = await chrome.windows.get(currentWindow.windowId);
          const newState = isMaximized.state === 'maximized' ? 'normal' : 'maximized';
          await chrome.windows.update(currentWindow.windowId, { state: newState });
        }
      } catch (error) {
        console.log('⚠️ لا يمكن تكبير النافذة');
      }
    });

    // إضافة الأزرار للشريط
    controlsDiv.appendChild(minimizeBtn);
    controlsDiv.appendChild(maximizeBtn);
    controlsDiv.appendChild(closeBtn);

    // إضافة الشريط للصفحة
    if (header) {
      header.insertBefore(controlsDiv, header.firstChild);
    } else {
      document.body.insertBefore(controlsDiv, document.body.firstChild);
    }

    console.log('✅ تم إضافة أزرار التحكم في النافذة');
  } catch (error) {
    console.error('❌ خطأ في إضافة أزرار التحكم:', error);
  }
}

// تهيئة الإضافة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 تم تحميل Amadeus Ticket Extractor في النافذة المنفصلة');
  setupEventListeners();
  injectDocSearchUI();
  addWindowControls();
});

// إعداد مستمعي الأحداث
function setupEventListeners() {
  console.log('🔧 إعداد مستمعي الأحداث...');

  const getTicketsBtn = document.getElementById('getTicketsBtn');
  const getEMDsBtn = document.getElementById('getEMDsBtn');
  const phoneInput = document.getElementById('phoneInput');
  const rawResultTab = document.getElementById('rawResultTab');
  const analyzedResultTab = document.getElementById('analyzedResultTab');
  const descriptionFilter = document.getElementById('descriptionFilter');
  const applyFilterBtn = document.getElementById('applyFilter');
  const saveResultsBtn = document.getElementById('saveResultsBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const resultsContainerEl = document.getElementById('resultsContainer');

  // ربط أزرار البحث
  if (getTicketsBtn) {
    getTicketsBtn.addEventListener('click', searchTicketsByPhone);
    console.log('✅ تم ربط زر جلب التذاكر');
  }

  if (getEMDsBtn) {
    getEMDsBtn.addEventListener('click', searchEMDsByPhone);
    console.log('✅ تم ربط زر جلب القسائم');
  }

  // ربط مربع إدخال رقم الجوال (Enter للبحث)
  if (phoneInput) {
    phoneInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        searchTicketsByPhone();
      }
    });
    console.log('✅ تم ربط مربع إدخال رقم الجوال');
  }

  // ربط تبويبات النتائج
  if (rawResultTab) {
    rawResultTab.addEventListener('click', () => switchResultTab('raw'));
    console.log('✅ تم ربط تبويب النص الخام');
  }

  if (analyzedResultTab) {
    analyzedResultTab.addEventListener('click', () => switchResultTab('analyzed'));
    console.log('✅ تم ربط تبويب النتائج المحللة');
  }

  // ربط عناصر الفلترة
  if (applyFilterBtn) {
    applyFilterBtn.addEventListener('click', applyEMDFilter);
    console.log('✅ تم ربط زر تطبيق الفلتر');
  }

  if (descriptionFilter) {
    descriptionFilter.addEventListener('change', applyEMDFilter);
    console.log('✅ تم ربط قائمة فلترة الوصف');
  }

  if (saveResultsBtn) {
    // إزالة زر الحفظ نهائياً بناءً على المتطلبات
    saveResultsBtn.remove();
  }
  if (clearAllBtn) {
    clearAllBtn.textContent = '🧹 مسح الجدول';
    clearAllBtn.addEventListener('click', onClearAllClick);
    console.log('✅ تم ربط زر مسح الجدول');
  }
  if (resultsContainerEl) {
    resultsContainerEl.addEventListener('click', onResultsContainerClick);
    console.log('✅ تم تفعيل الحذف لكل صف');
  }

  console.log('✅ تم إعداد جميع مستمعي الأحداث بنجاح');
}

// حقن واجهة البحث برقم تذكرة/قسيمة وإعداد الأحداث
function injectDocSearchUI() {
  try {
    const searchSection = document.querySelector('.search-section');
    if (!searchSection) return;

    // لا تضف الواجهة مرتين
    if (document.getElementById('docInput')) return;

    const group = document.createElement('div');
    group.className = 'input-group';
    group.innerHTML = `
      <label for="docInput">رقم التذكرة/القسيمة:</label>
      <div class="input-actions-row">
        <input type="text" id="docInput" class="phone-input" maxlength="16" placeholder="مثل: 0651234567890 أو 065-1234567890">
        <button id="fetchByDocBtn" class="btn btn-primary">جلب بالرقم</button>
      </div>
    `;

    const statusEl = searchSection.querySelector('#statusMessage');
    if (statusEl) {
      searchSection.insertBefore(group, statusEl);
    } else {
      searchSection.appendChild(group);
    }

    const docInput = document.getElementById('docInput');
    const fetchByDocBtn = document.getElementById('fetchByDocBtn');
    if (docInput) {
      docInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') fetchByDocumentNumber();
      });
    }
    if (fetchByDocBtn) {
      fetchByDocBtn.addEventListener('click', fetchByDocumentNumber);
    }

    console.log('✅ تم حقن واجهة جلب برقم الوثيقة');
  } catch (e) {
    console.error('❌ فشل حقن واجهة جلب بالرقم:', e);
  }
}

function normalize065Number(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length >= 13) {
    const m = digits.match(/065(\d{10})/);
    if (m) return `065-${m[1]}`;
  }
  if (digits.length === 10) {
    return `065-${digits}`;
  }
  return null;
}

function upsertByKey(arr, keyField, item) {
  if (!Array.isArray(arr)) return [item];
  const idx = arr.findIndex(x => String(x?.[keyField]) === String(item?.[keyField]));
  if (idx >= 0) arr[idx] = item; else arr.push(item);
  return arr;
}

async function fetchByDocumentNumber() {
  const statusMessage = document.getElementById('statusMessage');
  const docInput = document.getElementById('docInput');
  if (!docInput || !statusMessage) return;

  const rawValue = docInput.value;
  const norm = normalize065Number(rawValue);
  if (!norm) {
    statusMessage.className = 'status-message warning';
    statusMessage.textContent = '⚠️ يرجى إدخال رقم صحيح بصيغة 065XXXXXXXXXX أو 065-XXXXXXXXXX';
    return;
  }

  try {
    statusMessage.className = 'status-message info';
    statusMessage.textContent = `🔎 البحث عن وثيقة ${norm}...`;

    const tabs = await chrome.tabs.query({});
    let targetTab = null;
    for (const tab of tabs) {
      if (tab.url && (tab.url.includes('amadeus') || tab.url.includes('localhost') || tab.url.includes('file://'))) {
        targetTab = tab; break;
      }
    }
    if (!targetTab) {
      statusMessage.className = 'status-message warning';
      statusMessage.textContent = '⚠️ لم يتم العثور على صفحة Amadeus';
      return;
    }

    const scriptReady = await ensureContentScript(targetTab.id);
    if (!scriptReady) {
      statusMessage.className = 'status-message error';
      statusMessage.textContent = '❌ فشل الاتصال بصفحة Amadeus';
      return;
    }

    // 1) حاول كتذكرة بصيغة twd/tkt065-xxxxxxxxxx
    const ticketCmd = `twd/tkt${norm}`;
    await chrome.tabs.sendMessage(targetTab.id, { action: 'sendCommand', command: ticketCmd });
    await new Promise(r => setTimeout(r, 1500)); // تقليل الانتظار إلى 1.5 ثانية
    let rawResponse = await chrome.tabs.sendMessage(targetTab.id, { action: 'getRawText' });
    const rawText1 = rawResponse && rawResponse.success ? (rawResponse.data || '') : '';
    const isTicket = /TKT-065\d{10}/.test(rawText1);

    if (isTicket) {
      const basic = { sequence: 1, ticketNumber: (norm || '').replace('-', '') };
      const details = parseTicketDetails(rawText1, basic);
      currentTicketData = upsertByKey(Array.isArray(currentTicketData)? currentTicketData: [], 'ticketNumber', details);
      renderCombinedResults();
      switchResultTab('analyzed');
      statusMessage.className = 'status-message success';
      statusMessage.textContent = `✅ تم جلب تفاصيل التذكرة ${details.ticketNumber}`;
      return;
    }

    // 2) إن لم تكن تذك��ة، حاول كقسيمة بصيغة ewd/emd065-xxxxxxxxxx
    const emdCmd = `ewd/emd${norm}`;
    await chrome.tabs.sendMessage(targetTab.id, { action: 'sendCommand', command: emdCmd });
    await new Promise(r => setTimeout(r, 3000));
    rawResponse = await chrome.tabs.sendMessage(targetTab.id, { action: 'getRawText' });
    const rawText2 = rawResponse && rawResponse.success ? (rawResponse.data || '') : '';
    const isEMD = /EMD-065\d{10}/.test(rawText2);

    if (isEMD) {
      const basic = { sequence: 1, emdNumber: (norm || '').replace('-', '') };
      const details = parseEMDDetails(rawText2, basic) || basic;
      currentEMDData = upsertByKey(Array.isArray(currentEMDData)? currentEMDData: [], 'emdNumber', details);
      renderCombinedResults();
      switchResultTab('analyzed');
      statusMessage.className = 'status-message success';
      statusMessage.textContent = `✅ تم جلب تفاصيل القسيمة ${details.emdNumber}`;
      return;
    }

    statusMessage.className = 'status-message warning';
    statusMessage.textContent = '⚠️ لم يتم العثور على تذكرة أو قسيمة مطابقة للرقم المدخل';

  } catch (e) {
    console.error('❌ خطأ في جلب الوثيقة بالرقم:', e);
    statusMessage.className = 'status-message error';
    statusMessage.textContent = '❌ حدث خطأ أثناء جلب الوثيقة';
  }
}

// تخزين واسترجاع للنتائج
async function getSaved() {
  return new Promise(resolve => {
    try {
      chrome.storage?.local.get(['savedTickets', 'savedEMDs'], (res) => {
        resolve({
          savedTickets: Array.isArray(res.savedTickets) ? res.savedTickets : [],
          savedEMDs: Array.isArray(res.savedEMDs) ? res.savedEMDs : []
        });
      });
    } catch (e) {
      resolve({ savedTickets: [], savedEMDs: [] });
    }
  });
}

async function setSaved(savedTickets, savedEMDs) {
  return new Promise(resolve => {
    try {
      chrome.storage?.local.set({ savedTickets, savedEMDs }, () => resolve(true));
    } catch (e) {
      resolve(false);
    }
  });
}

function uniqueBy(arr, key) {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const k = item?.[key];
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

async function onSaveResultsClick() {
  const statusMessage = document.getElementById('statusMessage');
  try {
    const { savedTickets, savedEMDs } = await getSaved();
    const mergedTickets = uniqueBy([...(savedTickets||[]), ...(currentTicketData||[])], 'ticketNumber');
    const mergedEMDs = uniqueBy([...(savedEMDs||[]), ...(currentEMDData||[])], 'emdNumber');
    await setSaved(mergedTickets, mergedEMDs);
    if (statusMessage) {
      statusMessage.className = 'status-message success';
      statusMessage.textContent = '💾 تم حفظ النتائج الحالية';
    }
  } catch (e) {
    if (statusMessage) {
      statusMessage.className = 'status-message error';
      statusMessage.textContent = '❌ فشل حفظ النتائج';
    }
  }
}

async function onClearAllClick() {
  const statusMessage = document.getElementById('statusMessage');
  // مسح محتوى الجدول فقط
  currentTicketData = [];
  currentEMDData = [];
  rerenderCurrentView();
  if (statusMessage) {
    statusMessage.className = 'status-message success';
    statusMessage.textContent = '🧹 تم مسح محتوى الجدول';
  }
}

async function onResultsContainerClick(e) {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  const type = btn.getAttribute('data-type');
  const key = btn.getAttribute('data-key');

  if (type === 'ticket') {
    currentTicketData = (currentTicketData || []).filter(t => String(t.ticketNumber) !== String(key));
  } else if (type === 'emd') {
    currentEMDData = (currentEMDData || []).filter(x => String(x.emdNumber) !== String(key));
  }
  rerenderCurrentView();
}

function rerenderCurrentView() {
  const resultsContainer = document.getElementById('resultsContainer');
  if (!resultsContainer) return;
  renderCombinedResults();
}

// التحقق من وجود content script وحقنه إذا لزم الأمر
async function ensureContentScript(tabId) {
  try {
    // محاولة إرسال رسالة ping للتحقق من وجود content script
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    console.log('✅ Content script موجود بالفعل');
    return true;
  } catch (error) {
    // إذا فشل، نحتاج لحقن content script
    console.log('⚠️ Content script غير موجود، جاري الحقن...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      console.log('✅ تم حقن content script بنجاح');
      // انتظار قصير للسماح للسكريبت بالتهيئة
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } catch (injectError) {
      console.error('❌ فشل حقن content script:', injectError);
      return false;
    }
  }
}

// البحث عن التذاكر برقم الجوال
async function searchTicketsByPhone() {
  console.log('🔍 بدء البحث عن التذاكر برقم الجوال...');

  const phoneInput = document.getElementById('phoneInput');
  const statusMessage = document.getElementById('statusMessage');
  const rawTextDisplay = document.getElementById('rawTextDisplay');

  if (!phoneInput || !statusMessage || !rawTextDisplay) {
    console.error('❌ لم يتم العثور على عناصر واجهة البحث');
    return;
  }

  const phoneNumber = phoneInput.value.trim();

  if (!phoneNumber) {
    statusMessage.className = 'status-message warning';
    statusMessage.textContent = '⚠️ يرجى إدخال رقم الجوال';
    return;
  }

  try {
    statusMessage.className = 'status-message info';
    statusMessage.textContent = '🔍 جاري البحث عن تبويب Amadeus...';

    // التحقق من توفر chrome APIs
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      console.log('⚠️ chrome APIs غير متاحة');
      statusMessage.className = 'status-message warning';
      statusMessage.textContent = '⚠️ يتم تشغيل الإضافة خارج Chrome';
      return;
    }

    // البحث في جميع التبويبات للعثور على صفحة Amadeus
    const tabs = await chrome.tabs.query({});
    let targetTab = null;

    for (const tab of tabs) {
      if (tab.url && (
        tab.url.includes('amadeus') ||
        tab.url.includes('test-page.html') ||
        tab.url.includes('localhost') ||
        tab.url.includes('file://')
      )) {
        targetTab = tab;
        break;
      }
    }

    if (!targetTab) {
      console.log('⚠️ لم يتم العثور على صفحة Amadeus');
      statusMessage.className = 'status-message warning';
      statusMessage.textContent = '⚠️ لم يتم العثور على صفحة Amadeus';
      return;
    }

    console.log(`✅ تم العثور على تبويب Amadeus: ${targetTab.url}`);
    
    // التحقق من وجود content script وحقنه إذا لزم الأمر
    statusMessage.className = 'status-message info';
    statusMessage.textContent = '🔧 جاري التحقق من الاتصال...';
    
    const scriptReady = await ensureContentScript(targetTab.id);
    if (!scriptReady) {
      statusMessage.className = 'status-message error';
      statusMessage.textContent = '❌ فشل الاتصال بصفحة Amadeus';
      return;
    }
    
    console.log(`📱 البحث عن التذاكر برقم الجوال: ${phoneNumber}`);
    statusMessage.className = 'status-message info';
    statusMessage.textContent = `📱 البحث عن التذاكر برقم: ${phoneNumber}`;

    // إرسال أمر البحث عن التذاكر
    const ticketCommand = `twd/org${phoneNumber}`;
    console.log(`📤 إرسال الأمر: ${ticketCommand}`);

    const response = await chrome.tabs.sendMessage(targetTab.id, {
      action: 'sendCommand',
      command: ticketCommand
    });

    if (response && response.success) {
      console.log('✅ تم إرسال أمر البحث عن التذاكر بنجاح');
      statusMessage.className = 'status-message info';
      statusMessage.textContent = '✅ تم إرسال أمر البحث، جاري انتظار النتائج...';

      // انتظار للسماح للنتائج بالظهور (2 ثانية فقط)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // جلب النص الخام
      let rawResponse = await chrome.tabs.sendMessage(targetTab.id, {
        action: 'getRawText'
      });

      if (rawResponse && rawResponse.success && rawResponse.data) {
        console.log('✅ تم جلب نتائج البحث عن التذاكر بنجاح');

        // عرض النتائج في التبويب الخام
        rawTextDisplay.value = rawResponse.data;

        // تحليل القائمة الأولية للحصول على عدد التذاكر
        let ticketList = parseTicketList(rawResponse.data);

        // إذا لم نجد تذاكر، حاول مرة أخرى بعد انتظار إضافي قصير
        if (ticketList.length === 0) {
          console.warn('⚠️ لم يتم العثور على تذاكر في المحاولة الأولى، إعادة المحاولة...');
          statusMessage.textContent = '🔄 إعادة محاولة جلب النتائج...';

          // انتظار 1.5 ثانية إضافية فقط
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // محاولة جلب النص مرة أخرى
          rawResponse = await chrome.tabs.sendMessage(targetTab.id, {
            action: 'getRawText'
          });
          
          if (rawResponse && rawResponse.success && rawResponse.data) {
            console.log('📄 تم جلب النص في المحاولة الثانية');
            rawTextDisplay.value = rawResponse.data;
            ticketList = parseTicketList(rawResponse.data);
            console.log(`📋 تم العثور على ${ticketList.length} تذكرة في المحاولة الثانية`);
          }
        }
        
        if (ticketList.length === 0) {
          statusMessage.className = 'status-message warning';
          statusMessage.textContent = '⚠️ لم يتم العثور على أي تذاكر';
          analyzeTicketResults(rawResponse.data, []);
          return;
        }

        console.log(`📋 تم العثور على ${ticketList.length} تذكرة، جاري جلب التفاصيل...`);
        statusMessage.className = 'status-message info';
        statusMessage.textContent = `📋 تم العثور على ${ticketList.length} تذكرة، جاري جلب التفاصيل...`;

        // جلب تفاصيل كل تذكرة
        const detailedTickets = await fetchAllTicketDetails(targetTab.id, ticketList, statusMessage);

        // عرض النتائج المفصلة
        analyzeTicketResults(rawResponse.data, detailedTickets);
        // التبديل تلقائياً إلى النتائج المحللة
        switchResultTab('analyzed');

        statusMessage.className = 'status-message success';
        statusMessage.textContent = `✅ تم جلب تفاصيل ${detailedTickets.length} تذكرة بنجاح`;
      } else {
        console.error('❌ فشل في جلب نتائج البحث عن التذاكر');
        statusMessage.className = 'status-message error';
        statusMessage.textContent = '❌ فشل في جلب نتائج البحث';
      }
    } else {
      console.error('❌ فشل في إرسال أمر البحث عن التذاكر');
      statusMessage.className = 'status-message error';
      statusMessage.textContent = '❌ فشل في إرسال أمر البحث';
    }

  } catch (error) {
    console.error('❌ خطأ في البحث عن التذاكر:', error);
    statusMessage.className = 'status-message error';
    statusMessage.textContent = '❌ خطأ في البحث عن التذاكر';
  }
}

// تحليل القائمة الأولية للتذاكر
function parseTicketList(rawText) {
  // Pattern محسّن يدعم كلا الصيغتين:
  // 1  0652186423097    ALANZI        11SEP  SV1483   RUHAQI
  // 1  0652186423097    ALANZI        O  11SEP25  SV1483   RUHAQI
  const ticketPattern = /^\s*(\d+)\s+(\d{13})\s+([A-Z\/\s]+?)\s+(?:([OC])\s+)?(\d{2}[A-Z]{3}(?:\d{2})?)\s+(.+)$/gm;
  const ticketList = [];
  let match;

  console.log('🔍 بدء تحليل قائمة التذاكر...');

  while ((match = ticketPattern.exec(rawText)) !== null) {
    const [, sequence, ticketNumber, name, status, date, description] = match;
    
    const ticket = {
      sequence: parseInt(sequence),
      ticketNumber: ticketNumber.trim(),
      name: name.trim(),
      status: status ? status.trim() : 'O', // افتراضي: مفتوح
      date: date.trim(),
      description: description.trim()
    };
    
    ticketList.push(ticket);
    console.log(`✅ تم تحليل التذكرة ${ticket.sequence}: ${ticket.ticketNumber}`);
  }

  console.log(`📋 تم العثور على ${ticketList.length} تذكرة في القائمة`);
  return ticketList;
}

// جلب تفاصيل جميع التذاكر
async function fetchAllTicketDetails(tabId, ticketList, statusMessage) {
  const detailedTickets = [];
  
  for (let i = 0; i < ticketList.length; i++) {
    const ticket = ticketList[i];
    const ticketIndex = i + 1;
    
    try {
      console.log(`📥 جلب تفاصيل التذكرة ${ticketIndex}/${ticketList.length}: ${ticket.ticketNumber}`);
      statusMessage.textContent = `📥 جلب تفاصيل التذكرة ${ticketIndex}/${ticketList.length}...`;

      // إرسال أمر twd/x
      const twdCommand = `twd/${ticket.sequence}`;
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'sendCommand',
        command: twdCommand
      });

      if (response && response.success) {
        // انتظار 1.5 ثانية فقط للسماح بظهور النتائج
        await new Promise(resolve => setTimeout(resolve, 1500));

        // جلب النص الخام للتفاصيل
        const detailsResponse = await chrome.tabs.sendMessage(tabId, {
          action: 'getRawText'
        });

        if (detailsResponse && detailsResponse.success && detailsResponse.data) {
          // تحليل التفاصيل
          const details = parseTicketDetails(detailsResponse.data, ticket);
          detailedTickets.push(details);
          console.log(`✅ تم جلب تفاصيل التذكرة ${ticket.ticketNumber}`);
        } else {
          console.warn(`⚠️ فشل في جلب تفاصيل التذكرة ${ticket.ticketNumber}`);
          detailedTickets.push(ticket); // إضافة البيانات الأساسية فقط
        }
      } else {
        console.warn(`⚠️ فشل في إرسال أمر twd/${ticket.sequence}`);
        detailedTickets.push(ticket);
      }
    } catch (error) {
      console.error(`❌ خطأ في جلب تفاصيل التذكرة ${ticket.ticketNumber}:`, error);
      detailedTickets.push(ticket);
    }
  }

  return detailedTickets;
}

// تحليل تفاصيل التذكرة
function parseTicketDetails(rawText, basicInfo) {
  const details = { ...basicInfo };

  console.log(`🔍 بدء تحليل تفاصيل التذكرة: ${basicInfo.ticketNumber}`);

  try {
    // استخراج رقم التذكرة الكامل
    const tktMatch = rawText.match(/TKT-(\d{13})/);
    if (tktMatch) {
      details.ticketNumber = tktMatch[1];
      console.log(`✅ رقم التذكرة: ${details.ticketNumber}`);
    }

    // استخراج الاسم الكامل
    const nameMatch = rawText.match(/\d+\.([A-Z\/\s]+(?:MR|MRS|MS|MISS|CHD|INF)?)/);
    if (nameMatch) {
      details.fullName = nameMatch[1].trim();
      console.log(`✅ الاسم الكامل: ${details.fullName}`);
    }

    // استخراج نوع المسافر (ADT, CHD, INF)
    const paxTypeMatch = rawText.match(/(ADT|CHD|INF)/);
    if (paxTypeMatch) {
      details.passengerType = paxTypeMatch[1];
      details.passengerTypeText = paxTypeMatch[1] === 'ADT' ? 'بالغ' : 
                                   paxTypeMatch[1] === 'CHD' ? 'طفل' : 'رضيع';
      console.log(`✅ نوع المسافر: ${details.passengerTypeText}`);
    }

    // استخراج معلومات الرحلة
    // يدعم كلا الصيغتين:
    // S I  1 ORUH SV1483   Y 11SEP2050 OK
    // S I  1 ORUH SV1483   Y 11SEP252050 OK (مع السنة)
    const flightMatch = rawText.match(/(\d+)\s+O?([A-Z]{3})\s+([A-Z]{2}\d+)\s+([A-Z])\s+(\d{2}[A-Z]{3}(?:\d{2})?)\s*(\d{4})?\s+(OK|HK|RR|HX|UC)/);
    if (flightMatch) {
      details.segment = flightMatch[1];
      details.origin = flightMatch[2];
      details.flightNumber = flightMatch[3];
      details.bookingClass = flightMatch[4];
      details.flightDate = flightMatch[5];
      details.flightTime = flightMatch[6] || '';
      details.status = flightMatch[7];
      
      console.log(`✈️ معلومات الرحلة: ${details.flightNumber} من ${details.origin} في ${details.flightDate}`);
    }

    // استخراج حالة الكوبون للتذكرة (O/A فقط مقبول)
    try {
      let couponStatusMatch = rawText.match(/OK\s+[A-Z0-9]+(?:\/[A-Z0-9]+)?\s+([A-Z])\s+\d{2}[A-Z]{3}(?:\d{2})?/);
      if (!couponStatusMatch) {
        couponStatusMatch = rawText.match(/[A-Z0-9]{2,}\s+([A-Z])\s+\d{2}[A-Z]{3}(?:\d{2})?/);
      }
      if (couponStatusMatch) {
        details.couponStatus = couponStatusMatch[1];
        details.isUsable = ['O','A'].includes(details.couponStatus.toUpperCase());
        console.log(`✅ حالة الكوبون للتذكرة: ${details.couponStatus} (صالحة: ${details.isUsable ? 'نعم' : 'لا'})`);
      }
    } catch (e) {
      // تجاهل أي أخطاء في التعرف على حالة الكوبون
    }

    // استخراج الوجهة
    const destMatch = rawText.match(/([A-Z]{3})\s+FARE/);
    if (destMatch) {
      details.destination = destMatch[1];
      console.log(`✅ الوجهة: ${details.destination}`);
    }

    // استخراج السعر
    const fareMatch = rawText.match(/FARE\s+([A-Z])\s+([A-Z]{3})\s+([\d.]+)/);
    if (fareMatch) {
      details.fareType = fareMatch[1];
      details.currency = fareMatch[2];
      details.fare = parseFloat(fareMatch[3]);
      console.log(`💰 السعر: ${details.fare} ${details.currency}`);
    }

    // استخراج الضرائب
    const taxMatch = rawText.match(/TOTALTAX\s+([A-Z]{3})\s+([\d.]+)/);
    if (taxMatch) {
      details.taxCurrency = taxMatch[1];
      details.tax = parseFloat(taxMatch[2]);
      console.log(`💰 الضرائب: ${details.tax} ${details.taxCurrency}`);
    }

    // استخراج الإجمالي
    if (details.fare !== undefined && details.tax !== undefined) {
      details.total = details.fare + details.tax;
      console.log(`💰 الإجمالي: ${details.total} ${details.currency}`);
    }

    // استخراج LOC (رمز الحجز)
    const locMatch = rawText.match(/LOC-([A-Z0-9]+)/);
    if (locMatch) {
      details.pnr = locMatch[1];
      console.log(`✅ PNR: ${details.pnr}`);
    }

    // استخراج تاريخ الإصدار
    const doiMatch = rawText.match(/DOI-(\d{2}[A-Z]{3}\d{2})/);
    if (doiMatch) {
      details.issueDate = doiMatch[1];
      console.log(`✅ تاريخ الإصدار: ${details.issueDate}`);
    }
    // استخراج نقطة الإصدار ورقم IATA (IOI) للتوليد اللاحق للمصدر الأصلي عند غيابه
    const poiMatchTkt = rawText.match(/POI-([A-Z]{3})/);
    if (poiMatchTkt) {
      details.poi = poiMatchTkt[1];
      console.log(`✅ نقطة الإصدار: ${details.poi}`);
    }
    const ioiMatchTkt = rawText.match(/IOI-(\d+)/);
    if (ioiMatchTkt) {
      details.ioi = ioiMatchTkt[1];
    }

    // استخراج المصدر الأصلي ومكتب الإصدار وتاريخ الإصدار الأصلي
    const foFullMatchTkt = rawText.match(/FO\s+((\d{3}-\d+)([A-Z]{3})(\d{2}[A-Z]{3}\d{2})\/\d+\/)/);
    if (foFullMatchTkt) {
      details.ticketingOffice = foFullMatchTkt[2];
      details.originalIssueDate = foFullMatchTkt[4];
      details.originalSource = `FO ${foFullMatchTkt[1]}`;
      console.log(`✅ المصدر الأصلي: ${details.originalSource}`);
      console.log(`✅ مكتب الإصدار: ${details.ticketingOffice}`);
      console.log(`✅ تاريخ الإصدار الأصلي: ${details.originalIssueDate}`);
    } else {
      const foMatch = rawText.match(/FO\s+(\d{3}-\d+)/);
      if (foMatch) {
        details.ticketingOffice = foMatch[1];
        console.log(`✅ مكتب الإصدار: ${details.ticketingOffice}`);
      }
    }

    // توليد مصدر أصلي افتراضي إذا لم يوجد FO وكان لدينا بيانات كافية
    if (!details.originalSource && details.ticketNumber && details.issueDate && details.ioi) {
      const first3 = details.ticketNumber.substring(0, 3);
      const poiLower = (details.poi || '').toLowerCase();
      const doiLower = details.issueDate.toLowerCase();
      details.originalSource = `fo${first3}-${details.ticketNumber}${poiLower}${doiLower}/${details.ioi}/`;
      console.log(`✅ المصدر الأصلي (مُستنتج): ${details.originalSource}`);
    }

    // استخراج طريقة الدفع
    const fpMatch = rawText.match(/FP\s+([^\n]+)/);
    if (fpMatch) {
      details.formOfPayment = fpMatch[1].trim();
      console.log(`✅ طريقة الدفع: ${details.formOfPayment}`);
    }

    // استخراج الأمتعة
    const baggageMatch = rawText.match(/(\d+PC)/);
    if (baggageMatch) {
      details.baggage = baggageMatch[1];
      console.log(`✅ الأمتعة: ${details.baggage}`);
    }

    console.log(`✅ تم تحليل تفاصيل التذكرة ${details.ticketNumber} بنجاح`);
    console.log('📊 التفاصيل الكاملة:', details);

  } catch (error) {
    console.error('❌ خطأ في تحليل تفاصيل التذكرة:', error);
  }

  return details;
}

// البحث عن القسائم برقم الجوال
async function searchEMDsByPhone() {
  console.log('🔍 بدء البحث عن القسائم برقم الجوال...');

  const phoneInput = document.getElementById('phoneInput');
  const statusMessage = document.getElementById('statusMessage');
  const rawTextDisplay = document.getElementById('rawTextDisplay');

  if (!phoneInput || !statusMessage || !rawTextDisplay) {
    console.error('❌ لم يتم العثور على عناصر واجهة البحث');
    return;
  }

  const phoneNumber = phoneInput.value.trim();

  if (!phoneNumber) {
    statusMessage.className = 'status-message warning';
    statusMessage.textContent = '⚠️ يرجى إدخال رقم الجوال';
    return;
  }

  try {
    statusMessage.className = 'status-message info';
    statusMessage.textContent = '🔍 جاري البحث عن تبويب Amadeus...';

    // التحقق من توفر chrome APIs
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      console.log('⚠️ chrome APIs غير متاحة');
      statusMessage.className = 'status-message warning';
      statusMessage.textContent = '⚠️ يتم تشغيل الإضافة خارج Chrome';
      return;
    }

    // البحث في جميع التبويبات للعثور على صفحة Amadeus
    const tabs = await chrome.tabs.query({});
    let targetTab = null;

    for (const tab of tabs) {
      if (tab.url && (
        tab.url.includes('amadeus') ||
        tab.url.includes('test-page.html') ||
        tab.url.includes('localhost') ||
        tab.url.includes('file://')
      )) {
        targetTab = tab;
        break;
      }
    }

    if (!targetTab) {
      console.log('⚠️ لم يتم العثور على صفحة Amadeus');
      statusMessage.className = 'status-message warning';
      statusMessage.textContent = '⚠️ لم يتم العثور على صفحة Amadeus';
      return;
    }

    console.log(`✅ تم العثور على تبويب Amadeus: ${targetTab.url}`);
    
    // التحقق من وجود content script وحقنه إذا لزم الأمر
    statusMessage.className = 'status-message info';
    statusMessage.textContent = '🔧 جاري التحقق من الاتصال...';
    
    const scriptReady = await ensureContentScript(targetTab.id);
    if (!scriptReady) {
      statusMessage.className = 'status-message error';
      statusMessage.textContent = '❌ فشل الاتصال بصفحة Amadeus';
      return;
    }
    
    console.log(`📱 البحث عن القسائم برقم الجوال: ${phoneNumber}`);
    statusMessage.className = 'status-message info';
    statusMessage.textContent = `📱 البحث عن القسائم برقم: ${phoneNumber}`;

    // إرسال أمر البحث عن القسائم
    const emdCommand = `ewd/phone-${phoneNumber}/sc99i`;
    console.log(`📤 إرسال الأمر: ${emdCommand}`);

    const response = await chrome.tabs.sendMessage(targetTab.id, {
      action: 'sendCommand',
      command: emdCommand
    });

    if (response && response.success) {
      console.log('✅ تم إرسال أمر البحث عن القسائم بنجاح');
      statusMessage.className = 'status-message info';
      statusMessage.textContent = '✅ تم إرسال أمر البحث، جاري انتظار النتائج...';

      // انتظار محسّن للسماح للنتائج بالظهور (3 ثوانٍ فقط)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // جلب النص الخام
      let rawResponse = await chrome.tabs.sendMessage(targetTab.id, {
        action: 'getRawText'
      });

      if (rawResponse && rawResponse.success && rawResponse.data) {
        console.log('✅ تم جلب نتائج البحث عن القسائم بنجاح');
        console.log(`📄 طول النص المستلم: ${rawResponse.data.length} حرف`);

        // عرض النتائج في التبويب الخام
        rawTextDisplay.value = rawResponse.data;

        // تحليل القائمة الأولية للقسائم
        let emdList = parseEMDList(rawResponse.data);
        console.log(`📋 تم العثور على ${emdList.length} قسيمة في القائمة`);

        // إذا لم نجد قسائم، حاول مرة أخرى بعد انتظار إضافي
        if (emdList.length === 0) {
          console.warn('⚠️ لم يتم العثور على قسائم في المحاولة الأولى، إعادة المحاولة...');
          statusMessage.textContent = '🔄 إعادة محاولة جلب النتائج...';
          
          // انتظار 1.5 ثانية إضافية فقط
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // محاولة جلب النص مرة أخرى
          rawResponse = await chrome.tabs.sendMessage(targetTab.id, {
            action: 'getRawText'
          });
          
          if (rawResponse && rawResponse.success && rawResponse.data) {
            console.log('📄 تم جلب النص في المحاولة الثانية');
            rawTextDisplay.value = rawResponse.data;
            emdList = parseEMDList(rawResponse.data);
            console.log(`📋 تم العثور على ${emdList.length} قسيمة في المحاولة الثانية`);
          }
        }

        if (emdList.length === 0) {
          statusMessage.className = 'status-message warning';
          statusMessage.textContent = '⚠️ لم يتم العثور على قسائم في النص المستلم';
          console.warn('⚠️ النص المستلم:', rawResponse.data.substring(0, 500));
          analyzeEMDResults(rawResponse.data, []);
          return;
        }

        // جلب تفاصيل كل قسيمة تلقائياً
        statusMessage.className = 'status-message info';
        statusMessage.textContent = `🔄 جاري جلب تفاصيل ${emdList.length} قسيمة...`;

        const detailedEMDs = await fetchAllEMDDetails(targetTab.id, emdList, statusMessage);

        // عرض النتائج المحللة
        analyzeEMDResults(rawResponse.data, detailedEMDs);
        // التبديل تلقائياً إلى النتائج المحللة
        switchResultTab('analyzed');

        statusMessage.className = 'status-message success';
        statusMessage.textContent = `✅ تم جلب وتحليل ${detailedEMDs.length} قسيمة بنجاح`;
      } else {
        console.error('❌ فشل في جلب نتائج البحث عن القسائم');
        statusMessage.className = 'status-message error';
        statusMessage.textContent = '❌ فشل في جلب نتائج البحث';
      }
    } else {
      console.error('❌ فشل في إرسال أمر البحث عن القسائم');
      statusMessage.className = 'status-message error';
      statusMessage.textContent = '❌ فشل في إرسال أمر البحث';
    }

  } catch (error) {
    console.error('❌ خطأ في البحث عن القسائم:', error);
    statusMessage.className = 'status-message error';
    statusMessage.textContent = '❌ خطأ في البحث عن القسائم';
  }
}

// دالة مساعدة لترجمة حالة EMD
function getEMDStatusText(status) {
  const statusMap = {
    'O': 'مفتوح',
    'C': 'مغلق',
    'V': 'صالح',
    'R': 'مسترد',
    'X': 'ملغي',
    'E': 'منتهي',
    'U': 'مستخدم'
  };
  return statusMap[status] || status; // إذا لم نجد الترجمة، نعيد الحرف كما هو
}

// تحليل قائمة القسائم الأولية
function parseEMDList(rawText) {
  console.log('📋 بدء تحليل قائمة القسائم...');
  console.log(`📄 طول النص: ${rawText.length} حرف`);
  
  const emdList = [];
  const lines = rawText.split('\n');
  console.log(`📄 عدد الأسطر: ${lines.length}`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // نمط تحليل القائمة الأولية - محسّن لدعم جميع الحالات:
    // 1 0654224198436  ALANAZI/KHALID M V 04OCT25 D/99I RESIDUAL VALUE
    // 2 0654222246920  ALANAZI/MODHI A  R 16JUN25 D/99I RESIDUAL VALUE
    // 3 0654221128228  ALANAZI/MUTAEB M O 12APR25 D/99I RESIDUAL VALUE
    // الحقول: sequence, emdNumber, name, status, date, description
    // النمط يدعم: O, C, V, R, X وأي حرف آخر للحالة
    const emdMatch = line.match(/^\s*(\d+)\s+(\d{13})\s+([A-Z\/\s]+?)\s+([A-Z])\s+(\d{2}[A-Z]{3}\d{2})\s+(.+)$/);

    if (emdMatch) {
      const [, sequence, emdNumber, passengerName, status, date, description] = emdMatch;

      const emd = {
        sequence: parseInt(sequence),
        emdNumber: emdNumber.trim(),
        name: passengerName.trim(),
        status: status.trim(),
        date: date.trim(),
        description: description.trim(),
        statusText: getEMDStatusText(status.trim())
      };

      emdList.push(emd);
      console.log(`✅ تم تحليل القسيمة ${sequence}: ${emdNumber} - ${passengerName.trim()} (حالة: ${status})`);
    } else if (line.trim() && line.match(/\d{13}/)) {
      // محاولة تسجيل الأسطر التي تحتوي على أرقام قسائم لكن لم تطابق النمط
      console.log(`⚠️ سطر يحتوي على رقم قسيمة لكن لم يطابق النمط (سطر ${i + 1}): ${line.substring(0, 100)}`);
    }
  }

  console.log(`📊 تم استخراج ${emdList.length} قسيمة من القائمة`);
  
  if (emdList.length === 0) {
    console.warn('⚠️ لم يتم العثور على أي قسائم. عينة من النص:');
    console.warn(rawText.substring(0, 500));
  }
  
  return emdList;
}

// جلب تفاصيل جميع القسائم تلقائياً
async function fetchAllEMDDetails(tabId, emdList, statusMessage) {
  console.log(`🔄 بدء جلب تفاصيل ${emdList.length} قسيمة...`);
  const detailedEMDs = [];

  for (let i = 0; i < emdList.length; i++) {
    const emd = emdList[i];
    const sequence = emd.sequence;

    try {
      console.log(`📤 جلب تفاصيل القسيمة ${i + 1}/${emdList.length}: ewd/${sequence}`);
      statusMessage.textContent = `🔄 جلب تفاصيل القسيمة ${i + 1}/${emdList.length}...`;

      // إرسال أمر ewd/x
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'sendCommand',
        command: `ewd/${sequence}`
      });

      if (response && response.success) {
        console.log(`✅ تم إرسال أمر ewd/${sequence} بنجاح`);

        // انتظار 1.5 ثانية فقط للسماح للنتائج بالظهور
        await new Promise(resolve => setTimeout(resolve, 1500));

        // جلب النص الخام
        const rawResponse = await chrome.tabs.sendMessage(tabId, {
          action: 'getRawText'
        });

        if (rawResponse && rawResponse.success && rawResponse.data) {
          console.log(`✅ تم جلب تفاصيل القسيمة ${sequence}`);

          // تحليل التفاصيل
          const details = parseEMDDetails(rawResponse.data, emd);

          if (details) {
            detailedEMDs.push(details);
            console.log(`✅ تم تحليل القسيمة ${sequence}: ${details.emdNumber}`);
          } else {
            console.warn(`⚠️ فشل تحليل القسيمة ${sequence}`);
            detailedEMDs.push(emd); // استخدام البيانات الأساسية
          }
        } else {
          console.error(`❌ فشل جلب تفاصيل القسيمة ${sequence}`);
          detailedEMDs.push(emd); // استخدام البيانات الأساسية
        }
      } else {
        console.error(`❌ فشل إرسال أمر ewd/${sequence}`);
        detailedEMDs.push(emd); // استخدام البيانات الأساسية
      }

    } catch (error) {
      console.error(`❌ خطأ في جلب تفاصيل القسيمة ${sequence}:`, error);
      detailedEMDs.push(emd); // استخدام البيانات الأساسية
    }
  }

  console.log(`✅ تم جلب تفاصيل ${detailedEMDs.length} قسيمة بنجاح`);
  return detailedEMDs;
}

// تحليل تفاصيل القسيمة الكاملة
function parseEMDDetails(rawText, basicInfo) {
  console.log('📊 بدء تحليل تفاصيل القسيمة...');

  try {
    const emdDetails = {
      ...basicInfo, // نسخ البيانات الأساسية
      type: null,
      system: null,
      pnr: null,
      fci: null,
      poi: null,
      issueDate: null,
      ioi: null,
      fullName: null,
      passengerType: null,
      passengerTypeText: null,
      rfic: null,
      rficDescription: null,
      coupon: null,
      rfisc: null,
      airline: null,
      couponStatus: null,
      value: null,
      currency: null,
      descriptionFull: null,
      presentTo: null,
      presentAt: null,
      icw: null,
      fare: null,
      fareCurrency: null,
      exchValue: null,
      exchCurrency: null,
      refundValue: null,
      ticketingOffice: null,
      formOfPayment: null,
      foid: null,
      originalSource: null,       // المصدر الأصلي (الجزء الأول من FO)
      originalIssueDate: null     // تاريخ الإصدار الأصلي من FO
    };

    // 1. استخراج رقم القسيمة والنوع والنظام
    // EMD-0654223822758     TYPE-S                                 SYS-1A
    const emdHeaderMatch = rawText.match(/EMD-(\d{13})\s+TYPE-([A-Z])\s+SYS-([A-Z0-9]+)/);
    if (emdHeaderMatch) {
      emdDetails.emdNumber = emdHeaderMatch[1];
      emdDetails.type = emdHeaderMatch[2];
      emdDetails.system = emdHeaderMatch[3];
      console.log(`✅ رقم القسيمة: ${emdDetails.emdNumber}, النوع: ${emdDetails.type}, النظام: ${emdDetails.system}`);
    }

    // 2. استخراج LOC (PNR)
    // LOC-9MUNFI INT-D          FCI-0
    const locMatch = rawText.match(/LOC-([A-Z0-9]+)/);
    if (locMatch) {
      emdDetails.pnr = locMatch[1];
      console.log(`✅ PNR: ${emdDetails.pnr}`);
    }

    // 3. استخراج FCI
    const fciMatch = rawText.match(/FCI-(\d+)/);
    if (fciMatch) {
      emdDetails.fci = fciMatch[1];
    }

    // 4. استخراج POI (Point of Issue)
    // POI-AQI        DOI-09SEP25
    const poiMatch = rawText.match(/POI-([A-Z]{3})/);
    if (poiMatch) {
      emdDetails.poi = poiMatch[1];
      console.log(`✅ نقطة الإصدار: ${emdDetails.poi}`);
    }

    // 5. استخراج DOI (Date of Issue)
    const doiMatch = rawText.match(/DOI-(\d{2}[A-Z]{3}\d{2})/);
    if (doiMatch) {
      emdDetails.issueDate = doiMatch[1];
      console.log(`✅ تاريخ الإصدار: ${emdDetails.issueDate}`);
    }

    // 6. استخراج IOI
    const ioiMatch = rawText.match(/IOI-(\d+)/);
    if (ioiMatch) {
      emdDetails.ioi = ioiMatch[1];
    }

    // 7. استخراج اسم المسافر الكامل ونوعه
    // PAX- ALANZI/HELAL MR                                                        ADT
    const paxMatch = rawText.match(/PAX-\s*([A-Z\/\s]+?)\s+(ADT|CHD|INF)/);
    if (paxMatch) {
      emdDetails.fullName = paxMatch[1].trim();
      emdDetails.passengerType = paxMatch[2];
      emdDetails.passengerTypeText = paxMatch[2] === 'ADT' ? 'بالغ' : (paxMatch[2] === 'CHD' ? 'طفل' : 'رضيع');
      console.log(`✅ اسم المسافر: ${emdDetails.fullName}, النوع: ${emdDetails.passengerTypeText}`);
    }

    // 8. استخراج RFIC ووصفه
    // RFIC-D  FINANCIAL IMPACT REMARKS-
    const rficMatch = rawText.match(/RFIC-([A-Z])\s+([A-Z\s]+?)(?:REMARKS-|CPN-)/);
    if (rficMatch) {
      emdDetails.rfic = rficMatch[1];
      emdDetails.rficDescription = rficMatch[2].trim();
      console.log(`✅ RFIC: ${emdDetails.rfic} - ${emdDetails.rficDescription}`);
    }

    // 9. استخراج معلومات الكوبون (متانة أعلى)
    // أمثلة: 
    //  - CPN-1  RFISC-99I  SV         S-O
    //  - CPN-1  RFISC-99I  SV AQI     S-O
    // نلتقط من سطر CPN نفسه ونسحب الحرف بعد S-
    const cpnLineMatch = rawText.match(/^.*CPN-\s*(\d+).*$/im);
    if (cpnLineMatch) {
      const cpnLine = cpnLineMatch[0];
      emdDetails.coupon = cpnLineMatch[1];

      const rfiscM = cpnLine.match(/RFISC-([A-Z0-9]+)/i);
      if (rfiscM) emdDetails.rfisc = rfiscM[1].toUpperCase();

      // Airline قد تكون 2-3 حروف بعد RFISC مباشرة
      const airM = cpnLine.match(/RFISC-[A-Z0-9]+\s+([A-Z0-9]{2,3})/i);
      if (airM) emdDetails.airline = airM[1].toUpperCase();

      const statM = cpnLine.match(/S-([A-Z])/i);
      if (statM) emdDetails.couponStatus = statM[1].toUpperCase();

      emdDetails.isUsable = ['O','A'].includes((emdDetails.couponStatus || '').toUpperCase());
      console.log(`✅ كوبون: ${emdDetails.coupon}, RFISC: ${emdDetails.rfisc || '-'}, شركة الطيران: ${emdDetails.airline || '-'}, حالة: ${emdDetails.couponStatus || '-'}`);
    }

    // 10. استخراج القيمة
    // VALUE-1204.04  DESCRIPTION-RESIDUAL VALUE
    const valueMatch = rawText.match(/VALUE-([\d.]+)\s+DESCRIPTION-(.+?)(?:\s+PRESENT|$)/m);
    if (valueMatch) {
      emdDetails.value = parseFloat(valueMatch[1]);
      emdDetails.descriptionFull = valueMatch[2].trim();
      console.log(`✅ القيمة: ${emdDetails.value}, الوصف: ${emdDetails.descriptionFull}`);
    }

    // 11. استخراج PRESENT TO و PRESENT AT
    // PRESENT TO-SAUDI ARABIAN AIRLINES  PRESENT AT-JEDDAH
    const presentToMatch = rawText.match(/PRESENT TO-([A-Z\s]+?)(?:\s+PRESENT AT-|$)/);
    if (presentToMatch) {
      emdDetails.presentTo = presentToMatch[1].trim();
      console.log(`✅ تقديم إلى: ${emdDetails.presentTo}`);
    }

    const presentAtMatch = rawText.match(/PRESENT AT-([A-Z\s]+?)(?:\s+ICW-|$)/);
    if (presentAtMatch) {
      emdDetails.presentAt = presentAtMatch[1].trim();
      console.log(`✅ تقديم في: ${emdDetails.presentAt}`);
    }

    // 12. استخراج ICW (In Connection With - رقم التذكرة المرتبط)
    // ICW-0652186423097
    const icwMatch = rawText.match(/ICW-(\d{13})/);
    if (icwMatch) {
      emdDetails.icw = icwMatch[1];
      console.log(`✅ مرتبط بالتذكرة: ${emdDetails.icw}`);
    }

    // 13. استخراج معلومات السعر
    // FARE   R    SAR        1204.04
    const fareMatch = rawText.match(/FARE\s+([A-Z])\s+([A-Z]{3})\s+([\d.]+)/);
    if (fareMatch) {
      emdDetails.fare = parseFloat(fareMatch[3]);
      emdDetails.fareCurrency = fareMatch[2];
      emdDetails.currency = fareMatch[2];
      console.log(`✅ السعر: ${emdDetails.fare} ${emdDetails.fareCurrency}`);
    }

    // 14. استخراج قيمة التبديل
    // EXCH VAL SAR    1204.04
    const exchMatch = rawText.match(/EXCH VAL\s+([A-Z]{3})\s+([\d.]+)/);
    if (exchMatch) {
      emdDetails.exchValue = parseFloat(exchMatch[2]);
      emdDetails.exchCurrency = exchMatch[1];
      console.log(`✅ قيمة التبديل: ${emdDetails.exchValue} ${emdDetails.exchCurrency}`);
    }

    // 15. استخراج قيمة الاسترداد
    // RFND VAL TAX- TOTAL       SAR
    const refundMatch = rawText.match(/RFND VAL TAX-\s*TOTAL\s+([A-Z]{3})\s+([\d.]+)?/);
    if (refundMatch && refundMatch[2]) {
      emdDetails.refundValue = parseFloat(refundMatch[2]);
    }

    // 16. استخراج مكتب الإصدار والمصدر الأصلي وتاريخ الإصدار الأصلي
    // FO 065-2170517499JED15SEP24/71499772/065-2170517499
    // نريد: FO 065-2170517499JED15SEP24/71499772/ (الجزء الأول فقط)
    const foFullMatch = rawText.match(/FO\s+((\d{3}-\d+)([A-Z]{3})(\d{2}[A-Z]{3}\d{2})\/\d+\/)/);
    if (foFullMatch) {
      emdDetails.ticketingOffice = foFullMatch[2]; // رقم المكتب فقط
      emdDetails.originalIssueDate = foFullMatch[4]; // تاريخ الإصدار الأصلي (مثل: 08SEP23)
      
      // المصدر الأصلي = FO + الجزء الأول فقط (بدون رقم القسيمة)
      emdDetails.originalSource = `FO ${foFullMatch[1]}`;
      console.log(`✅ المصدر الأصلي: ${emdDetails.originalSource}`);
      
      console.log(`✅ مكتب الإصدار: ${emdDetails.ticketingOffice}`);
      console.log(`✅ تاريخ الإصدار الأصلي: ${emdDetails.originalIssueDate}`);
    }

    // 17. استخراج طريقة الدفع
    // FP O/GOV
    const fpMatch = rawText.match(/FP\s+([^\n]+)/);
    if (fpMatch) {
      emdDetails.formOfPayment = fpMatch[1].trim();
      console.log(`✅ طريقة الدفع: ${emdDetails.formOfPayment}`);
    }

    // 18. استخراج FOID
    const foidMatch = rawText.match(/FOID-([^\s]+)/);
    if (foidMatch) {
      emdDetails.foid = foidMatch[1];
    }

    console.log('✅ تم تحليل تفاصيل القسيمة بنجاح:', emdDetails);
    return emdDetails;

  } catch (error) {
    console.error('❌ خطأ في تحليل تفاصيل القسيمة:', error);
    return basicInfo; // إرجاع البيانات الأساسية في حالة الخطأ
  }
}

// تبديل التبويبات
function switchResultTab(tabType) {
  const rawTab = document.getElementById('rawResultTab');
  const analyzedTab = document.getElementById('analyzedResultTab');
  const rawContent = document.getElementById('rawResultContent');
  const analyzedContent = document.getElementById('analyzedResultContent');

  if (!rawTab || !analyzedTab || !rawContent || !analyzedContent) {
    console.error('❌ لم يتم العثور على عناصر التبويبات');
    return;
  }

  // إزالة الفئة النشطة من جميع التبويبات والمحتويات
  rawTab.classList.remove('active');
  analyzedTab.classList.remove('active');
  rawContent.classList.remove('active');
  analyzedContent.classList.remove('active');

  // إضافة الفئة النشطة للتبويب المحدد
  if (tabType === 'raw') {
    rawTab.classList.add('active');
    rawContent.classList.add('active');
    console.log('📄 تم التبديل إلى تبويب النص الخام');
  } else if (tabType === 'analyzed') {
    analyzedTab.classList.add('active');
    analyzedContent.classList.add('active');
    console.log('📊 تم التبديل إلى تبويب النتائج المحللة');
  }
}

// تحليل نتائج البحث عن التذاكر
function analyzeTicketResults(rawText, detailedTickets) {
  console.log('📊 بدء تحليل نتائج البحث عن التذاكر...');

  const resultsContainer = document.getElementById('resultsContainer');

  if (!resultsContainer) {
    console.error('❌ لم يتم العثور على عناصر عرض التحليل');
    return;
  }

  try {
    currentViewType = 'combined';
    const allTickets = detailedTickets || [];
    const ticketData = allTickets.filter(t => ['O','A'].includes(((t.couponStatus)||'').toUpperCase()));

    console.log(`📊 تم العثور على ${ticketData.length} تذكرة (بعد تصفية O/A)`);

    if (ticketData.length === 0) {
      resultsContainer.innerHTML = `
        <div class="summary-box">
          <h4>📊 ملخص النتائج:</h4>
          <div class="summary-item">⚠️ لم يتم العثور على أي تذاكر</div>
        </div>
      `;
      return;
    }

    // حفظ بيانات التذاكر
    currentTicketData = ticketData;

    // إحصائيات التذاكر
    const uniquePassengers = [...new Set(ticketData.map(ticket => ticket.fullName || ticket.name))].length;
    const openTickets = ticketData.filter(ticket => ['O','A'].includes(((ticket.couponStatus)||'').toUpperCase())).length;
    const closedTickets = (allTickets.length) - openTickets;

    // حساب إجمالي الأسعار
    const totalFare = ticketData.reduce((sum, ticket) => sum + (ticket.fare || 0), 0);
    const totalTax = ticketData.reduce((sum, ticket) => sum + (ticket.tax || 0), 0);
    const grandTotal = totalFare + totalTax;

    // أحدث وأقدم تذكرة
    const dates = ticketData.map(ticket => ticket.issueDate || ticket.date).filter(d => d);
    const latestDate = dates.length > 0 ? dates.sort().pop() : 'غير محدد';
    const oldestDate = dates.length > 0 ? dates.sort().shift() : 'غير محدد';

    // عرض الملخص
    let summaryHTML = `
      <div class="summary-box">
        <h4>📊 ملخص النتائج:</h4>
        <div class="summary-item">🎫 عدد التذاكر: <strong>${ticketData.length}</strong></div>
        <div class="summary-item">👥 عدد المسافرين: <strong>${uniquePassengers}</strong></div>
        <div class="summary-item">🟢 تذاكر مفتوحة: <strong>${openTickets}</strong></div>
        <div class="summary-item">🔴 تذاكر مغلقة: <strong>${closedTickets}</strong></div>
        ${grandTotal > 0 ? `<div class="summary-item">💰 الإجمالي: <strong>${grandTotal.toFixed(2)} ${ticketData[0]?.currency || 'SAR'}</strong></div>` : ''}
        <div class="summary-item">📅 أحدث تذكرة: <strong>${latestDate}</strong></div>
        <div class="summary-item">📅 أقدم تذكرة: <strong>${oldestDate}</strong></div>
      </div>
    `;

    // عرض موحّد للتذاكر والقسائم
    currentTicketData = ticketData;
    renderCombinedResults();

    console.log(`✅ تم تحليل ${ticketData.length} تذكرة بنجاح (عرض موحّد)`);

  } catch (error) {
    console.error('❌ خطأ في تحليل نتائج التذاكر:', error);
    resultsContainer.innerHTML = `
      <div class="summary-box">
        <h4>❌ خطأ في التحليل:</h4>
        <div class="summary-item">${error.message}</div>
      </div>
    `;
  }
}

// تحليل نتائج EMD
function analyzeEMDResults(rawText, detailedEMDs) {
  console.log('📊 بدء تحليل نتائج EMD...');

  const resultsContainer = document.getElementById('resultsContainer');

  if (!resultsContainer) {
    console.error('❌ لم يتم العثور على عناصر التحليل');
    return;
  }

  try {
    currentViewType = 'combined';
    const allEMDs = detailedEMDs || [];
    const emdData = allEMDs.filter(emd => ['O','A'].includes(((emd.couponStatus)||'').toUpperCase()));
    currentEMDData = emdData; // حفظ البيانات للفلترة

    console.log(`📊 تم العثور على ${emdData.length} قسيمة`);

    if (emdData.length === 0) {
      resultsContainer.innerHTML = `
        <div class="summary-box">
          <h4>📊 ملخص النتائج:</h4>
          <div class="summary-item">⚠️ لم يتم العثور على أي قسائم</div>
        </div>
      `;
      return;
    }

    // إحصائيات القسائم
    const uniquePassengers = [...new Set(emdData.map(emd => emd.fullName || emd.name))].length;
    const openEMDs = emdData.filter(emd => emd.status === 'O' || emd.couponStatus === 'O').length;
    const closedEMDs = emdData.length - openEMDs;

    // حساب إجمالي القيم
    const totalValue = emdData.reduce((sum, emd) => sum + (emd.value || emd.fare || 0), 0);
    const totalExchValue = emdData.reduce((sum, emd) => sum + (emd.exchValue || 0), 0);

    // أحدث وأقدم قسيمة
    const dates = emdData.map(emd => emd.issueDate || emd.date).filter(d => d);
    const latestDate = dates.length > 0 ? dates.sort().pop() : 'غير محدد';
    const oldestDate = dates.length > 0 ? dates.sort().shift() : 'غير محدد';

    // عرض الملخص
    let summaryHTML = `
      <div class="summary-box">
        <h4>📊 ملخص النتائج:</h4>
        <div class="summary-item">📄 عدد القسائم: <strong>${emdData.length}</strong></div>
        <div class="summary-item">👥 عدد المسافرين: <strong>${uniquePassengers}</strong></div>
        <div class="summary-item">🟢 قسائم مفتوحة: <strong>${openEMDs}</strong></div>
        <div class="summary-item">🔴 قسائم مغلقة: <strong>${closedEMDs}</strong></div>
        ${totalValue > 0 ? `<div class="summary-item">💰 إجمالي القيمة: <strong>${totalValue.toFixed(2)} ${emdData[0]?.currency || 'SAR'}</strong></div>` : ''}
        ${totalExchValue > 0 ? `<div class="summary-item">💱 إجمالي قيمة التبديل: <strong>${totalExchValue.toFixed(2)} ${emdData[0]?.exchCurrency || 'SAR'}</strong></div>` : ''}
        <div class="summary-item">📅 أحدث قسيمة: <strong>${latestDate}</strong></div>
        <div class="summary-item">📅 أقدم قسيمة: <strong>${oldestDate}</strong></div>
      </div>
    `;

    // عرض موحّد للتذاكر والقسائم
    currentEMDData = emdData;
    renderCombinedResults();

    console.log(`✅ تم تحليل ${emdData.length} قسيمة بنجاح (عرض موحّد)`);

  } catch (error) {
    console.error('❌ خطأ في تحليل النتائج:', error);
    resultsContainer.innerHTML = `
      <div class="summary-box">
        <h4>❌ خطأ في التحليل:</h4>
        <div class="summary-item">${error.message}</div>
      </div>
    `;
  }
}

// تحليل بيانات EMD من النص الخام
function parseEMDData(rawText) {
  const emdList = [];
  const lines = rawText.split('\n');

  for (const line of lines) {
    // البحث عن أسطر تحتوي على معلومات EMD
    // نمط: رقم EMD (13 رقم) + اسم المسافر + حالة + تاريخ + معلومات إضافية
    const emdMatch = line.match(/^\s*(\d+)\s+(\d{13})\s+([A-Z\/\s]+?)\s+([OC])\s+(\d{2}[A-Z]{3}\d{2})\s+(.+)$/);

    if (emdMatch) {
      const [, sequence, emdNumber, passengerName, status, date, description] = emdMatch;

      emdList.push({
        sequence: parseInt(sequence),
        emdNumber: emdNumber.trim(),
        name: passengerName.trim(),
        status: status.trim(),
        date: date.trim(),
        description: description.trim(),
        statusText: status === 'O' ? 'مفتوح' : 'مغلق'
      });
    }
  }

  console.log(`📋 تم استخراج ${emdList.length} قسيمة من النص`);
  return emdList;
}

// إنشاء جدول التذاكر المفصل
function createDetailedTicketTable(ticketData) {
  const table = document.createElement('table');
  table.style.fontSize = '12px';

  // إنشاء رأس الجدول
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>رقم التذكرة</th>
      <th>اسم المسافر</th>
      <th>المبلغ</th>
      <th>المصدر الأصلي</th>
      <th>التاريخ</th>
      <th>حذف</th>
    </tr>
  `;
  table.appendChild(thead);

  // إنشاء جسم الجدول
  const tbody = document.createElement('tbody');

  ticketData.forEach(ticket => {
    const row = document.createElement('tr');

    // تحديد لون الحالة حسب حالة الكوبون
    const coupon = (ticket.couponStatus || '').toUpperCase();
    const isUsable = coupon === 'O' || coupon === 'A';
    const statusBg = isUsable ? '#e8f5e8' : '#ffebee';
    const statusColor = isUsable ? '#2e7d32' : '#c62828';
    const statusText = coupon === 'A' ? 'متاح' : (coupon === 'O' ? 'مفتوح' : 'غير صالح');

    const amount = (typeof ticket.total === 'number' ? ticket.total : ticket.fare) || null;
    const currency = ticket.currency || ticket.taxCurrency || '';

    row.innerHTML = `
      <td style="font-weight: 600; color: #1565c0; white-space: nowrap;">${ticket.ticketNumber || '-'}</td>
      <td style="text-align: right; white-space: nowrap;" title="${ticket.fullName || ticket.name}">${ticket.fullName || ticket.name || '-'}</td>
      <td style="text-align: right; font-weight: 600; color: #1565c0;">${amount !== null ? (amount.toFixed(2) + (currency ? ' ' + currency : '')) : '-'}</td>
      <td style="font-size: 10px; font-family: monospace; white-space: nowrap;" title="${ticket.originalSource || '-'}">${ticket.originalSource || '-'}</td>
      <td style="white-space: nowrap;">${ticket.issueDate || ticket.date || '-'}</td>
      <td><button class="btn btn-danger btn-small" data-action="delete" data-type="ticket" data-key="${ticket.ticketNumber}">حذف</button></td>
    `;

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

// إنشاء جدول التذاكر البسيط (للاستخدام في حالة عدم توفر التفاصيل)
function createTicketTable(ticketData) {
  const table = document.createElement('table');

  // إنشاء رأس الجدول
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>#</th>
      <th>رقم التذكرة</th>
      <th>اسم المسافر</th>
      <th>الحالة</th>
      <th>التاريخ</th>
      <th>الوصف</th>
    </tr>
  `;
  table.appendChild(thead);

  // إنشاء جسم الجدول
  const tbody = document.createElement('tbody');

  ticketData.forEach(ticket => {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${ticket.sequence}</td>
      <td style="font-weight: 600; color: #1565c0;">${ticket.ticketNumber}</td>
      <td style="text-align: right;">${ticket.name}</td>
      <td>
        <span style="padding: 4px 8px; border-radius: 4px; font-weight: 600; 
          background: ${ticket.status === 'O' ? '#e8f5e8' : '#ffebee'}; 
          color: ${ticket.status === 'O' ? '#2e7d32' : '#c62828'};">
          ${ticket.statusText}
        </span>
      </td>
      <td>${ticket.date}</td>
      <td style="text-align: right;">${ticket.description}</td>
    `;

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

// إنشاء جدول EMD
function createEMDTable(emdData) {
  const table = document.createElement('table');

  // إنشاء رأس الجدول
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>#</th>
      <th>رقم القسيمة</th>
      <th>اسم المسافر</th>
      <th>الحالة</th>
      <th>التاريخ</th>
      <th>الوصف</th>
    </tr>
  `;
  table.appendChild(thead);

  // إنشاء جسم الجدول
  const tbody = document.createElement('tbody');

  emdData.forEach(emd => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${emd.sequence}</td>
      <td style="font-weight: 600; color: #1565c0;">${emd.emdNumber}</td>
      <td style="text-align: right;" title="${emd.name}">${emd.name}</td>
      <td>
        <span style="padding: 4px 8px; border-radius: 4px; font-weight: 600; 
          background: ${emd.status.toLowerCase() === 'o' ? '#e8f5e8' : '#ffebee'}; 
          color: ${emd.status.toLowerCase() === 'o' ? '#2e7d32' : '#c62828'};">
          ${emd.statusText}
        </span>
      </td>
      <td>${emd.date}</td>
      <td style="text-align: right;" title="${emd.description}">${emd.description}</td>
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

// إنشاء جدول EMD المفصل
function createDetailedEMDTable(emdData) {
  const table = document.createElement('table');
  table.style.fontSize = '11px';

  // إنشاء رأس الجدول
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>#</th>
      <th>رقم القسيمة</th>
      <th>اسم المسافر</th>
      <th>القيمة</th>
      <th>المصدر الأصلي</th>
      <th>تاريخ الإصدار الأصلي</th>
      <th>حذف</th>
    </tr>
  `;
  table.appendChild(thead);

  // إنشاء جسم الجدول
  const tbody = document.createElement('tbody');

  emdData.forEach(emd => {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${emd.sequence}</td>
      <td style="font-weight: 600; color: #1565c0; white-space: nowrap;">${emd.emdNumber}</td>
      <td style="text-align: right; white-space: nowrap;" title="${emd.fullName || emd.name}">${emd.fullName || emd.name}</td>
      <td style="text-align: right; font-weight: 600; color: #1565c0;">${emd.value ? emd.value.toFixed(2) : '-'}</td>
      <td style="font-size: 10px; font-family: monospace; white-space: nowrap;" title="${emd.originalSource || '-'}">${emd.originalSource || '-'}</td>
      <td style="white-space: nowrap; font-weight: 500;">${emd.originalIssueDate || '-'}</td>
      <td><button class="btn btn-danger btn-small" data-action="delete" data-type="emd" data-key="${emd.emdNumber}">حذف</button></td>
    `;

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

// تحويل تاريخ بصيغة Amadeus (مثل 09NOV23 أو 11SEP) إلى مفتاح فرز زمني (ms)
function amadeusDateKey(s) {
  if (!s || typeof s !== 'string') return Number.MAX_SAFE_INTEGER;
  const str = s.trim().toUpperCase().replace(/\s+/g, '');
  const months = {
    JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11
  };
  // ddMMMyy
  let m = str.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (m) {
    const dd = parseInt(m[1],10);
    const mon = months[m[2]];
    const yy = 2000 + parseInt(m[3],10); // نفترض 20xx
    if (!isNaN(dd) && mon!=null) return Date.UTC(yy, mon, dd);
  }
  // ddMMM بدون سنة -> اعتبرها غير دقيقة وادفعها للنهاية
  m = str.match(/^(\d{2})([A-Z]{3})$/);
  if (m) {
    // يمكن افتراض السنة الحالية لك�� لعدم الإرباك نضعها في نهاية الترتيب
    return Number.MAX_SAFE_INTEGER - 1;
  }
  return Number.MAX_SAFE_INTEGER;
}

// عرض موحّد للتذاكر والقسائم
function renderCombinedResults() {
  const resultsContainer = document.getElementById('resultsContainer');
  if (!resultsContainer) return;

  const tickets = Array.isArray(currentTicketData) ? currentTicketData : [];
  const emds = Array.isArray(currentEMDData) ? currentEMDData : [];

  if (tickets.length === 0 && emds.length === 0) {
    resultsContainer.innerHTML = '';
    return;
  }

  // ملخص بسيط
  const totalTickets = tickets.length;
  const totalEMDs = emds.length;
  const totalAmount = tickets.reduce((s,t) => s + ((typeof t.total === 'number' ? t.total : t.fare) || 0), 0)
                     + emds.reduce((s,e) => s + (e.value || e.fare || 0), 0);
  const currencyHint = tickets[0]?.currency || emds[0]?.currency || 'SAR';

  const table = createCombinedTable(tickets, emds);

  let summaryHTML = `
    <div class="table-container"></div>
    <div class="summary-box" style="margin-top: 15px;">
      <div class="summary-item" style="display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; margin: 0;">
        <span>التذاكر: <strong>${totalTickets}</strong></span>
        <span>|</span>
        <span>القسائم: <strong>${totalEMDs}</strong></span>
        <span>|</span>
        <span>الإجمالي: <strong>${totalAmount.toFixed(2)} ${currencyHint}</strong></span>
      </div>
    </div>
  `;

  resultsContainer.innerHTML = summaryHTML;
  resultsContainer.querySelector('.table-container').appendChild(table);
}

// دالة لاستخراج التاريخ من المصدر الأصلي
function extractDateFromSource(source) {
  if (!source || typeof source !== 'string') return null;

  // أنماط مختلفة لاستخراج التاريخ من المصدر الأصلي
  // مثل: FO 065-6704142229AQI13NOV22/71210296/
  // أو: fo065-6704142229aqi13nov22/71210296/

  const patterns = [
    // نمط: FO 065-6704142229AQI13NOV22/71210296/
    /FO\s+\d{3}-\d+[A-Z]{3}(\d{2}[A-Z]{3}\d{2})\/\d+\//i,
    // نمط: fo065-6704142229aqi13nov22/71210296/
    /fo\d{3}-\d+[a-z]{3}(\d{2}[a-z]{3}\d{2})\/\d+\//i,
    // نمط عام للتواريخ بصيغة ddMMMyy
    /(\d{2}[A-Z]{3}\d{2})/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

function createCombinedTable(tickets, emds) {
  const table = document.createElement('table');
  table.style.fontSize = '12px';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>النوع</th>
      <th>الرقم</th>
      <th>اسم المسافر</th>
      <th>المبلغ</th>
      <th>المصدر الأصلي</th>
      <th>التاريخ</th>
      <th>حذف</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  // دمج القوائم مع علامة النوع
  const rows = [];
  for (const t of tickets) {
    const amount = (typeof t.total === 'number' ? t.total : t.fare) || null;
    const currency = t.currency || t.taxCurrency || '';
    // استخراج التاريخ من المصدر الأصلي بدلاً من التاريخ الأصلي
    const extractedDate = extractDateFromSource(t.originalSource);
    rows.push({
      type: 'تذكرة',
      number: t.ticketNumber,
      name: t.fullName || t.name || '-',
      amount: amount,
      currency,
      source: t.originalSource || '-',
      date: extractedDate || t.issueDate || t.date || '-',
      deleteType: 'ticket'
    });
  }
  for (const e of emds) {
    const amount = (e.value || e.fare || null);
    const currency = e.currency || e.fareCurrency || '';
    // استخراج التاريخ من المصدر الأصلي بدلاً من التاريخ الأصلي
    const extractedDate = extractDateFromSource(e.originalSource);
    rows.push({
      type: 'قسيمة',
      number: e.emdNumber,
      name: e.fullName || e.name || '-',
      amount: amount,
      currency,
      source: e.originalSource || '-',
      date: extractedDate || e.issueDate || e.originalIssueDate || e.date || '-',
      deleteType: 'emd'
    });
  }

  // ترتيب حسب الأقدم تاريخاً (باستخدام التاريخ المستخرج)
  rows.sort((a,b) => amadeusDateKey(a.date) - amadeusDateKey(b.date));

  // بناء الصفوف
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.type}</td>
      <td style="font-weight: 600; color: #1565c0; white-space: nowrap;">${r.number || '-'}</td>
      <td style="text-align: right; white-space: nowrap;" title="${r.name}">${r.name}</td>
      <td style="text-align: right; font-weight: 600; color: #1565c0;">${r.amount !== null ? (Number(r.amount).toFixed(2) + (r.currency ? ' ' + r.currency : '')) : '-'}</td>
      <td style="font-size: 10px; font-family: monospace; white-space: nowrap;" title="${r.source}">${r.source}</td>
      <td style="white-space: nowrap; font-weight: 600; color: #d32f2f;">${r.date}</td>
      <td><button class="btn btn-danger btn-small" data-action="delete" data-type="${r.deleteType}" data-key="${r.number}">حذف</button></td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  return table;
}

// تطبيق فلتر EMD
function applyEMDFilter() {
  const descriptionFilter = document.getElementById('descriptionFilter');
  const filterStats = document.getElementById('filterStats');

  if (!descriptionFilter || !filterStats || currentEMDData.length === 0) {
    console.log('⚠️ لا توجد بيانات للفلترة');
    return;
  }

  const filterValue = descriptionFilter.value;
  console.log(`🔍 تطبيق الفلتر: ${filterValue || 'الكل'}`);

  // فلترة البيانات
  let filteredData = currentEMDData;

  if (filterValue) {
    filteredData = currentEMDData.filter(emd => 
      emd.description.toUpperCase().includes(filterValue.toUpperCase())
    );
  }

  console.log(`📊 عدد النتائج بعد الفلترة: ${filteredData.length} من ${currentEMDData.length}`);

  // تحديث إحصائيات الفلتر
  filterStats.textContent = `عرض ${filteredData.length} من ${currentEMDData.length} قسيمة`;

  // إعادة عرض النتائج المفلترة
  const resultsContainer = document.getElementById('resultsContainer');
  if (!resultsContainer) return;

  const uniquePassengers = new Set(filteredData.map(emd => emd.name)).size;
  let summaryHTML = `
    <div class="summary-box">
      <h4>📊 ملخص النتائج المفلترة:</h4>
      <div class="summary-item">🎫 عدد القسائم: <strong>${filteredData.length}</strong></div>
      <div class="summary-item">👥 عدد المسافرين: <strong>${uniquePassengers}</strong></div>
      <div class="summary-item">📅 أحدث قسيمة: <strong>${filteredData[0]?.date || 'غير محدد'}</strong></div>
      <div class="summary-item">📅 أقدم قسيمة: <strong>${filteredData[filteredData.length - 1]?.date || 'غير محدد'}</strong></div>
    </div>
  `;

  if (filteredData.length > 0) {
    const table = createEMDTable(filteredData);
    summaryHTML += '<div class="table-container"></div>';
    resultsContainer.innerHTML = summaryHTML;
    resultsContainer.querySelector('.table-container').appendChild(table);
  } else {
    resultsContainer.innerHTML = summaryHTML + '<div class="no-results">⚠️ لا توجد نتائج تطابق الفلتر المحدد</div>';
  }
}
