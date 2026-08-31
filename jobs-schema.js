// Jobs Portal Database Schema Migration
// Run this once to add jobs portal collections to the existing database

const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db = low(adapter);

// Job categories
if (!db.get('jobCategories').value()) {
  db.set('jobCategories', [
    { id: 1, name: 'ICT & Technology', slug: 'ict-technology', icon: '💻', order: 0, active: true },
    { id: 2, name: 'Finance & Accounting', slug: 'finance-accounting', icon: '💰', order: 1, active: true },
    { id: 3, name: 'Sales & Marketing', slug: 'sales-marketing', icon: '📊', order: 2, active: true },
    { id: 4, name: 'Engineering', slug: 'engineering', icon: '⚙️', order: 3, active: true },
    { id: 5, name: 'Healthcare', slug: 'healthcare', icon: '🏥', order: 4, active: true },
    { id: 6, name: 'Education', slug: 'education', icon: '📚', order: 5, active: true },
    { id: 7, name: 'Government', slug: 'government', icon: '🏛️', order: 6, active: true },
    { id: 8, name: 'NGO & Development', slug: 'ngo-development', icon: '🌍', order: 7, active: true },
    { id: 9, name: 'Hospitality', slug: 'hospitality', icon: '🏨', order: 8, active: true },
    { id: 10, name: 'Security', slug: 'security', icon: '🔒', order: 9, active: true },
    { id: 11, name: 'Transport & Logistics', slug: 'transport-logistics', icon: '🚚', order: 10, active: true },
    { id: 12, name: 'Construction', slug: 'construction', icon: '🏗️', order: 11, active: true },
    { id: 13, name: 'Remote Jobs', slug: 'remote-jobs', icon: '🏠', order: 12, active: true }
  ]).write();
}

// Companies
if (!db.get('companies').value()) {
  db.set('companies', []).write();
}

// Jobs
if (!db.get('jobs').value()) {
  db.set('jobs', []).write();
}

// Applications
if (!db.get('applications').value()) {
  db.set('applications', []).write();
}

// Saved Jobs
if (!db.get('savedJobs').value()) {
  db.set('savedJobs', []).write();
}

// Job Alerts
if (!db.get('jobAlerts').value()) {
  db.set('jobAlerts', []).write();
}

// Job Payments
if (!db.get('jobPayments').value()) {
  db.set('jobPayments', []).write();
}

// Job Notifications
if (!db.get('jobNotifications').value()) {
  db.set('jobNotifications', []).write();
}

// Update meta with jobs-related IDs
const meta = db.get('meta').value();
if (!meta.nextJobId) meta.nextJobId = 1;
if (!meta.nextCompanyId) meta.nextCompanyId = 1;
if (!meta.nextApplicationId) meta.nextApplicationId = 1;
if (!meta.nextSavedJobId) meta.nextSavedJobId = 1;
if (!meta.nextJobAlertId) meta.nextJobAlertId = 1;
if (!meta.nextJobPaymentId) meta.nextJobPaymentId = 1;
if (!meta.nextJobNotificationId) meta.nextJobNotificationId = 1;
if (!meta.nextJobCategoryId) meta.nextJobCategoryId = 14;
db.set('meta', meta).write();

console.log('Jobs portal database schema created successfully.');
console.log('Collections added: jobs, companies, jobCategories, applications, savedJobs, jobAlerts, jobPayments, jobNotifications');
