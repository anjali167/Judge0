FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
# --ignore-scripts: postinstall (Monaco asset copy) needs files copied below
RUN npm ci --ignore-scripts
COPY . .
RUN node scripts/copy-monaco.mjs
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
