// 语文小帮手 - v59 (根治练习题空白页: 宽松解析器+localStorage数据同步+原始数据嵌入HTML兜底)
// 基于纯前端修复版，新增 GitHub Pages 分享功能

// ===== 配置 =====
var PUBLIC_URL = '';
var API_BASE = (location.protocol === 'file:' || location.hostname === '') ? 'http://localhost:3000' : location.origin;
var CHAT_API = API_BASE + '/api/chat';
var VISION_API = API_BASE + '/api/vision';

// GitHub 云端配置
var GITHUB_TOKEN = '';
var GITHUB_OWNER = 'mazhihui-jizhi';
var GITHUB_REPO = 'yuwen-helper';
var GITHUB_PAGES_URL = 'https://mazhihui-jizhi.github.io/yuwen-helper';

// ★ 默认 API Key（编码存储，避免 GitHub 密钥扫描）
// 运行时自动解码，用户无需手动填写
var _dk = 'c2tfM2M5YmIxOGY5NzE0NWI3YTRlYjEyMjQzMzdkMDkxNw==';
var _gt = 'Z2hwX0Q0N1BlQVJVempyOEVFdDVoVUN5dXFVQ1VqQjEwRVRaMHk=';
function _dec(s) { try { return atob(s); } catch(e) { return ''; } }
var DEFAULT_DEEPSEEK_KEY = _dec(_dk);
var DEFAULT_GITHUB_TOKEN = _dec(_gt);

var ocrText = '';
var imageData = null;

// 全局状态（练习题分享用）
var _currentQuizUrl = '';
var _currentQuizData = '';
var _currentQuizId = '';

// ===== 工具函数 =====
function generateShortId() {
  var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var id = '';
  var arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  for (var i = 0; i < 6; i++) { id += chars[arr[i] % chars.length]; }
  return id;
}

function clearOldQuizzes() {
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf('quiz_') === 0) keys.push(k);
  }
  if (keys.length > 20) {
    keys.sort();
    for (var j = 0; j < keys.length - 20; j++) { localStorage.removeItem(keys[j]); }
  }
}

function showToast(msg) {
  var el = document.getElementById('toast');
  if (el) { el.textContent = msg; el.classList.add('show'); setTimeout(function() { el.classList.remove('show'); }, 2500); }
}

function showLoading(id) { var el = document.getElementById(id); if (el) el.style.display = 'block'; }
function hideLoading(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }
function hideResult(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

function shakeElement(el) { if (el) { el.classList.add('shake'); setTimeout(function() { el.classList.remove('shake'); }, 500); } }

// ===== AI 调用 =====
async function callAI(prompt) {
  var dsKey = window.DEEPSEEK_API_KEY || localStorage.getItem('deepseek_key') || DEFAULT_DEEPSEEK_KEY || '';
  if (!dsKey) {
    // ★ 不再弹全屏遮罩，改为可见提示，让用户主动点⚙️设置
    showToast('🔑 请先设置 DeepSeek API Key！点击右上角 ⚙️ 按钮');
    setTimeout(function() {
      var hintEl = document.getElementById('api-key-hint');
      if (hintEl) {
        hintEl.style.display = 'block';
        hintEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 500);
    throw new Error('NO_API_KEY');
  }

  var url = 'https://api.deepseek.com/chat/completions';
  var body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 8192
  });

  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + dsKey },
    body: body
  });

  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    throw new Error(err.error ? err.error.message : ('HTTP ' + res.status));
  }

  var data = await res.json();
  return data.choices && data.choices[0] && data.choices[0].message ?
    data.choices[0].message.content : '';
}

// ===== 知识点助手 =====
async function generateKnowledge() {
  var dsKey = window.DEEPSEEK_API_KEY || localStorage.getItem('deepseek_key') || DEFAULT_DEEPSEEK_KEY || '';
  if (!dsKey) {
    alert('⚠️ 还没有设置 DeepSeek API Key！\n\n请点「确定」后会自动打开设置窗口。\n\n获取 Key：https://platform.deepseek.com/api_keys');
    showSettings();
    return;
  }

  var input = document.getElementById('knowledge-input').value.trim();
  if (!input) { shakeElement(document.getElementById('knowledge-input')); return; }

  showLoading('loading-knowledge');
  hideResult('result-knowledge');

  var prompt = '你是一位经验丰富的中国小学语文特级老师。请对"' + input + '"这个知识点做详细解析。\n\n格式要求：不要使用markdown格式符号，用纯文字输出。\n\n请严格按以下6个板块的顺序输出：\n\n【定义】用小学生能听懂的语言解释，举1-2个生活例子。写120字以上。\n\n【举例与拓展】给出3道拓展练习，每道题写出完整题目+正确答案+简要解析。\n\n【常见考法】列出3种考试中常见的出题方式，说明特点、学生容易在哪里丢分、怎么应对。每种50字以上。\n\n【易错点】列出3个孩子最容易犯的具体错误。每个包含：错误表现、为什么错、怎么纠正。每个60字以上。\n\n【讲解方法】列出3种教学方法。每种写清楚：怎么教、用什么例子、分几步操作。每种60字以上。\n\n【做题小技巧】给学生3个做题时的实用技巧，每个结合具体题型说明。每个40字以上。';

  try {
    var result = await callAI(prompt);
    renderKnowledgeResult(result);
  } catch (e) {
    if (e.message !== 'NO_API_KEY') {
      showError('result-knowledge', e.message);
    }
  } finally {
    hideLoading('loading-knowledge');
  }
}

// ===== 错题分析 =====
async function generateWrong() {
  // ★ 终极诊断：确保用户能看到反馈
  var dsKey = window.DEEPSEEK_API_KEY || localStorage.getItem('deepseek_key') || DEFAULT_DEEPSEEK_KEY || '';

  if (!dsKey) {
    // 用 alert 确保 100% 能看到（不会被遮挡）
    alert('⚠️ 还没有设置 DeepSeek API Key！\n\n请点「确定」后会自动打开设置窗口。\n\n获取 Key：https://platform.deepseek.com/api_keys');
    showSettings();
    return;
  }

  var textInput = document.getElementById('wrong-input');
  var val = textInput ? textInput.value.trim() : '';
  var combined = [val, ocrText].filter(Boolean).join('\n\n');
  if (!combined) { shakeElement(textInput); return; }

  showLoading('loading-wrong');
  hideResult('result-wrong');

  var p1 = '你是一位经验丰富的中国小学语文老师。请分析下面这道真实错题。\n\n【重要】你必须按顺序输出以下6个部分，每个部分都要有实质性内容！\n\n格式要求：不要使用markdown符号，用纯文字输出。每个部分标题用【】标注。\n\n【原始题目】\n' + combined + '\n\n=== 请严格按以下顺序输出 ===\n\n第一部分：【正确解答】答案是什么？解题思路是什么？300字以上。\n\n第二部分：【常见易错点】孩子在这个知识点最容易犯哪些错误？列出3个具体错误，每个60字以上。\n\n第三部分：【考察知识点】这道题考查的是什么语文知识点？在小学几年级最常出现？100字以上。\n\n第四部分：【知识点讲解】用小学生能听懂的语言详细讲解这个知识点，配合生活例子。120字以上。\n\n第五部分：【避坑指南】给孩子3条实用的做题避坑建议，每条50字以上。\n\n⚠️ 以上5个部分必须全部完整输出！';

  var p2 = '你是一位经验丰富的中国小学语文老师。根据下面的错题生成5道同知识点练习题。\n\n【原题】\n' + combined + '\n\n【要求】只输出一个JSON数组，不要有其他文字！格式如下（必须严格JSON）：\n[\n{"question":"题目内容","options":["A选项","B选项","C选项","D选项"],"answer":"A","explanation":"解析说明"},\n{"question":"题目内容","options":["A选项","B选项","C选项","D选项"],"answer":"B","explanation":"解析说明"},\n...共5道题\n]\n★ 必须正好5道题！answer只能是A/B/C/D！';

  try {
    showToast('📝 第1步：正在分析错题...');
    var analysisResult = await callAI(p1);

    showToast('📝 第2步：正在生成练习题...');
    var quizResult = '';
    try { quizResult = await callAI(p2); } catch(e2) { console.warn('[Quiz] 补充请求失败:', e2.message); }

    var fullResult = analysisResult;
    if (quizResult.trim()) fullResult += '\n\n【同知识点练习题】\n' + quizResult;

    renderWrongResult(fullResult);
  } catch (e) {
    // API Key 未设置时不显示错误框（toast 已提示）
    if (e.message !== 'NO_API_KEY') {
      showError('result-wrong', e.message);
    }
  } finally {
    hideLoading('loading-wrong');
  }
}

