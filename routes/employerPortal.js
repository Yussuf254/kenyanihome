// =====================================================================
// EMPLOYER ROUTES
// =====================================================================
const express = require('express');
const employer = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const slugify = require('slugify');
const multer = require('multer');
const path = require('path');

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(deadline) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// File upload configuration for company logos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'uploads', 'logos'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// =====================================================================
// EMPLOYER AUTH ROUTES
// =====================================================================

employer.get('/login', (req, res) => {
  if (req.session.user && req.session.user.role === 'employer') return res.redirect('/employer/dashboard');
  res.render('jobs/employer/login', { title: 'Employer Login - Kenya Ni Home Jobs', user: req.session.user || null, meta: { title: 'Employer Login' } });
});

employer.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.get('users').find({ email: email.toLowerCase(), role: 'employer' }).value();
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/employer/login');
  }
  if (user.status === 'suspended') {
    req.flash('error', 'Your account has been suspended.');
    return res.redirect('/employer/login');
  }
  req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
  db.get('users').find({ id: user.id }).assign({ lastLoginAt: new Date().toISOString() }).write();
  req.flash('success', `Welcome back, ${user.username}!`);
  res.redirect('/employer/dashboard');
});

employer.get('/register', (req, res) => {
  if (req.session.user && req.session.user.role === 'employer') return res.redirect('/employer/dashboard');
  res.render('jobs/employer/register', { title: 'Employer Registration - Kenya Ni Home Jobs', user: req.session.user || null, meta: { title: 'Employer Register' } });
});

employer.post('/register', (req, res) => {
  const { companyName, email, phone, description, website, industry, location, registration, password, passwordConfirm } = req.body;
  if (!companyName || !email || !password) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/employer/register');
  }
  if (password !== passwordConfirm) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/employer/register');
  }
  if (password.length < 8) {
    req.flash('error', 'Password must be at least 8 characters.');
    return res.redirect('/employer/register');
  }
  if (db.get('users').find({ email: String(email).toLowerCase() }).value()) {
    req.flash('error', 'Email already registered.');
    return res.redirect('/employer/register');
  }

  const meta = db.get('meta').value();
  const user = {
    id: meta.nextUserId++,
    username: companyName,
    email: email.toLowerCase(),
    phone: phone || '',
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'employer',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    browser: '',
    os: ''
  };
  db.get('users').push(user).write();

  const company = {
    id: meta.nextCompanyId++,
    userId: user.id,
    companyName,
    email: email.toLowerCase(),
    phone: phone || '',
    description: description || '',
    website: website || '',
    industry: industry || '',
    location: location || '',
    registration: registration || '',
    logo: '',
    status: 'pending',
    jobCount: 0,
    createdAt: new Date().toISOString()
  };
  db.get('companies').push(company).write();
  db.set('meta', meta).write();

  req.flash('success', 'Your employer account has been submitted for review. You will be able to access your dashboard once verified by our team.');
  res.redirect('/employer/login');
});

// =====================================================================
// EMPLOYER DASHBOARD ROUTES
// =====================================================================

employer.get('/dashboard', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const user = req.session.user;
  const company = db.get('companies').find({ userId: user.id }).value();
  
  // Check if employer is verified
  if (!company || company.status === 'pending') {
    return res.render('jobs/employer/pending', {
      title: 'Account Pending - Kenya Ni Home Jobs',
      user,
      company,
      meta: { title: 'Account Pending Verification' }
    });
  }
  if (company.status === 'suspended') {
    req.flash('error', 'Your account has been suspended. Please contact support.');
    return res.redirect('/employer/login');
  }
  
  const jobs = db.get('jobs').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  const activeJobs = jobs.filter(j => j.status === 'published' && !isExpired(j.deadline));
  const pendingJobs = jobs.filter(j => j.status === 'pending');
  
  // Get applications for all jobs
  const jobIds = jobs.map(j => j.id);
  const applications = db.get('applications').filter(a => jobIds.includes(a.jobId)).value();

  res.render('jobs/employer/dashboard', {
    title: 'Employer Dashboard - Kenya Ni Home Jobs',
    user,
    company,
    jobs,
    applications,
    stats: {
      totalJobs: jobs.length,
      activeJobs: activeJobs.length,
      pendingJobs: pendingJobs.length,
      totalApplications: applications.length,
      views: jobs.reduce((sum, j) => sum + (j.views || 0), 0)
    },
    formatDate,
    meta: { title: 'Employer Dashboard' }
  });
});

