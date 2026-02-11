// ============================================================
// 1. الاستيراد (Imports)
// ============================================================
import { checkAuthState, systemLogin, systemLogout } from "./firebase.js";
import * as services from "./services.js";

// ============================================================
// 2. المتغيرات العامة (Global Variables)
// ============================================================
let currentInvoiceItems = []; 
let allProducts = [];         
let allPartners = [];         

// ============================================================
// 3. إدارة التنقل والمشاهد (Navigation)
// ============================================================
function showView(viewId) {
    document.querySelectorAll('.app-view').forEach(view => {
        view.style.display = 'none';
    });
    
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'block';
        loadViewData(viewId);
    }
}

// تفعيل أزرار القائمة
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        showView(targetId);
    });
});

// تفعيل أزرار العودة
document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        showView(targetId);
    });
});

// تفعيل زر الفاتورة السريعة في الرئيسية
const btnQuick = document.getElementById('btn-quick-invoice');
if (btnQuick) {
    btnQuick.addEventListener('click', () => showView('view-create-invoice'));
}

// ============================================================
// 4. المصادقة (Authentication)
// ============================================================
checkAuthState((isLoggedIn) => {
    if (isLoggedIn) {
        document.getElementById('view-login').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        showView('view-dashboard');
    } else {
        document.getElementById('view-login').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});

const loginForm = document.getElementById('form-login');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pass = document.getElementById('login-password').value;
        const success = await systemLogin(pass);
        if (success) {
            window.location.reload();
        } else {
            document.getElementById('login-error').innerText = "رمز الدخول غير صحيح";
        }
    });
}

document.getElementById('btn-logout').addEventListener('click', () => systemLogout());

// ============================================================
// 5. إدارة المخزن (Inventory)
// ============================================================
async function renderInventory() {
    const list = await services.getInventory();
    const searchInput = document.getElementById('inventory-search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
    
    const tbody = document.getElementById('inventory-list-body');
    if (tbody) {
        tbody.innerHTML = list
            .filter(item => item.name.toLowerCase().includes(searchTerm))
            .map(item => `
                <tr>
                    <td>${item.name}</td>
                    <td>${Number(item.purchasePrice).toFixed(2)}</td>
                    <td>${Number(item.salePrice).toFixed(2)}</td>
                    <td style="font-weight:bold; color: ${item.stock <= 5 ? 'red' : 'green'}">${item.stock}</td>
                    <td>5</td>
                </tr>
            `).join('');
    }
}

const invSearch = document.getElementById('inventory-search-input');
if (invSearch) invSearch.addEventListener('input', renderInventory);

// ============================================================
// 6. إدارة العملاء والموردين (Partners)
// ============================================================
async function renderPartners() {
    allPartners = await services.getPartners();
    
    const typeFilter = document.getElementById('partner-type-filter').value;
    const searchTerm = document.getElementById('partner-search-input').value.toLowerCase();

    let filtered = allPartners;
    if (typeFilter !== 'all') {
        filtered = filtered.filter(p => p.type === typeFilter);
    }
    if (searchTerm) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm));
    }

    const tbody = document.getElementById('partners-list-body');
    if (tbody) {
        tbody.innerHTML = filtered.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>${p.type === 'customer' ? 'عميل' : 'مورد'}</td>
                <td class="no-print">
                    <button class="btn-primary" onclick="window.openLedger('${p.id}')">كشف حساب</button>
                </td>
            </tr>
        `).join('');
    }
}

const partnerFilter = document.getElementById('partner-type-filter');
if (partnerFilter) partnerFilter.addEventListener('change', renderPartners);

const partnerSearch = document.getElementById('partner-search-input');
if (partnerSearch) partnerSearch.addEventListener('input', renderPartners);

// ============================================================
// 7. كشف الحساب (Ledger)
// ============================================================
window.openLedger = async (partnerId) => {
    const data = await services.getPartnerLedger(partnerId);
    showView('view-partner-details');
    
    document.getElementById('ledger-partner-name').innerText = data.partner.name;
    const balanceEl = document.getElementById('ledger-current-balance');
    const balance = Number(data.currentBalance);
const absBalance = Math.abs(balance);

let balanceText = "";

if (balance > 0) {
    balanceText = `عليه: ${absBalance.toFixed(2)} ج`;
    balanceEl.style.color = '#27ae60'; // أخضر
}
else if (balance < 0) {
    balanceText = `له: ${absBalance.toFixed(2)} ج`;
    balanceEl.style.color = '#c0392b'; // أحمر
}
else {
    balanceText = `الرصيد: 0.00 ج`;
    balanceEl.style.color = '#2c3e50';
}

balanceEl.innerText = balanceText;


    const tbody = document.getElementById('ledger-transactions-body');
    tbody.innerHTML = data.transactions.map(tx => {
        let typeName = tx.type === 'sale' ? 'فاتورة بيع' : (tx.type === 'purchase' ? 'فاتورة شراء' : 'دفعة نقدية');
        return `
            <tr>
                <td>${tx.date}</td>
                <td>${typeName}</td>
                <td dir="ltr">${Number(tx.amount).toFixed(2)}</td>
                <td>${tx.note || '-'}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('payment-partner-id').value = partnerId;
    document.getElementById('payment-partner-name-display').innerText = data.partner.name;
};

