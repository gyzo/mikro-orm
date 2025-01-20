import { type GenerateOptions, type MikroORM } from '@mikro-orm/core';
import { type EntityManager } from '@mikro-orm/knex';
export declare class EntityGenerator {
    private readonly em;
    private readonly config;
    private readonly driver;
    private readonly platform;
    private readonly helper;
    private readonly connection;
    private readonly namingStrategy;
    private readonly sources;
    private readonly referencedEntities;
    constructor(em: EntityManager);
    static register(orm: MikroORM): void;
    generate(options?: GenerateOptions): Promise<string[]>;
    private getEntityMetadata;
    private matchName;
    private detectManyToManyRelations;
    private generateBidirectionalRelations;
    private generateIdentifiedReferences;
    private generateAndAttachCustomBaseEntity;
    private castNullDefaultsToUndefined;
}
