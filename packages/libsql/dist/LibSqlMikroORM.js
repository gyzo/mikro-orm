"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibSqlMikroORM = void 0;
exports.defineLibSqlConfig = defineLibSqlConfig;
const core_1 = require("@mikro-orm/core");
const LibSqlDriver_1 = require("./LibSqlDriver");
/**
 * @inheritDoc
 */
class LibSqlMikroORM extends core_1.MikroORM {
    static DRIVER = LibSqlDriver_1.LibSqlDriver;
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
exports.LibSqlMikroORM = LibSqlMikroORM;
/* istanbul ignore next */
function defineLibSqlConfig(options) {
    return (0, core_1.defineConfig)({ driver: LibSqlDriver_1.LibSqlDriver, ...options });
}
