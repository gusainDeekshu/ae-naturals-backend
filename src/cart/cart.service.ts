// src/cart/cart.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/cache.service';

@Injectable()
export class CartService {
  private readonly logger = new Logger('CartService');

  constructor(
    private prisma: PrismaService,
    private cache: AppCacheService,
  ) {}

  private getCacheKey(userId: string) {
    return `cart:${userId}`;
  }

  // src/cart/cart.service.ts (Backend)

  async getCart(userId: string) {
    return await this.cache.getOrSet(
      this.getCacheKey(userId),
      async () => {
        // Attempt to find the cart
        let cart = await this.prisma.cart.findUnique({
          where: { userId },
          include: {
            items: { include: { product: true } },
          },
        });

        // 🔥 If no cart exists, create one immediately
        if (!cart) {
          cart = await this.prisma.cart.create({
            data: { userId },
            include: {
              items: { include: { product: true } },
            },
          });
        }

        return cart;
      },
      3600,
    );
  }

  async addToCart(userId: string, productId: string, quantity: number) {
  // This will now either return an existing cart OR a newly created one
  const cart = await this.getCart(userId);
  
  // Find product to get the current price
  const product = await this.prisma.product.findUnique({ where: { id: productId }});
  if (!product) throw new NotFoundException('Product not found');

  // Upsert the item
  const result = await this.prisma.cartItem.upsert({
    where: { 
      cartId_productId: { 
        cartId: cart.id, // Now safe to use
        productId 
      } 
    },
    update: { quantity: { increment: quantity } },
    create: { 
      cartId: cart.id, 
      productId, 
      quantity, 
      price: product.price 
    },
  });

  await this.cache.del(this.getCacheKey(userId));
  return result;
}

  async updateQuantity(userId: string, productId: string, quantity: number) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    if (quantity <= 0) return this.removeItem(userId, productId);

    const result = await this.prisma.cartItem.update({
      where: { cartId_productId: { cartId: cart.id, productId } },
      data: { quantity },
    });

    await this.cache.del(this.getCacheKey(userId));
    return result;
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await this.prisma.cartItem.delete({
        where: { cartId_productId: { cartId: cart.id, productId } },
      });
      await this.cache.del(this.getCacheKey(userId));
    }
  }

  async clearCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await this.cache.del(this.getCacheKey(userId));
    }
  }
  async invalidateCache(userId: string) {
    await this.cache.del(this.getCacheKey(userId));
  }
}
