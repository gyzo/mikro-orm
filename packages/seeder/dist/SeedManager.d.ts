import { type Constructor, type EntityManager, type ISeedManager, type MikroORM } from '@mikro-orm/core';
import type { Seeder } from './Seeder';
export declare class SeedManager implements ISeedManager {
    private readonly em;
    private readonly config;
    private readonly options;
    private readonly absolutePath;
    constructor(em: EntityManager);
    static register(orm: MikroORM): void;
    seed(...classNames: Constructor<Seeder>[]): Promise<void>;
    /**
     * @internal
     */
    seedString(...classNames: string[]): Promise<void>;
    createSeeder(className: string): Promise<string>;
    private ensureSeedersDirExists;
    private generate;
}