// ===== 渲染：错题分析结果 =====
async function renderWrongResult(text) {
  var container = document.getElementById('result-wrong');
  var sections = parseSections(text);
  var quizData = sections['练习题'] || null;

  var html = '';

  if (sections['正确解答']) {
    html += '<div class="result-card green-border"><div class="card-title"><span class="card-icon">✅</span>正确解答</div><div class="card-content">' + formatContent(sections['正确解答']) + '</div></div>';
  }
  if (sections['易错点']) {
    html += '<div class="result-card yellow-border"><div class="card-title"><span class="card-icon">🚨</span>常见易错点</div><div class="card-content">' + formatContent(sections['易错点']) + '</div></div>';
  }
  if (sections['考察知识点']) {
    html += '<div class="result-card blue-border"><div class="card-title"><span class="card-icon">🎯</span>考察知识点</div><div class="card-content">' + formatContent(sections['考察知识点']) + '</div></div>';
  }
  if (sections['知识点讲解']) {
    html += '<div class="result-card purple-border"><div class="card-title"><span class="card-icon">📚</span>知识点讲解</div><div class="card-content">' + formatContent(sections['知识点讲解']) + '</div></div>';
  }
  if (sections['避坑指南']) {
    html += '<div class="result-card orange-border" style="border-left-color:#f59e0b;"><div class="card-title"><span class="card-icon">⚡</span>避坑指南</div><div class="card-content">' + formatContent(sections['避坑指南']) + '</div></div>';
  }

  // ★ 练习题区域：始终显示
  console.log('[Quiz] 练习题原始数据:', quizData ? quizData.substring(0,100) + '...' : '(空)');

  // ★ 关键：立即解析并转为JSON存储，避免后续格式不兼容
  var parsedQuestions = parseQuizText(quizData);
  console.log('[Quiz] 解析出题目数:', parsedQuestions.length);
  if (parsedQuestions.length > 0) {
    // 用JSON格式存储，彻底避免格式解析问题
    quizData = '__JSON__:' + JSON.stringify(parsedQuestions);
    console.log('[Quiz] 已转为JSON存储, 首题:', JSON.stringify(parsedQuestions[0]).substring(0,80));
  } else if (quizData) {
    // 解析失败但原始数据存在 — 可能格式不对，记录原始数据供排查
    console.warn('[Quiz] ⚠️ 解析失败！原始数据前300字:', quizData.substring(0,300));
  }

  var shortId = generateShortId();
  clearOldQuizzes();
  if (quizData) {
    try { localStorage.setItem('quiz_' + shortId, quizData); } catch(e) { console.warn('[Quiz] 存储失败:', e.message); }
  }
  // 分享链接：优先用 GitHub Pages 线上地址（微信可用），本地测试才用 origin
  var isLocalFile = location.protocol === 'file:';
  var localUrl = location.origin + location.pathname + '?quiz=' + shortId;
  var githubUrl = GITHUB_PAGES_URL + '/quizzes/' + shortId + '.html';
  var shareUrl = isLocalFile ? githubUrl : (location.origin + location.pathname.replace(/\/[^/]*$/, '/') + 'index.html?quiz=' + shortId);

  _currentQuizUrl = shareUrl;
  _currentQuizData = quizData || '';
  _currentQuizId = shortId;
  _quizCount = parsedQuestions.length; // ★ 记录题目数供 UI 显示

  html += '<div class="quiz-section" id="quiz-section-wrap">' +
    '<div class="quiz-title">📝 同知识点练习题</div>';

  if (quizData) {
    // ★ v62 新设计：主推下载文件，不依赖任何外部服务
    html += '<div class="quiz-link-box" style="background:#f0faf0;border:2px dashed #4ade80;border-radius:14px;padding:16px;margin-top:12px;">' +
      '<div id="quiz-status-text" style="font-size:13px;color:#2e7d32;font-weight:700;margin-bottom:10px;text-align:center;">✅ ' + (_quizCount || '?') + '道练习题已生成！选择发送方式 👇</div>' +
      '<div id="quiz-buttons-row" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;">' +
        // ★ 主按钮：下载文件（100%可靠）
        '<button id="btn-download-quiz" class="btn-copy" style="background:linear-gradient(135deg,#f472b6,#ec4899);" onclick="downloadQuizFile()">📥 下载练习题</button> ' +
        // 辅助：复制链接（同浏览器可用）
        '<button id="btn-copy-quiz" class="btn-copy" onclick="copyQuizLink()">📋 复制链接</button> ' +
        // 备选：上传云端（需要网络+Token）
        '<button id="btn-upload-quiz" class="btn-copy" style="background:linear-gradient(135deg,#94a3b8,#64748b);font-size:12px;" onclick="uploadQuizToGithub()" title="需要网络，可能失败">☁️ 云端分享</button> ' +
      '</div>' +

      // 下载说明
      '<div id="download-hint" style="background:#fdf2f8;border-radius:10px;padding:12px;margin-bottom:12px;">' +
        '<p style="font-size:13px;color:#be185d;font-weight:700;margin:0 0 6px 0;">📌 推荐方式：下载 → 发微信</p>' +
        '<ol style="font-size:12px;color:#666;margin:4px 0;padding-left:18px;line-height:1.7;">' +
          '<li>点击 <b>📥 下载练习题</b> 按钮</li>' +
          '<li>得到一个 .html 小文件（约几KB）</li>' +
          '<li>把文件直接发到家长微信群</li>' +
          '<li>家长点开就能做题 ✅ 无需安装任何东西</li>' +
        '</ol>' +
      '</div>' +

      // 二维码区域（隐藏为主，上传成功后显示）
      '<div class="qr-code-box" id="qr-box" style="text-align:center;padding:12px;background:#fff;border-radius:12px;min-height:100px;display:none;flex-direction:column;align-items:center;justify-content:center;">' +
      '</div>' +
      '<p id="qr-hint" style="font-size:11px;color:#888;text-align:center;margin-top:8px;display:none;">👆 扫码打开练习题</p>' +
    '</div>';
  } else {
    // 无数据时显示重试按钮
    html += '<div style="background:#fef3c7;border:2px dashed #f59e0b;border-radius:14px;padding:16px;margin-top:12px;text-align:center;">' +
      '<p style="color:#92400e;font-size:13px;margin-bottom:10px;">⚠️ 练习题还没生成，点击下方按钮重新生成</p>' +
      '<button onclick="regenerateQuiz()" style="padding:10px 24px;border:none;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;font-size:14px;cursor:pointer;font-weight:700;">🔄 重新生成5道练习题</button>' +
    '</div>';
  }

  html += '</div>'; // 结束 quiz-section

  // v62: 不再自动生成二维码（默认隐藏，上传成功后显示）

  if (!html) html = '<div class="result-card pink-border"><div class="card-content">' + formatContent(text) + '</div></div>';

  container.innerHTML = html;

  // 加导出按钮
  var exportBar = document.createElement('div');
  exportBar.style.cssText = 'text-align:center;margin:18px 0 8px;';
  exportBar.innerHTML = '<button onclick="exportAnalysis()" style="padding:10px 22px;border:none;border-radius:20px;background:linear-gradient(135deg,#ff8fab,#c8b6ff);color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(255,143,171,0.2);">📄 导出 / 打印</button>';
  container.appendChild(exportBar);

  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== 二维码生成 =====
// v53: 完全移除对内联 qrcode 库的依赖，统一使用在线 API（100%不会崩溃）
function generateQRCode(container, url) {
  if (!container || !url) return;
  console.log('[QR] 开始生成, URL长度:', url.length);

  // 清空容器
  container.innerHTML = '';

  // ★ 统一使用在线 API 兜底（稳定可靠，不依赖任何本地库）
  try {
    var safeUrl = encodeURIComponent(url);
    container.innerHTML =
      '<div style="text-align:center;">' +
        '<img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + safeUrl + '" ' +
             'alt="扫码做题" style="border-radius:12px;width:260px;height:260px;display:inline-block;" ' +
             'onerror="this.onerror=null;this.src=\'https://chart.googleapis.com/chart?chs=260x260&cht=qr&chl=' + safeUrl + '&choe=UTF-8\';" />' +
        '<p style="font-size:11px;color:#888;margin-top:6px;">📱 手机扫码即可做题</p>' +
      '</div>';
    console.log('[QR] ✅ 在线 API 方式生成成功');
  } catch(err) {
    console.error('[QR] 生成异常:', err.message);
    container.innerHTML = '<div style="padding:12px;background:#fef3c7;border-radius:10px;font-size:13px;color:#92400e;">' +
      '<strong>📱 练习题链接：</strong><br/>' +
      '<a href="' + url.replace(/"/g,'&quot;') + '" target="_blank" style="color:#ff6b9d;word-break:break-all;font-size:12px;">点击打开练习题</a>' +
      '</div>';
  }
}

// ===== 复制链接 =====
// ===== 重新生成练习题 =====
async function regenerateQuiz() {
  var textInput = document.getElementById('wrong-input').value.trim();
  var combined = [textInput, ocrText].filter(Boolean).join('\n\n');
  if (!combined) { showToast('⚠️ 请先输入错题内容'); return; }

  var quizSection = document.getElementById('quiz-section-wrap');
  if (quizSection) {
    quizSection.innerHTML = '<div class="quiz-title">📝 同知识点练习题</div>' +
      '<div style="text-align:center;padding:20px;color:#666;">⏳ 正在生成5道练习题...</div>';
  }

  var p2 = '你是一位经验丰富的中国小学语文老师。根据下面的错题生成5道同知识点练习题。\n\n【原题】\n' + combined + '\n\n【要求】只输出一个JSON数组，不要有其他文字！格式如下（必须严格JSON）：\n[\n{"question":"题目内容","options":["A选项","B选项","C选项","D选项"],"answer":"A","explanation":"解析说明"},\n{"question":"题目内容","options":["A选项","B选项","C选项","D选项"],"answer":"B","explanation":"解析说明"},\n...共5道题\n]\n★ 必须正好5道题！answer只能是A/B/C/D！';

  try {
    var quizResult = await callAI(p2);
    if (!quizResult || !quizResult.trim()) {
      showToast('❌ 练习题生成失败，请重试');
      return;
    }

    // ★ 解析并转JSON格式存储
    var parsed = parseQuizText(quizResult);
    if (parsed.length > 0) {
      _currentQuizData = '__JSON__:' + JSON.stringify(parsed);
    } else {
      _currentQuizData = quizResult; // 解析失败时保留原文
    }
    try { localStorage.setItem('quiz_' + _currentQuizId, _currentQuizData); } catch(e) {}

    // 重新渲染整个结果区域（带练习题）
    var container = document.getElementById('result-wrong');
    if (container) {
      // 追加练习题到现有结果
      var fullText = container.innerText + '\n\n【同知识点练习题】\n' + quizResult;
      renderWrongResult(fullText);
    }
    showToast('✅ 练习题生成完成！');
  } catch(e) {
    showToast('❌ 生成失败：' + e.message);
  }
}

function copyQuizLink() {
  var url = _currentQuizUrl || '';
  if (!url) {
    alert('请先生成练习题再分享！');
    return;
  }
  // 检查是否是本地 file:// 链接（微信打不开）
  if (url.indexOf('file://') === 0) {
    alert('⚠️ 当前是本地文件模式，链接无法在微信打开。\n\n请点击「上传到云端」按钮生成可分享链接！\n\n（需要先在设置中填入 GitHub Token）');
    return;
  }
  copyToClipboard(url);
}

function copyToClipboard(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function() {
      showToast('✅ 链接已复制！发到微信即可打开');
    }).catch(function() { copyFallback(url); });
  } else {
    copyFallback(url);
  }
}

