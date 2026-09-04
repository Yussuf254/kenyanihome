require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const multer = require('multer');
const slugify = require('slugify');
const bcrypt = require('bcryptjs');
let sharp;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

const db = require('./db');
const { sendEmail, sendSms, getMpesaAccessToken, initiateMpesaStkPush, queryMpesaTransaction } = require('./services/integrations');
const seo = require('./services/seo');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// ---------- View engine ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Middleware ----------
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(methodOverride('_method'));
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d', immutable: false }));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: '7d', immutable: true }));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), { maxAge: '30d', immutable: true }));

// Serve robots.txt and sitemap at root
app.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});
app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'public-lens-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: { 
      maxAge: 1000 * 60 * 60 * 8,
      secure: false,
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);
app.use(flash());

// Jobs Portal Routes
const jobsRoutes = require("./routes/jobsPortal");
const employerRoutes = require("./routes/employerPortal");
const adminJobsRoutes = require("./routes/adminJobs");

// Cache control - no cache for HTML pages
app.use((req, res, next) => {
  if (req.path.endsWith('.css') || req.path.endsWith('.js') || req.path.endsWith('.png') || req.path.endsWith('.jpg') || req.path.endsWith('.webp') || req.path.endsWith('.svg') || req.path.endsWith('.ico')) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use((req, res, next) => {
  res.locals.settings = db.get('settings').value();
  res.locals.categories = db.get('categories').value();
  res.locals.headerItems = db.get('headerItems').value();
  res.locals.adCategories = db.get('adCategories').filter({ active: true }).sortBy('order').value();
  res.locals.adSubcategories = db.get('adSubcategories').value();
  res.locals.advertising = db.get('settings.advertising').value() || {};
  res.locals.navigation = buildNav();
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.currentPath = req.path;
  res.locals.currentCategory = null;
  res.locals.meta = null;
  res.locals.unreadNotifications = req.session.user ? unreadNotificationCount(req.session.user.id) : 0;
  res.locals.pendingUserCount = db.get('users').filter({ status: 'pending' }).size().value();
  next();
});

// ---------- Helpers ----------
function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const days = Math.floor(diffMs / 86400000);
  if (days < 0) {
    const hrs = Math.floor(diffMs / 3600000);
    if (Math.abs(hrs) < 1) return 'Just now';
    return `${Math.abs(hrs)}h ago`;
  }
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function readingTime(html = '') {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function wordCount(html = '') {
  return stripHtml(html).split(/\s+/).filter(Boolean).length;
}
function daysAgo(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
function formatLogTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${label}, ${h}:${minutes} ${ampm}`;
}
function injectReadAlso(content, relatedPosts, baseUrl) {
  if (!content || !relatedPosts || !relatedPosts.length) return content;
  var seen = new Set();
  var links = [];
  relatedPosts.forEach(function(p) {
    if (p.id && seen.has(p.id)) return;
    if (p.slug === (content.match(/\/post\/([^"'>\s]+)/g) || []).map(function(u){ return u.split('/').pop(); }).find(function(s){ return true; })) return;
    seen.add(p.id);
    links.push(`<p class="read-also"><span class="read-also-label">Read Also:</span> <a href="/post/${p.slug}">${p.title}</a></p>`);
  });
  if (links.length === 0) return content;
  var sections = content.split('<p');
  if (sections.length <= 2) return content;
  var pCount = sections.length - 1;
  var firstPos = Math.max(1, Math.floor(pCount * 0.25));
  var secondPos = Math.max(firstPos + 1, Math.floor(pCount * 0.6));
  var result = content;
  var offset = 0;
  function insertAfterNthP(n) {
    var pos = 0;
    var found = 0;
    while (found < n && pos < result.length) {
      var idx = result.indexOf('<p', pos);
      if (idx === -1) break;
      var end = result.indexOf('>', idx);
      if (end === -1) break;
      pos = end + 1;
      found++;
    }
    if (found >= n) {
      result = result.substring(0, pos) + links[offset] + result.substring(pos);
      offset++;
    }
  }
  insertAfterNthP(firstPos);
  insertAfterNthP(secondPos);
  return result;
}
function now_() {
  return new Date().toISOString();
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };
  const lower = ua.toLowerCase();
  let browser = 'Unknown';
  let version = '';
  if (lower.includes('edg/')) {
    browser = 'Edge';
    const m = ua.match(/Edg\/([\d.]+)/);
    if (m) version = m[1];
  } else if (lower.includes('chrome/') && !lower.includes('chromium')) {
    browser = 'Chrome';
    const m = ua.match(/Chrome\/([\d.]+)/);
    if (m) version = m[1];
  } else if (lower.includes('chromium/')) {
    browser = 'Chromium';
    const m = ua.match(/Chromium\/([\d.]+)/);
    if (m) version = m[1];
  } else if (lower.includes('safari/') && !lower.includes('chrome')) {
    browser = 'Safari';
    const m = ua.match(/Version\/([\d.]+)/);
    if (m) version = m[1];
  } else if (lower.includes('firefox/')) {
    browser = 'Firefox';
    const m = ua.match(/Firefox\/([\d.]+)/);
    if (m) version = m[1];
  } else if (lower.includes('opera/') || lower.includes('opr/')) {
    browser = 'Opera';
    const m = ua.match(/(?:Opera|OPR)\/([\d.]+)/);
    if (m) version = m[1];
  }
  if (version) browser = `${browser} ${version}`;

  let os = 'Unknown';
  if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('mac os x')) os = 'macOS';
  else if (lower.includes('linux') && !lower.includes('android')) os = 'Linux';
  else if (lower.includes('android')) os = 'Android';
  else if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ipod')) os = 'iOS';
  else if (lower.includes('x11') || lower.includes('bsd')) os = 'Unix-like';

  return { browser, os };
}

function createNotification(userId, type, message, link) {
  const id = db.get('meta.nextNotificationId').value();
  db.get('notifications').push({
    id,
    userId: userId || null,
    type,
    message,
    link: link || '/admin',
    read: false,
    createdAt: now_()
  }).write();
  db.set('meta.nextNotificationId', id + 1).write();
}

function logActivity(userId, action, details, ip) {
  const id = db.get('meta.nextActivityId').value();
  db.get('activityLogs').push({
    id,
    userId: userId || null,
    action,
    details: details || '',
    ip: ip || null,
    createdAt: now_()
  }).write();
  db.set('meta.nextActivityId', id + 1).write();
}

function unreadNotificationCount(userId) {
  return db.get('notifications').filter((n) => !n.read && (n.userId === null || n.userId === userId)).size().value();
}

function getUserPermissions(user) {
  if (!user) return [];
  if (user.role === 'admin') return ['*'];
  const rolePerms = {
    editor: ['posts:read', 'posts:write', 'posts:edit', 'media:read', 'media:write', 'categories:read', 'categories:write', 'comments:approve', 'messages:read', 'messages:write', 'subscribers:read'],
    author: ['posts:read', 'posts:write', 'posts:edit', 'media:read', 'media:write'],
    viewer: ['posts:read', 'media:read']
  };
  return rolePerms[user.role] || [];
}

function hasPermission(user, perm) {
  if (!user) return false;
  const perms = getUserPermissions(user);
  if (perms.includes('*')) return true;
  return perms.includes(perm);
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/admin/login');
    if (hasPermission(req.session.user, perm)) return next();
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    req.flash('error', 'You do not have permission to do that.');
    res.redirect('/admin');
  };
}

app.locals.formatDate = formatDate;
app.locals.readingTime = readingTime;
app.locals.daysAgo = daysAgo;
app.locals.timeAgo = timeAgo;
app.locals.formatLogTime = formatLogTime;
app.locals.hasPermission = hasPermission;
app.locals.isNavActive = function(hi, currentPath, currentCategory) {
  if (hi.type === 'home') return currentPath === '/';
  if (hi.type === 'about') return currentPath === '/about';
  if (hi.type === 'contact') return currentPath === '/contact';
  if (hi.type === 'category') {
    if (currentPath === hi.url) return true;
    if (currentCategory && currentCategory.headerItemId === hi.id) return true;
    return false;
  }
  return currentPath === hi.url;
};
app.locals.isChildActive = function(child, currentCategory) {
  return currentCategory && currentCategory.id === child.id;
};

// Flips any post whose scheduled publishAt has arrived over to "published".
// Called cheaply on relevant routes, plus a 60s background sweep so it
// fires even with zero traffic.
function autoPublishDue() {
  const due = db
    .get('posts')
    .filter((p) => p.status === 'scheduled' && p.publishAt && new Date(p.publishAt) <= new Date())
    .value();
  if (due.length) {
    due.forEach((p) => {
      p.status = 'published';
      p.updatedAt = now_();
    });
    db.write();
  }
}
setInterval(autoPublishDue, 60 * 1000);
setInterval(autoExpireCampaigns, 60 * 1000);

function missingFields(post) {
  const missing = [];
  if (!post.coverImage) missing.push('cover image');
  if (!post.excerpt || !post.excerpt.trim()) missing.push('excerpt');
  if (!post.tags || !post.tags.length) missing.push('tags');
  return missing;
}

function uniqueSlug(base, excludeId) {
  let slug = slugify(base, { lower: true, strict: true }) || 'post';
  let candidate = slug;
  let i = 2;
  const exists = (s) =>
    db
      .get('posts')
      .find((p) => p.slug === s && p.id !== excludeId)
      .value();
  while (exists(candidate)) {
    candidate = `${slug}-${i}`;
    i++;
  }
  return candidate;
}

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  req.flash('error', 'Please sign in to continue.');
  res.redirect('/admin/login');
}

function logError(err, req) {
  try {
    const errors = db.get('errors').value();
    errors.push({
      id: Date.now(),
      message: err.message,
      stack: (err.stack || '').split('\n').slice(0, 6).join('\n'),
      path: req ? req.originalUrl : null,
      method: req ? req.method : null,
      createdAt: now_()
    });
    while (errors.length > 100) errors.shift();
    db.write();
  } catch (e) {
    // if logging itself fails, don't crash the process over it
    console.error('Failed to log error:', e.message);
  }
}
process.on('unhandledRejection', (err) => logError(err instanceof Error ? err : new Error(String(err)), null));
process.on('uncaughtException', (err) => logError(err, null));

// wraps an async route handler so rejected promises reach Express's error
// handling instead of crashing the process
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ---------- Very small response cache for expensive public pages ----------
// Not a real CDN/edge cache — just enough to avoid rebuilding the same
// HTML on every request when traffic is bursty. TTL is short so new posts,
// comments, and edits show up quickly.
const pageCache = new Map();
function cache(ttlMs) {
  return (req, res, next) => {
    const key = req.originalUrl;
    const hit = pageCache.get(key);
    if (hit && hit.expires > Date.now()) {
      res.set('X-Cache', 'HIT');
      return res.send(hit.body);
    }
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (res.statusCode === 200) pageCache.set(key, { body, expires: Date.now() + ttlMs });
      res.set('X-Cache', 'MISS');
      return originalSend(body);
    };
    next();
  };
}
function clearCache() {
  pageCache.clear();
}

// ---------- Uploads (Media Library, cover images, audio) ----------
const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const IMAGE_EXT = ['.jpg', '.jpeg', '.jfif', '.png', '.gif', '.webp', '.svg'];
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.ogg'];
const DOC_EXT = ['.pdf', '.doc', '.docx'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    const base = slugify(path.basename(file.originalname, ext), { lower: true, strict: true }) || 'file';
    if (ext === '.jfif') ext = '.jpg';
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'audioFile') {
      return cb(AUDIO_EXT.includes(ext) ? null : new Error('Unsupported audio type.'), AUDIO_EXT.includes(ext));
    }
    if (file.fieldname === 'documentFile') {
      return cb(DOC_EXT.includes(ext) ? null : new Error('Only PDF and Word documents are allowed.'), DOC_EXT.includes(ext));
    }
    return cb(IMAGE_EXT.includes(ext) ? null : new Error('Unsupported image type.'), IMAGE_EXT.includes(ext));
  }
});

// Downscales large raster images in place so the media library doesn't
// fill up with multi-megabyte originals straight off a phone camera.
// Skips SVGs (vector, nothing to resize) and silently no-ops if sharp
// isn't available in this environment.
async function optimizeImage(filePath) {
  if (!sharp) return;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.svg') return;
  try {
    const buffer = fs.readFileSync(filePath);
    const image = sharp(buffer, { animated: ext === '.gif' });
    const metadata = await image.metadata();
    if (!metadata.width || metadata.width <= 1600) return; // already small enough
    const resized = image.resize({ width: 1600, withoutEnlargement: true });
    const out = ext === '.png' ? resized.png({ quality: 82 }) : ext === '.gif' ? resized.gif() : resized.jpeg({ quality: 82 });
    const outBuffer = await out.toBuffer();
    fs.writeFileSync(filePath, outBuffer);
  } catch (e) {
    logError(e, null);
  }
}

function listMedia() {
  return fs
    .readdirSync(uploadsDir)
    .filter((f) => IMAGE_EXT.includes(path.extname(f).toLowerCase()))
    .map((f) => ({ name: f, url: `/public/uploads/${f}`, mtime: fs.statSync(path.join(uploadsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

function activeAds(placement) {
  return db
    .get('ads')
    .filter((a) => a.active && (a.placement === placement || a.placement === 'both'))
    .value();
}

function pickAd(placement) {
  const ads = activeAds(placement);
  if (!ads.length) return null;
  return ads[Math.floor(Math.random() * ads.length)];
}

function approvedComments(postId) {
  return db
    .get('comments')
    .filter({ postId, approved: true })
    .sortBy('createdAt')
    .value()
    .reverse();
}

function siteUrl(req) {
  const configured = (db.get('settings.siteUrl').value() || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function isExpired(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

function headerItemUrl(hi) {
  if (hi.type === 'home') return '/';
  if (hi.type === 'about') return '/about';
  if (hi.type === 'contact') return '/contact';
  if (hi.type === 'category') return `/category/${hi.slug}`;
  return hi.url || `/${hi.slug}`;
}

function buildNav() {
  const headerItems = db.get('headerItems').filter({ active: true }).sortBy('order').value();
  const allCategories = db.get('categories').value();
  return headerItems.map((hi) => {
    // Jobs has no dropdown - links directly to /jobs
    const children = hi.slug === 'jobs' ? [] : allCategories
      .filter((c) => c.headerItemId === hi.id && c.showInNavigation && c.status === 'published')
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const url = hi.slug === 'jobs' ? '/jobs' : headerItemUrl(hi);
    return {
      ...hi,
      url,
      children,
      hasChildren: children.length > 0
    };
  });
}

function currentCategoryId(slug) {
  const cat = db.get('categories').find({ slug }).value();
  return cat ? cat.id : null;
}

// =====================================================================
// PUBLIC SITE
// =====================================================================

app.get('/', cache(15000), (req, res) => {
  autoPublishDue();
   const allPosts = db.get('posts').filter({ status: 'published', deletedAt: null }).sortBy('createdAt').value().reverse();
   const featured = allPosts.find((p) => p.featured) || allPosts[0];
   const rest = allPosts.filter((p) => p.id !== (featured && featured.id));
   const trendingMax = 5;
   const recentCutoff = new Date(Date.now() - 30 * 86400000).getTime();
   const trendingRecent = rest.filter((p) => new Date(p.createdAt).getTime() >= recentCutoff);
   const trendingByViews = trendingRecent.sort((a, b) => (b.views || 0) - (a.views || 0));
   const minViewsThreshold = 10;
   let trending = trendingByViews.filter((p) => (p.views || 0) >= minViewsThreshold);
   if (trending.length < trendingMax) {
     trending = trendingByViews.slice(0, trendingMax);
   } else {
     trending = trending.slice(0, trendingMax);
   }
   const mostRead = rest.filter((p) => !trending.find((t) => t.id === p.id)).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 4);
  const breakingMax = (res.locals.settings.breakingMaxItems) || 5;
  const breaking = allPosts.filter((p) => p.breaking && (!p.breakingExpiry || new Date(p.breakingExpiry) > new Date())).sort((a, b) => (a.breakingOrder || 0) - (b.breakingOrder || 0) || new Date(b.createdAt) - new Date(a.createdAt)).slice(0, breakingMax);
   const featuredStories = allPosts.filter((p) => p.featured && p.id !== (featured && featured.id)).slice(0, 4);
   if (!featuredStories.length) featuredStories.push(...trending.slice(0, 4));
   const editorsPick = allPosts.find((p) => p.editorsPick && (!featured || p.id !== featured.id)) || null;
  const postsByCategory = {};
  rest.forEach((p) => {
    const cat = p.category || 'General';
    if (!postsByCategory[cat]) postsByCategory[cat] = [];
    postsByCategory[cat].push(p);
  });
  console.log('[HOME] breaking:', breaking.map(p => p.id + ':' + p.title));
  console.log('[HOME] postsByCategory.technology:', (postsByCategory['technology'] || []).map(p => p.id + ':' + p.title));
  res.render('index', {
    title: res.locals.settings.siteName,
    meta: {
      title: `${res.locals.settings.siteName} — ${res.locals.settings.tagline}`,
      description: res.locals.settings.tagline,
      image: (featured && featured.coverImage) ? (featured.coverImage.startsWith('http') ? featured.coverImage : siteUrl(req) + featured.coverImage) : '',
      url: siteUrl(req) + '/',
      type: 'website'
    },
    featured,
    editorsPick,
    posts: rest.slice(0, 9),
    trending,
    mostRead,
    breaking,
    breakingEnabled: res.locals.settings.breakingEnabled !== false,
    breakingScrollDuration: res.locals.settings.breakingScrollDuration || 25,
    featuredStories,
    postsByCategory,
    categories: res.locals.categories,
    sidebarAd: pickAd('sidebar'),
    inlineAd: pickAd('inline'),
    jobs: db.get('jobs').filter({ status: 'published' }).sortBy('createdAt').value().reverse().filter(j => !isExpired(j.deadline)).slice(0, 5)
  });
});

app.get('/all-stories', (req, res) => {
  autoPublishDue();
  const section = (req.query.section || '').toLowerCase().trim();
  let posts = db.get('posts').filter({ status: 'published', deletedAt: null }).sortBy('createdAt').value().reverse();
  const categories = res.locals.categories;
  const postsByCategory = {};
  posts.forEach((p) => {
    const cat = p.category || 'General';
    if (!postsByCategory[cat]) postsByCategory[cat] = [];
    postsByCategory[cat].push(p);
  });
  const trending = db.get('posts').filter({ status: 'published', deletedAt: null }).orderBy(['views', 'createdAt'], ['desc', 'desc']).value().slice(0, 20);
  const breaking = posts.filter((p) => p.breaking && (!p.breakingExpiry || new Date(p.breakingExpiry) > new Date()));
  
  let prioritizedPosts = posts;
  let featuredSection = null;
  if (section) {
    const sectionPosts = postsByCategory[section] || [];
    if (sectionPosts.length) {
      const sectionIds = new Set(sectionPosts.map(p => p.id));
      const rest = posts.filter(p => !sectionIds.has(p.id));
      prioritizedPosts = [...sectionPosts, ...rest];
      featuredSection = section;
    }
  }
  
  res.render('all-stories', {
    title: featuredSection ? `${featuredSection.charAt(0).toUpperCase() + featuredSection.slice(1)} Stories — ${res.locals.settings.siteName}` : `All Stories — ${res.locals.settings.siteName}`,
    meta: { title: featuredSection ? `${featuredSection.charAt(0).toUpperCase() + featuredSection.slice(1)} Stories — ${res.locals.settings.siteName}` : `All Stories — ${res.locals.settings.siteName}`, description: res.locals.settings.tagline, image: '', url: siteUrl(req) + '/all-stories' + (section ? '?section=' + section : ''), type: 'website' },
    posts: prioritizedPosts,
    categories,
    postsByCategory,
    trending,
    breaking,
    featuredSection,
    sidebarAd: pickAd('sidebar'),
    inlineAd: pickAd('inline')
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    title: `About — ${res.locals.settings.siteName}`,
    meta: { title: `About — ${res.locals.settings.siteName}`, description: res.locals.settings.aboutTitle, image: '', url: siteUrl(req) + '/about', type: 'website' }
  });
});

app.get('/contact', (req, res) => {
  res.render('contact', { title: `Contact — ${res.locals.settings.siteName}` });
});

app.post('/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    req.flash('error', 'Please fill in your name, email and message.');
    return res.redirect('/contact');
  }
  db.get('messages').push({ id: Date.now(), name, email, subject, message, createdAt: now_(), read: false }).write();
  req.flash('success', 'Your message has been sent. Thank you!');
  res.redirect('/contact');
});

// ---- Advertising Submissions (public) ----
const adSubmissionUpload = upload.any();

app.get('/advertise', (req, res) => {
  const adId = req.query.adId ? Number(req.query.adId) : null;
  const ad = adId ? db.get('ads').find({ id: adId }).value() : null;
  const adCategories = db.get('adCategories').filter({ active: true }).sortBy('order').value();
  const advertising = db.get('settings.advertising').value() || {};
  const packages = Array.isArray(advertising.packages) ? advertising.packages : [];
  res.render('advertise', {
    title: 'Advertise With Us — Kenya ni Home',
    meta: {
      title: 'Advertise With Us — Kenya ni Home',
      description: 'Promote your products or services to thousands of engaged Kenyans.',
      image: '',
      url: siteUrl(req) + '/advertise',
      type: 'website'
    },
    prefilledAd: ad || null,
    adCategories,
    advertising,
    packages
  });
});

app.post('/advertise', adSubmissionUpload, asyncHandler(async (req, res) => {
  const {
    businessName, contactPerson, phone, whatsapp, email, location, website,
    promotionType, productName, category, subcategory, shortDescription, fullDescription,
    price, originalPrice, discount, currency,
    productLink, whatsappLink, phoneLink,
    adPackage, startDate, endDate
  } = req.body;

  if (!businessName || !contactPerson || !phone || !email || !productName || !category || !fullDescription || !price || !startDate || !endDate) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/advertise');
  }

  const logoFile = req.files && req.files.find(f => f.fieldname === 'logoFile');
  const imageFiles = req.files ? req.files.filter(f => f.fieldname === 'imageFiles') : [];
  for (const f of [...(logoFile ? [logoFile] : []), ...imageFiles]) {
    await optimizeImage(f.path);
  }

  const id = db.get('meta.nextAdSubmissionId').value();
  const submission = {
    id,
    businessName: businessName.trim(),
    contactPerson: contactPerson.trim(),
    phone: phone.trim(),
    whatsapp: (whatsapp || '').trim(),
    email: email.trim().toLowerCase(),
    location: location || '',
    website: (website || '').trim(),
    logo: logoFile ? `/public/uploads/${logoFile.filename}` : '',
    promotionType: promotionType || 'Product',
    productName: productName.trim(),
    category: category ? (db.get('adCategories').find({ id: Number(category) }).value() || {}).name || '' : '',
    subcategory: (subcategory || '').trim(),
    shortDescription: (shortDescription || '').trim(),
    fullDescription: fullDescription.trim(),
    price: Number(price) || 0,
    originalPrice: Number(originalPrice) || 0,
    discount: (discount || '').trim(),
    currency: currency || 'KSh',
    images: imageFiles.map(f => `/public/uploads/${f.filename}`),
    productLink: (productLink || '').trim(),
    whatsappLink: (whatsappLink || '').trim(),
    phoneLink: (phoneLink || '').trim(),
    package: adPackage || 'Basic Listing',
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
    status: 'pending',
    paymentStatus: 'unpaid',
    featured: adPackage === 'Featured Listing' || adPackage === 'Premium Listing',
    views: 0,
    clicks: 0,
    createdAt: now_(),
    updatedAt: now_()
  };

  db.get('adSubmissions').push(submission).write();
  db.set('meta.nextAdSubmissionId', id + 1).write();

  const adminUsers = db.get('users').filter({ role: 'admin' }).value();
  adminUsers.forEach(u => {
    createNotification(u.id, 'ad.submitted', `New ad submission from <b>${submission.businessName}</b>.`, '/admin/ad-submissions');
  });
  logActivity(null, 'ad.submit', `Ad submitted by ${submission.businessName}`, req.ip);

  req.flash('success', 'Your advertisement has been submitted for review. We will get back to you soon.');
  res.redirect('/advertise');
}));

app.get('/advertised-products', (req, res) => {
  const now = new Date();
  const submissions = db.get('adSubmissions').filter({
    status: 'active',
    paymentStatus: 'paid'
  }).filter(s => !s.endDate || new Date(s.endDate) > now).value();

  const featured = submissions.filter(s => s.featured);
  const byCategory = {};
  submissions.forEach(s => {
    const cat = s.category || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(s);
  });

  const categories = db.get('categories').value();
  const adCategories = db.get('adCategories').filter({ active: true }).value();
  const advertising = db.get('settings.advertising').value() || {};
  console.log('ADVERTISING whyAdvertise:', JSON.stringify(advertising.whyAdvertise));

  res.render('advertised-products', {
    title: 'Advertised Products — Kenya ni Home',
    meta: {
      title: 'Advertised Products — Kenya ni Home',
      description: 'Browse products and services from businesses advertising on Kenya ni Home.',
      image: '',
      url: siteUrl(req) + '/advertised-products',
      type: 'website'
    },
    featured,
    byCategory,
    categories,
    adCategories,
    advertising
  });
});

app.get('/advertised-products/:id/receipt', (req, res) => {
  const submission = db.get('adSubmissions').find({ id: Number(req.params.id) }).value();
  if (!submission || submission.status !== 'active' || submission.paymentStatus !== 'paid') {
    return res.redirect('/advertised-products');
  }
  const categories = db.get('categories').value();
  const adCategories = db.get('adCategories').filter({ active: true }).value();
  const advertising = db.get('settings.advertising').value() || {};
  res.render('advertised-receipt', {
    title: 'Receipt — ' + submission.productName,
    product: submission,
    categories,
    adCategories,
    advertising
  });
});

app.get('/advertised-products/:id', (req, res) => {
  const submission = db.get('adSubmissions').find({ id: Number(req.params.id) }).value();
  if (!submission || submission.status !== 'active' || submission.paymentStatus !== 'paid') {
    return res.redirect('/advertised-products');
  }
  db.get('adSubmissions').find({ id: submission.id }).assign({ views: (submission.views || 0) + 1 }).write();
  const categories = db.get('categories').value();
  const adCategories = db.get('adCategories').filter({ active: true }).value();
  const advertising = db.get('settings.advertising').value() || {};
  res.render('advertised-product-detail', {
    title: submission.productName + ' — Advertised Products',
    product: submission,
    categories,
    adCategories,
    advertising
  });
});

app.get('/privacy', (req, res) => {
  res.render('legal', { title: `Privacy Policy — ${res.locals.settings.siteName}`, heading: 'Privacy Policy', body: res.locals.settings.privacyPolicy });
});
app.get('/terms', (req, res) => {
  res.render('legal', { title: `Terms of Service — ${res.locals.settings.siteName}`, heading: 'Terms of Service', body: res.locals.settings.termsOfService });
});
function formatPolicyBody(text) {
  if (!text) return '';
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.*?)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^- (.*?)$/gm, '<li>$1</li>');
}

app.get('/cookies', (req, res) => {
  res.render('legal', { title: `Cookie Policy — ${res.locals.settings.siteName}`, heading: 'Cookie Policy', body: formatPolicyBody(res.locals.settings.cookiePolicy) });
});
app.get('/disclaimer', (req, res) => {
  res.render('legal', { title: `Disclaimer — ${res.locals.settings.siteName}`, heading: 'Disclaimer', body: formatPolicyBody(res.locals.settings.disclaimer) });
});
app.get('/editorial', (req, res) => {
  res.render('legal', { title: `Editorial Policy — ${res.locals.settings.siteName}`, heading: 'Editorial Policy & Standards', body: formatPolicyBody(res.locals.settings.editorialPolicy) });
});
app.get('/corrections', (req, res) => {
  res.render('legal', { title: `Corrections Policy — ${res.locals.settings.siteName}`, heading: 'Corrections Policy', body: formatPolicyBody(res.locals.settings.correctionsPolicy) });
});
app.get('/ownership', (req, res) => {
  res.render('legal', { title: `Ownership & Funding — ${res.locals.settings.siteName}`, heading: 'Ownership & Funding Disclosure', body: formatPolicyBody(res.locals.settings.ownershipDisclosure) });
});

app.get('/category/:slug', (req, res) => {
  const category = db.get('categories').find({ slug: req.params.slug, status: 'published' }).value();
  if (!category) return res.status(404).render('404', { title: 'Not found' });
  res.locals.currentCategory = category;
  const posts = db
    .get('posts')
    .filter({ status: 'published', category: category.slug, deletedAt: null })
    .sortBy('createdAt')
    .value()
    .reverse();
  const trending = db.get('posts').filter({ status: 'published', deletedAt: null }).orderBy(['views', 'createdAt'], ['desc', 'desc']).value().slice(0, 20);
  const sidebarAd = pickAd('sidebar');
  res.render('category', {
    title: `${category.name} — ${res.locals.settings.siteName}`,
    meta: { title: `${category.name} — ${res.locals.settings.siteName}`, description: `The latest ${category.name} stories.`, image: '', url: siteUrl(req) + '/category/' + category.slug, type: 'website' },
    category,
    posts,
    trending,
    sidebarAd,
    inlineAd: pickAd('inline')
  });
});

app.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const catFilter = req.query.category || '';
  const sort = req.query.sort || 'newest';
  let posts = db
    .get('posts')
    .filter({ status: 'published', deletedAt: null })
    .value()
    .filter((p) => !q || p.title.toLowerCase().includes(q) || stripHtml(p.content).toLowerCase().includes(q))
    .filter((p) => !catFilter || p.category === catFilter);
  posts = posts.sort((a, b) => (sort === 'oldest' ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt)));
  res.render('search', { title: `Search — ${res.locals.settings.siteName}`, q, catFilter, sort, posts });
});

app.get('/post/:slug', (req, res) => {
  autoPublishDue();
  const post = db.get('posts').find({ slug: req.params.slug, status: 'published', deletedAt: null }).value();
  if (!post) return res.status(404).render('404', { title: 'Not found' });
  res.locals.currentCategory = db.get('categories').find({ slug: post.category, status: 'published' }).value() || null;

  db.get('posts').find({ id: post.id }).assign({ views: (post.views || 0) + 1 }).write();
  const key = todayKey();
  const current = db.get(`dailyViews.${key}`).value() || 0;
  db.set(`dailyViews.${key}`, current + 1).write();

  const related = db
    .get('posts')
    .filter((p) => p.status === 'published' && p.deletedAt === null && p.category === post.category && p.id !== post.id)
    .value()
    .slice(0, 3);

  const relatedStories = db
    .get('posts')
    .filter((p) => p.status === 'published' && p.deletedAt === null && p.id !== post.id)
    .value()
    .filter((p) => {
      if (p.category === post.category) return true;
      if (post.tags && p.tags) {
        const shared = post.tags.filter((t) => p.tags.includes(t));
        return shared.length > 0;
      }
      return false;
    })
    .slice(0, 6);

  const featuredStories = db
    .get('posts')
    .filter((p) => p.status === 'published' && p.deletedAt === null && p.id !== post.id)
    .sortBy('createdAt')
    .reverse()
    .value()
    .slice(0, 4);

  const trending = db
    .get('posts')
    .filter({ status: 'published', deletedAt: null })
    .sortBy('views')
    .reverse()
    .value()
    .slice(0, 5);

  const categories = db.get('categories').filter({ status: 'published' }).value();
  const worldCat = categories.find((c) => c.slug === 'world');
  const worldStories = worldCat
    ? db.get('posts').filter({ status: 'published', deletedAt: null, category_id: worldCat.id }).value().filter((p) => p.id !== post.id).slice(0, 3)
    : [];

  const editorsPick = db.get('posts').find({ status: 'published', deletedAt: null, editorsPick: true }).value() || null;

  const authorName = (post.author || '').trim();
  const authorProfile = authorName
    ? {
        name: authorName,
        slug: authorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        avatar: '',
        bio: ''
      }
    : null;

  const settings = res.locals.settings;
  const paywallActive = !!settings.paywallEnabled;
  const baseUrl = siteUrl(req);
  const seoSchema = buildArticleSchema(post, settings, baseUrl);
  const contentWithReadAlso = injectReadAlso(post.content, relatedStories, baseUrl);

  res.render('single-post', {
    title: `${post.title} — ${settings.siteName}`,
    meta: {
      title: post.title,
      description: post.excerpt,
      image: post.coverImage ? (post.coverImage.startsWith('http') ? post.coverImage : baseUrl + post.coverImage) : '',
      url: baseUrl + '/post/' + post.slug,
      type: 'article',
      imageWidth: '1200',
      imageHeight: '630',
      imageAlt: post.title,
      publishedTime: post.createdAt,
      modifiedTime: post.updatedAt || post.createdAt,
      author: post.author,
      section: post.category,
      tags: post.tags || []
    },
    post: { ...post, content: contentWithReadAlso || post.content },
    related,
    relatedStories,
    featuredStories,
    trending,
    categories,
    worldStories,
    editorsPick,
    authorProfile,
    comments: approvedComments(post.id),
    inlineAd: pickAd('inline'),
    sidebarAd: pickAd('sidebar'),
    paywallActive,
    freeArticleLimit: settings.freeArticleLimit || 3,
    paywallPrice: (settings.integrations && settings.integrations.mpesa && settings.integrations.mpesa.amount) || 50,
    paywallCurrency: 'KSh',
    seoSchema
  });
});

app.post('/post/:slug/comment', (req, res) => {
  const post = db.get('posts').find({ slug: req.params.slug, status: 'published', deletedAt: null }).value();
  if (!post) return res.status(404).render('404', { title: 'Not found' });
  const { name, email, body } = req.body;
  if (!name || !name.trim() || !body || !body.trim()) {
    const isJson = req.headers.accept && req.headers.accept.includes('application/json');
    if (isJson) return res.status(400).json({ ok: false, message: 'Please add your name and a comment.' });
    req.flash('error', 'Please add your name and a comment.');
    return res.redirect(`/post/${post.slug}#comments`);
  }
  const id = db.get('meta.nextCommentId').value();
  db.get('comments')
    .push({
      id,
      postId: post.id,
      name: name.trim().slice(0, 80),
      email: (email || '').trim().slice(0, 120),
      body: body.trim().slice(0, 2000),
      approved: false,
      createdAt: now_()
    })
    .write();
  db.set('meta.nextCommentId', id + 1).write();
  const isJson = req.headers.accept && req.headers.accept.includes('application/json');
  if (isJson) return res.json({ ok: true, message: 'Thanks — your comment has been submitted and will appear once approved.' });
  req.flash('success', 'Thanks — your comment has been submitted and will appear once approved.');
  res.redirect(`/post/${post.slug}#comments`);
});

app.post('/post/:slug/share', (req, res) => {
  const post = db.get('posts').find({ slug: req.params.slug, status: 'published', deletedAt: null }).value();
  if (!post) return res.status(404).json({ ok: false });
  const shares = (post.shares || 0) + 1;
  db.get('posts').find({ id: post.id }).assign({ shares }).write();
  res.json({ ok: true, shares });
});

app.get('/ads/:id/click', (req, res) => {
  const ad = db.get('ads').find({ id: Number(req.params.id) }).value();
  if (!ad) return res.redirect('/');
  db.get('ads').find({ id: ad.id }).assign({ clicks: (ad.clicks || 0) + 1 }).write();
  res.redirect('/advertise?adId=' + ad.id);
});

app.post('/newsletter', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const isJson = req.headers.accept && req.headers.accept.includes('application/json');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    if (isJson) return res.status(400).json({ ok: false, message: 'Enter a valid email address.' });
    req.flash('error', 'Enter a valid email address.');
    return res.redirect('back');
  }
  const existing = db.get('subscribers').find({ email }).value();
  if (!existing) db.get('subscribers').push({ id: Date.now(), email, createdAt: now_() }).write();
  if (isJson) return res.json({ ok: true, message: 'Subscribed!' });
  req.flash('success', "You're subscribed!");
  res.redirect('back');
});