// =====================================================================
// COMPANY PROFILE ROUTES
// =====================================================================

employer.get('/profile', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const company = db.get('companies').find({ userId: req.session.user.id }).value();
  res.render('jobs/employer/profile', {
    title: 'Company Profile - Kenya Ni Home Jobs',
    user: req.session.user,
    company,
    meta: { title: 'Company Profile' }
  });
});

employer.post('/profile', upload.single('logo'), (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  
  const { companyName, phone, description, website, location, industry } = req.body;
  const updateData = {
    companyName: companyName || '',
    phone: phone || '',
    description: description || '',
    website: website || '',
    location: location || '',
    industry: industry || ''
  };

  // Handle logo upload
  if (req.file) {
    updateData.logo = '/public/uploads/logos/' + req.file.filename;
  }

  db.get('companies').find({ userId: req.session.user.id }).assign(updateData).write();
  req.flash('success', 'Company profile updated successfully!');
  res.redirect('/employer/profile');
});

// =====================================================================
// JOB MANAGEMENT ROUTES
// =====================================================================

employer.get('/jobs/create', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const company = db.get('companies').find({ userId: req.session.user.id }).value();
  
  if (!company || company.status !== 'verified') {
    req.flash('error', 'Your company must be verified before posting jobs.');
    return res.redirect('/employer/dashboard');
  }

  res.render('jobs/employer/post-job', {
    title: 'Post a Job - Kenya Ni Home Jobs',
    categories: db.get('jobCategories').filter({ active: true }).sortBy('order').value(),
    company,
    meta: { title: 'Post a Job' }
  });
});

employer.post('/jobs/create', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  
  const { title, categoryId, employmentType, location, salaryMin, salaryMax, experience, deadline, description, requirements, responsibilities, skills } = req.body;

  if (!title || !categoryId || !employmentType || !location || !deadline || !description) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/employer/jobs/create');
  }

  const category = db.get('jobCategories').find({ id: Number(categoryId) }).value();
  const company = db.get('companies').find({ userId: req.session.user.id }).value();
  const meta = db.get('meta').value();

  const job = {
    id: meta.nextJobId++,
    userId: req.session.user.id,
    companyId: company?.id || null,
    title,
    slug: generateSlug(title + '-' + Date.now()),
    categoryId: Number(categoryId),
    categorySlug: category?.slug || '',
    categoryName: category?.name || '',
    employmentType,
    location,
    salaryMin: salaryMin ? Number(salaryMin) : null,
    salaryMax: salaryMax ? Number(salaryMax) : null,
    salaryCurrency: 'KSh',
    experience: experience || '',
    deadline: deadline || null,
    description: description || '',
    requirements: requirements || '',
    responsibilities: responsibilities || '',
    skills: skills || '',
    company: company?.companyName || '',
    companyEmail: company?.email || '',
    status: 'pending',
    featured: false,
    views: 0,
    createdAt: new Date().toISOString()
  };
  db.get('jobs').push(job).write();
  db.set('meta', meta).write();

  req.flash('success', 'Job submitted for review. It will be published after admin approval.');
  res.redirect('/employer/jobs');
});

