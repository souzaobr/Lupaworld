require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./database');
const sources = require('./sources');
const { fetchAll } = require('./fetcher');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();

// --- Static and Routing ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicitly serve index.html for the /admin route (for the frontend to handle it)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
async function researchOnWeb(query) {
    try {
        console.log(`[Research] Searching for: ${query}`);
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 5000
        });
        const $ = cheerio.load(data);
        const searchResults = [];
        $('.result').slice(0, 3).each((i, el) => {
            const title = $(el).find('.result__title').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            const link = $(el).find('.result__url').text().trim();
            if (title && snippet) {
                searchResults.push({ title, snippet, link });
            }
        });
        console.log(`[Research] Found ${searchResults.length} related results.`);
        return searchResults;
    } catch (err) {
        console.error('[Research Error]', err.message);
        return [];
    }
}
// --- AI Model & Helpers ---
const PORT = process.env.PORT || 3000;

// Inject source metadata (lat, lon, lean, etc.) into headline responses
const sourceMap = Object.fromEntries(sources.map(s => [s.id, s]));

function enrichHeadline(h) {
    const src = sourceMap[h.source_id] || {};
    return { ...h, ...{ sourceName: src.name, flag: src.flag, country: src.country, city: src.city, lat: src.lat, lon: src.lon, lean: src.lean, lang: src.lang, website: src.website } };
}

// GET /api/sources — all sources with metadata
app.get('/api/sources', (req, res) => {
    res.json(sources);
});

// POST /api/sources — Add a new news source
app.post('/api/sources', (req, res) => {
    const { name, rssUrl, lat, lon, country, city } = req.body;
    
    if (!name || !rssUrl || lat === undefined || lon === undefined) {
        return res.status(400).json({ error: 'Faltam campos obrigatórios (nome, rssUrl, lat, lon)' });
    }

    // Create unique ID
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Check if duplicate
    if (sources.find(s => s.id === id)) {
        return res.status(400).json({ error: 'Uma fonte com este nome já existe.' });
    }

    const newSource = {
        id,
        name,
        flag: '🌍',
        country: country || 'User Added',
        city: city || 'Unknown',
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        lean: 'center',
        lang: 'en',
        rssUrl,
        website: rssUrl.split('/').slice(0, 3).join('/')
    };

    // 1. Update in-memory
    sources.push(newSource);
    sourceMap[id] = newSource;

    // 2. Persist to sources.js
    try {
        const filePath = path.join(__dirname, 'sources.js');
        const fileContent = `const sources = ${JSON.stringify(sources, null, 2)};\n\nmodule.exports = sources;\n`;
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`[Source] New source added and persisted: ${id}`);
        
        // 3. Trigger immediate fetch for the new source
        fetchAll(); 
        
        res.json({ message: 'Fonte adicionada com sucesso!', source: newSource });
    } catch (err) {
        console.error('[Add Source Error]', err.message);
        res.status(500).json({ error: 'Erro ao salvar fonte no servidor.' });
    }
});

// DELETE /api/sources/:id — Remove a news source
app.delete('/api/sources/:id', (req, res) => {
    const { id } = req.params;
    const index = sources.findIndex(s => s.id === id);

    if (index === -1) {
        return res.status(404).json({ error: 'Fonte não encontrada.' });
    }

    const removedSource = sources.splice(index, 1)[0];
    delete sourceMap[id];

    // Persist to sources.js
    try {
        const filePath = path.join(__dirname, 'sources.js');
        const fileContent = `const sources = ${JSON.stringify(sources, null, 2)};\n\nmodule.exports = sources;\n`;
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`[Source] Source removed and persisted: ${id}`);
        
        // Optional: Clean headlines from DB for this source
        db.db.prepare('DELETE FROM headlines WHERE source_id = ?').run(id);
        
        res.json({ message: 'Fonte removida com sucesso!', source: removedSource });
    } catch (err) {
        console.error('[Remove Source Error]', err.message);
        res.status(500).json({ error: 'Erro ao remover fonte no servidor.' });
    }
});

