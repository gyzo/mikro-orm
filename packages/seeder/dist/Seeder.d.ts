import type { Dictionary, EntityManager } from '@mikro-orm/core';
export declare abstract class Seeder<T extends Dictionary = Dictionary> {
    abstract run(em: EntityManager, context?: T): void | Promise<void>;
    protected call(em: EntityManager, seeders: {
        new (): Seeder;
    }[], context?: T): Promise<void>;
}