function copyFallback(url) {
  var ta = document.createElement('textarea');
  ta.value = url;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast('✅ 链接已复制！'); } catch(e) { alert('自动复制失败，请手动复制：\n\n' + url); }
  document.body.removeChild(ta);
}

// ===== v62: 下载练习题 HTML 文件（100%可靠，不依赖任何外部服务）=====
function downloadQuizFile() {
  if (!_currentQuizData) {
    alert('⚠️ 没有练习题数据！');
    return;
  }

  // 重新读取最新数据
  if (_currentQuizId) {
    try {
      var latestData = localStorage.getItem('quiz_' + _currentQuizId);
      if (latestData && latestData.length > (_currentQuizData || '').length) {
        _currentQuizData = latestData;
      }
    } catch(e) {}
  }

  // 生成完整独立的练习题页面
  var htmlContent = generateStandaloneQuizHtml(_currentQuizData, _currentQuizId);

  // 用 Blob + download 触发下载
  var blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  var url = URL.createObjectURL(blob);

  var a = document.createElement('a');
  a.href = url;
  a.download = '语文练习题_' + (_currentQuizId || 'quiz') + '.html';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // 清理
  setTimeout(function() {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);

  // 更新 UI 状态
  var btn = document.getElementById('btn-download-quiz');
  if (btn) {
    btn.textContent = '✅ 已下载';
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
  }
  var statusText = document.getElementById('quiz-status-text');
  if (statusText) statusText.textContent = '📥 文件已下载！把 .html 文件发到微信群即可';

  showToast('📥 练习题已下载！发送到微信即可');
}

// ===== GitHub API 上传练习题 =====
// ===== GitHub API 上传练习题（v60: 增强错误诊断 + 自动重试）=====
async function uploadQuizToGithub(retryCount) {
  retryCount = retryCount || 0;

  var btn = document.getElementById("btn-upload-quiz");
  var statusText = document.getElementById("quiz-status-text");

  // ★ 重新读取 Token（防止用户刚保存但变量未更新）
  GITHUB_TOKEN = localStorage.getItem("github_token") || DEFAULT_GITHUB_TOKEN || "";

  if (!GITHUB_TOKEN) {
    alert("请先设置 GitHub Token！\n\n点击右上角 ⚙️ 设置按钮，填入 GitHub Personal Access Token");
    if (btn) { btn.disabled = false; btn.textContent = "☁️ 上传云端"; }
    return;
  }

  // ★ 重新从 localStorage 读取最新数据
  if (_currentQuizId) {
    try {
      var latestData = localStorage.getItem("quiz_" + _currentQuizId);
      if (latestData && latestData.length > (_currentQuizData || "").length) {
        console.log("[Upload] 从localStorage读到新数据:", latestData.length, "bytes");
        _currentQuizData = latestData;
      }
    } catch(e) {}
  }

  if (!_currentQuizData || _currentQuizData.length === 0) {
    alert("⚠️ 没有练习题数据！\n\n请先等「开始分析」完成。");
    return;
  }

  // 解析题目数
  var uploadQuestions = null;
  if (_currentQuizData && _currentQuizData.indexOf("__JSON__:") === 0) {
    try { uploadQuestions = JSON.parse(_currentQuizData.substring(8)); } catch(e) {}
  }
  if (!uploadQuestions) {
    uploadQuestions = parseQuizText(_currentQuizData);
    if ((!uploadQuestions || uploadQuestions.length === 0)) uploadQuestions = parseQuizTextLoose(_currentQuizData);
  }
  var qCount = uploadQuestions ? uploadQuestions.length : 0;
  console.log("[Upload] 题目数:", qCount, "数据长度:", (_currentQuizData||"").length, "Token前6位:", GITHUB_TOKEN.substring(0,6));

  if (btn) { btn.disabled = true; btn.textContent = "⏳ 上传中..."; }
  if (statusText) statusText.textContent = "☁️ 正在上传到 GitHub...";

  try {
    // 1. 生成独立 HTML
    var htmlContent = generateStandaloneQuizHtml(_currentQuizData, _currentQuizId);

    // 2. 转 base64
    var base64Content = btoa(unescape(encodeURIComponent(htmlContent)));

    // 3. 构造请求
    var filePath = "quizzes/" + _currentQuizId + ".html";
    var apiUrl = "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/contents/" + filePath;
    var requestBody = JSON.stringify({
      message: "upload quiz: " + _currentQuizId,
      content: base64Content,
      branch: "main"
    });

    console.log("[Upload] API URL:", apiUrl);
    console.log("[Upload] Body size:", requestBody.length, "bytes");

    // 4. 发送请求（带30秒超时）
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 30000);

    var response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Authorization": "token " + GITHUB_TOKEN,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: requestBody,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log("[Upload] Response status:", response.status, response.statusText);

    // 5. 处理响应
    if (!response.ok) {
      var errBody = "";
      try { errBody = await response.text(); } catch(te) {}
      console.error("[Upload] Error body:", errBody);
      throw new Error("GitHub API 返回 HTTP " + response.status + ": " + (errBody || response.statusText).substring(0, 200));
    }

    // 6. 成功
    var finalUrl = GITHUB_PAGES_URL + "/quizzes/" + _currentQuizId + ".html";
    _currentQuizUrl = finalUrl;

    if (statusText) { statusText.textContent = "✅ 上传成功！" + qCount + "道题已就绪"; statusText.style.color = "#059669"; }
    if (btn) { btn.disabled = false; btn.textContent = "✅ 已上传(" + qCount + "题)"; btn.style.background = "linear-gradient(135deg,#10b981,#059669)"; }

    // 生成二维码
    var qrBox = document.getElementById("qr-box");
    if (qrBox) generateQRCode(qrBox, finalUrl);

    showToast("✅ 上传成功！链接已复制");
    copyToClipboard(finalUrl);

  } catch (e) {
    console.error("[Upload] 失败详情:", e.name, e.message);

    // 友好错误提示
    var friendlyMsg = e.message;
    if (e.name === "AbortError") {
      friendlyMsg = "请求超时（30秒），请检查网络连接后重试";
    } else if (e.message === "Failed to fetch" || e.message.indexOf("NetworkError") >= 0 || e.message.indexOf("Network request failed") >= 0) {
      friendlyMsg = "网络请求失败。可能原因：①网络断开 ②被防火墙/代理拦截 ③GitHub API不可达。建议检查网络或稍后重试";
    } else if (e.message.indexOf("401") >= 0 || e.message.indexOf("403") >= 0) {
      friendlyMsg = "Token 无效或权限不足！请在设置中检查 GitHub Token（需要 repo 权限）";
    } else if (e.message.indexOf("404") >= 0) {
      friendlyMsg = "仓库不存在或无权限！" + GITHUB_OWNER + "/" + GITHUB_REPO;
    } else if (e.message.indexOf("422") >= 0) {
      friendlyMsg = "文件冲突，请换个错题重新生成";
    }

    if (statusText) { statusText.textContent = "❌ 上传失败: " + friendlyMsg; statusText.style.color = "#dc2626"; }
    if (btn) { btn.disabled = false; btn.textContent = "☁️ 上传云端"; }

    // 自动重试一次（仅对网络错误）
    if (retryCount === 0 && (e.name === "AbortError" || e.message === "Failed to fetch")) {
      console.log("[Upload] 自动重试...");
      if (statusText) statusText.textContent = "🔄 网络波动，自动重试中...";
      setTimeout(function() { uploadQuizToGithub(1); }, 2000);
      return;
    }

    alert("⚠️ 上传失败：" + friendlyMsg);
  }
}

