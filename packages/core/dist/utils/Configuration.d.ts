import type { NamingStrategy } from '../naming-strategy';
import { FileCacheAdapter, type SyncCacheAdapter, type CacheAdapter } from '../cache';
import type { EntityRepository } from '../entity/EntityRepository';
import type { AnyEntity, Constructor, Dictionary, EntityClass, EntityClassGroup, FilterDef, Highlighter, HydratorConstructor, IHydrator, IMigrationGenerator, IPrimaryKey, MaybePromise, MigrationObject, EntityMetadata, EnsureDatabaseOptions, GenerateOptions, Migration } from '../typings';
import { ObjectHydrator } from '../hydration';
import { NullHighlighter } from '../utils/NullHighlighter';
import { type Logger, type LoggerNamespace, type LoggerOptions } from '../logging';
import type { EntityManager } from '../EntityManager';
import type { Platform } from '../platforms';
import type { EntitySchema } from '../metadata/EntitySchema';
import type { MetadataProvider } from '../metadata/MetadataProvider';
import type { MetadataStorage } from '../metadata/MetadataStorage';
import { ReflectMetadataProvider } from '../metadata/ReflectMetadataProvider';
import type { EmbeddedPrefixMode } from '../decorators/Embedded';
import type { EventSubscriber } from '../events';
import type { AssignOptions } from '../entity/EntityAssigner';
import type { EntityManagerType, IDatabaseDriver } from '../drivers/IDatabaseDriver';
import { NotFoundError } from '../errors';
import { DataloaderType, FlushMode, LoadStrategy, PopulateHint } from '../enums';
import { MemoryCacheAdapter } from '../cache/MemoryCacheAdapter';
import { EntityComparator } from './EntityComparator';
import type { Type } from '../types/Type';
import type { MikroORM } from '../MikroORM';
export declare class Configuration<D extends IDatabaseDriver = IDatabaseDriver, EM extends EntityManager = D[typeof EntityManagerType] & EntityManager> {
    static readonly DEFAULTS: {
        pool: {};
        entities: never[];
        entitiesTs: never[];
        extensions: never[];
        subscribers: never[];
        filters: {};
        discovery: {
            warnWhenNoEntities: true;
            requireEntitiesArray: false;
            checkDuplicateTableNames: true;
            checkDuplicateFieldNames: true;
            checkDuplicateEntities: true;
            checkNonPersistentCompositeProps: true;
            alwaysAnalyseProperties: true;
            disableDynamicFileAccess: false;
            inferDefaultValues: true;
        };
        strict: false;
        validate: false;
        validateRequired: true;
        context: (name: string) => EntityManager<IDatabaseDriver<import("..").Connection>> | undefined;
        contextName: string;
        allowGlobalContext: false;
        logger: (message?: any, ...optionalParams: any[]) => void;
        colors: true;
        findOneOrFailHandler: (entityName: string, where: Dictionary | IPrimaryKey) => NotFoundError<Partial<any>>;
        findExactlyOneOrFailHandler: (entityName: string, where: Dictionary | IPrimaryKey) => NotFoundError<Partial<any>>;
        baseDir: string;
        hydrator: typeof ObjectHydrator;
        flushMode: FlushMode.AUTO;
        loadStrategy: LoadStrategy.JOINED;
        dataloader: DataloaderType.NONE;
        populateWhere: PopulateHint.ALL;
        connect: true;
        ignoreUndefinedInQuery: false;
        onQuery: (sql: string) => string;
        autoJoinOneToOneOwner: true;
        autoJoinRefsForFilters: true;
        propagationOnPrototype: true;
        populateAfterFlush: true;
        serialization: {
            includePrimaryKeys: true;
        };
        assign: {
            updateNestedEntities: true;
            updateByPrimaryKey: true;
            mergeObjectProperties: false;
            mergeEmbeddedProperties: true;
        };
        persistOnCreate: true;
        upsertManaged: true;
        forceEntityConstructor: false;
        forceUndefined: false;
        ensureDatabase: true;
        ensureIndexes: false;
        batchSize: number;
        debug: false;
        ignoreDeprecations: false;
        verbose: false;
        driverOptions: {};
        migrations: {
            tableName: string;
            path: string;
            glob: string;
            silent: false;
            transactional: true;
            disableForeignKeys: false;
            allOrNothing: true;
            dropTables: true;
            safe: false;
            snapshot: true;
            emit: "ts";
            fileName: (timestamp: string, name?: string) => string;
        };
        schemaGenerator: {
            disableForeignKeys: false;
            createForeignKeyConstraints: true;
            ignoreSchema: never[];
        };
        embeddables: {
            prefixMode: "absolute";
        };
        entityGenerator: {
            forceUndefined: true;
            undefinedDefaults: false;
            bidirectionalRelations: false;
            identifiedReferences: false;
            scalarTypeInDecorator: false;
            scalarPropertiesForRelations: "never";
            fileName: (className: string) => string;
            onlyPurePivotTables: false;
            outputPurePivotTables: false;
            readOnlyPivotTables: false;
            useCoreBaseEntity: false;
        };
        metadataCache: {
            pretty: false;
            adapter: typeof FileCacheAdapter;
            options: {
                cacheDir: string;
            };
        };
        resultCache: {
            adapter: typeof MemoryCacheAdapter;
            expiration: number;
            options: {};
        };
        metadataProvider: typeof ReflectMetadataProvider;
        highlighter: NullHighlighter;
        seeder: {
            path: string;
            defaultSeeder: string;
            glob: string;
            emit: "ts";
            fileName: (className: string) => string;
        };
        preferReadReplicas: true;
        dynamicImportProvider: (id: string) => Promise<any>;
    };
    private readonly options;
    private readonly logger;
    private readonly driver;
    private readonly platform;
    private readonly cache;
    private readonly extensions;
    constructor(options: Options, validate?: boolean);
    /**
     * Gets specific configuration option. Falls back to specified `defaultValue` if provided.
     */
    get<T extends keyof MikroORMOptions<D, EM>, U extends MikroORMOptions<D, EM>[T]>(key: T, defaultValue?: U): U;
    getAll(): MikroORMOptions<D, EM>;
    /**
     * Overrides specified configuration value.
     */
    set<T extends keyof MikroORMOptions<D, EM>, U extends MikroORMOptions<D, EM>[T]>(key: T, value: U): void;
    /**
     * Resets the configuration to its default value
     */
    reset<T extends keyof MikroORMOptions<D, EM>>(key: T): void;
    /**
     * Gets Logger instance.
     */
    getLogger(): Logger;
    /**
     * Gets current client URL (connection string).
     */
    getClientUrl(hidePassword?: boolean): string;
    /**
     * Gets current database driver instance.
     */
    getDriver(): D;
    registerExtension(name: string, cb: () => unknown): void;
    getExtension<T>(name: string): T | undefined;
    /**
     * Gets instance of NamingStrategy. (cached)
     */
    getNamingStrategy(): NamingStrategy;
    /**
     * Gets instance of Hydrator. (cached)
     */
    getHydrator(metadata: MetadataStorage): IHydrator;
    /**
     * Gets instance of Comparator. (cached)
     */
    getComparator(metadata: MetadataStorage): EntityComparator;
    /**
     * Gets instance of MetadataProvider. (cached)
     */
    getMetadataProvider(): MetadataProvider;
    /**
     * Gets instance of metadata CacheAdapter. (cached)
     */
    getMetadataCacheAdapter(): SyncCacheAdapter;
    /**
     * Gets instance of CacheAdapter for result cache. (cached)
     */
    getResultCacheAdapter(): CacheAdapter;
    /**
     * Gets EntityRepository class to be instantiated.
     */
    getRepositoryClass(repository: () => EntityClass<EntityRepository<AnyEntity>>): MikroORMOptions<D, EM>['entityRepository'];
    /**
     * Creates instance of given service and caches it.
     */
    getCachedService<T extends {
        new (...args: any[]): InstanceType<T>;
    }>(cls: T, ...args: ConstructorParameters<T>): InstanceType<T>;
    resetServiceCache(): void;
    private init;
    private sync;
    /**
     * Checks if `src` folder exists, it so, tries to adjust the migrations and seeders paths automatically to use it.
     * If there is a `dist` or `build` folder, it will be used for the JS variant (`path` option), while the `src` folder will be
     * used for the TS variant (`pathTs` option).
     *
     * If the default folder exists (e.g. `/migrations`), the config will respect that, so this auto-detection should not
     * break existing projects, only help with the new ones.
     */
    private detectSourceFolder;
    private validateOptions;
}
/**
 * Type helper to make it easier to use `mikro-orm.config.js`.
 */
