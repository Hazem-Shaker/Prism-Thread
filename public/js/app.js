const API = "/api/conversations";

let activeConversationId = null;
let isLoading = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/** Circular avatars use SVG marks so “U” / “AI” text doesn’t distort at small sizes. */
const AVATAR_USER_SVG = `<svg class="message-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0114 0"/></svg>`;
const AVATAR_MODEL_SVG = `<svg class="message-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`;

const conversationList = $("#conversationList");
const messagesContainer = $("#messagesContainer");
const emptyState = $("#emptyState");
const messageForm = $("#messageForm");
const messageInput = $("#messageInput");
const sendBtn = $("#sendBtn");
const newChatBtn = $("#newChatBtn");
const chatTitle = $("#chatTitle");
const sidebarToggle = $("#sidebarToggle");
const sidebar = $("#sidebar");
const sidebarBackdrop = $("#sidebarBackdrop");

function setSidebarOpen(open) {
  sidebar.classList.toggle("open", open);
  if (sidebarBackdrop) {
    sidebarBackdrop.classList.toggle("visible", open);
    sidebarBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }
}
const modelSelector = $("#modelSelector");
const modelSelectorBtn = $("#modelSelectorBtn");
const modelSelectorLabel = $("#modelSelectorLabel");
const modelDropdown = $("#modelDropdown");
const attachBtn = $("#attachBtn");
const fileInput = $("#fileInput");
const micBtn = $("#micBtn");
const attachmentPreview = $("#attachmentPreview");

let selectedModelId = localStorage.getItem("selectedModel") || null;
let modelCatalog = [];
let pendingAttachments = [];
let mediaRecorder = null;
let isRecording = false;

// ── Sidebar toggle (mobile) ──
sidebarToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  setSidebarOpen(!sidebar.classList.contains("open"));
});

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));
}

document.addEventListener("click", (e) => {
  if (
    sidebar.classList.contains("open") &&
    !sidebar.contains(e.target) &&
    e.target !== sidebarToggle &&
    e.target !== sidebarBackdrop &&
    !modelSelector.contains(e.target)
  ) {
    setSidebarOpen(false);
  }
});

// ── Auto-resize textarea ──
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + "px";
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event("submit"));
  }
});

// ── API helpers ──
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Custom model dropdown ──
modelSelectorBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = modelDropdown.classList.contains("open");
  closeModelDropdown();
  if (!isOpen) {
    modelDropdown.classList.add("open");
    modelSelectorBtn.classList.add("open");
  }
});

document.addEventListener("click", (e) => {
  if (!modelSelector.contains(e.target)) {
    closeModelDropdown();
  }
});

function closeModelDropdown() {
  modelDropdown.classList.remove("open");
  modelSelectorBtn.classList.remove("open");
}

function selectModel(id) {
  const model = modelCatalog.find((m) => m.id === id);
  if (!model || !model.available) return;
  selectedModelId = id;
  localStorage.setItem("selectedModel", id);
  modelSelectorLabel.textContent = model.name;
  closeModelDropdown();
  renderModelDropdown();
  updateInputPlaceholder();
}

function updateInputPlaceholder() {
  const model = modelCatalog.find((m) => m.id === selectedModelId);
  if (model && model.capabilities.includes("imageGen")) {
    messageInput.placeholder = "Describe the image you want to generate...";
  } else {
    messageInput.placeholder = "Send a message...";
  }
}

function renderModelDropdown() {
  modelDropdown.innerHTML = "";
  const providers = {};
  modelCatalog.forEach((m) => {
    if (!providers[m.provider]) providers[m.provider] = [];
    providers[m.provider].push(m);
  });

  for (const [provider, models] of Object.entries(providers)) {
    const label = document.createElement("div");
    label.className = "model-group-label";
    label.textContent = provider;
    modelDropdown.appendChild(label);

    models.forEach((m) => {
      const opt = document.createElement("div");
      opt.className = "model-option" +
        (m.id === selectedModelId ? " active" : "") +
        (!m.available ? " disabled" : "");

      const caps = (m.capabilities || [])
        .map((c) => `<span class="cap-badge ${c}">${c}</span>`)
        .join("");

      let inner = `<div class="model-option-info">
          <div class="model-option-name">${escapeHtml(m.name)}</div>
          <div class="model-option-caps">${caps}</div>
        </div>`;

      if (!m.available) {
        inner += `<span class="model-option-badge">No key</span>`;
      } else if (m.id === selectedModelId) {
        inner += `<svg class="model-option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`;
      }

      opt.innerHTML = inner;

      if (m.available) {
        opt.addEventListener("click", () => selectModel(m.id));
      }

      modelDropdown.appendChild(opt);
    });
  }
}

