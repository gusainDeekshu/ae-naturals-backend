import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AppCacheService } from 'src/common/cache/cache.service';
import { EmailService } from '../notifications/email.service';
import { SmsService } from '../notifications/sms.service';

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

      const accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRY') || '15m';

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
    const user = await this.prisma.user.findUnique({ where: { email: cleanEmail } });

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
  async sendOtp(identifier: string, type: 'phone' | 'email') {
    // Normalize identifier to prevent case-sensitivity issues
    const cleanIdentifier = identifier.includes('@') 
      ? identifier.toLowerCase().trim() 
      : identifier.trim();

    const otp = crypto.randomInt(100000, 1000000).toString();
    console.log(`Generated OTP for ${cleanIdentifier}: ${otp}`); // Debug log for generated OTP
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const expiryMinutes = this.config.get<number>('OTP_EXPIRY_MINUTES') || 5;
    const expires = new Date(Date.now() + expiryMinutes * 60 * 1000);
    
    // Clean up old tokens for this identifier
    await this.prisma.verificationToken.deleteMany({
      where: { identifier: cleanIdentifier },
    });

    await this.prisma.verificationToken.create({
      data: { identifier: cleanIdentifier, token: hashedOtp, expires },
    });

    this.logger.log(`Generated OTP for ${cleanIdentifier}: ${otp} (expires in ${expiryMinutes} minutes)`);
    
    const message = `Your Flower Fairy Login OTP is ${otp}. It expires in ${expiryMinutes} minutes.`;
    
    // try {
    //   if (type === 'phone') {
    //     await this.smsService.sendSMS(cleanIdentifier, message);
    //   } else {
    //     const html = `<div style="font-family: Arial, sans-serif; padding: 20px;">
    //                     <h2>Flower Fairy Login</h2>
    //                     <p>Your OTP is <strong style="font-size: 24px;">${otp}</strong>.</p>
    //                     <p>It expires in ${expiryMinutes} minutes.</p>
    //                   </div>`;
    //     await this.emailService.sendEmail(cleanIdentifier, 'Your Flower Fairy Login OTP', html);
    //   }
    // } catch (error) {
    //   this.logger.error(`Failed to send OTP to ${cleanIdentifier}: ${error.message}`);
    //   throw new BadRequestException('Failed to send OTP. Please check your details and try again.');
    // }

    return { message: 'OTP sent successfully' };
  }

  /**
   * Verifies OTP, upserts user, sets 30-day cookie, and creates Redis session
   */
  // src/auth/auth.service.ts

async verifyOtp(res: Response, identifier: string, otp: string) {
  const cleanIdentifier = identifier.includes('@') ? identifier.toLowerCase().trim() : identifier.trim();
  const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

  const record = await this.prisma.verificationToken.findFirst({
    where: { identifier: cleanIdentifier, token: hashedOtp },
  });

  if (!record || record.expires < new Date()) {
    throw new UnauthorizedException('Invalid or expired OTP');
  }

  await this.prisma.verificationToken.deleteMany({ where: { identifier: cleanIdentifier } });

  const user = await this.prisma.user.upsert({
    where: cleanIdentifier.includes('@') ? { email: cleanIdentifier } : { phone: cleanIdentifier },
    update: { lastLogin: new Date() },
    create: {
      email: cleanIdentifier.includes('@') ? cleanIdentifier : null,
      phone: cleanIdentifier.includes('@') ? null : cleanIdentifier,
      name: cleanIdentifier.split('@')[0],
      role: 'USER',
      password: '', 
    },
  });

  // 🔥 GENERATE SESSION
  return this.issueTokens(res, user.id, user.email, user.role);
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
      this.logger.warn(`Potential Breach: Revoked token used for user ${payload.sub}`);
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
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
private async issueTokens(res: Response, userId: string, email: string | null, role: string) {
  // Use a fallback if email is null (common in phone-only OTP login)
  const identifier = email || 'user_without_email'; 

  const payload = { 
    sub: userId, 
    email: identifier, 
    role, 
    tenantId: 'default-store' 
  };

  const accessToken = await this.jwtService.signAsync(payload, { 
    expiresIn: this.config.get('JWT_ACCESS_EXPIRY') || '15m' 
  });

  const refreshToken = await this.jwtService.signAsync({ sub: userId }, { 
    expiresIn: this.config.get('JWT_REFRESH_EXPIRY') || '7d' 
  });

  // SET SECURE COOKIE
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, 
    path: '/', 
  });

  await this.cacheService.set(`session:${userId}`, 'active', 7 * 24 * 60 * 60);

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
    const refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRY') || '30d';
    const redisTtl = this.config.get<number>('REDIS_SESSION_TTL') || 2592000;
    const cookieMaxAge = this.config.get<number>('COOKIE_MAX_AGE') || 2592000000;

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
      await this.cacheService.set(`session:${userId}`, 'active', Number(redisTtl));
    } catch (err) {
      this.logger.error(`[REDIS ERROR] Failed to track admin session: ${err.message}`);
    }

    return accessToken;
  }
}