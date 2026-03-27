// src\profile\profile.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Gender } from '@prisma/client';

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

  async updateProfile(
    userId: string,
    data: { name?: string; phone?: string; email?: string; gender?: string },
  ) {
    try {
      console.log('🔍 updateProfile called');
      console.log('👉 userId:', userId);
      console.log('👉 incoming data:', data);

      if (!userId) {
        console.error('❌ Missing userId');
        throw new BadRequestException('User ID is required for update');
      }

      // Clean + normalize data
      const updateData: any = {};

      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }

      if (data.email !== undefined) {
        updateData.email = data.email.toLowerCase().trim();
      }

      if (data.phone !== undefined) {
        updateData.phone = data.phone.trim();
      }

      if (data.gender !== undefined) {
        const normalizedGender = data.gender.toUpperCase().trim();

        console.log('🎯 Normalized Gender:', normalizedGender);

        const validGenders = ['MALE', 'FEMALE', 'OTHER'];

        if (!validGenders.includes(normalizedGender)) {
          console.error('❌ Invalid gender value:', data.gender);
          throw new BadRequestException('Invalid gender value');
        }

        updateData.gender = normalizedGender as Gender;
      }

      console.log('🛠️ Final updateData:', updateData);

      // Optional: check if user exists
      const existingUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      console.log('👤 Existing user:', existingUser);

      if (!existingUser) {
        console.error('❌ User not found');
        throw new BadRequestException('User not found');
      }

      // 🔥 Perform update
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          gender: true,
        },
      });

      console.log('✅ User updated successfully:', updatedUser);

      return updatedUser;
    } catch (error) {
      console.error('🔥 updateProfile ERROR:', error);

      // Prisma unique constraint (email/phone duplicate)
      if (error.code === 'P2002') {
        console.error('⚠️ Unique constraint failed:', error.meta);
        throw new BadRequestException('Email or phone already exists');
      }

      throw new BadRequestException(
        error?.message || 'Failed to update profile',
      );
    }
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

  async addReview(
    userId: string,
    data: { productId: string; rating: number; comment?: string },
  ) {
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
