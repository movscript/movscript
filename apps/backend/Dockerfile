FROM node:22-alpine AS admin-builder
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY .npmrc ./
COPY packages ./packages
COPY apps/frontend/src ./apps/frontend/src
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/admin ./apps/admin
RUN pnpm install --frozen-lockfile
RUN pnpm --filter movscript-admin build

FROM golang:1.25-alpine AS builder
WORKDIR /src/apps/backend
COPY apps/backend/go.mod apps/backend/go.sum ./
COPY apps/backend/vendor ./vendor
COPY apps/backend ./
RUN CGO_ENABLED=0 go build -mod=vendor -o server ./cmd/server
RUN CGO_ENABLED=0 go build -mod=vendor -o migrate ./cmd/migrate

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=builder /src/apps/backend/server .
COPY --from=builder /src/apps/backend/migrate .
COPY --from=admin-builder /repo/apps/admin/dist ./admin
EXPOSE 8765
CMD ["./server"]
