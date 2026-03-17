const API_URL = '';

// Elements
const btnGenerate = document.getElementById('btn-generate');
const donationAmount = document.getElementById('donation-amount');
const generateMsg = document.getElementById('generate-msg');
const resultBox = document.getElementById('result-box');
const generatedCode = document.getElementById('generated-code');
const generatedMult = document.getElementById('generated-mult');
const adminPasswordInput = document.getElementById('admin-password');

const totalRaisedEl = document.getElementById('total-raised');
const totalCountEl = document.getElementById('total-count');
const listTitle = document.getElementById('list-title');
const ticketsList = document.getElementById('tickets-list');

// Doações View
const mainView = document.getElementById('main-view');
const donationsView = document.getElementById('donations-view');
const donationsTotalEl = document.getElementById('donations-total');
const donationsList = document.getElementById('donations-list');

// Clear Modal
const btnOpenClear = document.getElementById('btn-open-clear');
const modalOverlay = document.getElementById('modal-overlay');
const btnCancelClear = document.getElementById('btn-cancel-clear');
const btnConfirmClear = document.getElementById('btn-confirm-clear');
const clearPasswordInput = document.getElementById('clear-password-input');
const clearMsg = document.getElementById('clear-msg');

// Nav
const btnGotoDoacoes = document.getElementById('btn-goto-doacoes');
const btnBack = document.getElementById('btn-back');

// ============ NAVIGATION ============
btnGotoDoacoes.addEventListener('click', () => {
    mainView.classList.add('hidden');
    donationsView.id = 'donations-view';
    donationsView.classList.add('active');
    loadDonations();
});

btnBack.addEventListener('click', () => {
    mainView.classList.remove('hidden');
    donationsView.classList.remove('active');
    loadTickets();
});

