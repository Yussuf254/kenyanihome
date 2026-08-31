const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/jobsAuth');
const slugify = require('slugify');

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// Set locals for all admin jobs views
router.use(requireAdmin);
router.use((req, res, next) => {
  res.locals.currentUser = req.session.user;
  res.locals.settings = db.get('settings').value();
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// ==================== ADMIN JOBS ROUTES ====================

// Jobs Overview
router.get('/jobs', (req, res) => {
  const jobs = db.get('jobs').sortBy('createdAt').value().reverse();
  const totalJobs = jobs.length;
  const pendingCount = jobs.filter(j => j.status === 'pending').length;
  const publishedCount = jobs.filter(j => j.status === 'published' && !isExpired(j.deadline)).length;
  const rejectedCount = jobs.filter(j => j.status === 'rejected').length;
  const expiredCount = jobs.filter(j => j.status === 'published' && isExpired(j.deadline)).length;
  const totalApplications = db.get('applications').value().length;

  res.render('admin/jobs/index', {
    title: 'Jobs Management - Kenya Ni Home',
    jobs,
    stats: {
      totalJobs,
      pendingCount,
      publishedCount,
      rejectedCount,
      expiredCount,
      totalApplications
    },
    formatDate,
    isExpired,
    meta: { title: 'Jobs Management', description: 'Manage job listings' }
  });
});

// Pending Jobs
router.get('/jobs/pending', (req, res) => {
  const jobs = db.get('jobs').filter({ status: 'pending' }).sortBy('createdAt').value().reverse();
  res.render('admin/jobs/pending', {
    title: 'Pending Jobs - Kenya Ni Home',
    jobs,
    formatDate,
    isExpired,
    meta: { title: 'Pending Jobs', description: 'Review pending jobs' }
  });
});

// Published Jobs
router.get('/jobs/published', (req, res) => {
  const jobs = db.get('jobs').filter({ status: 'published' }).sortBy('createdAt').value().reverse();
  res.render('admin/jobs/published', {
    title: 'Published Jobs - Kenya Ni Home',
    jobs,
    formatDate,
    isExpired,
    meta: { title: 'Published Jobs', description: 'View published jobs' }
  });
});

// Single Job
router.get('/jobs/:id', (req, res) => {
  const job = db.get('jobs').find({ id: Number(req.params.id) }).value();
  if (!job) return res.status(404).render('admin/404', { title: 'Job Not Found' });
  const company = db.get('companies').find({ id: job.companyId }).value();
  const category = db.get('jobCategories').find({ id: job.categoryId }).value();
  const applications = db.get('applications').filter({ jobId: job.id }).value();

  res.render('admin/jobs/view', {
    title: `${job.title} - Kenya Ni Home`,
    job,
    company,
    category,
    applications,
    applicationCount: applications.length,
    formatDate,
    isExpired,
    meta: { title: `${job.title} - Job Details` }
  });
});

// Approve Job
router.post('/jobs/:id/approve', (req, res) => {
  const job = db.get('jobs').find({ id: Number(req.params.id) }).value();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  db.get('jobs').find({ id: Number(req.params.id) }).assign({ status: 'published', publishedAt: new Date().toISOString() }).write();
  req.flash('success', `Job "${job.title}" has been approved and published.`);
  res.json({ success: true });
});

// Reject Job
router.post('/jobs/:id/reject', (req, res) => {
  const job = db.get('jobs').find({ id: Number(req.params.id) }).value();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { reason } = req.body;
  db.get('jobs').find({ id: Number(req.params.id) }).assign({ status: 'rejected', rejectionReason: reason || '', rejectedAt: new Date().toISOString() }).write();
  req.flash('success', `Job "${job.title}" has been rejected.`);
  res.json({ success: true });
});

// Unpublish Job
router.post('/jobs/:id/unpublish', (req, res) => {
  const job = db.get('jobs').find({ id: Number(req.params.id) }).value();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  db.get('jobs').find({ id: Number(req.params.id) }).assign({ status: 'draft' }).write();
  req.flash('success', `Job "${job.title}" has been unpublished.`);
  res.json({ success: true });
});

// Delete Job
router.delete('/jobs/:id/delete', (req, res) => {
  const job = db.get('jobs').find({ id: Number(req.params.id) }).value();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  db.get('jobs').remove({ id: Number(req.params.id) }).write();
  req.flash('success', `Job "${job.title}" has been deleted.`);
  res.json({ success: true });
});

// Toggle Featured
router.post('/jobs/:id/featured', (req, res) => {
  const job = db.get('jobs').find({ id: Number(req.params.id) }).value();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  db.get('jobs').find({ id: Number(req.params.id) }).assign({ featured: !job.featured }).write();
  res.json({ success: true, featured: !job.featured });
});

// Employers
router.get('/employers', (req, res) => {
  const employers = db.get('companies').sortBy('createdAt').value().reverse();
  const employersWithCounts = employers.map(e => ({
    ...e,
    jobCount: db.get('jobs').filter({ companyId: e.id }).value().length,
    applicationCount: db.get('jobs').filter({ companyId: e.id }).value().reduce((total, j) => total + db.get('applications').filter({ jobId: j.id }).value().length, 0)
  }));
  res.render('admin/jobs/employers', {
    title: 'Employers - Kenya Ni Home',
    employers: employersWithCounts,
    formatDate,
    meta: { title: 'Employers', description: 'Manage employers' }
  });
});

// Verify Employer
router.post('/employers/:id/verify', (req, res) => {
  const company = db.get('companies').find({ id: Number(req.params.id) }).value();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  db.get('companies').find({ id: Number(req.params.id) }).assign({ status: 'verified', verifiedAt: new Date().toISOString() }).write();
  req.flash('success', `Company "${company.companyName || company.name}" has been verified.`);
  res.json({ success: true });
});

// Suspend Employer
router.post('/employers/:id/suspend', (req, res) => {
  const company = db.get('companies').find({ id: Number(req.params.id) }).value();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const { reason } = req.body;
  db.get('companies').find({ id: Number(req.params.id) }).assign({ status: 'suspended', suspensionReason: reason || '', suspendedAt: new Date().toISOString() }).write();
  req.flash('success', `Company "${company.name}" has been suspended.`);
  res.json({ success: true });
});

// Delete Employer
router.delete('/employers/:id/delete', (req, res) => {
  const company = db.get('companies').find({ id: Number(req.params.id) }).value();
  if (!company) return res.status(404).json({ error: 'Company not found' });
  db.get('companies').remove({ id: Number(req.params.id) }).write();
  req.flash('success', `Company "${company.companyName || company.name}" has been deleted.`);
  res.json({ success: true });
});

// Applications
router.get('/applications', (req, res) => {
  const applications = db.get('applications').sortBy('createdAt').value().reverse();
  const applicationsWithDetails = applications.map(a => {
    const job = db.get('jobs').find({ id: a.jobId }).value();
    const company = job ? db.get('companies').find({ id: job.companyId }).value() : null;
    const user = db.get('users').find({ id: a.userId }).value();
    return { ...a, job, company, user };
  });
  res.render('admin/jobs/applications', {
    title: 'Applications - Kenya Ni Home',
    applications: applicationsWithDetails,
    formatDate,
    meta: { title: 'Applications', description: 'View all applications' }
  });
});

// Single Application
router.get('/applications/:id', (req, res) => {
  const application = db.get('applications').find({ id: Number(req.params.id) }).value();
  if (!application) return res.status(404).render('admin/404', { title: 'Application Not Found' });
  const job = db.get('jobs').find({ id: application.jobId }).value();
  const company = job ? db.get('companies').find({ id: job.companyId }).value() : null;
  const user = db.get('users').find({ id: application.userId }).value();
  res.render('admin/jobs/application', {
    title: `Application #${application.id} - Kenya Ni Home`,
    application,
    job,
    company,
    user,
    formatDate,
    meta: { title: `Application #${application.id}` }
  });
});

// Update Application Status
router.post('/applications/:id/status', (req, res) => {
  const { status } = req.body;
  const application = db.get('applications').find({ id: Number(req.params.id) }).value();
  if (!application) return res.status(404).json({ error: 'Application not found' });
  db.get('applications').find({ id: Number(req.params.id) }).assign({ status, updatedAt: new Date().toISOString() }).write();
  req.flash('success', `Application status updated.`);
  res.json({ success: true });
});

// ==================== JOB CATEGORIES ROUTES ====================

// Categories List
router.get('/job-categories', (req, res) => {
  const categories = db.get('jobCategories').sortBy('order').value();
  res.render('admin/jobs/categories', {
    title: 'Job Categories - Kenya Ni Home',
    categories,
    formatDate,
    meta: { title: 'Job Categories', description: 'Manage job categories' }
  });
});

// Create Category
router.post('/job-categories', (req, res) => {
  const { name, icon, order } = req.body;
  if (!name) {
    req.flash('error', 'Category name is required.');
    return res.redirect('/admin/job-categories');
  }
  const meta = db.get('meta').value();
  const slug = slugify(name, { lower: true, strict: true });
  
  const existing = db.get('jobCategories').find({ slug }).value();
  if (existing) {
    req.flash('error', 'A category with this name already exists.');
    return res.redirect('/admin/job-categories');
  }
  
  const category = {
    id: meta.nextJobCategoryId++,
    name,
    slug,
    icon: icon || '💼',
    order: order || db.get('jobCategories').value().length,
    active: true,
    createdAt: new Date().toISOString()
  };
  db.get('jobCategories').push(category).write();
  db.set('meta', meta).write();
  req.flash('success', `Category "${name}" created successfully.`);
  res.redirect('/admin/job-categories');
});

// Update Category
router.post('/job-categories/:id', (req, res) => {
  const category = db.get('jobCategories').find({ id: Number(req.params.id) }).value();
  if (!category) {
    req.flash('error', 'Category not found.');
    return res.redirect('/admin/job-categories');
  }
  const { name, icon, order, active } = req.body;
  db.get('jobCategories').find({ id: Number(req.params.id) }).assign({
    name: name || category.name,
    slug: slugify(name || category.name, { lower: true, strict: true }),
    icon: icon || category.icon,
    order: order !== undefined ? Number(order) : category.order,
    active: active !== undefined ? true : false,
    updatedAt: new Date().toISOString()
  }).write();
  req.flash('success', `Category updated successfully.`);
  res.redirect('/admin/job-categories');
});

// Delete Category
router.delete('/job-categories/:id', (req, res) => {
  const category = db.get('jobCategories').find({ id: Number(req.params.id) }).value();
  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }
  const jobsInCategory = db.get('jobs').filter({ categoryId: Number(req.params.id) }).value();
  if (jobsInCategory.length > 0) {
    return res.status(400).json({ error: `Cannot delete category with ${jobsInCategory.length} jobs. Reassign or delete jobs first.` });
  }
  db.get('jobCategories').remove({ id: Number(req.params.id) }).write();
  res.json({ success: true });
});

// Toggle Category Active
router.post('/job-categories/:id/toggle', (req, res) => {
  const category = db.get('jobCategories').find({ id: Number(req.params.id) }).value();
  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }
  db.get('jobCategories').find({ id: Number(req.params.id) }).assign({ active: !category.active }).write();
  res.json({ success: true, active: !category.active });
});

module.exports = router;
