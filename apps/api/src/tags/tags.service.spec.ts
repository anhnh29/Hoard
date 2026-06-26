import { Test, TestingModule } from '@nestjs/testing';
import { TagsService } from './tags.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TagsService', () => {
  let service: TagsService;
  const prismaMock = {
    tag: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  it('returns existing tags without creating duplicates', async () => {
    prismaMock.tag.findUnique.mockResolvedValue({ id: 't1', name: 'vue', slug: 'vue' });

    const result = await service.findOrCreateManyByName(['vue']);

    expect(prismaMock.tag.create).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 't1', name: 'vue', slug: 'vue' }]);
  });

  it('creates a tag that does not exist yet', async () => {
    prismaMock.tag.findUnique.mockResolvedValue(null);
    prismaMock.tag.create.mockResolvedValue({ id: 't2', name: 'new tag', slug: 'new-tag' });

    const result = await service.findOrCreateManyByName(['new tag']);

    expect(prismaMock.tag.create).toHaveBeenCalledWith({
      data: { name: 'new tag', slug: 'new-tag' },
    });
    expect(result).toEqual([{ id: 't2', name: 'new tag', slug: 'new-tag' }]);
  });

  it('deduplicates repeated names in the input', async () => {
    prismaMock.tag.findUnique.mockResolvedValue({ id: 't1', name: 'vue', slug: 'vue' });

    const result = await service.findOrCreateManyByName(['vue', 'vue']);

    expect(result).toHaveLength(1);
  });
});
