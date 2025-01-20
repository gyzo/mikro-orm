"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migrator = void 0;
const umzug_1 = require("umzug");
const node_path_1 = require("node:path");
const fs_extra_1 = require("fs-extra");
const core_1 = require("@mikro-orm/core");
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
    config;
    options;
    absolutePath;
    constructor(em) {
        this.em = em;
        this.driver = this.em.getDriver();
        this.config = this.em.config;
        this.options = this.config.get('migrations');
        /* istanbul ignore next */
        const key = (this.config.get('preferTs', core_1.Utils.detectTsNode()) && this.options.pathTs) ? 'pathTs' : 'path';
        this.absolutePath = core_1.Utils.absolutePath(this.options[key], this.config.get('baseDir'));
        this.createUmzug();
    }
    static register(orm) {
        orm.config.registerExtension('@mikro-orm/migrator', () => new Migrator(orm.em));
    }
    /**
     * @inheritDoc
     */
    async createMigration(path, blank = false, initial = false, name) {
        await this.ensureMigrationsDirExists();
        const diff = { up: [], down: [] };
        const migration = await this.generator.generate(diff, path, name);
        return {
            fileName: migration[1],
            code: migration[0],
            diff,
        };
    }
    /**
     * @inheritDoc
     */
    async checkMigrationNeeded() {
        return true;
    }
    /**
     * @inheritDoc
     */
    async createInitialMigration(path) {
        return this.createMigration(path);
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
        this.runner = new MigrationRunner_1.MigrationRunner(this.driver, this.options);
        this.storage = new MigrationStorage_1.MigrationStorage(this.driver, this.options);
        let migrations = {
            glob: (0, node_path_1.join)(this.absolutePath, this.options.glob).replace(/\\/g, '/'),
            resolve: (params) => this.resolve(params),
        };
        /* istanbul ignore next */
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
        /* istanbul ignore next */
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
     * @inheritDoc
     */
    async getExecutedMigrations() {
        await this.ensureMigrationsDirExists();
        return this.storage.getExecutedMigrations();
    }
    /**
     * @inheritDoc
     */
    async getPendingMigrations() {
        await this.ensureMigrationsDirExists();
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
    /* istanbul ignore next */
    initialize(MigrationClass, name) {
        const instance = new MigrationClass(this.driver, this.config);
        return {
            name: this.storage.getMigrationName(name),
            up: () => this.runner.run(instance, 'up'),
            down: () => this.runner.run(instance, 'down'),
        };
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
        await this.ensureMigrationsDirExists();
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
