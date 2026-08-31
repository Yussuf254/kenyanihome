// =====================================================================
// JOBS PORTAL - EMPLOYEE ROUTES
// =====================================================================
const express = require('express');
const jobsRouter = express.Router();
const slugify = require('slugify');
const db = require('../db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

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
    if (count >= 1) return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

// File upload configuration for CVs
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'uploads', 'cvs'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'cv-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
  }
});

// Ensure jobs collections exist
const jobsCollections = ['jobs', 'companies', 'jobCategories', 'applications', 'savedJobs', 'jobAlerts', 'jobPayments', 'jobNotifications'];
jobsCollections.forEach(col => {
  if (!db.get(col).value()) db.set(col, []).write();
});

// Ensure meta fields exist for jobs
const meta = db.get('meta').value();
if (meta.nextCompanyId === undefined) { meta.nextCompanyId = 1; }
if (meta.nextJobId === undefined) { meta.nextJobId = 1; }
if (meta.nextApplicationId === undefined) { meta.nextApplicationId = 1; }
if (meta.nextSavedJobId === undefined) { meta.nextSavedJobId = 1; }
if (meta.nextJobAlertId === undefined) { meta.nextJobAlertId = 1; }
if (meta.nextJobCategoryId === undefined) { meta.nextJobCategoryId = 14; }
db.set('meta', meta).write();

// Seed job categories if empty
if (db.get('jobCategories').value().length === 0) {
  db.set('jobCategories', [
    { id: 1, name: 'ICT & Technology', slug: 'ict-technology', order: 0, active: true },
    { id: 2, name: 'Finance & Accounting', slug: 'finance-accounting', order: 1, active: true },
    { id: 3, name: 'Sales & Marketing', slug: 'sales-marketing', order: 2, active: true },
    { id: 4, name: 'Engineering', slug: 'engineering', order: 3, active: true },
    { id: 5, name: 'Healthcare', slug: 'healthcare', order: 4, active: true },
    { id: 6, name: 'Education', slug: 'education', order: 5, active: true },
    { id: 7, name: 'Government', slug: 'government', order: 6, active: true },
    { id: 8, name: 'NGO & Development', slug: 'ngo-development', order: 7, active: true },
    { id: 9, name: 'Hospitality', slug: 'hospitality', order: 8, active: true },
    { id: 10, name: 'Security', slug: 'security', order: 9, active: true },
    { id: 11, name: 'Transport & Logistics', slug: 'transport-logistics', order: 10, active: true },
    { id: 12, name: 'Construction', slug: 'construction', order: 11, active: true },
    { id: 13, name: 'Remote Jobs', slug: 'remote-jobs', order: 12, active: true }
  ]).write();
  db.set('meta.nextJobCategoryId', 14).write();
}

// =====================================================================
// PUBLIC JOBS ROUTES
// =====================================================================

jobsRouter.get('/', (req, res) => {
  const categories = db.get('jobCategories').filter({ active: true }).sortBy('order').value();
  const jobs = db.get('jobs')
    .filter({ status: 'published' })
    .sortBy('createdAt')
    .value()
    .reverse()
    .filter(j => !isExpired(j.deadline))
    .slice(0, 12);

  const companies = db.get('companies').filter({ status: 'verified' }).value();
  const totalJobs = db.get('jobs').filter({ status: 'published' }).value().filter(j => !isExpired(j.deadline)).length;
  const totalCompanies = companies.length;
  const totalApplications = db.get('applications').value().length;

  res.render('jobs/index', {
    title: 'Jobs - Kenya Ni Home',
    categories,
    jobs,
    companies,
    totalJobs,
    totalCompanies,
    stats: { totalApplications },
    settings: db.get('settings').value(),
    formatDate,
    isExpired,
    timeAgo,
    user: req.session.user || null,
    meta: {
      title: 'Kenya Ni Home Jobs - Find Your Next Opportunity',
      description: 'Discover verified jobs, career opportunities and vacancies from companies and organisations across Kenya.'
    }
  });
});