// PUT /api/sources/:id — Update a news source
app.put('/api/sources/:id', (req, res) => {
    const { id } = req.params;
    const { name, rssUrl, lat, lon, country, city } = req.body;
    
    const index = sources.findIndex(s => s.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Fonte não encontrada.' });
    }

    if (!name || !rssUrl || lat === undefined || lon === undefined) {
        return res.status(400).json({ error: 'Faltam campos obrigatórios (nome, rssUrl, lat, lon)' });
    }

    const updatedSource = {
        ...sources[index],
        name,
        country: country || sources[index].country,
        city: city || sources[index].city,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        rssUrl,
        website: rssUrl.split('/').slice(0, 3).join('/')
    };

    sources[index] = updatedSource;
    sourceMap[id] = updatedSource;

    try {
        const filePath = path.join(__dirname, 'sources.js');
        const fileContent = `const sources = ${JSON.stringify(sources, null, 2)};\n\nmodule.exports = sources;\n`;
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`[Source] Source updated and persisted: ${id}`);
        
        // Trigger fetch so we get the new articles matching the updated metadata
        fetchAll();
        
        res.json({ message: 'Fonte atualizada com sucesso!', source: updatedSource });
    } catch (err) {
        console.error('[Update Source Error]', err.message);
        res.status(500).json({ error: 'Erro ao atualizar fonte no servidor.' });
    }
});

// GET /api/latest — most recent headline per source + source metadata
app.get('/api/latest', (req, res) => {
    const rows = db.getLatestPerSource();
    res.json(rows.map(enrichHeadline));
});

// GET /api/news — Polygo Predictor format adapter
// Returns { news: [{ title, url, source, description }] }
app.get('/api/news', (req, res) => {
    const rows = db.getLatestPerSource();
    const news = rows.map(enrichHeadline).map(h => ({
        title: h.title,
        url: h.url,
        source: h.sourceName || h.source_id,
        description: h.description || '',
        country: h.country || '',
        publishedAt: h.fetched_at || new Date().toISOString(),
    }));
    res.json({ news });
});

// GET /api/headline/:id — full headline detail & fetch full text dynamically
app.get('/api/headline/:id', async (req, res) => {
    const h = db.getHeadlineById(req.params.id);
    if (!h) return res.status(404).json({ error: 'Not found' });
    
    let enriched = enrichHeadline(h);

    // Try to read full article
    try {
        const response = await axios.get(h.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 6000
        });
        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header, aside, .ad, .ads, #ads, meta, link, svg').remove();
        
        let articleText = '';
        
        // 1. Try generic article container selectors
        const selectors = [
            'article', 
            '.article-content', 
            '.post-content', 
            '.story-body', 
            '.entry-content',
            'main', 
            '#main-content'
        ];
        
        for (let sel of selectors) {
            let pTexts = [];
            $(sel).find('p').each((i, el) => {
                const text = $(el).text().trim();
                if (text.length > 50) pTexts.push(text);
            });
            if (pTexts.length >= 2) {
                articleText = pTexts.join('\n\n');
                break;
            }
        }
        
        // 2. If no structured container found, fallback to any substantial paragraph 
        if (!articleText) {
            let pTexts = [];
            $('p').each((i, el) => {
                const text = $(el).text().trim();
                if (text.length > 50) pTexts.push(text);
            });
            if (pTexts.length > 0) {
                articleText = pTexts.join('\n\n');
            }
        }
        
        // Only replace if we extracted enough text
        if (articleText && articleText.length > 300) {
            enriched.description = articleText.replace(/\n/g, '<br>');
        }

    } catch (e) {
        console.error('[Full Text Fetch Error]', e.message);
    }

    res.json(enriched);
});

// GET /api/country/:country — headlines from all sources in a given country
app.get('/api/country/:country', (req, res) => {
    const countryName = decodeURIComponent(req.params.country).toLowerCase();
    const matchingSources = sources.filter(s => s.country.toLowerCase() === countryName);
    if (matchingSources.length === 0) return res.json([]);
    const sourceIds = matchingSources.map(s => s.id);
    const placeholders = sourceIds.map(() => '?').join(',');
    const rows = db.db.prepare(`
        SELECT * FROM headlines
        WHERE source_id IN (${placeholders})
        ORDER BY fetched_at DESC
        LIMIT 30
    `).all(...sourceIds);
    res.json(rows.map(enrichHeadline));
});

