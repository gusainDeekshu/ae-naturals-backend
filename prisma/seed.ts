// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt'; 
import 'dotenv/config';

// 1. Setup the connection pool
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Start seeding...');

  // --- 1. Create Admin User ---
  const adminEmail = 'gusaindeekshant@gmail.com'; 
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Admin User',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });
  console.log(`✅ Admin user created: ${adminUser.email}`);

  // --- 2. Create Store ---
  const store = await prisma.store.upsert({
    where: { slug: 'flower-fairy-dehradun' },
    update: {},
    create: {
      name: 'AE Naturals',
      slug: 'flower-fairy-dehradun',
      industry: 'Floral',
      themeConfig: { primary: "#006044", secondary: "#22C55E" },
      paymentConfig: { provider: "RAZORPAY" } 
    }
  });

  // --- 3. Create Category ---
  const category = await prisma.category.upsert({
    where: { slug: 'flowers' },
    update: {},
    create: { name: 'Flowers', slug: 'flowers' }
  });

  // --- 4. Create Full-Fledge Product (Flipkart Style) ---
  await prisma.product.upsert({
    where: { slug: 'red-velvet-roses' },
    update: {},
    create: {
      storeId: store.id,
      categoryId: category.id,
      name: 'Red Velvet Roses',
      slug: 'red-velvet-roses',
      description: 'Express your love with this stunning bouquet of fresh red roses.',
      price: 699,
      oldPrice: 899,
      images: [
        'https://images.unsplash.com/photo-1548610762-7c6afe24c261?q=80&w=1000'
      ],
      ingredients: 'Fresh red roses, Greenery, Premium wrapping',
      careInstructions: [
        'Store in refrigerator below 5°C',
        'Consume within 24 hours',
        'Keep away from direct sunlight'
      ],
      deliveryInfo: [
        'Same day delivery available for orders before 2 PM',
        'Free delivery on orders above ₹999'
      ],
      // Flipkart-style Specifications
      attributes: {
        create: [
          { name: 'Weight', value: '12 Stems' },
          { name: 'Serves', value: 'Perfect for any occasion' },
          { name: 'Delivery', value: '2-4 hours delivery' }
        ]
      },
      // Product Variants
      variants: {
        create: [
          { name: 'Standard', priceModifier: 0, stock: 50 },
          { name: 'With Vase', priceModifier: 250, stock: 20 }
        ]
      },
      rating: 4.9,
      reviewCount: 567
    }
  });

  console.log('✅ Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });