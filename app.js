import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { firebaseConfig, DEVELOPER_UID } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  profile: null,
  users: [],
  announcements: [],
  editingId: null,
  section: "announcements",
  pendingRegistration: null,
  unsubscribeProfile: null,
  unsubscribeUsers: null,
  unsubscribeAnnouncements: null,
  authGeneration: 0
};

let auth;
let db;
let noticeTimer;

function isConfigured() {
  return typeof DEVELOPER_UID === "string"
    && DEVELOPER_UID.trim().length > 0
    && !DEVELOPER_UID.includes("PASTE_")
    && ["apiKey", "authDomain", "projectId", "appId"].every((key) =>
      typeof firebaseConfig[key] === "string"
      && firebaseConfig[key].trim().length > 0
      && !firebaseConfig[key].includes("PASTE_")
    );
}

function showNotice(message, error = false) {
  const notice = $("notice");
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.toggle("error", error);
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 6200);
}

function explainError(error) {
  const messageByCode = {
    "auth/invalid-credential": "帳號或密碼不正確。",
    "auth/email-already-in-use": "這個電子郵件已被註冊。",
    "auth/weak-password": "密碼強度不足，請使用更安全的密碼。",
    "auth/invalid-email": "電子郵件格式不正確。",
    "auth/too-many-requests": "登入嘗試過於頻繁，請稍後再試。",
    "auth/operation-not-allowed": "請先在 Firebase 啟用 Email/Password 登入。",
    "permission-denied": "Firebase 拒絕此次操作，請檢查安全規則及帳號權限。"
  };
  return messageByCode[error?.code] || error?.message || "發生未知錯誤。";
}

function setBusy(form, busy) {
  for (const button of form.querySelectorAll('button[type="submit"]')) {
    button.disabled = busy;
  }
}

function isDeveloper() {
  return state.user?.uid === DEVELOPER_UID;
}

function isAdmin() {
  return state.profile?.role === "admin";
}

function stopListeners() {
  for (const key of ["unsubscribeProfile", "unsubscribeUsers", "unsubscribeAnnouncements"]) {
    if (state[key]) state[key]();
    state[key] = null;
  }
}

function switchAuthForm(type) {
  const login = type === "login";
  $("login-form").hidden = !login;
  $("register-form").hidden = login;
  $("login-tab").classList.toggle("active", login);
  $("register-tab").classList.toggle("active", !login);
  $("login-tab").setAttribute("aria-selected", String(login));
  $("register-tab").setAttribute("aria-selected", String(!login));
}

function switchSection(section) {
  if (section === "users" && !isDeveloper()) return;
  state.section = section;
  $("announcements-section").hidden = section !== "announcements";
  $("users-section").hidden = section !== "users";
  $("announcements-nav").classList.toggle("selected", section === "announcements");
  $("users-nav").classList.toggle("selected", section === "users");
}

function showAuthPanel() {
  $("setup-panel").hidden = true;
  $("auth-panel").hidden = false;
  $("app-panel").hidden = true;
}

function showAppPanel() {
  $("setup-panel").hidden = true;
  $("auth-panel").hidden = true;
  $("app-panel").hidden = false;
}

// 使用 Auth UID 建立 Student 文件。若文件已存在（例如開發者），絕不覆蓋。
async function ensureProfile(user) {
  const profileRef = doc(db, "users", user.uid);
  const existing = await getDoc(profileRef);
  if (existing.exists()) return;

  const pendingName = state.pendingRegistration?.email === user.email
    ? state.pendingRegistration.displayName : null;
  const suggestedName = (pendingName || (user.email || "Student").split("@")[0]).slice(0, 80);
  await setDoc(profileRef, {
    displayName: suggestedName || "Student",
    email: user.email,
    role: "student",
    createdAt: serverTimestamp()
  });
  state.pendingRegistration = null;
}

function createElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = String(content);
  return element;
}

function formatDate(timestamp) {
  try {
    return timestamp?.toDate().toLocaleString("zh-TW", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    }) || "剛剛";
  } catch {
    return "剛剛";
  }
}

function resetEditor() {
  state.editingId = null;
  $("announcement-form").reset();
  $("announcement-form").hidden = true;
  $("editor-title").textContent = "新增公告";
}

