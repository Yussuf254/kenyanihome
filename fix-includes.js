const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'views/admin/jobs');
const files = [
  'pending.ejs',
  'published.ejs',
  'employers.ejs',
  'applications.ejs',
  'application.ejs',
  'view.ejs',
  'categories.ejs'
];

files.forEach(file => {
  const filePath = path.join(viewsDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Fix include paths from partials/ to ../partials/
    content = content.replace(/include\('partials\//g, "include('../partials/");
    content = content.replace(/include\("partials\//g, 'include("../partials/');
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${file}`);
  } else {
    console.log(`File not found: ${file}`);
  }
});
