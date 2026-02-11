// استيراد المكتبات اللازمة من Firebase CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ==========================================
// 1. إعدادات مشروعك (Firebase Config)
// ==========================================
// ملاحظة: استبدل القيم أدناه ببيانات مشروعك من لوحة تحكم Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAVVTecGmQxn5o1voLZh8sKKsN5Vf2GVrs",
  authDomain: "sanitary-store-system.firebaseapp.com",
  projectId: "sanitary-store-system",
  storageBucket: "sanitary-store-system.firebasestorage.app",
  messagingSenderId: "760598766364",
  appId: "1:760598766364:web:a4254f51ac09cd1b8650d9"
};


// تهيئة Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ==========================================
// 2. نظام حماية الدخول (System Login)
// ==========================================

// الرمز السري للدخول للنظام (يمكنك تغييره هنا)
const SYSTEM_PASSWORD = "975140"; 

// دالة تسجيل الدخول
export const systemLogin = async (password) => {
    if (password === SYSTEM_PASSWORD) {
        try {
            // تسجيل دخول مجهول (Anonymous) لتفعيل حماية Firebase
            await signInAnonymously(auth);
            localStorage.setItem('system_auth', 'true');
            return true;
        } catch (error) {
            console.error("خطأ في المصادقة مع سيرفر جوجل:", error);
            return false;
        }
    }
    return false;
};

// دالة تسجيل الخروج
export const systemLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('system_auth');
    window.location.reload();
};

// دالة التحقق من حالة الدخول (تستخدم عند فتح التطبيق)
export const checkAuthState = (callback) => {
    onAuthStateChanged(auth, (user) => {
        const hasLocalAuth = localStorage.getItem('system_auth') === 'true';
        if (user && hasLocalAuth) {
            callback(true);
        } else {
            callback(false);
        }
    });
};