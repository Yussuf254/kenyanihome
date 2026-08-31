const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireEmployee, requireAdmin } = require('../middleware/jobsAuth');

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// ==================== EMPLOYEE ROUTES ====================

// Employee Dashboard
router.get('/dashboard', requireEmployee, (req, res) => {
  const user = req.session.user;
  const applications = db.get('applications').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  const savedJobs = db.get('savedJobs').filter({ userId: user.id }).value();

  const stats = {
    totalApplications: applications.length,
    pending: applications.filter(a => a.status === 'submitted' || a.status === 'under_review').length,
    shortlisted: applications.filter(a => a.status === 'shortlisted').length,
    savedJobs: savedJobs.length
  };

  res.render('jobs/employee/dashboard', {
    title: 'My Dashboard - Kenya Ni Home Jobs',
    user,
    applications,
    stats,
    meta: { title: 'Dashboard', description: 'Your job search dashboard' }
  });
});

// My Applications
router.get('/applications', requireEmployee, (req, res) => {
  const user = req.session.user;
  const applications = db.get('applications').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  res.render('jobs/employee/applications', {
    title: 'My Applications - Kenya Ni Home Jobs',
    applications,
    meta: { title: 'My Applications', description: 'Track your job applications' }
  });
});

// Saved Jobs
router.get('/saved', requireEmployee, (req, res) => {
  const user = req.session.user;
  const savedJobs = db.get('savedJobs').filter({ userId: user.id }).value();
  const jobs = savedJobs.map(sj => db.get('jobs').find({ id: sj.jobId }).value()).filter(Boolean);
  res.render('jobs/employee/saved', {
    title: 'Saved Jobs - Kenya Ni Home Jobs',
    jobs,
    meta: { title: 'Saved Jobs', description: 'Your saved jobs' }
  });
});

// Profile
router.get('/profile', requireEmployee, (req, res) => {
  const user = req.session.user;
  res.render('jobs/employee/profile', {
    title: 'My Profile - Kenya Ni Home Jobs',
    user,
    meta: { title: 'Profile', description: 'Manage your profile' }
  });
});

module.exports = router;
