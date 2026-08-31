const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const db = require('../db');
const { requireAuth, requireEmployer, requireAdmin } = require('../middleware/jobsAuth');

// Helper functions
function generateSlug(title) {
  return slugify(title, { lower: true, strict: true });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// ==================== EMPLOYER PUBLIC ROUTES ====================

// Employer Login
router.get('/login', (req, res) => {
  res.render('jobs/employer/login', {
    title: 'Employer Login - Kenya Ni Home Jobs',
    meta: { title: 'Employer Login - Kenya Ni Home Jobs', description: 'Sign in to your employer account' }
  });
});

// Employer Register
router.get('/register', (req, res) => {
  res.render('jobs/employer/register', {
    title: 'Employer Register - Kenya Ni Home Jobs',
    meta: { title: 'Register as Employer - Kenya Ni Home Jobs', description: 'Create an employer account' }
  });
});

// ==================== EMPLOYER DASHBOARD ROUTES ====================

// Employer Dashboard
router.get('/dashboard', requireEmployer, (req, res) => {
  const user = req.session.user;
  const company = db.get('companies').find({ userId: user.id }).value();
  const jobs = db.get('jobs').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  const applications = db.get('applications')
    .filter(a => jobs.some(j => j.id === a.jobId))
    .sortBy('createdAt')
    .value()
    .reverse()
    .slice(0, 10);

  const stats = {
    totalJobs: jobs.length,
    activeJobs: jobs.filter(j => j.status === 'published' && !isExpired(j.deadline)).length,
    pendingJobs: jobs.filter(j => j.status === 'pending').length,
    totalApplications: db.get('applications').filter(a => jobs.some(j => j.id === a.jobId)).value().length,
    views: jobs.reduce((sum, j) => sum + (j.views || 0), 0)
  };

  res.render('jobs/employer/dashboard', {
    title: 'Employer Dashboard - Kenya Ni Home Jobs',
    user,
    company,
    jobs,
    applications,
    stats,
    meta: { title: 'Employer Dashboard', description: 'Manage your jobs and applicants' }
  });
});

// Post a Job
router.get('/post-job', requireEmployer, (req, res) => {
  const categories = db.get('jobCategories').filter({ active: true }).sortBy('order').value();
  const company = db.get('companies').find({ userId: req.session.user.id }).value();
  res.render('jobs/employer/post-job', {
    title: 'Post a Job - Kenya Ni Home Jobs',
    categories,
    company,
    meta: { title: 'Post a Job', description: 'Create a new job listing' }
  });
});

// My Jobs
router.get('/my-jobs', requireEmployer, (req, res) => {
  const user = req.session.user;
  const jobs = db.get('jobs').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  res.render('jobs/employer/my-jobs', {
    title: 'My Jobs - Kenya Ni Home Jobs',
    jobs,
    meta: { title: 'My Jobs', description: 'Manage your job listings' }
  });
});

// Edit Job
router.get('/jobs/:id/edit', requireEmployer, (req, res) => {
  const user = req.session.user;
  const job = db.get('jobs').find({ id: Number(req.params.id) }).value();
  if (!job || (job.userId !== user.id && user.role !== 'admin')) {
    return res.status(403).send('Access denied');
  }
  const categories = db.get('jobCategories').filter({ active: true }).sortBy('order').value();
  res.render('jobs/employer/edit-job', {
    title: 'Edit Job - Kenya Ni Home Jobs',
    job,
    categories,
    meta: { title: 'Edit Job', description: 'Edit your job listing' }
  });
});

// Applicants for a Job
router.get('/jobs/:id/applicants', requireEmployer, (req, res) => {
  const user = req.session.user;
  const job = db.get('jobs').find({ id: Number(req.params.id) }).value();
  if (!job || (job.userId !== user.id && user.role !== 'admin')) {
    return res.status(403).send('Access denied');
  }
  const applications = db.get('applications').filter({ jobId: job.id }).sortBy('createdAt').value().reverse();
  res.render('jobs/employer/applicants', {
    title: `Applicants for ${job.title}`,
    job,
    applications,
    meta: { title: 'Applicants', description: 'View job applicants' }
  });
});

// Employer Profile
router.get('/profile', requireEmployer, (req, res) => {
  const user = req.session.user;
  const company = db.get('companies').find({ userId: user.id }).value();
  res.render('jobs/employer/profile', {
    title: 'Company Profile - Kenya Ni Home Jobs',
    user,
    company,
    meta: { title: 'Company Profile', description: 'Manage your company profile' }
  });
});

// Payments
router.get('/payments', requireEmployer, (req, res) => {
  const user = req.session.user;
  const payments = db.get('jobPayments').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  res.render('jobs/employer/payments', {
    title: 'Payment History - Kenya Ni Home Jobs',
    payments,
    meta: { title: 'Payments', description: 'View payment history' }
  });
});

module.exports = router;