// ---------- RSS + sitemap ----------
function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildArticleSchema(post, settings, baseUrl) {
  const image = post.coverImage ? [post.coverImage.startsWith('http') ? post.coverImage : baseUrl + post.coverImage] : [baseUrl + '/assets/img/post/list/1.png'];
  const logoUrl = (settings.logo || '').startsWith('http') ? settings.logo : baseUrl + (settings.logo || '');
  const authorUrl = baseUrl + '/author/' + (post.author || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": baseUrl + "/" },
          { "@type": "ListItem", "position": 2, "name": post.category.charAt(0).toUpperCase() + post.category.slice(1), "item": baseUrl + "/category/" + post.category },
          { "@type": "ListItem", "position": 3, "name": post.title, "item": baseUrl + '/post/' + post.slug }
        ]
      },
      {
        "@type": "NewsArticle",
        "headline": post.title,
        "description": post.excerpt || '',
        "image": image,
        "datePublished": post.createdAt,
        "dateModified": post.updatedAt || post.createdAt,
        "author": { "@type": "Person", "name": post.author, "url": authorUrl },
        "publisher": {
          "@type": "Organization",
          "name": settings.siteName,
          "logo": { "@type": "ImageObject", "url": logoUrl, "width": 600, "height": 60 }
        },
        "mainEntityOfPage": { "@type": "WebPage", "@id": baseUrl + '/post/' + post.slug },
        "articleSection": post.category,
        "keywords": (post.tags || []).join(', '),
        "isAccessibleForFree": "True"
      }
    ]
  });
}

