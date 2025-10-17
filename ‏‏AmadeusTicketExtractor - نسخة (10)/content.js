// Amadeus Ticket Extractor Content Script - نسخة محسّنة للأداء
console.log('🎫 Amadeus Ticket Extractor Content Script تم تحميله');

// متغيرات محسّنة للأداء
let lastCommandSent = null;
let lastCommandTime = null;
let lastBaselineResponses = {};
let lastCommandSeq = 0;

// تخزين مؤقت للعناصر المستخدمة بشكل متكرر
let cachedElements = new Map();
let performanceMetrics = {
  averageResponseTime: 0,
  totalCommands: 0,
  lastCommandTime: 0
};

// دالة للحصول على عنصر من التخزين المؤقت أو البحث عنه
function getCachedElement(selector) {
  if (cachedElements.has(selector)) {
    return cachedElements.get(selector);
  }

  const element = document.querySelector(selector);
  if (element) {
    cachedElements.set(selector, element);
  }
  return element;
}

// دالة لمسح التخزين المؤقت عند الحاجة
function clearElementCache() {
  cachedElements.clear();
}
function getAllResponseSelectors() {
  const nodes = Array.from(document.querySelectorAll(
    '[id^="tpl0_shellbridge_shellWindow_top_left_modeString_cmdResponse"], [id^="tpl0_shellbridge_shellWindow_top_left_modeString_commandResponse"]'
  ));
  const getNum = (id) => {
    const m = id.match(/(?:cmdResponse|commandResponse)(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
  };
  nodes.sort((a, b) => getNum(b.id) - getNum(a.id)); // الأعلى أولاً = الأحدث
  return nodes.map(n => `#${n.id}`);
}

function captureResponseSnapshot() {
  const snapshot = {};
  const selectors = getAllResponseSelectors();
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const t = el.textContent || el.innerText || '';
      snapshot[selector] = t.trim();
    }
  }
  return snapshot;
}

// مستمع الرسائل من popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 تم استلام رسالة:', request);

  switch (request.action) {
    case 'ping':
      // رسالة للتحقق من وجود content script
      sendResponse({ success: true, message: 'Content script جاهز' });
      break;
    case 'sendCommand':
      handleSendCommand(request.command).then(sendResponse);
      break;
    case 'getRawText':
      handleGetRawText().then(sendResponse);
      break;
    case 'waitForResponse':
      waitForMatchingResponse(request.options || {}).then(sendResponse);
      break;
    default:
      sendResponse({ success: false, error: 'إجراء غير معروف' });
  }

  return true; // للاستجابة غير المتزامنة
});

