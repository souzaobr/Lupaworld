/* =====================================================
   app.js — Interactive 3D Globe + Source Buttons
   + Country Click + Article Popup + 15s Pause
   ===================================================== */

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const AUTO_ROTATE_SPEED = 0.15;         // degrees per frame
const VISIBILITY_THRESHOLD = Math.PI / 2; // hemisphere cutoff
const PAUSE_AFTER_DRAG_MS = 24000;      // 24 seconds pause after drag

let projection = null;
let pathGenerator = null;
let buttonElements = {};
let latestData = [];
let autoRotateTimer = null;
let resumeRotateTimeout = null;
let isUserInteracting = false;
let currentRotation = [0, -15, 0]; // [λ, φ, γ]
let globeScale = 1;
let selectedCountryName = null;
let currentArticleMarkdown = '';
let currentArticleTitle = '';
let chatHistory = []; // Memory for the AI Agent
let isPickingCoords = false; // Mode to select coordinates on globe
let isRemovingSource = false; // Mode to delete a source by clicking
let isEditingSource = false; // Mode to edit a source by clicking

// --- MOBILE TACTICAL LOGIC ---
const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad/i.test(navigator.userAgent);
if (isMobile) document.body.classList.add('lupa-mobile');

let currentTickerIndex = 0;
let tickerCycleInterval = null;

function startMobileTickerCycle() {
    if (!isMobile) return;
    if (tickerCycleInterval) clearInterval(tickerCycleInterval);
    tickerCycleInterval = setInterval(() => {
        const items = document.querySelectorAll('.ntw-item');
        if (items.length <= 1) return;
        items.forEach(it => it.style.display = 'none');
        currentTickerIndex = (currentTickerIndex + 1) % items.length;
        const current = items[currentTickerIndex];
        current.style.display = 'flex';
        current.style.animation = 'ntw-fade-in 0.5s ease';
    }, 6000); // Troca a notícia a cada 6 segundos
}

function toggleMobileSourcePanel() {
    const panel = document.getElementById('visitor-url-panel');
    panel.classList.toggle('expanded');
}

function manualZoom(factor) {
    const baseRadius = window.__globe.baseRadius;
    globeScale = Math.max(0.5, Math.min(6, globeScale * factor));
    projection.scale(baseRadius * globeScale);
    updateGlobe();
}

const TRANSLATIONS = {
    pt: {
        add_source: "ADICIONAR FONTE",
        remove_source: "REMOVER FONTE",
        edit_source: "EDITAR FONTE",
        remove_instr: "Selecione uma fonte no globo para removê-la. (Pressione ESC para cancelar)",
        edit_instr: "Selecione uma fonte no globo para editá-la. (Pressione ESC para cancelar)",
        modal_title_add: "➕ Nova Fonte de Notícias",
        modal_title_edit: "✏️ Editar Fonte de Notícias",
        source_name: "Nome da Fonte",
        source_country: "País",
        source_city: "Cidade",
        source_rss: "URL do Feed RSS",
        latitude: "Latitude",
        longitude: "Longitude",
        pick_map: "📍 Escolher no Mapa",
        pick_instr: "Clique em um ponto no globo para definir a localização.",
        save_source_add: "Salvar Fonte e Atualizar Globo",
        save_source_edit: "Salvar Alterações",
        manage_sources: "📋 Gerenciar Fontes Existentes",
        loading_sources: "Carregando fontes...",
        blog_generator: "✍️ Gerador de Blog",
        blog_left_positive: "Esquerda (Positiva)",
        blog_left_negative: "Esquerda (Negativa)",
        blog_right_positive: "Direita (Positiva)",
        blog_right_negative: "Direita (Negativa)",
        chat_flash: "Flash 3.1 (Rápido)",
        chat_pro: "Pro 3.1 (Poderoso)",
        chat_deep_research: "Deep Research 🧪",
        chat_welcome: "Olá! Eu sou seu assistente de notícias. Posso analisar todas as manchetes atuais para você. O que gostaria de saber?",
        chat_placeholder: "Pergunte sobre as notícias...",
        headlines_count: "manchetes",
        waiting: "Aguardando...",
        no_headline: "Sem manchete",
        click_to_read: "Clique para ler matéria completa →",
        updated: "Atualizado:",
        no_country_results: "Nenhuma manchete encontrada para este país.",
        error_fetch: "Erro ao buscar manchetes.",
        loading_headline: "Carregando manchete...",
        error_load_headline: "Erro ao carregar manchete.",
        no_summary: "Resumo não disponível. Acesse o artigo completo no link abaixo.",
        read_full: "Ler artigo completo em",
        generated_by_ai: "Gerado por IA",
        download_pdf: "📥 Baixar PDF",
        generating: "⌛ Gerando...",
        download_error: "Erro ao baixar PDF. Tente novamente.",
        remove_confirm: "Deseja remover a fonte",
        exact_name_prompt: "Para confirmar, digite exatamente o nome da fonte abaixo:",
        remove_success: "foi removida com sucesso.",
        incorrect_name: "Nome incorreto. A fonte não foi removida.",
        save_saving: "Salvando...",
        fill_fields: "Por favor, preencha todos os campos e selecione a localização no mapa.",
        add_success: "Fonte adicionada com sucesso! As notícias serão carregadas em instantes.",
        edit_success: "Fonte atualizada com sucesso!",
        error_server: "Erro ao conectar com o servidor.",
        clear_history: "Limpar histórico da conversa?",
        history_cleared: "Histórico limpo. Como posso ajudar agora?",
        ai_analyzing: "O Agente está analisando...",
        ai_conn_error: "⚠️ Erro de conexão com o servidor.",
        latest_news: "ÚLTIMAS NOTÍCIAS",
        ntw_count: "notícias",
        suggest_source: "Sugerir Fonte",
        paste_url_placeholder: "Cole a URL aqui",
        send_url: "Enviar ➤",
        url_sending: "Enviando...",
        url_sent: "✅ URL enviada! Obrigado.",
        url_invalid: "⚠️ URL inválida.",
        url_conn_error: "⚠️ Erro de conexão.",
        suggested_urls_title: "🔗 URLs Enviadas",
        suggested_urls_empty: "Nenhuma URL enviada ainda.",
        suggested_urls_loading: "Carregando...",
        suggested_urls_denied: "Acesso negado.",
        suggested_urls_error: "Erro ao carregar.",
        lupa_key_label: "🔑 Insira sua chave Gemini API para usar Lupa",
        lupa_key_get: "Obter chave grátis →",
        authenticating: "Autenticando...",
        auth_error: "Erro ao contactar o servidor.",
        url_multiple: "⚠️ Apenas uma URL por vez, por favor."
    },
    en: {
        add_source: "ADD SOURCE",
        remove_source: "REMOVE SOURCE",
        edit_source: "EDIT SOURCE",
        remove_instr: "Select a source on the globe to remove it. (Press ESC to cancel)",
        edit_instr: "Select a source on the globe to edit it. (Press ESC to cancel)",
        modal_title_add: "➕ New News Source",
        modal_title_edit: "✏️ Edit News Source",
        source_name: "Source Name",
        source_country: "Country",
        source_city: "City",
        source_rss: "RSS Feed URL",
        latitude: "Latitude",
        longitude: "Longitude",
        pick_map: "📍 Pick on Map",
        pick_instr: "Click a point on the globe to set the location.",
        save_source_add: "Save Source & Update Globe",
        save_source_edit: "Save Changes",
        manage_sources: "📋 Manage Existing Sources",
        loading_sources: "Loading sources...",
        blog_generator: "✍️ Blog Generator",
        blog_left_positive: "Left (Positive)",
        blog_left_negative: "Left (Negative)",
        blog_right_positive: "Right (Positive)",
        blog_right_negative: "Right (Negative)",
        chat_flash: "Flash 3.1 (Fast)",
        chat_pro: "Pro 3.1 (Powerful)",
        chat_deep_research: "Deep Research 🧪",
        chat_welcome: "Hello! I am your news assistant. I can analyze all current headlines for you. What would you like to know?",
        chat_placeholder: "Ask about the news...",
        headlines_count: "headlines",
        waiting: "Waiting...",
        no_headline: "No headline",
        click_to_read: "Click to read full article →",
        updated: "Updated:",
        no_country_results: "No headlines found for this country.",
        error_fetch: "Error fetching headlines.",
        loading_headline: "Loading headline...",
        error_load_headline: "Error loading headline.",
        no_summary: "Summary not available. Access the full article in the link below.",
        read_full: "Read full article at",
        generated_by_ai: "AI Generated",
        download_pdf: "📥 Download PDF",
        generating: "⌛ Generating...",
        download_error: "Error downloading PDF. Try again.",
        remove_confirm: "Do you want to remove the source",
        exact_name_prompt: "To confirm, type the exact source name below:",
        remove_success: "was removed successfully.",
        incorrect_name: "Incorrect name. Source was not removed.",
        save_saving: "Saving...",
        fill_fields: "Please fill out all fields and pick a location on the map.",
        add_success: "Source added successfully! News will load shortly.",
        edit_success: "Source updated successfully!",
        error_server: "Error connecting to server.",
        clear_history: "Clear chat history?",
        history_cleared: "History cleared. How can I help you now?",
        ai_analyzing: "The Agent is analyzing...",
        ai_conn_error: "⚠️ Server connection error.",
        latest_news: "LATEST NEWS",
        ntw_count: "headlines",
        suggest_source: "Suggest a Source",
        paste_url_placeholder: "Paste URL only",
        send_url: "Send ➤",
        url_sending: "Sending...",
        url_sent: "✅ URL submitted! Thank you.",
        url_invalid: "⚠️ Invalid URL.",
        url_conn_error: "⚠️ Connection error.",
        suggested_urls_title: "🔗 Submitted URLs",
        suggested_urls_empty: "No URLs submitted yet.",
        suggested_urls_loading: "Loading...",
        suggested_urls_denied: "Access denied.",
        suggested_urls_error: "Error loading.",
        lupa_key_label: "🔑 Enter your Gemini API key to use Lupa",
        lupa_key_get: "Get free key →",
        authenticating: "Authenticating...",
        auth_error: "Error contacting server.",
        url_multiple: "⚠️ One URL at a time, please."
    }
};