// ============================================================
// 8. منطق الفاتورة (Invoice Logic)
// ============================================================

// أ) التعامل مع تغيير نوع الفاتورة (بيع/شراء)
function handleInvoiceTypeChange() {
    const type = document.getElementById('invoice-type').value;
    const labelPrice = document.getElementById('label-price-display');
    const newSellGroup = document.getElementById('group-new-sell-price');
    
    if (type === 'purchase') {
        if(labelPrice) labelPrice.innerText = "سعر الشراء";
        if(newSellGroup) newSellGroup.style.display = 'block'; // إظهار حقل تحديث السعر
    } else {
        if(labelPrice) labelPrice.innerText = "سعر البيع";
        if(newSellGroup) newSellGroup.style.display = 'none'; // إخفاء حقل تحديث السعر
    }
    updatePartnerSelect();
}

const invTypeSelect = document.getElementById('invoice-type');
if (invTypeSelect) invTypeSelect.addEventListener('change', handleInvoiceTypeChange);

// ب) تحديث قائمة العملاء والموردين
async function updatePartnerSelect() {
    const type = document.getElementById('invoice-type').value;
    if (allPartners.length === 0) allPartners = await services.getPartners();
    
    const targetType = (type === 'sale') ? 'customer' : 'supplier';
    const filtered = allPartners.filter(p => p.type === targetType);
    
    const select = document.getElementById('invoice-partner-select');
    select.innerHTML = '<option value="">-- اختر --</option>' + 
        filtered.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

// ج) تجهيز النموذج
async function prepareInvoiceForm() {
    allProducts = await services.getInventory();
    currentInvoiceItems = [];
    document.getElementById('invoice-date').valueAsDate = new Date();
    document.getElementById('invoice-paid-amount').value = 0;
    
    // إعادة تعيين الحقول
    handleInvoiceTypeChange();
    renderInvoiceTable();
}

// د) البحث الذكي
const prodSearch = document.getElementById('invoice-product-search');
if (prodSearch) {
    prodSearch.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const resDiv = document.getElementById('product-search-results');
        
        if (term.length < 1) { resDiv.style.display = 'none'; return; }
        
        const matches = allProducts.filter(p => p.name.toLowerCase().includes(term));
        if (matches.length > 0) {
            resDiv.style.display = 'block';
            resDiv.innerHTML = matches.map(p => `
                <div class="search-item" onclick="window.selectProduct('${p.id}', '${p.name}', ${p.purchasePrice}, ${p.salePrice})">
                    <span>${p.name}</span> <small>مخزون: ${p.stock}</small>
                </div>
            `).join('');
        } else {
            resDiv.style.display = 'none';
        }
    });
}

// هـ) اختيار المنتج
window.selectProduct = (id, name, buy, sell) => {
    const type = document.getElementById('invoice-type').value;
    
    document.getElementById('invoice-product-select').value = id;
    document.getElementById('invoice-product-search').value = name;
    
    // تعبئة السعر المناسب
    if (type === 'purchase') {
        document.getElementById('invoice-price').value = buy;
        // تعبئة سعر البيع الحالي في خانة التحديث لتسهيل التعديل
        document.getElementById('invoice-new-sell-price').value = sell;
    } else {
        document.getElementById('invoice-price').value = sell;
    }
    
    document.getElementById('product-search-results').style.display = 'none';
    document.getElementById('invoice-qty').focus();
};