// ============ GENERATE TICKET ============
btnGenerate.addEventListener('click', async () => {
    const amount = parseFloat(donationAmount.value);

    if (!amount || amount <= 0) {
        showMsg(generateMsg, 'Insira um valor válido.', 'error');
        return;
    }

    try {
        btnGenerate.disabled = true;
        btnGenerate.textContent = 'Gerando...';

        const adminPass = (adminPasswordInput?.value || '').trim();
        if (!adminPass) throw new Error('Informe a senha do admin.');

        const res = await fetch(`${API_URL}/admin/generate-ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'password': adminPass },
            body: JSON.stringify({ amount_paid: amount })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Erro ao gerar');

        showMsg(generateMsg, '✅ Bilhete gerado com sucesso!', 'success');
        generatedCode.textContent = data.code;
        generatedMult.textContent = data.multiplier;
        resultBox.style.display = 'block';

        donationAmount.value = '';

        loadTickets(); // Refresh list

    } catch (err) {
        showMsg(generateMsg, '❌ ' + err.message, 'error');
    } finally {
        btnGenerate.disabled = false;
        btnGenerate.textContent = 'Gerar Código';
    }
});

function copyCode() {
    const code = generatedCode.textContent;
    const feedback = document.getElementById('copy-feedback');
    navigator.clipboard.writeText(code).then(() => {
        feedback.textContent = '✅ Código copiado!';
        setTimeout(() => { feedback.textContent = ''; }, 3000);
    }).catch(() => {
        feedback.textContent = 'Selecione o código e copie manualmente.';
    });
}

window.copyCode = copyCode;

// ============ LOAD TICKETS ============
async function loadTickets() {
    try {
        const adminPass = (adminPasswordInput?.value || '').trim();
        if (!adminPass) {
            ticketsList.innerHTML = '<div class="empty-list">Digite a senha do admin para carregar.</div>';
            return;
        }

        const res = await fetch(`${API_URL}/admin/donations`, {
            headers: { 'password': adminPass }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        const total = data.total_raised || 0;
        const donations = data.donations || [];

        // Update total
        totalRaisedEl.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
        totalCountEl.textContent = donations.length + ' ticket' + (donations.length !== 1 ? 's' : '');
        listTitle.textContent = `Tickets Gerados (${donations.length})`;

        // Render ticket list
        if (donations.length === 0) {
            ticketsList.innerHTML = '<div class="empty-list">Nenhum ticket gerado ainda.</div>';
            return;
        }

        ticketsList.innerHTML = '';
        donations.forEach(d => {
            const item = document.createElement('div');
            item.className = 'ticket-item';

            let badgeClass = 'badge-pending';
            let badgeText = 'Disponível';
            if (d.is_used && d.score > 0) { badgeClass = 'badge-cashed'; badgeText = '€' + d.score; }
            else if (d.is_used && d.score === 0) { badgeClass = 'badge-busted'; badgeText = 'Busted'; }
            else if (d.is_used) { badgeClass = 'badge-used'; badgeText = 'Usado'; }

            const mult = (d.amount_paid / 10).toFixed(0);

            item.innerHTML = `
                <div>
                    <div class="ticket-code">${d.code}</div>
                    <div class="ticket-meta">R$ ${d.amount_paid.toFixed(0)} • ${mult}x${d.donor_name ? ' • ' + d.donor_name : ''}</div>
                </div>
                <div class="ticket-status">
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </div>
            `;
            ticketsList.appendChild(item);
        });

    } catch (err) {
        ticketsList.innerHTML = `<div class="empty-list" style="color:red;">Erro ao carregar tickets.</div>`;
    }
}

// ============ LOAD DONATIONS ============
async function loadDonations() {
    donationsList.innerHTML = '<div class="empty-list">Carregando...</div>';
    try {
        const adminPass = (adminPasswordInput?.value || '').trim();
        if (!adminPass) {
            donationsList.innerHTML = '<div class="empty-list">Digite a senha do admin para carregar.</div>';
            return;
        }
        const res = await fetch(`${API_URL}/admin/donations`, {
            headers: { 'password': adminPass }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        const total = data.total_raised || 0;
        donationsTotalEl.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');

        const donations = data.donations || [];
        if (donations.length === 0) {
            donationsList.innerHTML = '<div class="empty-list">Nenhuma doação registrada.</div>';
            return;
        }

        donationsList.innerHTML = '';
        donations.forEach(d => {
            const genderIcon = d.donor_gender === 'Homem' ? '👦' : d.donor_gender === 'Mulher' ? '👩' : '';
            const item = document.createElement('div');
            item.className = 'donation-item';
            item.innerHTML = `
                <div>
                    <div class="donor-name">${d.donor_name || 'Anônimo'} ${genderIcon}</div>
                    <div class="donor-meta">${d.donor_gender || ''}</div>
                </div>
                <div>
                    <div class="donor-amount">R$ ${d.amount_paid.toFixed(2).replace('.', ',')}</div>
                    <div class="donor-score">${d.score > 0 ? '€ ' + d.score + ' no jogo' : d.is_used ? 'Busted 💥' : 'Não jogou'}</div>
                </div>
            `;
            donationsList.appendChild(item);
        });

    } catch (err) {
        donationsList.innerHTML = `<div class="empty-list" style="color:red;">Erro ao carregar doações.</div>`;
    }
}

// ============ CLEAR MODAL ============
btnOpenClear.addEventListener('click', () => {
    clearPasswordInput.value = '';
    clearMsg.textContent = '';
    modalOverlay.classList.add('active');
});

btnCancelClear.addEventListener('click', () => {
    modalOverlay.classList.remove('active');
});

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('active');
});

btnConfirmClear.addEventListener('click', async () => {
    const pass = (clearPasswordInput.value || '').trim();
    const adminPass = (adminPasswordInput?.value || '').trim();
    if (!adminPass) { clearMsg.textContent = 'Digite a senha do admin no topo.'; return; }
    if (pass !== adminPass) { clearMsg.textContent = 'Senha incorreta!'; return; }

    try {
        btnConfirmClear.disabled = true;
        btnConfirmClear.textContent = 'Apagando...';

        const res = await fetch(`${API_URL}/admin/clear`, {
            method: 'POST',
            headers: { 'password': adminPass }
        });

        if (res.ok) {
            modalOverlay.classList.remove('active');
            resultBox.style.display = 'none';
            loadTickets();
        } else {
            const data = await res.json();
            clearMsg.textContent = 'Erro: ' + data.detail;
        }
    } catch (err) {
        clearMsg.textContent = 'Erro ao limpar: ' + err.message;
    } finally {
        btnConfirmClear.disabled = false;
        btnConfirmClear.textContent = 'Limpar Tudo';
    }
});

// ============ HELPERS ============
function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'msg ' + type;
    setTimeout(() => { el.textContent = ''; }, 4000);
}

// Initial load
if (adminPasswordInput) {
  const saved = localStorage.getItem('admin_password') || '';
  if (saved) adminPasswordInput.value = saved;
  adminPasswordInput.addEventListener('input', () => {
    localStorage.setItem('admin_password', adminPasswordInput.value);
  });
  adminPasswordInput.addEventListener('change', loadTickets);
}
loadTickets();