function buildSitemapXml() {
  const base = (db.get('settings.siteUrl').value() || '').trim().replace(/\/$/, '') || 'http://localhost:3000';
  const posts = db.get('posts').filter({ status: 'published', deletedAt: null }).value();
  const categories = db.get('categories').value();
   const staticUrls = ['/', '/about', '/contact', '/privacy', '/terms', '/cookies', '/disclaimer', '/editorial', '/corrections', '/ownership'];
  const urls = [
    ...staticUrls.map((u) => `<url><loc>${base}${u}</loc></url>`),
    ...categories.map((c) => `<url><loc>${base}/category/${c.slug}</loc></url>`),
    ...posts.map((p) => `<url><loc>${base}/post/${p.slug}</loc><lastmod>${p.updatedAt.slice(0, 10)}</lastmod></url>`)
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function writeSitemap() {
  const sitemapPath = path.join(__dirname, 'public', 'sitemap.xml');
  fs.writeFileSync(sitemapPath, buildSitemapXml(), 'utf-8');
}

app.get('/rss.xml', (req, res) => {
  const base = siteUrl(req);
  const settings = db.get('settings').value();
  const posts = db.get('posts').filter({ status: 'published', deletedAt: null }).sortBy('createdAt').value().reverse().slice(0, 30);
  const items = posts
    .map(
      (p) => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${base}/post/${p.slug}</link>
      <guid>${base}/post/${p.slug}</guid>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      <description>${esc(p.excerpt)}</description>
    </item>`
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(settings.siteName)}</title>
  <link>${base}/</link>
   <description>${esc(settings.tagline)}</description>${items}${settings.logo ? `\n  <image><url>${settings.logo.startsWith('http') ? settings.logo : base + settings.logo}</url><title>${esc(settings.siteName)}</title></image>` : ''}
</channel></rss>`;
  res.set('Content-Type', 'application/rss+xml; charset=utf-8');
  res.send(xml);
});

// ==================== Dynamic Sitemap ====================
app.get('/sitemap.xml', async (req, res) => {
  try {
    const base = siteUrl(req);
    const sitemap = await seo.generateSitemap(db, base);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Content-Encoding', 'gzip');
    res.send(sitemap);
  } catch (err) {
    console.error('[SEO] Sitemap error:', err);
    res.status(500).end();
  }
});

// ==================== ads.txt for AdSense ====================
app.get('/ads.txt', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send('google.com, pub-8005999231713611, DIRECT, f08c47fec0942fa0');
});

// ==================== Google Indexing API ====================
// Manual trigger: POST /admin/seo/index with { url: 'https://...' }
app.post('/admin/seo/index', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  seo.notifyGoogle(url).then(result => res.json(result));
});

// ==================== RSS Feed ====================

// Mount Jobs Portal Routes
app.use("/jobs", jobsRoutes);
app.use("/employer", employerRoutes);

// =====================================================================
// ADMIN CMS
// =====================================================================
const admin = express.Router();

admin.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('admin/login', { title: 'Sign in — Kenya ni Home CMS' });
});

admin.post('/login', (req, res) => {
  const { username, password } = req.body;
  const lower = (username || '').toLowerCase();
  const user = db.get('users').find({ username }).value() || db.get('users').find({ email: lower }).value();
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    req.flash('error', 'Incorrect username or password.');
    return res.redirect('/admin/login');
  }
  if (user.status === 'pending') {
    req.flash('error', 'Your account is awaiting admin approval.');
    return res.redirect('/admin/login');
  }
  if (user.status === 'inactive') {
    req.flash('error', 'Your account has been deactivated.');
    return res.redirect('/admin/login');
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  db.get('users').find({ id: user.id }).assign({ lastLoginAt: now_() }).write();
  logActivity(user.id, 'login', 'Signed in', req.ip);
  res.redirect('/admin');
});

admin.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

admin.get('/signup', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('admin/signup', { title: 'Sign up — Kenya ni Home CMS' });
});

admin.post('/signup', (req, res) => {
  const { username, email, password } = req.body;
  const trimUser = (username || '').trim();
  const trimEmail = (email || '').trim().toLowerCase();
  if (!trimUser || !trimEmail || !password) {
    req.flash('error', 'Username, email and password are required.');
    return res.redirect('/admin/signup');
  }
  if (password.length < 6) {
    req.flash('error', 'Password must be at least 6 characters.');
    return res.redirect('/admin/signup');
  }
  const existing = db.get('users').find({ $or: [{ username: trimUser }, { email: trimEmail }] }).value();
  if (existing) {
    req.flash('error', 'Username or email already exists.');
    return res.redirect('/admin/signup');
  }
  const ua = req.headers['user-agent'] || '';
  const { browser, os } = parseUserAgent(ua);
  const id = db.get('meta.nextUserId').value();
  db.get('users').push({
    id,
    username: trimUser,
    email: trimEmail,
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'viewer',
    status: 'pending',
    createdAt: now_(),
    lastLoginAt: null,
    browser,
    os
  }).write();
  db.set('meta.nextUserId', id + 1).write();
  createNotification(null, 'user.created', `New user <b>${trimUser}</b> requested access.`, '/admin/users');
  logActivity(null, 'user.create', `Signed up from ${browser} on ${os}`, req.ip);
  req.flash('success', 'Account created. Please wait for admin approval.');
  res.redirect('/admin/login');
});

admin.get('/forgot-password', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('admin/forgot-password', { title: 'Forgot password — Kenya ni Home CMS' });
});

admin.post('/forgot-password', (req, res) => {
  const usernameOrEmail = (req.body.usernameOrEmail || '').trim();
  const user = db.get('users').find({ $or: [{ username: usernameOrEmail }, { email: usernameOrEmail.toLowerCase() }] }).value();
  if (!user) {
    req.flash('error', 'No account found with that username or email.');
    return res.redirect('/admin/forgot-password');
  }
  const token = require('crypto').randomBytes(32).toString('hex');
  db.get('users').find({ id: user.id }).assign({ resetToken: token, resetTokenExpiry: new Date(Date.now() + 3600000).toISOString() }).write();
  req.flash('success', `Reset link: /admin/reset-password/${token}`);
  res.render('admin/forgot-password', { title: 'Forgot password — Kenya ni Home CMS', success: req.flash('success') });
});

admin.get('/reset-password/:token', (req, res) => {
  const token = req.params.token;
  const user = db.get('users').find({ resetToken: token }).value();
  if (!user || !user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
    req.flash('error', 'Invalid or expired reset link.');
    return res.redirect('/admin/forgot-password');
  }
  res.render('admin/reset-password', { title: 'Reset password — Kenya ni Home CMS', token });
});

admin.post('/reset-password/:token', (req, res) => {
  const token = req.params.token;
  const { password, confirmPassword } = req.body;
  const user = db.get('users').find({ resetToken: token }).value();
  if (!user || !user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
    req.flash('error', 'Invalid or expired reset link.');
    return res.redirect('/admin/forgot-password');
  }
  if (!password || password.length < 6) {
    req.flash('error', 'Password must be at least 6 characters.');
    return res.redirect(`/admin/reset-password/${token}`);
  }
  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect(`/admin/reset-password/${token}`);
  }
  db.get('users').find({ id: user.id }).assign({ passwordHash: bcrypt.hashSync(password, 10), resetToken: null, resetTokenExpiry: null }).write();
  req.flash('success', 'Password updated. You can now sign in.');
  res.redirect('/admin/login');
});

admin.use(requireAuth);

// Admin middleware - set locals for admin views
admin.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.settings = db.get('settings').value();
  res.locals.pendingJobsCount = db.get('jobs').filter({ status: 'pending' }).size().value();
  res.locals.pendingUserCount = db.get('users').filter({ status: 'pending' }).size().value();
  next();
});

