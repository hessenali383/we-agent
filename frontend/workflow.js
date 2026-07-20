/**
 * Agent System Architecture visualization.
 *
 * ONE fixed, hardcoded diagram — not dynamically generated — laid out to
 * mirror the REAL backend implementation (each node's `source` field points
 * at the actual backend module/function responsible for that step):
 *
 *   user       -> POST /chat request received                (backend/app.py)
 *   language   -> language.detect_language()                 (backend/language.py)
 *   memory     -> MongoDBChatMessageHistory via RunnableWithMessageHistory (backend/mongo_service.py)
 *   prompt     -> ChatPromptTemplate assembly (merges language + memory)  (backend/agent.py)
 *   llm        -> ChatGoogleGenerativeAI (Gemini) tool-routing call (backend/agent.py)
 *   retriever  -> search_we_knowledge_base tool                (backend/tools.py)
 *   embedding  -> HuggingFaceEmbeddings / all-MiniLM-L6-v2, used inside the retriever (backend/vectorstore.py)
 *   qdrant     -> QdrantVectorStore similarity search, used inside the retriever (backend/vectorstore.py)
 *   context    -> retrieved chunks becoming tool-result context fed back to the LLM
 *   sql        -> save_user_profile tool -> SQLite             (backend/database.py)
 *   mongo      -> submit_support_ticket tool -> MongoDB tickets collection (backend/mongo_service.py)
 *   response   -> final, text-producing Gemini call            (backend/agent.py, same LLM instance as "llm")
 *   assistant  -> completed reply streamed back over SSE       (backend/app.py)
 *
 * Node positions are fixed and deliberately spread across both axes to
 * mirror the real branch/merge shape of the pipeline (language + memory
 * feeding prompt assembly; the LLM fanning out to three independent tool
 * paths; the retriever's own sub-branch; all paths converging back into a
 * single response) — this is a system-architecture diagram, not a line.
 *
 * Icons are referenced by filename only under `icons/` and are NOT bundled
 * here; a graceful initials-badge fallback renders until real files exist.
 */