let currentLang = 'pt';

function t(key) {
    return TRANSLATIONS[currentLang][key] || key;
}

function applyUserRole(role) {
    const isAdmin = role === 'admin';
    // Admin-only elements
    document.getElementById('map-actions-container').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('blog-generator-widget').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('logout-btn').style.display = isAdmin ? 'block' : 'none';
    const suwWidget = document.getElementById('suggested-urls-widget');
    if (suwWidget) suwWidget.style.display = isAdmin ? 'flex' : 'none';
    // Visitor-only elements
    const urlPanel = document.getElementById('visitor-url-panel');
    if (urlPanel) urlPanel.style.display = isAdmin ? 'none' : 'block';
    // Show/hide Lupa API key area based on whether visitor has a key
    if (!isAdmin) {
        const hasKey = !!localStorage.getItem('visitorApiKey');
        const keyArea = document.getElementById('lupa-api-key-area');
        if (keyArea) keyArea.style.display = hasKey ? 'none' : 'flex';
        // Auto-open Lupa for visitors so they immediately see the API key field
        const chatWindow = document.getElementById('ai-chat-window');
        if (chatWindow) chatWindow.classList.add('open');
    } else {
        const keyArea = document.getElementById('lupa-api-key-area');
        if (keyArea) keyArea.style.display = 'none';
    }
    // Load suggested URLs for admin
    if (isAdmin) loadSuggestedUrls();
}

function updateLanguageUI() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (TRANSLATIONS[currentLang][key]) {
            el.textContent = TRANSLATIONS[currentLang][key];
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (TRANSLATIONS[currentLang][key]) {
            el.placeholder = TRANSLATIONS[currentLang][key];
        }
    });

    const langToggle = document.getElementById('lang-toggle');
    if (langToggle) {
        langToggle.textContent = currentLang === 'pt' ? '🇧🇷 PT' : '🇺🇸 EN';
    }

    if (latestData && latestData.length > 0) {
        updateHeader(latestData);
        renderButtons(latestData);
    }
}

// ── ISO 3166-1 numeric → country name (for TopoJSON click) ──
const ISO_COUNTRY_MAP = {
    '004':'Afghanistan','008':'Albania','012':'Algeria','024':'Angola','032':'Argentina',
    '036':'Australia','040':'Austria','050':'Bangladesh','056':'Belgium','068':'Bolivia',
    '076':'Brazil','100':'Bulgaria','104':'Myanmar','116':'Cambodia','120':'Cameroon',
    '124':'Canada','152':'Chile','156':'China','170':'Colombia','180':'Congo',
    '188':'Costa Rica','191':'Croatia','192':'Cuba','196':'Cyprus','203':'Czech Republic',
    '208':'Denmark','214':'Dominican Republic','218':'Ecuador','818':'Egypt',
    '222':'El Salvador','232':'Eritrea','233':'Estonia','231':'Ethiopia','246':'Finland',
    '250':'France','266':'Gabon','276':'Germany','288':'Ghana','300':'Greece',
    '320':'Guatemala','324':'Guinea','332':'Haiti','340':'Honduras','348':'Hungary',
    '352':'Iceland','356':'India','360':'Indonesia','364':'Iran','368':'Iraq',
    '372':'Ireland','376':'Israel','380':'Italy','388':'Jamaica','392':'Japan',
    '400':'Jordan','398':'Kazakhstan','404':'Kenya','408':'North Korea','410':'South Korea',
    '414':'Kuwait','418':'Laos','422':'Lebanon','430':'Liberia','434':'Libya',
    '440':'Lithuania','442':'Luxembourg','450':'Madagascar','458':'Malaysia',
    '466':'Mali','484':'Mexico','496':'Mongolia','504':'Morocco','508':'Mozambique',
    '516':'Namibia','524':'Nepal','528':'Netherlands','540':'New Caledonia',
    '554':'New Zealand','558':'Nicaragua','562':'Niger','566':'Nigeria','578':'Norway',
    '512':'Oman','586':'Pakistan','591':'Panama','600':'Paraguay','604':'Peru',
    '608':'Philippines','616':'Poland','620':'Portugal','634':'Qatar','642':'Romania',
    '643':'Russia','646':'Rwanda','682':'Saudi Arabia','686':'Senegal','688':'Serbia',
    '694':'Sierra Leone','702':'Singapore','703':'Slovakia','704':'Vietnam',
    '706':'Somalia','710':'South Africa','724':'Spain','144':'Sri Lanka','736':'Sudan',
    '740':'Suriname','752':'Sweden','756':'Switzerland','760':'Syria','158':'Taiwan',
    '762':'Tajikistan','764':'Thailand','768':'Togo','780':'Trinidad and Tobago',
    '788':'Tunisia','792':'Turkey','800':'Uganda','804':'Ukraine',
    '784':'United Arab Emirates','826':'United Kingdom','834':'Tanzania',
    '840':'United States','858':'Uruguay','860':'Uzbekistan','862':'Venezuela',
    '887':'Yemen','894':'Zambia','716':'Zimbabwe','275':'Palestine',
    '-99':'Northern Cyprus','010':'Antarctica',
};

