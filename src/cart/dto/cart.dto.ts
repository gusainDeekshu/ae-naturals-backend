// src/cart/dto/cart.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min } from 'class-validator';

export class AddToCartDto {
  @ApiProperty({ 
    description: 'The unique ID of the product', 
    example: 'cmn7dsfo70003u4tymm0jm2pj' 
  })
  @IsString()
  productId: string;

  @ApiProperty({ 
    description: 'Number of items to add', 
    example: 1, 
    minimum: 1 
  })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class UpdateQuantityDto extends AddToCartDto {}