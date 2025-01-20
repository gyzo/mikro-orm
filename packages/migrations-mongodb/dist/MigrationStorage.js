"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationStorage = void 0;
const path = __importStar(require("node:path"));
class MigrationStorage {
    driver;
    options;
    masterTransaction;
    constructor(driver, options) {
        this.driver = driver;
        this.options = options;
    }
    async executed() {
        const migrations = await this.getExecutedMigrations();
        return migrations.map(({ name }) => `${this.getMigrationName(name)}`);
    }
    async logMigration(params) {
        const tableName = this.options.tableName;
        const name = this.getMigrationName(params.name);
        await this.driver.nativeInsert(tableName, { name, executed_at: new Date() }, { ctx: this.masterTransaction });
    }
    async unlogMigration(params) {
        const tableName = this.options.tableName;
        const withoutExt = this.getMigrationName(params.name);
        await this.driver.nativeDelete(tableName, { name: { $in: [params.name, withoutExt] } }, { ctx: this.masterTransaction });
    }
    async getExecutedMigrations() {
        const tableName = this.options.tableName;
        return this.driver.find(tableName, {}, { ctx: this.masterTransaction, orderBy: { _id: 'asc' } });
    }
    setMasterMigration(trx) {
        this.masterTransaction = trx;
    }
    unsetMasterMigration() {
        delete this.masterTransaction;
    }
    /**
     * @internal
     */
    getMigrationName(name) {
        const parsedName = path.parse(name);
        if (['.js', '.ts'].includes(parsedName.ext)) {
            // strip extension
            return parsedName.name;
        }
        return name;
    }
}
exports.MigrationStorage = MigrationStorage;