(function () {
  "use strict";

  const VB_W = 1100;
  const VB_H = 880;

  const NODES = [
    {
      id: "user", x: 550, y: 50, size: "sm", icon: "user.svg",
      en: "User", ar: "المستخدم",
      descEn: "Customer message received by POST /chat.", descAr: "استقبال رسالة العميل عبر POST /chat.",
      source: "backend/app.py",
    },
    {
      id: "language", x: 300, y: 170, size: "sm", icon: "language.svg",
      en: "Language Detection", ar: "كشف اللغة",
      descEn: "Classifies the message as Arabic or English.", descAr: "تصنيف الرسالة كعربية أو إنجليزية.",
      source: "backend/language.py — detect_language()",
    },
    {
      id: "memory", x: 800, y: 170, size: "sm", icon: "memory.svg",
      en: "Memory", ar: "الذاكرة",
      descEn: "Loads prior turns from MongoDB chat history.", descAr: "تحميل المحادثات السابقة من MongoDB.",
      source: "backend/mongo_service.py — MongoDBChatMessageHistory",
    },
    {
      id: "prompt", x: 550, y: 280, size: "sm", icon: "prompt.svg",
      en: "Prompt Assembly", ar: "تجميع الطلب",
      descEn: "Merges system prompt, language directive, and history.", descAr: "دمج تعليمات النظام وتوجيه اللغة والسجل.",
      source: "backend/agent.py — ChatPromptTemplate",
    },
    {
      id: "llm", x: 550, y: 400, size: "lg", icon: "gemini.svg",
      en: "Gemini LLM", ar: "نموذج Gemini",
      descEn: "Decides whether to call a tool or answer directly.", descAr: "يقرر استدعاء أداة أو الإجابة مباشرة.",
      source: "backend/agent.py — ChatGoogleGenerativeAI",
    },
    {
      id: "retriever", x: 190, y: 500, size: "sm", icon: "retriever.svg",
      en: "Retriever", ar: "الاسترجاع",
      descEn: "search_we_knowledge_base tool call.", descAr: "استدعاء أداة البحث في قاعدة المعرفة.",
      source: "backend/tools.py — search_we_knowledge_base",
    },
    {
      id: "sql", x: 550, y: 540, size: "sm", icon: "sql.svg",
      en: "SQL Tool", ar: "أداة SQL",
      descEn: "save_user_profile tool call.", descAr: "استدعاء أداة حفظ بيانات العميل.",
      source: "backend/tools.py + database.py — SQLite",
    },
    {
      id: "mongo", x: 910, y: 500, size: "sm", icon: "mongodb.svg",
      en: "Mongo Tool", ar: "أداة Mongo",
      descEn: "submit_support_ticket tool call.", descAr: "استدعاء أداة تسجيل تذكرة الدعم.",
      source: "backend/tools.py + mongo_service.py — tickets collection",
    },
    {
      id: "embedding", x: 90, y: 610, size: "xs", icon: "embedding.svg",
      en: "MiniLM", ar: "MiniLM",
      descEn: "all-MiniLM-L6-v2 query embedding.", descAr: "تضمين السؤال بنموذج all-MiniLM-L6-v2.",
      source: "backend/vectorstore.py — HuggingFaceEmbeddings",
    },
    {
      id: "qdrant", x: 290, y: 610, size: "xs", icon: "qdrant.svg",
      en: "Qdrant", ar: "Qdrant",
      descEn: "Vector similarity search.", descAr: "بحث تشابه متجهي.",
      source: "backend/vectorstore.py — QdrantVectorStore",
    },
    {
      id: "context", x: 190, y: 700, size: "sm", icon: "context.svg",
      en: "RAG Context", ar: "سياق RAG",
      descEn: "Retrieved chunks returned as tool output.", descAr: "المقاطع المسترجعة كمخرجات للأداة.",
      source: "search_we_knowledge_base return value",
    },
    {
      id: "response", x: 550, y: 780, size: "sm", icon: "response.svg",
      en: "Response Generator", ar: "توليد الرد",
      descEn: "Final Gemini call producing the reply text.", descAr: "استدعاء Gemini الأخير لتوليد نص الرد.",
      source: "backend/agent.py — same Gemini instance, final pass",
    },
    {
      id: "assistant", x: 550, y: 850, size: "sm", icon: "assistant.svg",
      en: "Assistant", ar: "المساعد",
      descEn: "Completed reply streamed back over SSE.", descAr: "تسليم الرد الكامل عبر SSE.",
      source: "backend/app.py — /chat SSE stream",
    },
  ];

  // Fixed, hardcoded edges — the architecture's real data-flow relationships.
  // Branches: user -> {language, memory} -> prompt (merge); llm -> {retriever, sql, mongo} (fan-out);
  // retriever -> {embedding, qdrant} -> context (merge); {context, sql, mongo} -> response (merge).
  const CONNECTIONS = [
    ["user", "language"], ["user", "memory"],
    ["language", "prompt"], ["memory", "prompt"],
    ["prompt", "llm"],
    ["llm", "retriever"], ["llm", "sql"], ["llm", "mongo"],
    ["retriever", "embedding"], ["retriever", "qdrant"],
    ["embedding", "context"], ["qdrant", "context"],
    ["context", "response"], ["sql", "response"], ["mongo", "response"],
    ["response", "assistant"],
  ];

  const SIZE_PX = { xs: 40, sm: 52, lg: 68 };
  const PARTICLE_DURATION_MS = 480;

  let lang = "en";
  let container, svg, particle;
  let badgeEls = {};
  let edgeEls = {}; // key `${from}->${to}` -> path element
  let nodeState = {};
  let nodeDetail = {}; // last known full detail per node, for the debugger panel
  let particlePos = { x: 0, y: 0 };
  let particleAnim = null;
  let currentSettledNode = "user";
  let fadeTimer = null;
  let onNodeClick = null;

  function nodeById(id) {
    return NODES.find((n) => n.id === id);
  }

  function controlPoints(a, b) {
    const midY = (a.y + b.y) / 2;
    return [
      { x: a.x, y: a.y },
      { x: a.x, y: midY },
      { x: b.x, y: midY },
      { x: b.x, y: b.y },
    ];
  }

  function curvePathString(a, b) {
    const [p0, p1, p2, p3] = controlPoints(a, b);
    return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
  }

  function cubicBezierPoint(t, p0, p1, p2, p3) {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
  }

  function directEdgeKey(fromId, toId) {
    for (const [a, b] of CONNECTIONS) {
      if (a === fromId && b === toId) return `${a}->${b}`;
      if (a === toId && b === fromId) return `${a}->${b}`; // exists, but wrong direction for travel
    }
    return null;
  }

  function edgeElFor(fromId, toId) {
    const key1 = `${fromId}->${toId}`;
    const key2 = `${toId}->${fromId}`;
    return edgeEls[key1] || edgeEls[key2] || null;
  }

  function init(containerId, clickHandler) {
    container = document.getElementById(containerId);
    if (!container) return;
    onNodeClick = clickHandler || null;

    container.innerHTML = "";
    container.style.position = "relative";

    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${VB_W} ${VB_H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
    svg.classList.add("connector-svg");

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML =
      '<filter id="wf-glow" x="-200%" y="-200%" width="500%" height="500%">' +
      '<feGaussianBlur stdDeviation="5" result="blur"/>' +
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      "</filter>";
    svg.appendChild(defs);

    edgeEls = {};
    CONNECTIONS.forEach(([fromId, toId]) => {
      const a = nodeById(fromId);
      const b = nodeById(toId);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", curvePathString(a, b));
      path.classList.add("wf-edge");
      path.dataset.state = "idle";
      svg.appendChild(path);
      edgeEls[`${fromId}->${toId}`] = path;
    });

    particle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    particle.setAttribute("r", "7");
    particle.classList.add("wf-particle");
    particle.setAttribute("filter", "url(#wf-glow)");
    particle.style.opacity = "0";
    svg.appendChild(particle);

    container.appendChild(svg);

    const layer = document.createElement("div");
    layer.className = "node-layer";
    container.appendChild(layer);

    badgeEls = {};
    NODES.forEach((n) => {
      if (!(n.id in nodeState)) nodeState[n.id] = "idle";
      if (!(n.id in nodeDetail)) nodeDetail[n.id] = { status: "idle" };

      const leftPct = (n.x / VB_W) * 100;
      const topPct = (n.y / VB_H) * 100;
      const px = SIZE_PX[n.size] || SIZE_PX.sm;

      const wrap = document.createElement("button");
      wrap.type = "button";
      wrap.className = "wf-node";
      wrap.dataset.node = n.id;
      wrap.style.left = leftPct + "%";
      wrap.style.top = topPct + "%";
      wrap.style.setProperty("--node-size", px + "px");
      wrap.innerHTML =
        '<span class="wf-badge" data-status="idle">' +
        '<img class="wf-icon" src="icons/' + n.icon + '" alt="" ' +
        'onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" />' +
        '<span class="wf-fallback">' + (lang === "ar" ? n.ar : n.en).charAt(0) + "</span>" +
        "</span>" +
        '<span class="wf-label">' + (lang === "ar" ? n.ar : n.en) + "</span>";

      wrap.addEventListener("click", () => {
        if (onNodeClick) onNodeClick(n.id, nodeDetail[n.id], n);
      });

      layer.appendChild(wrap);
      badgeEls[n.id] = wrap.querySelector(".wf-badge");
    });

    currentSettledNode = "user";
    particlePos = { x: NODES[0].x, y: NODES[0].y };
    particle.setAttribute("cx", particlePos.x);
    particle.setAttribute("cy", particlePos.y);
  }

  function setLanguage(newLang) {
    lang = newLang === "ar" ? "ar" : "en";
    NODES.forEach((n) => {
      const wrap = container && container.querySelector(`.wf-node[data-node="${n.id}"]`);
      if (!wrap) return;
      wrap.querySelector(".wf-label").textContent = lang === "ar" ? n.ar : n.en;
      wrap.querySelector(".wf-fallback").textContent = (lang === "ar" ? n.ar : n.en).charAt(0);
    });
  }

  function setBadgeStatus(id, status) {
    nodeState[id] = status;
    const badge = badgeEls[id];
    if (badge) badge.dataset.status = status;
  }

  function setEdgeState(fromId, toId, state) {
    const el = edgeElFor(fromId, toId);
    if (el) el.dataset.state = state;
  }

  function reset() {
    NODES.forEach((n) => {
      setBadgeStatus(n.id, "idle");
      nodeDetail[n.id] = { status: "idle" };
    });
    Object.values(edgeEls).forEach((el) => (el.dataset.state = "idle"));

    if (particleAnim) cancelAnimationFrame(particleAnim);
    currentSettledNode = "user";
    particlePos = { x: NODES[0].x, y: NODES[0].y };
    particle.setAttribute("cx", particlePos.x);
    particle.setAttribute("cy", particlePos.y);
    particle.style.opacity = "0";
  }

  function travelTo(targetId) {
    const target = nodeById(targetId);
    if (!target) return;

    if (particleAnim) cancelAnimationFrame(particleAnim);

    const directKey = directEdgeKey(currentSettledNode, targetId);
    const useCurve = !!directKey && currentSettledNode !== targetId;
    const from = nodeById(currentSettledNode) || { x: particlePos.x, y: particlePos.y };
    const cps = useCurve ? controlPoints(from, target) : null;
    const startPos = { ...particlePos };
    const startTime = performance.now();

    if (useCurve) setEdgeState(currentSettledNode, targetId, "flowing");

    function tick(now) {
      const t = Math.min(1, (now - startTime) / PARTICLE_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);

      let point;
      if (cps) {
        point = cubicBezierPoint(eased, cps[0], cps[1], cps[2], cps[3]);
      } else {
        point = { x: startPos.x + (target.x - startPos.x) * eased, y: startPos.y + (target.y - startPos.y) * eased };
      }
      particlePos = point;
      particle.setAttribute("cx", point.x);
      particle.setAttribute("cy", point.y);

      if (t < 1) {
        particleAnim = requestAnimationFrame(tick);
      } else {
        if (useCurve) setEdgeState(currentSettledNode, targetId, "flowed");
        currentSettledNode = targetId;
      }
    }
    particleAnim = requestAnimationFrame(tick);
  }

  function update(node, status, label, duration_ms, metadata) {
    if (!badgeEls[node]) return;
    setBadgeStatus(node, status);
    nodeDetail[node] = {
      status,
      label: label || "",
      duration_ms: typeof duration_ms === "number" ? duration_ms : nodeDetail[node].duration_ms,
      metadata: metadata || nodeDetail[node].metadata,
      updatedAt: Date.now(),
    };

    clearTimeout(fadeTimer);

    if (status === "active" || status === "error") {
      particle.style.opacity = "1";
      travelTo(node);
    } else if (status === "done" && node === "assistant") {
      travelTo(node);
      fadeTimer = setTimeout(() => {
        particle.style.opacity = "0";
      }, 900);
    }
  }

  window.Workflow = { init, reset, update, setLanguage, nodeById };
})();
