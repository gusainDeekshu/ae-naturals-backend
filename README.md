
# 🌸 AE Naturals Backend

A **production-grade Multi-Tenant E-Commerce API** built with **NestJS**, **Prisma**, **Redis**, **Cloudinary**, and **Zod**.

---

## ✨ Core Features

### 🔐 Password-less OTP Authentication
A secure, modern authentication system that replaces traditional passwords with One-Time Passwords (OTP).
* **Omnichannel Delivery:** Supports both SMS (via Fast2SMS) and Email (via Amazon SES).
* **Security:** SHA-256 hashing for OTP storage and automatic token expiration.
* **User Upsert:** Automatically creates user profiles upon successful first-time verification.

### 🏬 Multi-Tenant Store System
Supports multiple storefronts within a single platform. Each store maintains isolated product catalogs, independent pricing, and custom branding.

### 🛒 Cart & Order Management
* **Real-time Cart:** Persistent shopping carts linked to user accounts.
* **Order Lifecycle:** Full tracking from `PENDING` to `DELIVERED` status.

### 💳 Integrated Payments
Multi-gateway support for seamless transactions:
* **Stripe:** Global card payments.
* **Razorpay & PhonePe:** Optimized for the Indian market.

### ⚡ Performance & Media Optimization
* **Redis Caching:** Accelerates frequently accessed catalogs with response times `< 200ms`.
* **Cloudinary CDN:** Automated WebP/AVIF conversion and responsive image resizing.

---

## 🛠 Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | NestJS |
| **Database & ORM** | PostgreSQL + Prisma |
| **Caching** | Redis |
| **Auth** | JWT + Passport + OTP |
| **Payments** | Stripe, Razorpay, PhonePe |
| **Messaging** | Amazon SES & Fast2SMS |
| **Validation** | Zod + Class-validator |

---

## 📂 Project Structure

```text
src/
├─ admin/                # Admin-level management (Products, Orders, Stores)
├─ auth/                 # OTP logic, JWT Strategies, and Session Guards
├─ cart/                 # Shopping cart persistence and logic
├─ categories/           # Product category management
├─ common/               # Shared modules
│  ├─ cache/             # Redis integration
│  ├─ messaging/         # Omnichannel Messaging (SES & Fast2SMS)
│  └─ cloudinary.service  # Media optimization
├─ health/               # System & Database health checks
├─ logistics/            # Shipping and delivery rule processing
├─ orders/               # Order creation and status tracking
├─ payments/             # Multi-gateway providers (Stripe, Razorpay, PhonePe)
├─ prisma/               # Database client and health indicators
└─ products/             # Public product catalog and discovery
```

---

## ⚙️ Environment Variables

Add these to your `.env` for the system to work:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/flower_fairy"

# AWS SES (Email)
MY_AWS_ACCESS_KEY=your_access_key
MY_AWS_SECRET_KEY=your_secret_key
AWS_REGION=ap-south-1
AWS_SES_SOURCE="noreply@flowerfairy.com"

# Fast2SMS (SMS)
FAST2SMS_KEY=your_api_key

# Payments
STRIPE_SECRET_KEY=sk_test_...
RAZORPAY_KEY_ID=rzp_test_...
PHONEPE_MERCHANT_ID=...

# Auth Config
OTP_EXPIRY_MINUTES=5
JWT_SECRET=your_jwt_secret
```

---

## 🚀 Getting Started

### 1. Database Setup
```bash
pnpm exec prisma generate
pnpm run db:deploy

npx prisma format
npx prisma db push
npx prisma generate
```

### 2. Messaging Test (Dev Only)
We have included internal test endpoints to verify your credentials:
* **Test SMS:** `GET /api/v1/test-messaging/sms?phone=99XXXXXXXX`
* **Test Email:** `GET /api/v1/test-messaging/email?email=test@example.com`

---

## 🔄 Repository Workflow

This project maintains a **dual-repo strategy**:
1. **Development Repo:** [gusainDeekshu/flower-fairy-backend](https://github.com/gusainDeekshu/flower-fairy-backend) (Feature staging).
2. **Production Repo:** [flowerfairydehradun-spec/flower-fairy-backend](https://github.com/flowerfairydehradun-spec/flower-fairy-backend) (Deployment).

---

## 👤 Author

**Deekshant Gusain**
* **GitHub**: [@gusainDeekshu](https://github.com/gusainDeekshu)
* **Portfolio**: [deekshantportfoliosite.netlify.app](https://deekshantportfoliosite.netlify.app/)