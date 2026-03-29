# SeatCover OMS — Deployment Guide
### From zero to live website with your custom domain

**Time needed:** About 45–60 minutes  
**Cost:** Free (Supabase free tier + Vercel free tier covers small teams easily)  
**What you'll need:** A computer, an email address, and your custom domain (e.g. orders.mycompany.com)

---

## Part 1 — Set up your database (Supabase)

Supabase is your database, login system, and file storage. It stores all orders, user accounts, and photos.

### Step 1.1 — Create a Supabase account
1. Go to **https://supabase.com** and click "Start your project"
2. Sign up with your email (or GitHub if you have one)
3. Once logged in, click **"New project"**
4. Fill in:
   - **Name:** SeatCover OMS (or anything you like)
   - **Database password:** Choose a strong password — write it down somewhere safe
   - **Region:** Europe West (or whichever is closest to you)
5. Click **"Create new project"** — it takes about 2 minutes to set up

### Step 1.2 — Run the database schema
1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase-schema.sql` from this folder
4. Copy the entire contents and paste into the SQL Editor
5. Click the green **"Run"** button
6. You should see "Success. No rows returned" — that means it worked

This creates your orders table, user profiles, photo storage, and adds the sample orders.

### Step 1.3 — Get your API keys
1. In your Supabase project, click **"Settings"** (gear icon) → **"API"**
2. Find and copy these two values — you'll need them in a moment:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public key** — a long string starting with `eyJ...`

### Step 1.4 — Create your first admin account
1. In Supabase, go to **"Authentication"** → **"Users"** → **"Add user"** → **"Create new user"**
2. Enter your email and a password
3. Click **"Create user"**
4. Now go to **"Table Editor"** → click the **"profiles"** table
5. Find your user row (it was auto-created) and click the pencil icon to edit it
6. Change the **role** field from `sales` to `admin`
7. Click **"Save"**

---

## Part 2 — Put the code on GitHub

Vercel deploys directly from GitHub, so you need to get the code there first.

### Step 2.1 — Install Git (if you don't have it)
- Download from **https://git-scm.com/downloads** and install it
- During install, accept all defaults

### Step 2.2 — Create a GitHub account
- Go to **https://github.com** and sign up (it's free)

### Step 2.3 — Create a new repository
1. After signing into GitHub, click the **"+"** button (top right) → **"New repository"**
2. Name it: `seatcover-oms`
3. Set it to **Private** (so your order data isn't public)
4. Click **"Create repository"**

### Step 2.4 — Upload the code
Open **Terminal** (Mac) or **Command Prompt** (Windows) and run these commands one at a time:

```bash
# Go into the project folder (adjust path to wherever you saved it)
cd path/to/seatcover-oms

# Set up git
git init
git add .
git commit -m "Initial commit"

# Connect to your GitHub repo (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/seatcover-oms.git
git branch -M main
git push -u origin main
```

When prompted, enter your GitHub username and password (or a personal access token if GitHub asks for one).

---

## Part 3 — Deploy on Vercel

Vercel hosts your website for free and gives it a URL your whole team can access.

### Step 3.1 — Create a Vercel account
1. Go to **https://vercel.com** and click "Sign Up"
2. Sign up with GitHub (easiest — it links the two accounts automatically)

### Step 3.2 — Import your project
1. On the Vercel dashboard, click **"Add New…"** → **"Project"**
2. You should see your `seatcover-oms` repository listed — click **"Import"**
3. Under **"Framework Preset"**, make sure **"Create React App"** is selected
4. Click **"Environment Variables"** to expand that section
5. Add these two variables (using the values from Step 1.3):

   | Name | Value |
   |------|-------|
   | `REACT_APP_SUPABASE_URL` | `https://your-project-id.supabase.co` |
   | `REACT_APP_SUPABASE_ANON_KEY` | `eyJ...your-anon-key...` |

6. Click **"Deploy"**
7. Wait about 2 minutes — Vercel builds and deploys the app
8. When done, you'll get a URL like `https://seatcover-oms.vercel.app` — click it to test

---

## Part 4 — Connect your custom domain

This turns `seatcover-oms.vercel.app` into `orders.yourcompany.com`.

### Step 4.1 — Add the domain in Vercel
1. In your Vercel project, click **"Settings"** → **"Domains"**
2. Type your subdomain: `orders.yourcompany.com` (or whatever you want)
3. Click **"Add"**
4. Vercel will show you a DNS record to add — it looks like:
   - **Type:** CNAME
   - **Name:** orders
   - **Value:** cname.vercel-dns.com

### Step 4.2 — Add the DNS record at your domain registrar
1. Log into wherever you bought your domain (GoDaddy, Namecheap, One.com, etc.)
2. Find **DNS Settings** or **DNS Management** for your domain
3. Add a new **CNAME record**:
   - Host/Name: `orders` (just the subdomain part)
   - Points to/Value: `cname.vercel-dns.com`
   - TTL: 3600 (or "1 hour" — the default is fine)
4. Save the record

### Step 4.3 — Wait for it to go live
- DNS changes take between 5 minutes and a few hours to propagate
- Vercel will automatically issue an SSL certificate (the padlock in your browser)
- Once it goes green in Vercel's Domains panel, your site is live at your custom domain

---

## Part 5 — Invite your team

Now that the site is live, invite everyone who needs access.

### How to invite users
1. Log into the OMS at your domain with your admin account
2. Click **"Users"** in the sidebar
3. Click **"+ Invite user"**
4. Enter their name, email, and role:
   - **Admin** — full access, can delete orders and manage users
   - **Sales** — can create and edit orders, view stats
   - **Production** — sees only the production queue, can advance stages
   - **Shipping** — sees only the shipping view, can print labels
5. Click **"Send invite"** — they'll get an email with a link to set their password

---

## Part 6 — After you go live

### Keep data safe
- Supabase automatically backs up your database daily on the free tier
- For extra safety, you can export your orders table as CSV from the Supabase Table Editor anytime

### Future updates
If you want to make changes to the app later:
1. Edit the code files
2. Run `git add . && git commit -m "Your change description" && git push`
3. Vercel automatically redeploys within about 60 seconds

### Connecting Shopify / eBay
Down the road, you can use Supabase Edge Functions or a simple webhook to auto-create orders when a sale comes in on Shopify or eBay — no more manual entry for those channels.

---

## Quick reference — important URLs

| What | Where |
|------|-------|
| Your live app | https://orders.yourcompany.com |
| Supabase dashboard | https://supabase.com/dashboard |
| Vercel dashboard | https://vercel.com/dashboard |
| GitHub repo | https://github.com/YOUR_USERNAME/seatcover-oms |

---

## Troubleshooting

**"Cannot read properties of undefined" or blank screen after deploy**
→ Double-check the environment variables in Vercel settings. A typo in the Supabase URL or key is the most common cause. Re-add them and redeploy.

**Login says "Invalid login credentials"**
→ Make sure you created the user in Supabase Authentication → Users (Step 1.4), not just in the profiles table.

**Photos won't upload**
→ Check the storage bucket was created — go to Supabase → Storage and confirm `order-photos` bucket exists. Re-run the schema if not.

**Domain not showing up / SSL error**
→ DNS changes can take up to 24 hours in rare cases. Check the CNAME record is saved correctly at your registrar.

**Need help?**
→ Supabase docs: https://supabase.com/docs  
→ Vercel docs: https://vercel.com/docs