async function loadModels() {
  try {
    modelCatalog = await apiGet("/api/models");

    const savedExists = modelCatalog.find(
      (m) => m.id === selectedModelId && m.available
    );
    if (!savedExists) {
      const first = modelCatalog.find((m) => m.available);
      selectedModelId = first ? first.id : null;
      if (selectedModelId) localStorage.setItem("selectedModel", selectedModelId);
    }

    const current = modelCatalog.find((m) => m.id === selectedModelId);
    modelSelectorLabel.textContent = current ? current.name : "No models available";

    renderModelDropdown();
    updateInputPlaceholder();
  } catch (err) {
    console.error("Failed to load models:", err);
  }
}

// ── Load sidebar conversations ──
async function loadConversations() {
  try {
    const conversations = await apiGet(API);
    renderSidebar(conversations);
  } catch (err) {
    console.error("Failed to load conversations:", err);
  }
}

function renderSidebar(conversations) {
  conversationList.innerHTML = "";
  conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className =
      "conversation-item" + (conv._id === activeConversationId ? " active" : "");
    item.innerHTML = `
      <span class="conversation-item-title">${escapeHtml(conv.title)}</span>
      <button class="delete-btn" title="Delete">&times;</button>
    `;

    item.querySelector(".conversation-item-title").addEventListener("click", () => {
      selectConversation(conv._id);
      setSidebarOpen(false);
    });

    item.querySelector(".delete-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteConversation(conv._id);
    });

    conversationList.appendChild(item);
  });
}

// ── Create new chat ──
newChatBtn.addEventListener("click", async () => {
  try {
    const conv = await apiPost(API, {});
    activeConversationId = conv._id;
    await loadConversations();
    renderMessages([]);
    setInputEnabled(true);
    chatTitle.textContent = "New Chat";
    setSidebarOpen(false);
    messageInput.focus();
  } catch (err) {
    console.error("Failed to create conversation:", err);
  }
});

// ── Select conversation ──
async function selectConversation(id) {
  try {
    activeConversationId = id;
    const conv = await apiGet(`${API}/${id}`);
    chatTitle.textContent = conv.title;
    renderMessages(conv.messages);
    setInputEnabled(true);
    await loadConversations();
    messageInput.focus();
  } catch (err) {
    console.error("Failed to load conversation:", err);
  }
}

// ── Delete conversation ──
async function deleteConversation(id) {
  try {
    await apiDelete(`${API}/${id}`);
    if (activeConversationId === id) {
      activeConversationId = null;
      messagesContainer.innerHTML = "";
      messagesContainer.appendChild(emptyState);
      emptyState.style.display = "flex";
      setInputEnabled(false);
      chatTitle.textContent = "Select or start a conversation";
    }
    await loadConversations();
  } catch (err) {
    console.error("Failed to delete conversation:", err);
  }
}

// ── Capability helpers ──
function getCurrentModelCaps() {
  const model = modelCatalog.find((m) => m.id === selectedModelId);
  return model ? model.capabilities || [] : [];
}

function showToast(message, duration = 4000) {
  const existing = document.querySelector(".toast-notification");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function validateAttachment(file) {
  const caps = getCurrentModelCaps();
  const isImage = file.type.startsWith("image/");

  if (caps.includes("imageGen")) {
    showToast("Switch to a chat model (e.g. Gemini) to attach files.");
    return false;
  }

  if (isImage && !caps.includes("vision")) {
    showToast("Switch to Gemini to attach images (it supports vision). Other models only accept text files.");
    return false;
  }

  if (!isImage && !caps.includes("file")) {
    showToast("The selected model does not support file attachments.");
    return false;
  }

  return true;
}

// ── Attachment handling ──
attachBtn.addEventListener("click", () => {
  fileInput.click();
});

async function uploadFile(file) {
  if (!validateAttachment(file)) return;

  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error(await res.text());
    const parsed = await res.json();

    pendingAttachments.push(parsed);
    renderAttachmentPreview();
  } catch (err) {
    console.error("Upload failed:", err);
    showToast("Failed to upload file: " + (err.message || "Unknown error"));
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = "";
  await uploadFile(file);
});