// ── Wait for DOM ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('login-overlay');
    const userRole = localStorage.getItem('userRole');
    const adminPass = localStorage.getItem('adminPass') || '';
    
    // ── URL Routing Logic ──
    const path = window.location.pathname;

    if (path === '/admin') {
        if (userRole !== 'admin') {
            loginOverlay.style.display = 'flex';
        } else {
            applyUserRole('admin');
        }
    } else {
        // Root path: ALWAYS visitor view, regardless of localStorage
        applyUserRole('visitor');
    }

    // ── Admin Login ──
    const adminLogin = document.getElementById('admin-login-btn');
    const loginClose = document.getElementById('login-close-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (adminLogin) {
        adminLogin.addEventListener('click', async () => {
            const u = document.getElementById('admin-user').value;
            const p = document.getElementById('admin-pass').value;
            const errDiv = document.getElementById('login-error');
            if (errDiv) errDiv.textContent = 'Autenticando...';
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });
                const data = await res.json();
                if (data.success) {
                    localStorage.setItem('userRole', 'admin');
                    localStorage.setItem('adminPass', p);
                    applyUserRole('admin');
                    loginOverlay.style.display = 'none';
                } else if (errDiv) {
                    errDiv.textContent = data.error;
                }
            } catch(e) {
                if (errDiv) errDiv.textContent = 'Erro ao contactar o servidor.';
            }
        });
    }

    if (loginClose) {
        loginClose.addEventListener('click', () => {
            loginOverlay.style.display = 'none';
            if (userRole !== 'admin') window.location.href = '/';
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('userRole');
            localStorage.removeItem('adminPass');
            localStorage.removeItem('visitorApiKey');
            window.location.href = '/';
        });
    }

    // ── Lupa API Key (Visitor) ──
    const lupaKeySave = document.getElementById('lupa-api-key-save');
    if (lupaKeySave) {
        lupaKeySave.addEventListener('click', () => {
            const key = document.getElementById('lupa-api-key-input').value.trim();
            if (key) {
                localStorage.setItem('visitorApiKey', key);
                document.getElementById('lupa-api-key-area').style.display = 'none';
            }
        });
    }

    // ── Visitor URL Submit ──
    const urlSubmitBtn = document.getElementById('visitor-url-submit');
    if (urlSubmitBtn) {
        urlSubmitBtn.addEventListener('click', submitVisitorUrl);
        document.getElementById('visitor-url-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitVisitorUrl();
        });
    }

    // ── Admin Suggested URLs refresh ──
    const suwRefresh = document.getElementById('suw-refresh-btn');
    if (suwRefresh) suwRefresh.addEventListener('click', loadSuggestedUrls);

    initGlobe();
    document.getElementById('refresh-btn').addEventListener('click', triggerFetch);

    document.getElementById('lang-toggle').addEventListener('click', () => {
        currentLang = currentLang === 'pt' ? 'en' : 'pt';
        updateLanguageUI();
    });
    updateLanguageUI();

    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.classList.toggle('clear-view');
        updateGlobe();
    });

    document.getElementById('popup-overlay').addEventListener('click', closePopup);
    document.getElementById('popup-close').addEventListener('click', closePopup);
    document.getElementById('popup-content').addEventListener('click', e => e.stopPropagation());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isPickingCoords) stopPickingCoords();
            if (isRemovingSource) stopRemovingSource();
            if (isEditingSource) stopEditingSource();
        }
    });

    document.getElementById('country-panel-close').addEventListener('click', closeCountryPanel);
    initAddSourceUI();
    initGlobalChat();

    if (isMobile) {
        document.getElementById('vup-mobile-toggle')?.addEventListener('click', toggleMobileSourcePanel);
        document.getElementById('zoom-in-btn')?.addEventListener('click', () => manualZoom(1.3));
        document.getElementById('zoom-out-btn')?.addEventListener('click', () => manualZoom(0.7));
    }

    window.addEventListener('resize', () => {
        if (!window.__globe) return;
        const container = document.getElementById('map-container');
        window.__globe.W = container.clientWidth;
        window.__globe.H = container.clientHeight;
        window.__globe.baseRadius = Math.min(window.__globe.W, window.__globe.H) / 2.3;
        projection.translate([window.__globe.W / 2, window.__globe.H / 2]);
        projection.scale(window.__globe.baseRadius * globeScale);
        updateGlobe();
    });
});