function openEditor(announcement = null) {
  if (!isAdmin()) return;
  state.editingId = announcement?.id || null;
  $("announcement-form").hidden = false;
  $("editor-title").textContent = announcement ? "編輯公告" : "新增公告";
  $("announcement-title").value = announcement?.title || "";
  $("announcement-body").value = announcement?.body || "";
  $("announcement-title").focus();
  $("announcement-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderAnnouncements() {
  const list = $("announcement-list");
  list.replaceChildren();
  if (!state.announcements.length) {
    list.append(createElement("div", "empty-state", "目前還沒有公告。管理員可以新增第一則公告。"));
    return;
  }

  for (const announcement of state.announcements) {
    const card = createElement("article", "announcement");
    const header = createElement("div", "announcement-header");
    const details = createElement("div");
    details.append(createElement("h3", "", announcement.title));
    details.append(createElement("div", "announcement-meta", `發布時間：${formatDate(announcement.createdAt)}`));
    header.append(details);

    if (isAdmin()) {
      const actions = createElement("div", "announcement-actions");
      const editButton = createElement("button", "ghost-button", "編輯");
      editButton.type = "button";
      editButton.addEventListener("click", () => openEditor(announcement));
      const deleteButton = createElement("button", "danger-button", "刪除");
      deleteButton.type = "button";
      deleteButton.addEventListener("click", async () => {
        if (!isAdmin() || !window.confirm(`確定刪除「${announcement.title}」嗎？`)) return;
        deleteButton.disabled = true;
        try {
          await deleteDoc(doc(db, "announcements", announcement.id));
          if (state.editingId === announcement.id) resetEditor();
          showNotice("公告已刪除。");
        } catch (error) {
          showNotice(explainError(error), true);
          deleteButton.disabled = false;
        }
      });
      actions.append(editButton, deleteButton);
      header.append(actions);
    }

    card.append(header, createElement("p", "announcement-body", announcement.body));
    list.append(card);
  }
}

function renderUsers() {
  const list = $("users-list");
  list.replaceChildren();
  $("users-count").textContent = `${state.users.length} 位`;

  const sorted = [...state.users].sort((a, b) => {
    if (a.id === DEVELOPER_UID) return -1;
    if (b.id === DEVELOPER_UID) return 1;
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return (a.displayName || "").localeCompare(b.displayName || "", "zh-Hant");
  });

  if (!sorted.length) {
    list.append(createElement("div", "empty-state", "目前沒有使用者資料。"));
    return;
  }

  for (const user of sorted) {
    const row = createElement("div", "user-row");
    const info = createElement("div", "user-id");
    const avatar = createElement("div", "avatar", (user.displayName || "U").slice(0, 1).toUpperCase());
    const text = createElement("div");
    text.append(createElement("div", "user-name", user.displayName || "未設定姓名"));
    text.append(createElement("div", "user-email", user.email || user.id));
    info.append(avatar, text);

    const actions = createElement("div", "user-actions");
    const roleLabel = createElement("span", `user-role ${user.role === "admin" ? "is-admin" : ""}`, user.role === "admin" ? "Admin" : "Student");
    actions.append(roleLabel);

    if (user.id === DEVELOPER_UID) {
      actions.append(createElement("span", "developer-tag", "初始開發者"));
    } else {
      const promoted = user.role === "admin";
      const button = createElement("button", promoted ? "danger-button" : "outline-button", promoted ? "撤銷 Admin" : "授予 Admin");
      button.type = "button";
      button.addEventListener("click", async () => {
        const nextRole = promoted ? "student" : "admin";
        const actionName = promoted ? "撤銷" : "授予";
        if (!window.confirm(`確定要${actionName}「${user.displayName || user.email}」的 Admin 權限嗎？\n\n請先確認此人的帳號身分。`)) return;
        button.disabled = true;
        try {
          await updateDoc(doc(db, "users", user.id), { role: nextRole });
          showNotice(`已將 ${user.displayName || user.email} 設為 ${nextRole}。`);
        } catch (error) {
          showNotice(explainError(error), true);
          button.disabled = false;
        }
      });
      actions.append(button);
    }

    row.append(info, actions);
    list.append(row);
  }
}

function renderDashboard() {
  if (!state.user || !state.profile) return;
  showAppPanel();
  $("display-name").textContent = state.profile.displayName || "使用者";
  $("account-email").textContent = state.user.email || "";
  const roleBadge = $("role-badge");
  roleBadge.textContent = isDeveloper() ? "Developer · Admin" : (isAdmin() ? "Admin" : "Student");
  roleBadge.classList.toggle("admin", isAdmin());
  $("users-nav").hidden = !isDeveloper();
  $("new-announcement-button").hidden = !isAdmin();
  if (!isAdmin()) resetEditor();
  if (!isDeveloper() && state.section === "users") switchSection("announcements");
  renderAnnouncements();
}

function subscribeAnnouncements() {
  if (state.unsubscribeAnnouncements) return;
  state.unsubscribeAnnouncements = onSnapshot(collection(db, "announcements"), (snapshot) => {
    state.announcements = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 100);
    renderAnnouncements();
  }, (error) => showNotice(`讀取公告失敗：${explainError(error)}`, true));
}