// ── Drag and drop ──
const chatMain = $(".chat-main");

chatMain.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  chatMain.classList.add("drag-over");
});

chatMain.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!chatMain.contains(e.relatedTarget)) {
    chatMain.classList.remove("drag-over");
  }
});

chatMain.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  chatMain.classList.remove("drag-over");

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  if (!activeConversationId) {
    showToast("Start a conversation first before attaching files.");
    return;
  }

  for (const file of files) {
    await uploadFile(file);
  }
});

function renderAttachmentPreview() {
  attachmentPreview.innerHTML = "";
  pendingAttachments.forEach((att, idx) => {
    const item = document.createElement("div");
    item.className = "attachment-preview-item";

    if (att.type === "image") {
      item.innerHTML = `
        <img src="data:${att.mimeType};base64,${att.data}" alt="${escapeHtml(att.filename)}" />
        <span class="att-name">${escapeHtml(att.filename)}</span>
        <button class="att-remove" data-idx="${idx}">&times;</button>
      `;
    } else {
      item.innerHTML = `
        <span class="att-name">${escapeHtml(att.filename)}</span>
        <button class="att-remove" data-idx="${idx}">&times;</button>
      `;
    }

    item.querySelector(".att-remove").addEventListener("click", () => {
      pendingAttachments.splice(idx, 1);
      renderAttachmentPreview();
    });

    attachmentPreview.appendChild(item);
  });
}

// ── Send message ──
messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeConversationId || isLoading) return;

  const validModel = modelCatalog.find(
    (m) => m.id === selectedModelId && m.available
  );
  if (!validModel) {
    appendMessage("model", "Error: Please select a valid model from the dropdown.");
    return;
  }

  messageInput.value = "";
  messageInput.style.height = "auto";
  setLoading(true);

  const isImageGen = validModel.capabilities.includes("imageGen");

  if (isImageGen) {
    appendMessage("user", text);
    const typingEl = appendTypingIndicator();

    try {
      const result = await apiPost("/api/image/generate", {
        prompt: text,
        conversationId: activeConversationId,
      });
      typingEl.remove();
      appendMessage("model", result.modelMsg.content, {
        imageUrl: result.modelMsg.imageUrl,
      });
      if (result.title) chatTitle.textContent = result.title;
      await loadConversations();
    } catch (err) {
      typingEl.remove();
      appendMessage("model", "Error: " + (err.message || "Image generation failed"));
    } finally {
      setLoading(false);
      messageInput.focus();
    }
    return;
  }

  if (pendingAttachments.length > 0) {
    const caps = getCurrentModelCaps();
    const hasImages = pendingAttachments.some((a) => a.type === "image");
    if (hasImages && !caps.includes("vision")) {
      showToast("Switch to Gemini to send images — it supports vision. Other models only accept text files.");
      setLoading(false);
      return;
    }
  }

  const attachmentsToSend = [...pendingAttachments];
  pendingAttachments = [];
  renderAttachmentPreview();

  appendMessage("user", text, { attachments: attachmentsToSend });
  const typingEl = appendTypingIndicator();

  try {
    const result = await apiPost(`${API}/${activeConversationId}/messages`, {
      message: text,
      model: selectedModelId,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
    });
    typingEl.remove();
    appendMessage("model", result.modelMsg.content);

    if (result.title) {
      chatTitle.textContent = result.title;
    }
    await loadConversations();
  } catch (err) {
    typingEl.remove();
    appendMessage("model", "Error: " + (err.message || "Something went wrong"));
  } finally {
    setLoading(false);
    messageInput.focus();
  }
});

// ── Render all messages ──
function renderMessages(messages) {
  messagesContainer.innerHTML = "";

  if (!messages || messages.length === 0) {
    messagesContainer.appendChild(emptyState);
    emptyState.style.display = "flex";
    return;
  }

  emptyState.style.display = "none";
  messages.forEach((msg) =>
    appendMessage(msg.role, msg.content, {
      attachments: msg.attachments,
      imageUrl: msg.imageUrl,
    })
  );
}

