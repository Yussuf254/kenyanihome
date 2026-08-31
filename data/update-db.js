const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

db.posts[3].breaking = true;
db.posts[3].breakingExpiry = '2026-08-20T23:59';

const newPost = {
  id: 9,
  title: "Safaricom Launches Africa's First AI-Powered Fraud Shield for M-Pesa, Blocking SIM-Swap Scams in Real Time",
  slug: 'safaricom-launches-ai-fraud-shield-for-m-pesa-blocking-sim-swap-scams',
  excerpt: 'Safaricom has deployed an on-device artificial intelligence model across its M-Pesa network that flags suspicious transfers in real time, marking a major upgrade in Kenya\'s fight against mobile money fraud.',
  content: '<div class="paragraph" dir="auto" style="font-family: sans-serif;">Nairobi, Kenya — Safaricom has rolled out an on-device AI model that intercepts suspicious M-Pesa transactions in real time.</div><div class="paragraph" dir="auto" style="font-family: sans-serif;">The new AI Fraud Shield analyzes behavioral patterns and device signals on the handset before a transaction is completed, flagging anomalies without sending sensitive customer data to external servers.</div><div class="paragraph" dir="auto" style="font-family: sans-serif;">Industry watchers say the deployment positions Kenya as an early adopter of privacy-preserving AI in financial services on the continent.</div>',
  coverImage: '/public/uploads/1786610287072-kenya-ni-home-main.png',
  category: 'technology',
  author: 'Kevin Otieno',
  status: 'published',
  featured: false,
  tags: ['Safaricom', 'M-Pesa', 'AI', 'fintech'],
  views: 0,
  deletedAt: null,
  publishAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  shares: 0,
  sponsored: false,
  gallery: [],
  audioUrl: '',
  documents: [],
  breaking: true,
  breakingExpiry: '2026-08-23T23:59',
  breakingOrder: 0,
  trending: true,
  photoCredit: ''
};

db.posts.push(newPost);
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('Posts now:', db.posts.length);
console.log('Last ID:', db.posts[db.posts.length-1].id);