jobsRouter.get('/search', (req, res) => {
  const { q, category, location, type, experience, salaryMin, salaryMax } = req.query;
  let jobs = db.get('jobs').filter({ status: 'published' }).value().filter(j => !isExpired(j.deadline));

  if (q) {
    const query = q.toLowerCase();
    jobs = jobs.filter(j =>
      j.title?.toLowerCase().includes(query) ||
      j.company?.toLowerCase().includes(query) ||
      j.description?.toLowerCase().includes(query) ||
      j.location?.toLowerCase().includes(query)
    );
  }
  if (category) jobs = jobs.filter(j => j.categorySlug === category);
  if (location) jobs = jobs.filter(j => j.location?.toLowerCase().includes(location.toLowerCase()));
  if (type) jobs = jobs.filter(j => j.employmentType === type);
  if (experience) jobs = jobs.filter(j => j.experience === experience);
  if (salaryMin) jobs = jobs.filter(j => (j.salaryMin || 0) >= Number(salaryMin));
  if (salaryMax) jobs = jobs.filter(j => (j.salaryMax || Infinity) <= Number(salaryMax));
  
  jobs = jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('jobs/search', {
    title: 'Search Jobs - Kenya Ni Home',
    jobs,
    categories: db.get('jobCategories').filter({ active: true }).sortBy('order').value(),
    query: q || '',
    selectedCategory: category || '',
    selectedLocation: location || '',
    selectedType: type || '',
    selectedExperience: experience || '',
    selectedSalaryMin: salaryMin || '',
    selectedSalaryMax: salaryMax || '',
    formatDate,
    timeAgo,
    user: req.session.user || null,
    meta: { title: 'Search Jobs - Kenya Ni Home', description: 'Search for jobs across Kenya' }
  });
});

jobsRouter.get('/category/:slug', (req, res) => {
  const category = db.get('jobCategories').find({ slug: req.params.slug }).value();
  if (!category) return res.status(404).render('jobs/404', { title: 'Not Found' });
  const jobs = db.get('jobs').filter({ status: 'published', categoryId: category.id }).sortBy('createdAt').value().reverse().filter(j => !isExpired(j.deadline));

  res.render('jobs/category', {
    title: `${category.name} Jobs - Kenya Ni Home`,
    category,
    jobs,
    categories: db.get('jobCategories').filter({ active: true }).sortBy('order').value(),
    formatDate,
    timeAgo,
    user: req.session.user || null,
    meta: { title: `${category.name} Jobs in Kenya`, description: `Find ${category.name} jobs` }
  });
});

// =====================================================================
// EMPLOYEE AUTH ROUTES (Must be before /:slug)
// =====================================================================

jobsRouter.get('/login', (req, res) => {
  if (req.session.user && req.session.user.role === 'employee') return res.redirect('/jobs/dashboard');
  res.render('jobs/login', { title: 'Employee Login - Kenya Ni Home Jobs', user: req.session.user || null, meta: { title: 'Employee Login', description: 'Sign in to apply for jobs' } });
});

jobsRouter.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.get('users').find({ email: email.toLowerCase(), role: 'employee' }).value();
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/jobs/login');
  }
  req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
  db.get('users').find({ id: user.id }).assign({ lastLoginAt: new Date().toISOString() }).write();
  req.flash('success', `Welcome back, ${user.username}!`);
  res.redirect('/jobs/dashboard');
});

jobsRouter.get('/register', (req, res) => {
  if (req.session.user && req.session.user.role === 'employee') return res.redirect('/jobs/dashboard');
  res.render('jobs/register', { title: 'Create Account - Kenya Ni Home Jobs', user: req.session.user || null, meta: { title: 'Register', description: 'Create a job seeker account' } });
});