// ── Visitor: Submit URL ────────────────────────────────
async function submitVisitorUrl() {
    const input = document.getElementById('visitor-url-input');
    const feedback = document.getElementById('visitor-url-feedback');
    const raw = input.value.trim();
    if (!raw) return;

    // Reject if multiple URLs detected (spaces, line breaks, or multiple http occurrences)
    const urlCount = (raw.match(/https?:\/\//g) || []).length;
    const hasWhitespace = /\s/.test(raw);
    if (urlCount > 1 || hasWhitespace) {
        feedback.textContent = t('url_multiple');
        feedback.style.color = '#ff5757';
        // Shake the input for visual feedback
        input.classList.add('input-shake');
        setTimeout(() => input.classList.remove('input-shake'), 500);
        return;
    }

    feedback.textContent = t('url_sending');
    feedback.style.color = 'var(--text-muted)';
    try {
        const res = await fetch('/api/suggest-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: raw })
        });
        const data = await res.json();
        if (data.success) {
            feedback.textContent = t('url_sent');
            feedback.style.color = '#00cc66';
            input.value = '';
            setTimeout(() => { feedback.textContent = ''; }, 3000);
        } else {
            feedback.textContent = t('url_invalid');
            feedback.style.color = '#ff5757';
        }
    } catch(e) {
        feedback.textContent = t('url_conn_error');
        feedback.style.color = '#ff5757';
    }
}

// ── Admin: Load Suggested URLs ─────────────────────────
async function loadSuggestedUrls() {
    const list = document.getElementById('suw-list');
    if (!list) return;
    const adminPass = localStorage.getItem('adminPass') || '';
    list.innerHTML = `<div class="suw-empty">${t('suggested_urls_loading')}</div>`;
    try {
        const res = await fetch('/api/suggested-urls', {
            headers: { 'x-admin-token': adminPass }
        });
        if (!res.ok) { list.innerHTML = `<div class="suw-empty">${t('suggested_urls_denied')}</div>`; return; }
        const items = await res.json();
        if (!items.length) { list.innerHTML = `<div class="suw-empty">${t('suggested_urls_empty')}</div>`; return; }
        list.innerHTML = items.map(item => `
            <div class="suw-item" id="suw-item-${item.id}">
                <div class="suw-url-text">${item.url}</div>
                <div class="suw-meta">${new Date(item.submitted_at).toLocaleString('pt-BR')}</div>
                <div class="suw-actions">
                    <button class="suw-copy-btn" onclick="navigator.clipboard.writeText('${item.url.replace(/'/g, "\\'")}')">📋 Copiar</button>
                    <button class="suw-dismiss-btn" onclick="dismissSuggestedUrl(${item.id})">✕</button>
                </div>
            </div>
        `).join('');
    } catch(e) {
        list.innerHTML = `<div class="suw-empty">${t('suggested_urls_error')}</div>`;
    }
}

async function dismissSuggestedUrl(id) {
    const adminPass = localStorage.getItem('adminPass') || '';
    await fetch(`/api/suggested-urls/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminPass }
    });
    document.getElementById(`suw-item-${id}`)?.remove();
    const list = document.getElementById('suw-list');
    if (list && !list.querySelector('.suw-item')) {
        list.innerHTML = `<div class="suw-empty">${t('suggested_urls_empty')}</div>`;
    }
}

// ── Build 3D Globe ────────────────────────────────────
async function initGlobe() {
    const container = document.getElementById('map-container');
    const svg = d3.select('#map-svg');
    const W = container.clientWidth;
    const H = container.clientHeight;
    const baseRadius = Math.min(W, H) / 2.3;

    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');

    // Orthographic projection (globe)
    projection = d3.geoOrthographic()
        .scale(baseRadius)
        .translate([W / 2, H / 2])
        .clipAngle(90)
        .precision(0.1)
        .rotate(currentRotation);

    pathGenerator = d3.geoPath().projection(projection);

    // ── Defs: atmosphere glow ──
    const defs = svg.append('defs');

    // Radial gradient for atmosphere
    const atmosGrad = defs.append('radialGradient')
        .attr('id', 'atmos-gradient')
        .attr('cx', '50%').attr('cy', '50%').attr('r', '55%');
    atmosGrad.append('stop').attr('offset', '85%').attr('stop-color', 'rgba(74,158,255,0)');
    atmosGrad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(74,158,255,0.15)');

    // Drop shadow for depth
    const dropShadow = defs.append('filter').attr('id', 'globe-shadow')
        .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
    dropShadow.append('feDropShadow')
        .attr('dx', 0).attr('dy', 0).attr('stdDeviation', 20)
        .attr('flood-color', 'rgba(74,158,255,0.25)');

    // ── Atmosphere circle (behind globe) ──
    svg.append('circle')
        .attr('class', 'atmosphere')
        .attr('cx', W / 2).attr('cy', H / 2)
        .attr('r', baseRadius * 1.12)
        .attr('fill', 'url(#atmos-gradient)');

    // ── Solid Base (Force opaque) ──
    svg.append('circle')
        .attr('class', 'globe-base')
        .attr('cx', W / 2).attr('cy', H / 2)
        .attr('r', baseRadius)
        .attr('fill', '#000');

    // ── Globe sphere ──
    svg.append('path')
        .datum({ type: 'Sphere' })
        .attr('class', 'sphere')
        .attr('d', pathGenerator)
        .attr('filter', 'url(#globe-shadow)');

    // ── Interaction: Global Picking for Coords ──
    const pickingManager = (event) => {
        if (!isPickingCoords) return;
        const [x, y] = d3.pointer(event);
        const coords = projection.invert([x, y]);
        if (coords && !isNaN(coords[0])) {
            document.getElementById('source-lon').value = coords[0].toFixed(2);
            document.getElementById('source-lat').value = coords[1].toFixed(2);
            stopPickingCoords();
            event.stopImmediatePropagation();
        }
    };
    svg.on('click', pickingManager, true); // Use capture phase to intercept any sub-element click

    // ── Graticule ──
    const graticule = d3.geoGraticule()();
    svg.append('path')
        .datum(graticule)
        .attr('class', 'graticule')
        .attr('d', pathGenerator);

    // ── Countries (with click handler) ──
    let didDrag = false;
    try {
        const world = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json');
        const countries = topojson.feature(world, world.objects.countries);
        svg.selectAll('.country')
            .data(countries.features)
            .enter()
            .append('path')
            .attr('class', 'country')
            .attr('d', pathGenerator)
            .on('click', function (event, d) {
                if (isPickingCoords || isRemovingSource || isEditingSource) return; // Skip logic if picking or removing or editing
                // Don't trigger click if user was dragging
                if (didDrag) { didDrag = false; return; }
                const countryName = ISO_COUNTRY_MAP[d.id] || null;
                if (countryName) {
                    onCountryClick(countryName, d, this);
                }
            });
    } catch (e) {
        console.warn('Could not load world atlas:', e);
    }

    // ── Drag rotation (with 24s pause) ──
    const dragBehavior = d3.drag()
        .on('start', () => {
            didDrag = false;
            isUserInteracting = true;
            stopAutoRotate();
            clearResumeTimeout();
            container.style.cursor = 'grabbing';
        })
        .on('drag', (event) => {
            didDrag = true;
            const sensitivity = 0.4 / globeScale;
            currentRotation[0] += event.dx * sensitivity;
            currentRotation[1] -= event.dy * sensitivity;
            currentRotation[1] = Math.max(-89, Math.min(89, currentRotation[1]));
            updateGlobe();
        })
        .on('end', () => {
            isUserInteracting = false;
            container.style.cursor = 'grab';
            // ── 24 second pause before auto-rotate resumes ──
            scheduleAutoRotateResume();
        });

    d3.select(container).call(dragBehavior);

    // ── Zoom (Desktop Wheel & Mobile Pinch) ──
    const zoomBehavior = d3.zoom()
        .scaleExtent([0.5, 6]) // Min and Max zoom
        .filter((event) => {
            // ONLY allow zoom via wheel or multi-touch (two fingers)
            // This prevents conflict with rotation (single touch drag)
            if (event.type === 'wheel') return true;
            if (event.type === 'touchstart' && event.touches.length > 1) return true;
            return false;
        })
        .on('zoom', (event) => {
            globeScale = event.transform.k;
            projection.scale(baseRadius * globeScale);
            updateGlobe();
        });

    // Apply zoom to the container
    d3.select(container)
        .call(zoomBehavior)
        .on("dblclick.zoom", null);

    // Initial scale sync
    d3.select(container).call(zoomBehavior.transform, d3.zoomIdentity.scale(globeScale));

    // ── Store references for updateGlobe ──
    window.__globe = { svg, W, H, baseRadius, graticule };

    // ── Load headlines ──
    await refreshHeadlines();

    // ── Start auto-rotation ──
    startAutoRotate();

    // ── Auto-refresh data ──
    setInterval(refreshHeadlines, REFRESH_INTERVAL);
}

// ── Update Globe Visuals ──────────────────────────────
function updateGlobe() {
    projection.rotate(currentRotation);
    pathGenerator = d3.geoPath().projection(projection);

    const { svg, baseRadius, W, H } = window.__globe;
    const isClear = document.body.classList.contains('clear-view');

    svg.select('.globe-base')
        .attr('cx', W / 2)
        .attr('cy', H / 2)
        .attr('r', baseRadius * globeScale)
        .attr('fill', isClear ? '#aad3df' : '#000');

    svg.select('.atmosphere')
        .attr('cx', W / 2)
        .attr('cy', H / 2)
        .attr('r', baseRadius * globeScale * 1.12);

    svg.select('.sphere').attr('d', pathGenerator);
    svg.select('.graticule').attr('d', pathGenerator);
    svg.selectAll('.country').attr('d', pathGenerator);

    updateButtonPositions();
}

// ── Auto-Rotation with 24s pause ──────────────────────
function startAutoRotate() {
    stopAutoRotate();
    autoRotateTimer = setInterval(() => {
        if (!isUserInteracting) {
            currentRotation[0] += AUTO_ROTATE_SPEED;
            updateGlobe();
        }
    }, 1000 / 30);
}

function stopAutoRotate() {
    if (autoRotateTimer) {
        clearInterval(autoRotateTimer);
        autoRotateTimer = null;
    }
}

function clearResumeTimeout() {
    if (resumeRotateTimeout) {
        clearTimeout(resumeRotateTimeout);
        resumeRotateTimeout = null;
    }
}

function scheduleAutoRotateResume() {
    clearResumeTimeout();
    stopAutoRotate();
    resumeRotateTimeout = setTimeout(() => {
        startAutoRotate();
    }, PAUSE_AFTER_DRAG_MS);
}

// ── Fetch Latest Headlines ────────────────────────────
async function refreshHeadlines() {
    try {
        const res = await fetch('/api/latest');
        const data = await res.json();
        latestData = data;
        renderButtons(data);
        updateHeader(data);
        updateNewsTicker(data);
        if (isMobile) {
            setTimeout(startMobileTickerCycle, 1000);
        }
    } catch (e) {
        console.error('Failed to load headlines:', e);
    }
}

// ── Scattering Logic ───────────────────────────────
// Distribute points geographically if they belong to the same country
const SCATTER_RADIUS = 1.2; 

function applyGeographicJitter(headlines) {
    const countryGroups = {};
    headlines.forEach(h => {
        if (h._orig_lon === undefined) h._orig_lon = parseFloat(h.lon);
        if (h._orig_lat === undefined) h._orig_lat = parseFloat(h.lat);
        h.lon = h._orig_lon;
        h.lat = h._orig_lat;

        if (!countryGroups[h.country]) countryGroups[h.country] = [];
        countryGroups[h.country].push(h);
    });

    Object.values(countryGroups).forEach(group => {
        if (group.length > 1) {
            // Sort group deterministically so the jitter angle (based on index 'i') is always the same for each source
            group.sort((a, b) => {
                const idA = a.source_id || '';
                const idB = b.source_id || '';
                return idA.localeCompare(idB);
            });
            const country = group[0].country;
            group.forEach((h, i) => {
                const angle = (i / group.length) * Math.PI * 2;
                let radius = SCATTER_RADIUS;
                
                let latOffset = 0;
                let lonOffset = 0;

                if (country === 'United Kingdom') {
                    // Spread UK more vertically towards the north (Scotland) and slightly West
                    radius = 1.2;
                    const biasNorth = (i / group.length) * 5.0; 
                    latOffset = biasNorth + (Math.sin(angle) * 0.4);
                    lonOffset = -Math.abs(Math.cos(angle) * 0.3) - 0.5; // Bias West
                } else if (country === 'Brazil') {
                    radius = 1.5;
                    latOffset = Math.sin(angle) * radius;
                    lonOffset = -Math.abs(Math.cos(angle) * radius);
                } else {
                    radius = SCATTER_RADIUS * (1 + Math.floor(i / 6) * 0.4);
                    latOffset = Math.sin(angle) * radius;
                    lonOffset = Math.cos(angle) * radius;
                }

                h.lon = parseFloat(h.lon) + lonOffset;
                h.lat = parseFloat(h.lat) + latOffset;
            });
        }
    });
}

// ── Render Source Buttons ─────────────────────────────
function renderButtons(headlines) {
    const layer = document.getElementById('sources-layer');
    
    // Apply jitter to spread points within countries
    applyGeographicJitter(headlines);

    headlines.forEach(h => {
        let btn = buttonElements[h.source_id];
        if (!btn) {
            btn = document.createElement('div');
            btn.className = 'source-btn';
            btn.id = `btn-${h.source_id}`;

            // Toggle preview on click
            btn.addEventListener('click', (e) => {
                e.stopPropagation();

                if (isRemovingSource) {
                    const sourceName = h.sourceName || h.source_id;
                    const exactName = prompt(`${t('remove_confirm')} "${sourceName}"?\n\n${t('exact_name_prompt')}`);
                    if (exactName === sourceName) {
                        removeSource(h.source_id).then(() => {
                            stopRemovingSource();
                            alert(`"${sourceName}" ${t('remove_success')}`);
                        });
                    } else if (exactName !== null) {
                        alert(t('incorrect_name'));
                    }
                    return;
                }

                if (isEditingSource) {
                    openEditModal(h);
                    stopEditingSource();
                    return;
                }

                if (btn.classList.contains('active')) return;

                // Close others
                Object.values(buttonElements).forEach(other => {
                    if (other !== btn) other.classList.remove('active');
                });

                btn.classList.add('active');
                hideTooltip();
                isUserInteracting = true;
                stopAutoRotate();
                clearResumeTimeout();
            });

            layer.appendChild(btn);
            buttonElements[h.source_id] = btn;
        }

        btn.dataset.lng = h.lon;
        btn.dataset.lat = h.lat;
        btn.dataset.headlineId = h.id;
        btn.dataset.sourceId = h.source_id;

        btn.style.display = 'block';

        btn.innerHTML = `
            <div class="btn-content">
                <div class="btn-source-name">${h.flag || ''} ${h.sourceName || h.source_id}</div>
                <div class="btn-headline ${h.title ? '' : 'no-data'}">${truncate(h.title || t('no_headline'), 90)}</div>
                <div class="btn-date">${formatDate(h.published_at || h.fetched_at)}</div>
                <div class="btn-cta">${t('click_to_read')}</div>
            </div>
        `;

        // Click on preview box opens article
        btn.querySelector('.btn-content').addEventListener('click', (e) => {
            e.stopPropagation();
            openArticlePopup(h.id);
        });

        // Tooltip
        btn.addEventListener('mouseenter', (e) => {
            if (!btn.classList.contains('active')) showTooltip(e, h);
        });
        btn.addEventListener('mouseleave', () => {
            hideTooltip();
        });
        btn.addEventListener('mousemove', moveTooltip);
    });

    // Cleanup old buttons if data shrank
    const currentIds = headlines.map(h => h.source_id);
    Object.keys(buttonElements).forEach(id => {
        if (!currentIds.includes(id)) {
            buttonElements[id].remove();
            delete buttonElements[id];
        }
    });

    updateButtonPositions();
}

// Removed legacy cluster functions

// Global click to close active previews
document.addEventListener('click', () => {
    let wasActive = false;
    Object.values(buttonElements).forEach(btn => {
        if (btn.classList.contains('active')) wasActive = true;
        btn.classList.remove('active');
    });
    
    if (wasActive) {
        if (!isUserInteracting) {
             isUserInteracting = false;
             scheduleAutoRotateResume();
        }
    }
});

function hideTooltip() {
    document.getElementById('tooltip').style.display = 'none';
}

// ── Update Button Positions & Visibility ──
function updateButtonPositions() {
    Object.values(buttonElements).forEach(btn => {
        const lng = parseFloat(btn.dataset.lng);
        const lat = parseFloat(btn.dataset.lat);
        if (isNaN(lng) || isNaN(lat)) { btn.style.display = 'none'; return; }

        const distFromCenter = d3.geoDistance([lng, lat], [
            -projection.rotate()[0],
            -projection.rotate()[1]
        ]);

        if (distFromCenter > VISIBILITY_THRESHOLD) {
            btn.style.display = 'none';
            btn.style.opacity = '0';
            btn.classList.remove('active');
            return;
        }

        const coords = projection([lng, lat]);
        if (!coords || isNaN(coords[0]) || isNaN(coords[1])) { btn.style.display = 'none'; return; }
        
        btn.style.display = 'block';
        const fadeStart = VISIBILITY_THRESHOLD * 0.7;
        const opacity = distFromCenter < fadeStart ? 1 : 1 - ((distFromCenter - fadeStart) / (VISIBILITY_THRESHOLD - fadeStart));
        btn.style.opacity = Math.max(0, Math.min(1, opacity)).toFixed(2);

        const scaleF = 0.6 + 0.4 * (1 - distFromCenter / VISIBILITY_THRESHOLD);
        const finalScale = btn.classList.contains('active') ? scaleF * 1.3 : scaleF;

        btn.style.left = coords[0] + 'px';
        btn.style.top = coords[1] + 'px';
        btn.style.transform = `translate(-50%, -50%) scale(${finalScale.toFixed(2)})`;
    });
}

// ── Country Click Handler ─────────────────────────────
async function onCountryClick(countryName, feature, element) {
    // Highlight the country
    selectedCountryName = countryName;
    d3.selectAll('.country').classed('country-selected', false);
    d3.select(element).classed('country-selected', true);

    // Pause rotation
    isUserInteracting = true;
    stopAutoRotate();
    clearResumeTimeout();

    // Show country panel
    const panel = document.getElementById('country-panel');
    const panelTitle = document.getElementById('country-panel-title');
    const panelList = document.getElementById('country-panel-list');
    const panelLoading = document.getElementById('country-panel-loading');

    panelTitle.textContent = countryName;
    panelList.innerHTML = '';
    panelLoading.style.display = 'block';
    panel.classList.add('open');
    document.body.classList.add('panel-open');

    try {
        const res = await fetch(`/api/country/${encodeURIComponent(countryName)}`);
        const headlines = await res.json();
        panelLoading.style.display = 'none';

        if (headlines.length === 0) {
            panelList.innerHTML = `<li class="no-results">${t('no_country_results')}</li>`;
        } else {
            headlines.forEach(h => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="cp-source">${h.flag || ''} ${h.sourceName || h.source_id}</div>
                    <a href="#" class="cp-title" data-id="${h.id}">${h.title}</a>
                    <div class="cp-date">${formatDate(h.published_at || h.fetched_at)}</div>
                `;
                li.querySelector('.cp-title').addEventListener('click', (e) => {
                    e.preventDefault();
                    openArticlePopup(h.id);
                });
                panelList.appendChild(li);
            });
        }
    } catch (e) {
        panelLoading.style.display = 'none';
        panelList.innerHTML = `<li class="no-results">${t('error_fetch')}</li>`;
    }
}

