"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migrator = void 0;
const umzug_1 = require("umzug");
const node_path_1 = require("node:path");
const fs_extra_1 = require("fs-extra");
const core_1 = require("@mikro-orm/core");
const knex_1 = require("@mikro-orm/knex");
const MigrationRunner_1 = require("./MigrationRunner");
const MigrationStorage_1 = require("./MigrationStorage");
const TSMigrationGenerator_1 = require("./TSMigrationGenerator");
const JSMigrationGenerator_1 = require("./JSMigrationGenerator");
class Migrator {
    em;
    umzug;
    runner;
    storage;
    generator;
    driver;
    schemaGenerator;
    config;
    options;
    absolutePath;
    snapshotPath;
    constructor(em) {
        this.em = em;
        this.driver = this.em.getDriver();
        this.schemaGenerator = new knex_1.SqlSchemaGenerator(this.em);
        this.config = this.em.config;
        this.options = this.config.get('migrations');
        /* istanbul ignore next */
        const key = (this.config.get('preferTs', core_1.Utils.detectTsNode()) && this.options.pathTs) ? 'pathTs' : 'path';
        this.absolutePath = core_1.Utils.absolutePath(this.options[key], this.config.get('baseDir'));
        // for snapshots, we always want to use the path based on `emit` option, regardless of whether we run in ts-node context
        /* istanbul ignore next */
        const snapshotPath = this.options.emit === 'ts' && this.options.pathTs ? this.options.pathTs : this.options.path;
        const absoluteSnapshotPath = core_1.Utils.absolutePath(snapshotPath, this.config.get('baseDir'));
        const dbName = (0, node_path_1.basename)(this.config.get('dbName'));
        const snapshotName = this.options.snapshotName ?? `.snapshot-${dbName}`;
        this.snapshotPath = core_1.Utils.normalizePath(absoluteSnapshotPath, `${snapshotName}.json`);
        this.createUmzug();
    }
    static register(orm) {
        orm.config.registerExtension('@mikro-orm/migrator', () => new Migrator(orm.em));
    }
    /**
     * @inheritDoc
     */
    async createMigration(path, blank = false, initial = false, name) {
        if (initial) {
            return this.createInitialMigration(path, name, blank);
        }
        await this.ensureMigrationsDirExists();
        const diff = await this.getSchemaDiff(blank, initial);
        if (diff.up.length === 0) {
            return { fileName: '', code: '', diff };
        }
        const migration = await this.generator.generate(diff, path, name);
        await this.storeCurrentSchema();
        return {
            fileName: migration[1],
            code: migration[0],
            diff,
        };
    }
    async checkMigrationNeeded() {
        await this.ensureMigrationsDirExists();
        const diff = await this.getSchemaDiff(false, false);
        return diff.up.length > 0;
    }
    /**
     * @inheritDoc
     */
    async createInitialMigration(path, name, blank = false) {
        await this.ensureMigrationsDirExists();
        const schemaExists = await this.validateInitialMigration(blank);
        const diff = await this.getSchemaDiff(blank, true);
        const migration = await this.generator.generate(diff, path, name);
        await this.storeCurrentSchema();
        if (schemaExists && !blank) {
            await this.storage.logMigration({ name: migration[1], context: null });
        }
        return {
            fileName: migration[1],
            code: migration[0],
            diff,
        };
    }
    /**
     * @inheritDoc
     */
    on(eventName, listener) {
        this.umzug.on(eventName, listener);
        return this;
    }
    /**
     * @inheritDoc
     */
    off(eventName, listener) {
        this.umzug.off(eventName, listener);
        return this;
    }
    createUmzug() {
        this.runner = new MigrationRunner_1.MigrationRunner(this.driver, this.options, this.config);
        this.storage = new MigrationStorage_1.MigrationStorage(this.driver, this.options);
        let migrations = {
            glob: (0, node_path_1.join)(this.absolutePath, this.options.glob).replace(/\\/g, '/'),
            resolve: (params) => this.resolve(params),
        };
        if (this.options.migrationsList) {
            migrations = this.options.migrationsList.map(migration => {
                if (typeof migration === 'function') {
                    return this.initialize(migration, migration.name);
                }
                return this.initialize(migration.class, migration.name);
            });
        }
        this.umzug = new umzug_1.Umzug({
            storage: this.storage,
            logger: undefined,
            migrations,
        });
        if (!this.options.silent) {
            const logger = this.config.getLogger();
            this.umzug.on('migrating', event => logger.log('migrator', `Processing '${event.name}'`, { enabled: true }));
            this.umzug.on('migrated', event => logger.log('migrator', `Applied '${event.name}'`, { enabled: true }));
            this.umzug.on('reverting', event => logger.log('migrator', `Processing '${event.name}'`, { enabled: true }));
            this.umzug.on('reverted', event => logger.log('migrator', `Reverted '${event.name}'`, { enabled: true }));
        }
        if (this.options.generator) {
            this.generator = new this.options.generator(this.driver, this.config.getNamingStrategy(), this.options);
        }
        else if (this.options.emit === 'js' || this.options.emit === 'cjs') {
            this.generator = new JSMigrationGenerator_1.JSMigrationGenerator(this.driver, this.config.getNamingStrategy(), this.options);
        }
        else {
            this.generator = new TSMigrationGenerator_1.TSMigrationGenerator(this.driver, this.config.getNamingStrategy(), this.options);
        }
    }
    /**
     * Initial migration can be created only if:
     * 1. no previous migrations were generated or executed
     * 2. existing schema do not contain any of the tables defined by metadata
     *
     * If existing schema contains all of the tables already, we return true, based on that we mark the migration as already executed.
     * If only some of the tables are present, exception is thrown.
     */
    async validateInitialMigration(blank) {
        const executed = await this.getExecutedMigrations();
        const pending = await this.getPendingMigrations();
        if (executed.length > 0 || pending.length > 0) {
            throw new Error('Initial migration cannot be created, as some migrations already exist');
        }
        const schema = await knex_1.DatabaseSchema.create(this.em.getConnection(), this.em.getPlatform(), this.config);
        const exists = new Set();
        const expected = new Set();
        Object.values(this.em.getMetadata().getAll())
            .filter(meta => meta.tableName && !meta.embeddable && !meta.virtual)
            .forEach(meta => {
            const schema = meta.schema ?? this.config.get('schema', this.em.getPlatform().getDefaultSchemaName());
            expected.add(schema ? `${schema}.${meta.collection}` : meta.collection);
        });
        schema.getTables().forEach(table => {
            const schema = table.schema ?? this.em.getPlatform().getDefaultSchemaName();
            const tableName = schema ? `${schema}.${table.name}` : table.name;
            if (expected.has(tableName)) {
                exists.add(table.schema ? `${table.schema}.${table.name}` : table.name);
            }
        });
        if (expected.size === 0 && !blank) {
            throw new Error('No entities found');
        }
        if (exists.size > 0 && expected.size !== exists.size) {
            throw new Error(`Some tables already exist in your schema, remove them first to create the initial migration: ${[...exists].join(', ')}`);
        }
        return expected.size === exists.size;
    }
    /**
     * @inheritDoc
     */
    async getExecutedMigrations() {
        await this.ensureDatabase();
        return this.storage.getExecutedMigrations();
    }
    async ensureDatabase() {
        await this.ensureMigrationsDirExists();
        const created = await this.schemaGenerator.ensureDatabase();
        /* istanbul ignore next */
        if (created) {
            this.createUmzug();
        }
        await this.storage.ensureTable();
    }
    /**
     * @inheritDoc
     */
    async getPendingMigrations() {
        await this.ensureDatabase();
        return this.umzug.pending();
    }
    /**
     * @inheritDoc
     */
    async up(options) {
        return this.runMigrations('up', options);
    }
    /**
     * @inheritDoc
     */
    async down(options) {
        return this.runMigrations('down', options);
    }
    getStorage() {
        return this.storage;
    }
    resolve(params) {
        const createMigrationHandler = async (method) => {
            const migration = await core_1.Utils.dynamicImport(params.path);
            const MigrationClass = Object.values(migration)[0];
            const instance = new MigrationClass(this.driver, this.config);
            await this.runner.run(instance, method);
        };
        return {
            name: this.storage.getMigrationName(params.name),
            up: () => createMigrationHandler('up'),
            down: () => createMigrationHandler('down'),
        };
    }
    getSchemaFromSnapshot() {
        if (!this.options.snapshot || !(0, fs_extra_1.pathExistsSync)(this.snapshotPath)) {
            return undefined;
        }
        const data = (0, fs_extra_1.readJSONSync)(this.snapshotPath);
        const schema = new knex_1.DatabaseSchema(this.driver.getPlatform(), this.config.get('schema'));
        const { tables, namespaces, ...rest } = data;
        const tableInstances = tables.map((tbl) => {
            const table = new knex_1.DatabaseTable(this.driver.getPlatform(), tbl.name);
            const { columns, ...restTable } = tbl;
            Object.assign(table, restTable);
            Object.keys(columns).forEach(col => {
                const column = { ...columns[col] };
                /* istanbul ignore next */
                column.mappedType = core_1.Type.getType(core_1.t[columns[col].mappedType] ?? core_1.UnknownType);
                table.addColumn(column);
            });
            return table;
        });
        Object.assign(schema, { tables: tableInstances, namespaces: new Set(namespaces), ...rest });
        return schema;
    }
    async storeCurrentSchema() {
        if (!this.options.snapshot) {
            return;
        }
        const schema = this.schemaGenerator.getTargetSchema();
        await (0, fs_extra_1.writeJSON)(this.snapshotPath, schema, { spaces: 2 });
    }
    initialize(MigrationClass, name) {
        const instance = new MigrationClass(this.driver, this.config);
        return {
            name: this.storage.getMigrationName(name),
            up: () => this.runner.run(instance, 'up'),
            down: () => this.runner.run(instance, 'down'),
        };
    }
    async getSchemaDiff(blank, initial) {
        const up = [];
        const down = [];
        if (blank) {
            up.push('select 1');
            down.push('select 1');
        }
        else if (initial) {
            const dump = await this.schemaGenerator.getCreateSchemaSQL({ wrap: false });
            up.push(...dump.split('\n'));
        }
        else {
            const diff = await this.schemaGenerator.getUpdateSchemaMigrationSQL({
                wrap: false,
                safe: this.options.safe,
                dropTables: this.options.dropTables,
                fromSchema: this.getSchemaFromSnapshot(),
            });
            up.push(...diff.up.split('\n'));
            down.push(...diff.down.split('\n'));
        }
        const cleanUp = (diff) => {
            for (let i = diff.length - 1; i >= 0; i--) {
                if (diff[i]) {
                    break;
                }
                diff.splice(i, 1);
            }
        };
        cleanUp(up);
        cleanUp(down);
        return { up, down };
    }
    getMigrationFilename(name) {
        name = name.replace(/\.[jt]s$/, '');
        return name.match(/^\d{14}$/) ? this.options.fileName(name) : name;
    }
    prefix(options) {
        if (core_1.Utils.isString(options) || Array.isArray(options)) {
            return { migrations: core_1.Utils.asArray(options).map(name => this.getMigrationFilename(name)) };
        }
        if (!options) {
            return {};
        }
        if (options.migrations) {
            options.migrations = options.migrations.map(name => this.getMigrationFilename(name));
        }
        if (options.transaction) {
            delete options.transaction;
        }
        ['from', 'to'].filter(k => options[k]).forEach(k => options[k] = this.getMigrationFilename(options[k]));
        return options;
    }
    async runMigrations(method, options) {
        await this.ensureDatabase();
        if (!this.options.transactional || !this.options.allOrNothing) {
            return this.umzug[method](this.prefix(options));
        }
        if (core_1.Utils.isObject(options) && options.transaction) {
            return this.runInTransaction(options.transaction, method, options);
        }
        return this.driver.getConnection().transactional(trx => this.runInTransaction(trx, method, options));
    }
    async runInTransaction(trx, method, options) {
        this.runner.setMasterMigration(trx);
        this.storage.setMasterMigration(trx);
        const ret = await this.umzug[method](this.prefix(options));
        this.runner.unsetMasterMigration();
        this.storage.unsetMasterMigration();
        return ret;
    }
    async ensureMigrationsDirExists() {
        if (!this.options.migrationsList) {
            await (0, fs_extra_1.ensureDir)(this.absolutePath);
        }
    }
}
exports.Migrator = Migrator;