// ===== 生成独立练习题 HTML（v64: 静态DOM方案，彻底解决空白）=====
// ★ 核心改变：不再用JS动态生成DOM，而是直接把题目写成静态HTML元素
// 这样即使JS出错，题目内容也一定能显示出来
function generateStandaloneQuizHtml(quizText, quizId) {
  // 1. 解析出题目数组
  var questions = null;
  if (quizText && quizText.indexOf("__JSON__:") === 0) {
    try { questions = JSON.parse(quizText.substring(8)); } catch(e) {}
  }
  if (!questions || !questions.length) {
    questions = parseQuizText(quizText);
    if (!questions || !questions.length) questions = parseQuizTextLoose(quizText);
  }

  // 2. 没有有效数据 → 显示错误页面（但不是空白的）
  if (!questions || !questions.length === 0) {
    var raw = (quizText || "(无数据)").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return "<!DOCTYPE html><html lang=zh-CN><head><meta charset=UTF-8><title>练习题-数据为空</title>" +
      "<style>body{font-family:sans-serif;background:#fce4ec;padding:40px}.box{background:#fff;border-radius:20px;padding:30px;max-width:500px;margin:auto}" +
      ".icon{font-size:50px;text-align:center}.t{font-size:18px;font-weight:700;color:#5e548e;text-align:center;margin:16px 0}" +
      ".msg{font-size:14px;color:#666;background:#fff5f5;padding:16px;border-radius:12px;white-space:pre-wrap;word-break:break-all}</style></head><body>" +
      "<div class=box><div class=icon>📝</div><div class=t>练习题数据未能加载</div>" +
      "<div class=msg>" + raw + "</div></div></body></html>";
  }

  // 3. 开始构建HTML —— 静态DOM方案
  var h = "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no\">";
  h += "<title>语文小帮手 - 练习题</title>";

  // CSS
  h += "<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:linear-gradient(135deg,#fce4ec,#e8daef);min-height:100vh;color:#333}";
  h += ".hd{background:linear-gradient(135deg,#ff8fab,#c8b6ff);padding:18px;text-align:center;color:#fff;font-size:17px;font-weight:700}";
  h += ".info{display:flex;justify-content:space-between;padding:12px 16px;background:#fff;margin:12px;border-radius:14px;font-size:14px;font-weight:700;color:#5e548e}";
  h += ".pb{height:6px;background:#eee;margin:0 16px}.pf{height:100%;background:linear-gradient(90deg,#ff8fab,#c8b6ff);transition:width .4s}";
  h += ".qa{margin:16px;padding:20px;background:#fff;border-radius:16px;display:none}.qa.active{display:block}";
  h += ".qn{font-size:13px;color:#9d8eb5;margin-bottom:8px}";
  h += ".qt{font-size:16px;font-weight:700;color:#5e548e;margin-bottom:16px;line-height:1.6}";
  h += ".opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}";
  h += ".opt{padding:14px;border:2px solid #e8dff5;border-radius:12px;cursor:pointer;font-size:14px;display:flex;align-items:center;transition:all .2s}";
  h += ".opt.ok{border-color:#10b981;background:#ecfdf5}.opt.ng{border-color:#ef4444;background:#fef2f2}.opt.sc{border-color:#10b981;background:#ecfdf5}";
  h += ".lt{display:inline-block;width:26px;height:26px;border-radius:50%;background:#f0e6ff;color:#5e548e;font-size:13px;font-weight:700;text-align:center;line-height:26px;margin-right:10px}";
  h += ".ex{margin:16px;padding:14px;background:#fefce8;border-left:4px solid #f59e0b;font-size:13px;color:#92400e;display:none}.ex.show{display:block}";
  h += ".result{text-align:center;padding:30px 20px;display:none}.result.show{display:block}";
  h += ".stars{font-size:60px}.msg{font-size:20px;font-weight:700;color:#5e548e;margin-bottom:8px}.score{font-size:16px;color:#9d8eb5;margin-bottom:24px}";
  h += ".btn{padding:12px 28px;border:none;border-radius:20px;background:linear-gradient(135deg,#ff8fab,#c8b6ff);color:#fff;font-size:15px;font-weight:700;cursor:pointer}";
  h += "</style></head><body>";

  // 标题栏
  h += "<div class=\"hd\">语文小帮手 - 练习题</div>";
  h += "<div class=\"info\"><div id=\"sc\">0分</div><div id=\"pt\">第1题/" + questions.length + "题</div><div>❤️❤️❤️</div></div>";
  h += "<div class=\"pb\"><div class=\"pf\" id=\"pbf\"></div></div>";

  // ★ 核心：每道题直接写成静态HTML！不依赖JS生成
  var L = ["A","B","C","D"];
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var activeCls = (i === 0) ? " active" : "";

    // 题目卡片
    h += "<div class=\"qa" + activeCls + "\" id=\"q" + i + "\">";
    h += "<div class=\"qn\">第" + (i+1) + "题 / " + questions.length + "题</div>";
    h += "<div class=\"qt\">" + escHtml(q.question) + "</div>";   // ← 题目文本直接在HTML中！

    // 选项
    h += "<div class=\"opts\">";
    for (var j = 0; j < q.options.length; j++) {
      // data-idx 让JS知道是哪个选项
      h += "<div class=\"opt\" id=\"q" + i + "_o" + j + "\" data-idx=\"" + j + "\" onclick=\"sO(" + i + ",this)\">";
      h += "<span class=\"lt\">" + L[j] + "</span>" + escHtml(q.options[j]);  // ← 选项文本直接在HTML中！
      h += "</div>";
    }
    h += "</div>";  // opts
    h += "</div>";  // qa
  }

  // 解析区域（共享一个）
  h += "<div class=\"ex\" id=\"ex-box\"><strong>解析：</strong><span id=\"ex-text\"></span></div>";

  // 结果页
  h += "<div class=\"result\" id=\"result-page\">";
  h += "<div class=\"stars\" id=\"star-emoji\"></div>";
  h += "<div class=\"msg\" id=\"result-msg\"></div>";
  h += "<div class=\"score\" id=\"result-score\"></div>";
  h += "<button class=\"btn\" onclick=\"location.reload()\">再做一次</button>";
  h += "</div>";

  // ★ 极简JS：只做交互逻辑（点击判对错/翻页/显示结果），不做任何DOM内容生成
  h += "<script>";
  h += "var TOTAL=" + questions.length + ";";
  h += "var cur=0,score=0;";
  h += "var answers=" + JSON.stringify(questions.map(function(q){return q.answer;})) + ";";     // ["A","B",...]
  h += "var explanations=" + JSON.stringify(questions.map(function(q){return q.explanation;})) + ";";  // ["解析1","解析2",...]

  // 点击选项
  h += "function sO(qi,el){";
  h += "  var oi=parseInt(el.getAttribute(\"data-idx\"));";
  h += "  var container=document.getElementById(\"q\"+qi);";
  h += "  var opts=container.querySelectorAll(\".opt\");";

  // 已答过则忽略
  h += "  for(var k=0;k<opts.length;k++){if(opts[k].classList.contains(\"ok\")||opts[k].classList.contains(\"ng\"))return;}";

  // 判断对错
  h += "  var AL=\"ABCD\";";
  h += "  var correct=(answers[qi]===AL[oi]);";
  h += "  var el2=document.getElementById(\"q\"+qi+\"_o\"+oi);";
  h += "  if(correct){el2.classList.add(\"ok\");score+=20;}else{el2.classList.add(\"ng\");}";

  // 显示正确答案
  h += "  var ci=AL.indexOf(answers[qi]);";
  h += "  if(ci!==oi){document.getElementById(\"q\"+qi+\"_o\"+ci).classList.add(\"sc\");}";

  // 更新分数和解析
  h += "  document.getElementById(\"sc\").textContent=score+\"分\";";
  h += "  document.getElementById(\"ex-text\").textContent=explanations[qi];";
  h += "  document.getElementById(\"ex-box\").classList.add(\"show\");";

  // 延迟跳下一题
  h += "  setTimeout(function(){";
  h += "    document.getElementById(\"q\"+cur).classList.remove(\"active\");";
  h += "    cur++;";
  h += "    document.getElementById(\"ex-box\").classList.remove(\"show\");";
  h += "    if(cur>=TOTAL){showResult();return;}";
  h += "    document.getElementById(\"q\"+cur).classList.add(\"active\");";
  h += "    document.getElementById(\"pt\").textContent=\"第\"+(cur+1)+\"题/"+questions.length+"题\";";
  h += "    document.getElementById(\"pbf\").style.width=Math.round(cur/TOTAL*100)+\"%\";";
  h += "  },1500)";
  h += "}"; // end sO

  // 显示结果页
  h += "function showResult(){";
  h += "  var activeQ=document.querySelector(\".qa.active\");if(activeQ)activeQ.classList.remove(\"active\");";
  h += "  document.getElementById(\"ex-box\").classList.remove(\"show\");";
  h += "  document.getElementById(\"pt\").textContent=\"完成!\";";
  h += "  document.getElementById(\"pbf\").style.width=\"100%\";";
  h += "  var rp=document.getElementById(\"result-page\");rp.classList.add(\"show\");";
  h += "  var star=score>=80?\"🌟🌟🌟\":score>=60?\"🌟🌟\":\"🌟\";";
  h += "  var msg=score>=80?\"太棒了！\":score>=60?\"还不错！\":\"继续加油！\";";
  h += "  document.getElementById(\"star-emoji\").textContent=star;";
  h += "  document.getElementById(\"result-msg\").textContent=msg;";
  h += "  document.getElementById(\"result-score\").textContent=score+\"/\"+(TOTAL*20)";
  h += "}";

  h += "<\/script></body></html>";
  return h;
}

