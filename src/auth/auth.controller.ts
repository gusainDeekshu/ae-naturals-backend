import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import * as express from 'express';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using HTTP-only cookie' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing refresh token.',
  })
  async refresh(
    @Request() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    console.log(`Refresh token request received. Cookies:`, req.cookies); // Debug log for cookies
    return this.authService.refreshTokens(req, res);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile from refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Returns user profile and new access token.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - No valid session.' })
  async getProfile(@Request() req: express.Request) {
    try {
      console.log(`Attempting to get profile. Cookies:`, req.cookies); // Debug log for cookies

      const refreshToken = req.cookies?.refresh_token;

      if (!refreshToken) {
        throw new UnauthorizedException('No refresh token');
      }

      const { user, access_token } =
        await this.authService.getUserFromRefreshToken(refreshToken);

      return { user, access_token };
    } catch (err) {
      throw new UnauthorizedException('Invalid session');
    }
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Logout user and clear session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logout(
    @Request() req: any,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
    });

    const userId = req.user.sub || req.user.userId;

    return this.authService.logout(userId);
  }

  @Post('send-otp')
  @ApiOperation({ summary: 'Send a 6-digit OTP to email or phone' })
  @ApiBody({ type: SendOtpDto })
  @ApiResponse({ status: 201, description: 'OTP sent successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data.',
  })
  async sendOtp(@Body() body: SendOtpDto) {
    return this.authService.sendOtp(body.identifier, body.type);
  }

  @Post('verify-otp') // This maps to POST /auth/verify-otp
  @ApiOperation({ summary: 'Verify OTP and authenticate user' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({
    status: 200,
    description: 'OTP verified, returns access token and sets refresh cookie.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired OTP.',
  })
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    // Log for debugging
    console.log(`Verifying OTP for: ${body.identifier}`);
    return this.authService.verifyOtp(res, body.identifier, body.otp);
  }
}