function closeCountryPanel() {
    document.getElementById('country-panel').classList.remove('open');
    document.body.classList.remove('panel-open');
    d3.selectAll('.country').classed('country-selected', false);
    selectedCountryName = null;
    isUserInteracting = false;
    scheduleAutoRotateResume();
}

// ── Article Popup Modal ───────────────────────────────
async function openArticlePopup(headlineId) {
    const overlay = document.getElementById('popup-overlay');
    const popupBody = document.getElementById('popup-body');

    // Show loading
    popupBody.innerHTML = `
        <div class="loading-state" style="height:200px">
            <div class="spinner"></div>
            <p>${t('loading_headline')}</p>
        </div>
    `;
    overlay.classList.add('open');

    try {
        const res = await fetch(`/api/headline/${headlineId}`);
        if (!res.ok) throw new Error('Not found');
        const h = await res.json();

        // Build popup content
        let heroHtml = '';
        if (h.image_url) {
            heroHtml = `<div class="popup-hero"><img src="${h.image_url}" alt="${h.title || ''}" onerror="this.parentElement.remove()" /></div>`;
        }

        // Build popup content

        let categoriesHtml = '';
        if (h.categories) {
            categoriesHtml = '<div class="article-categories">' +
                h.categories.split(',').map(c => `<span class="cat-tag">${c.trim()}</span>`).join('') +
                '</div>';
        }

        popupBody.innerHTML = `
            ${heroHtml}
            <div class="popup-inner">
                <div class="article-meta">
                    <span>${h.flag || ''}</span>
                    <span class="source-name-big">${h.sourceName || h.source_id}</span>
                    <span class="sep">·</span>
                    <span>${formatDateFull(h.published_at || h.fetched_at)}</span>
                </div>
                <h2 class="popup-title">${h.title || ''}</h2>
                ${h.author ? `<div class="article-author">Por ${h.author}</div>` : ''}
                ${categoriesHtml}
                <div class="article-description">${h.description || `<em style="opacity:0.5">${t('no_summary')}</em>`}</div>
                
                <a href="${h.url}" target="_blank" rel="noopener noreferrer" class="read-full-btn" style="margin-top: 12px;">
                    ${t('read_full')} ${h.sourceName || h.source_id} →
                </a>
            </div>
        `;

        // Also load history
        loadPopupHistory(h.source_id, h.sourceName, headlineId);
    } catch (e) {
        popupBody.innerHTML = `<div class="popup-inner"><p style="color:#ff5757">${t('error_load_headline')}</p></div>`;
    }
}