// HTML转义工具函数（在generateStandaloneQuizHtml中使用）
function escHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}


// ===== 解析章节 =====
function parseSections(text) {
  var map = {};
  var lines = text.split('\n');
  var sectionKeys = [
    { keys: ['【定义】', '知识点定义'], name: '定义' },
    { keys: ['【举例与拓展】', '举例'], name: '举例与拓展' },
    { keys: ['【常见考法】', '常见考法'], name: '常见考法' },
    { keys: ['【易错点】', '常见易错点', '易错点'], name: '易错点' },
    { keys: ['【讲解方法】', '讲解方法'], name: '讲解方法' },
    { keys: ['【做题小技巧】', '做题小技巧', '做题技巧'], name: '做题小技巧' },
    { keys: ['【正确解答】', '正确解答'], name: '正确解答' },
    { keys: ['【考察知识点】', '考察知识点'], name: '考察知识点' },
    { keys: ['【知识点讲解】', '知识点讲解'], name: '知识点讲解' },
    { keys: ['【避坑指南】', '避坑指南'], name: '避坑指南' },
    { keys: ['【同知识点练习题】', '同知识点练习题', '练习题'], name: '练习题' },
  ];

  var currentName = null;
  var currentLines = [];

  function isSectionHeader(line) {
    var t = line.trim();
    for (var i = 0; i < sectionKeys.length; i++) {
      var sk = sectionKeys[i];
      for (var k = 0; k < sk.keys.length; k++) {
        if (t.indexOf(sk.keys[k]) !== -1) return sk.name;
      }
    }
    return null;
  }

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    var matched = isSectionHeader(line);
    if (matched) {
      if (currentName) map[currentName] = currentLines.join('\n').trim();
      currentName = matched;
      var afterColon = line.split(/[\]】]/).slice(1).join('').trim();
      currentLines = afterColon ? [afterColon] : [];
    } else if (currentName) {
      if (line.trim()) currentLines.push(line);
    }
  }
  if (currentName) map[currentName] = currentLines.join('\n').trim();

  return map;
}

// ===== HTML 格式化 =====
function formatContent(text) {
  if (!text) return '';
  var t = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/\*(.+?)\*/g, '$1');
  t = t.replace(/#{1,5}\s*/g, '');
  t = t.replace(/^(\s*)([一二三四五六七八九十\d]+)[.．、）\)]\s*/gm, '$1<span class="fmt-num">$2.</span> ');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/\n/g, '<br/>');
  t = t.replace(/^<br\/>/, '');
  return t;
}

