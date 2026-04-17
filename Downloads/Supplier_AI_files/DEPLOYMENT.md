# SupplierOS Deployment Guide

## Quick Start Deployment (2-3 minutes)

### **Option 1: Deploy to Render.com (Recommended - FREE)**

#### Step 1: Push to GitHub
```bash
cd /Users/renusapple/Downloads/Supplier_AI_files
git add -A
git commit -m "Add drill-down dashboard and deployment config"
git push origin main
```

#### Step 2: Create Render Account
1. Go to https://render.com
2. Sign up with GitHub account
3. Authorize Render to access your repositories

#### Step 3: Create New Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository (renuka1983/AI_SECURITY_DEMO)
3. Configure as follows:
   - **Name**: supplieros
   - **Branch**: main
   - **Root Directory**: supplieros
   - **Docker**: Dockerfile (already provided)
   - **Plan**: Free

#### Step 4: Deploy
1. Click "Create Web Service"
2. Render will automatically build and deploy
3. Wait 3-5 minutes for build completion
4. Your app will be live at: `https://supplieros-xxxx.onrender.com`

---

### **Option 2: Deploy to Railway.app (Alternative)**

#### Step 1: Push to GitHub (same as above)

#### Step 2: Create Railway Account
1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"

#### Step 3: Select Repository
1. Choose: AI_SECURITY_DEMO
2. Select Root Directory: `supplieros`
3. Railway auto-detects Dockerfile

#### Step 4: Deploy
1. Click "Deploy"
2. Your app will be live at: `https://supplieros-xxxxx.up.railway.app`

---

### **Option 3: Deploy to Fly.io**

#### Step 1: Install Fly CLI
```bash
brew install flyctl
flyctl auth login
```

#### Step 2: Create App
```bash
cd supplieros
flyctl launch
# Respond to prompts:
# - App name: supplieros
# - Region: sjc (San Jose)
# - Do not set up PostgreSQL (free tier)
```

#### Step 3: Deploy
```bash
flyctl deploy
# Your app will be at: https://supplieros-xxx.fly.dev
```

---

## **DETAILED STEP-BY-STEP DEPLOYMENT**

### **Phase 1: Local Preparation**

#### ✅ Step 1: Configure Git
```bash
cd /Users/renusapple/Downloads/Supplier_AI_files
git status
```

**Expected Output:**
```
On branch main
Your branch is up to date with 'origin/main'.
```

#### ✅ Step 2: Stage Changes
```bash
git add supplieros/
git add render.yaml
git status
```

#### ✅ Step 3: Commit Changes
```bash
git commit -m "feat: Add drill-down dashboard, deployment config, and environment setup"
```

#### ✅ Step 4: Push to GitHub
```bash
git push origin main
```

**Expected Output:**
```
Enumerating objects: X, done.
Counting objects: 100% (X/X), done.
Writing objects: 100% (X/X), done.
Total X (delta X), reused Y (delta Z), pack-reused 0
To https://github.com/renuka1983/AI_SECURITY_DEMO.git
   xxxxxxx..xxxxxxx  main -> main
```

---

### **Phase 2: Create Render Account & Service**

#### ✅ Step 5: Create Render Account
1. **Go to**: https://render.com
2. **Click**: "Sign Up"
3. **Choose**: "Continue with GitHub"
4. **Authorize**: Click "Authorize"
5. **Confirm**: Email verification

#### ✅ Step 6: Create Web Service
1. **Dashboard**: Click "New +"
2. **Select**: "Web Service"
3. **Connect GitHub**: Select `AI_SECURITY_DEMO` repo
4. **Auto-Deploy**: Enable

#### ✅ Step 7: Configure Web Service
```
Name:                   supplieros
Environment:            Docker
Root Directory:         supplieros
Dockerfile:             Dockerfile
Plan:                   Free
Region:                 Oregon (or closest to you)
```

6. **Click**: "Create Web Service"

---

### **Phase 3: Deployment & Testing**