async function loadPopupHistory(sourceId, sourceName, currentId) {
    try {
        const res = await fetch(`/api/history/${sourceId}?page=1`);
        const data = await res.json();
        if (!data.rows || data.rows.length === 0) return;

        const filtered = data.rows.filter(r => String(r.id) !== String(currentId)).slice(0, 8);
        if (filtered.length === 0) return;

        const historyHtml = `
            <div class="popup-history">
                <h3>Manchetes recentes — ${sourceName || sourceId}</h3>
                <ul>
                    ${filtered.map(r => `
                        <li>
                            <a href="#" onclick="event.preventDefault(); openArticlePopup(${r.id})">${r.title}</a>
                            <div class="hdate">${formatDateFull(r.published_at || r.fetched_at)}</div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
        document.getElementById('popup-body').insertAdjacentHTML('beforeend', historyHtml);
    } catch (e) {
        console.warn('Could not load history:', e);
    }
}

// ── Global AI Chat Logic ──────────────────────────────
function initGlobalChat() {
    const toggle = document.getElementById('ai-chat-toggle');
    const windowEl = document.getElementById('ai-chat-window');
    const closeBtn = document.getElementById('chat-close');
    const clearBtn = document.getElementById('chat-clear');
    const sendBtn = document.getElementById('chat-send');
    const input = document.getElementById('chat-input');
    const messages = document.getElementById('chat-messages');

    toggle.addEventListener('click', () => {
        windowEl.classList.toggle('open');
        const isOpen = windowEl.classList.contains('open');
        if (isOpen) input.focus();
    });

    closeBtn.addEventListener('click', () => {
        windowEl.classList.remove('open');
    });

    clearBtn.addEventListener('click', () => {
        if (confirm(t('clear_history'))) {
            chatHistory = [];
            messages.innerHTML = `<div class="msg ai">${t('history_cleared')}</div>`;
        }
    });

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        const selectedModel = document.getElementById('chat-model-select').value;

        // User message
        addChatMessage(text, 'user');
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        // Loading state
        const loadingMsg = addChatMessage(t('ai_analyzing'), 'ai loading');

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: text,
                    history: chatHistory,
                    model: selectedModel,
                    customApiKey: localStorage.getItem('visitorApiKey'),
                    role: localStorage.getItem('userRole')
                })
            });
            const data = await res.json();
            
            loadingMsg.remove();
            if (res.ok) {
                addChatMessage(data.response, 'ai');
                // Update history
                chatHistory.push({ role: 'user', text: text });
                chatHistory.push({ role: 'ai', text: data.response });
                // Limit history to last 10 exchanges
                if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
            } else {
                addChatMessage('⚠️ ' + (data.error || 'Erro ao falar com a IA'), 'ai');
            }
        } catch (e) {
            loadingMsg.remove();
            addChatMessage(t('ai_conn_error'), 'ai');
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function addChatMessage(text, type) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    
    // Use marked.js if available for rich responses
    if (window.marked && type.includes('ai') && !type.includes('loading')) {
        div.innerHTML = window.marked.parse(text);
    } else {
        div.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }
    
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
}

async function runAIAnalysis(headlineId) {
    // Legacy - removed from popup UI but kept for backend compatibility if needed
}

