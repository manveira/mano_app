FROM golang:1.22-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /mano-app

FROM alpine:3.18
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /mano-app /app/mano-app
EXPOSE 8080
ENTRYPOINT ["/app/mano-app"]
