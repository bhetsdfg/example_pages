/**
 * 1. Firebase Console > 專案設定 > 你的應用程式 > 網頁設定，複製 firebaseConfig。
 * 2. Authentication > Users 複製你的初始開發者 UID。
 * 3. 請將同一個 UID 填入 firestore.rules 的 DEVELOPER_UID。
 *
 * 這個網頁設定物件可以公開；不要把 serviceAccount/private_key 或密碼放進此檔案。
 */
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_FIREBASE_APP_ID"
};

// 只用於前端顯示。真正的授權由 firestore.rules 驗證。
export const DEVELOPER_UID = "PASTE_DEVELOPER_UID";
