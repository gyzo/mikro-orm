"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetterSqliteMikroORM = void 0;
exports.defineBetterSqliteConfig = defineBetterSqliteConfig;
const core_1 = require("@mikro-orm/core");
const BetterSqliteDriver_1 = require("./BetterSqliteDriver");
/**
 * @inheritDoc
 */
class BetterSqliteMikroORM extends core_1.MikroORM {
    static DRIVER = BetterSqliteDriver_1.BetterSqliteDriver;
    /**
     * @inheritDoc
     */
    static async init(options) {
        return super.init(options);
    }
    /**
     * @inheritDoc
     */
    static initSync(options) {
        return super.initSync(options);
    }
}
exports.BetterSqliteMikroORM = BetterSqliteMikroORM;
/* istanbul ignore next */
function defineBetterSqliteConfig(options) {
    return (0, core_1.defineConfig)({ driver: BetterSqliteDriver_1.BetterSqliteDriver, ...options });
}
