import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AppCacheService } from 'src/common/cache/cache.service';
import { EmailService } from '../notifications/email.service';
import { SmsService } from '../notifications/sms.service';
import { BRAND } from '../config/brand.config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private cacheService: AppCacheService,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  /**
   * Retrieves user data and a new access token from a valid refresh token
   */
  async getUserFromRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken);

      // Check Redis session for revocation
      const sessionKey = `session:${payload.sub}`;
      const activeSession = await this.cacheService.get(sessionKey);

      if (!activeSession) {
        throw new UnauthorizedException('Session expired');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      const accessExpiry =
        this.config.get<string>('JWT_ACCESS_EXPIRY') || '15m';

      const accessToken = await this.jwtService.signAsync(newPayload, {
        expiresIn: accessExpiry as any,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        access_token: accessToken,
      };
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Standard Email/Password login
   */
  async login(email: string) {
    const cleanEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    await this.cacheService.set(
      `session:${user.id}`,
      accessToken,
      30 * 24 * 60 * 60,
    );

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Generates and sends a 6-digit OTP
   */
  /**
   * Generates and sends a 6-digit OTP
   */
  async sendOtp(identifier: string, type: 'phone' | 'email') {
    // 1. Normalize identifier
    const cleanIdentifier = identifier.includes('@')
      ? identifier.toLowerCase().trim()
      : identifier.replace(/\D/g, ''); // Strip non-numeric chars for phone

    // 🔥 2. ENTERPRISE STANDARD: Static Test Accounts for App Store Reviews
    // Apple/Google reviewers cannot receive real SMS. You MUST whitelist a test number.
    const isTestAccount =
      cleanIdentifier === 'test@aenaturals.in' ||
      cleanIdentifier === '9999999999';

    // Generate secure random OTP, or use '123456' for whitelisted test accounts
    const otp = isTestAccount
      ? '123456'
      : crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const expiryMinutes = this.config.get<number>('OTP_EXPIRY_MINUTES') || 5;
    const expires = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // 3. Database cleanup & storage
    await this.prisma.verificationToken.deleteMany({
      where: { identifier: cleanIdentifier },
    });

    await this.prisma.verificationToken.create({
      data: { identifier: cleanIdentifier, token: hashedOtp, expires },
    });

    this.logger.log(`[DEBUG] Generated OTP for ${cleanIdentifier}`);

    // 🔥 4. DEVELOPMENT BYPASS (Cost Saving Strategy)
    // If NOT production, or if it is a Test Account, print to console and DO NOT send.
    if (process.env.NODE_ENV !== 'production' || isTestAccount) {
      this.logger.log(
        `[DEV MODE / TEST ACCOUNT] Bypassing MSG91/SMTP. Use OTP: ${otp}`,
      );
      return { message: 'OTP generated (Dev Mode / Test Account)' };
    }

    // 🔥 5. PRODUCTION SEND EXECUTION
    const message = `Your AE Naturals Login OTP is ${otp}. It expires in ${expiryMinutes} minutes.`;

    try {
      let isSent = false;

      if (type === 'phone') {
        isSent = await this.smsService.sendSMS(cleanIdentifier, message);
      } else {
        const html = `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #eaeaea; border-radius: 10px;">
                        <h2 style="color: #009688;">AE Naturals Secure Login</h2>
                        <p style="color: #555;">Use the following OTP to log into your account. Do not share this with anyone.</p>
                        <div style="background: #f9f9f9; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                          <strong style="font-size: 32px; letter-spacing: 5px; color: #333;">${otp}</strong>
                        </div>
                        <p style="color: #888; font-size: 12px;">This code expires in ${expiryMinutes} minutes.</p>
                      </div>`;
        isSent = await this.emailService.sendEmail(
          cleanIdentifier,
          'Your AE Naturals Login OTP',
          html,
        );
      }

      if (!isSent) {
        this.logger.error(`Provider returned FALSE for ${cleanIdentifier}.`);
        throw new Error('Delivery failed at provider level.');
      }

      return { message: 'OTP sent successfully' };
    } catch (error) {
      this.logger.error(
        `Critical OTP Send Failure for ${cleanIdentifier}: ${error.message}`,
      );

      // Generic error so malicious users don't know the exact internal failure reason
      throw new BadRequestException(
        'Failed to deliver OTP. Please check your number/email and try again.',
      );
    }
  }

  /**
   * Verifies OTP, upserts user, sets 30-day cookie, and creates Redis session
   */
  // src/auth/auth.service.ts

  async verifyOtp(res: Response, identifier: string, otp: string) {
    try {
      const cleanIdentifier = identifier.includes('@')
        ? identifier.toLowerCase().trim()
        : identifier.replace(/\D/g, '');

      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

      // 1. Verify OTP Record
      const record = await this.prisma.verificationToken.findFirst({
        where: { identifier: cleanIdentifier },
      });

      if (
        !record ||
        record.expires < new Date() ||
        record.token !== hashedOtp
      ) {
        if (record && record.expires < new Date()) {
          await this.prisma.verificationToken.deleteMany({
            where: { identifier: cleanIdentifier },
          });
        }
        throw new UnauthorizedException('Invalid or expired OTP.');
      }

      // 2. Clear verified OTP
      await this.prisma.verificationToken.deleteMany({
        where: { identifier: cleanIdentifier },
      });

      // 🔥 3. EMAIL FLOW (Strict checking, NO immediate creation)
      const isEmailLogin = cleanIdentifier.includes('@');

      if (isEmailLogin) {
        console.log('📧 Email OTP verified → checking user');

        const existingUser = await this.prisma.user.findUnique({
          where: { email: cleanIdentifier },
        });

        // If user exists
        // If user exists
        if (existingUser) {
          console.log("👤 Existing user found:", existingUser.id);

          try {
            // Needs phone link (Legacy support)
            if (!existingUser.phone) {
              console.log("⚠️ Phone missing → temp flow");
              const tempToken = await this.jwtService.signAsync(
                { sub: existingUser.id, email: existingUser.email, isTempFlow: true },
                { expiresIn: '15m' }
              );
              return { requiresPhone: true, tempToken };
            }

            // Fully valid existing user -> Login
            await this.prisma.user.update({
              where: { id: existingUser.id },
              data: { lastLogin: new Date() },
            });
            return await this.issueTokens(res, existingUser.id, existingUser.email, existingUser.role);
          } catch (internalError) {
            console.error("❌ Critical Error during user login sequence:", internalError);
            throw internalError;
          }
        }

        // Completely new email user -> Temp Flow (NO DB WRITE YET)
        console.log('🆕 New email user → temp flow');
        const tempToken = await this.jwtService.signAsync(
          { email: cleanIdentifier, isTempFlow: true },
          { expiresIn: '15m' },
        );

        return { requiresPhone: true, tempToken };
      }

      // 🔥 4. PHONE FLOW (Direct Login/Create)
      // If they logged in with phone, we already have their phone number, so we can safely upsert.
      console.log('📱 Phone OTP verified → processing direct login');
      const user = await this.prisma.user.upsert({
        where: { phone: cleanIdentifier },
        update: { lastLogin: new Date() },
        create: {
          phone: cleanIdentifier,
          name: cleanIdentifier, // Fallback name
          role: 'USER',
        },
      });

      return await this.issueTokens(res, user.id, user.email, user.role);
    } catch (error) {
      throw new UnauthorizedException(
        error?.message || 'OTP verification failed',
      );
    }
  }

  /**
   * Completes the profile by linking a phone number after initial email login
   */
  async verifyPhoneOtp(
    res: Response,
    tempToken: string,
    phone: string,
    otp: string,
  ) {
    try {
      // 1. Validate Temp Token
      let payload;
      try {
        payload = await this.jwtService.verifyAsync(tempToken);
        if (!payload.isTempFlow) {
          throw new UnauthorizedException('Invalid flow type');
        }
      } catch (err) {
        throw new UnauthorizedException(
          'Temporary session expired. Please restart login.',
        );
      }

      const cleanPhone = phone.replace(/\D/g, '');
      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

      // 2. Validate Phone OTP
      const record = await this.prisma.verificationToken.findFirst({
        where: { identifier: cleanPhone },
      });

      if (
        !record ||
        record.expires < new Date() ||
        record.token !== hashedOtp
      ) {
        throw new UnauthorizedException('Invalid or expired phone OTP.');
      }

      await this.prisma.verificationToken.deleteMany({
        where: { identifier: cleanPhone },
      });

      // 3. Ensure Phone isn't already used by someone else
      const existingPhoneUser = await this.prisma.user.findUnique({
        where: { phone: cleanPhone },
      });

      if (existingPhoneUser && existingPhoneUser.id !== payload.sub) {
        throw new BadRequestException(
          'This phone number is already registered to another account.',
        );
      }

      // 4. Create or Update Final User
      let user;

      if (payload.sub) {
        // Update existing legacy user
        user = await this.prisma.user.update({
          where: { id: payload.sub },
          data: {
            phone: cleanPhone,
            lastLogin: new Date(),
          },
        });
      } else {
        // Create completely new user
        user = await this.prisma.user.create({
          data: {
            email: payload.email,
            phone: cleanPhone,
            name: payload.email.split('@')[0],
            role: 'USER',
            lastLogin: new Date(),
          },
        });
      }

      // 5. Issue Final Tokens
      return await this.issueTokens(res, user.id, user.email, user.role);
    } catch (error) {
      throw error instanceof BadRequestException ||
        error instanceof UnauthorizedException
        ? error
        : new BadRequestException('Failed to complete phone verification');
    }
  }

  /**
   * Completes the profile by linking a phone number after initial email login
   */
  async completeProfile(
    res: Response,
    phone: string,
    otp: string,
    tempToken: string,
  ) {
    try {
      // 1. Verify Temporary Token
      let payload;
      try {
        payload = await this.jwtService.verifyAsync(tempToken);
        if (!payload.isTempFlow) throw new Error('Invalid token type');
      } catch (err) {
        throw new UnauthorizedException(
          'Temporary session expired. Please login again.',
        );
      }

      const userId = payload.sub;
      const cleanPhone = phone.replace(/\D/g, '');
      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

      // 2. Verify Phone OTP
      const record = await this.prisma.verificationToken.findFirst({
        where: { identifier: cleanPhone },
      });

      if (
        !record ||
        record.expires < new Date() ||
        record.token !== hashedOtp
      ) {
        throw new UnauthorizedException('Invalid or expired phone OTP.');
      }

      // 3. Prevent duplicate phone numbers
      const existingUser = await this.prisma.user.findUnique({
        where: { phone: cleanPhone },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException(
          'This phone number is already registered to another account.',
        );
      }

      // 4. Update user profile and clear OTP
      await this.prisma.verificationToken.deleteMany({
        where: { identifier: cleanPhone },
      });

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { phone: cleanPhone },
      });

      // 5. Issue standard final tokens
      return await this.issueTokens(
        res,
        updatedUser.id,
        updatedUser.email,
        updatedUser.role,
      );
    } catch (error) {
      throw error instanceof BadRequestException ||
        error instanceof UnauthorizedException
        ? error
        : new BadRequestException('Failed to complete profile verification');
    }
  }

  /**
   * REFRESH TOKEN ROTATION (The Big Company Way)
   */
  async refreshTokens(req: Request, res: Response) {
    const oldRefreshToken = req.cookies['refresh_token'];
    if (!oldRefreshToken) throw new UnauthorizedException();

    try {
      const payload = await this.jwtService.verifyAsync(oldRefreshToken);

      // 1. Check if session is still active in Redis
      const sessionKey = `session:${payload.sub}`;
      const isValid = await this.cacheService.get(sessionKey);

      if (!isValid) {
        this.logger.warn(
          `Potential Breach: Revoked token used for user ${payload.sub}`,
        );
        throw new UnauthorizedException();
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) throw new UnauthorizedException();

      // 2. Issue NEW tokens and ROTATE the refresh cookie
      return this.issueTokens(res, user.id, user.email, user.role);
    } catch (e) {
      throw new UnauthorizedException('Session expired');
    }
  }

  /**
   * Internal Helper: Issues Access Token (RAM) and Refresh Token (HTTP-Only Cookie)
   */
  /**
   * Internal Helper: Issues Access Token (RAM) and Refresh Token (HTTP-Only Cookie)
   */
  private async issueTokens(
    res: Response,
    userId: string,
    email: string | null,
    role: string,
  ) {
    // Use a fallback if email is null (common in phone-only OTP login)
    const identifier = email || BRAND.name; // Use brand name as identifier for phone logins without email

    const payload = {
      sub: userId,
      email: identifier,
      role,
      tenantId: 'default-store',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.config.get('JWT_ACCESS_EXPIRY') || '15m',
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        expiresIn: this.config.get('JWT_REFRESH_EXPIRY') || '7d',
      },
    );

    // SET SECURE COOKIE
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    await this.cacheService.set(
      `session:${userId}`,
      'active',
      7 * 24 * 60 * 60,
    );

    return {
      access_token: accessToken,
      user: { id: userId, email: identifier, role },
    };
  }

  /**
   * Clears the session from Redis
   */
  async logout(userId: string) {
    const sessionKey = `session:${userId}`;
    try {
      await this.cacheService.del(sessionKey);
    } catch (error) {
      this.logger.error(`Redis session invalidation failed: ${error.message}`);
    }
    return { message: 'Logged out successfully' };
  }

  /**
   * Generates admin session for OAuth/Google logins
   */
  async generateAdminSession(res: Response, userId: string, email: string) {
    const payload = {
      sub: userId,
      email: email.toLowerCase().trim(),
      role: 'ADMIN',
      type: 'oauth_admin',
    };

    const accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRY') || '15m';
    const refreshExpiry =
      this.config.get<string>('JWT_REFRESH_EXPIRY') || '30d';
    const redisTtl = this.config.get<number>('REDIS_SESSION_TTL') || 2592000;
    const cookieMaxAge =
      this.config.get<number>('COOKIE_MAX_AGE') || 2592000000;

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessExpiry as any,
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId },
      { expiresIn: refreshExpiry as any },
    );

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: Number(cookieMaxAge),
      path: '/',
    });

    try {
      await this.cacheService.set(
        `session:${userId}`,
        'active',
        Number(redisTtl),
      );
    } catch (err) {
      this.logger.error(
        `[REDIS ERROR] Failed to track admin session: ${err.message}`,
      );
    }

    return accessToken;
  }
}
