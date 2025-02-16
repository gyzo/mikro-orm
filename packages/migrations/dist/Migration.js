"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration = void 0;
class Migration {
    driver;
    config;
    queries = [];
    ctx;
    em;
    constructor(driver, config) {
        this.driver = driver;
        this.config = config;
    }
    down() {
        throw new Error('This migration cannot be reverted');
    }
    isTransactional() {
        return true;
    }
    addSql(sql) {
        this.queries.push(sql);
    }
    reset() {
        this.queries.length = 0;
        this.ctx = undefined;
    }
    setTransactionContext(ctx) {
        this.ctx = ctx;
    }
    /**
     * Executes a raw SQL query. Accepts a string SQL or a knex query builder instance.
     * The `params` parameter is respected only if you use string SQL in the first parameter.
     */
    async execute(sql, params) {
        return this.driver.execute(sql, params, 'all', this.ctx);
    }
    getKnex() {
        return this.driver.getConnection('write').getKnex();
    }
    /**
     * Creates a cached `EntityManager` instance for this migration, which will respect
     * the current transaction context.
     */
    getEntityManager() {
        if (!this.em) {
            this.em = this.driver.createEntityManager();
            this.em.setTransactionContext(this.ctx);
        }
        return this.em;
    }
    getQueries() {
        return this.queries;
    }
}
exports.Migration = Migration;