// ---- Dashboard ----
admin.get('/', requirePermission('posts:read'), (req, res) => {
  autoPublishDue();
  const posts = db.get('posts').filter({ deletedAt: null }).value();
  const published = posts.filter((p) => p.status === 'published').length;
  const drafts = posts.filter((p) => p.status === 'draft').length;
  const scheduled = posts.filter((p) => p.status === 'scheduled').length;
  const trashCount = db.get('posts').filter((p) => !!p.deletedAt).size().value();
  const recent = [...posts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);
  const messages = db.get('messages').value().slice(-5).reverse();
  const pendingComments = db.get('comments').filter({ approved: false }).size().value();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const publishedPosts = posts.filter((p) => p.status === 'published');
  const postsThisWeek = publishedPosts.filter((p) => new Date(p.createdAt) >= weekAgo).length;
  const postsThisMonth = publishedPosts.filter((p) => new Date(p.createdAt) >= monthAgo).length;
  const totalWords = publishedPosts.reduce((sum, p) => sum + wordCount(p.content), 0);
  const avgReadTime = publishedPosts.length
    ? Math.round(publishedPosts.reduce((sum, p) => sum + readingTime(p.content), 0) / publishedPosts.length)
    : 0;

  const draftQueue = posts.filter((p) => p.status === 'draft').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 6);
  const scheduledQueue = posts.filter((p) => p.status === 'scheduled').sort((a, b) => new Date(a.publishAt) - new Date(b.publishAt)).slice(0, 6);
  const needsAttention = publishedPosts
    .filter((p) => missingFields(p).length)
    .slice(0, 6)
    .map((p) => ({ ...p, missing: missingFields(p) }));

  const categories = db.get('categories').value();
  const totalPublished = publishedPosts.length;
  const categoryBreakdown = categories
    .map((c) => ({ name: c.name, slug: c.slug, count: publishedPosts.filter((p) => p.category === c.slug).length }))
    .sort((a, b) => b.count - a.count);
  const topCategory = categoryBreakdown.length > 0 && categoryBreakdown[0].count > 0 ? categoryBreakdown[0] : null;

  const topPosts = [...publishedPosts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 6);

  const year = now.getFullYear();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const calendarMonths = monthNames.map((name, mIndex) => {
    const daysInMonth = new Date(year, mIndex + 1, 0).getDate();
    const counts = Array.from({ length: daysInMonth }, () => 0);
    posts.forEach((p) => {
      const d = new Date(p.createdAt);
      if (d.getFullYear() === year && d.getMonth() === mIndex) counts[d.getDate() - 1]++;
    });
    const total = counts.reduce((a, b) => a + b, 0);
    return { name, month: mIndex + 1, daysInMonth, counts, total };
  });

  // last 14 days of site-wide views, for the traffic line chart
  const dailyViews = db.get('dailyViews').value() || {};
  const trafficDays = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    trafficDays.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: dailyViews[key] || 0 });
  }

  const allPayments = db.get('payments').value() || [];
  const successfulPayments = allPayments.filter((p) => p.status === 'success');
  const failedPayments = allPayments.filter((p) => p.status === 'failed');
  const totalRevenue = successfulPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const paymentDays = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const count = allPayments.filter((p) => p.createdAt && p.createdAt.slice(0, 10) === key).length;
    paymentDays.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count });
  }

  res.render('admin/dashboard', {
    title: 'Dashboard — Kenya ni Home CMS',
    stats: {
      total: posts.length,
      published,
      drafts,
      scheduled,
      categories: db.get('categories').size().value(),
      media: listMedia().length,
      trashCount,
      postsThisWeek,
      postsThisMonth,
      totalWords,
      avgReadTime,
      totalViews: posts.reduce((sum, p) => sum + (p.views || 0), 0),
      subscribers: db.get('subscribers').size().value(),
      unreadMessages: db.get('messages').filter({ read: false }).size().value(),
      pendingComments,
      activeAds: db.get('ads').filter({ active: true }).size().value()
    },
    recent,
    messages,
    draftQueue,
    scheduledQueue,
    needsAttention,
    topPosts,
    categoryChart: JSON.stringify({ labels: categoryBreakdown.map((c) => c.name), data: categoryBreakdown.map((c) => c.count), slugs: categoryBreakdown.map((c) => c.slug) }),
    categoryBreakdown,
    totalPublished,
    topCategory,
    trafficChart: JSON.stringify({ labels: trafficDays.map((d) => d.label), data: trafficDays.map((d) => d.count) }),
    paymentStats: {
      total: allPayments.length,
      successful: successfulPayments.length,
      failed: failedPayments.length,
      revenue: totalRevenue
    },
    paymentChart: JSON.stringify({ labels: paymentDays.map((d) => d.label), data: paymentDays.map((d) => d.count) }),
    allPayments,
    engagementChart: JSON.stringify({
      labels: topPosts.map((p) => (p.title.length > 22 ? p.title.slice(0, 22) + '…' : p.title)),
      views: topPosts.map((p) => p.views || 0),
      comments: topPosts.map((p) => db.get('comments').filter({ postId: p.id, approved: true }).size().value()),
      shares: topPosts.map((p) => p.shares || 0)
    }),
    calendar: { year, months: calendarMonths, today: now.getDate() }
  });
});

admin.post('/posts/quick-draft', requirePermission('posts:write'), (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) {
    req.flash('error', 'Give the draft a title first.');
    return res.redirect('/admin');
  }
  const id = db.get('meta.nextPostId').value();
  db.get('posts')
    .push({
      id,
      title,
      slug: uniqueSlug(title),
      excerpt: '',
      content: '',
      coverImage: '',
      gallery: [],
      audioUrl: '',
      category: (db.get('categories').first().value() || {}).slug || '',
      author: (req.session.user && req.session.user.username) || 'Newsroom Staff',
      status: 'draft',
      featured: false,
      sponsored: false,
      breaking: false,
      breakingExpiry: null,
      trending: false,
      tags: [],
      views: 0,
      shares: 0,
      deletedAt: null,
      publishAt: null,
      createdAt: now_(),
      updatedAt: now_()
    })
    .write();
  db.set('meta.nextPostId', id + 1).write();
  clearCache();
  writeSitemap();
  logActivity(req.session.user ? req.session.user.id : null, 'post.create', `Quick draft: "${title}"`, req.ip);
  res.redirect(`/admin/posts/${id}/edit`);
});

// ---- Posts ----
admin.get('/posts', requirePermission('posts:read'), (req, res) => {
  autoPublishDue();
  const posts = [...db.get('posts').filter({ deletedAt: null }).value()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.render('admin/posts', { title: 'Posts — Kenya ni Home CMS', posts });
});

admin.get('/posts/new', requirePermission('posts:write'), (req, res) => {
  res.render('admin/post-form', { title: 'New Post — Kenya ni Home CMS', post: null, media: listMedia() });
});

function resolveStatus(status, publishAt) {
  if (status === 'scheduled' && publishAt && new Date(publishAt) > new Date()) return 'scheduled';
  if (status === 'published' || status === 'scheduled') return 'published';
  return 'draft';
}

const postUpload = upload.fields([{ name: 'coverImageFile', maxCount: 1 }, { name: 'audioFile', maxCount: 1 }, { name: 'documentFile', maxCount: 10 }]);

admin.post('/posts', requirePermission('posts:write'), postUpload, asyncHandler(async (req, res) => {
  const { title, excerpt, content, category, author, status, tags, publishAt, galleryUrls, audioUrl, documents, photoCredit } = req.body;
  if (!title || !title.trim()) {
    req.flash('error', 'A title is required.');
    return res.redirect('/admin/posts/new');
  }
  const coverFile = req.files && req.files.coverImageFile && req.files.coverImageFile[0];
  const audioFile = req.files && req.files.audioFile && req.files.audioFile[0];
  const docFiles = req.files && req.files.documentFile ? req.files.documentFile : [];
  if (coverFile) await optimizeImage(coverFile.path);

  const id = db.get('meta.nextPostId').value();
  const post = {
    id,
    title: title.trim(),
    slug: uniqueSlug(title),
    excerpt: (excerpt || stripHtml(content).slice(0, 160)).trim(),
    content: content || '',
    coverImage: coverFile ? `/public/uploads/${coverFile.filename}` : req.body.coverImageUrl || '',
    gallery: galleryUrls ? JSON.parse(galleryUrls) : [],
    audioUrl: audioFile ? `/public/uploads/${audioFile.filename}` : (audioUrl || ''),
    documents: docFiles.map(f => ({ name: f.originalname, url: `/public/uploads/${f.filename}`, size: f.size })),
    category: category || (db.get('categories').first().value() || {}).slug || '',
    author: author || 'Newsroom Staff',
    status: resolveStatus(status, publishAt),
    publishAt: status === 'scheduled' && publishAt ? new Date(publishAt).toISOString() : null,
     featured: req.body.featured === 'on',
     sponsored: req.body.sponsored === 'on',
     breaking: req.body.breaking === 'on',
     breakingExpiry: req.body.breakingExpiry || null,
     trending: req.body.trending === 'on',
     editorsPick: req.body.editorsPick === 'on',
     tags: (tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    photoCredit: (photoCredit || '').trim(),
    views: 0,
    shares: 0,
    deletedAt: null,
    createdAt: now_(),
    updatedAt: now_()
  };
  if (post.featured) db.get('posts').forEach((p) => (p.featured = false)).write();
  db.get('posts').push(post).write();
  db.set('meta.nextPostId', id + 1).write();
  clearCache();
  writeSitemap();
  // Auto-index new published posts
  if (post.status === 'published') {
    const baseUrl = siteUrl(req);
    seo.notifyGoogle(baseUrl + '/post/' + post.slug).catch(() => {});
  }
  logActivity(req.session.user ? req.session.user.id : null, 'post.create', `Created post "${title}"`, req.ip);
  req.flash('success', post.status === 'scheduled' ? `"${post.title}" is scheduled for ${formatDate(post.publishAt)}.` : `"${post.title}" was created.`);
  res.redirect('/admin/posts');
}));

admin.get('/posts/:id/edit', requirePermission('posts:edit'), (req, res) => {
  const post = db.get('posts').find({ id: Number(req.params.id) }).value();
  if (!post) {
    req.flash('error', 'Post not found.');
    return res.redirect('/admin/posts');
  }
  res.render('admin/post-form', { title: `Edit — ${post.title}`, post, media: listMedia() });
});

admin.put('/posts/:id', requirePermission('posts:edit'), postUpload, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.get('posts').find({ id }).value();
  if (!existing) {
    req.flash('error', 'Post not found.');
    return res.redirect('/admin/posts');
  }
  const { title, excerpt, content, category, author, status, tags, publishAt, galleryUrls, audioUrl, documents, photoCredit } = req.body;
  const coverFile = req.files && req.files.coverImageFile && req.files.coverImageFile[0];
  const audioFile = req.files && req.files.audioFile && req.files.audioFile[0];
  const docFiles = req.files && req.files.documentFile ? req.files.documentFile : [];
  if (coverFile) await optimizeImage(coverFile.path);

  const featured = req.body.featured === 'on';
  if (featured) db.get('posts').forEach((p) => (p.featured = p.id === id)).write();
  const resolvedStatus = resolveStatus(status, publishAt);

  let mergedDocuments = (existing.documents || []).filter(d => !d._delete);
  if (documents && Array.isArray(documents)) {
    const keepNames = documents.filter(d => !d._delete).map(d => d.name);
    mergedDocuments = mergedDocuments.filter(d => keepNames.includes(d.name));
  }
  const newDocs = docFiles.map(f => ({ name: f.originalname, url: `/public/uploads/${f.filename}`, size: f.size }));
  const finalDocuments = [...mergedDocuments, ...newDocs];

  db.get('posts')
    .find({ id })
    .assign({
      title: title.trim(),
      slug: title.trim() !== existing.title ? uniqueSlug(title, id) : existing.slug,
      excerpt: (excerpt || stripHtml(content).slice(0, 160)).trim(),
      content: content || '',
      coverImage: coverFile ? `/public/uploads/${coverFile.filename}` : req.body.coverImageUrl || existing.coverImage,
      gallery: galleryUrls ? JSON.parse(galleryUrls) : existing.gallery || [],
      audioUrl: audioFile ? `/public/uploads/${audioFile.filename}` : (audioUrl !== undefined ? audioUrl : existing.audioUrl),
      documents: finalDocuments,
      category,
      author,
      status: resolvedStatus,
      publishAt: resolvedStatus === 'scheduled' && publishAt ? new Date(publishAt).toISOString() : null,
      featured,
      sponsored: req.body.sponsored === 'on',
      breaking: req.body.breaking === 'on',
      breakingExpiry: req.body.breakingExpiry || null,
      trending: req.body.trending === 'on',
      editorsPick: req.body.editorsPick === 'on',
      tags: (tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      photoCredit: (photoCredit || '').trim(),
      updatedAt: now_()
    })
    .write();
  clearCache();
  writeSitemap();
  // Auto-index updated published posts
  if (resolvedStatus === 'published') {
    const baseUrl = siteUrl(req);
    seo.notifyGoogle(baseUrl + '/post/' + existing.slug).catch(() => {});
  }
  logActivity(req.session.user ? req.session.user.id : null, 'post.update', `Updated post "${title.trim()}"`, req.ip);
  req.flash('success', 'Post updated.');
  res.redirect('/admin/posts');
}));

admin.delete('/posts/:id', requirePermission('posts:edit'), (req, res) => {
  const post = db.get('posts').find({ id: Number(req.params.id) }).value();
  if (!post) {
    req.flash('error', 'Post not found.');
    return res.redirect('/admin/posts');
  }
  db.get('posts').find({ id: post.id }).assign({ deletedAt: now_() }).write();
  clearCache();
  writeSitemap();
  logActivity(req.session.user ? req.session.user.id : null, 'post.delete', `Moved post "${post.title}" to trash`, req.ip);
  req.flash('success', 'Post moved to Trash.');
  res.redirect('/admin/posts');
});

admin.get('/trash', requirePermission('posts:read'), (req, res) => {
  const trashed = [...db.get('posts').filter((p) => !!p.deletedAt).value()].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  res.render('admin/trash', { title: 'Trash — Kenya ni Home CMS', posts: trashed });
});

admin.post('/posts/:id/restore', requirePermission('posts:edit'), (req, res) => {
  db.get('posts').find({ id: Number(req.params.id) }).assign({ deletedAt: null }).write();
  clearCache();
  writeSitemap();
  logActivity(req.session.user ? req.session.user.id : null, 'post.restore', `Restored post from trash`, req.ip);
  req.flash('success', 'Post restored.');
  res.redirect('/admin/trash');
});

admin.delete('/posts/:id/permanent', requirePermission('posts:edit'), (req, res) => {
  db.get('posts').remove({ id: Number(req.params.id) }).write();
  clearCache();
  writeSitemap();
  logActivity(req.session.user ? req.session.user.id : null, 'post.delete', `Permanently deleted post`, req.ip);
  req.flash('success', 'Post permanently deleted.');
  res.redirect('/admin/trash');
});

// ---- Breaking News ----
admin.get('/breaking', requirePermission('posts:read'), (req, res) => {
  autoPublishDue();
  const allPosts = db.get('posts').filter({ deletedAt: null, status: 'published' }).value();
  const breakingPosts = allPosts.filter((p) => p.breaking && (!p.breakingExpiry || new Date(p.breakingExpiry) > new Date())).sort((a, b) => {
    const aOrder = a.breakingOrder || 0;
    const bOrder = b.breakingOrder || 0;
    return aOrder - bOrder || new Date(b.createdAt) - new Date(a.createdAt);
  });
  const availablePosts = allPosts.filter((p) => !p.breaking || (p.breakingExpiry && new Date(p.breakingExpiry) <= new Date())).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('admin/breaking', { title: 'Breaking News — Kenya ni Home CMS', breakingPosts, availablePosts });
});

admin.post('/breaking/add', requirePermission('posts:edit'), (req, res) => {
  const { postId, breakingExpiry } = req.body;
  const id = Number(postId);
  const post = db.get('posts').find({ id }).value();
  if (!post) return res.status(404).send('Post not found');
  const maxOrder = db.get('posts').filter({ breaking: true }).value().reduce((max, p) => Math.max(max, p.breakingOrder || 0), -1);
  db.get('posts').find({ id }).assign({
    breaking: true,
    breakingOrder: maxOrder + 1,
    breakingExpiry: breakingExpiry || null
  }).write();
  clearCache();
  req.flash('success', 'Post added to breaking news.');
  logActivity(req.session.user ? req.session.user.id : null, 'breaking.add', `Added post to breaking news`, req.ip);
  res.redirect('/admin/breaking');
});

admin.delete('/breaking/:id', requirePermission('posts:edit'), (req, res) => {
  db.get('posts').find({ id: Number(req.params.id) }).assign({ breaking: false, breakingOrder: null, breakingExpiry: null }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'breaking.remove', `Removed post from breaking news`, req.ip);
  req.flash('success', 'Removed from breaking news.');
  res.redirect('/admin/breaking');
});

admin.post('/breaking/:id/move', requirePermission('posts:edit'), (req, res) => {
  const id = Number(req.params.id);
  const { direction } = req.body;
  const posts = [...db.get('posts').filter({ breaking: true }).value()].sort((a, b) => (a.breakingOrder || 0) - (b.breakingOrder || 0));
  const idx = posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).send('Not found');
  const newIdx = idx + (direction === 'up' ? -1 : 1);
  if (newIdx < 0 || newIdx >= posts.length) return res.status(400).send('Cannot move');
  const tmp = posts[idx].breakingOrder;
  posts[idx].breakingOrder = posts[newIdx].breakingOrder;
  posts[newIdx].breakingOrder = tmp;
  posts.forEach(p => db.get('posts').find({ id: p.id }).assign({ breakingOrder: p.breakingOrder }).write());
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'breaking.reorder', `Reordered breaking news`, req.ip);
  res.json({ ok: true });
});