// و) إضافة صنف
const btnAdd = document.getElementById('btn-add-item-to-list');
if (btnAdd) {
    btnAdd.addEventListener('click', () => {
        const id = document.getElementById('invoice-product-select').value;
        const name = document.getElementById('invoice-product-search').value;
        const price = parseFloat(document.getElementById('invoice-price').value);
        const qty = parseInt(document.getElementById('invoice-qty').value);
        
        // جلب سعر البيع الجديد (إن وجد)
        const newSellInput = document.getElementById('invoice-new-sell-price');
        let updateSellPrice = null;
        // نأخذ القيمة فقط إذا كان الحقل ظاهراً (أي في حالة الشراء)
        if (newSellInput && newSellInput.offsetParent !== null) {
            updateSellPrice = parseFloat(newSellInput.value);
        }

        if (!id || !name) return alert("اختر صنفاً");
        if (isNaN(qty) || qty <= 0) return alert("الكمية خطأ");

        currentInvoiceItems.push({
            productId: id, name, quantity: qty, price, 
            total: qty * price,
            updateSellPrice: updateSellPrice // إرسال السعر الجديد للسيرفس
        });

        renderInvoiceTable();
        
        // تصفير
        document.getElementById('invoice-product-search').value = '';
        document.getElementById('invoice-product-select').value = '';
        document.getElementById('invoice-qty').value = 1;
        document.getElementById('invoice-price').value = '';
        if(newSellInput) newSellInput.value = '';
    });
}

// ز) رسم الجدول
function renderInvoiceTable() {
    const tbody = document.getElementById('invoice-items-body');
    if (tbody) {
        tbody.innerHTML = currentInvoiceItems.map((item, index) => `
            <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.price.toFixed(2)}</td>
                <td>${item.total.toFixed(2)}</td>
                <td class="no-print"><button onclick="window.removeInvoiceItem(${index})" style="color:red; border:none; background:none; font-size:1.2rem;">&times;</button></td>
            </tr>
        `).join('');
    }
    const total = currentInvoiceItems.reduce((s, i) => s + i.total, 0);
    document.getElementById('invoice-total-amount').innerText = total.toFixed(2);
}

window.removeInvoiceItem = (i) => {
    currentInvoiceItems.splice(i, 1);
    renderInvoiceTable();
};

// ح) حفظ وطباعة الفاتورة
const formInvoice = document.getElementById('form-create-invoice');
if (formInvoice) {
    formInvoice.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const partnerSelect = document.getElementById('invoice-partner-select');
        const partnerId = partnerSelect.value;
        const partnerName = partnerSelect.options[partnerSelect.selectedIndex]?.text;
        
        if (!partnerId) return alert("اختر الشريك");
        if (currentInvoiceItems.length === 0) return alert("الفاتورة فارغة");

        const total = parseFloat(document.getElementById('invoice-total-amount').innerText);
        const paid = parseFloat(document.getElementById('invoice-paid-amount').value) || 0;
        const remaining = total - paid;
        const date = document.getElementById('invoice-date').value;
        const type = document.getElementById('invoice-type').value;

        const invoiceData = {
            type, partnerId, date, items: currentInvoiceItems, total, paid
        };

        if (confirm("حفظ وطباعة الفاتورة؟")) {
            try {
                // 1. الحفظ
                await services.createInvoice(invoiceData);
                
                // 2. تعبئة الطباعة
                document.getElementById('print-date').innerText = date;
                document.getElementById('print-partner').innerText = partnerName;
                document.getElementById('print-invoice-id').innerText = Date.now().toString().slice(-6);
                document.getElementById('print-total').innerText = total.toFixed(2);
                document.getElementById('print-paid').innerText = paid.toFixed(2);
                document.getElementById('print-remaining').innerText = remaining.toFixed(2);
                
                const printTitle = document.getElementById('print-invoice-title');
                if(printTitle) printTitle.innerText = type === 'sale' ? "فاتورة بيع" : "فاتورة شراء";

                // 3. طباعة
                window.print();
                
                alert("تمت العملية بنجاح");
                showView('view-invoices');
            } catch (err) {
                console.error(err);
                alert("حدث خطأ");
            }
        }
    });
}

