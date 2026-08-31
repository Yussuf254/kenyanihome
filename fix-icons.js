var db = require('./db');

var shield = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
var eye = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
var tag = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
var check = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

var ads = db.get('settings.advertising').value() || {};
if (ads.whyAdvertise && ads.whyAdvertise.length === 4) {
  ads.whyAdvertise[0].icon = shield;
  ads.whyAdvertise[1].icon = eye;
  ads.whyAdvertise[2].icon = tag;
  ads.whyAdvertise[3].icon = check;
  db.set('settings.advertising', ads).write();
  console.log('Updated DB with SVG strings');
  console.log(JSON.stringify(ads.whyAdvertise, null, 2));
} else {
  console.log('whyAdvertise not found or wrong length:', ads.whyAdvertise && ads.whyAdvertise.length);
}