admin.post('/breaking/reorder', requirePermission('posts:edit'), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).send('Invalid');
  ids.forEach((id, i) => {
    db.get('posts').find({ id: Number(id) }).assign({ breakingOrder: i }).write();
  });
  clearCache();
  res.json({ ok: true });
});

// ---- Header Items ----
admin.get('/header-items', requirePermission('*'), (req, res) => {
  const headerItems = db.get('headerItems').sortBy('order').value();
  const categories = db.get('categories').value();
  res.render('admin/header-items', { title: 'Navigation — Kenya ni Home CMS', headerItems, categories });
});

admin.post('/header-items', requirePermission('*'), (req, res) => {
  const { name, type, slug, url } = req.body;
  const trimName = (name || '').trim();
  if (!trimName) {
    req.flash('error', 'Header item name required.');
    return res.redirect('/admin/header-items');
  }
  const id = db.get('meta.nextHeaderItemId').value();
  const maxOrder = db.get('headerItems').value().reduce((max, hi) => Math.max(max, hi.order || 0), -1);
  const hiSlug = (slug || '').trim() ? slugify(slug, { lower: true, strict: true }) : slugify(trimName, { lower: true, strict: true });
  db.get('headerItems').push({
    id,
    name: trimName,
    slug: hiSlug,
    type: type || 'category',
    url: url || null,
    order: maxOrder + 1,
    active: true
  }).write();
  db.set('meta.nextHeaderItemId', id + 1).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'header.create', `Created header item "${trimName}"`, req.ip);
  req.flash('success', 'Header item added.');
  res.redirect('/admin/header-items');
});

admin.put('/header-items/:id', requirePermission('*'), (req, res) => {
  const { name, type, slug, url, order, active } = req.body;
  const trimName = (name || '').trim();
  if (!trimName) {
    req.flash('error', 'Header item name required.');
    return res.redirect('/admin/header-items');
  }
  const hiSlug = (slug || '').trim() ? slugify(slug, { lower: true, strict: true }) : slugify(trimName, { lower: true, strict: true });
  db.get('headerItems').find({ id: Number(req.params.id) }).assign({
    name: trimName,
    slug: hiSlug,
    type: type || 'category',
    url: url || null,
    order: Number(order) || 0,
    active: active === 'on' || active === 'true'
  }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'header.update', `Updated header item "${trimName}"`, req.ip);
  req.flash('success', 'Header item updated.');
  res.redirect('/admin/header-items');
});

admin.delete('/header-items/:id', requirePermission('*'), (req, res) => {
  db.get('headerItems').remove({ id: Number(req.params.id) }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'header.delete', `Deleted header item`, req.ip);
  req.flash('success', 'Header item removed.');
  res.redirect('/admin/header-items');
});

admin.post('/header-items/reorder', requirePermission('*'), (req, res) => {
  const order = req.body.order;
  if (Array.isArray(order)) {
    order.forEach((item) => {
      if (item.id) {
        db.get('headerItems').find({ id: Number(item.id) }).assign({
          order: Number(item.order) || 0,
          active: item.active === true || item.active === 'true'
        }).write();
      }
    });
    clearCache();
    logActivity(req.session.user ? req.session.user.id : null, 'header.reorder', `Reordered header items`, req.ip);
  }
  res.json({ ok: true });
});

admin.get('/categories/new', requirePermission('categories:write'), (req, res) => {
  const headerItems = db.get('headerItems').sortBy('order').value();
  res.render('admin/category-form', { title: 'New Category — Kenya ni Home CMS', category: null, headerItems });
});

admin.get('/categories/:id/edit', requirePermission('categories:read'), (req, res) => {
  const category = db.get('categories').find({ id: Number(req.params.id) }).value();
  if (!category) {
    req.flash('error', 'Category not found.');
    return res.redirect('/admin/categories');
  }
  const headerItems = db.get('headerItems').sortBy('order').value();
  res.render('admin/category-form', { title: `Edit — ${category.name}`, category, headerItems });
});

// ---- Categories ----
admin.get('/categories', requirePermission('categories:read'), (req, res) => {
  const categories = db.get('categories').sortBy('order').value();
  const headerItems = db.get('headerItems').sortBy('order').value();
  const counts = {};
  db.get('posts').value().forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
  res.render('admin/categories', { title: 'Categories — Kenya ni Home CMS', categories, headerItems, counts });
});

admin.post('/categories', requirePermission('categories:write'), (req, res) => {
  const { name, slug, headerItemId, showInNavigation, status } = req.body;
  const trimName = (name || '').trim();
  if (!trimName) {
    req.flash('error', 'Category name required.');
    return res.redirect('/admin/categories');
  }
  const id = db.get('meta.nextCategoryId').value();
  const catSlug = (slug || '').trim() ? slugify(slug, { lower: true, strict: true }) : slugify(trimName, { lower: true, strict: true });
  db.get('categories').push({
    id,
    name: trimName,
    slug: catSlug,
    headerItemId: headerItemId ? Number(headerItemId) : null,
    order: db.get('categories').filter({ headerItemId: headerItemId ? Number(headerItemId) : null }).value().length,
    showInNavigation: showInNavigation === 'on' || showInNavigation === 'true',
    status: status || 'published'
  }).write();
  db.set('meta.nextCategoryId', id + 1).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'category.create', `Created category "${trimName}"`, req.ip);
  req.flash('success', 'Category added.');
  res.redirect('/admin/categories');
});

admin.delete('/categories/:id', requirePermission('categories:write'), (req, res) => {
  db.get('categories').remove({ id: Number(req.params.id) }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'category.delete', `Deleted category`, req.ip);
  req.flash('success', 'Category removed.');
  res.redirect('/admin/categories');
});

admin.put('/categories/:id', requirePermission('categories:write'), (req, res) => {
  const { name, slug, headerItemId, showInNavigation, status } = req.body;
  const trimName = (name || '').trim();
  if (!trimName) {
    req.flash('error', 'Category name required.');
    return res.redirect('/admin/categories');
  }
  const cat = db.get('categories').find({ id: Number(req.params.id) }).value();
  if (!cat) {
    req.flash('error', 'Category not found.');
    return res.redirect('/admin/categories');
  }
  const newSlug = (slug || '').trim() ? slugify(slug, { lower: true, strict: true }) : slugify(trimName, { lower: true, strict: true });
  const hid = headerItemId ? Number(headerItemId) : null;
  db.get('categories').find({ id: cat.id }).assign({
    name: trimName,
    slug: newSlug,
    headerItemId: hid,
    showInNavigation: showInNavigation === 'on' || showInNavigation === 'true',
    status: status || 'published'
  }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'category.update', `Updated category "${trimName}"`, req.ip);
  req.flash('success', 'Category updated.');
  res.redirect('/admin/categories');
});

admin.post('/categories/reorder', requirePermission('categories:write'), (req, res) => {
  const order = req.body.order;
  if (Array.isArray(order)) {
    order.forEach((item) => {
      if (item.id && typeof item.headerItemId !== 'undefined') {
        db.get('categories').find({ id: Number(item.id) }).assign({
          headerItemId: item.headerItemId ? Number(item.headerItemId) : null,
          order: Number(item.order) || 0
        }).write();
      }
    });
    clearCache();
    logActivity(req.session.user ? req.session.user.id : null, 'category.reorder', `Reordered categories`, req.ip);
  }
  res.json({ ok: true });
});

// ---- Media Library ----
admin.get('/media', requirePermission('media:read'), (req, res) => {
  res.render('admin/media', { title: 'Media Library — Kenya ni Home CMS', media: listMedia() });
});

admin.post('/media/upload', requirePermission('media:write'), upload.array('images', 12), asyncHandler(async (req, res) => {
  const files = req.files || [];
  for (const f of files) await optimizeImage(f.path);
  logActivity(req.session.user ? req.session.user.id : null, 'media.upload', `Uploaded ${files.length} image(s)`, req.ip);
  req.flash('success', `${files.length} image(s) uploaded.`);
  res.redirect('/admin/media');
}));

admin.delete('/media/:name', requirePermission('media:write'), (req, res) => {
  const file = path.join(uploadsDir, path.basename(req.params.name));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  logActivity(req.session.user ? req.session.user.id : null, 'media.delete', `Deleted image ${req.params.name}`, req.ip);
  req.flash('success', 'Image deleted.');
  res.redirect('/admin/media');
});

// ---- Messages ----
admin.get('/messages', requirePermission('messages:read'), (req, res) => {
  const messages = [...db.get('messages').value()].reverse();
  res.render('admin/messages', { title: 'Messages — Kenya ni Home CMS', messages });
});

admin.delete('/messages/:id', requirePermission('messages:write'), (req, res) => {
  db.get('messages').remove({ id: Number(req.params.id) }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'message.delete', `Deleted message`, req.ip);
  res.redirect('/admin/messages');
});

admin.post('/messages/:id/reply', requirePermission('messages:write'), asyncHandler(async (req, res) => {
  const message = db.get('messages').find({ id: Number(req.params.id) }).value();
  if (!message) {
    req.flash('error', 'Message not found.');
    return res.redirect('/admin/messages');
  }
  const { subject, body } = req.body;
  if (!subject || !body) {
    req.flash('error', 'Subject and body are required.');
    return res.redirect('/admin/messages');
  }
  const settings = db.get('settings').value();
  const integrations = settings.integrations || {};
  const emailConfig = integrations.email || {};
  if (!emailConfig.smtpHost || !emailConfig.smtpUser || !emailConfig.smtpPass) {
    req.flash('error', 'Email integration is not configured. Please save your SMTP settings first.');
    return res.redirect('/admin/messages');
  }
  try {
    await sendEmail({
      ...emailConfig,
      to: message.email,
      subject: subject.trim(),
      text: body.trim(),
      html: body.trim().replace(/\n/g, '<br>')
    });
    db.get('messages').find({ id: message.id }).assign({ read: true }).write();
    logActivity(req.session.user ? req.session.user.id : null, 'message.reply', 'Replied to message', req.ip);
    req.flash('success', 'Reply sent successfully.');
  } catch (err) {
    req.flash('error', 'Failed to send reply: ' + err.message);
  }
  res.redirect('/admin/messages');
}));

