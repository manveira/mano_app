FROM node:20-alpine AS builder
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next .next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
RUN mkdir -p public
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