jobsRouter.post('/register', (req, res) => {
  const { name, email, phone, county, category, password, passwordConfirm } = req.body;
  if (!name || !email || !password) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/jobs/register');
  }
  if (password !== passwordConfirm) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/jobs/register');
  }
  if (password.length < 8) {
    req.flash('error', 'Password must be at least 8 characters.');
    return res.redirect('/jobs/register');
  }
  if (db.get('users').find({ email: String(email).toLowerCase() }).value()) {
    req.flash('error', 'Email already registered.');
    return res.redirect('/jobs/register');
  }
  const meta = db.get('meta').value();
  const user = {
    id: meta.nextUserId++,
    username: name,
    email: email.toLowerCase(),
    phone: phone || '',
    county: county || '',
    category: category || '',
    skills: '',
    bio: '',
    education: '',
    experience: '',
    cvUrl: '',
    coverLetter: '',
    photoUrl: '',
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'employee',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    browser: '',
    os: ''
  };
  db.get('users').push(user).write();
  db.set('meta', meta).write();
  req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
  req.flash('success', 'Account created successfully! Complete your profile to start applying.');
  res.redirect('/jobs/dashboard');
});

// =====================================================================
// EMPLOYEE PROTECTED ROUTES (Must be before /:slug)
// =====================================================================

jobsRouter.get('/dashboard', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employee') return res.redirect('/jobs/login');
  const user = db.get('users').find({ id: req.session.user.id }).value();
  const applications = db.get('applications').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  const savedJobs = db.get('savedJobs').filter({ userId: user.id }).value();
  const savedJobsList = savedJobs.map(sj => db.get('jobs').find({ id: sj.jobId }).value()).filter(Boolean).filter(j => !isExpired(j.deadline));

  res.render('jobs/employee/dashboard', {
    title: 'Dashboard - Kenya Ni Home Jobs',
    user,
    applications,
    savedJobs: savedJobsList,
    stats: {
      totalApplications: applications.length,
      pending: applications.filter(a => a.status === 'submitted' || a.status === 'under_review').length,
      shortlisted: applications.filter(a => a.status === 'shortlisted').length,
      savedJobs: savedJobs.length
    },
    formatDate,
    timeAgo,
    meta: { title: 'Dashboard', description: 'Your job search dashboard' }
  });
});

jobsRouter.get('/profile', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employee') return res.redirect('/jobs/login');
  const user = db.get('users').find({ id: req.session.user.id }).value();
  res.render('jobs/employee/profile', { title: 'My Profile - Kenya Ni Home Jobs', user, meta: { title: 'Profile' } });
});

jobsRouter.post('/profile', upload.single('cv'), (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employee') return res.redirect('/jobs/login');
  
  const { name, phone, county, category, skills, bio, education, experience, coverLetter } = req.body;
  const updateData = {
    username: name || req.session.user.username,
    phone: phone || '',
    county: county || '',
    category: category || '',
    skills: skills || '',
    bio: bio || '',
    education: education || '',
    experience: experience || '',
    coverLetter: coverLetter || ''
  };

  if (req.file) {
    updateData.cvUrl = '/public/uploads/cvs/' + req.file.filename;
  }

  db.get('users').find({ id: req.session.user.id }).assign(updateData).write();
  req.flash('success', 'Profile updated successfully!');
  res.redirect('/jobs/profile');
});

jobsRouter.get('/applications', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employee') return res.redirect('/jobs/login');
  const user = req.session.user;
  const applications = db.get('applications').filter({ userId: user.id }).sortBy('createdAt').value().reverse();
  const applicationsWithJobs = applications.map(app => {
    const job = db.get('jobs').find({ id: app.jobId }).value();
    return { ...app, job };
  });

  res.render('jobs/employee/applications', {
    title: 'My Applications - Kenya Ni Home Jobs',
    user,
    applications: applicationsWithJobs,
    formatDate,
    meta: { title: 'My Applications', description: 'Track your job applications' }
  });
});

jobsRouter.get('/saved', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employee') return res.redirect('/jobs/login');
  const user = req.session.user;
  const savedJobs = db.get('savedJobs').filter({ userId: user.id }).value();
  const jobs = savedJobs.map(sj => db.get('jobs').find({ id: sj.jobId }).value()).filter(Boolean).filter(j => !isExpired(j.deadline));

  res.render('jobs/employee/saved', {
    title: 'Saved Jobs - Kenya Ni Home Jobs',
    user,
    jobs,
    formatDate,
    timeAgo,
    meta: { title: 'Saved Jobs', description: 'Your saved jobs' }
  });
});

jobsRouter.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/jobs/login'));
});

// =====================================================================
// JOB DETAIL PAGE (Must be after specific routes)
// =====================================================================

