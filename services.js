// ============================================================
// ملف الخدمات: services.js
// المسؤول عن الاتصال بقاعدة البيانات والعمليات الحسابية
// ============================================================

import { db } from "./firebase.js";
import { 
    collection, 
    addDoc, 
    getDocs, 
    updateDoc, 
    doc, 
    query, 
    where, 
    orderBy, 
    getDoc, 
    increment, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. إدارة المخزن (المنتجات) - Products
// ==========================================

// جلب كل المنتجات
export const getInventory = async () => {
    // نستخدم اسم المجموعة 'products' ليطابق قاعدة بياناتك
    const snap = await getDocs(collection(db, "products"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// إضافة منتج جديد
export const addProduct = async (name, buy, sell, stock) => {
    await addDoc(collection(db, "products"), {
        name: name,
        purchasePrice: Number(buy),
        salePrice: Number(sell),
        stock: Number(stock),
        createdAt: new Date()
    });
};

// ==========================================
// 2. إدارة العملاء والموردين (Partners)
// ==========================================

// جلب قائمة العملاء والموردين
export const getPartners = async () => {
    const snap = await getDocs(collection(db, "partners"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// إضافة شريك جديد
export const addPartner = async (name, type) => {
    await addDoc(collection(db, "partners"), { 
        name: name, 
        type: type, // 'customer' (عميل) أو 'supplier' (مورد)
        createdAt: new Date() 
    });
};

// ==========================================
// 3. المحرك الرئيسي: إنشاء الفواتير (Invoices)
// ==========================================

export const createInvoice = async (invoiceData) => {
    const batch = writeBatch(db); // بدء عملية مجمعة (Atomic Operation)

    // أ) حفظ بيانات الفاتورة الأساسية
    const invoiceRef = doc(collection(db, "invoices"));
    batch.set(invoiceRef, {
        ...invoiceData,
        // تأمين الأرقام وتحويلها
        total: Number(invoiceData.total),
        paid: Number(invoiceData.paid),
        createdAt: new Date()
    });

    // ب) معالجة الأصناف (تحديث المخزون والأسعار)
    invoiceData.items.forEach(item => {
        const productRef = doc(db, "products", item.productId);
        
        // حساب تغيير الكمية:
        // بيع = نقص (-)، شراء = زيادة (+)
        const changeAmount = invoiceData.type === 'sale' ? -Math.abs(item.quantity) : Math.abs(item.quantity);
        
        // تجهيز بيانات التحديث
        let updateData = { 
            stock: increment(changeAmount) 
        };

        // *** ميزة التحديث الذكي للأسعار عند الشراء ***
        if (invoiceData.type === 'purchase') {
            // 1. تحديث سعر الشراء لآخر سعر وردت به البضاعة
            updateData.purchasePrice = Number(item.price);
            
            // 2. تحديث سعر البيع (إذا قام المستخدم بتغييره في الفاتورة)
            if (item.updateSellPrice && Number(item.updateSellPrice) > 0) {
                updateData.salePrice = Number(item.updateSellPrice);
            }
        }
        
        // إضافة أمر التحديث للـ Batch
        batch.update(productRef, updateData);
    });

    // ج) تسجيل المعاملة المالية (الدين أو المستحقات)
    const total = Number(invoiceData.total);
    const paid = Number(invoiceData.paid) || 0;
    const remainingBalance = total - paid; // المتبقي

    // نسجل حركة مالية فقط إذا تبقى مبلغ أو تم دفع مبلغ
    if (remainingBalance !== 0 || paid > 0) {
        const transRef = doc(collection(db, "transactions"));
        
        // تحديد اتجاه المبلغ في كشف الحساب
        let amountToRecord = 0;
        
        if (invoiceData.type === 'sale') {
            // بيع: المتبقي هو دين على العميل (موجب +)
            amountToRecord = remainingBalance; 
        } else {
            // شراء: المتبقي هو دين علينا للمورد (سالب -)
            amountToRecord = -Math.abs(remainingBalance);
        }

        batch.set(transRef, {
            partnerId: invoiceData.partnerId,
            date: invoiceData.date,
            amount: Number(amountToRecord),
            type: invoiceData.type, // 'sale' or 'purchase'
            note: `فاتورة ${invoiceData.type === 'sale' ? 'بيع' : 'شراء'} رقم ${invoiceRef.id.substring(0, 6)}`,
            invoiceId: invoiceRef.id,
            createdAt: new Date()
        });
    }

    // تنفيذ كل العمليات دفعة واحدة
    await batch.commit();
};

// جلب سجل الفواتير للعرض
export const getInvoices = async () => {
    const q = query(collection(db, "invoices"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
        const data = d.data();
        return { 
            id: d.id, 
            ...data,
            // ضمان أن الحقول المالية أرقام دائماً لتجنب أخطاء العرض
            total: Number(data.total) || 0,
            paid: Number(data.paid) || 0
        };
    });
};

// ==========================================
// 4. كشف الحساب والتحصيل (Ledger)
// ==========================================

// تسجيل دفعة نقدية (قبض أو صرف)
export const addCashTransaction = async (partnerId, amount, date, note) => {
    // 1. معرفة نوع الشريك لتحديد اتجاه المال
    const partnerDoc = await getDoc(doc(db, "partners", partnerId));
    
    if (!partnerDoc.exists()) throw new Error("الشريك غير موجود");
    
    const partnerType = partnerDoc.data().type;
    let finalAmount = Number(amount);

    // قاعدة الإشارات المحاسبية:
    // العميل (Customer): الدفع ينقص دينه (إذن المبلغ بالسالب)
    // المورد (Supplier): الدفع ينقص ديننا له (إذن المبلغ بالموجب، لأن دينه أصلاً بالسالب)
    if (partnerType === 'customer') {
        finalAmount = -Math.abs(finalAmount);
    } else {
        finalAmount = Math.abs(finalAmount);
    }

    await addDoc(collection(db, "transactions"), {
        partnerId,
        amount: finalAmount,
        date,
        note: note || "دفعة نقدية",
        type: "cash_payment",
        createdAt: new Date()
    });
};

// جلب تفاصيل كشف الحساب والرصيد
export const getPartnerLedger = async (partnerId) => {
    // جلب بيانات الشريك
    const partnerDoc = await getDoc(doc(db, "partners", partnerId));
    
    // جلب كل الحركات المالية الخاصة به مرتبة بالتاريخ
    const q = query(
        collection(db, "transactions"),
        where("partnerId", "==", partnerId),
        orderBy("date", "asc")
    );
    
    const snap = await getDocs(q);
    const transactions = snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        amount: Number(d.data().amount) || 0 
    }));

    // حساب الرصيد التراكمي (مجموع الحركات)
    const currentBalance = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    return {
        partner: { id: partnerDoc.id, ...partnerDoc.data() },
        transactions: transactions,
        currentBalance: currentBalance
    };
};