// GET /api/history/:sourceId — paginated headline history for one source
app.get('/api/history/:sourceId', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const data = db.getHistoryBySource(req.params.sourceId, page, 15);
    data.rows = data.rows.map(enrichHeadline);
    res.json(data);
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
    res.json(db.getStats());
});

// POST /api/fetch — manual trigger
app.post('/api/fetch', async (req, res) => {
    res.json({ message: 'Fetch started' });
    fetchAll();
});

// POST /api/login — Secure Admin Auth
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const validUser = process.env.ADMIN_USER || 'admin';
    const validPass = process.env.ADMIN_PASS || 'Amornews1!'; 

    if (username === validUser && password === validPass) {
        console.log(`[Auth] Admin login successful: ${username}`);
        res.json({ success: true, role: 'admin' });
    } else {
        console.warn(`[Auth] Failed login attempt for: ${username}`);
        res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
});

// POST /api/suggest-url — Public: visitor submits a URL suggestion
app.post('/api/suggest-url', (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL inválida.' });
    }
    // Basic URL validation
    try { new URL(url); } catch {
        return res.status(400).json({ error: 'URL inválida. Certifique-se de incluir http:// ou https://' });
    }
    db.insertSuggestedUrl(url.trim().substring(0, 500));
    console.log(`[Suggest] New URL submitted: ${url}`);
    res.json({ success: true });
});

