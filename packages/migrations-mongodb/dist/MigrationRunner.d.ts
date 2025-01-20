import type { MigrationsOptions, Transaction } from '@mikro-orm/core';
import type { MongoDriver } from '@mikro-orm/mongodb';
import type { Migration } from './Migration';
export declare class MigrationRunner {
    protected readonly driver: MongoDriver;
    protected readonly options: MigrationsOptions;
    private readonly connection;
    private masterTransaction?;
    constructor(driver: MongoDriver, options: MigrationsOptions);
    run(migration: Migration, method: 'up' | 'down'): Promise<void>;
    setMasterMigration(trx: Transaction): void;
    unsetMasterMigration(): void;
}
