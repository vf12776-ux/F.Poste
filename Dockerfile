FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY server server
WORKDIR /app/server
RUN go mod download
RUN go build -o /app/main .

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/main .
EXPOSE 8080
CMD ["./main"]
