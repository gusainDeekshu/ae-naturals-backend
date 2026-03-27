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
  async login(email: string, pass: string) {
    const cleanEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user || !(await bcrypt.compare(pass, user.password))) {
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
      console.log('🔍 Incoming verifyOtp request');
      console.log('Identifier:', identifier);
      console.log('OTP:', otp);

      // 🔥 FIX 1: MUST EXACTLY MATCH `sendOtp` NORMALIZATION
      // If it's a phone number, strip all non-numeric characters (spaces, dashes, +)
      const cleanIdentifier = identifier.includes('@')
        ? identifier.toLowerCase().trim()
        : identifier.replace(/\D/g, '');

      console.log('✅ Clean Identifier:', cleanIdentifier);

      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
      console.log('🔐 Hashed OTP:', hashedOtp);

      // 🔥 FIX 2: Check if ANY record exists for this identifier first
      // This tells us if the user actually requested an OTP before verifying
      const record = await this.prisma.verificationToken.findFirst({
        where: { identifier: cleanIdentifier },
      });

      console.log('📦 DB Record Found for Identifier:', record ? 'Yes' : 'No');

      if (!record) {
        console.error(
          '❌ No OTP was requested, or it expired and was deleted.',
        );
        throw new UnauthorizedException(
          'No active OTP found. Please request a new one.',
        );
      }

      // 🔥 FIX 3: Check Expiration
      if (record.expires < new Date()) {
        console.error('⏰ OTP expired at:', record.expires);
        // Clean up the expired token
        await this.prisma.verificationToken.deleteMany({
          where: { identifier: cleanIdentifier },
        });
        throw new UnauthorizedException(
          'OTP has expired. Please request a new one.',
        );
      }

      // 🔥 FIX 4: Actually compare the hashes
      if (record.token !== hashedOtp) {
        console.error('❌ OTP mismatch. User entered wrong code.');
        throw new UnauthorizedException('Invalid OTP code. Please try again.');
      }

      console.log('✅ OTP is valid');

      // Clean up used OTP so it cannot be used again
      await this.prisma.verificationToken.deleteMany({
        where: { identifier: cleanIdentifier },
      });

      console.log('🗑️ Deleted OTP records for identifier');

      const user = await this.prisma.user.upsert({
        where: cleanIdentifier.includes('@')
          ? { email: cleanIdentifier }
          : { phone: cleanIdentifier },
        update: { lastLogin: new Date() },
        create: {
          email: cleanIdentifier.includes('@') ? cleanIdentifier : null,
          phone: cleanIdentifier.includes('@') ? null : cleanIdentifier,
          name: cleanIdentifier.includes('@')
            ? cleanIdentifier.split('@')[0]
            : cleanIdentifier,
          role: 'USER',
          password: '',
        },
      });

      console.log('👤 User Upserted:', user.id);

      // 🔥 GENERATE SESSION
      const tokens = await this.issueTokens(
        res,
        user.id,
        user.email,
        user.role,
      );

      console.log('🎟️ Tokens Issued Successfully');

      return tokens;
    } catch (error) {
      console.error('🔥 verifyOtp ERROR:', error.message);

      throw new UnauthorizedException(
        error?.message || 'OTP verification failed',
      );
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