employer.get('/jobs', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const user = req.session.user;
  const jobs = db.get('jobs').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  
  // Get application counts for each job
  const jobsWithCounts = jobs.map(job => {
    const appCount = db.get('applications').filter({ jobId: job.id }).value().length;
    return { ...job, applicationCount: appCount };
  });

  res.render('jobs/employer/my-jobs', {
    title: 'My Jobs - Kenya Ni Home Jobs',
    jobs: jobsWithCounts,
    formatDate,
    isExpired,
    meta: { title: 'My Jobs' }
  });
});

employer.get('/jobs/:id/edit', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const job = db.get('jobs').find({ id: Number(req.params.id), userId: req.session.user.id }).value();
  if (!job) return res.status(404).send('Job not found');

  res.render('jobs/employer/edit-job', {
    title: 'Edit Job - Kenya Ni Home Jobs',
    job,
    categories: db.get('jobCategories').filter({ active: true }).sortBy('order').value(),
    meta: { title: 'Edit Job' }
  });
});

employer.post('/jobs/:id/edit', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const { title, categoryId, employmentType, location, salaryMin, salaryMax, experience, deadline, description, responsibilities, requirements, skills } = req.body;
  const category = db.get('jobCategories').find({ id: Number(categoryId) }).value();

  db.get('jobs').find({ id: Number(req.params.id), userId: req.session.user.id }).assign({
    title,
    categoryId: Number(categoryId),
    categorySlug: category?.slug || '',
    categoryName: category?.name || '',
    employmentType,
    location,
    salaryMin: salaryMin ? Number(salaryMin) : null,
    salaryMax: salaryMax ? Number(salaryMax) : null,
    experience: experience || '',
    deadline,
    description,
    responsibilities: responsibilities || '',
    requirements: requirements || '',
    skills: skills || ''
  }).write();

  req.flash('success', 'Job updated successfully!');
  res.redirect('/employer/jobs');
});

employer.post('/jobs/:id/delete', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const job = db.get('jobs').find({ id: Number(req.params.id), userId: req.session.user.id }).value();
  if (job) {
    db.get('jobs').remove({ id: Number(req.params.id) }).write();
    db.get('applications').remove({ jobId: Number(req.params.id) }).write();
    req.flash('success', 'Job deleted successfully!');
  }
  res.redirect('/employer/jobs');
});

// =====================================================================
// APPLICANT MANAGEMENT ROUTES
// =====================================================================

employer.get('/jobs/:id/applicants', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const job = db.get('jobs').find({ id: Number(req.params.id), userId: req.session.user.id }).value();
  if (!job) return res.status(404).send('Job not found');

  const applications = db.get('applications').filter({ jobId: job.id }).sortBy('createdAt').value().reverse();
  const applicationsWithUsers = applications.map(app => {
    const applicant = db.get('users').find({ id: app.userId }).value();
    return { ...app, applicant };
  });

  res.render('jobs/employer/applicants', {
    title: `Applicants - ${job.title}`,
    job,
    applications: applicationsWithUsers,
    formatDate,
    meta: { title: 'Applicants' }
  });
});

employer.post('/applications/:id/status', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const { status } = req.body;
  const application = db.get('applications').find({ id: Number(req.params.id) }).value();
  if (!application) return res.status(404).json({ error: 'Application not found' });
  
  // Verify the job belongs to this employer
  const job = db.get('jobs').find({ id: application.jobId, userId: req.session.user.id }).value();
  if (!job) return res.status(403).json({ error: 'Access denied' });

  db.get('applications').find({ id: Number(req.params.id) }).assign({ status }).write();
  res.json({ success: true });
});

// =====================================================================
// BILLING ROUTES
// =====================================================================

employer.get('/payments', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employer') return res.redirect('/employer/login');
  const payments = db.get('jobPayments').filter({ userId: req.session.user.id }).sortBy('createdAt').value().reverse();
  res.render('jobs/employer/payments', {
    title: 'Payment History - Kenya Ni Home Jobs',
    payments,
    formatDate,
    meta: { title: 'Payments' }
  });
});

// Logout
employer.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/employer/login'));
});

module.exports = employer;
