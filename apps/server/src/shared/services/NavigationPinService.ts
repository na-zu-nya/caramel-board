import type { NavigationPin, NavigationPinType, PrismaClient } from '@prisma/client';

export class NavigationPinService {
  private prisma: PrismaClient;
  private userId: number;

  constructor(prisma: PrismaClient, userId: number) {
    this.prisma = prisma;
    this.userId = userId;
  }

  async create(data: {
    type: NavigationPinType;
    name: string;
    icon: string;
    order: number;
    dataSetId: number;
    collectionId?: number;
    mediaType?: string;
  }): Promise<NavigationPin> {
    return this.prisma.navigationPin.create({
      data: {
        ...data,
        userId: this.userId,
      },
      include: {
        collection: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
          },
        },
      },
    });
  }

  async findByDataSet(dataSetId: number): Promise<NavigationPin[]> {
    return this.prisma.navigationPin.findMany({
      where: { dataSetId, userId: this.userId },
      include: {
        collection: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async update(
    id: number,
    data: {
      name?: string;
      icon?: string;
      order?: number;
    }
  ): Promise<NavigationPin> {
    await this.ensureOwnership(id);

    return this.prisma.navigationPin.update({
      where: { id },
      data,
      include: {
        collection: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
          },
        },
      },
    });
  }

  async delete(id: number): Promise<NavigationPin> {
    await this.ensureOwnership(id);

    return this.prisma.navigationPin.delete({
      where: { id },
    });
  }

  async upsert(data: {
    type: NavigationPinType;
    name: string;
    icon: string;
    order: number;
    dataSetId: number;
    collectionId?: number;
    mediaType?: string;
  }): Promise<NavigationPin> {
    // Check if a navigation pin already exists with the same type and references
    const whereClause = {
      type: data.type,
      dataSetId: data.dataSetId,
      collectionId: data.collectionId || null,
      mediaType: data.mediaType || null,
      userId: this.userId,
    };

    const existing = await this.prisma.navigationPin.findFirst({
      where: whereClause,
      include: {
        collection: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
          },
        },
      },
    });

    if (existing) {
      // Update existing pin
      return this.prisma.navigationPin.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          icon: data.icon,
          order: data.order,
        },
        include: {
          collection: {
            select: {
              id: true,
              name: true,
              icon: true,
              type: true,
            },
          },
        },
      });
    } else {
      // Create new pin
      return this.prisma.navigationPin.create({
        data: {
          ...data,
          userId: this.userId,
        },
        include: {
          collection: {
            select: {
              id: true,
              name: true,
              icon: true,
              type: true,
            },
          },
        },
      });
    }
  }

  async updateOrder(pins: Array<{ id: number; order: number }>): Promise<void> {
    await this.prisma.$transaction(
      pins.map((pin) =>
        this.prisma.navigationPin.update({
          where: {
            id: pin.id,
            userId: this.userId,
          },
          data: { order: pin.order },
        })
      )
    );
  }

  private async ensureOwnership(id: number) {
    const existing = await this.prisma.navigationPin.findFirst({
      where: { id, userId: this.userId },
      select: { id: true },
    });

    if (!existing) {
      throw new Error('Navigation pin not found for current user');
    }
  }
}
