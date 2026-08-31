/**
 * Seeds Kenya ni Home with sample stories so the site has content
 * to look at immediately. Safe to run multiple times — it only
 * seeds when there are zero posts.
 *   node seed.js
 */
const db = require('./db');
const slugify = require('slugify');

if (db.get('posts').size().value() > 0) {
  console.log('Posts already exist — skipping seed. Delete data/db.json to reset.');
  process.exit(0);
}

const img = (id) => `https://images.unsplash.com/${id}?w=1200&q=70`;

const demo = [
  {
    title: 'Inside the Quiet Fight Over the City\u2019s Next Power Grid',
    category: 'politics',
    author: 'Walter White',
    featured: true,
    coverImage: img('photo-1473341304170-971dccb5ac1e'),
    excerpt: 'A years-long standoff between regulators and utilities is coming to a head, with residents caught in the middle of a debate over cost, reliability and climate targets.',
    content: `<p>For nearly three years, a dispute few residents have heard of has been quietly reshaping how the city plans to power itself for the next generation.</p>
      <h2>A grid built for a different era</h2>
      <p>Much of the existing infrastructure was built more than four decades ago, designed for a population half the size it is today. Engineers say the system is now running closer to its limits during peak demand than at any point on record.</p>
      <blockquote>"We are not just talking about keeping the lights on anymore. We are talking about whether this city can support the next twenty years of growth." — a senior planning official, speaking on condition of anonymity</blockquote>
      <p>Utility companies argue that a faster transition requires rate increases residents may not be prepared for. Regulators, meanwhile, are pushing for a longer public comment period before any plan is approved.</p>
      <h3>What happens next</h3>
      <p>A final vote is expected within the coming months, and both sides say the outcome will shape not just electricity bills, but the pace of the city's broader climate commitments.</p>`
  },
  {
    title: 'The Small Manufacturers Betting Everything on "Made Local"',
    category: 'business',
    author: 'Sarah Johnson',
    coverImage: img('photo-1581092160562-40aa08e78837'),
    excerpt: 'As supply chains wobble, a wave of small factories are wagering that shoppers will pay more for goods made close to home.',
    content: `<p>On the edge of the industrial district, a converted warehouse now hums with machines that were silent for over a decade.</p>
      <p>Its new owners are part of a small but growing group of manufacturers betting that consumers, rattled by years of shipping delays and price swings, are ready to pay a premium for goods made close to home.</p>
      <h2>A bet on patience</h2>
      <p>The economics are not simple. Labor and materials both cost more domestically, and early data suggests only a slice of shoppers are willing to absorb the difference consistently.</p>
      <p>Still, order books at several local shops have grown steadily over the past year, driven in part by retailers eager to shorten their own supply chains.</p>`
  },
  {
    title: 'What a Decade of Data Says About How Cities Actually Get Cooler',
    category: 'technology',
    author: 'William Anderson',
    coverImage: img('photo-1519389950473-47ba0277781c'),
    excerpt: 'Urban planners have tried everything from painted rooftops to pocket parks. A new analysis shows which interventions actually move the needle.',
    content: `<p>Cities have spent the better part of a decade experimenting with ways to bring down summer temperatures, from reflective rooftops to sprawling tree-planting campaigns.</p>
      <h2>The results are in — mostly</h2>
      <p>A new review of temperature data across dozens of neighborhoods finds that tree canopy consistently outperforms other interventions, while some heavily marketed solutions show only marginal effects.</p>
      <ul>
        <li>Mature tree canopy reduced peak surface temperatures the most consistently</li>
        <li>Reflective roofing helped individual buildings, but did little for street-level heat</li>
        <li>Pocket parks helped most when connected to shaded walking routes</li>
      </ul>
      <p>Researchers caution that results vary significantly by climate and building density, and that no single fix works everywhere.</p>`
  },
  {
    title: 'The Museum Show That Quietly Rewrote the Rules of the Retrospective',
    category: 'culture',
    author: 'Amanda Jepson',
    coverImage: img('photo-1502602898657-3e91760cbb34'),
    excerpt: 'A mid-career survey skips the usual chronological march and, in doing so, changes how audiences experience an artist\u2019s evolution.',
    content: `<p>Retrospectives tend to follow a familiar script: early work, breakthrough, decline or reinvention, arranged neatly by year.</p>
      <p>The latest exhibition at the downtown gallery abandons that structure entirely, grouping pieces by recurring obsession rather than date — color, absence, the human hand — and the effect is disorienting in the best way.</p>
      <h2>Letting the work talk back</h2>
      <p>Curators say the format was a direct response to feedback that traditional retrospectives can flatten an artist's range into a single, tidy narrative.</p>`
  },
  {
    title: 'Behind Closed Doors, Diplomats Are Rewriting the Rules of Engagement',
    category: 'world',
    author: 'Walter White',
    coverImage: img('photo-1526304640581-d334cdbbf45e'),
    excerpt: 'A series of low-profile summits is quietly redrawing how mid-sized nations coordinate on trade, security and climate policy.',
    content: `<p>Away from the cameras, a string of low-profile meetings between mid-sized nations has been steadily reshaping regional alliances.</p>
      <h2>A new kind of coalition</h2>
      <p>Analysts describe the shift as less about grand declarations and more about practical coordination — shared shipping lanes, joint disaster response, and quiet agreements on emissions reporting.</p>
      <p>Whether the approach holds under real pressure remains, diplomats admit, an open question.</p>`
  },
  {
    title: 'The Hidden Cost of "Frictionless" Checkout',
    category: 'business',
    author: 'Sarah Johnson',
    coverImage: img('photo-1556742049-0cfed4f6a45d'),
    excerpt: 'One-click payments were supposed to make shopping effortless. New research suggests they are also making it much easier to overspend.',
    content: `<p>The rise of one-click and saved-card checkout has stripped away nearly every pause point that once separated browsing from buying.</p>
      <p>New research on spending behavior finds that removing those small moments of friction — entering a card number, confirming an address — measurably increases both purchase frequency and basket size.</p>
      <h2>Convenience with a catch</h2>
      <p>Consumer advocates argue that some of these design choices blur the line between convenience and manipulation, particularly for younger shoppers.</p>`
  }
];