export declare function defineConfig<D extends IDatabaseDriver>(options: Options<D>): Options<D, D[typeof EntityManagerType] & EntityManager<IDatabaseDriver<import("..").Connection>>>;
export interface DynamicPassword {
    password: string;
    expirationChecker?: () => boolean;
}
export interface ConnectionOptions {
    dbName?: string;
    schema?: string;
    name?: string;
    clientUrl?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string | (() => MaybePromise<string> | MaybePromise<DynamicPassword>);
    charset?: string;
    collate?: string;
    multipleStatements?: boolean;
    pool?: PoolConfig;
    driverOptions?: Dictionary;
}
export type MigrationsOptions = {
    tableName?: string;
    path?: string;
    pathTs?: string;
    glob?: string;
    silent?: boolean;
    transactional?: boolean;
    disableForeignKeys?: boolean;
    allOrNothing?: boolean;
    dropTables?: boolean;
    safe?: boolean;
    snapshot?: boolean;
    snapshotName?: string;
    emit?: 'js' | 'ts' | 'cjs';
    generator?: Constructor<IMigrationGenerator>;
    fileName?: (timestamp: string, name?: string) => string;
    migrationsList?: (MigrationObject | Constructor<Migration>)[];
};
export interface SeederOptions {
    path?: string;
    pathTs?: string;
    glob?: string;
    defaultSeeder?: string;
    emit?: 'js' | 'ts';
    fileName?: (className: string) => string;
}
export interface PoolConfig {
    name?: string;
    afterCreate?: Function;
    min?: number;
    max?: number;
    refreshIdle?: boolean;
    idleTimeoutMillis?: number;
    reapIntervalMillis?: number;
    returnToHead?: boolean;
    priorityRange?: number;
    log?: (message: string, logLevel: string) => void;
    propagateCreateError?: boolean;
    createRetryIntervalMillis?: number;
    createTimeoutMillis?: number;
    destroyTimeoutMillis?: number;
    acquireTimeoutMillis?: number;
}
export interface MetadataDiscoveryOptions {
    warnWhenNoEntities?: boolean;
    requireEntitiesArray?: boolean;
    checkDuplicateTableNames?: boolean;
    checkDuplicateFieldNames?: boolean;
    checkDuplicateEntities?: boolean;
    checkNonPersistentCompositeProps?: boolean;
    alwaysAnalyseProperties?: boolean;
    disableDynamicFileAccess?: boolean;
    inferDefaultValues?: boolean;
    getMappedType?: (type: string, platform: Platform) => Type<unknown> | undefined;
    onMetadata?: (meta: EntityMetadata, platform: Platform) => MaybePromise<void>;
    afterDiscovered?: (storage: MetadataStorage, platform: Platform) => MaybePromise<void>;
    tsConfigPath?: string;
}
export interface MikroORMOptions<D extends IDatabaseDriver = IDatabaseDriver, EM extends EntityManager = EntityManager> extends ConnectionOptions {
    entities: (string | EntityClass<AnyEntity> | EntityClassGroup<AnyEntity> | EntitySchema)[];
    entitiesTs: (string | EntityClass<AnyEntity> | EntityClassGroup<AnyEntity> | EntitySchema)[];
    extensions: {
        register: (orm: MikroORM) => void;
    }[];
    subscribers: (EventSubscriber | Constructor<EventSubscriber>)[];
    filters: Dictionary<{
        name?: string;
    } & Omit<FilterDef, 'name'>>;
    discovery: MetadataDiscoveryOptions;
    driver?: {
        new (config: Configuration): D;
    };
    namingStrategy?: {
        new (): NamingStrategy;
    };
    implicitTransactions?: boolean;
    disableTransactions?: boolean;
    connect: boolean;
    verbose: boolean;
    ignoreUndefinedInQuery?: boolean;
    onQuery: (sql: string, params: unknown[]) => string;
    autoJoinOneToOneOwner: boolean;
    autoJoinRefsForFilters: boolean;
    propagationOnPrototype: boolean;
    populateAfterFlush: boolean;
    serialization: {
        includePrimaryKeys?: boolean;
        /** Enforce unpopulated references to be returned as objects, e.g. `{ author: { id: 1 } }` instead of `{ author: 1 }`. */
        forceObject?: boolean;
    };
    assign: AssignOptions<boolean>;
    persistOnCreate: boolean;
    upsertManaged: boolean;
    forceEntityConstructor: boolean | (Constructor<AnyEntity> | string)[];
    forceUndefined: boolean;
    forceUtcTimezone?: boolean;
    timezone?: string;
    ensureDatabase: boolean | EnsureDatabaseOptions;
    ensureIndexes: boolean;
    useBatchInserts?: boolean;
    useBatchUpdates?: boolean;
    batchSize: number;
    hydrator: HydratorConstructor;
    loadStrategy: LoadStrategy | 'select-in' | 'joined';
    dataloader: DataloaderType | boolean;
    populateWhere?: PopulateHint | `${PopulateHint}`;
    flushMode: FlushMode | 'commit' | 'auto' | 'always';
    entityRepository?: EntityClass<EntityRepository<any>>;
    entityManager?: Constructor<EM>;
    replicas?: ConnectionOptions[];
    strict: boolean;
    validate: boolean;
    validateRequired: boolean;
    context: (name: string) => EntityManager | undefined;
    contextName: string;
    allowGlobalContext: boolean;
    disableIdentityMap?: boolean;
    logger: (message: string) => void;
    colors?: boolean;
    loggerFactory?: (options: LoggerOptions) => Logger;
    findOneOrFailHandler: (entityName: string, where: Dictionary | IPrimaryKey) => Error;
    findExactlyOneOrFailHandler: (entityName: string, where: Dictionary | IPrimaryKey) => Error;
    debug: boolean | LoggerNamespace[];
    ignoreDeprecations: boolean | string[];
    highlighter: Highlighter;
    /**
     * Using this option, you can force the ORM to use the TS options regardless of whether the TypeScript support
     * is detected or not. This effectively means using `entitiesTs` for discovery and `pathTs` for migrations and
     * seeders. Should be used only for tests and stay disabled for production builds.
     */
    preferTs?: boolean;
    /** @deprecated use `preferTs` instead */
    tsNode?: boolean;
    baseDir: string;
    migrations: MigrationsOptions;
    schemaGenerator: {
        disableForeignKeys?: boolean;
        createForeignKeyConstraints?: boolean;
        ignoreSchema?: string[];
        managementDbName?: string;
    };
    embeddables: {
        prefixMode: EmbeddedPrefixMode;
    };
    entityGenerator: GenerateOptions;
    metadataCache: {
        enabled?: boolean;
        combined?: boolean | string;
        pretty?: boolean;
        adapter?: {
            new (...params: any[]): SyncCacheAdapter;
        };
        options?: Dictionary;
    };
    resultCache: {
        expiration?: number;
        adapter?: {
            new (...params: any[]): CacheAdapter;
        };
        options?: Dictionary;
        global?: boolean | number | [string, number];
    };
    metadataProvider: {
        new (config: Configuration): MetadataProvider;
    };
    seeder: SeederOptions;
    preferReadReplicas: boolean;
    dynamicImportProvider: (id: string) => Promise<unknown>;
}
export type Options<D extends IDatabaseDriver = IDatabaseDriver, EM extends D[typeof EntityManagerType] & EntityManager = D[typeof EntityManagerType] & EntityManager> = Pick<MikroORMOptions<D, EM>, Exclude<keyof MikroORMOptions<D, EM>, keyof typeof Configuration.DEFAULTS>> & Partial<MikroORMOptions<D, EM>>;
