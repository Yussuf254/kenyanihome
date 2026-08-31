const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const path = require('path');
const db = require('../db');
const { requireAuth, requireAdmin, requireEmployer, requireEmployee, requireEmployerOrAdmin } = require('../middleware/jobsAuth');

// ==================== HELPERS ====================

function generateSlug(title) {
  return slugify(title, { lower: true, strict: true });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.floor((new Date() - new Date(iso)) / 1000);
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 }
  ];
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
  }
  return 'Just now';
}

function isExpired(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

function siteUrl(req) {
  const configured = (db.get('settings.siteUrl').value() || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('Host')}`;
}

// ==================== PUBLIC ROUTES ====================

// Jobs Homepage
router.get('/', (req, res) => {
  const categories = db.get('jobCategories').filter({ active: true }).sortBy('order').value();
  const jobs = db.get('jobs')
    .filter({ status: 'published' })
    .sortBy('createdAt')
    .value()
    .reverse()
    .filter(j => !isExpired(j.deadline))
    .slice(0, 12);
  
  const featuredJobs = db.get('jobs')
    .filter({ status: 'published', featured: true })
    .sortBy('createdAt')
    .value()
    .reverse()
    .filter(j => !isExpired(j.deadline))
    .slice(0, 6);

  const companies = db.get('companies').filter({ status: 'verified' }).value();

  res.render('jobs/index', {
    title: 'Jobs - Kenya Ni Home',
    categories,
    jobs,
    featuredJobs,
    companies,
    totalJobs: db.get('jobs').filter({ status: 'published' }).value().filter(j => !isExpired(j.deadline)).length,
    totalCompanies: companies.length,
    meta: {
      title: 'Kenya Ni Home Jobs - Find Your Next Opportunity',
      description: 'Discover verified jobs, career opportunities and vacancies from companies and organisations across Kenya.'
    }
  });
});

// Job Detail Page
router.get('/:slug', (req, res) => {
  const job = db.get('jobs').find({ slug: req.params.slug }).value();
  if (!job) {
    return res.status(404).render('jobs/404', { title: 'Job Not Found' });
  }

  const company = db.get('companies').find({ id: job.companyId }).value();
  const relatedJobs = db.get('jobs')
    .filter({ status: 'published', categoryId: job.categoryId, id: { $ne: job.id } })
    .sortBy('createdAt')
    .value()
    .reverse()
    .filter(j => !isExpired(j.deadline))
    .slice(0, 4);

  // Increment views
  db.get('jobs').find({ id: job.id }).assign({ views: (job.views || 0) + 1 }).write();

  res.render('jobs/detail', {
    title: `${job.title} - Kenya Ni Home Jobs`,
    job,
    company,
    relatedJobs,
    isExpired: isExpired(job.deadline),
    meta: {
      title: `${job.title} at ${company?.name || 'Company'} - Kenya Ni Home Jobs`,
      description: job.description?.slice(0, 160) || job.title,
      image: company?.logo || ''
    }
  });
});

// Search Jobs
router.get('/search', (req, res) => {
  const { q, category, location, type } = req.query;
  let jobs = db.get('jobs')
    .filter({ status: 'published' })
    .value()
    .filter(j => !isExpired(j.deadline));

  if (q) {
    const query = q.toLowerCase();
    jobs = jobs.filter(j =>
      j.title?.toLowerCase().includes(query) ||
      j.company?.toLowerCase().includes(query) ||
      j.description?.toLowerCase().includes(query) ||
      j.location?.toLowerCase().includes(query)
    );
  }

  if (category) {
    jobs = jobs.filter(j => j.categorySlug === category);
  }

  if (location) {
    jobs = jobs.filter(j => j.location?.toLowerCase().includes(location.toLowerCase()));
  }

  if (type) {
    jobs = jobs.filter(j => j.employmentType === type);
  }

  jobs = jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const categories = db.get('jobCategories').filter({ active: true }).sortBy('order').value();

  res.render('jobs/search', {
    title: 'Search Jobs - Kenya Ni Home',
    jobs,
    categories,
    query: q || '',
    selectedCategory: category || '',
    selectedLocation: location || '',
    selectedType: type || '',
    meta: {
      title: 'Search Jobs - Kenya Ni Home',
      description: 'Search for jobs across Kenya'
    }
  });
});

// Jobs by Category
router.get('/category/:slug', (req, res) => {
  const category = db.get('jobCategories').find({ slug: req.params.slug }).value();
  if (!category) {
    return res.status(404).render('jobs/404', { title: 'Category Not Found' });
  }

  const jobs = db.get('jobs')
    .filter({ status: 'published', categoryId: category.id })
    .sortBy('createdAt')
    .value()
    .reverse()
    .filter(j => !isExpired(j.deadline));

  const categories = db.get('jobCategories').filter({ active: true }).sortBy('order').value();

  res.render('jobs/category', {
    title: `${category.name} Jobs - Kenya Ni Home`,
    category,
    jobs,
    categories,
    meta: {
      title: `${category.name} Jobs in Kenya - Kenya Ni Home`,
      description: `Find ${category.name} jobs across Kenya`
    }
  });
});

// Jobs by Location
router.get('/location/:location', (req, res) => {
  const location = req.params.location;
  const jobs = db.get('jobs')
    .filter({ status: 'published' })
    .value()
    .filter(j => !isExpired(j.deadline))
    .filter(j => j.location?.toLowerCase().includes(location.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const categories = db.get('jobCategories').filter({ active: true }).sortBy('order').value();

  res.render('jobs/location', {
    title: `Jobs in ${location} - Kenya Ni Home`,
    location,
    jobs,
    categories,
    meta: {
      title: `Jobs in ${location} - Kenya Ni Home`,
      description: `Find jobs in ${location}, Kenya`
    }
  });
});

module.exports = router;