// إرسال أمر إلى Amadeus
async function handleSendCommand(command) {
  try {
    console.log('📤 إرسال الأمر:', command);

    // التقط لقطة من النتائج الحالية قبل الإرسال للمقارنة لاحقاً
    lastBaselineResponses = captureResponseSnapshot();
    lastCommandSeq++;

    // البحث عن مربع الإدخال في Amadeus
    const inputField = document.querySelector('#tpl0_shellbridge_shellWindow_top_left_modeString_cmdPromptInput');

    if (!inputField) {
      console.error('❌ لم يتم العثور على مربع الإدخال في Amadeus');
      return {
        success: false,
        error: 'لم يتم العثور على مربع الإدخال في Amadeus'
      };
    }

    // مسح المحتوى الحالي
    inputField.value = '';
    inputField.focus();

    // كتابة الأمر
    inputField.value = command;

    // إرسال أحداث الكتابة
    inputField.dispatchEvent(new Event('input', { bubbles: true }));
    inputField.dispatchEvent(new Event('change', { bubbles: true }));

    // انتظار قصير
    await new Promise(resolve => setTimeout(resolve, 100));

    // الضغط على Enter
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });

    inputField.dispatchEvent(enterEvent);

    // إرسال حدث keyup أيضاً
    const enterUpEvent = new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });

    inputField.dispatchEvent(enterUpEvent);

    // تسجيل آخر أمر تم إرساله
    lastCommandSent = command;
    lastCommandTime = Date.now();

    console.log('✅ تم إرسال الأمر بنجاح:', command);
    return {
      success: true,
      message: `تم إرسال الأمر: ${command}`
    };

  } catch (error) {
    console.error('❌ خطأ في إرسال الأمر:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// دالة مساعدة للتحقق من أن النص يطابق نوع الأمر
function isTextMatchingCommand(text, command) {
  if (!command) return true; // إذا لم يكن هناك أمر محدد، قبول أي نص
  
  // التحقق من نوع الأمر
  if (command.startsWith('ewd/phone-')) {
    // أمر البحث عن القسائم - يجب أن يحتوي النص على قائمة بالشكل:
    // 1  0654223822758  ALANZI/HELAL MR  O 09SEP25 D/99I RESIDUAL VALUE
    // يجب أن يبدأ السطر برقم متسلسل ثم رقم القسيمة (13 رقم)
    // ويجب ألا يبدأ بـ EMD- (لأن هذا يعني تفاصيل قسيمة واحدة)
    if (text.trim().startsWith('EMD-')) {
      console.log('⚠️ النص يبدأ بـ EMD- وهو تفاصيل قسيمة واحدة، ليس قائمة');
      return false; // هذا تفاصيل قسيمة واحدة، ليس قائمة
    }
    // التحقق من وجود نمط القائمة: رقم متسلسل + رقم قسيمة + اسم + حالة + تاريخ
    return /^\s*\d+\s+\d{13}\s+[A-Z\/\s]+\s+[OC]\s+\d{2}[A-Z]{3}\d{2}/m.test(text);
  } else if (command.startsWith('ewd/')) {
    // أمر جلب تفاصيل قسيمة - يجب أن يحتوي على EMD- في البداية أو تفاصيل القسيمة
    return text.trim().startsWith('EMD-') || text.includes('RFIC') || text.includes('RFISC') || text.includes('TYPE-');
  } else if (command.startsWith('twd/org') || command.startsWith('twd/phone-')) {
    // أمر البحث عن التذاكر - يجب أن يحتوي على قائمة تذاكر
    if (text.trim().startsWith('TKT-')) {
      return false; // هذا تفاصيل تذكرة واحدة، ليس قائمة
    }
    return /^\s*\d+\s+\d{13}/m.test(text);
  } else if (command.startsWith('twd/')) {
    // أمر جلب تفاصيل تذكرة
    return text.trim().startsWith('TKT-') || text.includes('FARE') || text.includes('TAX');
  }
  
  return true; // افتراضياً، قبول النص
}

// جلب النص الخام من آخر عملية
async function handleGetRawText() {
  try {
    console.log('📄 البحث الديناميكي عن آخر عملية...');
    console.log(`📝 آخر أمر تم إرساله: ${lastCommandSent} (منذ ${lastCommandTime ? Date.now() - lastCommandTime : 'غير معروف'}ms)`);

    let rawText = '';
    let lastResponseSelector = null;
    let foundSelectors = [];

    // البحث عن جميع المحددات التي تحتوي على نص (من الأحدث إلى الأقدم)
    const dynamicSelectors = getAllResponseSelectors();

    // فحص جميع المحددات وجمع التي تحتوي على نص
    for (let i = 0; i < dynamicSelectors.length; i++) {
      const selector = dynamicSelectors[i];
      const element = document.querySelector(selector);

      if (element) {
        const text = element.textContent || element.innerText || '';
        if (text.trim()) {
          // استخدام رقم المحدد كمؤشر للحداثة (الأرقام الأعلى = أحدث)
          const selectorNumber = parseInt(selector.match(/(?:cmdResponse|commandResponse)(\d+)/)?.[1] || '0');

          // التحقق من أن النص تم تحديثه مؤخراً (إذا كان لدينا آخر أمر)
          let isRecent = true;
          if (lastCommandTime) {
            const timeSinceCommand = Date.now() - lastCommandTime;
            // إذا مر أكثر من 30 ثانية على الأمر، قد يكون النص قديماً
            isRecent = timeSinceCommand < 30000;
          }

          // التحقق من أن النص يطابق نوع الأمر المرسل
          const trimmed = text.trim();
          const matchesCommand = isTextMatchingCommand(trimmed, lastCommandSent);

          // التحقق من أن النص جديد مقارنةً بلقطة ما قبل الإرسال
          const baselineText = lastBaselineResponses ? lastBaselineResponses[selector] : undefined;
          const isNew = baselineText === undefined ? true : baselineText !== trimmed;

          foundSelectors.push({
            selector: selector,
            text: trimmed,
            selectorNumber: selectorNumber,
            length: trimmed.length,
            isRecent: isRecent,
            isNew: isNew,
            matchesCommand: matchesCommand
          });

          // عرض بداية النص للتشخيص
          const textPreview = trimmed.substring(0, 80).replace(/\n/g, ' ');
          console.log(`📋 وجد نص في ${selector} (رقم: ${selectorNumber}, طول: ${trimmed.length}, جديد: ${isNew}, حديث: ${isRecent}, يطابق الأمر: ${matchesCommand})`);
          console.log(`   📝 بداية النص: "${textPreview}..."`);
        }
      }
    }

    // ترتيب المحددات حسب الأولوية:
    // 1. النصوص التي تطابق الأمر والحديثة
    // 2. النصوص التي تطابق الأمر (حتى لو قديمة)
    // 3. النصوص الحديثة (حتى لو لا تطابق)
    // 4. أي نصوص أخرى (حسب رقم المحدد)
    foundSelectors.sort((a, b) => {
      // 1) نصوص تطابق الأمر وهي جديدة مقارنة باللقطة
      if (a.matchesCommand && a.isNew && !(b.matchesCommand && b.isNew)) return -1;
      if (b.matchesCommand && b.isNew && !(a.matchesCommand && a.isNew)) return 1;

      // 2) النصوص الجديدة
      if (a.isNew && !b.isNew) return -1;
      if (b.isNew && !a.isNew) return 1;

      // 3) نصوص تطابق الأمر وحديثة
      if (a.matchesCommand && a.isRecent && !(b.matchesCommand && b.isRecent)) return -1;
      if (b.matchesCommand && b.isRecent && !(a.matchesCommand && a.isRecent)) return 1;
      
      // 4) النصوص التي تطابق الأمر
      if (a.matchesCommand && !b.matchesCommand) return -1;
      if (b.matchesCommand && !a.matchesCommand) return 1;
      
      // 5) النصوص الحديثة
      if (a.isRecent && !b.isRecent) return -1;
      if (b.isRecent && !a.isRecent) return 1;
      
      // 6) أخيراً، حسب رقم المحدد (الأعلى = الأحدث)
      return b.selectorNumber - a.selectorNumber;
    });

    // إذا وجدنا محددات تحتوي على نص
    if (foundSelectors.length > 0) {
      // إذا كان الأمر أمر قائمة، اختر أحدث مقطع واحد فقط (لا دمج)
      const isListCmd = typeof lastCommandSent === 'string' && (lastCommandSent.startsWith('twd/org') || lastCommandSent.startsWith('twd/phone-') || lastCommandSent.startsWith('ewd/phone-'));
      if (isListCmd) {
        const latestResponse = foundSelectors[0];
        rawText = latestResponse.text;
        lastResponseSelector = latestResponse.selector;
        console.log(`🎯 اختيار أحدث مقطع للقائمة من: ${lastResponseSelector} (رقم: ${latestResponse.selectorNumber}, طول: ${latestResponse.length})`);
        console.log(`   - يطابق الأمر: ${latestResponse.matchesCommand}`);
        console.log(`   - جديد: ${latestResponse.isNew}`);
        console.log(`   - حديث: ${latestResponse.isRecent}`);
      }

      // في حال عدم الدمج (تفاصيل/لم ينتج نص)، اختر الأول وفق الأولوية
      if (!rawText) {
        const latestResponse = foundSelectors[0];
        rawText = latestResponse.text;
        lastResponseSelector = latestResponse.selector;

        console.log(`✅ تم العثور على ${foundSelectors.length} عملية`);
        console.log(`🎯 اختيار العملية في: ${lastResponseSelector} (رقم: ${latestResponse.selectorNumber}, طول: ${latestResponse.length})`);
        console.log(`   - يطابق الأمر: ${latestResponse.matchesCommand}`);
        console.log(`   - حديث: ${latestResponse.isRecent}`);
        
        // تحذير إذا كان النص لا يطابق الأمر
        if (!latestResponse.matchesCommand && lastCommandSent) {
          console.warn(`⚠️ تحذير: النص المجلوب قد لا يطابق الأمر المرسل (${lastCommandSent})`);
        }
        
        // تحذير إذا ك��ن النص قد يكون قديماً
        if (!latestResponse.isRecent) {
          console.warn('⚠️ تحذير: النص المجلوب قد يكون من عملية قديمة (مر أكثر من 30 ثانية على آخر أمر)');
        }
      }
    }

    // إذا لم نجد نص في المحددات الديناميكية، ابحث في العناصر الأخرى
    if (!rawText) {
      console.log('⚠️ لم يتم العثور على نص في المحددات الديناميكية، البحث في العناصر الأخرى...');

      // البحث في آخر عنصر pre code
      const preCodeElements = document.querySelectorAll('pre code');
      if (preCodeElements.length > 0) {
        const lastPreCode = preCodeElements[preCodeElements.length - 1];
        const text = lastPreCode.textContent || lastPreCode.innerText || '';
        if (text.trim()) {
          rawText = text.trim();
          lastResponseSelector = `pre code (آخر عنصر)`;
          console.log('✅ تم العثور على نص في آخر عنصر pre code');
        }
      }
    }

    // إذا لم نجد نص بعد، ابحث في آخر عنصر pre
    if (!rawText) {
      const preElements = document.querySelectorAll('pre');
      if (preElements.length > 0) {
        const lastPre = preElements[preElements.length - 1];
        if (!lastPre.querySelector('code')) {
          const text = lastPre.textContent || lastPre.innerText || '';
          if (text.trim()) {
            rawText = text.trim();
            lastResponseSelector = `pre (آخر عنصر)`;
            console.log('✅ تم العثور على نص في آخر عنصر pre');
          }
        }
      }
    }

    if (!rawText) {
      console.log('⚠️ لم يتم العثور على أي نص في أي عملية');
      return {
        success: false,
        error: 'لم يتم العثور على أي نص في أي عملية',
        lastCommand: lastCommandSent,
        lastCommandTime: lastCommandTime
      };
    }

    console.log('✅ تم جلب النص الخام من آخر عملية بنجاح');
    console.log(`📝 آخر أمر تم إرساله: ${lastCommandSent}`);
    
    return {
      success: true,
      data: rawText,
      rawText: rawText,
      selector: lastResponseSelector,
      totalFound: foundSelectors.length,
      lastCommand: lastCommandSent,
      lastCommandTime: lastCommandTime,
      message: `تم جلب النص الخام من آخر عملية: ${lastResponseSelector}`
    };

  } catch (error) {
    console.error('❌ خطأ في جلب النص الخام:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// الانتظار حتى ظهور نتيجة جديدة مطابقة للأمر الأخير
async function waitForMatchingResponse(options = {}) {
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 5000; // تقليل من 8 إلى 5 ثواني
  const pollMs = typeof options.pollMs === 'number' ? options.pollMs : 150; // تقليل من 200 إلى 150 مللي ثانية
  const start = Date.now();

  // إذا لم تكن لدينا لقطة أساس، التقط الحالية لتجنّب قراءة قديم
  if (!lastBaselineResponses || Object.keys(lastBaselineResponses).length === 0) {
    lastBaselineResponses = captureResponseSnapshot();
  }

  const isListCmd = typeof lastCommandSent === 'string' && (lastCommandSent.startsWith('twd/org') || lastCommandSent.startsWith('twd/phone-') || lastCommandSent.startsWith('ewd/phone-'));

  let lastCandidate = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const selectors = getAllResponseSelectors();
      const candidates = [];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const text = (el.textContent || el.innerText || '').trim();
        if (!text) continue;

        const baselineText = lastBaselineResponses ? lastBaselineResponses[selector] : undefined;
        const isNew = baselineText === undefined ? true : baselineText !== text;
        const matchesCommand = isTextMatchingCommand(text, lastCommandSent);
        const selectorNumber = parseInt(selector.match(/(?:cmdResponse|commandResponse)(\d+)/)?.[1] || '0');

        if (matchesCommand && isNew) {
          candidates.push({ selector, text, selectorNumber });
        }
      }

      if (candidates.length > 0) {
        // الأحدث أولاً
        candidates.sort((a, b) => b.selectorNumber - a.selectorNumber);
        const chosen = candidates[0];
        lastCandidate = chosen;
        return {
          success: true,
          data: chosen.text,
          rawText: chosen.text,
          selector: chosen.selector,
          lastCommand: lastCommandSent,
          lastCommandTime: lastCommandTime,
          message: `تم التقاط نتيجة جديدة مطابقة: ${chosen.selector}`
        };
      }

    } catch (e) {
      // تجاهل الأخطاء المؤقتة أثناء الاستطلاع
    }

    await new Promise(r => setTimeout(r, pollMs));
  }

  return {
    success: false,
    timeout: true,
    error: 'انتهت مهلة الانتظار دون ظهور نتيجة جديدة',
    lastCandidate: lastCandidate ? { selector: lastCandidate.selector, length: lastCandidate.text.length } : null,
    lastCommand: lastCommandSent
  };
}

console.log('✅ Content Script جاهز للاستخدام');
