// Amadeus Ticket Extractor - Background Script للنافذة المنفصلة
console.log('🔧 تم تحميل Background Script للنافذة المنفصلة');

// متغير لتتبع النافذة الحالية
let currentWindow = null;

// مستمع للنقر على أيقونة الإضافة
chrome.action.onClicked.addListener(async (tab) => {
  console.log('🖱️ تم النقر على أيقونة الإضافة');

  try {
    // إذا كانت النافذة مفتوحة بالفعل، ركز عليها
    if (currentWindow && !currentWindow.closed) {
      console.log('🔍 النافذة مفتوحة بالفعل، جاري التركيز عليها');
      await chrome.windows.update(currentWindow.id, { focused: true });
      return;
    }

    // إنشاء نافذة جديدة بحجم مناسب
    const window = await chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 1200,
      height: 800,
      left: 100,
      top: 100,
      focused: true
    });

    // حفظ معرف النافذة للاستخدام المستقبلي
    currentWindow = window;
    console.log('✅ تم إنشاء النافذة المنفصلة بنجاح');

    // مستمع لإغلاق النافذة
    const onWindowClosed = (windowId) => {
      if (windowId === window.id) {
        console.log('🔒 تم إغلاق النافذة المنفصلة');
        currentWindow = null;
        chrome.windows.onRemoved.removeListener(onWindowClosed);
      }
    };

    // مراقبة إغلاق النافذة
    chrome.windows.onRemoved.addListener(onWindowClosed);

  } catch (error) {
    console.error('❌ خطأ في إنشاء النافذة المنفصلة:', error);
  }
});

// مستمع للرسائل من النوافذ المفتوحة
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 تم استلام رسالة في Background Script:', request);

  switch (request.action) {
    case 'getCurrentWindow':
      // إرسال معلومات النافذة الحالية
      sendResponse({
        success: true,
        windowId: currentWindow ? currentWindow.id : null,
        window: currentWindow
      });
      break;

    case 'closeCurrentWindow':
      // إغلاق النافذة الحالية
      if (currentWindow && !currentWindow.closed) {
        chrome.windows.remove(currentWindow.id, () => {
          currentWindow = null;
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false, error: 'لا توجد نافذة مفتوحة' });
      }
      return true; // للاستجابة غير المتزامنة

    default:
      sendResponse({ success: false, error: 'إجراء غير معروف' });
  }

  return true;
});

console.log('✅ Background Script جاهز للعمل');