#### ✅ Step 8: Monitor Build
1. **Render Dashboard**: Watch build logs
2. **Expected Output**:
   ```
   Building Docker image...
   Step 1/10 : FROM python:3.12-slim
   ...
   Successfully built xxxxx
   Pushing Docker image to registry...
   ✓ Docker image pushed
   ```

#### ✅ Step 9: Verify Deployment
```bash
# Your service URL will be shown as:
# https://supplieros-xxxx.onrender.com

# Test health endpoint
curl https://supplieros-xxxx.onrender.com/api/health
```

**Expected Output**:
```json
{
  "database": "connected",
  "sales_records": 749,
  "skus": 14,
  "status": "ok",
  "timestamp": "2026-04-17T...",
  "version": "1.0.0-poc"
}
```

#### ✅ Step 10: Access Application
1. **Open URL**: https://supplieros-xxxx.onrender.com
2. **Dashboard**: Should load with your drill-down features
3. **Verify**: 
   - ✅ KPI cards visible
   - ✅ KPI cards clickable (blue outline on hover)
   - ✅ Drill-down panels working
   - ✅ Revenue chart loading
   - ✅ Opportunities list visible

---

## **TROUBLESHOOTING**

### **Build Fails**
```
Error: Docker build failed
→ Check Dockerfile path
→ Verify frontend/dist/bundle.js exists
→ Check backend/app.py for syntax errors
```

### **App Won't Start**
```
Error: Health check failed
→ Verify Flask is listening on PORT 8000
→ Check database initialization
→ Review app.py for import errors
```

### **Frontend Not Loading**
```
Blank page or 404 for /bundle.js
→ Ensure frontend/dist/ files are committed to git
→ Re-run build locally: ./build.sh
→ Commit dist/ folder
```

### **Slow Initial Load**
→ Free tier may have cold starts
→ First request takes 30-60 seconds
→ Subsequent requests are fast

---

## **DEPLOYMENT CHECKLIST**

- [ ] Code committed to GitHub
- [ ] render.yaml in place
- [ ] Dockerfile updated
- [ ] Frontend built (dist/ folder populated)
- [ ] Health endpoint responding
- [ ] Render account created
- [ ] Web service created
- [ ] Build completed successfully
- [ ] App URL accessible
- [ ] Dashboard loads
- [ ] Drill-down features working
- [ ] Share URL with team

---

## **MONITORING & MAINTENANCE**

### Auto-Deploy
- App automatically redeploys on git push to `main`
- Build logs visible in Render dashboard
- Rollback to previous deploy if needed

### Health Checks
- Endpoint: `/api/health`
- Checks every 30 seconds
- Auto-restarts on failure

### Performance
- Free tier: ~512MB RAM, 0.5 CPU
- Sufficient for demo/POC
- Upgrade to paid for production

### Data Persistence
- SQLite database is ephemeral on free tier
- Data resets on redeploy
- For persistent data, add PostgreSQL addon

---

## **NEXT STEPS**

### To Scale to Production:
1. Add PostgreSQL database
2. Increase plan to "Standard"
3. Enable auto-scaling
4. Add SSL certificate (included with Render)
5. Set up monitoring/alerts
6. Configure backups

### To Continue Development:
1. Test locally: `python3 app.py 8001`
2. Make changes to dashboard/backend
3. Rebuild frontend: `./build.sh`
4. Commit and push: `git push`
5. Render auto-deploys

---

## **DEPLOYMENT SUCCESS CRITERIA**

✅ **Environment**: Cloud-hosted, accessible via URL
✅ **Frontend**: React dashboard with drill-down working
✅ **Backend**: Flask API responding to all endpoints
✅ **Database**: Connected with demo data loaded
✅ **Performance**: Sub-2s page load time
✅ **Reliability**: 99.5% uptime (free tier)

---

**Estimated Deployment Time**: 5-10 minutes
**Cost**: FREE (on Render/Railway/Fly free tier)
**Maintenance**: Zero (auto-scaling, auto-restarts included)