let nextId = db.get('meta.nextPostId').value();
const now = new Date();

demo.forEach((d, i) => {
  const daysAgo = i * 2;
  const created = new Date(now.getTime() - daysAgo * 86400000).toISOString();
  const isBreaking = i === 0;
  const breakingExpiry = isBreaking ? new Date(now.getTime() + 3 * 86400000).toISOString() : null;
  db.get('posts')
    .push({
      id: nextId,
      title: d.title,
      slug: slugify(d.title, { lower: true, strict: true }),
      excerpt: d.excerpt,
      content: d.content,
      coverImage: d.coverImage,
      category: d.category,
      author: d.author,
      status: 'published',
      featured: !!d.featured,
      breaking: isBreaking,
      breakingOrder: isBreaking ? 0 : null,
      breakingExpiry: breakingExpiry,
      tags: [d.category],
      views: Math.round(80 + Math.random() * 900),
      deletedAt: null,
      publishAt: null,
      createdAt: created,
      updatedAt: created
    })
    .write();
  nextId++;
});

db.set('meta.nextPostId', nextId).write();

// ---- seed 14 days of traffic history so the dashboard's line chart has a shape to show ----
const dailyViews = {};
for (let i = 13; i >= 0; i--) {
  const d = new Date(now.getTime() - i * 86400000);
  const key = d.toISOString().slice(0, 10);
  dailyViews[key] = Math.round(20 + Math.random() * 140 + (13 - i) * 4);
}
db.set('dailyViews', dailyViews).write();

// ---- a sample sponsor so the ad system has something to show on day one ----
const adId = db.get('meta.nextAdId').value();
db.get('ads')
  .push({
    id: adId,
    title: 'Focus Notebooks — Built for Deep Work',
    description: 'The dot-grid notebook readers of Kenya ni Home keep coming back to. 15% off for newsletter subscribers.',
    link: 'https://example.com',
    imageUrl: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800&q=70',
    videoUrl: '',
    placement: 'both',
    active: true,
    clicks: 0,
    createdAt: now.toISOString()
  })
  .write();
db.set('meta.nextAdId', adId + 1).write();

// ---- a couple of demo comments on the lead story ----
const firstPost = db.get('posts').first().value();
if (firstPost) {
  let commentId = db.get('meta.nextCommentId').value();
  const demoComments = [
    { name: 'Jordan R.', body: "This is exactly the kind of accountability reporting I subscribed for. Really well sourced.", approved: true },
    { name: 'Priya K.', body: 'Would love a follow-up once the vote actually happens next month.', approved: true },
    { name: 'Anonymous', body: 'Check out my crypto trading course at [link removed]', approved: false }
  ];
  demoComments.forEach((c) => {
    db.get('comments')
      .push({
        id: commentId,
        postId: firstPost.id,
        name: c.name,
        body: c.body,
        approved: c.approved,
        createdAt: new Date(now.getTime() - Math.random() * 3 * 86400000).toISOString()
      })
      .write();
    commentId++;
  });
  db.set('meta.nextCommentId', commentId).write();
}

console.log(`Seeded ${demo.length} demo stories, 14 days of traffic history, 1 sample ad, and 3 demo comments.`);
