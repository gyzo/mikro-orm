"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration = void 0;
class Migration {
    driver;
    config;
    ctx;
    constructor(driver, config) {
        this.driver = driver;
        this.config = config;
    }
    async down() {
        throw new Error('This migration cannot be reverted');
    }
    isTransactional() {
        return true;
    }
    reset() {
        this.ctx = undefined;
    }
    setTransactionContext(ctx) {
        this.ctx = ctx;
    }
    getCollection(entityName) {
        return this.driver.getConnection().getCollection(entityName);
    }
}
exports.Migration = Migration;
