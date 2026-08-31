// Jobs Portal Middleware

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/jobs/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/admin/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }
  next();
}

function requireEmployer(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/jobs/login');
  }
  if (req.session.user.role !== 'employer' && req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Employer account required.');
  }
  next();
}

function requireEmployee(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/jobs/login');
  }
  if (req.session.user.role !== 'employee' && req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Job seeker account required.');
  }
  next();
}

function requireEmployerOrAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/jobs/login');
  }
  if (req.session.user.role !== 'employer' && req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireEmployer,
  requireEmployee,
  requireEmployerOrAdmin
};
