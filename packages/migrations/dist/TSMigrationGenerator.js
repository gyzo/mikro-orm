"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TSMigrationGenerator = void 0;
const MigrationGenerator_1 = require("./MigrationGenerator");
class TSMigrationGenerator extends MigrationGenerator_1.MigrationGenerator {
    /**
     * @inheritDoc
     */
    generateMigrationFile(className, diff) {
        let ret = `import { Migration } from '@mikro-orm/migrations';\n\n`;
        ret += `export class ${className} extends Migration {\n\n`;
        ret += `  override async up(): Promise<void> {\n`;
        diff.up.forEach(sql => ret += this.createStatement(sql, 4));
        ret += `  }\n\n`;
        if (diff.down.length > 0) {
            ret += `  override async down(): Promise<void> {\n`;
            diff.down.forEach(sql => ret += this.createStatement(sql, 4));
            ret += `  }\n\n`;
        }
        ret += `}\n`;
        return ret;
    }
}
exports.TSMigrationGenerator = TSMigrationGenerator;
