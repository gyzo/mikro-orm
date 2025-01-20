"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoMikroORM = void 0;
exports.defineMongoConfig = defineMongoConfig;
const core_1 = require("@mikro-orm/core");
const MongoDriver_1 = require("./MongoDriver");
/**
 * @inheritDoc
 */
class MongoMikroORM extends core_1.MikroORM {
    static DRIVER = MongoDriver_1.MongoDriver;
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
exports.MongoMikroORM = MongoMikroORM;
/* istanbul ignore next */
function defineMongoConfig(options) {
    return (0, core_1.defineConfig)({ driver: MongoDriver_1.MongoDriver, ...options });
}
