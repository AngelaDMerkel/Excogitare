FROM node:24-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["./node_modules/.bin/vinext", "start", "--host", "0.0.0.0"]
