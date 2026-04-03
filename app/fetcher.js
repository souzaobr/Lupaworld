const Parser = require('rss-parser');
const db = require('./database');
const sources = require('./sources');
const axios = require('axios'); // Added to handle GZIP and Better headers

const parser = new Parser({
    timeout: 12000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WorldNewsAggregator/1.0)' },
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
        ],
    },
});

function extractImage(item) {
    if (item.mediaContent && item.mediaContent.$) return item.mediaContent.$.url;
    if (item.mediaThumbnail && item.mediaThumbnail.$) return item.mediaThumbnail.$.url;
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    // Try to extract from description HTML
    if (item.content || item.description) {
        const html = item.content || item.description || '';
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match) return match[1];
    }
    return null;
}

function cleanText(text) {
    if (!text) return null;
    return text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().substring(0, 2000);
}

async function fetchSource(source) {
    try {
        // Use axios to fetch first (it handles gzip better than parser)
        const response = await axios.get(source.rssUrl, {
            timeout: 15000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            },
            responseType: 'text'
        });
        
        const feed = await parser.parseString(response.data);
        let inserted = 0;
        for (const item of feed.items.slice(0, 10)) {
            if (!item.title || !item.link) continue;
            const result = db.insertHeadline({
                source_id: source.id,
                title: cleanText(item.title),
                url: item.link,
                description: cleanText(item.contentSnippet || item.summary || item.description),
                image_url: extractImage(item),
                author: item.creator || item.author || null,
                categories: item.categories ? item.categories.join(', ') : null,
                published_at: item.pubDate || item.isoDate || new Date().toISOString(),
            });
            if (result.changes > 0) inserted++;
        }
        db.logFetch(source.id, 'ok', `${inserted} new`);
        console.log(`[✓] ${source.name}: ${inserted} new headline(s)`);
        return { source: source.id, status: 'ok', inserted };
    } catch (err) {
        db.logFetch(source.id, 'error', err.message);
        console.error(`[✗] ${source.name}: ${err.message}`);
        return { source: source.id, status: 'error', error: err.message };
    }
}

async function fetchAll() {
    console.log(`\n[FETCH] Starting fetch for ${sources.length} sources at ${new Date().toISOString()}`);
    
    const results = [];
    const batchSize = 5; // Fetching 5 at a time to be gentle on the network and servers
    
    for (let i = 0; i < sources.length; i += batchSize) {
        const batch = sources.slice(i, i + batchSize);
        console.log(`[FETCH] Processing batch ${Math.floor(i/batchSize) + 1}...`);
        const batchResults = await Promise.allSettled(batch.map(fetchSource));
        results.push(...batchResults);
    }

    const ok = results.filter(r => r.status === 'fulfilled' && r.value.status === 'ok').length;
    const errors = results.length - ok;
    console.log(`[FETCH] Done: ${ok} ok, ${errors} failed\n`);
    return { ok, errors, total: results.length };
}

module.exports = { fetchAll, fetchSource };