// ============================================================
// 9. سجل الفواتير وطباعة القديم
// ============================================================
async function renderInvoicesHistory() {

    const invoices = await services.getInvoices();
    if (allPartners.length === 0) {
        allPartners = await services.getPartners();
    }

    // جلب قيمة البحث
    const searchInput = document.getElementById('invoice-search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

    // فلترة حسب رقم الفاتورة
    const filtered = invoices.filter(inv =>
        inv.id.toLowerCase().includes(searchTerm)
    );

    const tbody = document.getElementById('invoices-list-body');

    if (tbody) {
        tbody.innerHTML = filtered.map(inv => {

            const p = allPartners.find(x => x.id === inv.partnerId);

            return `
                <tr>
                    <td>#${inv.id.substring(0,6)}</td>
                    <td>${inv.date}</td>
                    <td>${p ? p.name : '-'}</td>
                    <td>${inv.type === 'sale' ? 'بيع' : 'شراء'}</td>
                    <td>${Number(inv.total).toFixed(2)}</td>
                    <td>${Number(inv.paid).toFixed(2)}</td>
                    <td class="no-print">
                        <button 
                            class="btn-success-sm"
                            onclick="window.printInvoiceById('${inv.id}')">
                            طباعة
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}


// دالة طباعة فاتورة من السجل
window.printInvoiceById = async (invoiceId) => {
    try {
        const invoices = await services.getInvoices();
        const inv = invoices.find(i => i.id === invoiceId);
        if(!inv) return;

        // نعيد استخدام شاشة الفاتورة للطباعة
        if(allPartners.length === 0) allPartners = await services.getPartners();
        const p = allPartners.find(x => x.id === inv.partnerId);

        // تعبئة البيانات في قالب الطباعة
        document.getElementById('print-date').innerText = inv.date;
        document.getElementById('print-partner').innerText = p ? p.name : '-';
        document.getElementById('print-invoice-id').innerText = inv.id.substring(0,6);
        document.getElementById('print-total').innerText = Number(inv.total).toFixed(2);
        document.getElementById('print-paid').innerText = Number(inv.paid).toFixed(2);
        document.getElementById('print-remaining').innerText = (Number(inv.total) - Number(inv.paid)).toFixed(2);

        // تعبئة الجدول
        const tbody = document.getElementById('invoice-items-body');
        tbody.innerHTML = inv.items.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${Number(item.price).toFixed(2)}</td>
                <td>${Number(item.total).toFixed(2)}</td>
                <td class="no-print"></td>
            </tr>
        `).join('');

        // إظهار الشاشة مؤقتاً للطباعة
        const currentView = document.querySelector('.app-view[style*="display: block"]')?.id;
        document.getElementById('view-create-invoice').style.display = 'block';
        
        window.print();

        // العودة
        document.getElementById('view-create-invoice').style.display = 'none';
        if(currentView) document.getElementById(currentView).style.display = 'block';

    } catch (err) { console.error(err); }
};

// ============================================================
// 10. المودالات (Modals)
// ============================================================
function toggleModal(id, show) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById(id);
    if (show) {
        overlay.style.display = 'flex';
        document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
        modal.style.display = 'block';
    } else {
        overlay.style.display = 'none';
    }
}

// أزرار الفتح
const btnAddP = document.getElementById('btn-open-add-product');
if (btnAddP) btnAddP.onclick = () => toggleModal('modal-add-product', true);

const btnAddPart = document.getElementById('btn-open-add-partner');
if (btnAddPart) btnAddPart.onclick = () => toggleModal('modal-add-partner', true);

const btnPay = document.getElementById('btn-ledger-add-payment');
if (btnPay) btnPay.onclick = () => toggleModal('modal-add-payment', true);

// أزرار الإغلاق
document.querySelectorAll('.btn-close-modal').forEach(b => {
    b.onclick = () => document.getElementById('modal-overlay').style.display = 'none';
});

// معالجة النماذج
document.getElementById('form-add-product').addEventListener('submit', async (e) => {
    e.preventDefault();
    await services.addProduct(
        document.getElementById('new-prod-name').value,
        document.getElementById('new-prod-buy').value,
        document.getElementById('new-prod-sell').value,
        document.getElementById('new-prod-stock').value
    );
    toggleModal('modal-add-product', false);
    renderInventory();
    e.target.reset();
});

document.getElementById('form-add-partner').addEventListener('submit', async (e) => {
    e.preventDefault();
    await services.addPartner(
        document.getElementById('new-partner-name').value,
        document.getElementById('new-partner-type').value
    );
    toggleModal('modal-add-partner', false);
    renderPartners();
    e.target.reset();
});

document.getElementById('form-add-payment').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = document.getElementById('payment-partner-id').value;
    await services.addCashTransaction(
        pid,
        document.getElementById('payment-amount').value,
        document.getElementById('payment-date').value,
        document.getElementById('payment-note').value
    );
    toggleModal('modal-add-payment', false);
    window.openLedger(pid);
    e.target.reset();
});
// ============================================================
// 🔎 تفعيل البحث في سجل الفواتير
// ============================================================

const invoiceSearch = document.getElementById('invoice-search-input');

if (invoiceSearch) {
    invoiceSearch.addEventListener('input', () => {
        renderInvoicesHistory();
    });
}

// ============================================================
// 11. تحميل البيانات (Loader)
// ============================================================
async function loadViewData(viewId) {
    if (viewId === 'view-inventory') renderInventory();
    if (viewId === 'view-partners') renderPartners();
    if (viewId === 'view-invoices') renderInvoicesHistory();
    if (viewId === 'view-create-invoice') prepareInvoiceForm();
    
    if (viewId === 'view-dashboard') {
        const p = await services.getPartners();
        const i = await services.getInventory();
        document.getElementById('stat-customers-count').innerText = p.length;
        document.getElementById('stat-stock-count').innerText = i.reduce((acc, x) => acc + x.stock, 0);
    }
}