// ---- Comments ----
admin.get('/comments', requirePermission('comments:approve'), (req, res) => {
  const comments = [...db.get('comments').value()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((c) => ({ ...c, post: db.get('posts').find({ id: c.postId }).value() }));
  res.render('admin/comments', { title: 'Comments — Kenya ni Home CMS', comments });
});

admin.post('/comments/:id/approve', requirePermission('comments:approve'), (req, res) => {
    db.get('comments').find({ id: Number(req.params.id) }).assign({ approved: true }).write();
    clearCache();
    logActivity(req.session.user ? req.session.user.id : null, 'comment.approve', `Approved comment`, req.ip);
    req.flash('success', 'Comment approved.');
    res.redirect('/admin/comments');
});

admin.delete('/comments/:id', requirePermission('comments:approve'), (req, res) => {
  db.get('comments').remove({ id: Number(req.params.id) }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'comment.delete', `Deleted comment`, req.ip);
  req.flash('success', 'Comment removed.');
  res.redirect('/admin/comments');
});

// ---- Advertising / Sponsors ----
admin.get('/ads', requirePermission('*'), (req, res) => {
  const ads = [...db.get('ads').value()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('admin/ads', { title: 'Advertising — Kenya ni Home CMS', ads, ad: null });
});

admin.get('/ads/new', requirePermission('*'), (req, res) => {
  res.render('admin/ad-form', { title: 'New Ad — Kenya ni Home CMS', ad: null, media: listMedia() });
});

admin.get('/ads/:id/edit', requirePermission('*'), (req, res) => {
  const ad = db.get('ads').find({ id: Number(req.params.id) }).value();
  if (!ad) {
    req.flash('error', 'Ad not found.');
    return res.redirect('/admin/ads');
  }
  res.render('admin/ad-form', { title: 'Edit Ad — Kenya ni Home CMS', ad, media: listMedia() });
});

admin.post('/ads', requirePermission('*'), upload.single('imageFile'), asyncHandler(async (req, res) => {
  const { title, description, link, videoUrl, placement, imageUrl } = req.body;
  if (!title || !title.trim()) {
    req.flash('error', 'The ad needs a title.');
    return res.redirect('/admin/ads/new');
  }
  if (req.file) await optimizeImage(req.file.path);
  const id = db.get('meta.nextAdId').value();
  db.get('ads')
    .push({
      id,
      title: title.trim(),
      description: description || '',
      imageUrl: req.file ? `/public/uploads/${req.file.filename}` : imageUrl || '',
      videoUrl: videoUrl || '',
      link: link || '#',
      placement: ['sidebar', 'inline', 'both', 'brand'].includes(placement) ? placement : 'sidebar',
      active: req.body.active === 'on',
      clicks: 0,
      createdAt: now_()
    })
    .write();
  db.set('meta.nextAdId', id + 1).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.create', `Created ad "${title.trim()}"`, req.ip);
  req.flash('success', 'Ad created.');
  res.redirect('/admin/ads');
}));

admin.put('/ads/:id', requirePermission('*'), upload.single('imageFile'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.get('ads').find({ id }).value();
  if (!existing) {
    req.flash('error', 'Ad not found.');
    return res.redirect('/admin/ads');
  }
  if (req.file) await optimizeImage(req.file.path);
  const { title, description, link, videoUrl, placement, imageUrl } = req.body;
  db.get('ads')
    .find({ id })
    .assign({
      title: title.trim(),
      description: description || '',
      imageUrl: req.file ? `/public/uploads/${req.file.filename}` : imageUrl || existing.imageUrl,
      videoUrl: videoUrl || '',
      link: link || '#',
      placement: ['sidebar', 'inline', 'both', 'brand'].includes(placement) ? placement : 'sidebar',
      active: req.body.active === 'on'
    })
    .write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.update', `Updated ad "${title.trim()}"`, req.ip);
  req.flash('success', 'Ad updated.');
  res.redirect('/admin/ads');
}));

admin.delete('/ads/:id', requirePermission('*'), (req, res) => {
  db.get('ads').remove({ id: Number(req.params.id) }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.delete', `Deleted ad`, req.ip);
  req.flash('success', 'Ad deleted.');
  res.redirect('/admin/ads');
});

// ---- Ad Submissions (admin) ----
function autoExpireCampaigns() {
  const now = new Date();
  const expired = db.get('adSubmissions').filter({
    status: 'active',
    paymentStatus: 'paid'
  }).filter(s => s.endDate && new Date(s.endDate) <= now).value();
  expired.forEach(s => {
    db.get('adSubmissions').find({ id: s.id }).assign({ status: 'expired', updatedAt: now_() }).write();
  });
  if (expired.length) {
    logActivity(null, 'ad.expire', `Auto-expired ${expired.length} campaign(s)`, null);
  }
}

admin.get('/ad-submissions', requirePermission('*'), (req, res) => {
  autoExpireCampaigns();
  const statusFilter = (req.query.status || '').toLowerCase();
  let submissions = db.get('adSubmissions').value();
  if (statusFilter) {
    submissions = submissions.filter(s => s.status === statusFilter);
  }
  submissions = submissions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('admin/ad-submissions', {
    title: 'Ad Submissions — Kenya ni Home CMS',
    submissions,
    statusFilter,
    total: db.get('adSubmissions').size().value(),
    pending: db.get('adSubmissions').filter({ status: 'pending' }).size().value(),
    approved: db.get('adSubmissions').filter({ status: 'approved' }).size().value(),
    active: db.get('adSubmissions').filter({ status: 'active' }).size().value(),
    paused: db.get('adSubmissions').filter({ status: 'paused' }).size().value(),
    expired: db.get('adSubmissions').filter({ status: 'expired' }).size().value()
  });
});

admin.get('/ad-submissions/:id', requirePermission('*'), (req, res) => {
  const submission = db.get('adSubmissions').find({ id: Number(req.params.id) }).value();
  if (!submission) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  res.render('admin/ad-submission-preview', {
    title: `${submission.productName} — Ad Submission`,
    submission,
    media: listMedia()
  });
});

admin.get('/ad-submissions/:id/edit', requirePermission('*'), (req, res) => {
  const submission = db.get('adSubmissions').find({ id: Number(req.params.id) }).value();
  if (!submission) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  res.render('admin/ad-submission-form', {
    title: `Edit — ${submission.productName}`,
    submission,
    media: listMedia()
  });
});

admin.post('/ad-submissions/:id', requirePermission('*'), adSubmissionUpload, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.get('adSubmissions').find({ id }).value();
  if (!existing) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  const logoFile = req.files && req.files.find(f => f.fieldname === 'logoFile');
  const imageFiles = req.files ? req.files.filter(f => f.fieldname === 'imageFiles') : [];
  for (const f of [...(logoFile ? [logoFile] : []), ...imageFiles]) {
    await optimizeImage(f.path);
  }
  const updates = {
    businessName: (req.body.businessName || existing.businessName).trim(),
    contactPerson: (req.body.contactPerson || existing.contactPerson).trim(),
    phone: (req.body.phone || existing.phone).trim(),
    whatsapp: (req.body.whatsapp || '').trim(),
    email: (req.body.email || existing.email).trim().toLowerCase(),
    location: (req.body.location || '').trim(),
    website: (req.body.website || '').trim(),
    promotionType: req.body.promotionType || existing.promotionType,
    productName: (req.body.productName || existing.productName).trim(),
    category: req.body.category || existing.category,
    subcategory: (req.body.subcategory || '').trim(),
    shortDescription: (req.body.shortDescription || '').trim(),
    fullDescription: (req.body.fullDescription || existing.fullDescription).trim(),
    price: Number(req.body.price) || 0,
    originalPrice: Number(req.body.originalPrice) || 0,
    discount: (req.body.discount || '').trim(),
    currency: req.body.currency || 'KSh',
    productLink: (req.body.productLink || '').trim(),
    whatsappLink: (req.body.whatsappLink || '').trim(),
    phoneLink: (req.body.phoneLink || '').trim(),
    package: req.body.adPackage || existing.package,
    startDate: req.body.startDate ? new Date(req.body.startDate).toISOString() : existing.startDate,
    endDate: req.body.endDate ? new Date(req.body.endDate).toISOString() : existing.endDate,
    featured: req.body.adPackage === 'Featured Listing' || req.body.adPackage === 'Premium Listing',
    updatedAt: now_()
  };
  if (logoFile) updates.logo = `/public/uploads/${logoFile.filename}`;
  if (imageFiles.length) updates.images = [...existing.images, ...imageFiles.map(f => `/public/uploads/${f.filename}`)];

  db.get('adSubmissions').find({ id }).assign(updates).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.update', `Updated ad submission "${existing.productName}"`, req.ip);
  req.flash('success', 'Submission updated.');
  res.redirect('/admin/ad-submissions');
}));

admin.post('/ad-submissions/:id/approve', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const submission = db.get('adSubmissions').find({ id }).value();
  if (!submission) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  db.get('adSubmissions').find({ id }).assign({ status: 'approved', updatedAt: now_() }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.approve', `Approved ad "${submission.productName}"`, req.ip);
  req.flash('success', 'Ad submission approved.');
  res.redirect('/admin/ad-submissions');
});

admin.post('/ad-submissions/:id/reject', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const submission = db.get('adSubmissions').find({ id }).value();
  if (!submission) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  db.get('adSubmissions').find({ id }).assign({ status: 'rejected', updatedAt: now_() }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.reject', `Rejected ad "${submission.productName}"`, req.ip);
  req.flash('success', 'Ad submission rejected.');
  res.redirect('/admin/ad-submissions');
});

admin.post('/ad-submissions/:id/activate', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const submission = db.get('adSubmissions').find({ id }).value();
  if (!submission) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  if (submission.paymentStatus !== 'paid') {
    req.flash('error', 'Cannot activate unpaid submission.');
    return res.redirect('/admin/ad-submissions');
  }
  db.get('adSubmissions').find({ id }).assign({ status: 'active', updatedAt: now_() }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.activate', `Activated ad "${submission.productName}"`, req.ip);
  req.flash('success', 'Ad submission activated.');
  res.redirect('/admin/ad-submissions');
});

admin.post('/ad-submissions/:id/mark-paid', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const submission = db.get('adSubmissions').find({ id }).value();
  if (!submission) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  if (submission.paymentStatus === 'paid') {
    req.flash('info', 'Payment is already marked as paid.');
    return res.redirect('/admin/ad-submissions');
  }
  const updates = { paymentStatus: 'paid', updatedAt: now_() };
  if (submission.status === 'approved') {
    updates.status = 'active';
  }
  db.get('adSubmissions').find({ id }).assign(updates).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.mark_paid', `Manually marked ad "${submission.productName}" as paid`, req.ip);
  req.flash('success', submission.status === 'approved' ? 'Payment marked as paid and ad activated.' : 'Payment marked as paid.');
  res.redirect('/admin/ad-submissions');
});

admin.post('/ad-submissions/:id/pause', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const submission = db.get('adSubmissions').find({ id }).value();
  if (!submission) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  db.get('adSubmissions').find({ id }).assign({ status: 'paused', updatedAt: now_() }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.pause', `Paused ad "${submission.productName}"`, req.ip);
  req.flash('success', 'Ad submission paused.');
  res.redirect('/admin/ad-submissions');
});

admin.post('/ad-submissions/:id/expire', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const submission = db.get('adSubmissions').find({ id }).value();
  if (!submission) {
    req.flash('error', 'Submission not found.');
    return res.redirect('/admin/ad-submissions');
  }
  db.get('adSubmissions').find({ id }).assign({ status: 'expired', updatedAt: now_() }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.expire', `Manually expired ad "${submission.productName}"`, req.ip);
  req.flash('success', 'Ad submission expired.');
  res.redirect('/admin/ad-submissions');
});

admin.get('/ad-submissions/export', requirePermission('*'), (req, res) => {
  const submissions = db.get('adSubmissions').value();
  const rows = submissions.map(s => ({
    id: s.id,
    businessName: s.businessName,
    productName: s.productName,
    category: s.category,
    package: s.package,
    status: s.status,
    paymentStatus: s.paymentStatus,
    price: s.price,
    startDate: s.startDate || '',
    endDate: s.endDate || '',
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : ''
  }));
  sendCsv(res, 'ad-submissions.csv', rows, ['id','businessName','productName','category','package','status','paymentStatus','price','startDate','endDate','createdAt']);
});

// ---- Ad Categories (public form) ----
admin.get('/ad-categories', requirePermission('*'), (req, res) => {
  const categories = [...db.get('adCategories').value()].sort((a, b) => (a.order || 0) - (b.order || 0));
  res.render('admin/ad-categories', { title: 'Ad Categories — Kenya ni Home CMS', categories });
});

admin.post('/ad-categories', requirePermission('*'), (req, res) => {
  const { name, slug, icon, order } = req.body;
  const trimName = (name || '').trim();
  if (!trimName) {
    req.flash('error', 'Category name required.');
    return res.redirect('/admin/ad-categories');
  }
  const id = db.get('meta.nextAdCategoryId').value();
  const catSlug = (slug || '').trim() ? slugify(slug, { lower: true, strict: true }) : slugify(trimName, { lower: true, strict: true });
  db.get('adCategories').push({
    id,
    name: trimName,
    slug: catSlug,
    icon: (icon || '').trim() || '📦',
    order: Number(order) || 0,
    active: true
  }).write();
  db.set('meta.nextAdCategoryId', id + 1).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.category.create', `Created ad category "${trimName}"`, req.ip);
  req.flash('success', 'Ad category added.');
  res.redirect('/admin/ad-categories');
});

admin.put('/ad-categories/:id', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const cat = db.get('adCategories').find({ id }).value();
  if (!cat) {
    req.flash('error', 'Category not found.');
    return res.redirect('/admin/ad-categories');
  }
  const { name, slug, icon, order, active } = req.body;
  const trimName = (name || '').trim();
  if (!trimName) {
    req.flash('error', 'Category name required.');
    return res.redirect('/admin/ad-categories');
  }
  const catSlug = (slug || '').trim() ? slugify(slug, { lower: true, strict: true }) : slugify(trimName, { lower: true, strict: true });
  db.get('adCategories').find({ id }).assign({
    name: trimName,
    slug: catSlug,
    icon: (icon || '').trim() || cat.icon,
    order: Number(order) || 0,
    active: active === 'on' || active === 'true'
  }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.category.update', `Updated ad category "${trimName}"`, req.ip);
  req.flash('success', 'Ad category updated.');
  res.redirect('/admin/ad-categories');
});

admin.delete('/ad-categories/:id', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  db.get('adCategories').remove({ id }).write();
  db.get('adSubcategories').filter({ categoryId: id }).remove().write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.category.delete', `Deleted ad category`, req.ip);
  req.flash('success', 'Ad category removed.');
  res.redirect('/admin/ad-categories');
});

admin.post('/ad-categories/reorder', requirePermission('*'), (req, res) => {
  const order = req.body.order;
  if (Array.isArray(order)) {
    order.forEach((item) => {
      if (item.id) {
        db.get('adCategories').find({ id: Number(item.id) }).assign({ order: Number(item.order) || 0 }).write();
      }
    });
  }
  res.json({ ok: true });
});

admin.get('/ad-categories/new', requirePermission('*'), (req, res) => {
  res.render('admin/ad-category-form', { title: 'New Ad Category — Kenya ni Home CMS', category: null });
});

admin.get('/ad-categories/:id/edit', requirePermission('*'), (req, res) => {
  const category = db.get('adCategories').find({ id: Number(req.params.id) }).value();
  if (!category) {
    req.flash('error', 'Ad category not found.');
    return res.redirect('/admin/ad-categories');
  }
  res.render('admin/ad-category-form', { title: `Edit — ${category.name}`, category });
});

// ---- Ad Subcategories ----
admin.get('/ad-subcategories', requirePermission('*'), (req, res) => {
  const categories = [...db.get('adCategories').value()].sort((a, b) => (a.order || 0) - (b.order || 0));
  const subcategories = [...db.get('adSubcategories').value()].sort((a, b) => (a.order || 0) - (b.order || 0));
  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c; });
  res.render('admin/ad-subcategories', { title: 'Ad Subcategories — Kenya ni Home CMS', categories, subcategories, catMap });
});

admin.post('/ad-subcategories', requirePermission('*'), (req, res) => {
  const { name, slug, categoryId, order } = req.body;
  const trimName = (name || '').trim();
  if (!trimName || !categoryId) {
    req.flash('error', 'Subcategory name and parent category are required.');
    return res.redirect('/admin/ad-subcategories');
  }
  const id = db.get('meta.nextAdSubcategoryId').value();
  const subSlug = (slug || '').trim() ? slugify(slug, { lower: true, strict: true }) : slugify(trimName, { lower: true, strict: true });
  db.get('adSubcategories').push({
    id,
    categoryId: Number(categoryId),
    name: trimName,
    slug: subSlug,
    order: Number(order) || 0
  }).write();
  db.set('meta.nextAdSubcategoryId', id + 1).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.subcategory.create', `Created ad subcategory "${trimName}"`, req.ip);
  req.flash('success', 'Ad subcategory added.');
  res.redirect('/admin/ad-subcategories');
});

admin.put('/ad-subcategories/:id', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const sub = db.get('adSubcategories').find({ id }).value();
  if (!sub) {
    req.flash('error', 'Subcategory not found.');
    return res.redirect('/admin/ad-subcategories');
  }
  const { name, slug, categoryId, order } = req.body;
  const trimName = (name || '').trim();
  if (!trimName || !categoryId) {
    req.flash('error', 'Subcategory name and parent category are required.');
    return res.redirect('/admin/ad-subcategories');
  }
  const subSlug = (slug || '').trim() ? slugify(slug, { lower: true, strict: true }) : slugify(trimName, { lower: true, strict: true });
  db.get('adSubcategories').find({ id }).assign({
    categoryId: Number(categoryId),
    name: trimName,
    slug: subSlug,
    order: Number(order) || 0
  }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.subcategory.update', `Updated ad subcategory "${trimName}"`, req.ip);
  req.flash('success', 'Ad subcategory updated.');
  res.redirect('/admin/ad-subcategories');
});

admin.delete('/ad-subcategories/:id', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  db.get('adSubcategories').remove({ id }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'ad.subcategory.delete', `Deleted ad subcategory`, req.ip);
  req.flash('success', 'Ad subcategory removed.');
  res.redirect('/admin/ad-subcategories');
});

admin.post('/ad-subcategories/reorder', requirePermission('*'), (req, res) => {
  const order = req.body.order;
  if (Array.isArray(order)) {
    order.forEach((item) => {
      if (item.id) {
        db.get('adSubcategories').find({ id: Number(item.id) }).assign({ order: Number(item.order) || 0 }).write();
      }
    });
  }
  res.json({ ok: true });
});

admin.get('/ad-subcategories/new', requirePermission('*'), (req, res) => {
  const categories = [...db.get('adCategories').value()].sort((a, b) => (a.order || 0) - (b.order || 0));
  res.render('admin/ad-subcategory-form', { title: 'New Ad Subcategory — Kenya ni Home CMS', subcategory: null, categories });
});

admin.get('/ad-subcategories/:id/edit', requirePermission('*'), (req, res) => {
  const subcategory = db.get('adSubcategories').find({ id: Number(req.params.id) }).value();
  if (!subcategory) {
    req.flash('error', 'Ad subcategory not found.');
    return res.redirect('/admin/ad-subcategories');
  }
  const categories = [...db.get('adCategories').value()].sort((a, b) => (a.order || 0) - (b.order || 0));
  res.render('admin/ad-subcategory-form', { title: `Edit — ${subcategory.name}`, subcategory, categories });
});

