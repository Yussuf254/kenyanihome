# Kenya ni Home

A premium news-blog site with a built-in content management system, built on
Node.js, Express and EJS. No external database required — content is stored
in a local JSON file (`data/db.json`) via lowdb, and images are stored on
disk in `public/uploads/`.

## What's included

- **Public-facing site** — home page, single post, category pages, search, about,
  and contact, all rendered dynamically from your content.
- **CMS at `/admin`** — sign in, then create/edit/delete posts with a
  rich-text editor, manage categories, upload and reuse images from a media
  library, read messages submitted through the contact form, and edit site
  settings (name, tagline, about copy, contact details, social links).
- **Expanded dashboard** — stats on published/draft/scheduled posts, weekly
  publishing pace, average read time and total words published, a Quick
  Draft box, a Draft Queue (oldest first), a Scheduled Stories list, a
  "Needs Attention" checklist for published posts missing a cover image,
  excerpt or tags, a mini calendar of this month's publishing activity, a
  Stories-by-Section breakdown, a Most Read (all-time views) list, and
  newest contact messages.
- **Scheduled publishing** — set a post's status to "Scheduled" and pick a
  future date/time; it stays hidden from the public site and automatically
  goes live the moment that time arrives (checked whenever the site or CMS
  is visited — no separate process to run).
- **Trash** — deleting a post moves it to `Trash` instead of erasing it
  immediately. Restore it any time, or delete it permanently from there.
- **Newsletter signups** — the "Weekly Focus" box on the homepage now
  actually collects email addresses, viewable and removable under
  `Subscribers` in the CMS.
- **View tracking** — every time a post is read on the public site its view
  count increments, powering the dashboard's "Most Read" widget and a
  read-count shown on the post itself.
- **Dashboard charts** — a traffic line chart (last 14 days), a doughnut
  chart of stories by section, and a bar chart comparing views/shares/
  comments on your top stories, all built with Chart.js.
- **Photo galleries** — attach multiple images to a story for a lightbox
  carousel below the body text.
- **Video embeds** — paste a YouTube or Vimeo link into the story editor to
  drop in a responsive embed.
- **Audio narration** — attach an audio file or URL to a story for a
  "Listen to this story" player on the published page.
- **Comments** — readers can comment on any story; comments are held for
  moderation and only appear once approved under `Comments` in the CMS.
- **Social sharing** — real share links (X, Facebook, LinkedIn, email, copy
  link) on every story, with share counts tracked and shown on the
  dashboard's engagement chart.
- **Advertising / sponsors** — create image or video ads under
  `Advertising`, place them in the homepage sidebar, in-article, or both,
  and track clicks. Sponsored posts can also be flagged and labeled.
- **Metered soft paywall** *(optional, off by default)* — turn it on in
  Settings to blur story content after a set number of free articles per
  reader. This is a front-end demo only, using `localStorage` — it is not
  connected to any real payment processor. To take payments, you'd pair
  this with a service like Stripe Checkout or Stripe Billing.
- **RSS feed** (`/rss.xml`) and **sitemap** (`/sitemap.xml`) for readers
  and search engines.
- **Open Graph / Twitter Card meta tags** and **schema.org Article
  structured data** on every story, so shared links and search results show
  proper previews.
- **Search filters** — narrow search results by category and sort by
  newest/oldest.
- **Dark mode** and a **font-size adjuster**, both in the top of the page,
  with the choice remembered across visits.
- **Cookie consent banner**, plus editable **Privacy Policy** and **Terms
  of Service** pages (edit the text in Settings).
- **Error log** — server-side errors and 404s are recorded under `Logs` in
  the CMS so you can spot problems without digging through server output.
- **Design** — an editorial identity built around a "viewfinder" motif
  (aperture mark, corner-bracket image frames), set in Montserrat
  throughout, with a signal-red accent — distinct from the original
  template.

## Requirements

- Node.js 18 or newer (comes with npm)

## Setup

```bash
cd sema-news
npm install
cp .env.example .env      # optional — customize PORT / SESSION_SECRET
npm start
```

The site runs at **http://localhost:3000**.
The CMS is at **http://localhost:3000/admin/login**.

### Default login

```
Username: admin
Password: kenyanihome2026
```

**Change this password immediately** — sign in, go to *Settings*, and use
the "Change Password" form on the right.

### Demo content

The site ships with six sample stories already published (via
`data/db.json`) so you can see the design in action right away. To start
from a completely empty site instead, delete `data/db.json` and restart the
server — it will regenerate with your site settings and categories, but no
posts. You can also re-run the seed script at any time on an empty database:

```bash
node seed.js
```

## Using the CMS

- **Posts** — `Posts → New Post`. Write your headline and deck, use the
  toolbar above the story body to format text (bold/italic, headings,
  quotes, lists, links), click the image icon to insert a photo from your
  media library into the body, choose a category and byline, upload or pick
  a cover image, and set status to *Published* (or leave as *Draft* to keep
  it hidden from the public site). Check "Feature on homepage" to make it
  the lead story.
- **Media Library** — `Media Library → Upload`, select one or more images
  (JPG/PNG/GIF/WEBP/SVG, up to 8MB each). Uploaded images can be reused
  across any post via "choose from your media library."
- **Categories** — add or remove sections from `Categories`. They
  automatically appear in the site navigation.
- **Messages** — anything submitted through the public Contact form shows
  up under `Messages`, with a one-click "reply by email" link.
- **Comments** — moderate reader comments under `Comments`: approve to
  publish them on the story, or delete spam/abuse. New comments start
  hidden until approved.
- **Advertising** — `Advertising → New Ad`. Add a title, description, and
  destination link, then either upload an image or paste a YouTube/Vimeo
  URL for a video ad. Choose where it shows (sidebar, in-article, or both)
  and toggle it active/paused any time. Clicks are tracked automatically.
- **Settings** — update the site name, tagline, about page copy, contact
  info, social links, site URL (used in the RSS feed and sitemap), the
  metered paywall, and the Privacy Policy / Terms of Service / cookie
  banner text — all reflected across the live site immediately.

## Project structure

```
sema-news/
├── server.js            Express app + all routes (public + admin)
├── db.js                lowdb setup, defaults, and demo admin user
├── seed.js              optional demo-content seeder
├── data/db.json          all content — posts, categories, settings, users
├── public/
│   ├── css/style.css     public site styles
│   ├── css/admin.css     CMS styles
│   └── uploads/          uploaded images (created automatically)
└── views/                EJS templates (public pages + views/admin)
```

## Deploying

This is a standard Node/Express app and can be deployed to any Node host
(Render, Railway, Fly.io, a VPS, etc.). A few notes:

- Set a strong, random `SESSION_SECRET` in your environment.
- `data/db.json` and `public/uploads/` must live on **persistent** storage —
  on platforms with ephemeral filesystems (e.g. most serverless hosts),
  attach a volume or switch to a real database and object storage before
  going live.
- Put the app behind HTTPS (most hosts handle this automatically) so admin
  login credentials aren't sent in plain text.
- Consider adding a process manager (`pm2`) or your host's built-in restart
  policy so the app comes back up automatically if it crashes.

## Customizing the design

All design tokens (colors, fonts) are defined as CSS variables at the top of
`public/css/style.css` (public site) and `public/css/admin.css` (CMS). Fonts
are loaded from Google Fonts in `views/partials/head.ejs` and
`views/admin/partials/head.ejs`.
