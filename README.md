# Brew & Bliss — Full-Stack Café Ordering Platform

A full-stack e-commerce ordering site for a café: a menu with cart and checkout,
live order tracking, an admin dashboard for managing prices and inventory,
customer star ratings, and configurable combo items — built with vanilla
JavaScript on the frontend and a Node.js/Express/SQLite API on the backend.

**Live demo:**( https://charming-wisp-43eff4.netlify.app/ )

> Note: the live demo runs on free hosting tiers. The backend may take 30-60
> seconds to "wake up" on the first request after a period of inactivity, and
> the database resets on redeploy since free tiers don't include persistent
> storage. This is expected — it's a portfolio demo, not a production deployment.

### Admin dashboard

The project includes an admin dashboard (`backend/admin.html`) for managing the
menu, pricing, discounts, stock, and orders — see the demo video below for what
it looks like in use.

It isn't publicly linked, and its credentials aren't published here, since it
has full write access to the live menu and order data. Happy to walk through it
in a demo, or credentials can be shared on request.

---

## What it does

- **Storefront**: browse the menu, add items to a cart, and check out — including
  combo items (e.g. "Sweet Twins Deal") where the customer picks specific menu
  items (any 2 desserts, a sandwich + a drink, etc.) rather than getting a fixed
  bundle
- **Order tracking**: look up any order by ID and see its live status
- **Reviews**: leave a comment or a 1-5 star rating on any item — the average
  updates immediately, no page reload
- **Admin dashboard** (`admin.html`): change prices, set discounts, mark items
  sold out, manage orders, and see basic sales stats — all without touching code
- **Scroll animations**: menu rows alternate sliding in from left/right as you
  scroll, fully reversible

## Dash board Images 

_Paste the video link from GitHub's asset upload here (drag a video file into a
new Issue's comment box, submit it, then copy the generated line — it renders
as a playable video directly in this README on github.com). Covers the
storefront, the combo picker modal, order tracking, and the admin dashboard._

<!--
Example — replace with your own uploaded video link:

https://github.com/user-attachments/assets/your-video-id-here
-->

## Tech stack

| Layer     | Tech |
|-----------|------|
| Frontend  | HTML, CSS, vanilla JavaScript, Three.js (hero animation) |
| Backend   | Node.js, Express |
| Database  | SQLite (via Node's built-in `node:sqlite`) |
| Auth      | JWT, bcrypt |

## Project structure

```
/frontend        static site — the HTML file + product/café images
/backend         Express API + SQLite database + admin dashboard
```

## Running it locally

**Backend:**
```bash
cd backend
npm install
cp .env.example .env      # then set a real JWT_SECRET inside it
npm run seed                # creates the database and menu items
npm start                    # runs on http://localhost:4000
```

**Frontend:** just open `frontend/coffewebsite_firefly.html` in a browser.
It talks to the backend at `http://localhost:4000/api` by default — override
this by setting `window.BB_API_BASE` before the page's script runs if your
backend lives elsewhere.

**Admin dashboard:** open `backend/admin.html` in a browser (same
`BB_API_BASE` override applies). Default login is printed to the terminal
the first time you run `npm run seed`.

### Changing the default admin password

The seed script creates a starter admin account with a placeholder password.
To change it without wiping your menu/orders:

```bash
npm run set-admin-password -- your-email@example.com YourNewPassword123
```

### Other useful commands

```bash
npm run clear-orders   # wipes all orders, leaves menu/prices/ratings untouched
```

## API overview

| Method | Path                     | Auth  | Purpose |
|--------|--------------------------|-------|---------|
| GET    | `/api/menu`              | none  | List available menu items |
| POST   | `/api/orders`            | none  | Place an order (guest checkout) |
| GET    | `/api/orders/:id`        | none  | Track an order |
| POST   | `/api/menu/:id/rate`     | none  | Submit a 1-5 star rating |
| POST   | `/api/comments`          | none  | Post a review comment |
| POST   | `/api/auth/admin/login` | none  | Admin login → JWT |
| GET/PUT/DELETE `/api/menu/:id` | admin | Manage menu items |
| GET/PATCH `/api/orders`  | admin | View/update orders |
| GET    | `/api/admin/stats`       | admin | Revenue & sales dashboard data |

## Configuration & secrets

No credentials or secrets are committed to this repo. The backend reads its
configuration from environment variables (`.env` locally, which is gitignored;
dashboard environment variables when deployed):

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signing key for admin auth tokens — set to a long random string |
| `FRONTEND_ORIGIN` | The exact origin allowed to call the API (CORS) |
| `DEFAULT_OWNER_PASSWORD` | Password for the admin account created by `npm run seed` |
| `DB_PATH` | Where the SQLite file lives |
| `PORT` | Port the API listens on |

Admin passwords are stored as bcrypt hashes, never plaintext. The seed script
creates a starter admin using `DEFAULT_OWNER_PASSWORD`; change it afterward with
the `set-admin-password` command (see "Running it locally") rather than editing
the database directly.

## Known limitations

- Payments are simulated (a mock gateway, not a real payment processor) —
  structured so a real one (Stripe/Razorpay) could be swapped in later
- No customer accounts — checkout and rating are both guest/session-based
- SQLite is fine for a project this size but would need to move to Postgres
  or similar for real production traffic
- The layout is designed for desktop — it hasn't been adapted for small mobile screens yet, so it's best viewed on a laptop/desktop browser 
