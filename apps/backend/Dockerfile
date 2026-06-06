# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS admin-builder
WORKDIR /repo
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY .npmrc ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY packages/workspaces/package.json ./packages/workspaces/package.json
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/package.json
COPY packages/plugin-sdk/examples/scene-summary/package.json ./packages/plugin-sdk/examples/scene-summary/package.json
COPY packages/tokens/package.json ./packages/tokens/package.json
COPY packages/theme/package.json ./packages/theme/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @movscript/admin... --store-dir /pnpm/store
COPY packages ./packages
COPY apps/frontend/src ./apps/frontend/src
COPY apps/admin ./apps/admin
RUN pnpm --filter @movscript/admin build

FROM golang:1.25-alpine AS builder
WORKDIR /src/apps/backend
COPY apps/backend/go.mod apps/backend/go.sum ./
COPY apps/backend/vendor ./vendor
COPY apps/backend ./
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -mod=vendor -o server ./cmd/server
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -mod=vendor -o migrate ./cmd/migrate

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=builder /src/apps/backend/server .
COPY --from=builder /src/apps/backend/migrate .
COPY --from=admin-builder /repo/apps/admin/dist ./admin
EXPOSE 8765
CMD ["./server"]