jobsRouter.get('/:slug', (req, res) => {
  const job = db.get('jobs').find({ slug: req.params.slug }).value();
  if (!job) return res.status(404).render('jobs/404', { title: 'Job Not Found' });

  const company = db.get('companies').find({ id: job.companyId }).value();
  const relatedJobs = db.get('jobs').filter({ status: 'published', categoryId: job.categoryId, id: { $ne: job.id } }).sortBy('createdAt').value().reverse().filter(j => !isExpired(j.deadline)).slice(0, 4);

  db.get('jobs').find({ id: job.id }).assign({ views: (job.views || 0) + 1 }).write();

  res.render('jobs/detail', {
    title: `${job.title} - Kenya Ni Home Jobs`,
    job,
    company,
    relatedJobs,
    isExpired: isExpired(job.deadline),
    formatDate,
    timeAgo,
    user: req.session.user || null,
    meta: { title: `${job.title} at ${company?.name || 'Company'}`, description: job.description?.slice(0, 160) || job.title }
  });
});

// Save/Unsave Job
jobsRouter.post('/:slug/save', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'employee') return res.json({ error: 'Login required' });
  const job = db.get('jobs').find({ slug: req.params.slug }).value();
  if (!job) return res.json({ error: 'Job not found' });

  const existing = db.get('savedJobs').find({ jobId: job.id, userId: req.session.user.id }).value();
  if (existing) {
    db.get('savedJobs').remove({ id: existing.id }).write();
    return res.json({ saved: false });
  }

  const meta = db.get('meta').value();
  db.get('savedJobs').push({
    id: meta.nextSavedJobId++,
    jobId: job.id,
    userId: req.session.user.id,
    createdAt: new Date().toISOString()
  }).write();
  db.set('meta', meta).write();
  res.json({ saved: true });
});

// Apply to Job
jobsRouter.get('/:slug/apply', (req, res) => {
  const job = db.get('jobs').find({ slug: req.params.slug }).value();
  if (!job) return res.status(404).render('jobs/404', { title: 'Not Found' });
  const company = db.get('companies').find({ id: job.companyId }).value();

  // If not logged in, redirect to login with return URL
  if (!req.session.user || req.session.user.role !== 'employee') {
    req.session.returnTo = `/jobs/${job.slug}/apply`;
    return res.redirect('/jobs/login');
  }

  const user = db.get('users').find({ id: req.session.user.id }).value();

  res.render('jobs/apply', {
    title: `Apply - ${job.title}`,
    job,
    company,
    user,
    meta: { title: `Apply for ${job.title}`, description: `Submit your application` }
  });
});

jobsRouter.post('/:slug/apply', (req, res) => {
  const job = db.get('jobs').find({ slug: req.params.slug }).value();
  if (!job) return res.status(404).render('jobs/404', { title: 'Not Found' });

  if (!req.session.user || req.session.user.role !== 'employee') {
    return res.redirect('/jobs/login');
  }

  // Check for duplicate application
  const existing = db.get('applications').find({ jobId: job.id, userId: req.session.user.id }).value();
  if (existing) {
    req.flash('error', 'You have already applied for this job.');
    return res.redirect(`/jobs/${job.slug}`);
  }

  const user = db.get('users').find({ id: req.session.user.id }).value();
  const meta = db.get('meta').value();
  
  const application = {
    id: meta.nextApplicationId++,
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    companyEmail: job.companyEmail || (db.get('companies').find({ id: job.companyId }).value()?.email || ''),
    userId: req.session.user.id,
    name: req.body.name || user.username,
    email: req.body.email || user.email,
    phone: req.body.phone || user.phone || '',
    coverLetter: req.body.coverLetter || user.coverLetter || '',
    cvUrl: user.cvUrl || '',
    status: 'submitted',
    createdAt: new Date().toISOString()
  };
  db.get('applications').push(application).write();
  db.set('meta', meta).write();

  req.flash('success', 'Application submitted successfully! The employer will contact you if shortlisted.');
  res.redirect('/jobs/applications');
});

// Logout
jobsRouter.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/jobs/login'));
});

module.exports = jobsRouter;