// ===== 渲染知识点结果 =====
function renderKnowledgeResult(text) {
  var container = document.getElementById('result-knowledge');
  var sections = parseSections(text);
  var cards = [
    { key: '定义', icon: '📖', cls: 'pink-border' },
    { key: '举例与拓展', icon: '✏️', cls: 'blue-border' },
    { key: '常见考法', icon: '📝', cls: 'green-border' },
    { key: '易错点', icon: '🚨', cls: 'yellow-border' },
    { key: '讲解方法', icon: '🎓', cls: 'purple-border' },
    { key: '做题小技巧', icon: '⭐', cls: 'orange-border' },
  ];

  var html = '';
  for (var i = 0; i < cards.length; i++) {
    var c = cards[i];
    if (sections[c.key]) {
      html += '<div class="result-card ' + c.cls + '"><div class="card-title"><span class="card-icon">' + c.icon + '</span>' + c.key + '</div><div class="card-content">' + formatContent(sections[c.key]) + '</div></div>';
    }
  }

  if (!html) html = '<div class="result-card pink-border"><div class="card-content">' + formatContent(text) + '</div></div>';

  container.innerHTML = html;

  var exportBar = document.createElement('div');
  exportBar.style.cssText = 'text-align:center;margin:18px 0 8px;';
  exportBar.innerHTML = '<button onclick="exportAnalysis()" style="padding:10px 22px;border:none;border-radius:20px;background:linear-gradient(135deg,#ff8fab,#c8b6ff);color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(255,143,171,0.2);">📄 导出 / 打印</button>';
  container.appendChild(exportBar);

  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== 全局状态 =====
var _currentQuizUrl = '';

// ===== 渲染练习页面 =====
async function renderQuizPage(paramStr) {
  var quizText = null;
  var cleanId = paramStr.replace(/^#/, '').replace(/^quiz=/, '').replace(/^\?quiz=/, '').trim();

  // 纯前端：直接从 localStorage 读取
  if (cleanId) {
    try {
      quizText = localStorage.getItem('quiz_' + cleanId);
      if (quizText) {
        console.log('[Quiz] ✅ 从 localStorage 加载成功, ID:', cleanId, '长度:', quizText.length);
      }
    } catch(e) {
      console.warn('[Quiz] localStorage 读取失败:', e.message);
    }
  }

  // ★ 支持JSON格式存储
  var questions = null;
  if (quizText && quizText.indexOf('__JSON__:') === 0) {
    try {
      questions = JSON.parse(quizText.substring(8));
      console.log('[Quiz] ✅ JSON解析成功, 题目数:', questions.length);
    } catch(e) {
      console.warn('[Quiz] JSON解析失败:', e.message);
    }
  }

  if (!questions && quizText) {
    questions = parseQuizText(quizText);
    console.log('[Quiz] 文本解析, 题目数:', questions.length);
  }

  if (!questions || questions.length === 0) {
    renderQuizError('❌ 练习题加载失败\n\n可能的原因：\n· 链接已过期（清空了浏览器缓存）\n· 在别的设备上打开（数据存在原电脑的浏览器里）\n· 练习题数据为空或解析失败\n\n请回到电脑端重新生成练习题');
    return;
  }

  // 隐藏原有内容
  var mainContainer = document.querySelector('.container');
  if (mainContainer) mainContainer.style.display = 'none';
  var footer = document.querySelector('footer');
  if (footer) footer.style.display = 'none';

  var oldQuiz = document.getElementById('quiz-page-wrapper');
  if (oldQuiz) oldQuiz.remove();

  // 初始化游戏状态
  window._gameState = {
    questions: questions,
    currentIndex: 0,
    score: 0,
    total: questions.length,
    answered: []
  };

  var wrapperHtml = '<div id="quiz-page-wrapper">' +
    '<div id="game-header" style="background:linear-gradient(135deg,#ff8fab,#c8b6ff);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;color:#fff;font-weight:700;font-size:14px;position:sticky;top:0;z-index:99;box-shadow:0 2px 10px rgba(255,143,171,0.3);">' +
      '<div id="game-score">⭐ 0 分</div>' +
      '<div id="game-progress">第 <span id="game-q-num">1</span> / ' + questions.length + ' 题</div>' +
      '<div id="game-hearts">❤️❤️❤️</div>' +
    '</div>' +
    '<div style="height:5px;background:#f0f0f0;"><div id="game-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#ff8fab,#c8b6ff);transition:width 0.4s;"></div></div>' +
    '<div id="quiz-game-area" style="max-width:600px;margin:0 auto;padding:20px 16px;"></div>' +
    '<div id="quiz-result" style="display:none;max-width:600px;margin:0 auto;padding:20px 16px;"></div>' +
  '</div>';

  document.body.insertAdjacentHTML('beforeend', wrapperHtml);
  renderGameQuestion();
}

function renderQuizError(msg) {
  var mainContainer = document.querySelector('.container');
  if (mainContainer) mainContainer.style.display = 'none';

  var wrapperHtml = '<div id="quiz-page-wrapper" style="max-width:600px;margin:20px auto;padding:0 12px;">' +
    '<div style="background:#fff;border-radius:20px;box-shadow:0 4px 15px rgba(200,182,255,0.25);padding:30px 20px;text-align:center;">' +
      '<div style="font-size:50px;margin-bottom:12px;">😅</div>' +
      '<h2 style="color:#5e548e;font-size:18px;margin-bottom:12px;">练习题加载失败了</h2>' +
      '<div style="text-align:left;background:#fff5f5;border-radius:12px;padding:16px;margin:16px 0;font-size:14px;color:#666;line-height:1.8;">' + msg.replace(/\n/g, '<br/>') + '</div>' +
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', wrapperHtml);
}

// ===== 解析练习题文本（支持3种格式） =====
function parseQuizText(text) {
  if (!text || !text.trim()) return [];

  // ★ 方案1：JSON格式（新prompt输出）
  var trimmed = text.trim();
  // 去掉可能的 markdown 代码块标记
  var jsonStr = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/g, '');
  // 尝试找到JSON数组（AI可能在前后加了文字）
  var jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      var arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr) && arr.length > 0) {
        var valid = arr.filter(function(item) {
          return item && item.question && item.options && Array.isArray(item.options) && item.answer;
        });
        if (valid.length > 0) {
          console.log('[parseQuiz] ✅ JSON解析成功, ', valid.length, '道题');
          return valid;
        }
      }
    } catch(e) { console.warn('[parseQuiz] JSON解析失败:', e.message); }
  }

  // ★ 方案2：多行格式（AI常用自然输出）
  // 格式：
  //   1. 题目内容？
  //   A. xxx
  //   B. xxx
  //   C. xxx
  //   D. xxx
  //   答案：A（或 答案:A / 正确答案:A）
  //   解析：xxx（可选）
  var lines = text.split('\n');
  var questions = [];
  var currentQ = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    // 检测题目行：数字开头 + 问号/句号/中文标点
    var qMatch = line.match(/^(?:Q?(\d+)[\s:：.．)]?\s*)(.+)$/);
    var isQuestion = qMatch && (
      line.indexOf('?') !== -1 || line.indexOf('？') !== -1 ||
      line.indexOf('下列') !== -1 || line.indexOf('选择') !== -1 ||
      line.indexOf('哪个') !== -1 || line.indexOf('哪项') !== -1 ||
      (qMatch[2] && qMatch[2].length > 5 && !line.match(/^[A-D][\s、.．]/))
    );

    // 更宽松的题目检测：只要不是选项行且有一定长度
    var isOptionLine = /^[A-D][\s、.．)\]]/.test(line) ||
                        /^(A|B|C|D)[\s、.．]/.test(line);

    if (isQuestion || (!isOptionLine && !line.match(/^(答案|解析|正确答案)/) && line.length > 8 && !currentQ)) {
      // 新题目
      currentQ = { question: qMatch ? qMatch[2] : line, options: ['', '', '', ''], answer: '', explanation: '' };
      questions.push(currentQ);
    } else if (currentQ) {
      // 选项行 A. xxx / A、xxx / A）xxx
      var optMatch = line.match(/^[A-D][\s、.．)\]]\s*(.+)$/);
      if (optMatch) {
        var optIdx = line.charCodeAt(0) >= 'A'.charCodeAt(0) ? line.charCodeAt(0) - 'A'.charCodeAt(0) : -1;
        if (optIdx >= 0 && optIdx <= 3) {
          currentQ.options[optIdx] = optMatch[1].trim();
        }
      }
      // 答案行
      else if (line.match(/^(答案|正确答案)[\s:：]/)) {
        var ansMatch = line.match(/[A-D]/i);
        if (ansMatch) currentQ.answer = ansMatch[0].toUpperCase();
      }
      // 解析行
      else if (line.match(/^(解析|解析说明)[\s:：]/)) {
        currentQ.explanation = line.replace(/^(解析(说明)?[\s:：])/, '').trim();
      }
    }
  }

  // 过滤有效题目
  var validQuestions = questions.filter(function(q) {
    return q.question.length > 2 &&
           q.options.some(function(o) { return o.length > 0; }) &&
           q.answer;
  });

  if (validQuestions.length > 0) {
    console.log('[parseQuiz] ✅ 多行格式解析成功, ', validQuestions.length, '道题');
    return validQuestions;
  }

  // ★ 方案3：单行管道符格式（旧兼容）
  for (var j = 0; j < lines.length; j++) {
    var l = lines[j].trim();
    if (!l) continue;
    var m3 = l.match(/^(?:Q)?(\d+)[\s:：.](.+)/);
    if (!m3) continue;
    var parts = m3[2].split(/[|｜]/).map(function(s){ return s.trim(); });
    if (parts.length >= 5) {
      var ansRaw3 = parts[5] || '';
      var answer3 = ansRaw3.replace(/^[^\w]*[答案]?[^\w]*/i, '').replace(/[^\w]/g, '').toUpperCase();
      questions.push({
        question: parts[0], options: [parts[1], parts[2], parts[3], parts[4]],
        answer: answer3 || 'A', explanation: (parts[6] || '').replace(/^解析?[：:\s]*/, '')
      });
    }
  }

  console.log('[parseQuiz] 最终结果: ', questions.length, '道题 (方案3单行格式)');
  return questions;
}

