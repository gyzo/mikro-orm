import { type IMigrationGenerator, type MigrationsOptions, type NamingStrategy } from '@mikro-orm/core';
import type { MongoDriver } from '@mikro-orm/mongodb';
export declare abstract class MigrationGenerator implements IMigrationGenerator {
    protected readonly driver: MongoDriver;
    protected readonly namingStrategy: NamingStrategy;
    protected readonly options: MigrationsOptions;
    constructor(driver: MongoDriver, namingStrategy: NamingStrategy, options: MigrationsOptions);
    /**
     * @inheritDoc
     */
    generate(diff: {
        up: string[];
        down: string[];
    }, path?: string, name?: string): Promise<[string, string]>;
    /**
     * @inheritDoc
     */
    createStatement(query: string, padLeft: number): string;
    /**
     * @inheritDoc
     */
    abstract generateMigrationFile(className: string, diff: {
        up: string[];
        down: string[];
    }): string;
}