function subscribeUsers() {
  if (state.unsubscribeUsers || !isDeveloper()) return;
  state.unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
    state.users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderUsers();
  }, (error) => showNotice(`讀取使用者失敗：${explainError(error)}`, true));
}

function watchProfile(user) {
  state.unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
    if (!snapshot.exists()) {
      showNotice("找不到使用者資料，請重新登入。", true);
      return;
    }
    state.profile = snapshot.data();
    renderDashboard();
    subscribeAnnouncements();
    if (isDeveloper()) subscribeUsers();
  }, (error) => showNotice(`讀取身分失敗：${explainError(error)}`, true));
}

function wireEvents() {
  $("login-tab").addEventListener("click", () => switchAuthForm("login"));
  $("register-tab").addEventListener("click", () => switchAuthForm("register"));
  $("announcements-nav").addEventListener("click", () => switchSection("announcements"));
  $("users-nav").addEventListener("click", () => switchSection("users"));
  $("cancel-editor-button").addEventListener("click", resetEditor);
  $("new-announcement-button").addEventListener("click", () => openEditor());

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(form, true);
    try {
      await signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-password").value);
      form.reset();
    } catch (error) {
      showNotice(explainError(error), true);
    } finally {
      setBusy(form, false);
    }
  });

  $("register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(form, true);
    const email = $("register-email").value.trim();
    state.pendingRegistration = { email, displayName: $("register-name").value.trim() };
    try {
      // Auth 建立使用者後，onAuthStateChanged 會自動建立 student 文件。
      await createUserWithEmailAndPassword(auth, email, $("register-password").value);
      showNotice("帳號建立成功！預設身分為 Student。");
      form.reset();
    } catch (error) {
      state.pendingRegistration = null;
      showNotice(explainError(error), true);
    } finally {
      setBusy(form, false);
    }
  });

  $("announcement-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const form = event.currentTarget;
    setBusy(form, true);
    const title = $("announcement-title").value.trim();
    const body = $("announcement-body").value.trim();
    if (!title || !body) {
      showNotice("標題及內容不可空白。", true);
      setBusy(form, false);
      return;
    }
    try {
      if (state.editingId) {
        await updateDoc(doc(db, "announcements", state.editingId), { title, body, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "announcements"), {
          title, body, createdBy: state.user.uid,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
      }
      resetEditor();
      showNotice("公告已儲存。");
    } catch (error) {
      showNotice(explainError(error), true);
    } finally {
      setBusy(form, false);
    }
  });

  $("logout-button").addEventListener("click", async () => {
    try {
      await signOut(auth);
      showNotice("已安全登出。");
    } catch (error) {
      showNotice(explainError(error), true);
    }
  });
}

function start() {
  if (!isConfigured()) {
    $("setup-panel").hidden = false;
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  wireEvents();
  showAuthPanel();

  onAuthStateChanged(auth, async (user) => {
    const generation = ++state.authGeneration;
    stopListeners();
    state.user = user;
    state.profile = null;
    state.announcements = [];
    state.users = [];
    state.editingId = null;
    state.section = "announcements";
    switchSection("announcements");

    if (!user) {
      showAuthPanel();
      return;
    }

    try {
      await ensureProfile(user);
      if (generation !== state.authGeneration) return;
      watchProfile(user);
    } catch (error) {
      if (generation !== state.authGeneration) return;
      showAuthPanel();
      showNotice(`帳號初始化失敗：${explainError(error)}。請確認 Firestore 規則已發布。`, true);
    }
  });
}

start();
