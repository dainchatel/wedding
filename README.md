# Wedding App

A simple single-page Node.js app with password protection for your wedding website.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
export WEDDING_PASSWORD=your-secret-password
export SESSION_SECRET=your-session-secret
```

3. Run the server:
```bash
npm start
```

The app will be available at `http://localhost:3000`

## Heroku Deployment

### Initial Setup

1. **Install Heroku CLI** (if not already installed):
   - Download from: https://devcenter.heroku.com/articles/heroku-cli
   - Or via Homebrew: `brew install heroku/brew/heroku`

2. **Login to Heroku**:
```bash
heroku login
```

3. **Initialize Git** (if not already done):
```bash
git init
git add .
git commit -m "Initial commit"
```

4. **Create Heroku App**:
```bash
heroku create your-app-name
```
(Replace `your-app-name` with your desired app name, or leave it out for a random name)

5. **Set Environment Variables** in Heroku:
```bash
heroku config:set WEDDING_PASSWORD=your-secret-password
heroku config:set SESSION_SECRET=$(openssl rand -base64 32)
heroku config:set NODE_ENV=production
```
   - Replace `your-secret-password` with your actual password
   - The `SESSION_SECRET` command generates a random secure string

6. **Deploy to Heroku**:
```bash
git push heroku main
```
(If your default branch is `master`, use `git push heroku master`)

7. **Open your app**:
```bash
heroku open
```

### Connecting Your GoDaddy Domain

Follow these steps to connect your existing GoDaddy domain to your Heroku app:

#### Step 1: Add Domain in Heroku Dashboard

1. Go to https://dashboard.heroku.com/apps
2. Click on your app name
3. Click the **Settings** tab
4. Scroll down to the **Domains** section
5. Click **Add domain**
6. Enter your domain name (e.g., `emmadain.com` or `www.emmadain.com`)
   - **Important**: Add BOTH the root domain (`emmadain.com`) AND the www subdomain (`www.emmadain.com`) separately
7. Click **Save** for each domain you add

#### Step 2: Get Heroku DNS Target

After adding your domain(s), Heroku will display a DNS target that looks like:
```
your-app-name.herokudns.com
```
**Copy this DNS target** - you'll need it for the next step.

#### Step 3: Configure DNS Records in GoDaddy

1. Log into your GoDaddy account
2. Go to **My Products** → **Domains**
3. Find and click on your domain name
4. Click **DNS** (or **Manage DNS**)

Now you need to set up DNS records:

**For the root domain (`emmadain.com`):**
- Look for an existing `A` record with name `@` (or blank)
- **Delete** that `A` record if it exists
- Click **Add** to create a new record:
  - **Type**: Select `CNAME`
  - **Name**: Enter `@` (or leave blank - depends on GoDaddy's interface)
  - **Value**: Paste your Heroku DNS target (e.g., `your-app-name.herokudns.com`)
  - **TTL**: 600 seconds (or leave default)
- Click **Save**

**For the www subdomain (`www.emmadain.com`):**
- Click **Add** to create a new record:
  - **Type**: Select `CNAME`
  - **Name**: Enter `www`
  - **Value**: Paste the same Heroku DNS target (e.g., `your-app-name.herokudns.com`)
  - **TTL**: 600 seconds (or leave default)
- Click **Save**

**Note**: Some GoDaddy interfaces may show the root domain differently. If you see an `A` record that you can't delete, you may need to contact GoDaddy support, or try using their "Forwarding" feature to redirect the root domain to `www`.

#### Step 4: Wait for DNS Propagation

- DNS changes typically take **1-24 hours** to fully propagate
- Usually works within **2-4 hours**
- Check propagation status at: https://www.whatsmydns.net
- Enter your domain and check if the CNAME records are showing up globally

#### Step 5: SSL Certificate (Automatic)

- Heroku **automatically provisions SSL certificates** for custom domains
- Once DNS is configured and propagated, Heroku will detect it and issue the certificate
- This usually happens within **5-10 minutes** after DNS is set up
- You can check the certificate status in the Heroku dashboard under **Settings** → **Domains**
- The certificate status will show as "Issued" when ready

#### Step 6: Verify It's Working

1. Wait for DNS to propagate (check with whatsmydns.net)
2. Visit your domain: `https://emmadain.com` or `https://www.emmadain.com`
3. You should see your login page
4. The browser should show a secure lock icon (HTTPS)

**Troubleshooting:**
- If the site doesn't load after 24 hours, double-check your DNS records in GoDaddy
- Make sure you're using `CNAME` records, not `A` records
- Verify the Heroku DNS target is correct (no typos)
- Check Heroku logs: `heroku logs --tail` to see if there are any errors

### Updating Your App

After making changes:
```bash
git add .
git commit -m "Your commit message"
git push heroku main
```

### Viewing Logs

```bash
heroku logs --tail
```

### Updating Environment Variables

```bash
heroku config:set WEDDING_PASSWORD=new-password
```

## Routes

- `/` - Login page (password entry)
- `/wedding` - Protected content (requires authentication)
- `/logout` - Logout and return to login page