// GET /api/suggested-urls — Admin only: list all submitted URLs
app.get('/api/suggested-urls', (req, res) => {
    const adminToken = req.headers['x-admin-token'];
    if (adminToken !== (process.env.ADMIN_PASS || 'Amornews1!')) {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    res.json(db.getSuggestedUrls());
});

// DELETE /api/suggested-urls/:id — Admin only: dismiss a submitted URL
app.delete('/api/suggested-urls/:id', (req, res) => {
    const adminToken = req.headers['x-admin-token'];
    if (adminToken !== (process.env.ADMIN_PASS || 'Amornews1!')) {
        return res.status(403).json({ error: 'Acesso negado.' });
    }
    db.deleteSuggestedUrl(req.params.id);
    res.json({ success: true });
});

// Headline Translation Endpoint — cheap single-turn call
app.post('/api/translate', async (req, res) => {
    const { text, targetLang = 'pt', customApiKey } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided.' });

    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(403).json({ error: 'No API key.' });

    try {
        const prompt = `Translate the following news headline to ${targetLang === 'pt' ? 'Brazilian Portuguese' : 'English'}. Return ONLY the translated headline, no explanations, no quotes:\n\n${text}`;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!translated) return res.status(500).json({ error: 'Translation failed.' });
        res.json({ translated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// AI Chat Endpoint - Context of ALL latest headlines + History
app.post('/api/chat', async (req, res) => {
    const { prompt, history = [], model = 'gemini-flash-latest', customApiKey, role } = req.body;

    let apiKey = customApiKey;
    if (role === 'admin') apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(403).json({ error: 'Nenhuma chave de API fornecida. Faça login como Admin ou insira sua chave Gemini.' });
    }

    try {
        const headlines = db.getLatestPerSource().map(enrichHeadline);
        
        // Prepare context: List of headlines with source, country, and political lean
        const contextStr = headlines.map(h => 
            `- [${h.sourceName}] (${h.country}, ${h.lean || 'unknown'}): ${h.title}`
        ).join('\n');

        const systemInstruction = `Você é a "LUPA", uma agente analista global de notícias e inteligência geopolítica. 

Sua missão única e exclusiva é analisar, interpretar e contextualizar informações baseadas em fatos, notícias e dados dos feeds RSS.

REGRAS DE CONDUTA E RESTRIÇÃO (CRÍTICO):
1. FOCO TOTAL EM NOTÍCIAS: Você só responde sobre geopolítica, economia, ciência, tecnologia, cultura e fatos que sejam notícia.
2. RECUSA DE ASSUNTOS IRRELEVANTES: Se o usuário pedir algo que não seja relacionado a notícias (ex: receitas de bolo, conselhos amorosos, ajuda com mensagens pessoais, previsões astrológicas, códigos de programação não relacionados a dados, ou chats casuais), você deve recusar educadamente.
   - Exemplo de resposta de recusa: "Peço desculpas, mas como analista de inteligência da Lupa, meu foco é restrito à análise de notícias e fatos globais. Não posso ajudar com [assunto solicitado]."
3. SEM CONSELHOS PESSOAIS: Nunca dê conselhos de vida, relacionamentos ou saúde.
4. ESTILO ANALÍTICO: Seu diferencial não é apenas responder, mas ADAPTAR sua forma de pensar conforme a pergunta.

Antes de responder, siga este processo mental (não exiba isso ao usuário):
1. Verifique se a pergunta é sobre notícias/geopolítica. Se não for, aplique a RECUSA.
2. Classifique o tipo de pergunta factual, relevância, análise crítica, tendência, etc.
3. Escolha um MODELO DE PENSAMENTO (Jornalista, Analista de Poder, Científico, Cético, etc).
4. Reestruture a informação dos feeds RSS com base nesse modo.

OBJETIVO FINAL: Ser a fonte mais inteligente e focada em dados do mundo, sem nunca fugir da sua função de analista de notícias.

CONTEXTO DAS MANCHETES ATUAIS:
${contextStr}`;

        // Prepare messages for Gemini API
        const contents = [];
        
        // Add history
        history.forEach(msg => {
            contents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            });
        });

        const finalPrompt = history.length === 0 
            ? `${systemInstruction}\n\nPergunta inicial do usuário: ${prompt}`
            : prompt;

        contents.push({
            role: 'user',
            parts: [{ text: finalPrompt }]
        });

        // Use the model provided by the client (with models/ prefix if missing)
        const activeModel = model.startsWith('models/') ? model : `models/${model}`;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${activeModel}:generateContent?key=${apiKey}`;
        
        const apiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents,
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.7
                }
            })
        });
        
        const data = await apiRes.json();
        
        if (!apiRes.ok) {
            throw new Error(data.error?.message || 'Erro na API do Gemini');
        }
        
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Não consegui gerar uma resposta.';
        res.json({ response: text });
    } catch (error) {
        console.error('[Chat Error]', error.message);
        let userMsg = 'Erro ao processar sua pergunta: ' + error.message;
        if (error.message.includes('quota') || error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')) {
            userMsg = '⏳ Limite de uso da API atingido. Aguarde alguns segundos e tente novamente.';
        } else if (error.message.includes('API key not valid')) {
            userMsg = '🔑 Chave de API inválida. Verifique sua GEMINI_API_KEY no arquivo .env';
        }
        res.status(500).json({ error: userMsg });
    }
});

app.post('/api/generate-blog', async (req, res) => {
    const { lean, sentiment } = req.body;

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
    }

    try {
        const headlines = db.getLatestPerSource().map(enrichHeadline);
        // Only take the top 30 to not overwhelm the limits, but give enough variety
        const contextStr = headlines.slice(0, 30).map(h => 
            `- [${h.sourceName}] (${h.country}): ${h.title}`
        ).join('\n');

        // --- RESEARCH STEP: Using AI to extract keywords first ---
        let researchStr = '';
        const topHeadline = headlines[0]?.title || 'notícias mundiais';
        
        try {
            // Ask Gemini for keywords to avoid long specific queries that fail in search
            const keywordPrompt = `Extraia apenas 3 ou 4 palavras-chave principais para uma pesquisa no Google sobre esta notícia: "${topHeadline}". Retorne apenas as palavras separadas por espaço.`;
            const keywordUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const kwRes = await fetch(keywordUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: keywordPrompt }] }] })
            });
            const kwData = await kwRes.json();
            const keywords = kwData.candidates[0]?.content.parts[0]?.text.trim() || topHeadline;
            
            console.log(`[Research] AI Keywords: ${keywords}`);
            const results = await researchOnWeb(keywords);
            if (results && results.length > 0) {
                researchStr = results.map(r => 
                    `- ${r.title}: ${r.snippet} (Link: ${r.link})`
                ).join('\n');
            }
        } catch (err) {
            console.error('[Research Pre-process Error]', err.message);
        }

        const ideology = `${lean} ${sentiment}`;
        const aiPrompt = `Escreva uma matéria de blog sobre a situação geopolítica atual com estilo profundamente humano, inteligente e original.

Quero um texto que pareça escrito por um excelente jornalista-ensaísta, não por uma IA. A escrita deve ser viva, natural, elegante e cheia de ritmo, com frases que variam de tamanho, observações sutis, transições orgânicas e vocabulário preciso. Evite completamente tom mecânico, didático demais, genérico, burocrático ou previsível.

Objetivo:
Produzir uma análise geopolítica atual que seja ao mesmo tempo informativa, interpretativa e agradável de ler, como um grande texto de revista, portal analítico ou blog autoral de alto nível.

Instruções de estilo:
- Escreva como alguém que realmente entende de política internacional e também sabe contar uma história.
- Não use estrutura engessada de IA.
- Não faça listas no corpo do texto, a menos que seja realmente necessário.
- Evite clichês como “em um mundo cada vez mais conectado”, “cenário complexo e desafidaro”, “vale destacar”, “por outro lado” repetido em excesso, ou frases vazias.
- O texto deve ter personalidade, mas sem virar opinião panfletária.
- A linguagem deve ser sofisticada sem ser pedante.
- O texto precisa soar humano: com nuance, contraste, ironia sutil quando couber, e percepção histórica.
- Mostre as tensões e ambiguidades do momento, em vez de simplificá-las.
- Faça conexões entre eventos, interesses econômicos, estratégia militar, energia, tecnologia, diplomacia e disputa de narrativa.
- Use imagens mentais ocasionais e formulações marcantes, mas sem exagerar.
- Não escreva como um paper acadêmico nem como notícia seca.
- Não invente fatos. Se houver incerteza, deixe isso claro com honestidade.
- Baseie a análise em informações atuais e verificáveis.

Estrutura desejada:
1. Um título muito bom, sofisticado e atraente, com cara de matéria de blog premium.
2. Um subtítulo curto e forte.
3. Uma abertura excelente, com gancho, atmosfera e contexto, sem parecer fórmula pronta.
4. Desenvolvimento em blocos bem costurados, sem subtítulos excessivos, a menos que melhorem muito a leitura.
5. Um fechamento memorável, que não resuma apenas, mas deixe uma ideia forte no ar.

Processo obrigatório antes de escrever:
1. Pesquise os principais acontecimentos geopolíticos mais relevantes do momento. (Utilize o contexto fornecido abaixo)
2. Identifique quais temas estão mais contundentes agora, com maior peso estratégico, econômico, militar, diplomático ou simbólico.
3. Escolha UM recorte principal, evitando tema morno, genérico ou já esgotado.
4. Defina o ângulo editorial com base na opção ideológica recebida.
5. Só então escreva a matéria.

Opções ideológicas possíveis:
- esquerda positiva
- esquerda negativa
- direita positiva
- direita negativa

Regra para escolha do tema:
O tema específico NÃO será fixo de antemão.
Ele deve ser escolhido pela própria IA com base em pesquisa do momento e na opção ideológica selecionada.

Lógica editorial:
- Se a opção for “esquerda positiva”, escolha um tema atual que permita enfatizar desigualdade global, impactos sociais, imperialismo, exploração econômica, assimetrias de poder, efeitos humanos de guerras, dependência energética, colonialidade, fragilidade social produzida por disputas entre potências ou falhas do capitalismo global.
- Se a opção for “esquerda negativa”, escolha um tema atual que exponha contradições, autoritarismos, fracassos estratégicos, hipocrisias, corrupção moral ou cegueira ideológica presentes em governos, movimentos, regimes ou elites que se apresentam como progressistas, anti-imperialistas ou populares.
- Se a opção for “direita positiva”, escolha um tema atual que permita destacar ordem, estabilidade, soberania, realismo estratégico, segurança energética, força institucional, interesse nacional, contenção militar, pragmatismo diplomático e crítica ao idealismo ingênuo.
- Se a opção for “direita negativa”, escolha um tema atual que permita mostrar oportunismo, militarismo imprudente, nacionalismo destrutivo, cinismo de elites conservadoras, uso político do caos, captura corporativa do Estado ou retórica patriótica como máscara de interesses menos nobres.

Conteúdo esperado:
- Explique o que está acontecendo no cenário geopolítico atual.
- Identifique os principais atores envolvidos.
- Mostre interesses reais por trás dos discursos oficiais.
- Analise riscos, oportunidades, alianças frágeis, disputas regionais e efeitos globais.
- Inclua contexto histórico quando isso ajudar a entender o presente.
- Mostre como economia, energia, tecnologia, rotas comerciais, guerra de informação e política doméstica influenciam o cenário.
- Aponte o que pode acontecer nos próximos meses, mas sem tom de vidente.
- Diferencie claramente fato, interpretação e possibilidade.

Entrada variável:
Opção ideológica: ${ideology.toUpperCase()}

DADOS ATUAIS DE SUPORTE (CONTEXTO):
Use como base estas manchetes do dia:
${contextStr}

E estas informações de pesquisa em tempo real:
${researchStr || 'Nenhuma informação adicional disponível.'}

INSTRUÇÃO FINAL:
Selecione sozinho o tema mais contundente disponível e escreva sobre ele seguindo rigorosamente o estilo e estrutura acima. 
Antes do texto principal, mostre apenas uma linha interna de trabalho no seguinte formato:
Tema escolhido: [tema]
Ângulo editorial: [ângulo]

REGRA DE IMAGEM:
Após o título e subtítulo, insira uma imagem marcante usando o seguinte link de markdown:
![descrição acessível](https://image.pollinations.ai/prompt/type%20a%20vivid%20realistic%20detailed%20english%20prompt%20here%20related%20to%20the%20chosen%20theme)

RETORNE APENAS O MARKDOWN.`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const apiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: aiPrompt }] }],
                generationConfig: { maxOutputTokens: 2048, temperature: 0.8 }
            })
        });
        
        const data = await apiRes.json();
        
        if (!apiRes.ok) {
            throw new Error(data.error?.message || 'Erro na API do Gemini');
        }
        
        const markdown = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!markdown) {
            throw new Error('Retorno vazio do Gemini');
        }

        // --- Option 3: Save to File ---
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `article_${timestamp}.md`;
            const filePath = path.join(__dirname, 'blogs', filename);
            fs.writeFileSync(filePath, markdown, 'utf8');
            console.log(`[Blog] Saved to record: ${filePath}`);
        } catch (fsErr) {
            console.error('[Blog Save Error]', fsErr.message);
        }
        
        res.json({ markdown });
    } catch (error) {
        console.error('[Blog Generation Error]', error.message);
        res.status(500).json({ error: 'Erro ao processar matéria: ' + error.message });
    }
});

app.post('/api/download-pdf', async (req, res) => {
    const { markdown, title } = req.body;

    if (!markdown) return res.status(400).send('Missing content');

    try {
        const doc = new PDFDocument({ 
            margin: 50,
            info: { Title: title || 'Artigo IA', Author: 'World News Aggregator' }
        });

        let filename = (title || 'artigo').substring(0, 50).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.pdf`);

        doc.pipe(res);

        // Header Style
        doc.fillColor('#4a9eff').fontSize(26).font('Helvetica-Bold').text(title || 'Artigo Gerado pela IA', { align: 'center' });
        doc.moveDown(0.5);
        doc.strokeColor('#2d4a7a').lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(1.5);

        // EXTRACTION: Get images and clean text
        const imgRegex = /!\[.*?\]\((https?:\/\/.*?)\)/g;
        let match;
        const imageUrls = [];
        while ((match = imgRegex.exec(markdown)) !== null) {
            imageUrls.push(match[1]);
        }

        // Clean text: removes titles, images, and other markdown symbols
        let cleanText = markdown
            .replace(/^# .*\n?/gm, '') // titles
            .replace(/!\[.*?\]\(.*?\)/g, '') // images
            .replace(/#{1,6}\s?/g, '') // remaining headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // bold
            .replace(/\*(.*?)\*/g, '$1') // italic
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // links
            .replace(/`/g, '') // code
            .replace(/>\s?/g, '') // quotes
            .trim();

        const paragraphs = cleanText.split('\n\n').filter(p => p.trim());

        // Process images first (Hero style)
        if (imageUrls.length > 0) {
            try {
                // Fetch only the first image as a main hero image for now to keep PDF slim
                const imgRes = await axios.get(imageUrls[0], { responseType: 'arraybuffer', timeout: 5000 });
                const imgBuffer = Buffer.from(imgRes.data);
                doc.image(imgBuffer, {
                    fit: [512, 300],
                    align: 'center'
                });
                doc.moveDown(2);
            } catch (imgErr) {
                console.warn('[PDF Image Fetch Error]', imgErr.message);
                doc.fillColor('#7a8199').fontSize(10).font('Helvetica-Oblique').text('(Imagem não disponível no momento)', { align: 'center' });
                doc.moveDown();
            }
        }

        // Body Text
        doc.fillColor('#333333').fontSize(13).font('Helvetica').lineGap(4);
        paragraphs.forEach(p => {
            doc.text(p.trim(), { align: 'justify', indent: 20 });
            doc.moveDown(1.2);
        });

        // Footer
        doc.fontSize(10).fillColor('#999999').text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} por World News AI`, { align: 'center', footer: 10 });

        doc.end();
    } catch (err) {
        console.error('[PDF Error]', err.message);
        res.status(500).send('Error generating PDF: ' + err.message);
    }
});

app.post('/api/analyze', async (req, res) => {
    const { headlineId, prompt } = req.body;

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
    }

    try {
        const h = db.getHeadlineById(headlineId);
        if (!h) return res.status(404).json({ error: 'Headline not found' });

        // 1. Fetch the full article content
        console.log(`[AI] Fetching content for: ${h.url}`);
        const response = await axios.get(h.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 8000
        });

        // 2. Extract text with Cheerio
        const $ = cheerio.load(response.data);
        
        // Remove noise
        $('script, style, nav, footer, header, ads, .ads, #ads').remove();
        
        // Strategy: Get all <p> text or main article content
        let articleText = $('article').text() || $('main').text() || $('body').text();
        
        // Fallback or cleanup
        if (!articleText || articleText.length < 200) {
            articleText = $('p').map((i, el) => $(el).text()).get().join('\n');
        }

        // Limit text length to avoid token limits (taking first 10k chars)
        const cleanText = articleText.replace(/\s+/g, ' ').trim().substring(0, 10000);

        if (!cleanText) {
            return res.status(400).json({ error: 'Could not extract enough content from the article.' });
        }

        // 3. Prompt Gemini
        const aiPrompt = `Article Title: ${h.title}\n\nArticle Content:\n${cleanText}\n\nUser Request: ${prompt}\n\nPlease analyze the article according to the request. Keep it concise but insightful.`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const apiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: aiPrompt }] }]
            })
        });
        
        const data = await apiRes.json();
        
        if (!apiRes.ok) {
            throw new Error(data.error?.message || 'Erro na API do Gemini');
        }
        
        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Não consegui gerar a análise.';

        res.json({ analysis });
    } catch (error) {
        console.error('[AI Error]', error.message);
        res.status(500).json({ error: 'Failed to analyze article. ' + error.message });
    }
});

// Schedule: every 30 minutes
cron.schedule('*/30 * * * *', () => {
    console.log('[CRON] Scheduled fetch triggered');
    fetchAll();
});

// Daily cleanup at 3:00 AM
cron.schedule('0 3 * * *', () => {
    console.log('[CRON] Scheduled cleanup triggered');
    db.cleanupOldHeadlines(30); 
});

app.listen(PORT, async () => {
    console.log(`\n🌍 World News Aggregator running at http://localhost:${PORT}`);
    console.log('📡 Initial fetch starting...\n');
    // Delay 1s to let server fully start
    setTimeout(fetchAll, 1000);
});
