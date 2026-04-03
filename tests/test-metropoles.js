const { fetchSource } = require('./fetcher');
const sources = require('./sources');

const metropoles = sources.find(s => s.id === 'metr-poles');
if (metropoles) {
    fetchSource(metropoles).then(res => {
        console.log('Result:', res);
        process.exit(0);
    }).catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
} else {
    console.error('Source not found');
    process.exit(1);
}
