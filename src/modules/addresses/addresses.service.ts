import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, createAddressDto: CreateAddressDto) {
    if (createAddressDto.isDefault) {
      await this.clearDefaultAddress(userId);
    }

    return this.prisma.address.create({
      data: {
        userId,
        ...createAddressDto,
      },
    });
  }

  findAll(userId: number) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: number, id: number) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
    });

    if (!address) {
      throw new NotFoundException(`Address with id ${id} not found`);
    }

    return address;
  }

  async update(userId: number, id: number, updateAddressDto: UpdateAddressDto) {
    await this.findOne(userId, id);

    if (updateAddressDto.isDefault) {
      await this.clearDefaultAddress(userId);
    }

    return this.prisma.address.update({
      where: { id },
      data: updateAddressDto,
    });
  }

  async remove(userId: number, id: number) {
    await this.findOne(userId, id);

    return this.prisma.address.delete({
      where: { id },
    });
  }

  private async clearDefaultAddress(userId: number) {
    await this.prisma.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }
}
