// src\profile\profile.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  // --- PROFILE ---
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, data: { name?: string; phone?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, phone: true },
    });
  }

  // --- ADDRESSES ---
  async getAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });
  }

  async addAddress(userId: string, data: any) {
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }
    return this.prisma.address.create({
      data: { ...data, userId },
    });
  }

  async updateAddress(userId: string, addressId: string, data: any) {
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }
    return this.prisma.address.update({
      where: { id: addressId, userId },
      data,
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    return this.prisma.address.delete({
      where: { id: addressId, userId },
    });
  }

  // --- WISHLIST ---
  async getWishlist(userId: string) {
    return this.prisma.wishlist.findMany({
      where: { userId },
      include: { product: true },
    });
  }

  async toggleWishlist(userId: string, productId: string) {
    const existing = await this.prisma.wishlist.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    if (existing) {
      await this.prisma.wishlist.delete({ where: { id: existing.id } });
      return { message: 'Removed from wishlist', added: false };
    } else {
      await this.prisma.wishlist.create({ data: { userId, productId } });
      return { message: 'Added to wishlist', added: true };
    }
  }

  // --- REVIEWS ---
  async getMyReviews(userId: string) {
    return this.prisma.review.findMany({
      where: { userId },
      include: { product: { select: { name: true, images: true } } },
    });
  }

  async addReview(userId: string, data: { productId: string; rating: number; comment?: string }) {
    return this.prisma.review.create({
      data: { ...data, userId },
    });
  }

  async deleteReview(userId: string, reviewId: string) {
    return this.prisma.review.delete({
      where: { id: reviewId, userId },
    });
  }
}