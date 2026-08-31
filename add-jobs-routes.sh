#!/usr/bash
# Jobs Portal Integration Script
# This script modifies server.js to add the Jobs Portal

SERVER="/var/www/kenyanihome.com/server.js"

# 1. Add jobs routes import after line 39 (after session middleware)
sed -i '39a\
// Jobs Portal Routes\
const jobsRoutes = require("./routes/jobsPortal");\
const employerRoutes = require("./routes/employerPortal");\
const adminJobsRoutes = require("./routes/adminJobsPortal");' "$SERVER"

# 2. Add route mounting before the admin section (before line 1032 where const admin = express.Router())
sed -i '1031a\
\
// Mount Jobs Portal Routes\
app.use("/jobs", jobsRoutes);\
app.use("/employer", employerRoutes);\
app.use("/admin", adminJobsRoutes);' "$SERVER"

echo "Routes added to server.js"
