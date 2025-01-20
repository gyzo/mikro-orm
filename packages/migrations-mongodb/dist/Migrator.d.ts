import { type MigrationParams, type RunnableMigration } from 'umzug';
import { type Constructor, type IMigrator, type MikroORM, type MigratorEvent, type MaybePromise } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/mongodb';
import type { Migration } from './Migration';
import { MigrationStorage } from './MigrationStorage';
import type { MigrateOptions, MigrationResult, MigrationRow, UmzugMigration } from './typings';
export declare class Migrator implements IMigrator {
    private readonly em;
    private umzug;
    private runner;
    private storage;
    private generator;
    private readonly driver;
    private readonly config;
    private readonly options;
    private readonly absolutePath;
    constructor(em: EntityManager);
    static register(orm: MikroORM): void;
    /**
     * @inheritDoc
     */
    createMigration(path?: string, blank?: boolean, initial?: boolean, name?: string): Promise<MigrationResult>;
    /**
     * @inheritDoc
     */
    checkMigrationNeeded(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    createInitialMigration(path?: string): Promise<MigrationResult>;
    /**
     * @inheritDoc
     */
    on(eventName: MigratorEvent, listener: (event: UmzugMigration) => MaybePromise<void>): this;
    /**
     * @inheritDoc
     */
    off(eventName: MigratorEvent, listener: (event: UmzugMigration) => MaybePromise<void>): this;
    private createUmzug;
    /**
     * @inheritDoc
     */
    getExecutedMigrations(): Promise<MigrationRow[]>;
    /**
     * @inheritDoc
     */
    getPendingMigrations(): Promise<UmzugMigration[]>;
    /**
     * @inheritDoc
     */
    up(options?: string | string[] | MigrateOptions): Promise<UmzugMigration[]>;
    /**
     * @inheritDoc
     */
    down(options?: string | string[] | MigrateOptions): Promise<UmzugMigration[]>;
    getStorage(): MigrationStorage;
    protected resolve(params: MigrationParams<any>): RunnableMigration<any>;
    protected initialize(MigrationClass: Constructor<Migration>, name: string): RunnableMigration<any>;
    private getMigrationFilename;
    private prefix;
    private runMigrations;
    private runInTransaction;
    private ensureMigrationsDirExists;
}
