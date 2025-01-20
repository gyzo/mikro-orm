import type { MigrationsOptions, Transaction } from '@mikro-orm/core';
import type { MongoDriver } from '@mikro-orm/mongodb';
import type { MigrationParams, UmzugStorage } from 'umzug';
import type { MigrationRow } from './typings';
export declare class MigrationStorage implements UmzugStorage {
    protected readonly driver: MongoDriver;
    protected readonly options: MigrationsOptions;
    private masterTransaction?;
    constructor(driver: MongoDriver, options: MigrationsOptions);
    executed(): Promise<string[]>;
    logMigration(params: MigrationParams<any>): Promise<void>;
    unlogMigration(params: MigrationParams<any>): Promise<void>;
    getExecutedMigrations(): Promise<MigrationRow[]>;
    setMasterMigration(trx: Transaction): void;
    unsetMasterMigration(): void;
    /**
     * @internal
     */
    getMigrationName(name: string): string;
}
