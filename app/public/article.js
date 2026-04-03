/* =====================================================
   article.js — Article Preview Page
   ===================================================== */

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const sourceId = params.get('source');

    if (!id) {
        document.getElementById('article-loading').innerHTML = '<p>ID de manchete não encontrado.</p>';
        return;
    }

    try {
        const res = await fetch(`/api/headline/${id}`);
        if (!res.ok) throw new Error('Not found');
        const h = await res.json();
        renderArticle(h);
        loadHistory(h.source_id, h.sourceName);
    } catch (e) {
        document.getElementById('article-loading').innerHTML = `
      <p style="color:#ff5757">Erro ao carregar manchete.</p>
      <a href="/" style="color:#4a9eff;margin-top:12px">← Voltar ao mapa</a>
    `;
    }
});

function renderArticle(h) {
    document.getElementById('article-loading').classList.add('hidden');
    const content = document.getElementById('article-content');
    content.classList.remove('hidden');

    // Update page title
    document.title = `${h.title} — World Headlines`;

    // Hero image
    if (h.image_url) {
        const hero = document.getElementById('article-hero');
        const img = document.createElement('img');
        img.src = h.image_url;
        img.alt = h.title;
        img.onerror = () => hero.remove();
        hero.appendChild(img);
    } else {
        document.getElementById('article-hero').remove();
    }

    // Meta
    document.getElementById('article-flag').textContent = h.flag || '';
    document.getElementById('article-source-name').textContent = h.sourceName || h.source_id;

    const leanBadge = document.getElementById('article-lean-badge');
    leanBadge.textContent = { left: 'Esquerda', center: 'Centro', right: 'Direita' }[h.lean] || h.lean || '';
    if (h.lean) leanBadge.classList.add(h.lean);

    document.getElementById('article-date').textContent = formatDate(h.published_at || h.fetched_at);

    // Title
    document.getElementById('article-title').textContent = h.title || '';

    // Author
    if (h.author) {
        const el = document.getElementById('article-author');
        el.textContent = `Por ${h.author}`;
        el.classList.remove('hidden');
    }

    // Categories
    if (h.categories) {
        const el = document.getElementById('article-categories');
        h.categories.split(',').forEach(cat => {
            const tag = document.createElement('span');
            tag.className = 'cat-tag';
            tag.textContent = cat.trim();
            el.appendChild(tag);
        });
        el.classList.remove('hidden');
    }

    // Description
    const descEl = document.getElementById('article-description');
    if (h.description) {
        descEl.textContent = h.description;
    } else {
        descEl.textContent = 'Resumo não disponível neste feed. Clique em "Ler artigo completo" para acessar o conteúdo completo no site original.';
        descEl.style.opacity = '0.5';
        descEl.style.fontStyle = 'italic';
    }

    // Read full article link
    const link = document.getElementById('article-link');
    link.href = h.url;
    link.textContent = `Ler artigo completo em ${h.sourceName || h.source_id} →`;
}

async function loadHistory(sourceId, sourceName) {
    try {
        const res = await fetch(`/api/history/${sourceId}?page=1`);
        const data = await res.json();
        const panel = document.getElementById('history-panel');
        const list = document.getElementById('history-list');
        document.getElementById('history-source-name').textContent = sourceName || sourceId;

        if (!data.rows || data.rows.length === 0) return;

        const currentId = new URLSearchParams(window.location.search).get('id');

        data.rows
            .filter(r => String(r.id) !== currentId)
            .slice(0, 10)
            .forEach(r => {
                const li = document.createElement('li');
                li.innerHTML = `
          <a href="/article.html?id=${r.id}&source=${sourceId}">${r.title}</a>
          <div class="hdate">${formatDate(r.published_at || r.fetched_at)}</div>
        `;
                list.appendChild(li);
            });

        panel.classList.remove('hidden');
    } catch (e) {
        console.warn('Could not load history:', e);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleString('pt-BR', {
            weekday: 'short', day: '2-digit', month: 'short',
            year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch { return dateStr; }
}
