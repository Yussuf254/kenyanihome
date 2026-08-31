// =====================================================================
// ADMIN JOBS ROUTES
// =====================================================================
const express = require('express');
const adminJobs = express.Router();
const db = require('../db');

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// Authentication middleware for admin jobs routes
adminJobs.use((req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/admin/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }
  // Set locals for admin views
  res.locals.currentUser = req.session.user;
  res.locals.currentPath = req.path;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.settings = db.get('settings').value();
  next();
});

// Jobs overview
adminJobs.get('/jobs', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/admin/login');
  const jobs = db.get('jobs').sortBy('createdAt').value().reverse();
  res.render('admin/jobs/index', {
    title: 'Jobs Management - Kenya Ni Home',
    jobs,
    formatDate,
    meta: { title: 'Jobs Management' }
  });
});

adminJobs.get('/jobs/pending', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/admin/login');
  const jobs = db.get('jobs').filter({ status: 'pending' }).sortBy('createdAt').value().reverse();
  res.render('admin/jobs/pending', {
    title: 'Pending Jobs - Kenya Ni Home',
    jobs,
    formatDate,
    meta: { title: 'Pending Jobs' }
  });
});

adminJobs.get('/jobs/published', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/admin/login');
  const jobs = db.get('jobs').filter({ status: 'published' }).sortBy('createdAt').value().reverse();
  res.render('admin/jobs/published', {
    title: 'Published Jobs - Kenya Ni Home',
    jobs,
    formatDate,
    meta: { title: 'Published Jobs' }
  });
});

// Job actions
adminJobs.post('/jobs/:id/approve', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.get('jobs').find({ id: Number(req.params.id) }).assign({ status: 'published' }).write();
  res.json({ success: true });
});

adminJobs.post('/jobs/:id/reject', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { reason } = req.body;
  db.get('jobs').find({ id: Number(req.params.id) }).assign({ status: 'rejected', rejectionReason: reason || '' }).write();
  res.json({ success: true });
});

adminJobs.post('/jobs/:id/unpublish', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.get('jobs').find({ id: Number(req.params.id) }).assign({ status: 'draft' }).write();
  res.json({ success: true });
});

// Employers
adminJobs.get('/employers', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/admin/login');
  const employers = db.get('companies').sortBy('createdAt').value().reverse();
  // Add job counts
  const employersWithCounts = employers.map(e => ({
    ...e,
    jobCount: db.get('jobs').filter({ companyId: e.id }).value().length
  }));
  res.render('admin/jobs/employers', {
    title: 'Employers - Kenya Ni Home',
    employers: employersWithCounts,
    formatDate,
    meta: { title: 'Employers' }
  });
});

adminJobs.post('/employers/:id/verify', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.get('companies').find({ id: Number(req.params.id) }).assign({ status: 'verified' }).write();
  res.json({ success: true });
});

adminJobs.post('/employers/:id/suspend', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.get('companies').find({ id: Number(req.params.id) }).assign({ status: 'suspended' }).write();
  res.json({ success: true });
});

// Applications
adminJobs.get('/applications', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/admin/login');
  const applications = db.get('applications').sortBy('createdAt').value().reverse();
  res.render('admin/jobs/applications', {
    title: 'Applications - Kenya Ni Home',
    applications,
    formatDate,
    meta: { title: 'Applications' }
  });
});

module.exports = adminJobs;
