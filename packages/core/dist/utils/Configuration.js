"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Configuration = void 0;
exports.defineConfig = defineConfig;
const fs_extra_1 = require("fs-extra");
const cache_1 = require("../cache");
const hydration_1 = require("../hydration");
const NullHighlighter_1 = require("../utils/NullHighlighter");
const logging_1 = require("../logging");
const Utils_1 = require("../utils/Utils");
const ReflectMetadataProvider_1 = require("../metadata/ReflectMetadataProvider");
const errors_1 = require("../errors");
const RequestContext_1 = require("./RequestContext");
const enums_1 = require("../enums");
const MemoryCacheAdapter_1 = require("../cache/MemoryCacheAdapter");
const EntityComparator_1 = require("./EntityComparator");
class Configuration {
    static DEFAULTS = {
        pool: {},
        entities: [],
        entitiesTs: [],
        extensions: [],
        subscribers: [],
        filters: {},
        discovery: {
            warnWhenNoEntities: true,
            requireEntitiesArray: false,
            checkDuplicateTableNames: true,
            checkDuplicateFieldNames: true,
            checkDuplicateEntities: true,
            checkNonPersistentCompositeProps: true,
            alwaysAnalyseProperties: true,
            disableDynamicFileAccess: false,
            inferDefaultValues: true,
        },
        strict: false,
        validate: false,
        validateRequired: true,
        context: (name) => RequestContext_1.RequestContext.getEntityManager(name),
        contextName: 'default',
        allowGlobalContext: false,
        // eslint-disable-next-line no-console
        logger: console.log.bind(console),
        colors: true,
        findOneOrFailHandler: (entityName, where) => errors_1.NotFoundError.findOneFailed(entityName, where),
        findExactlyOneOrFailHandler: (entityName, where) => errors_1.NotFoundError.findExactlyOneFailed(entityName, where),
        baseDir: process.cwd(),
        hydrator: hydration_1.ObjectHydrator,
        flushMode: enums_1.FlushMode.AUTO,
        loadStrategy: enums_1.LoadStrategy.JOINED,
        dataloader: enums_1.DataloaderType.NONE,
        populateWhere: enums_1.PopulateHint.ALL,
        connect: true,
        ignoreUndefinedInQuery: false,
        onQuery: sql => sql,
        autoJoinOneToOneOwner: true,
        autoJoinRefsForFilters: true,
        propagationOnPrototype: true,
        populateAfterFlush: true,
        serialization: {
            includePrimaryKeys: true,
        },
        assign: {
            updateNestedEntities: true,
            updateByPrimaryKey: true,
            mergeObjectProperties: false,
            mergeEmbeddedProperties: true,
        },
        persistOnCreate: true,
        upsertManaged: true,
        forceEntityConstructor: false,
        forceUndefined: false,
        ensureDatabase: true,
        ensureIndexes: false,
        batchSize: 300,
        debug: false,
        ignoreDeprecations: false,
        verbose: false,
        driverOptions: {},
        migrations: {
            tableName: 'mikro_orm_migrations',
            path: './migrations',
            glob: '!(*.d).{js,ts,cjs}',
            silent: false,
            transactional: true,
            disableForeignKeys: false,
            allOrNothing: true,
            dropTables: true,
            safe: false,
            snapshot: true,
            emit: 'ts',
            fileName: (timestamp, name) => `Migration${timestamp}${name ? '_' + name : ''}`,
        },
        schemaGenerator: {
            disableForeignKeys: false,
            createForeignKeyConstraints: true,
            ignoreSchema: [],
        },
        embeddables: {
            prefixMode: 'absolute',
        },
        entityGenerator: {
            forceUndefined: true,
            undefinedDefaults: false,
            bidirectionalRelations: false,
            identifiedReferences: false,
            scalarTypeInDecorator: false,
            scalarPropertiesForRelations: 'never',
            fileName: (className) => className,
            onlyPurePivotTables: false,
            outputPurePivotTables: false,
            readOnlyPivotTables: false,
            useCoreBaseEntity: false,
        },
        metadataCache: {
            pretty: false,
            adapter: cache_1.FileCacheAdapter,
            options: { cacheDir: process.cwd() + '/temp' },
        },
        resultCache: {
            adapter: MemoryCacheAdapter_1.MemoryCacheAdapter,
            expiration: 1000, // 1s
            options: {},
        },
        metadataProvider: ReflectMetadataProvider_1.ReflectMetadataProvider,
        highlighter: new NullHighlighter_1.NullHighlighter(),
        seeder: {
            path: './seeders',
            defaultSeeder: 'DatabaseSeeder',
            glob: '!(*.d).{js,ts}',
            emit: 'ts',
            fileName: (className) => className,
        },
        preferReadReplicas: true,
        dynamicImportProvider: /* istanbul ignore next */ (id) => import(id),
    };
    options;
    logger;
    driver;
    platform;
    cache = new Map();
    extensions = new Map();
    constructor(options, validate = true) {
        if (options.dynamicImportProvider) {
            Utils_1.Utils.setDynamicImportProvider(options.dynamicImportProvider);
        }
        this.options = Utils_1.Utils.mergeConfig({}, Configuration.DEFAULTS, options);
        this.options.baseDir = Utils_1.Utils.absolutePath(this.options.baseDir);
        this.options.preferTs ??= options.tsNode;
        if (validate) {
            this.validateOptions();
        }
        this.options.loggerFactory ??= logging_1.DefaultLogger.create;
        this.logger = this.options.loggerFactory({
            debugMode: this.options.debug,
            ignoreDeprecations: this.options.ignoreDeprecations,
            usesReplicas: (this.options.replicas?.length ?? 0) > 0,
            highlighter: this.options.highlighter,
            writer: this.options.logger,
        });
        if (this.options.driver) {
            this.driver = new this.options.driver(this);
            this.platform = this.driver.getPlatform();
            this.platform.setConfig(this);
            this.detectSourceFolder(options);
            this.init(validate);
        }
    }
    /**
     * Gets specific configuration option. Falls back to specified `defaultValue` if provided.
     */
    get(key, defaultValue) {
        if (typeof this.options[key] !== 'undefined') {
            return this.options[key];
        }
        return defaultValue;
    }
    getAll() {
        return this.options;
    }
    /**
     * Overrides specified configuration value.
     */
    set(key, value) {
        this.options[key] = value;
        this.sync();
    }
    /**
     * Resets the configuration to its default value
     */
    reset(key) {
        this.options[key] = Configuration.DEFAULTS[key];
    }
    /**
     * Gets Logger instance.
     */
    getLogger() {
        return this.logger;
    }
    /**
     * Gets current client URL (connection string).
     */
    getClientUrl(hidePassword = false) {
        if (hidePassword) {
            return this.options.clientUrl.replace(/\/\/([^:]+):(.+)@/, '//$1:*****@');
        }
        return this.options.clientUrl;
    }
    /**
     * Gets current database driver instance.
     */
    getDriver() {
        return this.driver;
    }
    registerExtension(name, cb) {
        this.extensions.set(name, cb);
    }
    getExtension(name) {
        if (this.cache.has(name)) {
            return this.cache.get(name);
        }
        const ext = this.extensions.get(name);
        if (ext) {
            this.cache.set(name, ext());
            return this.cache.get(name);
        }
        /* istanbul ignore next */
        return undefined;
    }
    /**
     * Gets instance of NamingStrategy. (cached)
     */
    getNamingStrategy() {
        return this.getCachedService(this.options.namingStrategy || this.platform.getNamingStrategy());
    }
    /**
     * Gets instance of Hydrator. (cached)
     */
    getHydrator(metadata) {
        return this.getCachedService(this.options.hydrator, metadata, this.platform, this);
    }
    /**
     * Gets instance of Comparator. (cached)
     */
    getComparator(metadata) {
        return this.getCachedService(EntityComparator_1.EntityComparator, metadata, this.platform);
    }
    /**
     * Gets instance of MetadataProvider. (cached)
     */
    getMetadataProvider() {
        return this.getCachedService(this.options.metadataProvider, this);
    }
    /**
     * Gets instance of metadata CacheAdapter. (cached)
     */
    getMetadataCacheAdapter() {
        return this.getCachedService(this.options.metadataCache.adapter, this.options.metadataCache.options, this.options.baseDir, this.options.metadataCache.pretty);
    }
    /**
     * Gets instance of CacheAdapter for result cache. (cached)
     */
    getResultCacheAdapter() {
        return this.getCachedService(this.options.resultCache.adapter, { expiration: this.options.resultCache.expiration, ...this.options.resultCache.options });
    }
    /**
     * Gets EntityRepository class to be instantiated.
     */
    getRepositoryClass(repository) {
        if (repository) {
            return repository();
        }
        if (this.options.entityRepository) {
            return this.options.entityRepository;
        }
        return this.platform.getRepositoryClass();
    }
    /**
     * Creates instance of given service and caches it.
     */
    getCachedService(cls, ...args) {
        if (!this.cache.has(cls.name)) {
            const Class = cls;
            this.cache.set(cls.name, new Class(...args));
        }
        return this.cache.get(cls.name);
    }
    resetServiceCache() {
        this.cache.clear();
    }
    init(validate) {
        if (!this.getMetadataProvider().useCache()) {
            this.options.metadataCache.adapter = cache_1.NullCacheAdapter;
        }
        if (!('enabled' in this.options.metadataCache)) {
            this.options.metadataCache.enabled = this.getMetadataProvider().useCache();
        }
        if (!this.options.clientUrl) {
            this.options.clientUrl = this.driver.getConnection().getDefaultClientUrl();
        }
        if (!('implicitTransactions' in this.options)) {
            this.options.implicitTransactions = this.platform.usesImplicitTransactions();
        }
        try {
            const url = new URL(this.getClientUrl());
            if (url.pathname) {
                this.options.dbName = this.get('dbName', decodeURIComponent(url.pathname).substring(1));
            }
        }
        catch {
            const url = this.getClientUrl().match(/:\/\/.*\/([^?]+)/);
            if (url) {
                this.options.dbName = this.get('dbName', decodeURIComponent(url[1]));
            }
        }
        if (validate && !this.options.dbName && this.options.clientUrl) {
            throw new Error("No database specified, `clientUrl` option provided but it's missing the pathname.");
        }
        if (!this.options.charset) {
            this.options.charset = this.platform.getDefaultCharset();
        }
        Object.keys(this.options.filters).forEach(key => {
            this.options.filters[key].default ??= true;
        });
        this.options.subscribers = Utils_1.Utils.unique(this.options.subscribers).map(subscriber => {
            return subscriber.constructor.name === 'Function' ? new subscriber() : subscriber;
        });
        this.sync();
        if (!logging_1.colors.enabled()) {
            this.options.highlighter = new NullHighlighter_1.NullHighlighter();
        }
    }
    sync() {
        process.env.MIKRO_ORM_COLORS = '' + this.options.colors;
        this.options.tsNode = this.options.preferTs;
        this.logger.setDebugMode(this.options.debug);
    }
    /**
     * Checks if `src` folder exists, it so, tries to adjust the migrations and seeders paths automatically to use it.
     * If there is a `dist` or `build` folder, it will be used for the JS variant (`path` option), while the `src` folder will be
     * used for the TS variant (`pathTs` option).
     *
     * If the default folder exists (e.g. `/migrations`), the config will respect that, so this auto-detection should not
     * break existing projects, only help with the new ones.
     */
    detectSourceFolder(options) {
        if (!(0, fs_extra_1.pathExistsSync)(this.options.baseDir + '/src')) {
            return;
        }
        const migrationsPathExists = (0, fs_extra_1.pathExistsSync)(this.options.baseDir + '/' + this.options.migrations.path);
        const seedersPathExists = (0, fs_extra_1.pathExistsSync)(this.options.baseDir + '/' + this.options.seeder.path);
        const distDir = (0, fs_extra_1.pathExistsSync)(this.options.baseDir + '/dist');
        const buildDir = (0, fs_extra_1.pathExistsSync)(this.options.baseDir + '/build');
        // if neither `dist` nor `build` exist, we use the `src` folder as it might be a JS project without building, but with `src` folder
        const path = distDir ? './dist' : (buildDir ? './build' : './src');
        // only if the user did not provide any values and if the default path does not exist
        if (!options.migrations?.path && !options.migrations?.pathTs && !migrationsPathExists) {
            this.options.migrations.path = `${path}/migrations`;
            this.options.migrations.pathTs = './src/migrations';
        }
        // only if the user did not provide any values and if the default path does not exist
        if (!options.seeder?.path && !options.seeder?.pathTs && !seedersPathExists) {
            this.options.seeder.path = `${path}/seeders`;
            this.options.seeder.pathTs = './src/seeders';
        }
    }
    validateOptions() {
        /* istanbul ignore next */
        if ('type' in this.options) {
            throw new Error('The `type` option has been removed in v6, please fill in the `driver` option instead or use `defineConfig` helper (to define your ORM config) or `MikroORM` class (to call the `init` method) exported from the driver package (e.g. `import { defineConfig } from \'@mikro-orm/mysql\'; export default defineConfig({ ... })`).');
        }
        if (!this.options.driver) {
            throw new Error('No driver specified, please fill in the `driver` option or use `defineConfig` helper (to define your ORM config) or `MikroORM` class (to call the `init` method) exported from the driver package (e.g. `import { defineConfig } from \'@mikro-orm/mysql\'; export defineConfig({ ... })`).');
        }
        if (!this.options.dbName && !this.options.clientUrl) {
            throw new Error('No database specified, please fill in `dbName` or `clientUrl` option');
        }
        if (this.options.entities.length === 0 && this.options.discovery.warnWhenNoEntities) {
            throw new Error('No entities found, please use `entities` option');
        }
    }
}
exports.Configuration = Configuration;
/**
 * Type helper to make it easier to use `mikro-orm.config.js`.
 */
function defineConfig(options) {
    return options;
}