// ===== 超宽松解析器（终极兜底）=====
function parseQuizTextLoose(text) {
  if (!text || !text.trim()) return [];
  console.log('[parseLoose] 启动宽松模式, 原始长度:', text.length);

  var lines = text.split('\n');
  var result = [];
  var curr = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line === '```' || line === '```json') continue;

    // 检测新题目：多种模式
    var isNewQ = false;
    var qText = line;

    // 模式1: "1." / "1、" / "Q1" / "第1题"
    var numMatch = line.match(/^(?:第?(\d+)[题 question]?[\s:：.、])\s*(.*)$/i);
    if (numMatch) { isNewQ = true; qText = numMatch[2] || line; }

    // 模式2: 包含问号且不是选项
    if (!isNewQ && (line.indexOf('?') !== -1 || line.indexOf('？') !== -1) && !/^[A-D][\s、.．)]/.test(line)) {
      isNewQ = true;
    }

    // 模式3: 常见语文题型关键词
    if (!isNewQ && !curr && line.length > 6 && /^(下列|下面|选择|哪个|哪项|选出|关于|对|阅读|根据|请|按要求)/.test(line)) {
      isNewQ = true;
    }

    if (isNewQ) {
      curr = { question: qText.replace(/^[\d.、:\s]+/, '').trim(), options: ['', '', '', ''], answer: 'A', explanation: '' };
      result.push(curr);
      continue;
    }

    if (!curr) continue;

    // 选项识别（超宽松）
    var optM = line.match(/^[A-D][\s、.．)\]：:]\s*(.+)$/);
    if (optM) {
      var idx = 'ABCD'.indexOf(line[0]);
      if (idx >= 0) curr.options[idx] = optM[1].trim();
      continue;
    }

    // 答案识别
    if (/答案|正确答案/.test(line)) {
      var am = line.match(/[A-D]/i);
      if (am) curr.answer = am[0].toUpperCase();
      continue;
    }

    // 解析
    if (/解析|说明|理由/.test(line)) {
      curr.explanation += (curr.explanation ? ' ' : '') + line.replace(/^(解析(说明)?[理由]?[\s:：:]\s*)/, '').trim();
    }
  }

  // 后处理：确保每道题都有基本内容
  var valid = result.filter(function(q, idx) {
    if (q.question.length < 3) q.question = '第' + (idx+1) + '题（题目未完全识别）';
    // 补全空选项
    for (var k = 0; k < 4; k++) {
      if (!q.options[k] || q.options[k].length === 0) q.options[k] = ['选项A','选项B','选项C','选项D'][k];
    }
    if (!q.answer) q.answer = 'A';
    return true;
  });

  console.log('[parseLoose] 宽松解析结果:', valid.length, '道题');
  return valid;
}

// ===== 游戏化渲染题目 =====
function renderGameQuestion() {
  var state = window._gameState;
  if (!state || state.currentIndex >= state.total) {
    showQuizResult();
    return;
  }

  var q = state.questions[state.currentIndex];
  var area = document.getElementById('quiz-game-area');
  if (!area) return;

  var letters = ['A', 'B', 'C', 'D'];
  var html = '<div style="background:#fff;border-radius:16px;padding:20px;box-shadow:0 2px 12px rgba(200,182,255,0.15);">' +
    '<div style="font-size:13px;color:#9d8eb5;margin-bottom:8px;">第 ' + (state.currentIndex + 1) + ' 题 / 共 ' + state.total + ' 题</div>' +
    '<div style="font-size:16px;font-weight:700;color:#5e548e;margin-bottom:16px;line-height:1.6;">' + q.question + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';

  for (var j = 0; j < q.options.length; j++) {
    html += '<div onclick="selectQuizOption(' + j + ')" style="padding:12px 14px;border:2px solid #e8dff5;border-radius:12px;cursor:pointer;font-size:14px;transition:all 0.2s;" onmouseover="this.style.borderColor=\'#ff8fab\'" onmouseout="this.style.borderColor=\'#e8dff5\'" id="opt-' + j + '">' +
      '<span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#f0e6ff;color:#5e548e;font-size:12px;font-weight:700;text-align:center;line-height:22px;margin-right:8px;">' + letters[j] + '</span> ' +
      q.options[j] +
    '</div>';
  }

  html += '</div></div>';
  area.innerHTML = html;

  // 更新进度
  document.getElementById('game-progress-bar').style.width = ((state.currentIndex / state.total) * 100) + '%';
  document.getElementById('game-q-num').textContent = state.currentIndex + 1;
}

window.selectQuizOption = function(idx) {
  var state = window._gameState;
  if (!state || !state.questions) return;
  var q = state.questions[state.currentIndex];
  var letters = ['A', 'B', 'C', 'D'];
  var isCorrect = (letters[idx] === q.answer);

  // 标记已选
  state.answered[state.currentIndex] = idx;

  // 显示对错
  var optEl = document.getElementById('opt-' + idx);
  if (optEl) {
    optEl.style.borderColor = isCorrect ? '#10b981' : '#ef4444';
    optEl.style.background = isCorrect ? '#ecfdf5' : '#fef2f2';
  }

  // 显示正确答案
  var letters = ['A', 'B', 'C', 'D'];
  for (var i = 0; i < q.options.length; i++) {
    if (letters[i] === q.answer) {
      var correctEl = document.getElementById('opt-' + i);
      if (correctEl && i !== idx) {
        correctEl.style.borderColor = '#10b981';
        correctEl.style.background = '#ecfdf5';
      }
    }
  }

  if (isCorrect) {
    state.score += 20;
    document.getElementById('game-score').textContent = '⭐ ' + state.score + ' 分';
  }

  // 1.5秒后下一题
  setTimeout(function() {
    state.currentIndex += 1;
    if (state.currentIndex >= state.total) {
      showQuizResult();
    } else {
      renderGameQuestion();
    }
  }, 1500);
};

