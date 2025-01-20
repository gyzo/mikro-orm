"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TSMigrationGenerator = void 0;
const MigrationGenerator_1 = require("./MigrationGenerator");
class TSMigrationGenerator extends MigrationGenerator_1.MigrationGenerator {
    /**
     * @inheritDoc
     */
    generateMigrationFile(className, diff) {
        let ret = `import { Migration } from '@mikro-orm/migrations-mongodb';\n\n`;
        ret += `export class ${className} extends Migration {\n\n`;
        ret += `  async up(): Promise<void> {\n`;
        /* istanbul ignore next */
        diff.up.forEach(sql => ret += this.createStatement(sql, 4));
        ret += `  }\n\n`;
        /* istanbul ignore next */
        if (diff.down.length > 0) {
            ret += `  async down(): Promise<void> {\n`;
            diff.down.forEach(sql => ret += this.createStatement(sql, 4));
            ret += `  }\n\n`;
        }
        ret += `}\n`;
        return ret;
    }
}
exports.TSMigrationGenerator = TSMigrationGenerator;
