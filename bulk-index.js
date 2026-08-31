const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const KEY_FILE_PATH = path.join(__dirname, 'service-account-key.json');
const DOMAIN = 'https://kenyanihome.com';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function runBulkIndexing() {
  try {
    console.log('========================================');
    console.log('  GOOGLE BULK INDEXING SCRIPT');
    console.log('========================================\n');

    if (!fs.existsSync(KEY_FILE_PATH)) {
      console.error('ERROR: Service account key not found at:', KEY_FILE_PATH);
      process.exit(1);
    }

    console.log('Initializing Google Indexing API...');
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE_PATH,
      scopes: ['https://www.googleapis.com/auth/indexing']
    });

    const authClient = await auth.getClient();
    const indexing = google.indexing({ version: 'v3', auth: authClient });
    console.log('Authenticated successfully.\n');

    // Load database
    const dbPath = path.join(__dirname, 'data', 'db.json');
    if (!fs.existsSync(dbPath)) {
      console.error('ERROR: Database not found at:', dbPath);
      process.exit(1);
    }

    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    // Build list of all URLs to index
    const urls = [];

    // Homepage
    urls.push({ url: '/', label: 'Homepage' });

    // Static pages
    urls.push({ url: '/about', label: 'About' });
    urls.push({ url: '/contact', label: 'Contact' });
    urls.push({ url: '/privacy', label: 'Privacy Policy' });
    urls.push({ url: '/terms', label: 'Terms' });
    urls.push({ url: '/advertise', label: 'Advertise' });
    urls.push({ url: '/advertised-products', label: 'Marketplace' });
    urls.push({ url: '/search', label: 'Search' });
    urls.push({ url: '/all-stories', label: 'All Stories' });
    urls.push({ url: '/rss.xml', label: 'RSS Feed' });
    urls.push({ url: '/sitemap.xml', label: 'Sitemap' });

    // Categories
    const categories = db.categories || [];
    categories.forEach(cat => {
      urls.push({ url: '/category/' + cat.slug, label: 'Category: ' + cat.name });
    });

    // Published posts
    const posts = (db.posts || []).filter(p => p.status === 'published' && !p.deletedAt);
    posts.forEach(post => {
      urls.push({ url: '/post/' + post.slug, label: 'Post: ' + post.title });
    });

    console.log(`Found ${urls.length} URLs to submit to Google.\n`);
    console.log('----------------------------------------\n');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < urls.length; i++) {
      const item = urls[i];
      const fullUrl = DOMAIN + item.url;
      const progress = `[${i + 1}/${urls.length}]`;

      try {
        const response = await indexing.urlNotifications.publish({
          requestBody: {
            url: fullUrl,
            type: 'URL_UPDATED'
          }
        });

        const notifyTime = response.data?.urlNotificationMetadata?.latestUpdate?.notifyTime;
        console.log(`${progress} ${item.label}`);
        console.log(`         URL: ${fullUrl}`);
        console.log(`         Status: SUCCESS ${notifyTime ? '(' + notifyTime + ')' : ''}`);
        successCount++;
      } catch (apiError) {
        console.error(`${progress} ${item.label}`);
        console.error(`         URL: ${fullUrl}`);
        console.error(`         Status: FAILED - ${apiError.message}`);
        failCount++;
      }

      // Pause between requests to respect rate limits
      if (i < urls.length - 1) {
        await delay(1500);
      }
    }

    console.log('\n----------------------------------------');
    console.log('\n========================================');
    console.log('  BULK INDEXING COMPLETE');
    console.log('========================================');
    console.log(`  Total URLs: ${urls.length}`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed: ${failCount}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('\nFatal Script Error:', error.message);
    process.exit(1);
  }
}

runBulkIndexing();
