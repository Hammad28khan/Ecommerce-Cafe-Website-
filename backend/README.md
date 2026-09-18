# Brew & Bliss — Backend

A real backend for the Brew & Bliss café site: menu, orders, guest checkout,
order tracking, comments, and an admin API for the dashboard — backed by SQLite.

## Setup

```bash
cd backend
npm install
cp .env.example .env    # then edit .env — set a real JWT_SECRET
npm run seed             # creates the DB, loads your 21 menu items, creates a default owner login
npm start                 # runs on http://localhost:4000 by default
```

Requires **Node.js 22.5+** (uses the built-in `node:sqlite` module — no native
build tools needed, which keeps deploys simple).

## Default admin login (created by `npm run seed`)

```
email:    owner@brewandbliss.local
password: ChangeMe123!
```

**Change this password before going live.** (There's no "change password"
endpoint yet — for now, update it directly: hash a new password with bcrypt
and `UPDATE admins SET password_hash = ? WHERE email = ...`, or delete the
row and re-run the seed with `DEFAULT_OWNER_PASSWORD` set in `.env`.)

## API overview

| Method | Path                        | Auth   | Purpose                              |
|--------|-----------------------------|--------|---------------------------------------|
| GET    | /api/health                 | none   | Health check                          |
| GET    | /api/menu                   | none   | List available menu items             |
| GET    | /api/menu/all                | admin  | List all items incl. unavailable      |
| POST   | /api/menu                   | admin  | Create menu item                      |
| PUT    | /api/menu/:id               | admin  | Update menu item (price, stock, etc.) |
| DELETE | /api/menu/:id               | admin  | Delete menu item                      |
| POST   | /api/orders                 | none   | Place an order (guest checkout)       |
| GET    | /api/orders/:id             | none   | Track an order by ID                  |
| GET    | /api/orders                 | admin  | List/filter all orders                |
| PATCH  | /api/orders/:id/status      | admin  | Update an order's status              |
| GET    | /api/comments                | none   | List comments                         |
| POST   | /api/comments                | none   | Post a comment                        |
| POST   | /api/comments/:id/like       | none   | Like a comment                        |
| DELETE | /api/comments/:id             | none   | Delete a comment                      |
| POST   | /api/auth/admin/login        | none   | Admin login → JWT                     |
| GET    | /api/admin/stats              | admin  | Dashboard: revenue, top items, etc.   |

Admin routes need `Authorization: Bearer <token>` from `/api/auth/admin/login`.

## Payments

`lib/mockPayment.js` simulates a gateway so you can demo the full flow without
real money moving. Test rules:
- Card ending in `0000` → declined
- UPI ID containing "fail" → declined
- `cod` (cash on delivery) → always accepted, marked "pending" until delivery
- Anything else → approved

When you're ready for real payments, replace `processPayment()` in that one
file with a real Stripe/Razorpay call — nothing else needs to change, since
every route only depends on the `{ success, status, ref, reason }` shape it
returns.

## Menu data

`data/menu-seed.json` was generated from your existing frontend's 21 menu
items (names, prices, categories, images) so the backend starts out matching
what customers already see. Edit items afterward via the admin API or
directly in the DB.

## Notes / what's still manual

- The frontend (`coffewebsite_firefly.html`) has been wired to call this API
  for **orders, order tracking, and comments**. It expects the backend at
  `http://localhost:4000/api` by default — override by setting
  `window.BB_API_BASE` before the script runs (e.g. in production, point it
  at your deployed API URL).
- The **menu itself is still static HTML** in the frontend — it is *not* yet
  rendered from `/api/menu`. That means editing prices via the admin API
  won't show up on the site until the menu section is converted to fetch and
  render from the API. That's a reasonable next step but a bigger frontend
  change, so it wasn't done automatically.
- `owner-dashboard.html` wasn't part of the uploaded files, so the admin
  dashboard UI isn't wired up yet — the API it needs (`/api/admin/stats`,
  `/api/orders`, admin login) is ready and tested, waiting for that page.
- There are no customer accounts (signup/login) — checkout is guest-only,
  matching how the original frontend was built. Order tracking works by
  order ID instead of a login.
