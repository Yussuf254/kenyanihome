const { google } = require('googleapis');
const { SitemapStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const path = require('path');

// ==================== Google Indexing API ====================

let jwtClient = null;

function getJwtClient() {
  if (jwtClient) return jwtClient;

  const keyPath = path.join(__dirname, '..', 'service-account-key.json');
  try {
    const keys = require(keyPath);
    const { JWT } = require('google-auth-library');
    jwtClient = new JWT({
      email: keys.client_email,
      key: keys.private_key,
      scopes: ['https://www.googleapis.com/auth/indexing']
    });
    return jwtClient;
  } catch (e) {
    console.log('[SEO] Google Indexing API key not found - indexing disabled');
    return null;
  }
}

async function notifyGoogle(url) {
  const client = getJwtClient();
  if (!client) return { skipped: true };

  try {
    await client.authorize();
    const indexing = google.indexing({ version: 'v3', auth: client });
    const res = await indexing.urlNotifications.publish({
      requestBody: { url, type: 'URL_UPDATED' }
    });
    console.log('[SEO] Google notified:', url, res.data?.urlNotificationMetadata?.latestUpdate?.url);
    return { success: true, data: res.data };
  } catch (err) {
    console.error('[SEO] Google Indexing error:', err.message || err);
    return { success: false, error: err.message };
  }
}

async function notifyGoogleBatch(urls) {
  const client = getJwtClient();
  if (!client) return { skipped: true, count: 0 };

  let successCount = 0;
  const results = [];

  for (const url of urls) {
    const result = await notifyGoogle(url);
    if (result.success) successCount++;
    results.push({ url, ...result });
    // Rate limit: max 200 requests per day, so space them out
    await new Promise(r => setTimeout(r, 100));
  }

  return { success: true, count: successCount, total: urls.length, results };
}

// ==================== Dynamic Sitemap ====================

async function generateSitemap(db, baseUrl) {
  try {
    const smStream = new SitemapStream({ hostname: baseUrl });
    const pipeline = smStream.pipe(createGzip());

    // Homepage
    smStream.write({ url: '/', changefreq: 'daily', priority: 1.0 });

    // Static pages
    smStream.write({ url: '/about', changefreq: 'monthly', priority: 0.5 });
    smStream.write({ url: '/contact', changefreq: 'monthly', priority: 0.5 });
    smStream.write({ url: '/advertise', changefreq: 'monthly', priority: 0.5 });
    smStream.write({ url: '/advertised-products', changefreq: 'weekly', priority: 0.6 });
    smStream.write({ url: '/search', changefreq: 'weekly', priority: 0.4 });

    // Posts
    const posts = db.get('posts').filter({ status: 'published', deletedAt: null }).value();
    posts.forEach(post => {
      smStream.write({
        url: '/post/' + post.slug,
        changefreq: 'weekly',
        priority: 0.8,
        lastmod: post.updatedAt || post.createdAt
      });
    });

    // Categories
    const categories = db.get('categories').filter({ status: 'published' }).value();
    categories.forEach(cat => {
      smStream.write({
        url: '/category/' + cat.slug,
        changefreq: 'daily',
        priority: 0.7
      });
    });

    smStream.end();
    const sitemap = await streamToPromise(pipeline);
    return sitemap;
  } catch (err) {
    console.error('[SEO] Sitemap generation error:', err);
    throw err;
  }
}

// ==================== Auto-index on post changes ====================

async function autoIndexPost(db, post, baseUrl) {
  const url = baseUrl + '/post/' + post.slug;
  return await notifyGoogle(url);
}

async function autoIndexCategory(db, category, baseUrl) {
  const url = baseUrl + '/category/' + category.slug;
  return await notifyGoogle(url);
}

module.exports = {
  notifyGoogle,
  notifyGoogleBatch,
  generateSitemap,
  autoIndexPost,
  autoIndexCategory
};
