import { type MigrationParams, type RunnableMigration } from 'umzug';
import { type Constructor, type IMigrator, type MikroORM, type MigratorEvent, type MaybePromise } from '@mikro-orm/core';
import { DatabaseSchema, type EntityManager } from '@mikro-orm/knex';
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
    private readonly schemaGenerator;
    private readonly config;
    private readonly options;
    private readonly absolutePath;
    private readonly snapshotPath;
    constructor(em: EntityManager);
    static register(orm: MikroORM): void;
    /**
     * @inheritDoc
     */
    createMigration(path?: string, blank?: boolean, initial?: boolean, name?: string): Promise<MigrationResult>;
    checkMigrationNeeded(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    createInitialMigration(path?: string, name?: string, blank?: boolean): Promise<MigrationResult>;
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
     * Initial migration can be created only if:
     * 1. no previous migrations were generated or executed
     * 2. existing schema do not contain any of the tables defined by metadata
     *
     * If existing schema contains all of the tables already, we return true, based on that we mark the migration as already executed.
     * If only some of the tables are present, exception is thrown.
     */
    private validateInitialMigration;
    /**
     * @inheritDoc
     */
    getExecutedMigrations(): Promise<MigrationRow[]>;
    private ensureDatabase;
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
    protected getSchemaFromSnapshot(): DatabaseSchema | undefined;
    protected storeCurrentSchema(): Promise<void>;
    protected initialize(MigrationClass: Constructor<Migration>, name: string): RunnableMigration<any>;
    private getSchemaDiff;
    private getMigrationFilename;
    private prefix;
    private runMigrations;
    private runInTransaction;
    private ensureMigrationsDirExists;
}