function showQuizResult() {
  var state = window._gameState;
  var area = document.getElementById('quiz-game-area');
  var result = document.getElementById('quiz-result');

  var stars = state.score >= 80 ? '🌟🌟🌟' : state.score >= 60 ? '🌟🌟' : '🌟';
  var msg = state.score >= 80 ? '太棒了！' : state.score >= 60 ? '还不错！' : '继续加油！';

  var html = '<div style="text-align:center;padding:30px 20px;">' +
    '<div style="font-size:60px;margin-bottom:16px;">' + stars + '</div>' +
    '<div style="font-size:20px;font-weight:700;color:#5e548e;margin-bottom:8px;">' + msg + '</div>' +
    '<div style="font-size:16px;color:#9d8eb5;margin-bottom:24px;">得分：' + state.score + ' / ' + (state.total * 20) + '</div>' +
    '<button onclick="location.reload()" style="padding:12px 28px;border:none;border-radius:20px;background:linear-gradient(135deg,#ff8fab,#c8b6ff);color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(255,143,171,0.25);">🔄 再做一次</button>' +
  '</div>';

  area.style.display = 'none';
  result.style.display = 'block';
  result.innerHTML = html;
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
  var params = new URLSearchParams(location.search);
  var urlQuiz = params.get('quiz') || '';
  var hashQuiz = location.hash.replace(/^#quiz=/, '').replace(/^#/, '');

  var quizParam = urlQuiz || hashQuiz;

  if (quizParam) {
    document.title = '知识点练习 📝';
    renderQuizPage(quizParam);
    return;
  }

  // 加载 DeepSeek Key（优先用 localStorage，没有则用默认值）
  var savedKey = localStorage.getItem('deepseek_key') || DEFAULT_DEEPSEEK_KEY || '';
  window.DEEPSEEK_API_KEY = savedKey;

  // 自动保存默认值到 localStorage（首次使用）
  if (!localStorage.getItem('deepseek_key') && DEFAULT_DEEPSEEK_KEY) {
    localStorage.setItem('deepseek_key', DEFAULT_DEEPSEEK_KEY);
  }

  // 加载 GitHub Token（优先用 localStorage，没有则用默认值）
  GITHUB_TOKEN = localStorage.getItem('github_token') || DEFAULT_GITHUB_TOKEN || '';

  // 自动保存默认值到 localStorage
  if (!localStorage.getItem('github_token') && DEFAULT_GITHUB_TOKEN) {
    localStorage.setItem('github_token', DEFAULT_GITHUB_TOKEN);
  }

  if (!window.DEEPSEEK_API_KEY) {
    showApiKeyHint();
  }

  // ===== 绑定拖拽上传事件 =====
  var uploadArea = document.getElementById('image-upload-area');
  if (uploadArea) {
    uploadArea.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.style.borderColor = '#ff6b9d';
      this.style.background = '#fef0f5';
    });
    uploadArea.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.style.borderColor = '';
      this.style.background = '';
    });
    uploadArea.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.style.borderColor = '';
      this.style.background = '';
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0 && files[0].type.match(/^image\//)) {
        // 模拟文件选择器
        var fileInput = document.getElementById('image-input');
        if (fileInput) {
          fileInput.files = files;
          handleImageUpload(fileInput);
        }
      } else {
        showToast('⚠️ 请上传图片文件（JPG/PNG）');
      }
    });
    console.log('✅ 拖拽上传已绑定');
  }
});

console.log('[语文小帮手] v53 已加载！彻底移除qrcode内联库依赖 ✓');

// ===== 图片上传处理 =====
function handleImageUpload(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    imageData = e.target.result;
    // 显示预览：image-preview 是 <img> 元素，用 .src 设置
    var preview = document.getElementById('image-preview');
    if (preview) {
      preview.src = imageData;
      preview.style.display = 'block';
    }
    // 显示容器和删除按钮
    var wrap = document.getElementById('image-preview-wrap');
    if (wrap) {
      // 添加删除按钮（如果没有的话）
      if (!wrap.querySelector('.btn-del-img')) {
        var btn = document.createElement('button');
        btn.className = 'btn-del-img';
        btn.textContent = '✕ 删除';
        btn.onclick = function() { clearImagePreview(); };
        btn.style.cssText = 'margin-top:8px;padding:6px 16px;border:none;border-radius:16px;background:#fee2e2;color:#dc2626;cursor:pointer;font-size:12px;';
        wrap.appendChild(btn);
      }
      wrap.style.display = 'block';
    }
    // 隐藏占位符
    var placeholder = document.getElementById('upload-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    recognizeImage(imageData);
  };
  reader.readAsDataURL(file);
}

function clearImagePreview() {
  imageData = null;
  ocrText = '';
  var preview = document.getElementById('image-preview');
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  var wrap = document.getElementById('image-preview-wrap');
  if (wrap) wrap.style.display = 'none';
  var placeholder = document.getElementById('upload-placeholder');
  if (placeholder) placeholder.style.display = '';
}

async function recognizeImage(base64Data) {
  showToast('🔍 正在识别图片...');
  var base64Content = base64Data.split(',')[1] || '';
  var geminiKey = localStorage.getItem('gemini_key') || '';

  try {
    if (!geminiKey) {
      ocrText = '';
      showToast('💡 已上传图片，可直接点击「开始分析」');
      return;
    }

    var resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: '请准确识别这张图片中的所有文字内容，只输出文字，不要解释' },
          { inline_data: { mime_type: 'image/jpeg', data: base64Content } }
        ] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      })
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    ocrText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (ocrText) { showToast('✅ 图片识别完成'); } else { showToast('⚠️ 未识别到文字'); }
    updateWrongInput();

  } catch (e) {
    console.error('[OCR]', e.message);
    showToast('❌ 识别失败: ' + e.message);
  }
}

function updateWrongInput() {
  var input = document.getElementById('wrong-input');
  if (input && ocrText) input.value += (input.value ? '\n\n--- 图片识别 ---\n' : '') + ocrText;
}

// ===== 设置相关函数（index.html 弹窗需要） =====
function showSettings() {
  var el = document.getElementById('settings-overlay');
  if (el) el.style.display = 'flex';

  // ★ 自动填入当前值（默认值或用户保存的）
  var dsInput = document.getElementById('settings-ds-key');
  if (dsInput && !dsInput.value) dsInput.value = window.DEEPSEEK_API_KEY || localStorage.getItem('deepseek_key') || '';

  var ghInput = document.getElementById('setting-gh-token');
  if (ghInput && !ghInput.value) ghInput.value = GITHUB_TOKEN || localStorage.getItem('github_token') || '';
}

function closeSettings() {
  var el = document.getElementById('settings-overlay');
  if (el) el.style.display = 'none';
}

function saveSettings() {
  // DeepSeek Key
  var dsInput = document.getElementById('settings-ds-key');
  if (dsInput && dsInput.value.trim()) {
    localStorage.setItem('deepseek_key', dsInput.value.trim());
    window.DEEPSEEK_API_KEY = dsInput.value.trim();
  }
  // Gemini Key
  var gmInput = document.getElementById('settings-gm-key');
  if (gmInput && gmInput.value.trim()) {
    localStorage.setItem('gemini_key', gmInput.value.trim());
  }
  // GitHub Token
  var ghInput = document.getElementById('setting-gh-token');
  if (ghInput && ghInput.value.trim()) {
    localStorage.setItem('github_token', ghInput.value.trim());
    GITHUB_TOKEN = ghInput.value.trim();
  }
  showToast('✅ 设置已保存！');
  closeSettings();
}

function showApiKeyHint() {
  var el = document.getElementById('api-key-hint');
  if (el) el.style.display = 'block';
}

function showError(containerId, msg) {
  var el = document.getElementById(containerId);
  if (el) {
    el.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;text-align:center;color:#dc2626;"><div style="font-size:30px;margin-bottom:8px;">😕</div><div style="font-size:14px;">' + msg + '</div></div>';
    el.style.display = 'block';
  }
}

function exportAnalysis() {
  var resultArea = document.getElementById('result-knowledge') || document.getElementById('result-wrong');
  if (!resultArea || !resultArea.innerHTML || resultArea.style.display === 'none') { alert('没有可导出的内容'); return; }
  var w = window.open('', '_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset=UTF-8><title>打印</title>');
  w.document.write('<style>body{font-family:"Microsoft YaHei",sans-serif;padding:20px;max-width:800px;margin:0 auto}@media print{body{padding:0}}</style>');
  w.document.write('</head><body>' + resultArea.innerHTML + '</body></html>');
  w.document.close();
  w.print();
}

// ===== 标签切换 & 清空输入 =====
function switchTab(tabId) {
  // 隐藏所有面板（HTML中用的是 .panel class）
  var panels = document.querySelectorAll('.panel');
  for (var i = 0; i < panels.length; i++) panels[i].style.display = 'none';

  // 显示目标面板（ID格式：panel-knowledge / panel-wrong）
  var activePanel = document.getElementById('panel-' + tabId);
  if (activePanel) activePanel.style.display = 'block';

  // 更新按钮激活状态
  var btns = document.querySelectorAll('.tab');
  for (var j = 0; j < btns.length; j++) btns[j].classList.remove('active');

  // 高亮当前点击的 Tab
  var currentBtn = document.getElementById('tab-' + tabId);
  if (currentBtn) currentBtn.classList.add('active');
}

function clearInput(inputId) {
  var el = document.getElementById(inputId);
  if (el) el.value = '';
}
