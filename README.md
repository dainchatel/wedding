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

1. **Add Custom Domain in Heroku**:
   - Go to your Heroku dashboard: https://dashboard.heroku.com/apps
   - Select your app
   - Go to **Settings** tab
   - Scroll to **Domains** section
   - Click **Add domain**
   - Enter your domain (e.g., `www.yourdomain.com` or `yourdomain.com`)
   - Click **Save**

2. **Get Heroku DNS Target**:
   - After adding the domain, Heroku will show you a DNS target (looks like: `your-app-name.herokudns.com`)
   - Copy this DNS target

3. **Configure DNS in GoDaddy**:
   - Log into your GoDaddy account
   - Go to **My Products** → **Domains** → Select your domain
   - Click **DNS** or **Manage DNS**
   
   **For root domain (yourdomain.com)**:
   - Find the `@` or `A` record
   - Change the type to `CNAME` (or add a new CNAME record)
   - Set the name to `@` (or leave blank for root)
   - Set the value to the Heroku DNS target (e.g., `your-app-name.herokudns.com`)
   - TTL: 600 seconds (or default)
   - Save

   **For www subdomain (www.yourdomain.com)**:
   - Add or edit a `CNAME` record
   - Name: `www`
   - Value: the Heroku DNS target (e.g., `your-app-name.herokudns.com`)
   - TTL: 600 seconds
   - Save

4. **Wait for DNS Propagation**:
   - DNS changes can take 24-48 hours to propagate, but usually work within a few hours
   - You can check propagation status at: https://www.whatsmydns.net

5. **Enable SSL/HTTPS** (Automatic with Heroku):
   - Heroku automatically provides SSL certificates for custom domains
   - Once DNS is configured, Heroku will provision the certificate automatically
   - This may take a few minutes after DNS is set up

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