// ---- Newsletter Subscribers ----
admin.get('/subscribers', requirePermission('subscribers:read'), (req, res) => {
  const subscribers = [...db.get('subscribers').value()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('admin/subscribers', { title: 'Subscribers — Kenya ni Home CMS', subscribers });
});

admin.delete('/subscribers/:id', requirePermission('subscribers:read'), (req, res) => {
  db.get('subscribers').remove({ id: Number(req.params.id) }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'subscriber.delete', `Removed subscriber`, req.ip);
  req.flash('success', 'Subscriber removed.');
  res.redirect('/admin/subscribers');
});

// ---- Error Log ----
admin.get('/logs', requirePermission('*'), (req, res) => {
  const errors = [...db.get('errors').value()].reverse();
  res.render('admin/logs', { title: 'Error Log — Kenya ni Home CMS', errors });
});

admin.post('/logs/clear', requirePermission('*'), (req, res) => {
  db.set('errors', []).write();
  logActivity(req.session.user ? req.session.user.id : null, 'logs.clear', `Cleared error logs`, req.ip);
  req.flash('success', 'Log cleared.');
  res.redirect('/admin/logs');
});

// ---- Settings ----
admin.get('/settings', requirePermission('*'), (req, res) => {
  const subscribers = db.get('subscribers').value();
  res.render('admin/settings', { title: 'Settings — Kenya ni Home CMS', activeTab: 'general', subscribers });
});

admin.get('/settings/advertising', requirePermission('*'), (req, res) => {
  const subscribers = db.get('subscribers').value();
  res.render('admin/settings', { title: 'Advertising — Kenya ni Home CMS', activeTab: 'advertising', subscribers });
});

admin.get('/settings/integrations', requirePermission('*'), (req, res) => {
  const subscribers = db.get('subscribers').value();
  res.render('admin/settings', { title: 'Integrations — Kenya ni Home CMS', activeTab: 'integrations', subscribers });
});

admin.post('/settings', requirePermission('*'), upload.fields([{ name: 'logoFile', maxCount: 1 }, { name: 'aboutImageFile', maxCount: 1 }]), (req, res) => {
   const {
     siteName, tagline, heroKicker, aboutTitle, aboutBody, email, phone, address,
     twitter, facebook, instagram, linkedin, footerNote, siteUrl: siteUrlField,
     paywallEnabled, freeArticleLimit, paywallAmount, privacyPolicy, termsOfService, cookieConsentText,
     cookiePolicy, disclaimer, editorialPolicy, correctionsPolicy, ownershipDisclosure,
     aboutStat1, aboutStat1Label, aboutStat2, aboutStat2Label, aboutStat3, aboutStat3Label,
     team, breakingEnabled, breakingMaxItems, breakingScrollDuration
   } = req.body;
  let logo = db.get('settings.logo').value();
  let aboutImage = db.get('settings.aboutImage').value();
  if (req.files && req.files.logoFile && req.files.logoFile[0]) {
    logo = `/public/uploads/${req.files.logoFile[0].filename}`;
    optimizeImage(req.files.logoFile[0].path);
  }
  if (req.files && req.files.aboutImageFile && req.files.aboutImageFile[0]) {
    aboutImage = `/public/uploads/${req.files.aboutImageFile[0].filename}`;
    optimizeImage(req.files.aboutImageFile[0].path);
  }
  let teamData = [];
  try { teamData = JSON.parse(team || '[]'); } catch (e) { teamData = []; }
  const currentSettings = db.get('settings').value();
  const integrations = currentSettings.integrations || {};
  const mpesa = integrations.mpesa || {};
  db.set('settings', {
    ...currentSettings,
    siteName, tagline, heroKicker, aboutTitle, aboutBody, email, phone, address,
    social: { twitter, facebook, instagram, linkedin },
    footerNote,
    siteUrl: siteUrlField,
    logo,
    aboutImage,
    aboutStat1, aboutStat1Label, aboutStat2, aboutStat2Label, aboutStat3, aboutStat3Label,
    team: JSON.stringify(teamData),
    paywallEnabled: paywallEnabled === 'on',
    freeArticleLimit: Number(freeArticleLimit) || 3,
    breakingEnabled: breakingEnabled !== 'off',
    breakingMaxItems: Number(breakingMaxItems) || 5,
    breakingScrollDuration: Number(breakingScrollDuration) || 25,
     privacyPolicy,
     termsOfService,
     cookieConsentText,
     cookiePolicy: (cookiePolicy || '').trim(),
     disclaimer: (disclaimer || '').trim(),
     editorialPolicy: (editorialPolicy || '').trim(),
     correctionsPolicy: (correctionsPolicy || '').trim(),
     ownershipDisclosure: (ownershipDisclosure || '').trim(),
     integrations: {
      ...integrations,
      mpesa: {
        ...mpesa,
        amount: (paywallAmount || '').trim()
      }
    }
  }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'settings.update', `Updated general settings`, req.ip);
  req.flash('success', 'Settings saved.');
  res.redirect('/admin/settings');
});

admin.post('/settings/advertising', requirePermission('*'), upload.single('marketplaceLogoFile'), (req, res) => {
  const {
    adHeroTitle, adHeroSubtitle, adContactPhone, adContactEmail, adSupportHours,
    adPackages, adWhyAdvertise, adBenefits
  } = req.body;
  let packages = [];
  let whyAdvertise = [];
  let benefits = [];
  try { packages = JSON.parse(adPackages || '[]'); } catch (e) { packages = []; }
  try { whyAdvertise = JSON.parse(adWhyAdvertise || '[]'); } catch (e) { whyAdvertise = []; }
  try { benefits = JSON.parse(adBenefits || '[]'); } catch (e) { benefits = []; }
  const currentSettings = db.get('settings').value();
  let marketplaceLogo = (currentSettings.advertising && currentSettings.advertising.marketplaceLogo) || '';
  if (req.file) {
    optimizeImage(req.file.path);
    marketplaceLogo = `/public/uploads/${req.file.filename}`;
  }
  db.set('settings', {
    ...currentSettings,
    advertising: {
      contactPhone: (adContactPhone || '').trim(),
      contactEmail: (adContactEmail || '').trim(),
      supportHours: (adSupportHours || '').trim(),
      heroTitle: (adHeroTitle || '').trim(),
      heroSubtitle: (adHeroSubtitle || '').trim(),
      marketplaceLogo,
      packages,
      whyAdvertise,
      benefits
    }
  }).write();
  clearCache();
  logActivity(req.session.user ? req.session.user.id : null, 'settings.advertising', `Updated advertising settings`, req.ip);
  req.flash('success', 'Advertising settings saved.');
  res.redirect('/admin/settings/advertising');
});

admin.post('/settings/password', (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const user = db.get('users').find({ id: req.session.user.id }).value();
  if (!bcrypt.compareSync(currentPassword || '', user.passwordHash)) {
    req.flash('error', 'Current password is incorrect.');
    return res.redirect('/admin/settings');
  }
  if (!newPassword || newPassword.length < 8) {
    req.flash('error', 'New password must be at least 8 characters.');
    return res.redirect('/admin/settings');
  }
  if (newPassword !== confirmPassword) {
    req.flash('error', 'New passwords do not match.');
    return res.redirect('/admin/settings');
  }
  db.get('users').find({ id: user.id }).assign({ passwordHash: bcrypt.hashSync(newPassword, 10) }).write();
  logActivity(req.session.user.id, 'settings.password', 'Changed password', req.ip);
  req.flash('success', 'Password updated.');
  res.redirect('/admin/settings');
});

// ---- Integrations ----
admin.get('/settings/integrations', requirePermission('*'), (req, res) => {
  const subscribers = db.get('subscribers').value();
  res.render('admin/settings', { title: 'Integrations — Kenya ni Home CMS', activeTab: 'integrations', subscribers });
});

admin.post('/settings/integrations', requirePermission('*'), (req, res) => {
  const {
    smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, emailFrom, emailFromName, emailProvider,
    smsProvider, smsKey, smsSecret, smsFrom, smsEndpoint,
    mpesaEnvironment, mpesaShortcode, mpesaPasskey, mpesaConsumerKey, mpesaConsumerSecret, mpesaCallbackUrl, mpesaAccountReference, mpesaAmount
  } = req.body;
  const current = db.get('settings').value();
  db.set('settings', {
    ...current,
    integrations: {
      email: {
        provider: (emailProvider || 'custom').trim(),
        smtpHost: (smtpHost || '').trim(),
        smtpPort: (smtpPort || '').trim(),
        smtpSecure: (smtpSecure || 'tls').trim(),
        smtpUser: (smtpUser || '').trim(),
        smtpPass: (smtpPass || '').trim(),
        from: (emailFrom || '').trim(),
        fromName: (emailFromName || '').trim()
      },
      sms: {
        provider: (smsProvider || 'twilio').trim(),
        key: (smsKey || '').trim(),
        secret: (smsSecret || '').trim(),
        from: (smsFrom || '').trim(),
        endpoint: (smsEndpoint || '').trim()
      },
      mpesa: {
        environment: (mpesaEnvironment || 'sandbox').trim(),
        shortcode: (mpesaShortcode || '').trim(),
        passkey: (mpesaPasskey || '').trim(),
        consumerKey: (mpesaConsumerKey || '').trim(),
        consumerSecret: (mpesaConsumerSecret || '').trim(),
        callbackUrl: (mpesaCallbackUrl || '').trim(),
        accountReference: (mpesaAccountReference || '').trim(),
        amount: (mpesaAmount || '').trim() || current.integrations && current.integrations.mpesa && current.integrations.mpesa.amount || ''
      }
    }
  }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'settings.integrations', `Updated integration settings`, req.ip);
  req.flash('success', 'Integration settings saved.');
  res.redirect('/admin/settings/integrations');
});

admin.post('/settings/integrations/test', requirePermission('*'), asyncHandler(async (req, res) => {
  const { testEmail, testSms, testMpesa, testRecipient } = req.body;
  const settings = db.get('settings').value();
  const integrations = settings.integrations || {};
  let results = [];

  try {
    if (testEmail === 'on' && integrations.email) {
      const emailConfig = integrations.email;
      if (!emailConfig.smtpHost || !emailConfig.smtpUser || !emailConfig.smtpPass) {
        throw new Error('SMTP configuration is incomplete. Please save your email settings first.');
      }
      const recipient = testRecipient || emailConfig.from || emailConfig.smtpUser;
      await sendEmail({
        ...emailConfig,
        to: recipient,
        subject: 'Test Email from Kenya ni Home',
        text: 'This is a test email to verify your SMTP integration is working.',
        html: '<p>This is a test email to verify your SMTP integration is working.</p>'
      });
      results.push('Email test sent successfully.');
    }

    if (testSms === 'on' && integrations.sms) {
      const smsConfig = integrations.sms;
      if (!smsConfig.key || !smsConfig.secret) {
        throw new Error('SMS credentials are incomplete. Please save your SMS settings first.');
      }
      const recipient = testRecipient || smsConfig.from;
      if (!recipient) {
        throw new Error('Please provide a test recipient phone number or sender ID.');
      }
      await sendSms({
        ...smsConfig,
        to: recipient,
        message: 'Test SMS from Kenya ni Home: your SMS integration is working.'
      });
      results.push('SMS test sent successfully.');
    }

    if (testMpesa === 'on' && integrations.mpesa) {
      const mpesaConfig = integrations.mpesa;
      if (!mpesaConfig.shortcode || !mpesaConfig.passkey || !mpesaConfig.consumerKey || !mpesaConfig.consumerSecret) {
        throw new Error('M-Pesa configuration is incomplete. Please save your M-Pesa settings first.');
      }
      const phoneNumber = testRecipient || '';
      if (!phoneNumber) {
        throw new Error('Please provide a test phone number (in international format, e.g. 2547XXXXXXXX).');
      }
      const stkResult = await initiateMpesaStkPush({
        ...mpesaConfig,
        phoneNumber,
        amount: mpesaConfig.amount || 1,
        accountReference: mpesaConfig.accountReference || 'Kenya ni Home',
        transactionDesc: 'Test M-Pesa STK Push from Kenya ni Home CMS'
      });
      results.push('M-Pesa STK Push initiated successfully. Check your phone to complete the transaction.');
    }

    if (results.length === 0) {
      req.flash('error', 'Please select at least one test type (Email, SMS, or M-Pesa) and ensure the settings are saved.');
    } else {
      req.flash('success', results.join(' '));
    }
    logActivity(req.session.user ? req.session.user.id : null, 'settings.integrations', 'Tested integrations', req.ip);
  } catch (err) {
    req.flash('error', 'Test failed: ' + err.message);
    logActivity(req.session.user ? req.session.user.id : null, 'settings.integrations', 'Integration test failed: ' + err.message, req.ip);
  }

  res.redirect('/admin/settings/integrations');
}));

admin.post('/settings/integrations/broadcast', requirePermission('*'), asyncHandler(async (req, res) => {
  const { broadcastSubject, broadcastMessage, broadcastChannel } = req.body;
  const settings = db.get('settings').value();
  const integrations = settings.integrations || {};
  const subscribers = db.get('subscribers').value();

  if (!subscribers.length) {
    req.flash('error', 'No subscribers to send to.');
    return res.redirect('/admin/settings/integrations');
  }

  if (!broadcastSubject || !broadcastMessage) {
    req.flash('error', 'Subject and message are required.');
    return res.redirect('/admin/settings/integrations');
  }

  let sentCount = 0;
  let failCount = 0;
  let failDetails = [];

  if (broadcastChannel === 'email' || broadcastChannel === 'both') {
    if (!integrations.email || !integrations.email.smtpHost || !integrations.email.smtpUser || !integrations.email.smtpPass) {
      req.flash('error', 'Email integration is not configured. Please save your SMTP settings first.');
      return res.redirect('/admin/settings/integrations');
    }

    for (const sub of subscribers) {
      try {
        await sendEmail({
          ...integrations.email,
          to: sub.email,
          subject: broadcastSubject,
          text: broadcastMessage,
          html: broadcastMessage.replace(/\n/g, '<br>')
        });
        sentCount++;
      } catch (err) {
        failCount++;
        if (failDetails.length < 5) failDetails.push(sub.email + ': ' + err.message);
      }
    }
  }

  if (broadcastChannel === 'sms' || broadcastChannel === 'both') {
    if (!integrations.sms || !integrations.sms.key || !integrations.sms.secret) {
      req.flash('error', 'SMS integration is not configured. Please save your SMS settings first.');
      return res.redirect('/admin/settings/integrations');
    }

    const smsSubs = subscribers.filter((s) => s.phone);
    if (smsSubs.length === 0) {
      req.flash('error', 'No subscribers with phone numbers found. The newsletter form needs a phone field for SMS broadcasts.');
      return res.redirect('/admin/settings/integrations');
    }

    for (const sub of smsSubs) {
      try {
        await sendSms({
          ...integrations.sms,
          to: sub.phone,
          message: broadcastMessage
        });
        sentCount++;
      } catch (err) {
        failCount++;
        if (failDetails.length < 5) failDetails.push(sub.phone + ': ' + err.message);
      }
    }
  }

  const parts = [`Broadcast complete. Sent: ${sentCount}, Failed: ${failCount}.`];
  if (failDetails.length) parts.push('Errors: ' + failDetails.join('; '));
  const msg = parts.join(' ');
  req.flash(sentCount > 0 ? 'success' : 'error', msg);
  logActivity(req.session.user ? req.session.user.id : null, 'settings.broadcast', 'Broadcast sent: ' + sentCount + ' sent, ' + failCount + ' failed', req.ip);
  res.redirect('/admin/settings/integrations');
}));

// ---- MPESA Paywall Payment ----
app.post('/paywall/unlock', asyncHandler(async (req, res) => {
  const { phoneNumber, slug } = req.body;
  const settings = db.get('settings').value();
  const mpesa = (settings.integrations && settings.integrations.mpesa) || {};

  if (!mpesa.shortcode || !mpesa.passkey || !mpesa.consumerKey || !mpesa.consumerSecret) {
    return res.status(400).json({ ok: false, message: 'M-Pesa integration is not configured. Please contact the site administrator.' });
  }
  if (!phoneNumber) {
    return res.status(400).json({ ok: false, message: 'Phone number is required.' });
  }

  const post = db.get('posts').find({ slug, status: 'published', deletedAt: null }).value();
  if (!post) {
    return res.status(404).json({ ok: false, message: 'Post not found.' });
  }

  const amount = Number(mpesa.amount) || 50;
  const callbackUrl = (mpesa.callbackUrl || '').trim() || (siteUrl(req) + '/mpesa/callback');

  try {
    const result = await initiateMpesaStkPush({
      environment: mpesa.environment || 'sandbox',
      shortcode: mpesa.shortcode,
      passkey: mpesa.passkey,
      consumerKey: mpesa.consumerKey,
      consumerSecret: mpesa.consumerSecret,
      amount,
      phoneNumber,
      callbackUrl,
      accountReference: mpesa.accountReference || 'KenyaNiHome',
      transactionDesc: 'Paywall unlock: ' + post.title
    });

    const requestId = result.CheckoutRequestID || result.requestId || result.checkoutRequestId || Date.now().toString();
    const meta = db.get('meta').value();
    meta.nextPaymentId = (meta.nextPaymentId || 1) + 1;
    db.set('meta', meta).write();

    db.get('payments').push({
      id: meta.nextPaymentId,
      requestId,
      slug,
      phoneNumber,
      amount,
      status: 'pending',
      createdAt: now_(),
      updatedAt: now_()
    }).write();

    res.json({ ok: true, message: 'STK Push sent. Complete the payment on your phone to unlock the article.', requestId, amount });
  } catch (err) {
    console.error('MPESA STK Push failed:', err.message);
    if (err.response) {
      res.status(502).json({ ok: false, message: 'M-Pesa provider error: ' + (err.response.data ? JSON.stringify(err.response.data) : err.message) });
    } else {
      res.status(502).json({ ok: false, message: err.message });
    }
  }
}));

// ---- MPESA Callback (public — called by Safaricom/Daraja) ----
app.post('/mpesa/callback', express.json(), express.raw({ type: 'application/json', verify: (req, res, buf) => { try { req.rawBody = JSON.parse(buf.toString()); } catch (e) { req.rawBody = {}; } } }), (req, res) => {
  const body = req.body;
  let checkoutId = '';
  let resultCode = 1;
  let resultDesc = 'Payment not completed';
  let callback = {};

  if (body && body.body && body.body.stkCallback) {
    callback = body.body.stkCallback;
    checkoutId = callback.CheckoutRequestID || '';
    resultCode = callback.ResultCode || 1;
    resultDesc = callback.ResultDesc || '';
  } else if (body && body.CheckoutRequestID) {
    callback = body;
    checkoutId = body.CheckoutRequestID || '';
    resultCode = body.ResultCode || 1;
    resultDesc = body.ResultDesc || '';
  }

  if (checkoutId && db.get('payments').find({ requestId: checkoutId }).value()) {
    if (resultCode === 0) {
      db.get('payments').find({ requestId: checkoutId }).assign({ status: 'success', reason: '', updatedAt: now_() }).write();
    } else {
      db.get('payments').find({ requestId: checkoutId }).assign({ status: 'failed', reason: resultDesc, updatedAt: now_() }).write();
    }
  }

  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// ---- Check payment status (polled by frontend) ----
app.get('/paywall/status/:requestId', asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const payment = db.get('payments').find({ requestId: requestId }).value();
  if (!payment) {
    return res.status(404).json({ ok: false, message: 'Payment not found.' });
  }
  res.json({ ok: true, status: payment.status, slug: payment.slug, amount: payment.amount });
}));

// ---- Export helpers ----
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function sendCsv(res, filename, rows, headers) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  const csv = [headers.map(csvEscape).join(',')];
  rows.forEach(r => csv.push(headers.map(h => csvEscape(r[h])).join(',')));
  res.send(csv.join('\n'));
}

