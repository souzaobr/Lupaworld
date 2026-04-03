const axios = require('axios');
const cheerio = require('cheerio');

async function search(query) {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        const results = [];
        $('.result').slice(0, 3).each((i, el) => {
            const title = $(el).find('.result__title').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            const link = $(el).find('.result__url').text().trim();
            results.push({ title, snippet, link });
        });
        return results;
    } catch (err) {
        console.error('Scrape error:', err.message);
        return [];
    }
}

search('notícias mundo hoje').then(console.log);