function closePopup() {
    document.getElementById('popup-overlay').classList.remove('open');
    isUserInteracting = false;
    scheduleAutoRotateResume();
}

// ── Tooltip ───────────────────────────────────────────
function showTooltip(e, h) {
    const tip = document.getElementById('tooltip');
    tip.innerHTML = `
    <strong>${h.flag || ''} ${h.sourceName}</strong> · ${h.city || h.country}<br/><br/>
    ${truncate(h.title || '', 140)}
  `;
    tip.style.display = 'block';
    moveTooltip(e);
}
function moveTooltip(e) {
    const tip = document.getElementById('tooltip');
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + 280 > window.innerWidth) x = e.clientX - 280;
    if (y + 100 > window.innerHeight) y = e.clientY - 100;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
}

// ── Manual Fetch Trigger ──────────────────────────────
async function triggerFetch() {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('spinning');
    btn.disabled = true;
    try {
        await fetch('/api/fetch', { method: 'POST' });
        await new Promise(r => setTimeout(r, 3000));
        await refreshHeadlines();
    } finally {
        btn.classList.remove('spinning');
        btn.disabled = false;
    }
}

// ── Update Header ─────────────────────────────────────
function updateHeader(data) {
    document.getElementById('total-count').textContent = `${data.length} ${t('headlines_count')}`;
    const locale = currentLang === 'pt' ? 'pt-BR' : 'en-US';
    document.getElementById('last-update').textContent = `${t('updated')} ${new Date().toLocaleTimeString(locale)}`;
}

// ── Helpers ───────────────────────────────────────────
function truncate(str, n) {
    return str && str.length > n ? str.substring(0, n) + '…' : str;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
}

