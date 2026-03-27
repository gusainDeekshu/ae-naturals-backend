// src/cart/cart.controller.ts
import { 
  Controller, Get, Post, Delete, Body, Req, Param, UseGuards, Patch 
} from '@nestjs/common';
import { 
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam 
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateQuantityDto } from './dto/cart.dto';

@ApiTags('Shopping Cart') // Groups these endpoints in the UI
@ApiBearerAuth() // Indicates JWT is required
@UseGuards(AuthGuard('jwt'))
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  @ApiOperation({ summary: 'Add an item to the user cart' })
  @ApiBody({ type: AddToCartDto })
  @ApiResponse({ status: 201, description: 'Item added or quantity incremented.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  async add(@Req() req, @Body() dto: AddToCartDto) {
    return this.cartService.addToCart(req.user.userId, dto.productId, dto.quantity);
  }

  @Get()
  @ApiOperation({ summary: 'Get the current user cart' })
  @ApiResponse({ status: 200, description: 'Returns cart with items and products.' })
  async getCart(@Req() req) {
    return this.cartService.getCart(req.user.userId);
  }

  @Patch('update')
  @ApiOperation({ summary: 'Update item quantity in cart' })
  @ApiBody({ type: UpdateQuantityDto })
  @ApiResponse({ status: 200, description: 'Quantity updated successfully.' })
  async update(@Req() req, @Body() dto: UpdateQuantityDto) {
    return this.cartService.updateQuantity(req.user.userId, dto.productId, dto.quantity);
  }

  @Delete('remove/:productId')
  @ApiOperation({ summary: 'Remove a specific item from the cart' })
  @ApiParam({ name: 'productId', description: 'ID of the product to remove' })
  @ApiResponse({ status: 200, description: 'Item removed from cart.' })
  async remove(@Req() req, @Param('productId') pid: string) {
    return this.cartService.removeItem(req.user.userId, pid);
  }

  @Delete('clear')
  @ApiOperation({ summary: 'Remove all items from the cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared successfully.' })
  async clear(@Req() req) {
    return this.cartService.clearCart(req.user.userId);
  }
}