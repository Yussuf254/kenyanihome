const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcryptjs');

const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db = low(adapter);

// Only write defaults on first run — avoids clobbering existing data
let isFirstRun = !fs.existsSync(path.join(__dirname, 'data', 'db.json')) || fs.statSync(path.join(__dirname, 'data', 'db.json')).size === 0;

db.defaults({
  settings: {
    siteName: 'Kenya ni Home',
    tagline: 'The heart of the nation, always.',
    heroKicker: "Today's Edition",
    aboutTitle: 'Rooted in Kenya. Reporting for Kenyans.',
    aboutBody:
      "Kenya ni Home is an independent newsroom built on one idea: every Kenyan deserves clear, honest, and local reporting. We cover politics, business, culture, technology, and the everyday stories that shape our communities — without noise or bias. Our reporters bring deep experience across Kenyan journalism, and we hold ourselves to a single standard: tell the story plainly, then get out of the way.",
    email: 'newsroom@kenyanihome.co.ke',
    phone: '+254 20 123 4567',
    address: 'Nairobi, Kenya',
    social: { twitter: '#', facebook: '#', instagram: '#', linkedin: '#' },
    footerNote: 'Independent Kenyan journalism.',
    siteUrl: 'http://localhost:3000',
    // Metered soft paywall — UI + counting logic only. Not wired to a real
    // payment processor; see README for how to connect one (e.g. Stripe).
    paywallEnabled: false,
    freeArticleLimit: 3,
    privacyPolicy:
      "Kenya ni Home collects only what's needed to run this site: contact-form messages, newsletter subscriber emails, comments you choose to leave, and basic analytics like page views. We do not sell reader data to third parties. Cookies remember reading preferences (like dark mode) and, if the metered paywall is enabled, count free articles read. You can clear your cookies at any time to reset this. For questions about your data, contact us using the details on the Contact page.",
    termsOfService:
      "By reading Kenya ni Home, you agree to use the site for personal, non-commercial purposes. Story content is the property of Kenya ni Home and its contributing writers and may not be republished without permission. Comments are moderated and may be removed at our discretion if they are abusive, off-topic, or spam. Sponsored content is clearly labeled as such. These terms may be updated from time to time.",
    cookieConsentText:
      'We use cookies to remember your reading preferences (like dark mode and text size) and, if enabled, to count free articles read. By continuing to browse, you agree to our use of cookies.',
    logo: '',
    jobsHeroImage: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80',
    jobsEmployeeImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80',
    jobsEmployerImage: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80',
    aboutImage: '',
    aboutStat1: '120+',
    aboutStat1Label: 'Stories a Month',
    aboutStat2: '18',
    aboutStat2Label: 'Staff Reporters',
    aboutStat3: '2016',
    aboutStat3Label: 'Founded',
    team: JSON.stringify([
      { name: 'Walter White', role: 'Editor-in-Chief', img: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=500&q=70' },
      { name: 'Sarah Johnson', role: 'Managing Editor', img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&q=70' },
      { name: 'William Anderson', role: 'Investigations', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&q=70' },
      { name: 'Amanda Jepson', role: 'Culture Desk', img: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=500&q=70' }
    ]),
    advertising: {
      contactPhone: '+254 700 123 456',
      contactEmail: 'ads@kenyanihome.com',
      supportHours: 'Mon - Fri: 8:00 AM - 5:00 PM',
      heroTitle: 'Advertise With Us',
      heroSubtitle: 'Promote your products or services to thousands of engaged Kenyans.',
      benefits: JSON.stringify([
        { icon: '◎', title: 'Wide Reach', body: 'Get visible to thousands of daily visitors' },
        { icon: '♙', title: 'Targeted Audience', body: 'Reach the right customers for your business' },
        { icon: '▣', title: 'Affordable Plans', body: 'Choose a package that fits your budget' }
      ]),
      packages: JSON.stringify([
        { name: 'Basic Listing', price: 2500, currency: 'KSh', duration: '30 days', features: ['Product listing for 30 days', 'Shown on category page'], badge: '', placement: 'category' },
        { name: 'Featured Listing', price: 5000, currency: 'KSh', duration: '30 days', features: ['Everything in Basic', 'Shown on Advertised Products page', 'Featured badge'], badge: 'Featured', placement: 'advertised' },
        { name: 'Premium Listing', price: 10000, currency: 'KSh', duration: '30 days', features: ['Everything in Featured', 'Shown on homepage', 'Priority placement'], badge: 'Premium', placement: 'homepage' }
      ]),
      whyAdvertise: JSON.stringify([
        { icon: '♧', title: 'Trusted Platform', body: 'Kenya ni Home is a trusted news and marketplace platform.' },
        { icon: '◉', title: 'High Reach', body: 'Reach thousands of engaged readers.' },
        { icon: '◇', title: 'Affordable Packages', body: 'Flexible plans for every business.' },
        { icon: '✓', title: 'Easy Process', body: 'Simple submission and quick approval.' }
      ])
    }
  },
  headerItems: [
    { id: 1, name: 'Home', slug: 'home', type: 'home', order: 0, active: true },
    { id: 2, name: 'About', slug: 'about', type: 'about', order: 1, active: true },
    { id: 3, name: 'Politics', slug: 'politics', type: 'category', order: 2, active: true },
    { id: 4, name: 'Business', slug: 'business', type: 'category', order: 3, active: true },
    { id: 5, name: 'Culture', slug: 'culture', type: 'category', order: 4, active: true },
    { id: 7, name: 'Sports', slug: 'sports', type: 'category', order: 5, active: true },
    { id: 8, name: 'Jobs', slug: 'jobs', type: 'category', order: 6, active: true },
    { id: 9, name: 'Gossips', slug: 'gossips', type: 'category', order: 7, active: true },
    { id: 10, name: 'Travel', slug: 'travel', type: 'category', order: 8, active: true },
    { id: 6, name: 'Contact', slug: 'contact', type: 'contact', order: 9, active: true }
  ],
  categories: [
    { id: 1, name: 'Politics', slug: 'politics', headerItemId: null, order: 0, showInNavigation: false, status: 'published' },
    { id: 2, name: 'Business', slug: 'business', headerItemId: null, order: 0, showInNavigation: false, status: 'published' },
    { id: 3, name: 'Culture', slug: 'culture', headerItemId: null, order: 0, showInNavigation: false, status: 'published' },
    { id: 4, name: 'Technology', slug: 'technology', headerItemId: 4, order: 4, showInNavigation: true, status: 'published' },
    { id: 5, name: 'World', slug: 'world', headerItemId: null, order: 0, showInNavigation: false, status: 'published' },
    { id: 6, name: 'National Politics', slug: 'national-politics', headerItemId: 3, order: 0, showInNavigation: true, status: 'published' },
    { id: 7, name: 'County Politics', slug: 'county-politics', headerItemId: 3, order: 1, showInNavigation: true, status: 'published' },
    { id: 8, name: 'Parliament', slug: 'parliament', headerItemId: 3, order: 2, showInNavigation: true, status: 'published' },
    { id: 9, name: 'Elections', slug: 'elections', headerItemId: 3, order: 3, showInNavigation: true, status: 'published' },
    { id: 10, name: 'Political Parties', slug: 'political-parties', headerItemId: 3, order: 4, showInNavigation: true, status: 'published' },
    { id: 11, name: 'Opinion', slug: 'opinion', headerItemId: 3, order: 5, showInNavigation: true, status: 'published' },
    { id: 12, name: 'Analysis', slug: 'analysis', headerItemId: 3, order: 6, showInNavigation: true, status: 'published' },
    { id: 13, name: 'Economy', slug: 'economy', headerItemId: 4, order: 0, showInNavigation: true, status: 'published' },
    { id: 14, name: 'Entrepreneurship', slug: 'entrepreneurship', headerItemId: 4, order: 1, showInNavigation: true, status: 'published' },
    { id: 15, name: 'Markets', slug: 'markets', headerItemId: 4, order: 2, showInNavigation: true, status: 'published' },
    { id: 16, name: 'Real Estate', slug: 'real-estate', headerItemId: 4, order: 3, showInNavigation: true, status: 'published' },
    { id: 17, name: 'Money', slug: 'money', headerItemId: 4, order: 5, showInNavigation: true, status: 'published' },
    { id: 18, name: 'Companies', slug: 'companies', headerItemId: 4, order: 6, showInNavigation: true, status: 'published' },
    { id: 19, name: 'Jobs', slug: 'jobs', headerItemId: 8, order: 7, showInNavigation: true, status: 'published' },
    { id: 20, name: 'Heritage', slug: 'heritage', headerItemId: 5, order: 0, showInNavigation: true, status: 'published' },
    { id: 21, name: 'People', slug: 'people', headerItemId: 5, order: 1, showInNavigation: true, status: 'published' },
    { id: 22, name: 'Traditions', slug: 'traditions', headerItemId: 5, order: 2, showInNavigation: true, status: 'published' },
    { id: 23, name: 'Lifestyle', slug: 'lifestyle', headerItemId: 5, order: 3, showInNavigation: true, status: 'published' },
    { id: 24, name: 'Travel', slug: 'travel', headerItemId: 5, order: 4, showInNavigation: true, status: 'published' },
    { id: 25, name: 'Food', slug: 'food', headerItemId: 5, order: 5, showInNavigation: true, status: 'published' },
    { id: 26, name: 'Music and Art', slug: 'music-and-art', headerItemId: 5, order: 6, showInNavigation: true, status: 'published' },
    { id: 27, name: 'Education', slug: 'education', headerItemId: null, order: 0, showInNavigation: false, status: 'published' },
    { id: 28, name: 'Agriculture', slug: 'agriculture', headerItemId: null, order: 0, showInNavigation: false, status: 'published' },
    { id: 29, name: 'Sports', slug: 'sports', headerItemId: 7, order: 0, showInNavigation: true, status: 'published' }
  ],
  posts: [],
  messages: [],
  subscribers: [],
  comments: [],
  ads: [],
  adSubmissions: [],
  // { 'YYYY-MM-DD': number } — total site-wide post views per day, powers
  // the traffic line chart on the dashboard.
  dailyViews: {},
  errors: [],
  users: [
    {
      id: 1,
      username: 'admin',
      email: 'admin@kenyanihome.co.ke',
      passwordHash: bcrypt.hashSync('0722358492@Ha', 10),
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      browser: '',
      os: ''
    }
  ],
  meta: { nextPostId: 1, nextCategoryId: 30, nextHeaderItemId: 11, nextCommentId: 1, nextAdId: 1, nextAdSubmissionId: 1, nextUserId: 2, nextNotificationId: 1, nextActivityId: 1, nextPaymentId: 1, nextAdCategoryId: 1, nextAdSubcategoryId: 1 },
  notifications: [],
  activityLogs: [],
  payments: [],
  adCategories: [
    { id: 1, name: 'Electronics', slug: 'electronics', icon: '📱', order: 0, active: true },
    { id: 2, name: 'Clothes & Fashion', slug: 'clothes-fashion', icon: '👕', order: 1, active: true },
    { id: 3, name: 'Watches & Accessories', slug: 'watches-accessories', icon: '⌚', order: 2, active: true },
    { id: 4, name: 'Perfumes & Cosmetics', slug: 'perfumes-cosmetics', icon: '🌸', order: 3, active: true },
    { id: 5, name: 'Vegetables', slug: 'vegetables', icon: '🥬', order: 4, active: true },
    { id: 6, name: 'Fruits', slug: 'fruits', icon: '🍎', order: 5, active: true },
    { id: 7, name: 'Furniture & Home', slug: 'furniture-home', icon: '🪑', order: 6, active: true },
    { id: 8, name: 'Phones & Accessories', slug: 'phones-accessories', icon: '📞', order: 7, active: true },
    { id: 9, name: 'Cars & Automotive', slug: 'cars-automotive', icon: '🚗', order: 8, active: true },
    { id: 10, name: 'Real Estate', slug: 'real-estate', icon: '🏠', order: 9, active: true },
    { id: 11, name: 'Jobs & Employment', slug: 'jobs-employment', icon: '💼', order: 10, active: true },
    { id: 12, name: 'Services', slug: 'services', icon: '🔧', order: 11, active: true },
    { id: 13, name: 'Agriculture & Farm', slug: 'agriculture-farm', icon: '🌾', order: 12, active: true },
    { id: 14, name: 'Health & Beauty', slug: 'health-beauty', icon: '💊', order: 13, active: true },
    { id: 15, name: 'Education', slug: 'education', icon: '📚', order: 14, active: true },
    { id: 16, name: 'Events & Entertainment', slug: 'events-entertainment', icon: '🎉', order: 15, active: true },
    { id: 17, name: 'Food & Restaurants', slug: 'food-restaurants', icon: '🍽️', order: 16, active: true },
    { id: 18, name: 'Travel & Accommodation', slug: 'travel-accommodation', icon: '✈️', order: 17, active: true },
    { id: 19, name: 'Pets & Animals', slug: 'pets-animals', icon: '🐾', order: 18, active: true },
    { id: 20, name: 'Building & Construction', slug: 'building-construction', icon: '🏗️', order: 19, active: true },
    { id: 21, name: 'Land & Plots', slug: 'land-plots', icon: '🌍', order: 20, active: true }
  ],
  adSubcategories: [
    { id: 1, categoryId: 1, name: 'TVs', slug: 'tvs', order: 0 },
    { id: 2, categoryId: 1, name: 'Laptops & Computers', slug: 'laptops-computers', order: 1 },
    { id: 3, categoryId: 1, name: 'Audio & Sound Systems', slug: 'audio-sound', order: 2 },
    { id: 4, categoryId: 1, name: 'Cameras', slug: 'cameras', order: 3 },
    { id: 5, categoryId: 1, name: 'Home Appliances', slug: 'home-appliances', order: 4 },
    { id: 6, categoryId: 2, name: 'Men\'s Clothing', slug: 'mens-clothing', order: 0 },
    { id: 7, categoryId: 2, name: 'Women\'s Clothing', slug: 'womens-clothing', order: 1 },
    { id: 8, categoryId: 2, name: 'Kids & Baby', slug: 'kids-baby', order: 2 },
    { id: 9, categoryId: 2, name: 'Shoes', slug: 'shoes', order: 3 },
    { id: 10, categoryId: 3, name: 'Men\'s Watches', slug: 'mens-watches', order: 0 },
    { id: 11, categoryId: 3, name: 'Women\'s Watches', slug: 'womens-watches', order: 1 },
    { id: 12, categoryId: 3, name: 'Bags & Wallets', slug: 'bags-wallets', order: 2 },
    { id: 13, categoryId: 3, name: 'Sunglasses', slug: 'sunglasses', order: 3 },
    { id: 14, categoryId: 4, name: 'Perfumes', slug: 'perfumes', order: 0 },
    { id: 15, categoryId: 4, name: 'Skincare', slug: 'skincare', order: 1 },
    { id: 16, categoryId: 4, name: 'Makeup', slug: 'makeup', order: 2 },
    { id: 17, categoryId: 4, name: 'Hair Care', slug: 'hair-care', order: 3 },
    { id: 18, categoryId: 5, name: 'Fresh Vegetables', slug: 'fresh-vegetables', order: 0 },
    { id: 19, categoryId: 5, name: 'Leafy Greens', slug: 'leafy-greens', order: 1 },
    { id: 20, categoryId: 5, name: 'Root Vegetables', slug: 'root-vegetables', order: 2 },
    { id: 21, categoryId: 6, name: 'Tropical Fruits', slug: 'tropical-fruits', order: 0 },
    { id: 22, categoryId: 6, name: 'Citrus Fruits', slug: 'citrus-fruits', order: 1 },
    { id: 23, categoryId: 6, name: 'Imported Fruits', slug: 'imported-fruits', order: 2 },
    { id: 24, categoryId: 7, name: 'Sofas & Couches', slug: 'sofas-couches', order: 0 },
    { id: 25, categoryId: 7, name: 'Beds & Mattresses', slug: 'beds-mattresses', order: 1 },
    { id: 26, categoryId: 7, name: 'Tables & Chairs', slug: 'tables-chairs', order: 2 },
    { id: 27, categoryId: 7, name: 'Kitchenware', slug: 'kitchenware', order: 3 },
    { id: 28, categoryId: 8, name: 'Smartphones', slug: 'smartphones', order: 0 },
    { id: 29, categoryId: 8, name: 'Phone Accessories', slug: 'phone-accessories', order: 1 },
    { id: 30, categoryId: 8, name: 'Tablets', slug: 'tablets', order: 2 },
    { id: 31, categoryId: 9, name: 'Cars for Sale', slug: 'cars-sale', order: 0 },
    { id: 32, categoryId: 9, name: 'Motorbikes & Boda', slug: 'motorbikes-boda', order: 1 },
    { id: 33, categoryId: 9, name: 'Car Parts & Spares', slug: 'car-parts', order: 2 },
    { id: 34, categoryId: 9, name: 'Tyres & Wheels', slug: 'tyres-wheels', order: 3 },
    { id: 35, categoryId: 10, name: 'Houses for Sale', slug: 'houses-sale', order: 0 },
    { id: 36, categoryId: 10, name: 'Houses for Rent', slug: 'houses-rent', order: 1 },
    { id: 37, categoryId: 10, name: 'Commercial Property', slug: 'commercial-property', order: 2 },
    { id: 38, categoryId: 10, name: 'Land for Sale', slug: 'land-sale', order: 3 },
    { id: 39, categoryId: 11, name: 'Driver Jobs', slug: 'driver-jobs', order: 0 },
    { id: 40, categoryId: 11, name: 'Office Jobs', slug: 'office-jobs', order: 1 },
    { id: 41, categoryId: 11, name: 'Casual & Mjengo', slug: 'casual-mjengo', order: 2 },
    { id: 42, categoryId: 11, name: 'Online & Remote', slug: 'online-remote', order: 3 },
    { id: 43, categoryId: 12, name: 'Plumbing', slug: 'plumbing', order: 0 },
    { id: 44, categoryId: 12, name: 'Electrical', slug: 'electrical', order: 1 },
    { id: 45, categoryId: 12, name: 'Cleaning', slug: 'cleaning', order: 2 },
    { id: 46, categoryId: 12, name: 'Moving & Transport', slug: 'moving-transport', order: 3 },
    { id: 47, categoryId: 13, name: 'Seeds & Fertilizer', slug: 'seeds-fertilizer', order: 0 },
    { id: 48, categoryId: 13, name: 'Livestock', slug: 'livestock', order: 1 },
    { id: 49, categoryId: 13, name: 'Farm Equipment', slug: 'farm-equipment', order: 2 },
    { id: 50, categoryId: 13, name: 'Organic Produce', slug: 'organic-produce', order: 3 },
    { id: 51, categoryId: 14, name: 'Supplements', slug: 'supplements', order: 0 },
    { id: 52, categoryId: 14, name: 'Gym & Fitness', slug: 'gym-fitness', order: 1 },
    { id: 53, categoryId: 14, name: 'Salon Services', slug: 'salon-services', order: 2 },
    { id: 54, categoryId: 15, name: 'Online Courses', slug: 'online-courses', order: 0 },
    { id: 55, categoryId: 15, name: 'Tutoring', slug: 'tutoring', order: 1 },
    { id: 56, categoryId: 15, name: 'Books & Stationery', slug: 'books-stationery', order: 2 },
    { id: 57, categoryId: 16, name: 'Concerts & Shows', slug: 'concerts-shows', order: 0 },
    { id: 58, categoryId: 16, name: 'Parties & Catering', slug: 'parties-catering', order: 1 },
    { id: 59, categoryId: 16, name: 'Photography', slug: 'photography', order: 2 },
    { id: 60, categoryId: 17, name: 'Restaurants', slug: 'restaurants', order: 0 },
    { id: 61, categoryId: 17, name: 'Bakeries & Cakes', slug: 'bakeries-cakes', order: 1 },
    { id: 62, categoryId: 17, name: 'Street Food', slug: 'street-food', order: 2 },
    { id: 63, categoryId: 18, name: 'Hotels & Lodges', slug: 'hotels-lodges', order: 0 },
    { id: 64, categoryId: 18, name: 'Airbnb & Shortlet', slug: 'airbnb-shortlet', order: 1 },
    { id: 65, categoryId: 18, name: 'Tours & Safaris', slug: 'tours-safaris', order: 2 },
    { id: 66, categoryId: 19, name: 'Dogs & Puppies', slug: 'dogs-puppies', order: 0 },
    { id: 67, categoryId: 19, name: 'Cats & Kittens', slug: 'cats-kittens', order: 1 },
    { id: 68, categoryId: 19, name: 'Pet Supplies', slug: 'pet-supplies', order: 2 },
    { id: 69, categoryId: 20, name: 'Contractors', slug: 'contractors', order: 0 },
    { id: 70, categoryId: 20, name: 'Building Materials', slug: 'building-materials', order: 1 },
    { id: 71, categoryId: 20, name: 'Plumbing & Electrical', slug: 'plumbing-electrical', order: 2 },
    { id: 72, categoryId: 21, name: 'Residential Land', slug: 'residential-land', order: 0 },
    { id: 73, categoryId: 21, name: 'Commercial Land', slug: 'commercial-land', order: 1 },
    { id: 74, categoryId: 21, name: 'Agricultural Land', slug: 'agricultural-land', order: 2 }
  ],
  
  // Jobs portal collections
  jobs: [],
  companies: [],
  jobCategories: [],
  applications: [],
  savedJobs: [],
  jobAlerts: [],
  jobPayments: [],
  jobNotifications: [],
  
  meta: { 
    nextPostId: 1, 
    nextCategoryId: 30, 
    nextHeaderItemId: 11, 
    nextCommentId: 1, 
    nextAdId: 1, 
    nextAdSubmissionId: 1, 
    nextUserId: 2,
    nextNotificationId: 1, 
    nextActivityId: 1, 
    nextPaymentId: 1, 
    nextAdCategoryId: 1, 
    nextAdSubcategoryId: 1,
    nextCompanyId: 1,
    nextJobId: 1,
    nextApplicationId: 1,
    nextSavedJobId: 1,
    nextJobAlertId: 1,
    nextJobPaymentId: 1,
    nextJobCategoryId: 14
  }
});

if (isFirstRun) db.write();

// --- migration: backfill fields added in later versions, so an existing
// data/db.json from an earlier release keeps working without a reset ---
let changed = false;

(db.get('posts').value() || []).forEach((p) => {
    if (p.views === undefined) { p.views = 0; changed = true; }
    if (p.deletedAt === undefined) { p.deletedAt = null; changed = true; }
    if (p.publishAt === undefined) { p.publishAt = null; changed = true; }
    if (p.shares === undefined) { p.shares = 0; changed = true; }
    if (p.sponsored === undefined) { p.sponsored = false; changed = true; }
    if (p.breaking === undefined) { p.breaking = false; changed = true; }
    if (p.breakingExpiry === undefined) { p.breakingExpiry = null; changed = true; }
    if (p.breakingOrder === undefined) { p.breakingOrder = null; changed = true; }
    if (p.gallery === undefined) { p.gallery = []; changed = true; }
    if (p.audioUrl === undefined) { p.audioUrl = ''; changed = true; }
    if (p.documents === undefined) { p.documents = []; changed = true; }
  });

(db.get('users').value() || []).forEach((u) => {
    if (u.email === undefined) { u.email = u.username + '@kenyanihome.co.ke'; changed = true; }
    if (u.role === undefined) { u.role = 'admin'; changed = true; }
    if (u.status === undefined) { u.status = 'active'; changed = true; }
    if (u.createdAt === undefined) { u.createdAt = new Date().toISOString(); changed = true; }
    if (u.lastLoginAt === undefined) { u.lastLoginAt = null; changed = true; }
    if (u.browser === undefined) { u.browser = ''; changed = true; }
    if (u.os === undefined) { u.os = ''; changed = true; }
  });

(db.get('subscribers').value() || []).forEach((s) => {
    if (s.phone === undefined) { s.phone = ''; changed = true; }
  });

// --- migration: backfill headerItems collection if missing ---
if (db.get('headerItems').value() === undefined) {
  db.set('headerItems', [
    { id: 1, name: 'Home', slug: 'home', type: 'home', order: 0, active: true },
    { id: 2, name: 'About', slug: 'about', type: 'about', order: 1, active: true },
    { id: 3, name: 'Politics', slug: 'politics', type: 'category', order: 2, active: true },
    { id: 4, name: 'Business', slug: 'business', type: 'category', order: 3, active: true },
    { id: 5, name: 'Culture', slug: 'culture', type: 'category', order: 4, active: true },
    { id: 6, name: 'Contact', slug: 'contact', type: 'contact', order: 5, active: true }
  ]).write();
  changed = true;
}

// --- migration: backfill nextHeaderItemId in meta if missing ---
const currentMeta = db.get('meta').value() || {};
if (currentMeta.nextHeaderItemId === undefined) {
  const maxId = (db.get('headerItems').value() || []).reduce((max, hi) => Math.max(max, hi.id), 0);
  currentMeta.nextHeaderItemId = maxId + 1;
  db.set('meta', currentMeta).write();
  changed = true;
}

// --- migration: backfill new fields on existing categories ---
const existingCategories = db.get('categories').value() || [];
if (existingCategories.length > 0) {
  // Map known slugs to header item ids for initial assignment
  const slugToHeaderItem = {
    politics: null,    // Politics IS the header item
    business: null,    // Business IS the header item
    culture: null,     // Culture IS the header item
    technology: 4,     // Tech goes under Business
    world: null,
    'music-and-art': 5, // Music and Art goes under Culture
    education: null,
    agriculture: null
  };
  let orderCounter = 0;
  existingCategories.forEach((c) => {
    let catChanged = false;
    if (c.headerItemId === undefined) { c.headerItemId = slugToHeaderItem[c.slug] || null; catChanged = true; }
    if (c.order === undefined) { c.order = orderCounter; catChanged = true; }
    if (c.showInNavigation === undefined) { c.showInNavigation = c.headerItemId !== null; catChanged = true; }
    if (c.status === undefined) { c.status = 'published'; catChanged = true; }
    if (catChanged) changed = true;
    orderCounter++;
  });
}

// --- migration: seed default child categories if none exist beyond the originals ---
const childCategories = (db.get('categories').filter((c) => c.headerItemId !== null).value() || []);
if (childCategories.length === 0) {
  const seedCategories = [
    { name: 'National Politics', slug: 'national-politics', headerItemId: 3, order: 0 },
    { name: 'County Politics', slug: 'county-politics', headerItemId: 3, order: 1 },
    { name: 'Parliament', slug: 'parliament', headerItemId: 3, order: 2 },
    { name: 'Elections', slug: 'elections', headerItemId: 3, order: 3 },
    { name: 'Political Parties', slug: 'political-parties', headerItemId: 3, order: 4 },
    { name: 'Opinion', slug: 'opinion', headerItemId: 3, order: 5 },
    { name: 'Analysis', slug: 'analysis', headerItemId: 3, order: 6 },
    { name: 'Economy', slug: 'economy', headerItemId: 4, order: 0 },
    { name: 'Entrepreneurship', slug: 'entrepreneurship', headerItemId: 4, order: 1 },
    { name: 'Markets', slug: 'markets', headerItemId: 4, order: 2 },
    { name: 'Real Estate', slug: 'real-estate', headerItemId: 4, order: 3 },
    { name: 'Money', slug: 'money', headerItemId: 4, order: 5 },
    { name: 'Companies', slug: 'companies', headerItemId: 4, order: 6 },
    { name: 'Jobs', slug: 'jobs', headerItemId: 4, order: 7 },
    { name: 'Heritage', slug: 'heritage', headerItemId: 5, order: 0 },
    { name: 'People', slug: 'people', headerItemId: 5, order: 1 },
    { name: 'Traditions', slug: 'traditions', headerItemId: 5, order: 2 },
    { name: 'Lifestyle', slug: 'lifestyle', headerItemId: 5, order: 3 },
    { name: 'Travel', slug: 'travel', headerItemId: 10, order: 4 },
    { name: 'Food', slug: 'food', headerItemId: 5, order: 5 },
    { name: 'Gossips', slug: 'gossips', headerItemId: 9, order: 0 }
  ];
  const nextId = db.get('meta.nextCategoryId').value() || 30;
  const baseId = nextId;
  seedCategories.forEach((sc, i) => {
    sc.id = baseId + i;
    sc.showInNavigation = true;
    sc.status = 'published';
  });
  db.get('categories').push(...seedCategories).write();
  db.set('meta.nextCategoryId', baseId + seedCategories.length).write();
  changed = true;
}

const settingsDefaults = {
  siteUrl: 'http://localhost:3000',
  paywallEnabled: false,
  freeArticleLimit: 3,
  cookieConsentText:
    'We use cookies to remember your reading preferences (like dark mode and text size) and, if enabled, to count free articles read. By continuing to browse, you agree to our use of cookies.'
};
const currentSettings = db.get('settings').value() || {};
Object.keys(settingsDefaults).forEach((key) => {
  if (currentSettings[key] === undefined) {
    currentSettings[key] = settingsDefaults[key];
    changed = true;
  }
});
if (changed) db.set('settings', currentSettings).write();

['comments', 'ads', 'adSubmissions', 'errors'].forEach((key) => {
  if (db.get(key).value() === undefined) {
    db.set(key, key === 'errors' ? [] : []).write();
    changed = true;
  }
});
if (db.get('dailyViews').value() === undefined) {
  db.set('dailyViews', {}).write();
  changed = true;
}

const meta = db.get('meta').value() || {};
if (meta.nextUserId === undefined) { meta.nextUserId = 2; changed = true; }
if (meta.nextNotificationId === undefined) { meta.nextNotificationId = 1; changed = true; }
if (meta.nextActivityId === undefined) { meta.nextActivityId = 1; changed = true; }
if (meta.nextPaymentId === undefined) { meta.nextPaymentId = 1; changed = true; }
if (meta.nextAdSubmissionId === undefined) { meta.nextAdSubmissionId = 1; changed = true; }
if (meta.nextAdCategoryId === undefined) { meta.nextAdCategoryId = 1; changed = true; }
if (meta.nextAdSubcategoryId === undefined) { meta.nextAdSubcategoryId = 1; changed = true; }
if (changed) db.set('meta', meta).write();

if (db.get('notifications').value() === undefined) {
  db.set('notifications', []).write();
  changed = true;
}
if (db.get('activityLogs').value() === undefined) {
  db.set('activityLogs', []).write();
}
if (db.get('payments').value() === undefined) {
  db.set('payments', []).write();
  changed = true;
}

if (db.get('adCategories').value() === undefined) {
  db.set('adCategories', []).write();
  changed = true;
}
if (db.get('adSubcategories').value() === undefined) {
  db.set('adSubcategories', []).write();
  changed = true;
}

const adSettings = db.get('settings.advertising').value() || {};
if (!adSettings || !Array.isArray(adSettings.packages) || !adSettings.packages.length || !Array.isArray(adSettings.whyAdvertise) || !adSettings.whyAdvertise.length) {
  const defaults = {
    contactPhone: '+254 700 123 456',
    contactEmail: 'ads@kenyanihome.com',
    supportHours: 'Mon - Fri: 8:00 AM - 5:00 PM',
    heroTitle: 'Advertise With Us',
    heroSubtitle: 'Promote your products or services to thousands of engaged Kenyans.',
    packages: [
      { name: 'Basic Listing', price: 2500, currency: 'KSh', duration: '30 days', features: ['Product listing for 30 days', 'Shown on category page'], badge: '', placement: 'category' },
      { name: 'Featured Listing', price: 5000, currency: 'KSh', duration: '30 days', features: ['Everything in Basic', 'Shown on Advertised Products page', 'Featured badge'], badge: 'Featured', placement: 'advertised' },
      { name: 'Premium Listing', price: 10000, currency: 'KSh', duration: '30 days', features: ['Everything in Featured', 'Shown on homepage', 'Priority placement'], badge: 'Premium', placement: 'homepage' }
    ],
    whyAdvertise: [
      { icon: '♧', title: 'Trusted Platform', body: 'Kenya ni Home is a trusted news and marketplace platform.' },
      { icon: '◉', title: 'High Reach', body: 'Reach thousands of engaged readers.' },
      { icon: '◇', title: 'Affordable Packages', body: 'Flexible plans for every business.' },
      { icon: '✓', title: 'Easy Process', body: 'Simple submission and quick approval.' }
    ],
    benefits: [
      { icon: '◎', title: 'Wide Reach', body: 'Get visible to thousands of daily visitors' },
      { icon: '♙', title: 'Targeted Audience', body: 'Reach the right customers for your business' },
      { icon: '▣', title: 'Affordable Plans', body: 'Choose a package that fits your budget' }
    ]
  };
  db.set('settings.advertising', { ...(adSettings || {}), ...defaults }).write();
  changed = true;
}

// --- migration: jobs portal collections ---
['jobs', 'companies', 'jobCategories', 'applications', 'savedJobs', 'jobAlerts', 'jobPayments', 'jobNotifications'].forEach((key) => {
  if (db.get(key).value() === undefined) {
    db.set(key, []).write();
    changed = true;
  }
});

const jobMeta = db.get('meta').value() || {};
if (jobMeta.nextCompanyId === undefined) { jobMeta.nextCompanyId = 1; changed = true; }
if (jobMeta.nextJobId === undefined) { jobMeta.nextJobId = 1; changed = true; }
if (jobMeta.nextApplicationId === undefined) { jobMeta.nextApplicationId = 1; changed = true; }
if (jobMeta.nextSavedJobId === undefined) { jobMeta.nextSavedJobId = 1; changed = true; }
if (jobMeta.nextJobAlertId === undefined) { jobMeta.nextJobAlertId = 1; changed = true; }
if (jobMeta.nextJobPaymentId === undefined) { jobMeta.nextJobPaymentId = 1; changed = true; }
if (jobMeta.nextJobCategoryId === undefined) { jobMeta.nextJobCategoryId = 14; changed = true; }

if (changed) db.write();

module.exports = db;
