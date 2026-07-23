/**
 * WE Assistant — frontend client.
 * Vanilla JS, no frameworks. Talks to the FastAPI backend over SSE and
 * drives the floating chat widget, the system-architecture visualization,
 * the node debugger panel, and the language panel from the same stream.
 *
 * Language is fully automatic: there is no manual EN/AR switch. The UI
 * follows whatever language the backend detects in the user's latest
 * message (see the `language_info` SSE event handling below).
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE = location.protocol === "file:" ? "http://localhost:8000" : "";
const SESSION_STORAGE_KEY = "we_assistant_session_id";

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const I18N = {
  en: {
    workflow_title: "Agent System Architecture",
    workflow_subtitle: "Live trace of every request through the WE Telecom agent",
    legend_idle: "Idle",
    legend_active: "Active",
    legend_done: "Done",
    legend_hint: "Click any node for details",
    lang_panel_title: "🌍 Language",
    lang_detected: "Detected",
    lang_retrieval: "Retrieval query",
    lang_response: "Response",
    lang_translation: "Translation",
    lang_exec_time: "Execution time",
    debugger_title: "Node Details",
    debug_node_name: "Node",
    debug_status: "Status",
    debug_exec_time: "Execution Time",
    debug_description: "Description",
    debug_source: "Backend Source",
    debug_input: "Input Summary",
    debug_output: "Output Summary",
    debug_metadata: "Metadata",
    debug_error: "Error",
    debug_placeholder: "Click a node in the diagram to inspect it.",
    yes: "Yes",
    no: "No",
    agent_name: "WE Telecom Agent",
    status_connecting: "Connecting…",
    status_online: "Online",
    status_offline: "Offline",
    welcome_title: "How can I help you today?",
    welcome_subtitle: "Ask about internet plans, router setup, billing, or report an issue.",
    composer_placeholder: "Type your message…",
    using_tool: "Looking that up…",
    reset_toast: "Conversation reset.",
    error_toast: "Something went wrong. Please try again.",
    copy: "Copy",
    copied: "Copied",
  },
  ar: {
    workflow_title: "معمارية نظام الوكيل",
    workflow_subtitle: "تتبّع حي لكل طلب داخل وكيل WE للاتصالات",
    legend_idle: "خامل",
    legend_active: "نشط",
    legend_done: "تم",
    legend_hint: "اضغط على أي عقدة لعرض التفاصيل",
    lang_panel_title: "🌍 اللغة",
    lang_detected: "اللغة المكتشفة",
    lang_retrieval: "لغة الاسترجاع",
    lang_response: "لغة الرد",
    lang_translation: "الترجمة",
    lang_exec_time: "زمن التنفيذ",
    debugger_title: "تفاصيل العقدة",
    debug_node_name: "العقدة",
    debug_status: "الحالة",
    debug_exec_time: "زمن التنفيذ",
    debug_description: "الوصف",
    debug_source: "مصدر الكود",
    debug_input: "ملخص المدخلات",
    debug_output: "ملخص المخرجات",
    debug_metadata: "بيانات إضافية",
    debug_error: "خطأ",
    debug_placeholder: "اضغط على عقدة في المخطط لعرض تفاصيلها.",
    yes: "نعم",
    no: "لا",
    agent_name: "وكيل WE للاتصالات",
    status_connecting: "جارٍ الاتصال…",
    status_online: "متصل",
    status_offline: "غير متصل",
    welcome_title: "إزاي أقدر أساعدك النهاردة؟",
    welcome_subtitle: "اسأل عن باقات الإنترنت، ضبط الراوتر، الفواتير، أو بلّغ عن مشكلة.",
    composer_placeholder: "اكتب رسالتك…",
    using_tool: "بيدور على المعلومة…",
    reset_toast: "تم بدء محادثة جديدة.",
    error_toast: "حصلت مشكلة. حاول تاني.",
    copy: "نسخ",
    copied: "اتنسخ",
  },
};

const NODE_STATUS_TEXT = {
  en: { idle: "Idle", active: "Active", done: "Done", error: "Error" },
  ar: { idle: "خامل", active: "نشط", done: "تم", error: "خطأ" },
};

const SUGGESTIONS = [
  {
    en: { title: "Internet plans", sub: "See available packages", msg: "What internet plans do you offer?" },
    ar: { title: "باقات الإنترنت", sub: "تعرف على الباقات المتاحة", msg: "ما هي باقات الإنترنت المتاحة؟" },
  },
  {
    en: { title: "Report an outage", sub: "My internet isn't working", msg: "My internet is down, can you help?" },
    ar: { title: "بلّغ عن عطل", sub: "الإنترنت عندي مش شغال", msg: "الإنترنت عندي مش شغال، ممكن تساعدني؟" },
  },
  {
    en: { title: "Router setup", sub: "Configuration help", msg: "How do I configure my router?" },
    ar: { title: "ضبط الراوتر", sub: "مساعدة في الإعدادات", msg: "إزاي أظبط الراوتر بتاعي؟" },
  },
  {
    en: { title: "Billing question", sub: "About my invoice", msg: "I have a question about my bill." },
    ar: { title: "استفسار فاتورة", sub: "بخصوص فاتورتي", msg: "عندي استفسار عن الفاتورة بتاعتي." },
  },
];

// currentLang follows the detected conversation language automatically —
// no manual switch, no persisted preference. Defaults to English until the
// backend reports otherwise.
let currentLang = "en";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let sessionId = getOrCreateSessionId();
let isStreaming = false;
let messagesInnerEl = null;
let lastKnownStatus = "connecting";
let widgetMinimized = false;
let debuggerOpenNodeId = null;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const els = {
  messages: document.getElementById("messages"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  suggestionsGrid: document.getElementById("suggestionsGrid"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  resetBtn: document.getElementById("resetBtn"),
  agentStatus: document.getElementById("agentStatus"),
  chatWidget: document.getElementById("chatWidget"),
  minimizeBtn: document.getElementById("minimizeBtn"),
  chatLauncher: document.getElementById("chatLauncher"),
  launcherBadge: document.getElementById("launcherBadge"),
  debuggerPanel: document.getElementById("debuggerPanel"),
  debuggerBody: document.getElementById("debuggerBody"),
  debuggerCloseBtn: document.getElementById("debuggerCloseBtn"),
  debuggerOverlay: document.getElementById("debuggerOverlay"),
  langDetected: document.getElementById("langDetected"),
  langRetrieval: document.getElementById("langRetrieval"),
  langResponse: document.getElementById("langResponse"),
  langTranslation: document.getElementById("langTranslation"),
  langExecTime: document.getElementById("langExecTime"),
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
init();

function init() {
  Workflow.init("nodeFlow", handleNodeClick);
  Workflow.setLanguage(currentLang);

  renderSuggestions();
  applyLanguage(currentLang);
  bindEvents();
  autosizeTextarea();
  pollHealth();
}

function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// i18n application (triggered automatically, never by manual toggle)
// ---------------------------------------------------------------------------
function applyLanguage(lang) {
  currentLang = lang;

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (I18N[lang][key]) el.textContent = I18N[lang][key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (I18N[lang][key]) el.placeholder = I18N[lang][key];
  });

  renderSuggestions();
  setStatus(lastKnownStatus);
  Workflow.setLanguage(lang);

  if (!debuggerOpenNodeId && els.debuggerBody) {
    els.debuggerBody.innerHTML = `<p class="debug-placeholder">${escapeHtml(t("debug_placeholder"))}</p>`;
  }
}

function t(key) {
  return I18N[currentLang][key] || key;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------
function renderSuggestions() {
  els.suggestionsGrid.innerHTML = "";
  SUGGESTIONS.forEach((s) => {
    const content = s[currentLang];
    const card = document.createElement("button");
    card.className = "suggestion-card";
    card.innerHTML = `<span class="s-title"></span><span class="s-sub"></span>`;
    card.querySelector(".s-title").textContent = content.title;
    card.querySelector(".s-sub").textContent = content.sub;
    card.addEventListener("click", () => sendMessage(content.msg));
    els.suggestionsGrid.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function bindEvents() {
  els.sendBtn.addEventListener("click", handleSendClick);
  els.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendClick();
    }
  });
  els.messageInput.addEventListener("input", autosizeTextarea);

  els.resetBtn.addEventListener("click", startNewChat);
  els.minimizeBtn.addEventListener("click", () => setWidgetMinimized(true));
  els.chatLauncher.addEventListener("click", () => setWidgetMinimized(false));

  els.debuggerCloseBtn.addEventListener("click", closeDebuggerPanel);
  els.debuggerOverlay.addEventListener("click", closeDebuggerPanel);
}

function setWidgetMinimized(minimized) {
  widgetMinimized = minimized;
  els.chatWidget.classList.toggle("minimized", minimized);
  els.chatLauncher.classList.toggle("show", minimized);
  if (!minimized) {
    els.launcherBadge.style.display = "none";
    els.messageInput.focus();
  }
}

function autosizeTextarea() {
  const el = els.messageInput;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function handleSendClick() {
  const text = els.messageInput.value.trim();
  if (!text || isStreaming) return;
  sendMessage(text);
}

// ---------------------------------------------------------------------------
// Node debugger panel
// ---------------------------------------------------------------------------
function handleNodeClick(nodeId, detail, nodeMeta) {
  debuggerOpenNodeId = nodeId;
  renderDebuggerBody(nodeId, detail, nodeMeta);
  els.debuggerPanel.classList.add("open");
  els.debuggerOverlay.classList.add("show");
}

function closeDebuggerPanel() {
  debuggerOpenNodeId = null;
  els.debuggerPanel.classList.remove("open");
  els.debuggerOverlay.classList.remove("show");
  els.debuggerBody.innerHTML = `<p class="debug-placeholder">${escapeHtml(t("debug_placeholder"))}</p>`;
}

function renderDebuggerBody(nodeId, detail, nodeMeta) {
  const name = currentLang === "ar" ? nodeMeta.ar : nodeMeta.en;
  const desc = currentLang === "ar" ? nodeMeta.descAr : nodeMeta.descEn;
  const status = detail.status || "idle";
  const duration = typeof detail.duration_ms === "number" ? `${detail.duration_ms.toFixed(1)} ms` : "—";
  const meta = detail.metadata || {};
  const statusText = NODE_STATUS_TEXT[currentLang][status] || status;

  let html = `
    <div class="debug-field">
      <span class="debug-field-label">${t("debug_node_name")}</span>
      <span class="debug-field-value" style="font-weight:700;font-size:14px;">${escapeHtml(name)}</span>
    </div>
    <div class="debug-field">
      <span class="debug-field-label">${t("debug_status")}</span>
      <span class="debug-status-chip ${status}">${escapeHtml(statusText)}</span>
    </div>
    <div class="debug-field">
      <span class="debug-field-label">${t("debug_exec_time")}</span>
      <span class="debug-field-value">${duration}</span>
    </div>
    <div class="debug-field">
      <span class="debug-field-label">${t("debug_description")}</span>
      <span class="debug-field-value">${escapeHtml(desc)}</span>
    </div>
    <div class="debug-field">
      <span class="debug-field-label">${t("debug_source")}</span>
      <span class="debug-field-value mono">${escapeHtml(nodeMeta.source || "")}</span>
    </div>`;

  if (meta.input_summary) {
    html += `<div class="debug-field"><span class="debug-field-label">${t("debug_input")}</span><span class="debug-field-value mono">${escapeHtml(meta.input_summary)}</span></div>`;
  }
  if (meta.output_summary) {
    html += `<div class="debug-field"><span class="debug-field-label">${t("debug_output")}</span><span class="debug-field-value mono">${escapeHtml(meta.output_summary)}</span></div>`;
  }
  if (meta.detected_language) {
    html += `<div class="debug-field"><span class="debug-field-label">${t("debug_metadata")}</span><span class="debug-field-value">${t(
      "lang_detected"
    )}: ${escapeHtml(meta.detected_language)} · ${t("lang_response")}: ${escapeHtml(meta.response_language || meta.detected_language)}</span></div>`;
  }
  if (status === "error") {
    html += `<div class="debug-field"><span class="debug-field-label">${t("debug_error")}</span><span class="debug-field-value error-text">${escapeHtml(
      detail.label || t("error_toast")
    )}</span></div>`;
  }

  els.debuggerBody.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
async function pollHealth(attempt = 0) {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    if (data.agent_ready) {
      setStatus("online");
      return;
    }
    throw new Error("not ready");
  } catch (err) {
    setStatus(attempt > 2 ? "offline" : "connecting");
  }
  setTimeout(() => pollHealth(attempt + 1), 3000);
}

function setStatus(state) {
  lastKnownStatus = state;
  els.agentStatus.classList.remove("online", "error");
  const key = state === "online" ? "status_online" : state === "offline" ? "status_offline" : "status_connecting";
  els.agentStatus.textContent = t(key);
  if (state === "online") els.agentStatus.classList.add("online");
  else if (state === "offline") els.agentStatus.classList.add("error");
}

// ---------------------------------------------------------------------------
// Chat flow
// ---------------------------------------------------------------------------
function ensureMessagesInner() {
  if (!messagesInnerEl) {
    els.welcomeScreen.style.display = "none";
    messagesInnerEl = document.createElement("div");
    messagesInnerEl.className = "messages-inner";
    els.messages.appendChild(messagesInnerEl);
  }
  return messagesInnerEl;
}

function scrollToBottom(force = false) {
  const nearBottom =
    els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 120;
  if (force || nearBottom) {
    els.messages.scrollTop = els.messages.scrollHeight;
  }
}

function appendUserMessage(text) {
  const container = ensureMessagesInner();
  const row = document.createElement("div");
  row.className = "msg-row user";
  row.innerHTML = `
    <div class="msg-avatar">${currentLang === "ar" ? "أنت" : "You"}</div>
    <div class="msg-bubble-wrap">
      <div class="msg-bubble"></div>
    </div>`;
  const bubble = row.querySelector(".msg-bubble");
  bubble.textContent = text;
  bubble.innerHTML += `<span class="bubble-timestamp">${formatTime()}</span>`;
  container.appendChild(row);
  scrollToBottom(true);
}

function appendAssistantMessage() {
  const container = ensureMessagesInner();
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.innerHTML = `
    <div class="msg-avatar">WE</div>
    <div class="msg-bubble-wrap">
      <div class="tool-status" style="display:none;"></div>
      <div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
      <div class="msg-meta">
        <button class="copy-msg-btn" type="button">${t("copy")}</button>
      </div>
    </div>`;
  container.appendChild(row);
  scrollToBottom(true);

  return {
    row,
    bubble: row.querySelector(".msg-bubble"),
    toolStatus: row.querySelector(".tool-status"),
    copyBtn: row.querySelector(".copy-msg-btn"),
  };
}

function formatTime() {
  return new Date().toLocaleTimeString(currentLang === "ar" ? "ar-EG" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function sendMessage(text) {
  if (isStreaming) return;
  isStreaming = true;
  els.sendBtn.disabled = true;

  appendUserMessage(text);
  els.messageInput.value = "";
  autosizeTextarea();

  const assistantEl = appendAssistantMessage();
  let rawText = "";
  let firstTokenReceived = false;

  try {
    await streamChat(text, sessionId, {
      trace_reset: () => {
        Workflow.reset();
        // A new turn is starting: any node detail currently shown in the
        // right-hand debugger panel belongs to the previous turn and is no
        // longer relevant to what's happening in the graph now, so close it
        // rather than leaving stale data on screen.
        closeDebuggerPanel();
      },
      node_update: (payload) => {
        if (!payload || !payload.node) return;
        Workflow.update(payload.node, payload.status, payload.label, payload.duration_ms, payload.metadata);
        if (debuggerOpenNodeId === payload.node) {
          // Re-read the full, current detail for this exact node from the
          // single source of truth instead of the partial SSE payload, so
          // the panel always reflects only this node's own latest state.
          const nodeMeta = Workflow.nodeById(payload.node);
          renderDebuggerBody(payload.node, Workflow.detailFor(payload.node), nodeMeta);
        }
      },
      language_info: (info) => {
        if (!info) return;
        els.langDetected.textContent = info.detected_language || "—";
        els.langRetrieval.textContent = info.retrieval_query_language || "—";
        els.langResponse.textContent = info.response_language || "—";
        els.langTranslation.textContent =
          info.translation_required === true ? t("yes") : info.translation_required === false ? t("no") : "—";
        els.langExecTime.textContent =
          typeof info.execution_time_ms === "number" ? `${(info.execution_time_ms / 1000).toFixed(2)}s` : "—";

        const autoCode = info.detected_language === "Arabic" ? "ar" : "en";
        if (autoCode !== currentLang) applyLanguage(autoCode);
      },
      token: (chunk) => {
        if (!firstTokenReceived) {
          firstTokenReceived = true;
          assistantEl.bubble.innerHTML = "";
        }
        rawText += chunk;
        assistantEl.bubble.innerHTML = renderMarkdown(rawText);
        scrollToBottom();
      },
      tool_start: () => {
        assistantEl.toolStatus.style.display = "flex";
        assistantEl.toolStatus.innerHTML = `<span class="tool-pill"><span class="tool-dot"></span>${t(
          "using_tool"
        )}</span>`;
      },
      tool_end: () => {
        assistantEl.toolStatus.style.display = "none";
        assistantEl.toolStatus.innerHTML = "";
      },
      done: () => {
        if (!rawText) {
          assistantEl.bubble.innerHTML = `<p>${t("error_toast")}</p>`;
        }
        assistantEl.bubble.innerHTML += `<span class="bubble-timestamp">${formatTime()}</span>`;
        finalizeAssistantMessage(assistantEl, rawText);
        notifyIfMinimized();
      },
      error: (msg) => {
        assistantEl.toolStatus.style.display = "none";
        assistantEl.bubble.innerHTML = `<p>${escapeHtml(msg || t("error_toast"))}</p><span class="bubble-timestamp">${formatTime()}</span>`;
        finalizeAssistantMessage(assistantEl, msg || "");
      },
    });
  } catch (err) {
    assistantEl.toolStatus.style.display = "none";
    assistantEl.bubble.innerHTML = `<p>${t("error_toast")}</p>`;
    finalizeAssistantMessage(assistantEl, "");
  } finally {
    isStreaming = false;
    els.sendBtn.disabled = false;
    els.messageInput.focus();
  }
}

function notifyIfMinimized() {
  if (widgetMinimized) {
    els.launcherBadge.style.display = "block";
  }
}

function finalizeAssistantMessage(assistantEl, rawText) {
  attachCodeCopyButtons(assistantEl.bubble);
  assistantEl.copyBtn.addEventListener("click", () => copyToClipboard(rawText, assistantEl.copyBtn));
  scrollToBottom();
}

function startNewChat() {
  if (isStreaming) return;
  const oldSession = sessionId;

  fetch(`${API_BASE}/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: oldSession }),
  }).catch(() => {});

  sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);

  if (messagesInnerEl) {
    messagesInnerEl.remove();
    messagesInnerEl = null;
  }
  els.welcomeScreen.style.display = "flex";
  Workflow.reset();
  closeDebuggerPanel();

  els.langDetected.textContent = "—";
  els.langRetrieval.textContent = "—";
  els.langResponse.textContent = "—";
  els.langTranslation.textContent = "—";
  els.langExecTime.textContent = "—";

  showToast(t("reset_toast"));
}

// ---------------------------------------------------------------------------
// SSE streaming client
// ---------------------------------------------------------------------------
async function streamChat(message, sid, handlers) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sid }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawFrame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const frame = parseSSEFrame(rawFrame);
      if (frame && handlers[frame.event]) {
        handlers[frame.event](frame.data);
      }
    }
  }
}

function parseSSEFrame(rawFrame) {
  let event = "message";
  let dataLine = "";
  for (const line of rawFrame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLine += line.slice(5).trim();
    }
  }
  if (!dataLine) return null;
  try {
    const parsed = JSON.parse(dataLine);
    return { event, data: parsed.data };
  } catch {
    return { event, data: dataLine };
  }
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer + syntax highlighting (no external deps)
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CODE_KEYWORDS =
  "function|const|let|var|return|if|else|for|while|def|class|import|from|export|default|" +
  "async|await|try|except|catch|finally|new|this|self|True|False|None|null|true|false|" +
  "public|private|static|void|int|string|bool|struct|enum|switch|case|break|continue|throw|" +
  "yield|lambda|with|as|print|console|in|of";

function highlightCode(code) {
  const escaped = escapeHtml(code);
  const pattern = new RegExp(
    '(//.*$|#.*$)' + // comments
      '|("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')' + // strings
      "|(\\b\\d+\\.?\\d*\\b)" + // numbers
      "|(\\b(?:" + CODE_KEYWORDS + ")\\b)", // keywords
    "gm"
  );
  return escaped.replace(pattern, (match, comment, str, num, kw) => {
    if (comment) return `<span class="tok-comment">${comment}</span>`;
    if (str) return `<span class="tok-string">${str}</span>`;
    if (num) return `<span class="tok-number">${num}</span>`;
    if (kw) return `<span class="tok-keyword">${kw}</span>`;
    return match;
  });
}

function renderMarkdown(raw) {
  const codeBlocks = [];
  let text = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || "text", code: code.replace(/\n$/, "") });
    return `%%CODEBLOCK_${idx}%%`;
  });

  text = escapeHtml(text);

  text = text.replace(/`([^`]+)`/g, (_, code) => `<code class="inline-code">${code}</code>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  const lines = text.split("\n");
  let html = "";
  let listType = null;
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length) {
      html += `<p>${paragraphBuffer.join("<br>")}</p>`;
      paragraphBuffer = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (const line of lines) {
    const codeBlockMatch = line.match(/^%%CODEBLOCK_(\d+)%%$/);
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)/);
    const numberMatch = line.match(/^\s*\d+\.\s+(.*)/);

    if (codeBlockMatch) {
      closeList();
      flushParagraph();
      html += line;
    } else if (bulletMatch) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${bulletMatch[1]}</li>`;
    } else if (numberMatch) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${numberMatch[1]}</li>`;
    } else if (line.trim() === "") {
      closeList();
      flushParagraph();
    } else {
      closeList();
      paragraphBuffer.push(line);
    }
  }
  closeList();
  flushParagraph();

  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => {
    const block = codeBlocks[Number(i)];
    const highlighted = highlightCode(block.code);
    const encoded = encodeURIComponent(block.code);
    return `<div class="code-block-wrap"><div class="code-block-header"><span>${escapeHtml(
      block.lang
    )}</span><button class="code-copy-btn" data-code="${encoded}">${t("copy")}</button></div><pre><code>${highlighted}</code></pre></div>`;
  });

  return html;
}

function attachCodeCopyButtons(container) {
  container.querySelectorAll(".code-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = decodeURIComponent(btn.dataset.code || "");
      copyToClipboard(code, btn, t("copy"));
    });
  });
}

// ---------------------------------------------------------------------------
// Clipboard + toast helpers
// ---------------------------------------------------------------------------
function copyToClipboard(text, btnEl, restoreLabel) {
  navigator.clipboard.writeText(text).then(() => {
    const original = restoreLabel !== undefined ? restoreLabel : t("copy");
    btnEl.textContent = t("copied");
    btnEl.classList.add("copied");
    setTimeout(() => {
      btnEl.textContent = original;
      btnEl.classList.remove("copied");
    }, 1500);
  });
}

let toastTimer = null;
function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}
