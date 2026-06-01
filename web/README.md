# Mano App — Web frontend

Minimal Next.js frontend scaffold.

Run locally:

```bash
cd web
npm install
# build tailwind output (postinstall handles this automatically after npm install)
npm run dev
```

Environment:
- `NEXT_PUBLIC_API_URL` — backend base URL (e.g. `http://localhost:8080/api`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe publishable key for client

Notes:
- This project uses Tailwind CSS. After `npm install` the `postinstall` script will build Tailwind CSS into `styles/tailwind.css`.
- If you change Tailwind config, re-run the build command:

```bash
npx tailwindcss -i ./styles/globals.css -o ./styles/tailwind.css --minify
```

This scaffold includes example pages: home, signin, businesses list, business detail and a checkout example using Stripe Elements.