admin.get('/posts/export', requirePermission('posts:read'), (req, res) => {
  const posts = db.get('posts').filter({ deletedAt: null }).value();
  const rows = posts.map(p => ({
    id: p.id, title: p.title, slug: p.slug, status: p.status, category: p.category,
    author: p.author, views: p.views || 0, shares: p.shares || 0,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : '', updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : ''
  }));
  sendCsv(res, 'posts.csv', rows, ['id','title','slug','status','category','author','views','shares','createdAt','updatedAt']);
});

admin.get('/messages/export', requirePermission('messages:read'), (req, res) => {
  const messages = db.get('messages').value();
  const rows = messages.map(m => ({
    id: m.id, name: m.name, email: m.email, subject: m.subject || '', message: m.message, read: m.read ? 'yes' : 'no',
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : ''
  }));
  sendCsv(res, 'messages.csv', rows, ['id','name','email','subject','message','read','createdAt']);
});

admin.get('/subscribers/export', requirePermission('subscribers:read'), (req, res) => {
  const subscribers = db.get('subscribers').value();
  const rows = subscribers.map(s => ({
    id: s.id, email: s.email,
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : ''
  }));
  sendCsv(res, 'subscribers.csv', rows, ['id','email','createdAt']);
});

admin.get('/comments/export', requirePermission('comments:approve'), (req, res) => {
  const comments = db.get('comments').value();
  const rows = comments.map(c => ({
    id: c.id, name: c.name, email: c.email || '', body: c.body, approved: c.approved ? 'yes' : 'no',
    postId: c.postId, createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : ''
  }));
  sendCsv(res, 'comments.csv', rows, ['id','name','email','body','approved','postId','createdAt']);
});

admin.get('/ads/export', requirePermission('*'), (req, res) => {
  const ads = db.get('ads').value();
  const rows = ads.map(a => ({
    id: a.id, title: a.title, placement: a.placement, active: a.active ? 'yes' : 'no',
    clicks: a.clicks || 0, link: a.link || '', createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : ''
  }));
  sendCsv(res, 'ads.csv', rows, ['id','title','placement','active','clicks','link','createdAt']);
});

// ---- Users ----
admin.get('/users', requirePermission('*'), (req, res) => {
  const users = [...db.get('users').value()].sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  res.render('admin/users', { title: 'Users — Kenya ni Home CMS', users });
});

admin.get('/users/new', requirePermission('*'), (req, res) => {
  res.render('admin/user-form', { title: 'New User — Kenya ni Home CMS', user: null });
});

admin.post('/users', requirePermission('*'), (req, res) => {
  const { username, email, password, role, status } = req.body;
  const trimUser = (username || '').trim();
  const trimEmail = (email || '').trim().toLowerCase();
  if (!trimUser || !trimEmail || !password) {
    req.flash('error', 'Username, email and password are required.');
    return res.redirect('/admin/users/new');
  }
  const existing = db.get('users').find({ $or: [{ username: trimUser }, { email: trimEmail }] }).value();
  if (existing) {
    req.flash('error', 'Username or email already exists.');
    return res.redirect('/admin/users/new');
  }
  const id = db.get('meta.nextUserId').value();
  db.get('users').push({
    id,
    username: trimUser,
    email: trimEmail,
    passwordHash: bcrypt.hashSync(password, 10),
    role: ['admin', 'editor', 'author', 'viewer'].includes(role) ? role : 'viewer',
    status: status === 'inactive' ? 'inactive' : status === 'pending' ? 'pending' : 'active',
    createdAt: now_(),
    lastLoginAt: null
  }).write();
  db.set('meta.nextUserId', id + 1).write();
  logActivity(req.session.user ? req.session.user.id : null, 'user.create', `Created user ${trimUser} (${role || 'viewer'})`, req.ip);
  createNotification(null, 'user.created', `New user <b>${trimUser}</b> was created.`, '/admin/users');
  req.flash('success', 'User created.');
  res.redirect('/admin/users');
});

admin.get('/users/:id/edit', requirePermission('*'), (req, res) => {
  const user = db.get('users').find({ id: Number(req.params.id) }).value();
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }
  res.render('admin/user-form', { title: `Edit — ${user.username}`, user });
});

admin.put('/users/:id', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.get('users').find({ id }).value();
  if (!existing) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }
  const { username, email, password, role, status } = req.body;
  const trimUser = (username || '').trim();
  const trimEmail = (email || '').trim().toLowerCase();
  if (!trimUser || !trimEmail) {
    req.flash('error', 'Username and email are required.');
    return res.redirect(`/admin/users/${id}/edit`);
  }
  const duplicate = db.get('users').find((u) => u.id !== id && (u.username === trimUser || u.email === trimEmail)).value();
  if (duplicate) {
    req.flash('error', 'Username or email already taken.');
    return res.redirect(`/admin/users/${id}/edit`);
  }
  const updates = {
    username: trimUser,
    email: trimEmail,
    role: ['admin', 'editor', 'author', 'viewer'].includes(role) ? role : existing.role,
    status: status === 'inactive' ? 'inactive' : status === 'pending' ? 'pending' : 'active'
  };
  if (password && password.trim()) {
    updates.passwordHash = bcrypt.hashSync(password.trim(), 10);
  }
  db.get('users').find({ id }).assign(updates).write();
  logActivity(req.session.user ? req.session.user.id : null, 'user.update', `Updated user ${trimUser}`, req.ip);
  req.flash('success', 'User updated.');
  res.redirect('/admin/users');
});

admin.delete('/users/:id', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const user = db.get('users').find({ id }).value();
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }
  if (user.id === req.session.user.id) {
    req.flash('error', 'You cannot delete your own account.');
    return res.redirect('/admin/users');
  }
  db.get('users').remove({ id }).write();
  logActivity(req.session.user ? req.session.user.id : null, 'user.delete', `Deleted user ${user.username}`, req.ip);
  req.flash('success', 'User deleted.');
  res.redirect('/admin/users');
});

admin.post('/users/:id/approve', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const user = db.get('users').find({ id }).value();
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }
  db.get('users').find({ id }).assign({ status: 'active' }).write();
  logActivity(req.session.user.id, 'user.approve', `Approved user ${user.username}`, req.ip);
  createNotification(user.id, 'user.approved', 'Your account has been approved. You can now sign in.', '/admin/login');
  req.flash('success', 'User approved.');
  res.redirect('/admin/users');
});

admin.post('/users/:id/reject', requirePermission('*'), (req, res) => {
  const id = Number(req.params.id);
  const user = db.get('users').find({ id }).value();
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }
  db.get('users').remove({ id }).write();
  logActivity(req.session.user.id, 'user.reject', `Rejected user ${user.username}`, req.ip);
  req.flash('success', 'User rejected and removed.');
  res.redirect('/admin/users');
});

// ---- Notifications ----
admin.get('/notifications', (req, res) => {
  const notifications = [...db.get('notifications').value()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('admin/notifications', { title: 'Notifications — Kenya ni Home CMS', notifications });
});

admin.post('/notifications/:id/read', (req, res) => {
  db.get('notifications').find({ id: Number(req.params.id) }).assign({ read: true }).write();
  res.json({ ok: true });
});

admin.post('/notifications/read-all', (req, res) => {
  db.get('notifications').filter({ read: false }).forEach((n) => { n.read = true; }).write();
  res.json({ ok: true });
});

admin.get('/notifications/unread-count', (req, res) => {
  const count = req.session.user ? unreadNotificationCount(req.session.user.id) : 0;
  res.json({ count });
});

admin.delete('/notifications/:id', (req, res) => {
  db.get('notifications').remove({ id: Number(req.params.id) }).write();
  res.redirect('/admin/notifications');
});

admin.post('/notifications/clear', requirePermission('*'), (req, res) => {
  db.set('notifications', []).write();
  logActivity(req.session.user ? req.session.user.id : null, 'notifications.clear', 'Cleared all notifications', req.ip);
  req.flash('success', 'Notifications cleared.');
  res.redirect('/admin/notifications');
});

// ---- Activity Logs ----
admin.get('/activity-logs', requirePermission('*'), (req, res) => {
  const logs = [...db.get('activityLogs').value()].reverse().slice(0, 500);
  const users = db.get('users').value();
  res.render('admin/activity-logs', { title: 'Activity Log — Kenya ni Home CMS', logs, users });
});

admin.post('/activity-logs/clear', requirePermission('*'), (req, res) => {
  db.set('activityLogs', []).write();
  logActivity(req.session.user ? req.session.user.id : null, 'logs.clear', 'Cleared activity logs', req.ip);
  req.flash('success', 'Activity log cleared.');
  res.redirect('/admin/activity-logs');
});

admin.get('/activity-logs/export', requirePermission('*'), (req, res) => {
  const logs = [...db.get('activityLogs').value()].reverse().slice(0, 500);
  const users = db.get('users').value();
  const usersMap = {};
  users.forEach(u => { usersMap[u.id] = u; });
  const rows = logs.map(l => {
    const user = l.userId ? usersMap[l.userId] : null;
    return {
      id: l.id,
      createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : '',
      userId: l.userId || '',
      user: user ? user.username : 'System',
      action: l.action || '',
      module: l.action === 'login' ? 'Auth' : 'Users',
      details: l.details || '',
      ip: l.ip || ''
    };
  });
  sendCsv(res, 'activity-logs.csv', rows, ['id','createdAt','userId','user','action','module','details','ip']);
});

// ---- Dashboard filtering API ----
admin.get('/dashboard/filter', requirePermission('posts:read'), (req, res) => {
  const status = (req.query.status || '').toLowerCase();
  const category = (req.query.category || '').toLowerCase();
  const sort = req.query.sort || 'newest';
  const range = req.query.range || '7d';

  let posts = db.get('posts').filter({ deletedAt: null }).value();
  if (status) posts = posts.filter((p) => p.status === status);
  if (category) posts = posts.filter((p) => p.category === category);

  const now = new Date();
  const ms = range === '30d' ? 30 * 86400000 : 7 * 86400000;
  const cutoff = new Date(now.getTime() - ms);
  posts = posts.filter((p) => new Date(p.createdAt) >= cutoff);

  posts.sort((a, b) => {
    if (sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sort === 'views') return (b.views || 0) - (a.views || 0);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json({ posts: posts.slice(0, 50) });
});

// ---- Public Ad Category API ----
app.get('/api/ad-subcategories', (req, res) => {
  const categoryId = Number(req.query.categoryId);
  if (!categoryId) return res.json([]);
  const subs = db.get('adSubcategories').filter({ categoryId }).sortBy('order').value();
  res.json(subs);
});

app.use('/admin', admin);

// Mount Admin Jobs Routes (mounted on /admin so /admin/jobs works)
app.use('/admin', adminJobsRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not found' });
});

// centralized error handler — logs, then shows a plain, honest error page
app.use((err, req, res, next) => {
  logError(err, req);
  console.error(err);
  res.status(500).send('<h1 style="font-family:sans-serif">Something went wrong</h1><p style="font-family:sans-serif">The error has been logged. <a href="/">Return home</a></p>');
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`\nKenya ni Home is running → http://localhost:${PORT}`);
    console.log(`CMS admin panel      → http://localhost:${PORT}/admin/login`);
    console.log(`Default login        → admin / 0722358492@Ha (change this in Settings)\n`);
    try { writeSitemap(); } catch (e) { console.warn('Sitemap init failed:', e.message); }
  });
}