// ── Append a single message ──
function appendMessage(role, content, opts = {}) {
  emptyState.style.display = "none";
  if (emptyState.parentElement === messagesContainer) {
    messagesContainer.removeChild(emptyState);
  }

  const el = document.createElement("div");
  el.className = `message ${role}`;

  const avatarInner = role === "user" ? AVATAR_USER_SVG : AVATAR_MODEL_SVG;
  const avatarLabel = role === "user" ? "You" : "Assistant";
  const rendered = role === "model" ? marked.parse(content) : escapeHtml(content);

  let attachmentHtml = "";
  if (opts.attachments && opts.attachments.length > 0) {
    attachmentHtml = '<div class="message-attachments">';
    opts.attachments.forEach((att) => {
      if (att.type === "image" && att.data) {
        attachmentHtml += `<img class="message-attachment-thumb" src="data:${att.mimeType};base64,${att.data}" alt="${escapeHtml(att.filename || "image")}" />`;
      } else if (att.filename) {
        attachmentHtml += `<span class="message-attachment-file">${escapeHtml(att.filename)}</span>`;
      }
    });
    attachmentHtml += "</div>";
  }

  let imageHtml = "";
  if (opts.imageUrl) {
    imageHtml = `<div class="message-image-wrap">
      <img class="message-image" src="${opts.imageUrl}" alt="Generated image" style="display:block;" />
    </div>`;
  }

  let ttsHtml = "";
  if (role === "model" && !opts.imageUrl) {
    ttsHtml = `
      <button class="tts-btn" title="Read aloud">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 010 14.14"/>
          <path d="M15.54 8.46a5 5 0 010 7.07"/>
        </svg>
      </button>
    `;
  }

  el.innerHTML = `
    <div class="message-row">
      <div class="message-avatar" role="img" aria-label="${avatarLabel}">${avatarInner}</div>
      <div class="message-content">
        ${attachmentHtml}
        ${rendered}
        ${imageHtml}
        ${ttsHtml}
      </div>
    </div>
  `;

  const ttsBtn = el.querySelector(".tts-btn");
  if (ttsBtn) {
    ttsBtn.addEventListener("click", () => handleTTS(ttsBtn, content));
  }

  messagesContainer.appendChild(el);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ── TTS ──
function handleTTS(btn, text) {
  if (btn.classList.contains("speaking")) {
    speechSynthesis.cancel();
    btn.classList.remove("speaking");
    return;
  }

  const plain = text.replace(/[#*_`~\[\]()>]/g, "").replace(/<[^>]*>/g, "");
  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.onend = () => btn.classList.remove("speaking");
  utterance.onerror = () => btn.classList.remove("speaking");

  speechSynthesis.cancel();
  btn.classList.add("speaking");
  speechSynthesis.speak(utterance);
}

// ── STT (Microphone) ──
micBtn.addEventListener("click", async () => {
  if (isRecording) {
    stopRecording();
    return;
  }
  startRecording();
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: "audio/webm" });
      micBtn.classList.remove("recording");
      isRecording = false;

      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        if (data.text) {
          messageInput.value += (messageInput.value ? " " : "") + data.text;
          messageInput.dispatchEvent(new Event("input"));
          messageInput.focus();
        }
      } catch (err) {
        console.error("Transcription failed:", err);
        alert("Transcription failed: " + (err.message || "Unknown error"));
      }
    };

    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add("recording");
  } catch (err) {
    console.error("Mic access denied:", err);
    alert("Microphone access denied. Please allow microphone access.");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

// ── Thinking indicator ──
function appendTypingIndicator() {
  const el = document.createElement("div");
  el.className = "message model";
  el.innerHTML = `
    <div class="message-row">
      <div class="message-avatar" role="img" aria-label="Assistant">${AVATAR_MODEL_SVG}</div>
      <div class="message-content">
        <div class="thinking-indicator">
          <span class="thinking-text">Thinking</span>
          <div class="thinking-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
        <div class="thinking-shimmer"></div>
      </div>
    </div>
  `;
  messagesContainer.appendChild(el);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return el;
}

// ── UI state helpers ──
function setInputEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
}

function setLoading(loading) {
  isLoading = loading;
  sendBtn.disabled = loading;
  messageInput.disabled = loading;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── Init ──
async function init() {
  await loadModels();
  const conversations = await apiGet(API);
  renderSidebar(conversations);

  const emptyChat = conversations.find(
    (c) => c.title === "New Chat"
  );

  if (emptyChat) {
    await selectConversation(emptyChat._id);
  } else {
    const conv = await apiPost(API, {});
    activeConversationId = conv._id;
    renderMessages([]);
    setInputEnabled(true);
    chatTitle.textContent = "New Chat";
    await loadConversations();
  }

  messageInput.focus();
}

init();