function formatDateFull(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleString('pt-BR', {
            weekday: 'short', day: '2-digit', month: 'short',
            year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch { return dateStr; }
}

// ── Blog Generator Logic ──────────────────────────────
async function generateBlog(lean, sentiment) {
    const overlay = document.getElementById('popup-overlay');
    const popupBody = document.getElementById('popup-body');

    // Show loading
    popupBody.innerHTML = `
        <div class="loading-state" style="height:350px">
            <div class="spinner"></div>
            <p>A IA está escrevendo a matéria de blog...</p>
            <p style="font-size:12px;opacity:0.6;margin-top:-8px">Viés: ${lean} | Tom: ${sentiment}</p>
        </div>
    `;
    overlay.classList.add('open');

    try {
        const res = await fetch('/api/generate-blog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lean, sentiment })
        });
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Erro ao gerar blog');
        }

        // Render Markdown using marked.js if available
        let htmlContent = window.marked ? window.marked.parse(data.markdown) : data.markdown.replace(/\n/g, '<br/>');

        currentArticleMarkdown = data.markdown;
        // Extract title for the PDF filename
        const titleMatch = data.markdown.match(/^# (.*)/m);
        currentArticleTitle = titleMatch ? titleMatch[1] : 'Artigo';

        popupBody.innerHTML = `
            <div class="popup-inner">
                <div class="article-meta" style="margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">
                    <button class="download-pdf-btn" onclick="downloadAsPDF()">${t('download_pdf')}</button>
                    <span class="sep">·</span>
                    <span>${t('generated_by_ai')}</span>
                </div>
                <div class="blog-formatted-content">
                    ${htmlContent}
                </div>
            </div>
        `;
    } catch (e) {
        popupBody.innerHTML = `<div class="popup-inner"><p style="color:#ff5757">Erro: ${e.message}</p></div>`;
    }
}

async function downloadAsPDF() {
    const btn = document.querySelector('.download-pdf-btn');
    const originalText = btn.textContent;
    btn.textContent = t('generating');
    btn.disabled = true;

    try {
        const response = await fetch('/api/download-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                markdown: currentArticleMarkdown,
                title: currentArticleTitle
            })
        });

        if (!response.ok) throw new Error('PDF generation failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentArticleTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (err) {
        console.error('Download error:', err);
        alert(t('download_error'));
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
// ── Add Source Logic ───────────────────────────────
function initAddSourceUI() {
    const btn = document.getElementById('add-source-btn');
    const removeBtn = document.getElementById('remove-source-btn');
    const editBtn = document.getElementById('edit-source-btn');
    const modal = document.getElementById('add-source-modal');
    const close = document.getElementById('modal-close-btn');
    const pickBtn = document.getElementById('pick-coords-btn');
    const saveBtn = document.getElementById('save-source-btn');

    btn.addEventListener('click', () => {
        if (isRemovingSource) stopRemovingSource();
        if (isEditingSource) stopEditingSource();
        
        // Reset modal to Add Mode
        document.getElementById('modal-title').textContent = t('modal_title_add');
        document.getElementById('save-source-btn').textContent = t('save_source_add');
        document.getElementById('edit-source-id').value = '';
        document.getElementById('source-name').value = '';
        document.getElementById('source-country').value = '';
        document.getElementById('source-city').value = '';
        document.getElementById('source-rss').value = '';
        document.getElementById('source-lat').value = '';
        document.getElementById('source-lon').value = '';

        modal.classList.add('open');
        refreshSourceList();
    });
    
    removeBtn.addEventListener('click', () => {
        if (isEditingSource) stopEditingSource();
        if (isRemovingSource) {
            stopRemovingSource();
        } else {
            startRemovingSource();
        }
    });

    editBtn.addEventListener('click', () => {
        if (isRemovingSource) stopRemovingSource();
        if (isEditingSource) {
            stopEditingSource();
        } else {
            startEditingSource();
        }
    });

    close.addEventListener('click', () => {
        modal.classList.remove('open');
        stopPickingCoords();
    });

    pickBtn.addEventListener('click', () => {
        startPickingCoords();
    });

    saveBtn.addEventListener('click', saveNewSource);
}

async function refreshSourceList() {
    const listContainer = document.getElementById('manage-sources-list');
    if (!listContainer) return;

    try {
        const res = await fetch('/api/sources');
        const sources = await res.json();
        
        listContainer.innerHTML = '';
        if (sources.length === 0) {
            listContainer.innerHTML = '<div class="loading-sources">Nenhuma fonte cadastrada.</div>';
            return;
        }

        sources.forEach(s => {
            const item = document.createElement('div');
            item.className = 'source-item';
            item.innerHTML = `
                <div class="source-item-info">
                   <div class="source-item-name">${s.flag || '🌍'} ${s.name}</div>
                   <div class="source-item-url">${s.rssUrl}</div>
                </div>
                <button class="remove-source-btn" data-id="${s.id}">Remover</button>
            `;

            item.querySelector('.remove-source-btn').addEventListener('click', e => {
                const id = e.target.dataset.id;
                if (confirm(`Deseja remover a fonte "${s.name}"? As notícias dela também serão apagadas.`)) {
                    removeSource(id);
                }
            });

            listContainer.appendChild(item);
        });
    } catch (e) {
        listContainer.innerHTML = '<div class="loading-sources" style="color:var(--right)">Erro ao carregar fontes.</div>';
    }
}

async function removeSource(id) {
    try {
        const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
        if (res.ok) {
            refreshSourceList();
            triggerFetch(); // Refresh globe data
        } else {
            const err = await res.json();
            alert('Erro: ' + err.error);
        }
    } catch (e) {
        alert('Erro ao remover fonte.');
    }
}

function startPickingCoords() {
    isPickingCoords = true;
    document.body.classList.add('map-picking');
    document.getElementById('pick-instr').classList.add('active');
    document.getElementById('add-source-modal').style.opacity = '0.1'; // More transparent
    document.getElementById('add-source-modal').style.pointerEvents = 'none';
    
    // Pause rotation
    isUserInteracting = true;
    stopAutoRotate();
}

function stopPickingCoords() {
    isPickingCoords = false;
    document.body.classList.remove('map-picking');
    document.getElementById('pick-instr').classList.remove('active');
    document.getElementById('add-source-modal').style.opacity = '1';
    document.getElementById('add-source-modal').style.pointerEvents = 'all';
}

function startRemovingSource() {
    isRemovingSource = true;
    document.body.classList.add('source-removing');
    document.getElementById('remove-instr').classList.add('active');
    
    isUserInteracting = true;
    stopAutoRotate();
}

function stopRemovingSource() {
    isRemovingSource = false;
    document.body.classList.remove('source-removing');
    document.getElementById('remove-instr').classList.remove('active');
    
    isUserInteracting = false;
    scheduleAutoRotateResume();
}

function startEditingSource() {
    isEditingSource = true;
    document.body.classList.add('source-editing');
    document.getElementById('edit-instr').classList.add('active');
    
    isUserInteracting = true;
    stopAutoRotate();
}

function stopEditingSource() {
    isEditingSource = false;
    document.body.classList.remove('source-editing');
    document.getElementById('edit-instr').classList.remove('active');
    
    isUserInteracting = false;
    scheduleAutoRotateResume();
}

// Global modal fetching for edit
async function openEditModal(h) {
    try {
        // Fetch full source list to get the rssUrl
        const res = await fetch('/api/sources');
        const sources = await res.json();
        const sourceMatch = sources.find(s => s.id === h.source_id);
        
        if (sourceMatch) {
            document.getElementById('modal-title').textContent = t('modal_title_edit');
            document.getElementById('save-source-btn').textContent = t('save_source_edit');
            document.getElementById('edit-source-id').value = sourceMatch.id;
            
            document.getElementById('source-name').value = sourceMatch.name || '';
            document.getElementById('source-country').value = sourceMatch.country || '';
            document.getElementById('source-city').value = sourceMatch.city || '';
            document.getElementById('source-rss').value = sourceMatch.rssUrl || '';
            document.getElementById('source-lat').value = sourceMatch.lat || '';
            document.getElementById('source-lon').value = sourceMatch.lon || '';
            
            document.getElementById('add-source-modal').classList.add('open');
            refreshSourceList();
        }
    } catch (e) {
        alert('Erro ao carregar dados da fonte.');
    }
}

async function saveNewSource() {
    const name = document.getElementById('source-name').value;
    const country = document.getElementById('source-country').value;
    const city = document.getElementById('source-city').value;
    const rssUrl = document.getElementById('source-rss').value;
    const lat = document.getElementById('source-lat').value;
    const lon = document.getElementById('source-lon').value;

    if (!name || !rssUrl || !lat || !lon) {
        alert(t('fill_fields'));
        return;
    }

    const editId = document.getElementById('edit-source-id').value;
    const saveBtn = document.getElementById('save-source-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = t('save_saving');

    try {
        let res, data;
        
        if (editId) {
            // Edit Mode
            res = await fetch(`/api/sources/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, rssUrl, lat, lon, country, city })
            });
            data = await res.json();
            
            if (res.ok) {
                alert(t('edit_success'));
            }
        } else {
            // Create Mode
            res = await fetch('/api/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, rssUrl, lat, lon, country, city })
            });
            data = await res.json();

            if (res.ok) {
                alert(t('add_success'));
            }
        }

        if (res.ok) {
            document.getElementById('add-source-modal').classList.remove('open');
            // Clean inputs
            document.getElementById('source-name').value = '';
            document.getElementById('source-country').value = '';
            document.getElementById('source-city').value = '';
            document.getElementById('source-rss').value = '';
            document.getElementById('source-lat').value = '';
            document.getElementById('source-lon').value = '';
            document.getElementById('edit-source-id').value = '';
            
            // Refresh data
            triggerFetch();
        } else {
            alert('Erro: ' + data.error);
        }
    } catch (e) {
        alert(t('error_server'));
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = editId ? t('save_source_edit') : t('save_source_add');
    }
}

// ── News Ticker Widget ────────────────────────────────
const TICKER_INTERVAL_MS = 12000; // 12 seconds per headline
let tickerItems = [];
let tickerIndex = 0;
let tickerTimer = null;

function setTickerVisible(visible) {
    const ticker = document.getElementById('news-ticker-widget');
    if (!ticker) return;
    ticker.style.display = visible ? 'flex' : 'none';
}

function updateNewsTicker(data) {
    if (!data || data.length === 0) return;

    // Sort by fetched_at descending, then keep only the latest headline per source
    const sorted = [...data]
        .filter(h => h.title)
        .sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at));
    const seenSources = new Set();
    tickerItems = sorted.filter(h => {
        const sid = h.source_id || h.sourceName;
        if (seenSources.has(sid)) return false;
        seenSources.add(sid);
        return true;
    });

    renderTickerList();
    tickerIndex = 0;
    highlightTickerItem(0);

    // Auto-cycle highlight
    if (tickerTimer) clearInterval(tickerTimer);
    tickerTimer = setInterval(() => {
        tickerIndex = (tickerIndex + 1) % tickerItems.length;
        highlightTickerItem(tickerIndex);
        scrollTickerToActive();
        startProgressBar();
    }, TICKER_INTERVAL_MS);

    startProgressBar();
}

// Translation cache (session-scoped, keyed by headline id)
const tickerTranslationCache = new Map();

function renderTickerList() {
    const list = document.getElementById('ntw-list');
    if (!list) return;
    list.innerHTML = '';
    tickerItems.forEach((item, idx) => {
        const el = document.createElement('div');
        el.className = 'ntw-item';
        el.dataset.idx = idx;
        const time = item.published_at || item.fetched_at;
        el.innerHTML = `
            <div class="ntw-item-source">${item.flag || '🌐'} ${item.sourceName || item.source_id}</div>
            <div class="ntw-item-title">${item.title}</div>
            <div class="ntw-item-time">${formatDate(time)}</div>
        `;
        el.addEventListener('click', () => openArticlePopup(item.id));
        list.appendChild(el);

        // Translate if headline is not Portuguese
        if (item.lang && item.lang !== 'pt') {
            translateTickerItem(item, el);
        }
    });
}

async function translateTickerItem(item, el) {
    const titleEl = el.querySelector('.ntw-item-title');
    if (!titleEl) return;

    // Return cached translation immediately
    if (tickerTranslationCache.has(item.id)) {
        titleEl.textContent = tickerTranslationCache.get(item.id);
        return;
    }

    try {
        const customApiKey = localStorage.getItem('visitorApiKey') || undefined;
        const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: item.title, targetLang: 'pt', customApiKey })
        });
        if (!res.ok) return; // silently skip on error
        const data = await res.json();
        if (data.translated) {
            tickerTranslationCache.set(item.id, data.translated);
            // Update DOM only if element is still in the list
            if (el.isConnected) titleEl.textContent = data.translated;
        }
    } catch (e) {
        // Silently fail — original title stays
    }
}

function highlightTickerItem(idx) {
    document.querySelectorAll('.ntw-item').forEach((el, i) => {
        el.classList.toggle('ntw-active', i === idx);
    });
}

function scrollTickerToActive() {
    const list = document.getElementById('ntw-list');
    const active = list?.querySelector('.ntw-active');
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function startProgressBar() {
    const bar = document.getElementById('ntw-progress');
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            bar.style.transition = `width ${TICKER_INTERVAL_MS}ms linear`;
            bar.style.width = '100%';
        });
    });
}
