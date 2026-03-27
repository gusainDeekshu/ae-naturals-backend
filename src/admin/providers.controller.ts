// src/admin/providers.controller.ts
import { Controller, Get, Post, Body, UseGuards, Query, Patch, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport'; // Add this import
import { ProviderConfigService } from '../providers/provider-config.service';
import { ProviderType } from '@prisma/client';
import { AdminGuard } from '../auth/guards/admin.guard';

// 1. Chain the guards: AuthGuard decodes the token first, THEN AdminGuard checks the role
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('admin/providers')
export class ProvidersController {
  constructor(private readonly providerConfigService: ProviderConfigService) {}

  // I've also added the GET route here since your React frontend needs it!
  @Get()
  async getProviders(@Query('type') type: ProviderType) {
    if (!type) return [];
    
    // 🔥 Changed from getActiveConfigs to getAllAdminConfigs
    return this.providerConfigService.getAllAdminConfigs(type.toUpperCase() as ProviderType);
  }

  @Post()
  async saveProviderConfig(
    @Body() body: { type: ProviderType; provider: string; isActive: boolean; priority: number; config: any }
  ) {
    return this.providerConfigService.saveConfig(body);
  }

  // 🔥 ADD THIS NEW PATCH ENDPOINT
  @Patch(':id')
  async updateProvider(
    @Param('id') id: string,
    @Body() body: any // Accepts partial updates (like just toggling isActive)
  ) {
    return this.providerConfigService.updateConfigById(id, body);
  }
}