# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Deployment setup (one-time, manual)

1. Create a Neon Postgres project at https://neon.tech, copy its connection string.
2. Create a Railway project, link this GitHub repo, set root directory to `apps/api`,
   and set the `DATABASE_URL` env var to the Neon connection string.
3. Run `pnpm --filter @hoard/api exec prisma migrate deploy` against the Neon database
   once before the first deploy (and after every schema change).
4. Create a Vercel project, link this GitHub repo, set root directory to `apps/web`,
   and set `NUXT_PUBLIC_API_BASE` to the Railway-deployed API URL.
