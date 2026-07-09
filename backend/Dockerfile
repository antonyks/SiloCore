# Local development image
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json tsconfig*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 5000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm run dev"]
